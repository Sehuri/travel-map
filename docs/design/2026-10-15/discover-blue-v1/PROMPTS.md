# 随机旅行页：完整图像生成提示词

生成方式：内置图像生成工具，三次独立生成。一套白蓝风格，三个连续交互状态；不是三个互斥视觉方向。

## 填写条件

```text
Use case: ui-mockup. Direction name: Blue Discover — Travel Conditions.
Create realistic production-quality Chinese UI with clear hierarchy, accurate legible typography, purposeful spacing and restrained components. Output ONE desktop web page screenshot, target1440 x1024px, page content only, no browser chrome, no explanatory arrows outside interface, no multi-screen board.
Current date anchor:2026-10-15 Asia/Shanghai; month shown is10月. This is the SAME travel-map product as attached style reference, not a new brand.
INPUT ROLES: Image1 is user's CURRENT discover/random-travel page: keep existing product functionality, NOT its dark photo wallpaper, lime yellow, enormous serif title or milky-glass giant card shells. Image2 is the USER-SELECTED blue/white homepage prototype: this is the precise visual language to match—white, extremely pale cool blue, cobalt actions, clean Chinese sans-serif, dark slate type, lightweight components. Image3 is a fresh browser capture of current discover page verifying form and city catalogue status; treat as content/flow reference only.

Create the initial READY TO DRAW state for "下一站去哪", same five-link product nav. Header64px white: blue S circle logo + "SEHURI 旅行足迹"; navigation "地图 旅程 影像 数据 下一站", last active blue underline, small "返回地图 →" right. Do not add account-dependent features.
Small intro band pale blue #F5F8FC, ~150px high: tiny blue kicker "LET CURIOSITY CHOOSE", modern sans title "下一站，交给一点意外。" not huge, subtext "告诉我从哪里出发，准备玩几天。先看三个方向，再决定去哪。" All UI clean sans-serif (15–16px body); no serif. Maybe a tiny line paper-plane icon, NOT big artwork/photo.

Below intro, max content1280px with64px gutters. Simple process line "填写条件 — 比较候选 — 探索目的地", first active blue, others gray. This is progress context, not fake click navigation if destination not yet selected.
One compact inline status row with green dot "城市目录已连接 · 719 座城市" and quiet "覆盖说明" disclosure. Do not claim all-China completeness: disclosure text can say "以实际目录为准，台湾目录暂未覆盖". Status should not occupy a giant banner.

MAIN: OPEN form area left ~840px and a single modest light-blue summary aside right~300px. No outer card enclosing whole page, no nested cards, no bento tile dashboard.
Left heading "这次，想怎么出发？". Keep existing fields exactly but organize:
row1 "从哪里出发" searchable city combobox, value "江苏省 · 南京市", and "游玩天数" minus/3/plus stepper with helper "1–14 天，不含往返交通".
row2 three compact labeled selects: "探索范围" value"按天数建议", "出行月份" value"10 月", "人均总预算" value"预算不限". Budget helper "含往返交通与住宿餐饮，启发估算".
Then "想遇见什么" section, inline counter"已选 2/3" and helper"最多选3项，任一匹配；不选则随缘". Seven clean compact pill toggle chips with understated line icons: "山水自然" and"历史人文" selected pale blue+blue border+check, unselected"美食寻味 城市漫步 海滨度假 亲子休闲 徒步登山". Wrap naturally into two rows, no illustrations.
Light divider, small expanded accordion "更多条件": two selects "目的地省份 / 全部省份" and "旅行节奏 / 适中 · 每天最多2个重点"; below checked checkbox "排除已经去过的城市" and small "当前排除48座" snapshot. Present as normal fields on white, not enclosed dark panel.
Right summary aside subtle #F3F7FE tint radius16px: title"这次的出发计划", large but balanced "南京出发 · 3天", clean short summary rows "10月出行 / 距离按天数建议 / 预算不限", two small selected-interest tags. Bottom fullwidth PRIMARY blue button "给我 3 个候选 →" height48px. Helper below "先筛选距离与预算，再核验候选交通". No instant-booking or exact availability promises.
At page bottom small neutral source note: "交通时间与预算均为规划参考，请在出发前核验；季节提示不等于天气预报。" Text must remain readable.
Palette exact intent white#FFFFFF / gray-blue#F5F8FC / primary#3268E8 / ink#233244 / secondary#65758C. Lightweight input borders#DCE4EF, radius10px controls, small blue focus state. Use spacing and alignment before borders; restrained shadow ONLY selected popover if any. Touch controls44px minimum. No dark large component containers, no wallpaper, no neon, no fake accuracy, no added weather/hotel/booking/AI-chat features. Focused single form state, unclipped at natural proportions.
```

