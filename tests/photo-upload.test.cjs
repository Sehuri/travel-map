const test = require('node:test');
const assert = require('node:assert/strict');
const { validate, droppedFiles } = require('../assets/photo-upload.js');

test('native Photos files accept supported MIME types, missing MIME and generic binary exports without recoding', () => {
  assert.equal(validate({ name: 'image.jpeg', type: 'image/jpeg', size: 512 }).type, 'image/jpeg');
  assert.equal(validate({ name: 'IMG_1020.JPG', type: '', size: 512 }).type, 'image/jpeg');
  assert.equal(validate({ name: 'image.png', type: 'application/octet-stream', size: 512 }).type, 'image/png');
  for (const type of ['image/png', 'image/webp', 'image/gif', 'image/avif']) assert.equal(validate({ name: 'image', type, size: 512 }).type, type);
  assert(!validate({ name: 'a.jpg', type: 'image/jpeg', size: 15 * 1024 * 1024 }).error);
});

test('selection rejects empty iCloud placeholders, oversized files, HEIC and non-image files early', () => {
  assert.match(validate({ name: 'cloud.jpg', type: 'image/jpeg', size: 0 }).error, /iCloud/);
  assert.match(validate({ name: 'large.jpg', type: 'image/jpeg', size: 15 * 1024 * 1024 + 1 }).error, /15 MB/);
  for (const file of [
    { name: 'a.HEIC', type: 'image/heic' }, { name: 'a.heif', type: '' },
    { name: 'a.txt', type: 'text/plain' }, { name: 'looks-like.jpg', type: 'application/pdf' }
  ]) assert.match(validate({ ...file, size: 20 }).error, /格式暂不支持/);
});

test('drop snapshots FileList, falls back to file items, and never treats dragged links or HTML as uploads', () => {
  const file = { name: 'photo.jpg' };
  assert.deepEqual(droppedFiles({ files: [file] }), [file]);
  assert.deepEqual(droppedFiles({ files: [], items: [
    { kind: 'string', getAsFile() { throw new Error('must not inspect strings'); } },
    { kind: 'file', getAsFile: () => file }, { kind: 'file', getAsFile: () => null }
  ] }), [file]);
  assert.deepEqual(droppedFiles({ files: [], items: [], getData() { throw new Error('must not read URLs'); } }), []);
  assert.deepEqual(droppedFiles(null), []);
});
