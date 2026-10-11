import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { imageApiBase, readPhoneImageSettings, savePhoneImageSettings, hasPhoneImageKey, forgetPhoneImageKey, listPhoneImageModels, generatePhoneImage } from '../src/phone-image-provider.js';
import { capturePhoneGameScope, readPhoneGameState, applyPhoneGamePosts, attachPhoneGameImage, setPhoneGameMode, normalizePhoneGameState, queuePhoneGameInteraction } from '../src/phone-game.js';
import { generatePhonePostImage, phonePostImageStatus } from '../src/phone-post-images.js';
import { buildPhoneGamePrompt } from '../src/phone-game-ai.js';

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