## 候选比较

```text
Use case: ui-mockup. Direction name: Blue Discover — Three Candidates.
Create realistic production-quality Chinese UI with crisp typography, clear comparison hierarchy and purposeful spacing. ONE desktop page screenshot1440x1024px, not a storyboard, no browser chrome, no device frame, no design labels outside UI.
Current date2026-10-15 Asia/Shanghai. This is the SECOND STATE of the SAME blue-white random travel flow, NOT a competing theme.
INPUT ROLES: Image1 user's current dark Discover page for product identity/content only, explicitly replace photo wallpaper, lime and huge serif type. Image2 user-selected blue/white homepage is the visual system to match. Image3 actual browser screenshot of CURRENT three-candidate result is evidence of existing fields/data. Image4 previously generated BLUE conditions screen from this same flow, match its header, step progress, spacing and typography closely.

USE TRUE CAPTURED SNAPSHOT VALUES, display as REFERENCE ESTIMATES not guaranteed journeys. Origin南京市,3游玩天数,10月,预算不限,按天数建议,排除已去过城市. These are prototype snapshots; do not add train numbers or live price guarantees.
Candidates:
青州市 / 山东省·潍坊市·青州市 / 直线距离515km / 高铁动车约3小时1分·估算 / 驾车约7小时43分·估算 / 人均预算参考¥1,200–2,600.
丽水市 / 浙江省·丽水市 / 直线距离414km / 高铁动车约2小时36分·估算 / 驾车约6小时15分·估算 / 人均预算参考¥1,100–2,500.
宁乡市 / 湖南省·长沙市·宁乡市 / 直线距离733km / 高铁动车约3小时54分·估算 / 驾车约10小时51分·估算 / 人均预算参考¥1,400–2,900.
All three season message "10月·很合拍", helper "春秋通常适合城市与户外组合", no fabricated model confidence % or ranking.
All routes have fallback estimate note "路线接口暂不可用，当前按距离估算". No fake precise official fare.

LAYOUT: Same64px white navbar: blue S,"SEHURI 旅行足迹", nav"地图 旅程 影像 数据 下一站" last active underline; quiet"返回地图 →" right.
Same pale cool-blue hero strip but shorter~110px: small "LET CURIOSITY CHOOSE", headline"下一站，交给一点意外。" at32px, small supportingcopy. No wallpaper, no big decorative illustration.
Below max1280px with64px gutters: process line"填写条件 — 比较候选 — 探索目的地", first completed blue check, second active blue circle, third neutral gray.
Compact summary row under process: "南京出发 · 3天 · 10月 · 预算不限" and two small outlined links at right"修改条件" and"换一组 ↻". If interest tags visible use "山水自然 / 历史人文" as consistent illustrative preference selection. Tiny text"按距离与预算筛选，已准备好3个候选".
Main heading"三个方向，哪一个让你心动？" with small subline"先比较交通与预算，再展开目的地资源".
THREE EQUAL WHITE INDEPENDENT CITY COLUMNS, not big gray metric-card mosaics. Each is standalone candidate object with very subtle1pxborder#DFE7F1 andradius16px, generous24pxpadding; NO nested boxes for metrics, use aligned definition rows separated by hairlines. At top smallblue"候选01/02/03", large cleansas name28px, provincial affiliation below. Small pale-blue season pill, then consistent rows in exact same order:
"直线距离", "高铁/动车", "驾车", "人均预算参考". Labels muted14px, values dark16px; budget blue20px. Estimates shown with visible muted label "估算" next to transport, not hidden in tooltip. Under rows short seasonnote.
At bottom allcards aligned blue fullwidth button"查看这个目的地 →". None singled out as recommended because no ranking logic. Avoid photos entirely: current candidate data has no guaranteed photo field; allow cityname/region to carry design. No fake landmarks, illustrations or asset dependency.
After columns, one short pale-blue information strip with info icon and note "交通暂按距离估算；季节提示不等于天气预报。出发前请核验实际班次、路况与价格。" Quiettext link"数据说明". Not a giant warning block.
Small bottomsecondary"换一组候选，不改变当前条件" with simple circular refresh icon, no giant extra CTA. Do not add save-to-wishlist on comparison if existing save only after selection.
Palette#FFFFFF,#F5F8FC,#3268E8,#233244,#65758C; Chinese sans-serif only, body15–16px. Maintain open white canvas, calm blue actions, lightweight borders and natural proportions. No dark card shells/no neon/no glass/no cards inside cards/no sidebar full of extraneous stats/no booking. Focus on comparing these three existing candidates, no clipped text.
```

## 目的地与攻略

