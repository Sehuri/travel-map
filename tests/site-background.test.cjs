const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {BACKGROUNDS,selectBackground}=require('../assets/site-background.js');

test('entry background selection has four equal random ranges and valid local photographs',()=>{
  assert.deepEqual(BACKGROUNDS.map(x=>x.id),['osaka','bromo','changi','merlion']);
  [0,.25,.5,.75].forEach((value,index)=>{
    assert.equal(selectBackground(()=>value).id,BACKGROUNDS[index].id);
    assert.equal(selectBackground(()=>value+.249999).id,BACKGROUNDS[index].id);
  });
  assert.equal(selectBackground(()=>NaN).id,'osaka');
  BACKGROUNDS.forEach(bg=>{
    const image=fs.readFileSync(`assets/${bg.file}`);
    assert.equal(image.readUInt16BE(0),0xffd8);
    assert(image.length<1500000,'web background should not require a large original image');
    assert(bg.label && bg.desktopPosition && bg.mobilePosition);
    if(bg.id!=='osaka')assert(!image.includes(Buffer.from('Exif\0\0')),'new public assets should not retain private EXIF metadata');
  });
});

test('home copy no longer ends at the old Jiangnan visit; shared backgrounds initialize before styles',()=>{
  const home=fs.readFileSync('index.html','utf8');
  assert(!home.includes('到江南初夏的水乡古城'));
  assert(home.includes('到火山云海与异国街巷'));
  assert(home.includes('data-background-caption'));
  for(const filename of ['index.html','discover.html']){
    const page=fs.readFileSync(filename,'utf8');
    assert(page.indexOf('site-background.js')<page.indexOf('assets/styles.css'));
  }
  const script=fs.readFileSync('assets/site-background.js','utf8');
  assert(!script.includes('setInterval'));
  assert(!script.includes('localStorage'));
});

test('shared pages render one viewport-fixed photo instead of body and section backgrounds',()=>{
  for(const filename of ['index.html','discover.html']){
    const page=fs.readFileSync(filename,'utf8');
    assert.match(page,/<body class="[^"]*has-site-background[^"]*">/);
    assert.equal((page.match(/class="site-background"/g)||[]).length,1);
    assert.match(page,/<div class="site-background" aria-hidden="true"><\/div>/);
  }
  const styles=fs.readFileSync('assets/styles.css','utf8');
  assert.match(styles,/body\.has-site-background\s*\{\s*isolation:\s*isolate;/);
  assert.match(styles,/\.site-background\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;[^}]*background-image:\s*var\(--site-background-image\)/);
  assert.equal((styles.match(/background(?:-image)?:[^;]*var\(--site-background-image\)/g)||[]).length,1);
  assert(!styles.includes('.hero::before'));
  assert(!styles.includes('background-attachment: scroll'));
});
