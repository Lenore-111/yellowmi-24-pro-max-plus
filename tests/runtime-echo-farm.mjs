import {serveBrowserHost} from './helpers/browser-host.mjs';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {createHash} from 'node:crypto';
const {chromium}=await import(process.env.WP_PLAYWRIGHT_CORE_ENTRY||'playwright');
const root=process.cwd(),prefix='/scripts/extensions/third-party/yellowmi-24-pro-max-plus/',evidence=resolve(process.env.FARM_EVIDENCE_DIR||'farm-evidence');
const manifest=JSON.parse(await readFile('manifest.json','utf8'));
const liveUrl=process.env.FARM_REAL_HOST_URL||'';
if(liveUrl&&!['127.0.0.1','localhost','[::1]'].includes(new URL(liveUrl).hostname))throw new Error('Real-host QA requires an isolated local SillyTavern instance.');
const server=liveUrl?null:createServer(async(req,res)=>{
 if(await serveBrowserHost(req,res))return;
 const path=new URL(req.url,'http://localhost').pathname;
 if(path==='/')return res.setHeader('Content-Type','text/html; charset=utf-8').end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main>农场浏览器验收</main></body></html>');
 let file;if(path.startsWith(prefix))file=resolve(root,path.slice(prefix.length));else if(process.env.WP_FONT_DIR&&path.startsWith('/test-font/'))file=resolve(process.env.WP_FONT_DIR,path.slice(11));else return res.writeHead(404).end();
 if(!file.startsWith(root+'/')&&!file.startsWith(resolve(process.env.WP_FONT_DIR||'/none')+'/'))return res.writeHead(403).end();
 try{res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.png':'image/png','.woff2':'font/woff2','.json':'application/json'})[extname(file)]||'text/plain');res.end(await readFile(file));}catch{res.writeHead(404).end();}
});
await mkdir(evidence,{recursive:true});if(server)await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:process.env.WP_CHROMIUM_EXECUTABLE||undefined,args:process.env.WP_CHROMIUM_ARGS?JSON.parse(process.env.WP_CHROMIUM_ARGS):['--no-sandbox']});
const report={checks:[],pageErrors:[],missing:[],apiRequests:[],apiRequestsScope:liveUrl?'Model generation endpoints; all host API paths are recorded separately in hostRequests':'All /api/ requests',hostRequests:[],servedFiles:[],scope:liveUrl?'Real local SillyTavern service and its extension loader':'Full extension entry with isolated host modules',passed:false};
const check=(name,value)=>{assert.ok(value,name);report.checks.push(name);console.log('通过：'+name);};
try{
 const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});page.setDefaultTimeout(10000);
 page.on('pageerror',e=>report.pageErrors.push(String(e)));page.on('response',r=>{if(r.url().includes(prefix)&&r.status()>=400)report.missing.push(r.url());});
 page.on('request',r=>{const path=new URL(r.url()).pathname;if(path.startsWith('/api/')){report.hostRequests.push(path);if(!liveUrl||/\/generate(?:$|[/?])/.test(path))report.apiRequests.push(path);}});
 if(liveUrl)await page.route('**/*',route=>new URL(route.request().url()).origin===new URL(liveUrl).origin?route.continue():route.abort());
 if(!liveUrl)await page.clock.install({time:new Date('2026-10-23T00:00:00Z')});
 const read=()=>page.evaluate(async prefix=>(await import(prefix+'src/echo-farm.js')).readFarm(),prefix);
 const click=s=>page.locator(s+':not([inert] *)').first().click();
 const action=name=>click('button[data-farm-action="'+name+'"]');
 const open=async()=>{await click('#world-phone-launcher');if(await page.locator('[data-unlock]').isVisible())await click('[data-unlock]');await click('[data-app="farm"]');await page.locator('[data-farm-plot]').first().waitFor();};
 const fonts=async()=>{const fontUrl=liveUrl?process.env.FARM_TEST_FONT_URL:process.env.WP_FONT_DIR?'/test-font/400.css':'';if(fontUrl){await page.addStyleTag({url:fontUrl});await page.addStyleTag({content:'#world-phone-stage *{font-family:"Noto Sans SC",sans-serif!important}'});await page.evaluate(()=>document.fonts.ready);}};
 const initialize=async()=>{if(liveUrl){await page.locator('#world-phone-launcher').waitFor({timeout:30000});await page.locator('.splash-screen').waitFor({state:'hidden',timeout:30000});check('酒馆自身加载扩展入口',await page.locator('script[src="'+prefix+manifest.js+'"]').count()===1&&await page.evaluate(()=>!!window.SillyTavern?.getContext));}else await page.addStyleTag({url:prefix+manifest.css});await page.evaluate(async({prefix,manifest})=>{window.extension=await import(prefix+manifest.js);},{prefix,manifest});await fonts();};
 const load=async()=>{await page.goto(liveUrl||'http://127.0.0.1:'+server.address().port+'/');await page.evaluate(()=>localStorage.setItem('world_phone_update_last_check',String(Date.now())));await initialize();};
 const isolation=()=>page.evaluate(()=>{const ctx=window.SillyTavern?.getContext?.();return JSON.stringify({world:ctx?.chatMetadata?.world_backstage_v1??null,balance:ctx?.chatMetadata?.world_phone_game_v1?.balance??null,spent:ctx?.chatMetadata?.world_phone_game_v1?.spent??null});});
 const shot=name=>page.locator('.wp-device').screenshot({path:resolve(evidence,name+'.png')});
 await load();
 if(liveUrl){
  if(process.env.FARM_REAL_HOST_CHARACTER_ID!==undefined){await page.evaluate(async id=>{await window.SillyTavern.getContext().selectCharacterById(Number(id));},process.env.FARM_REAL_HOST_CHARACTER_ID);check('实际角色聊天已打开',await page.evaluate(id=>String(window.SillyTavern.getContext().characterId)===id,process.env.FARM_REAL_HOST_CHARACTER_ID));}
  if(process.env.FARM_INSTALLED_MANIFEST){const expected=JSON.parse(await readFile(process.env.FARM_INSTALLED_MANIFEST,'utf8'));for(const path of ['manifest.json','index.js','src/world-phone.js','src/home-layout.js','src/custom-phone-themes.js','src/echo-farm.js','src/echo-farm-app.js','src/echo-farm-art.js','src/echo-farm-map-art.js','echo-farm.css']){const response=await page.request.get(new URL(prefix+path,liveUrl).href),sha=createHash('sha256').update(await response.body()).digest('hex');check('服务文件与固定候选一致：'+path,response.ok()&&sha===expected.files[path]);report.servedFiles.push({path,sha256:sha});}}
  await page.clock.install({time:new Date()});
 }
 await open();check('旧入口打开新版地图和16块田地',await page.locator('[data-farm-plot]').count()===16&&(await read()).coins===1000);
 const isolationBefore=liveUrl?await isolation():null;
 const navigationReachable=()=>page.locator('.farm-nav button').evaluateAll(buttons=>buttons.every(button=>{const r=button.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===button||button.contains(hit);}));
 check('390像素底栏按钮没有被手机手势区域遮挡',await navigationReachable());
 await shot('390-empty-map');
 const before=await read(),viewport=page.locator('.farm-map-viewport'),viewBox=await viewport.boundingBox();
 await page.mouse.move(viewBox.x+viewBox.width/2,viewBox.y+viewBox.height/2);await page.mouse.down();await page.mouse.move(viewBox.x+viewBox.width/2-105,viewBox.y+viewBox.height/2-55,{steps:9});await page.mouse.up();
 check('鼠标拖动地图不误播种',JSON.stringify(await read())===JSON.stringify(before));
 const moved=await viewport.evaluate(e=>e.scrollLeft);await action('center');check('回到田地可用',Math.abs(await viewport.evaluate(e=>e.scrollLeft)-moved)>30);
 const client=await page.context().newCDPSession(page);const vb=await viewport.boundingBox(),sx=vb.x+vb.width*.65,sy=vb.y+vb.height*.60,panBefore=await viewport.evaluate(e=>e.scrollLeft);
 await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:sx,y:sy}]});for(let i=1;i<=8;i++)await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:sx-i*12,y:sy-i*3}]});await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await page.waitForFunction(x=>Math.abs(document.querySelector('.farm-map-viewport').scrollLeft-x)>20,panBefore);check('原生触屏拖动有效且不播种',JSON.stringify(await read())===JSON.stringify(before));await action('center');
 await action('plant-all');check('一键播种保留原来的16颗种子', (await read()).plots.filter(Boolean).length===16&&(await read()).seeds.carrot===0);
 await action('shop');await page.locator('[data-farm-shop-tab="supplies"]').click();await click('[data-farm-action="buy-fertilizer"][data-farm-quantity="16"]');check('商店扣款后补充16袋肥料',(await read()).coins===680&&(await read()).fertilizer===16);
 await action('fertilize-all');await action('close-sheet');await page.clock.fastForward(6000);await page.waitForFunction(()=>[...document.querySelectorAll('[data-farm-kind="ready"]')].length===16);check('施肥和倒计时使地图作物成熟',await page.locator('[data-farm-kind="ready"]').count()===16);await shot('390-ready-map');
 await page.evaluate(()=>window.staleHarvest=document.querySelector('[data-farm-action="harvest-all"]'));await action('harvest-all');await page.evaluate(()=>window.staleHarvest.click());check('旧收获按钮不重复发钱',(await read()).coins===2280);
 await action('animals-shop');for(const kind of ['chicken','sheep','cow'])await click('[data-farm-action="buy-animal"][data-farm-kind="'+kind+'"]');await click('[data-farm-action="buy-feed"][data-farm-quantity="12"]');await shot('390-animal-shop');await action('close-sheet');await action('pasture');await action('feed-all');
 check('鸡羊牛均已到家，喂养只消耗3份饲料',(await read()).animals.length===3&&(await read()).feed===9);await shot('390-pasture');
 const animalsBefore=await read();await page.clock.fastForward(61000);await action('collect-all');check('先只收鸡蛋',(await read()).coins===animalsBefore.coins+80&&(await read()).animalStats.collected===1);
 await page.clock.fastForward(61000);await action('collect-all');check('再收羊毛牛奶，总收入不多算',(await read()).coins===animalsBefore.coins+500&&(await read()).animalStats.collected===3);
 if(liveUrl)check('种植养殖不改世界记录或手机钱包',await isolation()===isolationBefore);
 await action('field');await action('zoom-out');const camera=await viewport.evaluate(e=>({x:(e.scrollLeft+e.clientWidth/2)/Number(e.querySelector('.farm-world').style.transform.match(/[\d.]+/)[0]),z:e.querySelector('.farm-world').style.transform}));await action('zoom-in');
 const centered=await viewport.evaluate(e=>(e.scrollLeft+e.clientWidth/2)/Number(e.querySelector('.farm-world').style.transform.match(/[\d.]+/)[0]));check('缩放保留地图中心',Math.abs(camera.x-centered)<2);
 await action('shop');await page.locator('[data-farm-shop-tab="seeds"]').click();await click('[data-farm-action="buy-seed"][data-farm-crop="pumpkin"][data-farm-quantity="16"]');await click('[data-farm-action="choose-seed"][data-farm-crop="pumpkin"]');await action('plant-all');
 await page.setViewportSize({width:320,height:700});await action('center');check('320像素根界面无横向溢出',await page.locator('.echo-farm-app').evaluate(e=>e.scrollWidth<=e.clientWidth+1));check('320像素底栏按钮没有被手机手势区域遮挡',await navigationReachable());await shot('320-growing-map');
 await action('shop');check('商店关闭按钮可见',await page.getByRole('button',{name:'关闭商店',exact:true}).isVisible());await page.keyboard.press('Escape');check('Esc可退出商店且不会同时关闭手机',await page.getByRole('dialog').count()===0&&await page.locator('#world-phone-stage').evaluate(e=>e.classList.contains('is-open')));
 await page.evaluate(()=>window.stalePlant=document.querySelector('[data-farm-action="plant-all"]'));await action('back');const leaving=await read();await page.evaluate(()=>window.stalePlant.click());check('离开农场后旧控件不写存档',JSON.stringify(await read())===JSON.stringify(leaving));
 await page.clock.fastForward(151000);await click('[data-app="farm"]');check('离线生长恢复16块成熟南瓜',await page.locator('[data-farm-kind="ready"]').count()===16);await action('harvest-all');
 await action('back');await click('[data-app="settings"]');await click('[data-game-mode="world"]');await click('[data-app-back]');await click('[data-app="farm"]');check('切换手机模式仍使用同一农场存档',(await read()).stats.harvested===32);
 const stored=await page.evaluate(()=>localStorage.getItem('echo_farm_v1'));await page.reload();await initialize();await open();
 check('整页刷新恢复金币、动物和旧农田进度',await page.evaluate(()=>localStorage.getItem('echo_farm_v1'))===stored&&(await read()).animals.length===3);
 await action('shop');await page.locator('[data-farm-shop-tab="supplies"]').click();await click('[data-farm-action="buy-feed"][data-farm-quantity="1"]');await action('close-sheet');await action('pasture');await action('feed-all');
 const persisted=await read();await page.evaluate(()=>{const original=Storage.prototype.setItem;window.restoreFarmStorage=()=>Storage.prototype.setItem=original;Storage.prototype.setItem=function(k,v){if(k==='echo_farm_v1')throw Error('测试保存失败');return original.call(this,k,v);};});
 await page.clock.fastForward(121000);await action('collect-all');check('保存失败提示错误并保留原账目',await page.locator('.echo-farm-app [role="status"]').textContent().then(t=>t.includes('测试保存失败'))&&JSON.stringify(await read())===JSON.stringify(persisted));await page.evaluate(()=>window.restoreFarmStorage());await action('collect-all');
 await action('shop');await page.locator('[data-farm-shop-tab="seeds"]').click();await click('[data-farm-action="buy-seed"][data-farm-crop="corn"][data-farm-quantity="16"]');await click('[data-farm-action="choose-seed"][data-farm-crop="corn"]');await action('plant-all');await page.clock.fastForward(62000);await action('field');await page.setViewportSize({width:390,height:844});await action('center');await shot('390-farm-overview');
 check('没有页面脚本错误或丢失资源',!report.pageErrors.length&&!report.missing.length);check(liveUrl?'没有发起模型生成请求':'全部农场操作未调用模型或世界API',!report.apiRequests.length);
 await page.evaluate(async()=>window.extension.onDeactivate());check('停用扩展清理手机入口',await page.locator('#world-phone-launcher').count()===0);report.passed=true;
}catch(error){report.failure=String(error.stack);console.error(report.failure);process.exitCode=1;}finally{await browser.close();if(server)await new Promise(r=>server.close(r));await writeFile(resolve(evidence,'report.json'),JSON.stringify(report,null,2));}
