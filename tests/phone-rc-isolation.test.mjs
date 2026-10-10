import test from 'node:test';
import assert from 'node:assert/strict';
import { phoneDom } from './helpers/phone-dom.mjs';
import { renderPhoneGameCommunicationApp } from '../src/phone-game-communication-view.js';
import { renderNativeCommunicationApp } from '../src/native-communication-apps.js';
import { mountWorldPhone } from '../src/world-phone.js';
import { sendWorldBackstageMessage } from '../src/world-backstage-bridge.js';
import { readPhoneGameState,setPhoneGameMode,capturePhoneGameScope,PHONE_GAME_KEY,startPhoneGameCall } from '../src/phone-game.js';
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const capabilities=['social-open-direct','social-create-group','social-respond-friend','social-comment-moment','social-send-message','social-read-conversation','social-set-moment-like'];
function fixture(t) {
 const f=phoneDom(t),ctx={name1:'玩家',characterId:0,chatId:'rc-one',characters:[{name:'阿青',avatar:'a.png',description:'成年男演员',phoneNumber:'13800000001'}],chat:[],chatMetadata:{world_backstage_v1:{private:'不可修改'}},saveMetadataDebounced(){}};
 const surface={bridgeVersion:2,connected:true,branchKey:'branch-a',capabilities,people:[{id:'a',name:'阿青',phoneNumber:'13800000002'}],social:{connections:[{personId:'a',status:'accepted'}],conversations:[],moments:[],notices:[]}};const writes=[];
 f.set('SillyTavern',{getContext:()=>ctx});f.set('worldBackstageHost',{phoneBridgeVersion:2,getPhoneSurface:()=>surface,phoneAction:(action,payload)=>{writes.push({action,payload});return surface;}});
 f.set('CSS',{escape:v=>v});f.set('requestAnimationFrame',fn=>{fn();return 1;});f.set('cancelAnimationFrame',()=>{});const values=new Map();f.set('localStorage',{getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)});
 let stop=()=>{};const show=(app,options={})=>{stop();stop=()=>{};if(app==='phone'||app==='messages')stop=renderPhoneGameCommunicationApp(f.screen,{app,goHome(){},openApp:show,...options});};f.cleanup.push(()=>stop());
 const get=selector=>{const node=f.screen.querySelector(selector);assert.ok(node,selector);return node;};const state=readPhoneGameState();
 return {...f,ctx,surface,writes,get,show,actorId:state.actors[0].id,number:state.communications.contacts[0].number};
}

test('切换模式后旧短信草稿事件不能写入任何存档',t=>{
 const f=fixture(t);f.show('messages',{actorId:f.actorId});const input=f.get('[data-gpc-sms-draft]');input.value='旧输入';
 setPhoneGameMode('world');const before=JSON.stringify(f.ctx.chatMetadata);input.fire('input');assert.equal(JSON.stringify(f.ctx.chatMetadata),before);assert.equal(f.writes.length,0);
});

test('重复号码拒绝短信和拨号，保留草稿且不写入任一联系人',t=>{
 const f=fixture(t);f.ctx.characters[0].phoneNumber=f.surface.people[0].phoneNumber;
 f.show('messages',{actorId:f.actorId});const draft=f.get('[data-gpc-sms-draft]');draft.value='不能发错人';draft.fire('input');
 f.get('[data-gpc-sms-form] button').click();assert.match(f.screen.textContent,/号码对应多个联系人/);
 const state=readPhoneGameState();assert.equal(state.events.length,0);assert.equal(state.communications.drafts[f.actorId],'不能发错人');
 assert.throws(()=>startPhoneGameCall(f.surface.people[0].phoneNumber),/号码对应多个联系人/);
 assert.equal(readPhoneGameState().communications.calls.length,0);assert.deepEqual(f.writes,[]);
});

test('世界电话短信的旧控件在切聊天或切模式后失效',t=>{
 const f=fixture(t);setPhoneGameMode('world');renderNativeCommunicationApp(f.screen,{app:'messages',goHome(){}});f.get('[data-sms-person]').click();const draft=f.get('[data-sms-draft]');draft.value='不应写进新聊天';
 f.ctx.chatMetadata={world_backstage_v1:{private:'新聊天'}};f.ctx.chatId='rc-two';const before=JSON.stringify(f.ctx.chatMetadata);draft.fire('input');assert.equal(JSON.stringify(f.ctx.chatMetadata),before);
});

