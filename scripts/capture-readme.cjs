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
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
    const page = await context.newPage();
    // Read the same public content and real map as the site, never mock screenshot data.
    await page.goto(`${base}/index.html?capture=readme`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Number(document.querySelector("#city-count")?.textContent) > 0);
    await page.waitForFunction(() => !/正在/.test(document.querySelector("#content-status")?.textContent || "正在读取"));
    await page.locator(".amap-marker-button").first().waitFor({ state: "visible", timeout: 30000 });
    await page.getByRole("button", { name: "旅程足迹", exact: true }).click();
    await screenshotViewport(page, "01-home.jpg");
    const latestJourney = await page.locator("#latest-journey-link").getAttribute("href");

    await page.locator('[data-home-tab-target="wishlist"]:visible').first().click();
    await page.locator(".wish-priority-group").first().waitFor({ state: "visible" });
    await page.locator("#top").scrollIntoViewIfNeeded();
    await screenshotViewport(page, "02-wishlist.jpg");

    await page.locator('[data-home-tab-target="journeys"]:visible').first().click();
    await screenshot(page.locator("#journey-stats"), "03-travel-data.jpg");

    if (!latestJourney || !new URL(latestJourney,base).searchParams.get("slug")) throw new Error("No published journey available for capture.");
    await page.goto(new URL(latestJourney,base).href, { waitUntil: "domcontentloaded" });
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
