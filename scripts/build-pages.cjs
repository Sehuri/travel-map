const fs = require('node:fs/promises');
const path = require('node:path');

// Publish the static website only. Development tools and design/QA screenshots
// remain in the repository; all original photos and generated previews stay live.
async function buildPages(root, destination) {
  await fs.mkdir(destination, { recursive: false });
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files = entries.filter(entry => entry.isFile() && /\.html$/.test(entry.name)).map(entry => entry.name);
  for (const optional of ['CNAME', 'robots.txt', 'sitemap.xml']) {
    if (entries.some(entry => entry.isFile() && entry.name === optional)) files.push(optional);
  }
  for (const file of files) await fs.copyFile(path.join(root, file), path.join(destination, file));
  for (const directory of ['assets', 'photos']) {
    await fs.cp(path.join(root, directory), path.join(destination, directory), {
      recursive: true,
      filter: source => !path.basename(source).startsWith('.'),
    });
  }
  await fs.writeFile(path.join(destination, '.nojekyll'), '');
  return files;
}

if (require.main === module) {
  const destination = process.argv[2];
  if (!destination) throw new Error('Pass a new output directory to build-pages.cjs');
  buildPages(path.resolve(__dirname, '..'), path.resolve(destination))
    .then(files => console.log(`Prepared ${files.length} pages, assets and all photos in ${destination}`))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { buildPages };
