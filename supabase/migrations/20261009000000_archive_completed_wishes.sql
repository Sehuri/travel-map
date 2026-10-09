-- Remove completed destinations from the public wishlist without deleting
-- their saved notes, guides, city visits, photos, or journey records.
-- To restore a wish later, clear its hidden flag in the management page.
update public.travel_wishlist
set is_hidden = true,
    updated_at = now()
where name in (
  '广东 · 广州',
  '新加坡',
  '印度尼西亚 · 布罗莫火山与雅加达'
)
returning name, is_hidden;
