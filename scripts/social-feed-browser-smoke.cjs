// Run with a local Chromium executable and Playwright; model/world APIs are fixtures.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES || '../node_modules', 'playwright'));
const root = path.resolve(__dirname, '../..');
const out = process.env.BROWSER_SMOKE_OUTPUT || path.join(__dirname, '../docs/validation/social-reader-2026-10-17');
fs.mkdirSync(out, { recursive: true });
const server = http.createServer((req,res) => {
 const u = new URL(req.url,'http://localhost');
 const stubs={'/script.js':'/yellowmi/tests/helpers/tavern-host.mjs','/scripts/group-chats.js':'/yellowmi/tests/helpers/group-host.mjs','/scripts/world-info.js':'/yellowmi/tests/helpers/world-info-host.mjs'};
 if(u.pathname.startsWith('/qa-fonts/') && process.env.QA_FONT_ROOT){
  const file=path.resolve(process.env.QA_FONT_ROOT,u.pathname.slice('/qa-fonts/'.length));
  if(!file.startsWith(path.resolve(process.env.QA_FONT_ROOT)+path.sep)||!fs.existsSync(file)){res.statusCode=404;res.end();return;}
  res.setHeader('content-type',file.endsWith('.css')?'text/css':file.endsWith('.woff2')?'font/woff2':'font/woff');res.end(fs.readFileSync(file));return;
 }
 if(u.pathname.startsWith('/api/')){res.setHeader('content-type','application/json');res.end(JSON.stringify({isUpToDate:true,files:[]}));return;}
 if(u.pathname==='/'){res.setHeader('content-type','text/html');res.end(('<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/yellowmi/world-phone.css"><link rel="stylesheet" href="/qa-fonts/400.css"><style>*{font-family:"Noto Sans SC",system-ui,sans-serif!important}</style></head><body></body></html>').replace(process.env.QA_FONT_ROOT ? '__no_font_replacement__' : '<link rel="stylesheet" href="/qa-fonts/400.css">',''));return;}
 const file=path.resolve(root,'.'+(stubs[u.pathname] || u.pathname));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.statusCode=404;res.end();return;}
 res.setHeader('content-type',/\.(mjs|js)$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'text/plain');res.end(fs.readFileSync(file));
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH || undefined,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']});
 try{
 for(const viewport of [{width:390,height:844},{width:768,height:1024},{width:1280,height:900}]){
 const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.evaluate(async()=>{
  const actions=['social-open-direct','social-create-group','social-respond-friend','social-comment-moment','social-send-message','social-read-conversation','social-set-moment-like'];
  window.ctx={name1:'玲',characterId:0,characters:[{name:'阿青',avatar:'a.png'}],chatId:'smoke',chat:[],chatMetadata:{world_backstage_v1:{currentState:{}}},saveMetadataDebounced(){}};
  window.SillyTavern={getContext:()=>ctx};window.counts={sandbox:0,refresh:0};window.sandbox={};
  window.surface={bridgeVersion:2,capabilities:actions,connected:true,branchKey:'branch-a',worldName:'夜市小镇',clock:{absoluteMinute:660},people:[{id:'p1',name:'阿青'}],events:[],social:{moments:[{id:'m1',personId:'p1',visibility:'friends',text:'今天去河边散步。',worldMinute:600}]},publicOpinion:{news:[],forums:Array.from({length:10},(_,i)=>({id:'f'+i,title:i%2?'周末公园散步':'街角咖啡探店',summary:`第 ${i+1} 条生活记录。沿着青石路慢慢走，小店刚开门，空气里都是新鲜面包的香味。`,board:'小镇生活',heat:1+i%3,worldMinute:600-i,publishedWorldMinute:600-i,replies:[{author:'路过的小猫',text:'下次也去看看。'}]}))}};
  window.worldBackstageHost={phoneBridgeVersion:2,phoneAction(){},getPhoneSurface:()=>structuredClone(surface),getPublicSurface:()=>({sandbox}),async refreshPublicOpinion(){counts.refresh++;if(window.failNext){window.failNext=false;throw Error('接口暂时不可用，请稍后重试');}surface.publicOpinion.generatedAt=new Date().toISOString();},async generatePublicOpinionSandbox(){counts.sandbox++;sandbox={generatedAt:new Date().toISOString(),news:[{headline:'夜市新开咖啡摊',summary:'路过可以喝杯咖啡',category:'生活'}],forums:[]};}};
  await import('/world-backstage/phone-feed-host.js');
  const {setPhoneGameMode}=await import('/yellowmi/src/phone-game.js?v=0.3.0-alpha.28');setPhoneGameMode('world');
  window.extension=await import('/yellowmi/index.js');
 });
 await page.locator('#world-phone-launcher').click();
 await page.locator('[data-unlock]').click();
 await page.locator('.wp-home [data-app="settings"]').click();
 const toggle=page.getByRole('switch',{name:'自动同步世界动态'});await toggle.waitFor();
 assert.equal(await toggle.getAttribute('aria-checked'),'true');
 assert.equal(await page.locator('[data-connection-details]').getAttribute('open'),null);
 await page.waitForTimeout(300);await page.evaluate(()=>document.fonts.ready);
 await page.screenshot({path:path.join(out,`settings-${viewport.width}.png`)});
 await page.locator('[data-connection-details] summary').click();
 await page.evaluate(()=>dispatchEvent(new CustomEvent('world-backstage:phone-update')));
 await page.waitForTimeout(300);assert.equal(await page.locator('[data-connection-details]').evaluate(e=>e.open),true);
 await page.locator('[data-app-back]').click();await page.locator('.wp-home [data-app="weibo"]').click();
 await page.locator('.wp-wb-feed').waitFor();await page.waitForFunction(()=>document.querySelector('[data-feed-status-label]')?.textContent==='已同步');
 await page.locator('.wp-wb-feed').evaluate(e=>e.scrollTop=250);
 const input=page.locator('[data-social-search] input');await input.fill('输入中的草稿');await input.focus();
 await page.evaluate(()=>{window.originalInput=document.querySelector('[data-social-search] input');window.originalTop=document.querySelector('.wp-wb-feed').scrollTop;surface.publicOpinion.forums.unshift({id:'fresh',title:'河边有了新咖啡摊',summary:'刚刚看到的新内容。',board:'生活',worldMinute:660});dispatchEvent(new CustomEvent('world-backstage:phone-update'));});
 await page.locator('[data-social-incoming]').waitFor();
 assert.equal(await page.evaluate(()=>originalInput===document.querySelector('[data-social-search] input')),true);
 assert.equal(await input.inputValue(),'输入中的草稿');assert.equal(await page.locator('.wp-wb-feed').evaluate(e=>e.scrollTop),await page.evaluate(()=>originalTop));
 await page.evaluate(()=>document.fonts.ready);
 await page.screenshot({path:path.join(out,`weibo-incoming-${viewport.width}.png`)});
 await input.fill('');await page.locator('[data-social-incoming]').click();await page.getByText('河边有了新咖啡摊',{exact:true}).waitFor();
 await page.locator('[data-social-detail="forum:f0"]').first().click();
 await page.evaluate(()=>{surface.publicOpinion.forums.find(f=>f.id==='f0').replies.push({author:'阿青',text:'新补的一条讨论。'});dispatchEvent(new CustomEvent('world-backstage:phone-update'));});
 await page.locator('[data-social-incoming]').waitFor();assert.equal(await page.getByText('新补的一条讨论。',{exact:true}).count(),0);
 await page.locator('[data-social-incoming]').click();await page.getByText('新补的一条讨论。',{exact:true}).waitFor();
 await page.evaluate(()=>window.failNext=true);await page.locator('[data-social-opinion-refresh]').click();
 await page.locator('[data-phone-feed-retry]:visible').waitFor();assert.match(await page.locator('[data-feed-status-message]').textContent(),/接口暂时不可用/);
 await page.evaluate(()=>document.fonts.ready);
 assert.equal(await page.locator('[data-social-opinion-refresh]').textContent(),'刷新动态');
 await page.screenshot({path:path.join(out,`weibo-retry-${viewport.width}.png`)});
 await page.locator('[data-phone-feed-retry]').click();await page.waitForFunction(()=>document.querySelector('[data-feed-status-label]')?.textContent==='已同步');
 await page.locator('[data-app-back]').click();await page.locator('.wp-home [data-app="rednote"]').click();await page.locator('.wp-rn-grid').waitFor();await page.waitForFunction(()=>document.querySelector('[data-feed-status-label]')?.textContent==='已同步');await page.waitForTimeout(160);
 await page.locator('[data-note-category="food"]').click();assert.equal(await page.locator('.wp-rn-grid').getByText('周末公园散步',{exact:true}).count(),0);
 await page.evaluate(()=>document.fonts.ready);
 await page.screenshot({path:path.join(out,`rednote-food-${viewport.width}.png`)});
 const metrics=await page.evaluate(()=>{const stage=document.querySelector('#world-phone-stage'),grid=document.querySelector('.wp-rn-grid');return {screenWidth:innerWidth,stageWidth:stage.getBoundingClientRect().width,gridWidth:grid.clientWidth,gridScrollWidth:grid.scrollWidth,documentScrollWidth:document.documentElement.scrollWidth};});
 assert.ok(metrics.gridScrollWidth<=metrics.gridWidth+1,JSON.stringify(metrics));assert.ok(metrics.documentScrollWidth<=viewport.width+1,JSON.stringify(metrics));
 assert.deepEqual(errors,[]);
 const result={viewport,counts:await page.evaluate(()=>counts),metrics,pageErrors:errors,passed:true,browser:browser.version(),scope:'Full phone extension in Chromium with fixture world/model APIs; not real SillyTavern or physical Android'};
 fs.writeFileSync(path.join(out,`report-${viewport.width}.json`),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 await page.evaluate(()=>extension.onDeactivate());await page.close();
 }
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
