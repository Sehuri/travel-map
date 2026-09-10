(async function () {
  "use strict";

  const status = document.querySelector("#viewer-status");
  const frame = document.querySelector("#guide-frame");
  const title = document.querySelector("#viewer-title");
  const rawLink = document.querySelector("#raw-file-link");
  const params = new URL(window.location.href).searchParams;
  const source = params.get("src") || "";
  const requestedTitle = params.get("title") || "旅行攻略";
  const projectUrl = window.SUPABASE_CONFIG?.url || "";

  function validSource(value) {
    try {
      const url = new URL(value);
      const project = new URL(projectUrl);
      return url.origin === project.origin
        && url.pathname.startsWith("/storage/v1/object/public/travel-guides/")
        && /\.html?$/i.test(url.pathname);
    } catch {
      return false;
    }
  }

  function escapeAttribute(value) {
    return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
  }

  function withBase(html, sourceUrl) {
    const base = `<base href="${escapeAttribute(new URL(".", sourceUrl).href)}">`;
    if (/<head(?:\s[^>]*)?>/i.test(html)) return html.replace(/<head(?:\s[^>]*)?>/i, (match) => `${match}${base}`);
    return `<!doctype html><html><head><meta charset="utf-8">${base}</head><body>${html}</body></html>`;
  }

  title.textContent = requestedTitle;
  document.title = `${requestedTitle}｜旅行攻略`;

  if (!validSource(source)) {
    status.textContent = "攻略地址无效或不属于本站的攻略存储空间。";
    return;
  }

  rawLink.href = source;
  rawLink.hidden = false;
  try {
    const response = await fetch(source, { credentials: "omit" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = await response.arrayBuffer();
    const html = new TextDecoder("utf-8").decode(bytes);
    frame.srcdoc = withBase(html, source);
    frame.hidden = false;
    status.hidden = true;
  } catch {
    status.textContent = "攻略载入失败，请稍后重试，或使用右上角查看原文件。";
  }
})();
