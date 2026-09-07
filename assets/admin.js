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
    "remove-city-override", "photo-city", "photo-files", "upload-photos", "import-photos", "photo-admin-status",
    "admin-photo-grid", "wish-picker", "wish-form", "wish-name", "wish-icon", "wish-order", "wish-description",
    "wish-guide", "wish-planned-time", "wish-hidden", "wish-status", "new-wish", "remove-wish-override", "rating-city-filter",
    "rating-admin-status", "ratings-table"
  ].map((id) => [id.replaceAll("-", "_"), document.getElementById(id)]));

  let client = null;
  let user = null;
  let cityRows = new Map();
  let wishRows = new Map();
  let ratingRows = [];
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
  }

  function startNewCity() {
    creatingCity = true;
    currentCityName = "";
    elements.city_form.reset();
    elements.city_name.readOnly = false;
    elements.city_hidden.checked = false;
    elements.remove_city_override.hidden = true;
    status(elements.city_status, "填写后保存，新城市会直接出现在公开网站。" );
    elements.city_name.focus();
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
    const [cities, wishes, ratings] = await Promise.all([
      client.from("travel_cities").select("*").order("visit_date", { ascending: false }),
      client.from("travel_wishlist").select("*").order("sort_order", { ascending: true }),
      client.from("city_ratings").select("city_name,user_id,score,created_at,updated_at").order("updated_at", { ascending: false })
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
    wishRows = new Map((wishes.data || []).map((row) => [row.name, row]));
    ratingRows = ratings.error ? [] : (ratings.data || []);
    populateCityPickers();
    populateWishPicker();
    if (currentCityName) renderCityForm(currentCityName);
    if (currentWishName) renderWishForm(currentWishName);
    renderRatings();
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
