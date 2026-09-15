const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "docs", "readme");
const contentTypes = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp"
};

async function createServer() {
  const server = http.createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const target = path.resolve(root, `.${pathname}`);
    if (!target.startsWith(`${root}${path.sep}`)) {
      response.writeHead(403).end();
      return;
    }
    try {
      const body = await fs.readFile(target);
      response.writeHead(200, { "Content-Type": contentTypes[path.extname(target)] || "application/octet-stream" }).end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server;
}

async function screenshot(locator, filename) {
  await locator.screenshot({
    path: path.join(output, filename),
    type: "jpeg",
    quality: 84
  });
}

async function screenshotViewport(page, filename) {
  await page.screenshot({
    path: path.join(output, filename),
    type: "jpeg",
    quality: 84
  });
}

(async () => {
  await fs.mkdir(output, { recursive: true });
  const server = await createServer();
  const base = `http://127.0.0.1:${server.address().port}`;
  const launchOptions = { headless: true };
  if (process.env.CHROME_PATH) launchOptions.executablePath = process.env.CHROME_PATH;
  const browser = await chromium.launch(launchOptions);
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.route("https://cdn.jsdelivr.net/npm/@supabase/**", (route) => route.fulfill({
      contentType: "text/javascript",
      body: ""
    }));
    await page.route("https://webapi.amap.com/**", (route) => route.abort());

    await page.goto(`${base}/index.html?capture=readme`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector("#city-count")?.textContent === "53");
    await page.addStyleTag({ content: ".skip-link { display: none !important; }" });
    await screenshot(page.locator("#top"), "01-home.jpg");

    await page.getByRole("tab", { name: /仍在期待/ }).click();
    await page.locator(".wish-priority-group").first().waitFor({ state: "visible" });
    await page.locator("#top").scrollIntoViewIfNeeded();
    await screenshotViewport(page, "02-wishlist.jpg");

    await screenshot(page.locator("#journey-stats"), "03-travel-data.jpg");

    await page.goto(`${base}/journey.html?slug=2026-japan-kansai-kanto`, { waitUntil: "domcontentloaded" });
    await page.locator("#journey-content").waitFor({ state: "visible" });
    await screenshot(page.locator("#journey-hero"), "04-journey.jpg");
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
