import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { imageApiBase, readPhoneImageSettings, savePhoneImageSettings, hasPhoneImageKey, forgetPhoneImageKey, listPhoneImageModels, generatePhoneImage } from '../src/phone-image-provider.js';
import { capturePhoneGameScope, readPhoneGameState, applyPhoneGamePosts, attachPhoneGameImage, setPhoneGameMode, normalizePhoneGameState, queuePhoneGameInteraction } from '../src/phone-game.js';
import { generatePhonePostImage, phonePostImageStatus } from '../src/phone-post-images.js';
import { buildPhoneGamePrompt } from '../src/phone-game-ai.js';
import { imageZip } from './helpers/image-zip.mjs';
import { readNovelImageZip, MAX_PHONE_IMAGE_BYTES } from '../src/phone-image-novelai.js';

const png = await readFile(new URL('../assets/echo-phone-icon.png', import.meta.url));
const reply = value => new Response(JSON.stringify(value), {headers:{'Content-Type':'application/json'}});
const imageResponse = () => reply({data:[{b64_json:png.toString('base64')}]});
function fixture(t) {
  const storage = new Map(), handlers = new Map();
  const ctx = { characterId:0, characters:[{avatar:'image-qa.png', name:'配图测试', description:'成年人物，黑色短发'}], name1:'玩家', chatId:crypto.randomUUID(), chatMetadata:{}, extensionSettings:{},
    saveMetadataDebounced(){}, saveSettingsDebounced(){}, getRequestHeaders:()=>({'Content-Type':'application/json','X-CSRF-Token':'fixture'}),
    eventTypes:{CHAT_CHANGED:'chat'}, eventSource:{on:(name,fn)=>handlers.set(name,fn),off:name=>handlers.delete(name),emit:name=>handlers.get(name)?.()} };
  t.mock.method(globalThis, 'fetch');
  const previous = {SillyTavern:globalThis.SillyTavern,localStorage:globalThis.localStorage,FileReader:globalThis.FileReader};
  globalThis.SillyTavern = {getContext:()=>ctx};
  globalThis.localStorage = {getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
  globalThis.FileReader = class { async readAsDataURL(blob) { this.result = 'data:' + blob.type + ';base64,' + Buffer.from(await blob.arrayBuffer()).toString('base64'); this.onload(); } };
  t.after(()=>{for(const [key,value] of Object.entries(previous)) {if(value===undefined) delete globalThis[key];else globalThis[key]=value;}});
  const config = (values={}) => savePhoneImageSettings({baseUrl:'https://image.example/v1',model:'my-image-model',apiKey:'fixture-key',...values});
  function post() { const state=readPhoneGameState(); return applyPhoneGamePosts('weibo',[{actorId:state.actors[0].id,text:'窗边咖啡'}]).posts.at(-1); }
  return {ctx,storage,config,post};
}

test('生图设置不含密钥；换站点和换账号不携带旧凭据；清除密钥即时生效',async t=>{
  const f=fixture(t); f.config({rememberKey:true});
  assert.ok(hasPhoneImageKey()); assert.ok([...f.storage.values()].includes('fixture-key'));
  assert.ok(!JSON.stringify(f.ctx.extensionSettings).includes('fixture-key'));
  assert.ok(!JSON.stringify(f.ctx.chatMetadata).includes('fixture-key'));
  f.config({baseUrl:'https://other.example/v1',apiKey:''}); assert.equal(hasPhoneImageKey(),false); assert.equal(f.storage.size,0);
  f.config({rememberKey:true}); const old=f.ctx.extensionSettings;
  f.ctx.extensionSettings={}; assert.equal(hasPhoneImageKey(),false);
  f.ctx.extensionSettings=old; assert.ok(hasPhoneImageKey()); forgetPhoneImageKey();assert.equal(hasPhoneImageKey(),false);assert.equal(f.storage.size,0);
  assert.equal(imageApiBase('https://image.example/v1/images/generations/'),'https://image.example/v1');
  assert.throws(()=>imageApiBase('https://image.example/v1?key=secret'));
});
test('模型列表来自用户站点；生图使用所选模型、单张请求，不借用正文密钥',async t=>{
  const f=fixture(t); f.config({size:'1024x1024'}); const requests=[];
  globalThis.fetch=(url,options)=>{requests.push({url,options});return Promise.resolve(url.endsWith('/models')?reply({data:[{id:'custom-A'},{id:'custom-B'},{id:'custom-A'}]}):imageResponse());};
  assert.deepEqual(await listPhoneImageModels(),['custom-A','custom-B']);
  const blob=await generatePhoneImage('一杯热咖啡');assert.equal(blob.type,'image/png');assert.equal(blob.size,png.length);
  assert.equal(requests[0].url,'https://image.example/v1/models');assert.equal(requests[0].options.headers.Authorization,'Bearer fixture-key');
  assert.deepEqual(JSON.parse(requests[1].options.body),{model:'my-image-model',prompt:'一杯热咖啡',n:1,size:'1024x1024'});
  assert.equal(requests[1].options.credentials,'omit');assert.equal(requests[1].options.redirect,'error');
});
test('未配置生图时不额外生成配图提示词，文字模型不读取已保存图片和长提示词',t=>{
  const f=fixture(t);const post=f.post();
  assert.ok(!buildPhoneGamePrompt(readPhoneGameState(),{platform:'weibo'}).includes('imagePrompt'));
  f.config();attachPhoneGameImage(post.id,'user/files/world-phone-image-prompt.png','不应发给文字模型的长描述');
  const prompt=buildPhoneGamePrompt(readPhoneGameState(),{platform:'weibo'});
  assert.ok(prompt.includes('imagePrompt'));assert.ok(!prompt.includes('不应发给文字模型的长描述'));assert.ok(!prompt.includes('world-phone-image-prompt.png'));assert.ok(!prompt.includes('fixture-key'));
  const {eventId}=queuePhoneGameInteraction({kind:'comment',actorId:post.actorId,postId:post.id,text:'好看'});
  const comment=buildPhoneGamePrompt(readPhoneGameState(),{eventId});assert.ok(!comment.includes('不应发给文字模型的长描述'));assert.ok(!comment.includes('world-phone-image-prompt.png'));
});
test('URL 图片先下载，下载请求不携带站点密钥；酒馆代理只使用用户选定的目的站点',async t=>{
  const f=fixture(t);f.config({transport:'proxy'});const calls=[];
  globalThis.fetch=async(url,options)=>{calls.push({url,options});return decodeURIComponent(url).includes('images/generations')?reply({data:[{url:'https://cdn.example/result.png?signature=fixture-signed'}]}):new Response(png);};
  const blob=await generatePhoneImage('测试');assert.equal(blob.type,'image/png');
  assert.equal(calls[0].url,'/proxy/'+encodeURIComponent('https://image.example/v1/images/generations'));
  assert.equal(calls[1].url,'/proxy/'+encodeURIComponent('https://cdn.example/result.png?signature=fixture-signed'));assert.equal(calls[1].options.headers.Authorization,'');
});
test('失败重绘保留旧图片、钱包与帖子；服务错误不会回显密钥',async t=>{
  const f=fixture(t);f.config();const post=f.post();attachPhoneGameImage(post.id,'/user/files/world-phone-image-existing.png','原提示词');const before=readPhoneGameState();
  globalThis.fetch=async()=>new Response('fixture-key',{status:401});
  await assert.rejects(generatePhonePostImage(post.id,'重绘'),error=>!error.message.includes('fixture-key')&&error.message.includes('密钥'));
  assert.deepEqual(readPhoneGameState(),before);assert.equal(phonePostImageStatus().busy,false);
});
test('生成结果保存为酒馆素材，元数据只保留路径；序列化和恢复后仍可显示',async t=>{
  const f=fixture(t);f.config();const post=f.post();const before=readPhoneGameState();let upload;
  globalThis.fetch=async(url,options)=>{if(url==='/api/files/upload'){upload=JSON.parse(options.body);return reply({path:'user/files/'+upload.name});}return imageResponse();};
  const path=await generatePhonePostImage(post.id,'咖啡插画');
  assert.match(path,/^\/user\/files\/world-phone-image-.+\.png$/);assert.equal(upload.data,png.toString('base64'));
  f.ctx.chatMetadata=JSON.parse(JSON.stringify(f.ctx.chatMetadata));
  const state=readPhoneGameState();assert.equal(state.posts.at(-1).imageUrl,path);assert.equal(state.posts.at(-1).imagePrompt,'咖啡插画');assert.equal(state.balance,before.balance);
  assert.ok(!JSON.stringify(f.ctx.chatMetadata).includes(upload.data));
  assert.equal(normalizePhoneGameState({...state,posts:[{...state.posts[0],imageUrl:'javascript:alert(1)'}]}).posts[0].imageUrl,'');
});
test('迟到生图结果不能写入另一聊天；取消后不上传素材',async t=>{
  const f=fixture(t);f.config();const post=f.post();const old=f.ctx.chatMetadata;let release,uploads=0;
  globalThis.fetch=async url=>{if(url==='/api/files/upload'){uploads++;return reply({path:'user/files/world-phone-image-stale.png'});}return new Promise(resolve=>release=resolve);};
  const pending=generatePhonePostImage(post.id,'等待');const caught=assert.rejects(pending,/切换|取消/);
  f.ctx.chatId='another-chat';f.ctx.chatMetadata={};f.ctx.eventSource.emit('chat');release(imageResponse());await caught;
  assert.equal(uploads,0);assert.equal(readPhoneGameState().posts.length,0);
  assert.equal(Object.values(old.world_phone_game_v1.saves)[0].posts[0].imageUrl,'');
});
test('独立→世界→独立快速切换使旧生图失效，旧图仍在原帖',async t=>{
  const f=fixture(t);f.config();const post=f.post();attachPhoneGameImage(post.id,'user/files/world-phone-image-old.png','原图');let release;
  globalThis.fetch=async()=>new Promise(resolve=>release=resolve);
  const pending=generatePhonePostImage(post.id,'重画');const caught=assert.rejects(pending,/切换|取消/);
  setPhoneGameMode('world');setPhoneGameMode('game');release(imageResponse());await caught;
  assert.equal(readPhoneGameState().posts[0].imageUrl,'/user/files/world-phone-image-old.png');
});
test('素材上传期间切换分支会清理未挂载素材，不回写任一分支',async t=>{
  const f=fixture(t);f.config();const post=f.post();const scope=capturePhoneGameScope();let releaseUpload,started;
  const uploading=new Promise(resolve=>started=resolve),removed=[];
  globalThis.fetch=async(url,options)=>{
    if(url==='/api/files/upload'){started();return new Promise(resolve=>releaseUpload=resolve);}
    if(url==='/api/files/delete'){removed.push(JSON.parse(options.body).path);return new Response('ok');}
    return imageResponse();
  };
  const pending=generatePhonePostImage(post.id,'测试');const caught=assert.rejects(pending,/切换|取消/);await uploading;
  f.ctx.chatId='new-branch';releaseUpload(reply({path:'user/files/world-phone-image-unattached.png'}));await caught;
  assert.deepEqual(removed,['user/files/world-phone-image-unattached.png']);
  assert.equal(Object.values(scope.metadata.world_phone_game_v1.saves)[0].posts[0].imageUrl,'');
});
test('旧设置默认通用协议；NovelAI 根地址和完整生图地址均保留正确路径，注册页拒绝保存',t=>{
  const f=fixture(t); f.config();
  delete f.ctx.extensionSettings.world_phone_images_v1.provider;
  assert.equal(readPhoneImageSettings().provider,'openai');
  assert.equal(imageApiBase('https://novel.example/','novelai'),'https://novel.example');
  assert.equal(imageApiBase('https://novel.example/ai/generate-image/','novelai'),'https://novel.example');
  assert.equal(imageApiBase('https://novel.example/prefix/ai/generate-image','novelai'),'https://novel.example/prefix');
  assert.throws(()=>f.config({provider:'novelai',baseUrl:'https://novel.example/signup/v1'}),/注册/);
  f.config({provider:'novelai',baseUrl:'https://novel.example',model:'nai-diffusion-4-5-full',rememberKey:true});
  assert.equal(readPhoneImageSettings().provider,'novelai'); assert.ok(hasPhoneImageKey());
  assert.ok(!JSON.stringify(f.ctx.extensionSettings).includes('fixture-key'));
  f.config({provider:'novelai',baseUrl:'https://another.example',apiKey:''}); assert.equal(hasPhoneImageKey(),false);
});
test('NovelAI V4.5 生图请求遵循单张与小图限制',async t=>{
  const f=fixture(t);f.config({provider:'novelai',baseUrl:'https://novel.example',model:'nai-diffusion-4-5-full'});const requests=[];
  globalThis.fetch=async(url,options)=>{requests.push({url,options});return new Response(imageZip({'image_0.png':png}),{status:201,headers:{'Content-Type':'application/zip'}});};
  const image=await generatePhoneImage('simple crow, pixel art');assert.equal(image.type,'image/png');assert.deepEqual(Buffer.from(await image.arrayBuffer()),png);
  assert.equal(requests[0].url,'https://novel.example/ai/generate-image');assert.equal(requests[0].options.headers.Authorization,'Bearer fixture-key');assert.equal(requests[0].options.headers.Accept,'application/zip');
  const body=JSON.parse(requests[0].options.body),p=body.parameters;
  assert.equal(body.action,'generate');assert.equal(body.model,'nai-diffusion-4-5-full');assert.equal(body.input,'simple crow, pixel art');
  assert.equal(p.n_samples,1);assert.equal(p.width,1024);assert.equal(p.height,1024);assert.equal(p.steps,28);
  assert.equal(p.v4_prompt.caption.base_caption,body.input);assert.deepEqual(p.v4_prompt.caption.char_captions,[]);
  assert.ok(Number.isInteger(p.seed)&&p.seed>=0&&p.seed<0x100000000);
  assert.ok(!Object.keys(p).some(key=>key.startsWith('reference_')||key==='image'||key==='mask'));
  assert.ok(!('n' in body)&&!('size' in body)&&!('prompt' in body));
});
test('NovelAI 配图描述使用英文标签，动态正文保持中文，不额外请求提示词模型',t=>{
  const f=fixture(t);f.config({provider:'novelai',baseUrl:'https://novel.example',model:'nai-diffusion-4-5-full'});
  const prompt=buildPhoneGamePrompt(readPhoneGameState(),{platform:'weibo'});
  assert.ok(prompt.includes('逗号分隔的简短英文标签'));assert.ok(prompt.includes('动态正文仍使用中文'));
  assert.equal(globalThis.fetch.mock.callCount(),0);
});
test('NovelAI 支持存储、压缩、数据描述符和附带非图片文件的 ZIP，不依赖浏览器解压接口',async()=>{
  for(const options of [{compressed:false},{compressed:true},{compressed:true,descriptor:true}]){
    const bytes=await readNovelImageZip(imageZip({'README.txt':'fixture','images/image_0.png':png,'image_1.png':Buffer.from('unused')},options));
    assert.deepEqual(Buffer.from(bytes),png);
  }
});
test('NovelAI 的原生 JSON 图片返回也可解码；无图和 HTML 错误页给出协议提示',async t=>{
  const f=fixture(t);f.config({provider:'novelai',baseUrl:'https://novel.example',model:'nai-diffusion-4-5-full'});
  globalThis.fetch=async()=>reply({images:[{image:png.toString('base64'),seed:37,index:0}]});
  assert.deepEqual(Buffer.from(await (await generatePhoneImage('crow')).arrayBuffer()),png);
  globalThis.fetch=async()=>reply({images:[]});await assert.rejects(generatePhoneImage('crow'),/没有返回/);
  globalThis.fetch=async()=>new Response('<html>fixture-key</html>');
  await assert.rejects(generatePhoneImage('crow'),error=>/压缩包|JSON/.test(error.message)&&!error.message.includes('fixture-key'));
});
test('NovelAI 代理请求保留专用路径；更换尺寸后仍只生成一张',async t=>{
  const f=fixture(t);f.config({provider:'novelai',transport:'proxy',baseUrl:'https://novel.example/ai/generate-image',model:'nai-diffusion-4-5-full',size:'768x768'});let request;
  globalThis.fetch=async(url,options)=>{request={url,options};return new Response(imageZip({'image.png':png},{compressed:false}));};
  await generatePhoneImage('crow');assert.equal(request.url,'/proxy/'+encodeURIComponent('https://novel.example/ai/generate-image'));
  assert.equal(request.options.credentials,'same-origin');assert.equal(JSON.parse(request.options.body).parameters.width,768);
  assert.equal(JSON.parse(request.options.body).parameters.n_samples,1);
  assert.throws(()=>f.config({provider:'novelai',size:'2048x2048'}),/总像素/);
  assert.throws(()=>f.config({provider:'novelai',size:'1000x1000'}),/64/);
});
test('代理关闭与上游路径 404 分开提示，不再把站点 404 当成代理未开',async t=>{
  const f=fixture(t);f.config({transport:'proxy'});
  globalThis.fetch=async()=>new Response('CORS proxy is disabled. Set enableCorsProxy to true.',{status:404});
  await assert.rejects(listPhoneImageModels(),/代理尚未开启/);
  globalThis.fetch=async()=>new Response('{"detail":"Not Found","key":"fixture-key"}',{status:404});
  await assert.rejects(listPhoneImageModels(),error=>error.message.includes('404')&&!error.message.includes('尚未开启')&&!error.message.includes('fixture-key'));
});
test('NovelAI 损坏、空包、超限图片和未知长度的解压大图被拒绝',async()=>{
  const good=imageZip({'image.png':png});
  await assert.rejects(readNovelImageZip(good.subarray(0,good.length-22)),/无效/);
  await assert.rejects(readNovelImageZip(imageZip({'README.txt':'no image'})),/没有可用图片/);
  await assert.rejects(readNovelImageZip(imageZip({'image.png':png},{declaredSize:MAX_PHONE_IMAGE_BYTES+1})),/20 MB/);
  await assert.rejects(readNovelImageZip(imageZip({'image.png':Buffer.alloc(MAX_PHONE_IMAGE_BYTES+1)},{descriptor:true})),/20 MB/);
});
test('NovelAI 保存图片和刷新恢复复用现有素材流程；失败重绘仍保留原图',async t=>{
  const f=fixture(t);f.config({provider:'novelai',baseUrl:'https://novel.example',model:'nai-diffusion-4-5-full'});const post=f.post();let upload;
  globalThis.fetch=async(url,options)=>{if(url==='/api/files/upload'){upload=JSON.parse(options.body);return reply({path:'user/files/'+upload.name});}return new Response(imageZip({'image.png':png}));};
  const path=await generatePhonePostImage(post.id,'crow');assert.equal(upload.data,png.toString('base64'));
  f.ctx.chatMetadata=JSON.parse(JSON.stringify(f.ctx.chatMetadata));assert.equal(readPhoneGameState().posts.at(-1).imageUrl,path);
  globalThis.fetch=async()=>new Response('controlled failure',{status:502});await assert.rejects(generatePhonePostImage(post.id,'retry'),/502/);
  assert.equal(readPhoneGameState().posts.at(-1).imageUrl,path);assert.equal(phonePostImageStatus().busy,false);
});
test('NovelAI 迟到压缩包在切换聊天后不上传，不写入新存档',async t=>{
  const f=fixture(t);f.config({provider:'novelai',baseUrl:'https://novel.example',model:'nai-diffusion-4-5-full'});const post=f.post();let release,uploads=0;
  globalThis.fetch=async url=>{if(url==='/api/files/upload'){uploads++;return reply({path:'user/files/world-phone-image-stale.png'});}return new Promise(resolve=>release=resolve);};
  const pending=generatePhonePostImage(post.id,'crow'),caught=assert.rejects(pending,/切换|取消/);
  f.ctx.chatId='another-chat';f.ctx.chatMetadata={};f.ctx.eventSource.emit('chat');release(new Response(imageZip({'image.png':png})));await caught;
  assert.equal(uploads,0);assert.equal(readPhoneGameState().posts.length,0);
});
test('NovelAI 解压过程中取消也会终止，不依赖请求还在运行',async()=>{
  const controller=new AbortController();const promise=readNovelImageZip(imageZip({'image.png':png}),{signal:controller.signal});
  controller.abort();await assert.rejects(promise,/取消/);
});


test('绘图站先查询原路径，仅不存在时查询同源通用列表，模型查询不改变生图地址',async t=>{
 const f=fixture(t);f.config({provider:'novelai',baseUrl:'https://novel.example/prefix',transport:'proxy',model:'nai-diffusion-4-5-full'});const calls=[];
 globalThis.fetch=async(url,options)=>{calls.push({url,options});return decodeURIComponent(url).endsWith('/v1/models')?reply({models:['nai-diffusion-4-5-full',{id:'custom-image'},'nai-diffusion-4-5-full']}):new Response('',{status:404});};
 assert.deepEqual(await listPhoneImageModels(),['nai-diffusion-4-5-full','custom-image']);
 assert.deepEqual(calls.map(c=>decodeURIComponent(c.url)),['/proxy/https://novel.example/prefix/models','/proxy/https://novel.example/prefix/v1/models']);
 assert.ok(calls.every(c=>c.options.method==='GET'&&c.options.headers.Authorization==='Bearer fixture-key'));
 assert.equal(readPhoneImageSettings().baseUrl,'https://novel.example/prefix');
});
test('模型查询不在权限错误、服务异常、无效数据或取消后继续尝试其他路径',async t=>{
 const f=fixture(t);f.config({provider:'novelai',baseUrl:'https://novel.example'});
 for(const status of [401,403,502]){let calls=0;globalThis.fetch=async()=>{calls++;return new Response('fixture-key',{status});};await assert.rejects(listPhoneImageModels(),e=>!e.message.includes('fixture-key'));assert.equal(calls,1);}
 for(const value of ['<html>fixture-key</html>',JSON.stringify({data:[]}),JSON.stringify({models:[{},null,37]})]){let calls=0;globalThis.fetch=async()=>{calls++;return new Response(value);};await assert.rejects(listPhoneImageModels(),/列表/);assert.equal(calls,1);}
 const stop=new AbortController();let calls=0;globalThis.fetch=async()=>{calls++;stop.abort();return new Response('',{status:404});};await assert.rejects(listPhoneImageModels({signal:stop.signal}),/取消/);assert.equal(calls,1);
});

test('真实站点报告没有已启用上游时直说原因，其他错误正文与密钥不回显',async t=>{
 const f=fixture(t);f.config({provider:'novelai',baseUrl:'https://novel.example',model:'nai-diffusion-4-5-full'});
 globalThis.fetch=async()=>new Response(JSON.stringify({message:'当前没有可用的已启用上游',key:'fixture-key'}),{status:503});
 await assert.rejects(generatePhoneImage('crow'),e=>e.message.includes('503')&&e.message.includes('启用上游')&&!e.message.includes('fixture-key'));
 globalThis.fetch=async()=>new Response(JSON.stringify({message:'fixture-key'}),{status:503});
 await assert.rejects(generatePhoneImage('crow'),e=>e.message.includes('503')&&!e.message.includes('fixture-key'));
 globalThis.fetch=async()=>new Response('<html>fixture-key</html>',{status:503});
 await assert.rejects(generatePhoneImage('crow'),e=>e.message.includes('503')&&!e.message.includes('fixture-key'));
});

test('酒馆代理未解开的压缩模型列表和生图 JSON 均可读取，普通响应不受影响',async t=>{
 const f=fixture(t);f.config({transport:'proxy'});const calls=[];
 const models='KLUv/SA3hQEAhAJ7ImRhdGEiOlt7ImlkIjoiZml4dHVyZS1pbWFnZSJ9LHRleHQifV19AQDQbj4B';
 const image='KLUv/SB2sQMAeyJkYXRhIjpbeyJiNjRfanNvbiI6ImlWQk9SdzBLR2dvQUFBQU5TVWhFVWdBQUFBRUFBQUFCQ0FRQUFBQzFIQXdDQUFBQUMwbEVRVlI0Mm1QOC94OEFBd01DQU8ramYya0FBQUFBU1VWT1JLNUNZSUk9In1dfQ==';
 globalThis.fetch=async(url,options)=>{calls.push({url,options});return new Response(Buffer.from(decodeURIComponent(url).endsWith('/models')?models:image,'base64'));};
 assert.deepEqual(await listPhoneImageModels(),['fixture-image','fixture-text']);
 const blob=await generatePhoneImage('crow');assert.equal(blob.type,'image/png');assert.equal(blob.size,68);
 assert.equal(calls[0].url,'/proxy/'+encodeURIComponent('https://image.example/v1/models'));
 assert.equal(calls[1].options.headers.Authorization,'Bearer fixture-key');
 assert.equal(JSON.parse(calls[1].options.body).n,1);
});
