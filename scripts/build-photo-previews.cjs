// Originals are read into memory, never replaced or committed. Only public, visible photos are fetched.
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const widths = [480, 960, 1600];
const output = path.join(root, 'photos/previews/v1');
const manifestFile = path.join(root, 'assets/photo-previews.js');
const reportFile = path.join(root, 'docs/qa/2026-10-19/photo-performance.json');
const args = process.argv.slice(2);
const remote = args.includes('--remote');
const limit = Number(args.find(arg => arg.startsWith('--limit='))?.split('=')[1] || Infinity);
const concurrency = Math.max(1, Math.min(6, Number(args.find(arg => arg.startsWith('--concurrency='))?.split('=')[1] || 3)));

async function readGlobal(file, name) {
  const context = { window: {} };
  vm.runInNewContext(await fs.readFile(path.join(root, file), 'utf8'), context);
  return context.window[name];
}

async function rowsFor(config, table, select, filter) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const query = new URLSearchParams({ select, ...filter });
    const response = await fetch(`${config.url}/rest/v1/${table}?${query}`, {
      headers: { apikey: config.publishableKey, Range: `${offset}-${offset + 999}`, 'Range-Unit': 'items' },
      signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) throw new Error(`${table}: HTTP ${response.status}`);
    const page = await response.json();
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

async function readOriginal(source, config) {
  if (!/^https?:\/\//.test(source)) {
    const pathname = path.resolve(root, decodeURIComponent(source));
    if (!pathname.startsWith(path.join(root, 'photos') + path.sep)) throw new Error('Unexpected local image path');
    return fs.readFile(pathname);
  }
  // Do not fetch arbitrary URLs returned from a public content table (SSRF / unbounded downloads).
  const url = new URL(source);
  if (url.origin !== new URL(config.url).origin || !url.pathname.startsWith('/storage/v1/object/public/city-photos/')) {
    throw new Error('External image skipped; only this project’s public city-photos bucket is allowed');
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
      if (!response.ok) throw new Error(`Image HTTP ${response.status}`);
      const maximum = 16 * 1024 * 1024;
      if (Number(response.headers.get('content-length')) > maximum) { await response.body.cancel(); throw new Error('Image exceeds 16 MB'); }
      const parts = [];
      let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > maximum) throw new Error('Image exceeds 16 MB');
        parts.push(chunk);
      }
      return Buffer.concat(parts);
    } catch (error) { if (attempt === 2) throw error; }
  }
}

async function build() {
  const config = await readGlobal('assets/supabase-config.js', 'SUPABASE_CONFIG');
  const photos = await readGlobal('assets/photos.js', 'PHOTO_MANIFEST');
  const data = await readGlobal('assets/data.js', 'TRAVEL_DATA');
  const sources = new Set(Object.values(photos).flat());
  (data.visits || []).forEach(city => { if (city.coverUrl) sources.add(city.coverUrl); });
  (data.journeys || []).forEach(journey => {
    if (journey.coverUrl) sources.add(journey.coverUrl);
    (journey.photos || []).forEach(photo => { if (photo.imageUrl) sources.add(photo.imageUrl); });
  });
  let visibleRows = 0;
  if (remote) {
    const [rows, cities, journeys, linked] = await Promise.all([
      rowsFor(config, 'city_photos', 'image_url', { is_hidden: 'eq.false', order: 'id.asc' }),
      rowsFor(config, 'travel_cities', 'cover_url', { is_hidden: 'eq.false', order: 'name.asc' }),
      rowsFor(config, 'travel_journeys', 'id,cover_url', { is_published: 'eq.true', order: 'id.asc' }),
      rowsFor(config, 'travel_journey_photos', 'journey_id,image_url', { order: 'id.asc' })
    ]);
    visibleRows = rows.length;
    rows.forEach(row => { if (row.image_url) sources.add(row.image_url); });
    [...cities, ...journeys].forEach(row => { if (row.cover_url) sources.add(row.cover_url); });
    const published = new Set(journeys.map(journey => journey.id));
    linked.forEach(photo => { if (published.has(photo.journey_id) && photo.image_url) sources.add(photo.image_url); });
  }
  let previous = { photos: {} };
  try { previous = await readGlobal('assets/photo-previews.js', 'PHOTO_PREVIEWS'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const entries = { ...previous.photos };
  const failures = [];
  const skipped = [];
  const queue = [...sources].sort().slice(0, limit);
  let position = 0;
  let processed = 0;
  let generated = 0;
  await fs.mkdir(output, { recursive: true });
  async function worker() {
    while (position < queue.length) {
      const source = queue[position++];
      try {
        let cached = Boolean(entries[source]?.variants?.length);
        if (cached) {
          try { await Promise.all(entries[source].variants.map(item => fs.access(path.resolve(root, item.url)))); }
          catch { cached = false; }
        }
        if (!cached) {
          const buffer = await readOriginal(source, config);
          const metadata = await sharp(buffer, { limitInputPixels: 100000000 }).metadata();
          if (metadata.pages > 1) { skipped.push({ source, reason: 'Animation kept as original' }); continue; }
          const hash = crypto.createHash('sha256').update(source).update(buffer).digest('hex').slice(0, 24);
          const variants = [];
          for (const width of widths) {
            const filename = `${hash}-${width}.webp`;
            const info = await sharp(buffer, { limitInputPixels: 100000000 }).rotate()
              .resize({ width, withoutEnlargement: true }).webp({ quality: width === 480 ? 82 : 86, effort: 4 })
              .toFile(path.join(output, filename));
            // Record actual width for correct srcset descriptors, not the requested width.
            if (!variants.some(item => item.width === info.width)) variants.push({
              url: `./photos/previews/v1/${filename}`, width: info.width, height: info.height, bytes: info.size
            });
            if (info.width < width) break;
          }
          entries[source] = { originalBytes: buffer.length, variants };
          generated++;
        }
      } catch (error) { failures.push({ source, message: error.message }); }
      finally {
        processed++;
        if (processed % 25 === 0 || processed === queue.length) console.log(`Previews: ${processed}/${queue.length}; new ${generated}; failures ${failures.length}`);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  const manifest = { version: 1, photos: Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b))) };
  await fs.writeFile(manifestFile, `// Generated by npm run photos:previews -- --remote. Originals remain unchanged.\nwindow.PHOTO_PREVIEWS = ${JSON.stringify(manifest)};\n`);
  const completed = queue.filter(source => entries[source]);
  const total = key => completed.reduce((sum, source) => sum + key(entries[source]), 0);
  const report = {
    generatedAt: new Date().toISOString(), remote, visibleRows, sources: queue.length, completed: completed.length, generated,
    originalBytes: total(entry => entry.originalBytes),
    previewBytes: total(entry => entry.variants.reduce((sum, variant) => sum + variant.bytes, 0)),
    thumbnailBytes: total(entry => entry.variants[0].bytes),
    mediumBytes: total(entry => (entry.variants.find(variant => variant.width >= 960) || entry.variants.at(-1)).bytes),
    largeBytes: total(entry => entry.variants.at(-1).bytes), failures, skipped
  };
  await fs.mkdir(path.dirname(reportFile), { recursive: true });
  await fs.writeFile(reportFile, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  if (failures.length) process.exitCode = 1;
}

if (require.main === module) build().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { readOriginal, rowsFor };
