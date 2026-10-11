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
