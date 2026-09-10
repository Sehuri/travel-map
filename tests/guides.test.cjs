const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('guide migration limits uploads and protects writes with owner policies', () => {
  const sql = read('supabase/guide_documents.sql');
  assert.match(sql, /place_type in \('visited', 'wishlist'\)/);
  assert.match(sql, /file_type in \('html', 'pdf'\)/);
  assert.match(sql, /20971520/);
  assert.match(sql, /array\['text\/html', 'application\/xhtml\+xml', 'application\/pdf'\]/);
  assert.match(sql, /public\.is_current_user_owner\(\)/);
  assert.match(sql, /travel_guides_public_read/);
  assert.match(sql, /using \(is_hidden = false\)/);
});

test('admin and public pages expose guide upload and viewing surfaces', () => {
  const admin = read('admin.html');
  const homepage = read('index.html');
  const adminScript = read('assets/admin.js');
  const contentScript = read('assets/content.js');
  assert.match(admin, /accept="\.html,\.htm,\.pdf/);
  assert.match(adminScript, /storage\.from\("travel-guides"\)\.upload/);
  assert.match(adminScript, /file\.size > 20 \* 1024 \* 1024/);
  assert.match(homepage, /id="city-guide-documents"/);
  assert.match(homepage, /id="wishlist-guide-documents"/);
  assert.match(contentScript, /from\("travel_guides"\)/);
});
