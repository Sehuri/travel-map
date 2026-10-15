const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('discover.html','utf8');
const css=fs.readFileSync('assets/discover.css','utf8');

test('discover uses the chosen scoped white-blue theme and existing icon assets without wallpaper or framework migration',()=>{
  assert(!html.includes('site-background.js'));
  assert(!html.includes('has-site-background'));
  assert(!html.includes('editorial.css'),'do not load homepage-only rules into discovery');
  assert(css.includes('--accent:#3268e8'));
  assert(css.includes('--ink:#233244'));
  assert(css.includes('--display:var(--sans)'));
  assert(css.includes('vendor/heroicons/'));
  assert(!css.includes('linear-gradient'));
  assert(!css.includes('backdrop-filter:blur'));
  for(const id of ['origin','days','radius','month','budget','province','pace','exclude-visited','interests','comparison','result','resource-map','places','generate-itinerary','save-wishlist','copy-result','copy-itinerary']){
    assert.equal((html.match(new RegExp(`id="${id}"`,'g'))||[]).length,1,`${id}: preserve one live binding`);
  }
});

test('discover keeps semantic navigation, collapsible extra conditions, feedback and copy fallback',()=>{
  for(const id of ['conditions-view','previous-results','back-candidates','restore-comparison','summary-main','summary-tags','interest-status','origin-error','days-error','retry-map','copy-fallback'])assert(html.includes(`id="${id}"`));
  assert(html.includes('class="more-conditions"'));
  assert(html.includes('aria-describedby="days-help days-error"'));
  assert(html.includes('aria-live="polite"'));
  assert(html.includes('未核验开放、预约、交通和用餐时段'));
  assert(html.includes('rel="noopener noreferrer"'));
  assert(css.includes('prefers-reduced-motion:reduce'));
  assert(css.includes('min-height:44px'));
});
