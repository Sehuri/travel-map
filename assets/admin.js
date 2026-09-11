(function () {
  "use strict";

  const config = window.SUPABASE_CONFIG || {};
  const baseVisits = window.TRAVEL_DATA?.visits || [];
  const baseWishlist = window.TRAVEL_DATA?.wishlist || [];
  const basePhotos = window.PHOTO_MANIFEST || {};
  const baseVisitMap = new Map(baseVisits.map((visit) => [visit.name, visit]));
  const baseWishMap = new Map(baseWishlist.map((wish, index) => [wish.name, { ...wish, sortOrder: index }]));
  const elements = Object.fromEntries([
    "login-panel", "login-form", "login-email", "login-status", "admin-app", "session-label", "sign-out",
    "city-picker", "city-form", "city-name", "city-country", "city-region", "city-date", "city-longitude",
    "city-latitude", "city-description", "city-cover", "city-hidden", "city-status", "new-city",
    "visit-record-editor", "visit-record-list", "visit-record-date", "add-visit-record", "visit-record-status",
    "remove-city-override", "photo-city", "photo-files", "upload-photos", "import-photos", "photo-admin-status",
    "admin-photo-grid", "wish-picker", "wish-form", "wish-name", "wish-icon", "wish-order", "wish-description",
    "wish-guide", "wish-planned-time", "wish-hidden", "wish-status", "new-wish", "remove-wish-override", "rating-city-filter",
    "guide-upload-form", "guide-place-type", "guide-place-name", "guide-title", "guide-file", "upload-guide",
    "guide-admin-status", "guide-admin-list", "rating-admin-status", "ratings-table"
  ].map((id) => [id.replaceAll("-", "_"), document.getElementById(id)]));

  let client = null;
  let user = null;
  let cityRows = new Map();
  let visitRows = [];
  let visitRecordsAvailable = true;
  let wishRows = new Map();
  let ratingRows = [];
  let guideRows = [];
  let currentCityName = "";
  let currentWishName = "";
  let creatingCity = false;
  let creatingWish = false;

  function configured() {
    return Boolean(window.supabase?.createClient && config.url && config.publishableKey);
  }

  function status(element, message, isError = false) {
    element.textContent = message;
    element.classList.toggle("error", isError);
  }

  function setBusy(container, busy) {
    container.querySelectorAll("button, input, textarea, select").forEach((control) => {
      control.disabled = busy;
    });
  }

  function effectiveCity(name) {
    const base = baseVisitMap.get(name);
    const row = cityRows.get(name);
    if (!row && !base) return null;
    return {
      name,
      country: row?.country ?? base?.country ?? "",
      region: row?.region ?? base?.region ?? "",
      date: row?.visit_date ?? base?.date ?? "",
      longitude: row?.longitude ?? base?.coord?.[0] ?? "",
      latitude: row?.latitude ?? base?.coord?.[1] ?? "",
      description: row?.description ?? base?.desc ?? "",
      coverUrl: row?.cover_url ?? base?.coverUrl ?? "",
      hidden: Boolean(row?.is_hidden)
    };
  }

  function effectiveWish(name) {
    const base = baseWishMap.get(name);
    const row = wishRows.get(name);
    if (!row && !base) return null;
    return {
      name,
      icon: row?.icon ?? base?.icon ?? "○",
      description: row?.description ?? base?.desc ?? "",
      guide: row?.guide ?? base?.guide ?? "",
      plannedTime: row?.planned_time ?? base?.plannedTime ?? "",
      sortOrder: Number(row?.sort_order ?? base?.sortOrder ?? 0),
      hidden: Boolean(row?.is_hidden)
    };
  }

  function cityNames() {
    return [...new Set([...baseVisitMap.keys(), ...cityRows.keys()])]
      .sort((a, b) => {
        const first = effectiveCity(a)?.date || "";
        const second = effectiveCity(b)?.date || "";
        return second.localeCompare(first) || a.localeCompare(b, "zh-CN");
      });
  }

  function refillSelect(select, names, selected, labeler = (name) => name) {
    select.replaceChildren();
    names.forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = labeler(name);
      option.selected = name === selected;
      select.append(option);
    });
  }

  function populateCityPickers() {
    const names = cityNames();
    if (!currentCityName || !names.includes(currentCityName)) currentCityName = names[0] || "";
    refillSelect(elements.city_picker, names, currentCityName, (name) => {
      const city = effectiveCity(name);
      return `${city.hidden ? "[已隐藏] " : ""}${name} · ${city.date?.slice(0, 4) || "未定"}`;
    });
    const photoSelected = elements.photo_city.value || currentCityName;
    refillSelect(elements.photo_city, names.filter((name) => !effectiveCity(name)?.hidden), photoSelected);
    const ratingValue = elements.rating_city_filter.value;
    elements.rating_city_filter.replaceChildren(new Option("全部城市", "all"));
    names.forEach((name) => elements.rating_city_filter.append(new Option(name, name)));
    if (["all", ...names].includes(ratingValue)) elements.rating_city_filter.value = ratingValue;
    populateGuidePlaces();
  }

  function renderCityForm(name) {
    const city = effectiveCity(name);
    if (!city) return;
    currentCityName = name;
    creatingCity = false;
    elements.city_name.value = city.name;
    elements.city_name.readOnly = true;
    elements.city_country.value = city.country;
    elements.city_region.value = city.region;
    elements.city_date.value = city.date;
    elements.city_longitude.value = city.longitude;
    elements.city_latitude.value = city.latitude;
    elements.city_description.value = city.description;
    elements.city_cover.value = city.coverUrl;
    elements.city_hidden.checked = city.hidden;
    elements.remove_city_override.hidden = !cityRows.has(name) && Boolean(baseVisitMap.has(name));
    elements.remove_city_override.textContent = baseVisitMap.has(name) ? "恢复代码版本" : "永久删除新增城市";
    status(elements.city_status, cityRows.has(name) ? "当前显示后台保存的版本。" : "当前使用代码中的备用版本。");
    renderVisitRecords(name);
  }

  function startNewCity() {
    creatingCity = true;
    currentCityName = "";
    elements.city_form.reset();
    elements.city_name.readOnly = false;
    elements.city_hidden.checked = false;
    elements.remove_city_override.hidden = true;
    status(elements.city_status, "填写后保存，新城市会直接出现在公开网站。" );
    renderVisitRecords("");
    elements.city_name.focus();
  }

  function visitDatesFor(name) {
    const city = effectiveCity(name);
    if (!city) return [];
    const seen = new Set();
    return [
      { id: "", city_name: name, visit_date: city.date, primary: true },
      ...visitRows.filter((row) => row.city_name === name).map((row) => ({ ...row, primary: false }))
    ].filter((row) => row.visit_date && !seen.has(row.visit_date) && seen.add(row.visit_date))
      .sort((a, b) => b.visit_date.localeCompare(a.visit_date));
  }

  function renderVisitRecords(name) {
    elements.visit_record_list.replaceChildren();
    elements.visit_record_date.value = "";
    const canEdit = Boolean(name && !creatingCity && visitRecordsAvailable);
    elements.visit_record_date.disabled = !canEdit;
    elements.add_visit_record.disabled = !canEdit;
    if (!visitRecordsAvailable) {
      status(elements.visit_record_status, "请先运行 supabase/city_visits.sql，启用多次到访记录。", true);
      return;
    }
    if (!canEdit) {
      status(elements.visit_record_status, "请先保存城市资料，再添加其他到访日期。");
      return;
    }
    const dates = visitDatesFor(name);
    dates.forEach((row) => {
      const item = document.createElement("div");
      item.className = "visit-record-item";
      const copy = document.createElement("div");
      const time = document.createElement("time");
      time.dateTime = row.visit_date;
      time.textContent = new Intl.DateTimeFormat("zh-CN", { dateStyle: "long" })
        .format(new Date(`${row.visit_date}T00:00:00`));
      const label = document.createElement("span");
      label.textContent = row.primary ? "首次到访" : "再次到访";
      copy.append(time, label);
      item.append(copy);
      if (!row.primary) {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "删除";
        remove.addEventListener("click", () => deleteVisitRecord(row));
        item.append(remove);
      }
      elements.visit_record_list.append(item);
    });
    status(elements.visit_record_status, dates.length > 1
      ? `共记录 ${dates.length} 次到访，公开时间线会分别展示。`
      : "目前记录 1 次到访，可以继续添加日期。");
  }

  async function addVisitRecord() {
    const name = currentCityName;
    const visitDate = elements.visit_record_date.value;
    if (!name || !visitDate) {
      status(elements.visit_record_status, "请先选择到访日期。", true);
      return;
    }
    if (visitDatesFor(name).some((row) => row.visit_date === visitDate)) {
      status(elements.visit_record_status, "这个日期已经记录过了。", true);
      return;
    }
    elements.add_visit_record.disabled = true;
    status(elements.visit_record_status, "正在添加到访记录…");
    const { data, error } = await client.from("travel_city_visits").insert({
      city_name: name,
      visit_date: visitDate,
      created_by: user.id
    }).select().single();
    elements.add_visit_record.disabled = false;
    if (error) {
      status(elements.visit_record_status, `添加失败：${error.message}`, true);
      return;
    }
    visitRows.push(data);
    renderVisitRecords(name);
  }

  async function deleteVisitRecord(row) {
    if (!window.confirm(`确定删除 ${row.visit_date} 的到访记录吗？城市资料不会被删除。`)) return;
    const { error } = await client.from("travel_city_visits").delete().eq("id", row.id);
    if (error) {
      status(elements.visit_record_status, `删除失败：${error.message}`, true);
      return;
    }
    visitRows = visitRows.filter((item) => item.id !== row.id);
    renderVisitRecords(currentCityName);
  }

  function cityPayload(name) {
    return {
      name,
      country: elements.city_country.value.trim(),
      region: elements.city_region.value.trim() || null,
      visit_date: elements.city_date.value,
      longitude: Number(elements.city_longitude.value),
      latitude: Number(elements.city_latitude.value),
      description: elements.city_description.value.trim(),
      cover_url: elements.city_cover.value.trim() || null,
      is_hidden: elements.city_hidden.checked,
      updated_by: user.id,
      updated_at: new Date().toISOString()
    };
  }

  async function saveCity(event) {
    event.preventDefault();
    const name = elements.city_name.value.trim();
    if (!name) return;
    if (creatingCity && (baseVisitMap.has(name) || cityRows.has(name))) {
      status(elements.city_status, "这个城市已经存在，请从左侧选择后编辑。", true);
      return;
    }
    setBusy(elements.city_form, true);
    status(elements.city_status, "正在保存…");
    const { data, error } = await client.from("travel_cities")
      .upsert(cityPayload(name), { onConflict: "name" }).select().single();
    setBusy(elements.city_form, false);
    if (error) {
      status(elements.city_status, `保存失败：${error.message}`, true);
      return;
    }
    cityRows.set(name, data);
    currentCityName = name;
    populateCityPickers();
    renderCityForm(name);
    await loadPhotos(elements.photo_city.value);
    status(elements.city_status, "城市资料已保存，公开网站刷新后即可看到。" );
  }

  async function removeCityOverride() {
    const name = currentCityName;
    if (!name || !cityRows.has(name)) return;
    const wording = baseVisitMap.has(name) ? "恢复为代码中的备用版本" : "永久删除这座新增城市";
    if (!window.confirm(`确定要${wording}吗？`)) return;
    const { error } = await client.from("travel_cities").delete().eq("name", name);
    if (error) {
      status(elements.city_status, `操作失败：${error.message}`, true);
      return;
    }
    cityRows.delete(name);
    if (!baseVisitMap.has(name) && visitRecordsAvailable) {
      await client.from("travel_city_visits").delete().eq("city_name", name);
      visitRows = visitRows.filter((row) => row.city_name !== name);
    }
    populateCityPickers();
    if (baseVisitMap.has(name)) renderCityForm(name);
    else if (cityNames().length) renderCityForm(cityNames()[0]);
  }

  async function ensureCityOverlay(name, changes = {}) {
    const city = effectiveCity(name);
    if (!city) throw new Error("找不到城市资料");
    const payload = {
      name,
      country: city.country,
      region: city.region || null,
      visit_date: city.date,
      longitude: Number(city.longitude),
      latitude: Number(city.latitude),
      description: city.description,
      cover_url: city.coverUrl || null,
      is_hidden: city.hidden,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
      ...changes
    };
    const { data, error } = await client.from("travel_cities")
      .upsert(payload, { onConflict: "name" }).select().single();
    if (error) throw error;
    cityRows.set(name, data);
    return data;
  }

  async function fetchPhotoRows(cityName) {
    const { data, error } = await client.from("city_photos")
      .select("id,city_name,image_url,storage_path,caption,sort_order,is_hidden,created_at")
      .eq("city_name", cityName)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data || [];
  }

  function photoCard(photo, index, rows) {
    const card = document.createElement("article");
    card.className = "photo-admin-card";
    const image = document.createElement("img");
    image.src = photo.image_url;
    image.alt = `${photo.city_name}照片`;
    image.loading = "lazy";
    const copy = document.createElement("div");
    copy.className = "photo-card-copy";
    const source = document.createElement("p");
    source.textContent = photo.storage_path ? "后台上传" : "项目现有照片";
    const actions = document.createElement("div");
    actions.className = "photo-card-actions";
    const action = (label, handler, disabled = false) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.disabled = disabled;
      button.addEventListener("click", handler);
      actions.append(button);
    };
    action("←", () => movePhoto(rows, index, -1), index === 0);
    action("→", () => movePhoto(rows, index, 1), index === rows.length - 1);
    action("设为封面", () => setCover(photo.city_name, photo.image_url));
    action("删除", () => hidePhoto(photo));
    copy.append(source, actions);
    card.append(image, copy);
    return card;
  }

  async function loadPhotos(cityName) {
    elements.admin_photo_grid.replaceChildren();
    if (!cityName) return;
    status(elements.photo_admin_status, "正在载入照片…");
    try {
      const allRows = await fetchPhotoRows(cityName);
      const rows = allRows.filter((photo) => !photo.is_hidden);
      const hasManagedSet = allRows.length > 0;
      elements.import_photos.hidden = hasManagedSet || !(basePhotos[cityName]?.length);
      if (!hasManagedSet) {
        const local = basePhotos[cityName] || [];
        status(elements.photo_admin_status, local.length ? `${local.length} 张项目现有照片，导入后即可排序。` : "还没有照片，可以直接上传。" );
        local.forEach((url) => {
          const mock = { city_name: cityName, image_url: url };
          const card = document.createElement("article");
          card.className = "photo-admin-card";
          const image = document.createElement("img");
          image.src = url;
          image.alt = `${cityName}现有照片`;
          const copy = document.createElement("div");
          copy.className = "photo-card-copy";
          const label = document.createElement("p");
          label.textContent = "项目现有照片 · 请先导入顺序";
          copy.append(label);
          card.append(image, copy);
          elements.admin_photo_grid.append(card);
          void mock;
        });
        if (!local.length) elements.admin_photo_grid.append(emptyCopy("这座城市还没有照片。"));
        return;
      }
      status(elements.photo_admin_status, `${rows.length} 张正在公开展示的照片。` );
      rows.forEach((photo, index) => elements.admin_photo_grid.append(photoCard(photo, index, rows)));
      if (!rows.length) elements.admin_photo_grid.append(emptyCopy("照片集目前为空，可以上传新照片。"));
    } catch (error) {
      status(elements.photo_admin_status, `照片载入失败：${error.message}`, true);
    }
  }

  function emptyCopy(message) {
    const node = document.createElement("p");
    node.className = "empty-copy";
    node.textContent = message;
    return node;
  }

  async function importLocalPhotos(cityName, quiet = false) {
    const urls = basePhotos[cityName] || [];
    if (!urls.length) return;
    const existing = await fetchPhotoRows(cityName);
    if (existing.length) return;
    const rows = urls.map((imageUrl, index) => ({
      city_name: cityName,
      image_url: imageUrl,
      sort_order: index,
      created_by: user.id
    }));
    const { error } = await client.from("city_photos").insert(rows);
    if (error) throw error;
    if (!quiet) status(elements.photo_admin_status, "现有照片已导入，现在可以排序和设置封面。" );
  }

  async function uploadPhotos() {
    const cityName = elements.photo_city.value;
    const files = [...elements.photo_files.files];
    if (!cityName || !files.length) {
      status(elements.photo_admin_status, "请先选择城市和照片文件。", true);
      return;
    }
    elements.upload_photos.disabled = true;
    try {
      await importLocalPhotos(cityName, true);
      const existing = (await fetchPhotoRows(cityName)).filter((photo) => !photo.is_hidden);
      let sortOrder = existing.length;
      for (const file of files) {
        if (file.size > 15 * 1024 * 1024) throw new Error(`${file.name} 超过 15 MB`);
        const extension = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
        const path = `${cityName}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
        status(elements.photo_admin_status, `正在上传 ${file.name}…`);
        const upload = await client.storage.from("city-photos").upload(path, file, { upsert: false, contentType: file.type });
        if (upload.error) throw upload.error;
        const publicUrl = client.storage.from("city-photos").getPublicUrl(path).data.publicUrl;
        const insert = await client.from("city_photos").insert({
          city_name: cityName,
          image_url: publicUrl,
          storage_path: path,
          sort_order: sortOrder++,
          created_by: user.id
        });
        if (insert.error) throw insert.error;
      }
      elements.photo_files.value = "";
      status(elements.photo_admin_status, `${files.length} 张照片上传完成。` );
      await loadPhotos(cityName);
    } catch (error) {
      status(elements.photo_admin_status, `上传失败：${error.message}`, true);
    } finally {
      elements.upload_photos.disabled = false;
    }
  }

  async function movePhoto(rows, index, direction) {
    const otherIndex = index + direction;
    if (!rows[otherIndex]) return;
    const first = rows[index];
    const second = rows[otherIndex];
    const firstOrder = first.sort_order;
    const secondOrder = second.sort_order;
    const [a, b] = await Promise.all([
      client.from("city_photos").update({ sort_order: secondOrder }).eq("id", first.id),
      client.from("city_photos").update({ sort_order: firstOrder }).eq("id", second.id)
    ]);
    if (a.error || b.error) status(elements.photo_admin_status, "排序保存失败，请重试。", true);
    else await loadPhotos(first.city_name);
  }

  async function setCover(cityName, imageUrl) {
    try {
      await ensureCityOverlay(cityName, { cover_url: imageUrl });
      if (currentCityName === cityName) renderCityForm(cityName);
      status(elements.photo_admin_status, "城市封面已更新。" );
    } catch (error) {
      status(elements.photo_admin_status, `封面设置失败：${error.message}`, true);
    }
  }

  async function hidePhoto(photo) {
    if (!window.confirm("确定删除这张照片吗？公开网站将不再展示它。")) return;
    if (photo.storage_path) {
      const removed = await client.storage.from("city-photos").remove([photo.storage_path]);
      if (removed.error) {
        status(elements.photo_admin_status, `文件删除失败：${removed.error.message}`, true);
        return;
      }
    }
    const { error } = await client.from("city_photos").update({ is_hidden: true }).eq("id", photo.id);
    if (error) status(elements.photo_admin_status, `照片记录更新失败：${error.message}`, true);
    else await loadPhotos(photo.city_name);
  }

  function populateWishPicker() {
    const names = [...new Set([...baseWishMap.keys(), ...wishRows.keys()])]
      .sort((a, b) => effectiveWish(a).sortOrder - effectiveWish(b).sortOrder || a.localeCompare(b, "zh-CN"));
    if (!currentWishName || !names.includes(currentWishName)) currentWishName = names[0] || "";
    refillSelect(elements.wish_picker, names, currentWishName, (name) => `${effectiveWish(name).hidden ? "[已隐藏] " : ""}${name}`);
    populateGuidePlaces();
  }

  function guidePlaceNames() {
    if (elements.guide_place_type.value === "wishlist") {
      return [...new Set([...baseWishMap.keys(), ...wishRows.keys()])]
        .filter((name) => !effectiveWish(name)?.hidden)
        .sort((a, b) => a.localeCompare(b, "zh-CN"));
    }
    return cityNames().filter((name) => !effectiveCity(name)?.hidden);
  }

  function populateGuidePlaces() {
    if (!elements.guide_place_name) return;
    const previous = elements.guide_place_name.value;
    const names = guidePlaceNames();
    refillSelect(elements.guide_place_name, names, names.includes(previous) ? previous : names[0]);
    renderGuideRows();
  }

  function formatFileSize(bytes) {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function guideHref(guide) {
    if (guide.file_type !== "html") return guide.file_url;
    const viewer = new URL("./guide-viewer.html", window.location.href);
    viewer.searchParams.set("src", guide.file_url);
    viewer.searchParams.set("title", guide.title);
    return viewer.toString();
  }

  function renderGuideRows() {
    if (!elements.guide_admin_list) return;
    const placeType = elements.guide_place_type.value;
    const placeName = elements.guide_place_name.value;
    const rows = guideRows.filter((row) => row.place_type === placeType && row.place_name === placeName && !row.is_hidden);
    elements.guide_admin_list.replaceChildren();
    if (!placeName) {
      elements.guide_admin_list.append(emptyCopy("当前分类下没有可关联的目的地。"));
      return;
    }
    if (!rows.length) {
      elements.guide_admin_list.append(emptyCopy(`${placeName}还没有上传攻略。`));
      return;
    }
    rows.forEach((guide) => {
      const card = document.createElement("article");
      card.className = "guide-admin-card";
      const copy = document.createElement("div");
      const type = document.createElement("span");
      type.className = `guide-file-type ${guide.file_type}`;
      type.textContent = guide.file_type.toUpperCase();
      const title = document.createElement("strong");
      title.textContent = guide.title;
      const meta = document.createElement("p");
      meta.textContent = `${formatFileSize(Number(guide.file_size))} · ${new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(new Date(guide.created_at))}`;
      copy.append(type, title, meta);
      const actions = document.createElement("div");
      actions.className = "guide-admin-actions";
      const open = document.createElement("a");
      open.href = guideHref(guide);
      open.target = "_blank";
      open.rel = "noopener noreferrer";
      open.textContent = "查看 ↗";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "删除";
      remove.addEventListener("click", () => deleteGuide(guide));
      actions.append(open, remove);
      card.append(copy, actions);
      elements.guide_admin_list.append(card);
    });
  }

  function guideFileDetails(file) {
    const extension = (file.name.split(".").pop() || "").toLowerCase();
    if (["html", "htm"].includes(extension)) return { fileType: "html", extension, contentType: "text/html" };
    if (extension === "pdf") return { fileType: "pdf", extension, contentType: "application/pdf" };
    throw new Error("只支持 HTML、HTM 或 PDF 文件。");
  }

  async function uploadGuide(event) {
    event.preventDefault();
    const placeType = elements.guide_place_type.value;
    const placeName = elements.guide_place_name.value;
    const file = elements.guide_file.files[0];
    if (!placeName || !file) {
      status(elements.guide_admin_status, "请选择目的地和攻略文件。", true);
      return;
    }
    if (file.size < 1 || file.size > 20 * 1024 * 1024) {
      status(elements.guide_admin_status, "攻略文件必须小于 20 MB。", true);
      return;
    }
    let details;
    try {
      details = guideFileDetails(file);
    } catch (error) {
      status(elements.guide_admin_status, error.message, true);
      return;
    }
    const title = elements.guide_title.value.trim() || file.name.replace(/\.[^.]+$/, "");
    const path = `${placeType}/${crypto.randomUUID()}.${details.extension}`;
    setBusy(elements.guide_upload_form, true);
    status(elements.guide_admin_status, `正在上传 ${file.name}…`);
    try {
      const upload = await client.storage.from("travel-guides").upload(path, file, {
        upsert: false,
        contentType: details.contentType,
        cacheControl: "3600"
      });
      if (upload.error) throw upload.error;
      const fileUrl = client.storage.from("travel-guides").getPublicUrl(path).data.publicUrl;
      const insert = await client.from("travel_guides").insert({
        place_type: placeType,
        place_name: placeName,
        title,
        file_type: details.fileType,
        file_url: fileUrl,
        storage_path: path,
        file_size: file.size,
        created_by: user.id
      }).select().single();
      if (insert.error) {
        await client.storage.from("travel-guides").remove([path]);
        throw insert.error;
      }
      guideRows.unshift(insert.data);
      elements.guide_title.value = "";
      elements.guide_file.value = "";
      renderGuideRows();
      status(elements.guide_admin_status, `${title}上传完成，公开网站刷新后即可查看。`);
    } catch (error) {
      status(elements.guide_admin_status, `上传失败：${error.message}`, true);
    } finally {
      setBusy(elements.guide_upload_form, false);
    }
  }

  async function deleteGuide(guide) {
    if (!window.confirm(`确定删除攻略“${guide.title}”吗？文件删除后无法恢复。`)) return;
    status(elements.guide_admin_status, "正在删除攻略…");
    const removed = await client.storage.from("travel-guides").remove([guide.storage_path]);
    if (removed.error) {
      status(elements.guide_admin_status, `文件删除失败：${removed.error.message}`, true);
      return;
    }
    const result = await client.from("travel_guides").delete().eq("id", guide.id);
    if (result.error) {
      status(elements.guide_admin_status, `记录删除失败：${result.error.message}`, true);
      return;
    }
    guideRows = guideRows.filter((row) => row.id !== guide.id);
    renderGuideRows();
    status(elements.guide_admin_status, "攻略已删除。" );
  }

  function renderWishForm(name) {
    const wish = effectiveWish(name);
    if (!wish) return;
    currentWishName = name;
    creatingWish = false;
    elements.wish_name.value = wish.name;
    elements.wish_name.readOnly = true;
    elements.wish_icon.value = wish.icon;
    elements.wish_order.value = wish.sortOrder;
    elements.wish_description.value = wish.description;
    elements.wish_guide.value = wish.guide;
    elements.wish_planned_time.value = wish.plannedTime;
    elements.wish_hidden.checked = wish.hidden;
    elements.remove_wish_override.hidden = !wishRows.has(name) && baseWishMap.has(name);
    elements.remove_wish_override.textContent = baseWishMap.has(name) ? "恢复代码版本" : "永久删除新增目的地";
    status(elements.wish_status, wishRows.has(name) ? "当前显示后台保存的版本。" : "当前使用代码中的备用版本。" );
  }

  function startNewWish() {
    creatingWish = true;
    currentWishName = "";
    elements.wish_form.reset();
    elements.wish_name.readOnly = false;
    elements.wish_order.value = baseWishMap.size + wishRows.size;
    elements.remove_wish_override.hidden = true;
    status(elements.wish_status, "填写后保存，新目的地会出现在愿望清单。" );
    elements.wish_name.focus();
  }

  async function saveWish(event) {
    event.preventDefault();
    const name = elements.wish_name.value.trim();
    if (creatingWish && (baseWishMap.has(name) || wishRows.has(name))) {
      status(elements.wish_status, "这个目的地已经存在。", true);
      return;
    }
    setBusy(elements.wish_form, true);
    const payload = {
      name,
      icon: elements.wish_icon.value.trim(),
      description: elements.wish_description.value.trim(),
      guide: elements.wish_guide.value.trim(),
      planned_time: elements.wish_planned_time.value.trim() || null,
      sort_order: Number(elements.wish_order.value),
      is_hidden: elements.wish_hidden.checked,
      updated_by: user.id,
      updated_at: new Date().toISOString()
    };
    const { data, error } = await client.from("travel_wishlist")
      .upsert(payload, { onConflict: "name" }).select().single();
    setBusy(elements.wish_form, false);
    if (error) {
      status(elements.wish_status, `保存失败：${error.message}`, true);
      return;
    }
    wishRows.set(name, data);
    currentWishName = name;
    populateWishPicker();
    renderWishForm(name);
    status(elements.wish_status, "愿望清单已保存。" );
  }

  async function removeWishOverride() {
    const name = currentWishName;
    if (!name || !wishRows.has(name)) return;
    const wording = baseWishMap.has(name) ? "恢复代码中的备用版本" : "永久删除这个新增目的地";
    if (!window.confirm(`确定要${wording}吗？`)) return;
    const { error } = await client.from("travel_wishlist").delete().eq("name", name);
    if (error) {
      status(elements.wish_status, `操作失败：${error.message}`, true);
      return;
    }
    wishRows.delete(name);
    populateWishPicker();
    if (baseWishMap.has(name)) renderWishForm(name);
    else if (elements.wish_picker.value) renderWishForm(elements.wish_picker.value);
  }

  function renderRatings() {
    const filter = elements.rating_city_filter.value;
    const rows = filter === "all" ? ratingRows : ratingRows.filter((rating) => rating.city_name === filter);
    elements.ratings_table.replaceChildren();
    rows.forEach((rating) => {
      const tr = document.createElement("tr");
      const city = document.createElement("td");
      city.textContent = rating.city_name;
      const score = document.createElement("td");
      const scoreStrong = document.createElement("strong");
      scoreStrong.textContent = Number(rating.score).toFixed(1);
      score.append(scoreStrong);
      const userCell = document.createElement("td");
      userCell.textContent = `${rating.user_id.slice(0, 8)}…`;
      const date = document.createElement("td");
      date.textContent = new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(rating.updated_at));
      const actionCell = document.createElement("td");
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "删除";
      remove.addEventListener("click", () => deleteRating(rating));
      actionCell.append(remove);
      tr.append(city, score, userCell, date, actionCell);
      elements.ratings_table.append(tr);
    });
    status(elements.rating_admin_status, rows.length ? `显示 ${rows.length} 条评分。` : "没有符合条件的评分。" );
  }

  async function deleteRating(rating) {
    if (!window.confirm(`确定删除 ${rating.city_name} 的这条 ${Number(rating.score).toFixed(1)} 分评分吗？`)) return;
    const { error } = await client.from("city_ratings").delete()
      .eq("city_name", rating.city_name).eq("user_id", rating.user_id);
    if (error) {
      status(elements.rating_admin_status, `删除失败：${error.message}`, true);
      return;
    }
    ratingRows = ratingRows.filter((row) => !(row.city_name === rating.city_name && row.user_id === rating.user_id));
    renderRatings();
  }

  async function loadAdminData() {
    status(elements.city_status, "正在载入后台数据…");
    const [cities, visitDates, wishes, ratings, guides] = await Promise.all([
      client.from("travel_cities").select("*").order("visit_date", { ascending: false }),
      client.from("travel_city_visits").select("*").order("visit_date", { ascending: false }),
      client.from("travel_wishlist").select("*").order("sort_order", { ascending: true }),
      client.from("city_ratings").select("city_name,user_id,score,created_at,updated_at").order("updated_at", { ascending: false }),
      client.from("travel_guides").select("*").order("created_at", { ascending: false })
    ]);
    const migrationError = cities.error || wishes.error;
    if (migrationError) {
      const message = "管理后台数据库尚未完成。请先在 Supabase SQL Editor 运行 supabase/admin_backend.sql。";
      status(elements.city_status, message, true);
      status(elements.wish_status, message, true);
      status(elements.photo_admin_status, message, true);
      return;
    }
    cityRows = new Map((cities.data || []).map((row) => [row.name, row]));
    visitRows = visitDates.error ? [] : (visitDates.data || []);
    visitRecordsAvailable = !visitDates.error;
    wishRows = new Map((wishes.data || []).map((row) => [row.name, row]));
    ratingRows = ratings.error ? [] : (ratings.data || []);
    guideRows = guides.error ? [] : (guides.data || []);
    populateCityPickers();
    populateWishPicker();
    if (currentCityName) renderCityForm(currentCityName);
    if (currentWishName) renderWishForm(currentWishName);
    renderRatings();
    renderGuideRows();
    if (guides.error) {
      setBusy(elements.guide_upload_form, true);
      status(elements.guide_admin_status, "攻略数据库尚未启用。请先运行 supabase/guide_documents.sql。", true);
    } else {
      status(elements.guide_admin_status, "选择目的地后，可以上传新的 HTML 或 PDF 攻略。" );
    }
    await loadPhotos(elements.photo_city.value);
  }

  async function sendLogin(event) {
    event.preventDefault();
    const email = elements.login_email.value.trim();
    if (!email) return;
    setBusy(elements.login_form, true);
    status(elements.login_status, "正在发送登录链接…");
    await client.auth.signOut({ scope: "local" });
    const redirectUrl = new URL("./admin.html", window.location.href).toString();
    const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectUrl } });
    setBusy(elements.login_form, false);
    status(elements.login_status, error ? `发送失败：${error.message}` : "登录链接已发送，请前往邮箱打开。", Boolean(error));
  }

  async function enterIfOwner(session) {
    user = session?.user || null;
    if (!user || user.is_anonymous) return false;
    const { data, error } = await client.rpc("is_current_user_owner");
    if (error || data !== true) {
      status(elements.login_status, "当前登录账号不是预设的站主账号。", true);
      return false;
    }
    elements.login_panel.hidden = true;
    elements.admin_app.hidden = false;
    elements.sign_out.hidden = false;
    elements.session_label.textContent = user.email || "站主已登录";
    await loadAdminData();
    return true;
  }

  async function signOut() {
    await client.auth.signOut({ scope: "local" });
    window.location.replace("./admin.html");
  }

  function bindEvents() {
    elements.login_form.addEventListener("submit", sendLogin);
    elements.sign_out.addEventListener("click", signOut);
    elements.city_picker.addEventListener("change", () => renderCityForm(elements.city_picker.value));
    elements.city_form.addEventListener("submit", saveCity);
    elements.new_city.addEventListener("click", startNewCity);
    elements.remove_city_override.addEventListener("click", removeCityOverride);
    elements.add_visit_record.addEventListener("click", addVisitRecord);
    elements.photo_city.addEventListener("change", () => loadPhotos(elements.photo_city.value));
    elements.import_photos.addEventListener("click", async () => {
      try {
        await importLocalPhotos(elements.photo_city.value);
        await loadPhotos(elements.photo_city.value);
      } catch (error) {
        status(elements.photo_admin_status, `导入失败：${error.message}`, true);
      }
    });
    elements.upload_photos.addEventListener("click", uploadPhotos);
    elements.wish_picker.addEventListener("change", () => renderWishForm(elements.wish_picker.value));
    elements.wish_form.addEventListener("submit", saveWish);
    elements.new_wish.addEventListener("click", startNewWish);
    elements.remove_wish_override.addEventListener("click", removeWishOverride);
    elements.guide_place_type.addEventListener("change", populateGuidePlaces);
    elements.guide_place_name.addEventListener("change", renderGuideRows);
    elements.guide_upload_form.addEventListener("submit", uploadGuide);
    elements.rating_city_filter.addEventListener("change", renderRatings);
  }

  async function initialize() {
    bindEvents();
    if (!configured()) {
      status(elements.login_status, "请先完成 Supabase 配置。", true);
      setBusy(elements.login_form, true);
      return;
    }
    client = window.supabase.createClient(config.url, config.publishableKey);
    const { data, error } = await client.auth.getSession();
    if (error) status(elements.login_status, `登录状态读取失败：${error.message}`, true);
    await enterIfOwner(data?.session);
    client.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user && !elements.admin_app.hidden) return;
      if (event === "SIGNED_IN") window.setTimeout(() => enterIfOwner(session), 0);
    });
  }

  initialize();
})();
