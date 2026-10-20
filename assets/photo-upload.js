(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TRAVEL_PHOTO_UPLOAD = api;
})(typeof window === "undefined" ? globalThis : window, function (root) {
  "use strict";
  const formats = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", avif: "image/avif" };
  const allowed = new Set(Object.values(formats));

  function validate(file) {
    if (!file || !file.size) return { error: "文件为空，或照片尚未从 iCloud 下载完成" };
    if (file.size > 15 * 1024 * 1024) return { error: "超过单张 15 MB 限制" };
    const inferred = formats[String(file.name).split(".").pop().toLowerCase()];
    const type = !file.type || file.type === "application/octet-stream" ? inferred : file.type;
    if (!allowed.has(type)) return { error: "格式暂不支持；HEIC / HEIF 请先从“照片”导出为 JPEG" };
    return { type };
  }

  function droppedFiles(transfer) {
    // Capture file promises synchronously during drop, before the protected drag store is cleared.
    // Never fetch text/uri-list URLs or interpret dragged HTML as a local photo.
    const files = Array.from(transfer?.files || []);
    return files.length ? files : Array.from(transfer?.items || []).filter(item => item.kind === "file").map(item => item.getAsFile()).filter(Boolean);
  }

  function initialize(section) {
    const byId = id => section.querySelector(`#${id}`);
    const input = byId("photo-files");
    const zone = byId("photo-dropzone");
    const list = byId("photo-pending-list");
    const summary = byId("photo-pending-count");
    const notice = byId("photo-selection-status");
    const clear = byId("photo-clear-pending");
    const choose = byId("photo-choose-more");
    const city = byId("photo-city");
    const upload = byId("upload-photos");
    const entries = [];
    const keys = new Set();
    let preparing = 0;
    let uploading = false;
    let dragDepth = 0;
    let chain = Promise.resolve();

    function announce(message, error = false) {
      notice.textContent = message;
      notice.classList.toggle("error", error);
    }
    function update() {
      const busy = uploading || preparing > 0;
      upload.disabled = busy || !entries.length;
      clear.disabled = busy || !entries.length;
      input.disabled = choose.disabled = city.disabled = uploading;
      zone.setAttribute("aria-busy", String(busy));
      zone.classList.toggle("is-busy", uploading);
      summary.textContent = preparing ? "正在检查所选照片…" : entries.length
        ? `待上传 ${entries.length} 张 · 目标城市：${city.value || "请先选择"} · 点击“上传照片”后才会上传`
        : "尚未添加待上传照片";
      list.replaceChildren();
      entries.forEach(entry => {
        const item = document.createElement("li");
        item.className = "photo-pending-item";
        const image = document.createElement("img");
        image.alt = "";
        image.loading = "lazy";
        image.decoding = "async";
        image.src = entry.url;
        const name = document.createElement("span");
        name.textContent = entry.file.name;
        name.title = entry.file.name;
        const size = document.createElement("small");
        size.textContent = `${(entry.file.size / 1024 / 1024).toFixed(1)} MB`;
        const fallback = document.createElement("small");
        fallback.hidden = true;
        fallback.textContent = "暂不可预览";
        image.addEventListener("error", () => { image.hidden = true; fallback.hidden = false; }, { once: true });
        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "移除";
        remove.setAttribute("aria-label", `移除待上传照片 ${entry.file.name}`);
        remove.disabled = busy;
        remove.addEventListener("click", () => {
          const position = entries.indexOf(entry);
          discard(entry);
          update();
          const next = list.querySelectorAll("button")[Math.min(position, entries.length - 1)];
          (next || choose).focus();
        });
        item.append(image, fallback, name, size, remove);
        list.append(item);
      });
    }
    function discard(entry) {
      entries.splice(entries.indexOf(entry), 1);
      keys.delete(entry.key);
      URL.revokeObjectURL(entry.url);
    }
    function addFiles(files) {
      const snapshot = Array.from(files || []);
      if (uploading) { announce("正在上传，请完成后再添加照片。", true); return Promise.resolve(); }
      if (!snapshot.length) { announce("没有读取到照片文件。请拖入照片缩略图，而不是相册或链接；也可使用“选择更多照片”。", true); return Promise.resolve(); }
      preparing++;
      update();
      chain = chain.then(async () => {
        let added = 0;
        let duplicates = 0;
        const rejected = [];
        for (const original of snapshot) {
          const validation = validate(original);
          if (validation.error) { rejected.push(`${original.name}：${validation.error}`); continue; }
          try {
            // Photos exports can share names and timestamps. Hash contents, not filenames.
            const key = root.crypto?.subtle
              ? Array.from(new Uint8Array(await root.crypto.subtle.digest("SHA-256", await original.arrayBuffer())), value => value.toString(16).padStart(2, "0")).join("")
              : original;
            if (keys.has(key)) { duplicates++; continue; }
            const file = original.type === validation.type ? original : new root.File([original], original.name, { type: validation.type, lastModified: original.lastModified });
            entries.push({ file, key, url: URL.createObjectURL(file) });
            keys.add(key);
            added++;
          } catch { rejected.push(`${original.name}：暂时无法读取，请先在“照片”中下载或导出后重试`); }
        }
        announce(`已添加 ${added} 张${duplicates ? `，跳过 ${duplicates} 张重复照片` : ""}。${rejected.length ? `未添加 ${rejected.length} 个文件：${rejected.slice(0, 3).join("；")}${rejected.length > 3 ? "…" : ""}` : "确认目标城市后再上传。"}`, rejected.length > 0);
      }).finally(() => { preparing--; update(); });
      return chain;
    }

    input.addEventListener("change", () => { const files = Array.from(input.files); input.value = ""; if (files.length) void addFiles(files); });
    choose.addEventListener("click", () => input.click());
    clear.addEventListener("click", () => {
      if (uploading || preparing) return;
      [...entries].forEach(discard);
      update();
      announce("待上传列表已清空，已保存的照片不受影响。");
      choose.focus();
    });
    city.addEventListener("change", update);
    const fileDrag = event => Array.from(event.dataTransfer?.types || []).includes("Files");
    zone.addEventListener("dragenter", event => {
      if (!fileDrag(event)) return;
      event.preventDefault();
      dragDepth++;
      if (!uploading) zone.classList.add("is-dragover");
    });
    zone.addEventListener("dragover", event => {
      if (!fileDrag(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = uploading ? "none" : "copy";
    });
    zone.addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; zone.classList.remove("is-dragover"); } });
    zone.addEventListener("drop", event => {
      event.preventDefault();
      event.stopPropagation();
      dragDepth = 0;
      zone.classList.remove("is-dragover");
      void addFiles(droppedFiles(event.dataTransfer));
    });
    // Do not navigate away and lose forms if a file misses the drop target.
    for (const type of ["dragover", "drop"]) document.addEventListener(type, event => {
      if (fileDrag(event) && !section.closest("[hidden]")) event.preventDefault();
    });
    root.addEventListener("pagehide", () => { [...entries].forEach(discard); update(); });
    update();
    return {
      files: () => entries.map(entry => entry.file),
      isBusy: () => uploading || preparing > 0,
      setUploading(value) { uploading = value; update(); },
      complete(file) { const entry = entries.find(entry => entry.file === file); if (entry) { discard(entry); update(); } }
    };
  }
  return { validate, droppedFiles, initialize };
});