test('独立模式快速离开又返回，旧短信生成不能恢复结算',async t=>{
 const f=fixture(t);let finish;f.ctx.generateRaw=()=>new Promise(resolve=>finish=resolve);f.show('messages',{actorId:f.actorId});const draft=f.get('[data-gpc-sms-draft]');draft.value='切模式测试';draft.fire('input');f.get('[data-gpc-sms-form] button').click();
 setPhoneGameMode('world');setPhoneGameMode('game');finish(JSON.stringify({text:'旧任务不该结算',affinityDelta:3,memory:'不应保存'}));await settle();
 assert.equal(readPhoneGameState().events[0].status,'pending');assert.equal(readPhoneGameState().relations[f.actorId].memory,'');assert.equal(f.writes.length,0);
});

test('切换模式会结束当前电话，返回独立模式不会复活通话',async t=>{
 const f=fixture(t);let finish;f.ctx.generateRaw=()=>new Promise(resolve=>finish=resolve);f.show('phone');f.get('[data-gpc-tab="contacts"]').click();f.get('[data-gpc-call]').click();setPhoneGameMode('world');setPhoneGameMode('game');finish(JSON.stringify({answered:true,text:'迟到接听'}));await settle();
 const state=readPhoneGameState();assert.equal(state.communications.calls[0].outcome,'cancelled');assert.equal(state.events[0].status,'cancelled');
});

test('世界通讯页在同一元数据对象内切换分支后返回桌面',t=>{
 const f=fixture(t);f.stage.remove();setPhoneGameMode('world');const phone=mountWorldPhone();f.cleanup.push(()=>phone.destroy());phone.openApp('messages');f.surface.branchKey='branch-b';phone.refresh();assert.equal(phone.current(),'home');
});

test('独立短信和电话只写手机存档，不调用世界背面的 phoneAction',async t=>{
 const f=fixture(t),original=JSON.stringify(f.ctx.chatMetadata.world_backstage_v1);f.ctx.generateRaw=async()=>JSON.stringify({answered:true,text:'收到。'});
 f.show('messages',{actorId:f.actorId});const draft=f.get('[data-gpc-sms-draft]');draft.value='独立短信';draft.fire('input');f.get('[data-gpc-sms-form] button').click();await settle();
 f.show('phone');f.get('[data-gpc-tab="contacts"]').click();f.get('[data-gpc-call]').click();await settle();f.get('[data-gpc-hangup]').click();
 assert.equal(JSON.stringify(f.ctx.chatMetadata.world_backstage_v1),original);assert.deepEqual(f.writes,[]);assert.deepEqual(readPhoneGameState().events.map(e=>e.kind),['sms','call']);
});

test('独立模式拒绝世界写命令，世界模式只能通过 phoneAction 写入',async t=>{
 const f=fixture(t);await assert.rejects(sendWorldBackstageMessage('direct-a','不应发送'),/独立模式/);assert.deepEqual(f.writes,[]);
 setPhoneGameMode('world');const original=JSON.stringify(f.ctx.chatMetadata[PHONE_GAME_KEY]);await sendWorldBackstageMessage('direct-a','世界消息');assert.deepEqual(f.writes,[{action:'social-send-message',payload:{conversationId:'direct-a',text:'世界消息'}}]);assert.equal(JSON.stringify(f.ctx.chatMetadata[PHONE_GAME_KEY]),original);
});

test('世界写操作等待中切模式又返回，旧确认结果被丢弃',async t=>{
 const f=fixture(t);setPhoneGameMode('world');let finish;f.set('worldBackstageHost',{phoneBridgeVersion:2,getPhoneSurface:()=>f.surface,phoneAction:()=>new Promise(resolve=>finish=resolve)});
 const pending=sendWorldBackstageMessage('direct-a','待确认');setPhoneGameMode('game');setPhoneGameMode('world');finish(f.surface);await assert.rejects(pending,/模式已切换/);
});

test('世界电话短信控件在独立模式中不产生独立互动',t=>{
 const f=fixture(t);setPhoneGameMode('world');renderNativeCommunicationApp(f.screen,{app:'messages',goHome(){}});f.get('[data-sms-person]').click();const draft=f.get('[data-sms-draft]'),send=f.get('[data-sms-send]');draft.value='旧世界短信';
 setPhoneGameMode('game');const original=JSON.stringify(f.ctx.chatMetadata);draft.fire('input');send.click();assert.equal(JSON.stringify(f.ctx.chatMetadata),original);assert.deepEqual(f.writes,[]);
});

