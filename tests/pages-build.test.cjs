const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { buildPages } = require('../scripts/build-pages.cjs');

test('Pages package preserves website assets and original/preview photos, excluding development material', async t => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'travel-pages-'));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const root = path.join(temporary, 'source');
  const output = path.join(temporary, 'site');
  const fixture = {
    'index.html': '<script src="./assets/app.js"></script>',
    'journal-edit.html': '<main>editor</main>',
    'assets/app.js': 'console.log("site")',
    'assets/vendor/icons/map.svg': '<svg/>',
    'assets/.DS_Store': 'local metadata',
    'photos/城市/original.jpg': 'original bytes',
    'photos/previews/v1/photo.webp': 'preview bytes',
    'CNAME': 'example.com',
    'docs/design/prototype.png': 'design only',
    'supabase/migration.sql': 'database source',
    'node_modules/package/index.js': 'dependency',
    '.git/config': 'git metadata',
    'package.json': '{}',
  };
  for (const [file, body] of Object.entries(fixture)) {
    await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await fs.writeFile(path.join(root, file), body);
  }
  await buildPages(root, output);
  for (const file of ['index.html', 'journal-edit.html', 'assets/app.js', 'assets/vendor/icons/map.svg', 'photos/城市/original.jpg', 'photos/previews/v1/photo.webp', 'CNAME']) {
    assert.deepEqual(await fs.readFile(path.join(output, file)), await fs.readFile(path.join(root, file)), file);
  }
  assert.equal(await fs.readFile(path.join(output, '.nojekyll'), 'utf8'), '');
  for (const file of ['docs', 'supabase', 'node_modules', '.git', 'package.json', 'assets/.DS_Store']) {
    await assert.rejects(fs.access(path.join(output, file)), { code: 'ENOENT' }, file);
  }
  // Never merge into an old artifact or delete an existing destination.
  await assert.rejects(buildPages(root, output), { code: 'EEXIST' });
});