```text
Use case: ui-mockup. Direction name: Blue Discover — Destination And Daily Draft.
Create realistic production-quality Chinese UI, ONE focused desktop web page screenshot target1440x1024px, app content only, no browser chrome, no storyboard/no multiple devices. This is THIRD interaction state of the SAME flow, not an alternative brand or layout family.
Current date2026-10-15 Asia/Shanghai. Selected month10月. Existing candidate selected:丽水市,浙江省. Origin南京市,3游玩天数,10月. Route estimates from captured existing app:直线414km,高铁/动车2小时36分·估算,驾车6小时15分·估算,人均预算参考¥1,100–2,500. All are references not guarantees.
INPUT ROLES: Image1 is USER-SELECTED blue-white homepage visual reference, match palette/clean sans. Image2 is actual current destination screenshot, content source only, NOT its giant translucent green card or serif typography. Image3 is actual current generated itinerary screenshot, content/behavior evidence. Image4 is newly designed conditions screen of same flow; use identical header/control language. Image5 is user's original current Discover screenshot, retain identity while replacing dark wallpaper and lime.
Palette#FFFFFF,#F5F8FC,#3268E8,#233244,#65758C. Mostly white, contemporary Chinese sans-serif throughout, body15–16px. No photo wallpaper, no dark shells, no serif, no glass, no neon, no cards inside cards. Open canvas with spacing/hairlines; modest border only map and independent panel.

LAYOUT:64px white header, blue S,"SEHURI 旅行足迹", links"地图 旅程 影像 数据 下一站" last active blue underline; quiet"返回地图 →". Small compact light-blue title strip"下一站，交给一点意外。" with tiny "LET CURIOSITY CHOOSE", no giant repeated hero. Below same process indicator"填写条件 — 比较候选 — 探索目的地", firsttwo completed bluechecks, third active.
Content max1280px64pxgutters. Top breadcrumb-like link"← 返回候选", beside small summary"南京出发 · 3天 · 10月". Main destination header: left muted"浙江省", boldsans"丽水市"36px, short honest intro"从山水与古村开始，按片区慢慢探索。" Right ONE primaryblue button"保存到愿望清单" and quiet outline"复制旅行灵感". No instantbooking, flightsales, ratings invented or destinationcoverphoto dependency.
Open metrics strip below,4 compact inline groups separated by thin verticalrules, NOT separate cards:"直线距离414km" / "高铁动车2小时36分·估算" / "驾车6小时15分·估算" / "人均预算参考¥1,100–2,500". Include small visible status"交通暂按距离估算" so never misleading verified-data claim.

MAIN strong relationship: left MAP ~830px wide and410pxhigh, right DAILY PLAN ~360px wide, top aligned. Section heading row "把灵感排成旅程" with light small mode tabs"资源总览 / 每日攻略", second selected blue. These group existing resource and itinerary capabilities; don't imply new itinerary backend.
At map top small active context"正在查看：第1天 · 3个点位" and legend"景点 / 用餐候选". MAP show light realmap-looking local缙云/仙都 area within丽水, correct nearby sense, white land/palegreen parks/blue streams. EXACTLY3 selected-day pins: "01 缙云仙都景区", "11 缙云烧饼总部", "10 朱潭山", sightpinsgreen andfoodpinmutedorange, visually labeled, thin blue dashed line connecting order01→11→10. Line is visiting order, NOT navigationroad; no road-travel-time claims. Quiet whitezoomcontrols, source attribution area remains atbottom. No fabricated other points/day routes visible. Avoid imaginary map boundaries.
Right open itinerary panel: heading"3天攻略草案", small quiet link"重新生成". Segmented daytabs"全部 / 第1天 / 第2天 / 第3天", firstday active. Day1 list is vertical numbered timeline, NO timestamps, NO fake transit duration:
"景点01 · 缙云仙都景区"
"用餐候选11 · 缙云烧饼总部"
"景点10 · 朱潭山"
Small undertext"点位间直线合计约2.3公里，非实际交通里程". Outline button"复制每日攻略". Small anchor"浏览全部资源 →" nearbottom. No nested itinerarycard perstop.
Below columns one low-height visible note with infoicon: "按已收录点位与直线距离生成草案；未核验开放、预约和用餐时段。连线仅表示游览顺序，不是导航道路。". Typography readable, no giant yellowalert.
At bottom quiet row "继续探索" with secondary buttons"修改条件" and"换一组候选 ↻". Do not present save as already done; no external user data mutation implied.
Maintain unifiedblue controls and airy hierarchy. Focus on chosen destination and actionable draft, let20-item resource list exist belowfold instead of cramming. Show precise labels with readableChinese and generous padding. Natural page proportions, nothing clipped.
```