test('短信草稿和已发送回复经过页面刷新与元数据序列化后恢复',async t=>{
 const f=fixture(t);f.ctx.generateRaw=async()=>JSON.stringify({text:'刷新后仍在的回复'});f.show('messages',{actorId:f.actorId});let draft=f.get('[data-gpc-sms-draft]');draft.value='刷新恢复测试';draft.fire('input');
 f.ctx.chatMetadata=JSON.parse(JSON.stringify(f.ctx.chatMetadata));f.show('messages',{actorId:f.actorId});assert.equal(f.get('[data-gpc-sms-draft]').value,'刷新恢复测试');f.get('[data-gpc-sms-form] button').click();await settle();
 f.ctx.chatMetadata=JSON.parse(JSON.stringify(f.ctx.chatMetadata));f.show('messages',{actorId:f.actorId});assert.match(f.screen.textContent,/刷新恢复测试/);assert.match(f.screen.textContent,/刷新后仍在的回复/);assert.equal(readPhoneGameState().events.length,1);
});

for (const [name,change] of [
 ['分支',f=>{f.surface.branchKey='branch-b';}],
 ['角色',f=>{f.ctx.characterId=1;f.ctx.characters.push({name:'阿红',avatar:'b.png'});}],
 ['身份',f=>{f.ctx.chatMetadata.persona='other-persona';}],
 ['聊天',f=>{f.ctx.chatId='other-chat';}],
]) test(`世界短信旧输入在切换${name}后不再写入`,t=>{
 const f=fixture(t);setPhoneGameMode('world');renderNativeCommunicationApp(f.screen,{app:'messages',goHome(){}});f.get('[data-sms-person]').click();const draft=f.get('[data-sms-draft]');draft.value='旧界面草稿';change(f);
 const before=JSON.stringify(f.ctx.chatMetadata);draft.fire('input');assert.equal(JSON.stringify(f.ctx.chatMetadata),before);assert.deepEqual(f.writes,[]);
});

test('世界电话只记录本机未接通尝试，不使用独立电话或模型兜底',t=>{
 const f=fixture(t);setPhoneGameMode('world');let modelCalls=0;f.ctx.generateRaw=()=>{modelCalls++;throw Error('不应调用');};const before=JSON.stringify(f.ctx.chatMetadata[PHONE_GAME_KEY]);
 renderNativeCommunicationApp(f.screen,{app:'phone',goHome(){}});f.get('[data-phone-tab="keypad"]').click();f.get('[data-keypad-digit="1"]').click();f.get('[data-keypad-call]').click();assert.match(f.screen.textContent,/无法接通/);
 assert.equal(JSON.stringify(f.ctx.chatMetadata[PHONE_GAME_KEY]),before);assert.deepEqual(f.writes,[]);assert.equal(modelCalls,0);
});

test('世界电话旧拨号按钮在切模式后不产生本机或独立通话',t=>{
 const f=fixture(t);setPhoneGameMode('world');renderNativeCommunicationApp(f.screen,{app:'phone',goHome(){}});f.get('[data-phone-tab="keypad"]').click();f.get('[data-keypad-digit="1"]').click();const call=f.get('[data-keypad-call]');setPhoneGameMode('game');const before=JSON.stringify(f.ctx.chatMetadata);call.click();assert.equal(JSON.stringify(f.ctx.chatMetadata),before);
});

test('已经退出的短信页面停止按钮不能取消当前页面正在等待的回复',async t=>{
 const f=fixture(t);let finish;f.ctx.generateRaw=()=>new Promise(resolve=>finish=resolve);f.show('messages',{actorId:f.actorId});const draft=f.get('[data-gpc-sms-draft]');draft.value='保留等待';draft.fire('input');f.get('[data-gpc-sms-form] button').click();const oldStop=f.get('[data-gpc-cancel]');
 f.show('phone');f.show('messages',{actorId:f.actorId});oldStop.click();await settle();assert.ok(f.get('[data-gpc-cancel]'));finish(JSON.stringify({text:'当前回复正常'}));await settle();assert.equal(readPhoneGameState().events[0].status,'replied');assert.match(f.screen.textContent,/当前回复正常/);
});
