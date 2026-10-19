(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TRAVEL_PHOTOS = api;
})(typeof window === "undefined" ? globalThis : window, function (root) {
  "use strict";

  const widths = [480, 960, 1600];
  const settings = {
    thumb: { width: 480 },
    grid: { width: 480, responsive: true, sizes: "(max-width: 600px) 90vw, (max-width: 1000px) 45vw, 320px" },
    cover: { width: 960, responsive: true, sizes: "(max-width: 767px) 100vw, 720px" },
    large: { width: 1600 }
  };
  const states = new WeakMap();
  let index;
  let indexedManifest;

  function canonical(source) {
    try { return new URL(source, root.document?.baseURI || "https://sehuri.github.io/travel-map/").href; }
    catch { return source; }
  }

  function variants(source) {
    const manifest = root.PHOTO_PREVIEWS;
    if (manifest !== indexedManifest || !index) {
      indexedManifest = manifest;
      index = new Map(Object.entries(manifest?.photos || {}).map(([url, entry]) => [canonical(url), entry.variants]));
    }
    const saved = index.get(canonical(source));
    if (saved?.length) return saved;
    // Only uploads that successfully generated all variants carry this marker.
    // Older uploads and external URLs must never guess a non-existent preview.
    try {
      const url = new URL(source);
      const prefix = "/storage/v1/object/public/city-photos/cities/pv1-";
      if (url.origin !== new URL(root.SUPABASE_CONFIG?.url).origin || !url.pathname.startsWith(prefix)) return [];
      const dimensions = url.pathname.match(/\/pv1-(\d+)x(\d+)-/);
      if (!dimensions) return [];
      const sourceWidth = Number(dimensions[1]);
      const sourceHeight = Number(dimensions[2]);
      return widths.filter((width, i) => i === 0 || sourceWidth > widths[i - 1]).map(width => ({
        url: `${url.origin}${url.pathname.replace("/city-photos/cities/", "/city-photos/previews/")}.${width}.webp`,
        width: Math.min(width, sourceWidth), height: Math.round(sourceHeight * Math.min(width, sourceWidth) / sourceWidth)
      }));
    } catch { return []; }
  }

  function urlFor(source, size = "grid") {
    const choices = variants(source);
    const target = settings[size]?.width || 480;
    return (choices.find(item => item.width >= target) || choices.at(-1))?.url || source;
  }

  function clearImage(image) {
    const previous = states.get(image);
    if (previous) image.removeEventListener("error", previous, true);
    states.delete(image);
    ["src", "srcset", "sizes", "width", "height", "data-photo-original"].forEach(name => image.removeAttribute(name));
  }

  function setImage(image, source, options = {}) {
    clearImage(image);
    if (!source) return;
    const spec = settings[options.size || "grid"] || settings.grid;
    const choices = variants(source);
    const selected = choices.find(item => item.width >= spec.width) || choices.at(-1);
    image.loading = options.loading || "lazy";
    image.decoding = "async";
    image.fetchPriority = options.priority || "auto";
    image.dataset.photoOriginal = source;
    if (selected?.height) {
      image.width = selected.width;
      image.height = selected.height;
    }
    if (choices.length && spec.responsive) {
      // Small list images never need the full 1600px version, even on a high-DPI screen.
      const candidates = choices.filter(item => spec.width > 480 || item.width <= 960);
      image.srcset = candidates.map(item => `${item.url} ${item.width}w`).join(", ");
      image.sizes = options.sizes || spec.sizes;
    }
    if (selected && canonical(selected.url) !== canonical(source)) {
      const fallback = event => {
        image.removeEventListener("error", fallback, true);
        states.delete(image);
        event.stopImmediatePropagation();
        image.removeAttribute("srcset");
        image.removeAttribute("sizes");
        image.src = source;
      };
      states.set(image, fallback);
      image.addEventListener("error", fallback, true);
    }
    image.src = selected?.url || source;
  }

  async function loadImage(source, size = "large") {
    const preview = urlFor(source, size);
    const load = url => new Promise(resolve => {
      const image = new root.Image();
      const timer = setTimeout(() => { image.onload = image.onerror = null; image.src = ""; resolve(null); }, 12000);
      image.decoding = "async";
      image.onload = () => { clearTimeout(timer); resolve(url); };
      image.onerror = () => { clearTimeout(timer); resolve(null); };
      image.src = url;
    });
    return await load(preview) || (preview !== source ? await load(source) : null);
  }

  async function createPreviews(file) {
    // Animated GIF/WebP/AVIF keep their original playback rather than silently flattening frames.
    if (!["image/jpeg", "image/png"].includes(file.type)) return [];
    let bitmap;
    let objectUrl;
    try {
      if (root.createImageBitmap) bitmap = await root.createImageBitmap(file, { imageOrientation: "from-image" });
      else {
        objectUrl = URL.createObjectURL(file);
        bitmap = await new Promise((resolve, reject) => {
          const image = new root.Image();
          image.onload = () => resolve(image);
          image.onerror = reject;
          image.src = objectUrl;
        });
      }
      const result = [];
      for (const width of widths) {
        const actualWidth = Math.min(width, bitmap.width);
        const height = Math.max(1, Math.round(bitmap.height * actualWidth / bitmap.width));
        const canvas = root.document.createElement("canvas");
        canvas.width = actualWidth;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("浏览器无法生成预览图");
        context.imageSmoothingQuality = "high";
        context.drawImage(bitmap, 0, 0, actualWidth, height);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/webp", width === 480 ? .82 : .86));
        if (!blob || blob.type !== "image/webp") throw new Error("浏览器不支持 WebP 预览图");
        result.push({ width, blob, sourceWidth: bitmap.width, sourceHeight: bitmap.height });
        canvas.width = canvas.height = 1;
      }
      return result;
    } finally {
      bitmap?.close?.();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  }

  async function uploadOriginal(storage, file, name, onProgress = () => {}) {
    let path = `cities/${name}`;
    let previewWarning = false;
    try {
      onProgress(`正在为 ${file.name} 生成预览图，原图保留…`);
      const previews = await createPreviews(file);
      if (previews.length) {
        const previewName = `pv1-${previews[0].sourceWidth}x${previews[0].sourceHeight}-${name}`;
        for (const preview of previews) {
          const result = await storage.upload(`previews/${previewName}.${preview.width}.webp`, preview.blob, {
            upsert: false, contentType: "image/webp", cacheControl: "31536000"
          });
          if (result.error) throw result.error;
        }
        path = `cities/${previewName}`;
      }
    } catch {
      // Never mark a partial preview set as complete, and never discard the original.
      previewWarning = true;
    }
    onProgress(`正在上传 ${file.name}…`);
    const result = await storage.upload(path, file, { upsert: false, contentType: file.type, cacheControl: "31536000" });
    if (result.error) throw result.error;
    return { path, previewWarning };
  }

  return { widths, variants, urlFor, setImage, clearImage, loadImage, createPreviews, uploadOriginal };
});
