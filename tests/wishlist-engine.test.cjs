const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const engine = require("../assets/wishlist-engine.js");

test("wishlist priority normalizes unknown values without changing existing wishes", () => {
  assert.equal(engine.normalizePriority(3), 3);
  assert.equal(engine.normalizePriority("1"), 1);
  assert.equal(engine.normalizePriority(9), 2);
  assert.equal(engine.normalizePriority(undefined), 2);
});

test("wishlist is grouped by desire level and keeps manual order within each level", () => {
  const groups = engine.groupWishlist([
    { name: "乙", priorityLevel: 2, sortOrder: 3 },
    { name: "甲", priorityLevel: 3, sortOrder: 8 },
    { name: "丙", priorityLevel: 2, sortOrder: 1 },
    { name: "丁", priorityLevel: 1, sortOrder: 0 }
  ]);
  assert.deepEqual(groups.map((group) => [group.level, group.label, group.items.map((item) => item.name)]), [
    [3, "最想去", ["甲"]],
    [2, "很想去", ["丙", "乙"]],
    [1, "有机会去", ["丁"]]
  ]);
});

test("admin and database migration expose the same three-level priority", () => {
  const root = path.resolve(__dirname, "..");
  const admin = fs.readFileSync(path.join(root, "admin.html"), "utf8");
  const migration = fs.readFileSync(path.join(root, "supabase/wishlist_priority.sql"), "utf8");
  assert.match(admin, /id="wish-priority"/);
  assert.match(admin, /3 · 最想去/);
  assert.match(admin, /1 · 有机会去/);
  assert.match(migration, /priority_level between 1 and 3/);
  assert.match(migration, /default 2/);
});
