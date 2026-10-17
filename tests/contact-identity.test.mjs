import test from 'node:test';
import assert from 'node:assert/strict';
import {phoneDom} from './helpers/phone-dom.mjs';
import {renderPhoneGameApp} from '../src/phone-game-view.js';
import {renderPhoneGameCommunicationApp} from '../src/phone-game-communication-view.js';
import {PHONE_GAME_KEY,readPhoneGameState,capturePhoneGameScope,resolvePhoneGameContactIdentity,phoneGameContactGroups,startPhoneGameCall,applyPhoneGamePosts,setPhoneGameMode,applyPhoneGameReply} from '../src/phone-game.js';

function setup(t,extraPeople=[]) {
 const f=phoneDom(t),ctx={name1:'玩家',characterId:0,chatId:crypto.randomUUID(),characters:[{name:'阿青',avatar:'a.png',description:'成年人物',phoneNumber:'13800000001'}],chat:[],chatMetadata:{world_backstage_v1:{sentinel:'世界状态不变'}},saveMetadataDebounced(){}};
 const people=[{id:'a',name:'阿青',phoneNumber:'13800000002'},...extraPeople],surface={bridgeVersion:2,connected:true,branchKey:'a',capabilities:['social-open-direct','social-create-group','social-respond-friend','social-comment-moment','social-send-message','social-read-conversation','social-set-moment-like'],people,social:{connections:people.map(p=>({personId:p.id,status:'accepted'})),conversations:[],moments:[],notices:[]}};
 let calls=0;f.set('SillyTavern',{getContext:()=>ctx});f.set('worldBackstageHost',{phoneBridgeVersion:2,getPhoneSurface:()=>surface,phoneAction(){calls++}});
 f.set('localStorage',{getItem:()=>null,setItem(){}});
 const initial=readPhoneGameState(),scope=capturePhoneGameScope(),card=initial.actors.find(a=>a.id.startsWith('card:')),world=initial.actors.find(a=>a.id==='world:a');
 const seed=state=>{ctx.chatMetadata[PHONE_GAME_KEY].saves[scope.key]=state;return readPhoneGameState()};
 const show=()=>{const stop=renderPhoneGameApp(f.screen,{app:'wechat',goHome(){},openApp(){}});f.cleanup.push(stop)};
 const get=s=>{const node=f.screen.querySelector(s);assert.ok(node,s);return node};
 return {...f,ctx,surface,scope,initial,card,world,seed,show,get,writes:()=>calls};
}

test('同名跨来源先合为一个微信入口，未确认不移动记录，确认后才合并',t=>{
 const f=setup(t),worldBefore=JSON.stringify(f.ctx.chatMetadata.world_backstage_v1);f.show();
 assert.equal(f.screen.querySelectorAll('[data-pg-contact-identity]').length,1);assert.equal(readPhoneGameState().actors.length,2);
 f.get('[data-pg-contact-identity]').click();assert.match(f.screen.textContent,/确认联系人身份/);assert.equal(readPhoneGameState().actors.length,2);
 f.get('[data-pg-identity-choice="same"]').click();assert.equal(readPhoneGameState().actors.length,1);assert.equal(f.screen.querySelector('[data-pg-identity-choice]'),null);
 assert.equal(JSON.stringify(f.ctx.chatMetadata.world_backstage_v1),worldBefore);assert.equal(f.writes(),0);
});

test('旧存档合并保留记录ID、图片、点赞、草稿、通话、关系和已扣款，不重复结算',t=>{
 const f=setup(t),state=f.initial,a=f.card.id,b=f.world.id;
 state.balance=900;state.spent=100;state.earned=0;state.ledger=[{id:'paid',text:'已支付礼物',amount:-100,tick:2}];
 state.events=[{id:'a-chat',actorId:a,kind:'chat',text:'原对话',reply:'原回复',status:'replied',tick:1},{id:'b-sms',actorId:b,kind:'sms',text:'短信',reply:'短信回复',status:'replied',tick:2},{id:'b-gift',actorId:b,kind:'gift',giftId:'cake',text:'旧礼物',status:'pending',tick:3}];
 state.posts=[{id:'old-note',actorId:b,platform:'rednote',text:'旧笔记',imageUrl:'/user/files/world-phone-image-old.png',liked:true,tick:2}];
 state.relations[a]={affinity:20,memory:'卡侧经历',preferences:['咖啡'],giftCounts:{coffee:1}};state.relations[b]={affinity:35,memory:'世界联系人经历',preferences:['甜点'],giftCounts:{cake:2}};
 state.communications.contacts.find(c=>c.actorId===b).favorite=true;
 state.communications.drafts={[a]:'原会话草稿',[b]:'世界来源草稿'};
 state.communications.calls=[{id:'old-call',actorId:b,number:'13800000002',startedAt:1,connectedAt:2,endedAt:3,outcome:'ended'}];
 const before=f.seed(state),worldBefore=JSON.stringify(f.ctx.chatMetadata.world_backstage_v1);
 resolvePhoneGameContactIdentity(a,true);const next=readPhoneGameState();
 assert.deepEqual(next.events.map(e=>e.id),before.events.map(e=>e.id));assert.ok(next.events.every(e=>e.actorId===a));assert.equal(next.events.at(-1).status,'pending');
 assert.equal(next.posts[0].id,'old-note');assert.equal(next.posts[0].actorId,a);assert.equal(next.posts[0].imageUrl,'/user/files/world-phone-image-old.png');assert.equal(next.posts[0].liked,true);
 assert.equal(next.balance,before.balance);assert.equal(next.spent,before.spent);assert.deepEqual(next.ledger,before.ledger);
 assert.equal(next.relations[a].affinity,35);assert.match(next.relations[a].memory,/卡侧经历/);assert.match(next.relations[a].memory,/世界联系人经历/);assert.deepEqual(next.relations[a].preferences,['咖啡','甜点']);assert.equal(next.relations[a].giftCounts.coffee,1);assert.equal(next.relations[a].giftCounts.cake,2);
 assert.equal(next.communications.contacts.length,1);assert.equal(next.communications.contacts[0].favorite,true);assert.deepEqual(next.communications.contacts[0].otherNumbers,['13800000002']);
 assert.equal(next.communications.drafts[a],'原会话草稿\n\n世界来源草稿');assert.equal(next.communications.calls[0].actorId,a);assert.equal(next.communications.calls[0].number,'13800000002');
 assert.equal(next.actorArchive[0].actor.id,b);assert.equal(next.actorArchive[0].events.at(-1).id,'b-gift');
 applyPhoneGameReply('b-gift',{text:'旧礼物已收到',affinityDelta:1});assert.equal(readPhoneGameState().balance,900);assert.equal(readPhoneGameState().relations[a].giftCounts.cake,2);
 f.ctx.chatMetadata=JSON.parse(JSON.stringify(f.ctx.chatMetadata));assert.equal(readPhoneGameState().actors.length,1);assert.equal(readPhoneGameState().events.at(-1).reply,'旧礼物已收到');
 assert.equal(JSON.stringify(f.ctx.chatMetadata.world_backstage_v1),worldBefore);assert.equal(f.writes(),0);
});

test('明确不同的人后保留两个来源并记住选择，多位同名不自动认领',t=>{
 const f=setup(t);f.show();f.get('[data-pg-contact-identity]').click();f.get('[data-pg-identity-choice="different"]').click();
 assert.equal(readPhoneGameState().actors.length,2);assert.equal(f.screen.querySelectorAll('[data-pg-contact]').length,2);assert.match(f.screen.textContent,/当前聊天角色/);assert.match(f.screen.textContent,/世界联系人/);
 f.show();assert.equal(f.screen.querySelector('[data-pg-contact-identity]'),null);assert.equal(readPhoneGameState().actorArchive.length,0);
 f.ctx.characters.push({name:'阿青',avatar:'b.png'});f.ctx.groupId='g';f.ctx.groups=[{id:'g',members:['a.png','b.png']}];
 const next=readPhoneGameState();assert.equal(next.actors.length,3);assert.equal(phoneGameContactGroups(next).length,3);
 assert.throws(()=>resolvePhoneGameContactIdentity(f.card.id,true),/联系人已经变化/);
});

test('确认关联跨重载、断开世界及角色改名保持稳定，迟到的别名帖子归回同一人',t=>{
 const f=setup(t),a=f.card.id,b=f.world.id;resolvePhoneGameContactIdentity(a,true);
 f.ctx.chatMetadata=JSON.parse(JSON.stringify(f.ctx.chatMetadata));f.ctx.characters[0].name='改名后的阿青';
 const state=readPhoneGameState();assert.equal(state.actors.length,1);assert.equal(state.actors[0].name,'改名后的阿青');
 applyPhoneGamePosts('rednote',[{actorId:b,text:'原来源返回的帖子'}]);assert.equal(readPhoneGameState().posts[0].actorId,a);
 f.set('worldBackstageHost',undefined);assert.equal(readPhoneGameState().actors.length,1);
 assert.throws(()=>resolvePhoneGameContactIdentity(a,true),/联系人已经变化/);assert.equal(readPhoneGameState().actorArchive.length,1);
});

test('旧号码仍能呼叫同一人，号码与另一人冲突时拒绝拨号或发送短信',t=>{
 const f=setup(t);resolvePhoneGameContactIdentity(f.card.id,true);const call=startPhoneGameCall('13800000002');assert.equal(call.state.communications.calls.at(-1).actorId,f.card.id);
 f.surface.people.push({id:'b',name:'另一人',phoneNumber:'13800000002'});f.surface.social.connections.push({personId:'b',status:'accepted'});
 const state=readPhoneGameState();state.communications.calls=[];state.events=[];f.seed(state);
 assert.throws(()=>startPhoneGameCall('13800000002'),/号码对应多个联系人/);
 const stop=renderPhoneGameCommunicationApp(f.screen,{app:'messages',goHome(){},openApp(){}});f.cleanup.push(stop);
 f.get('[data-gpc-new]').click();
 f.get('[data-gpc-number]').value='13800000002';f.get('[data-gpc-number]').fire('input');f.get('[data-gpc-sms-draft]').value='不能发错人';f.get('[data-gpc-sms-draft]').fire('input');f.get('[data-gpc-sms-form]').fire('submit');
 assert.match(f.screen.textContent,/号码对应多个联系人/);assert.equal(readPhoneGameState().events.length,0);
});

test('超长共同经历和冲突草稿保留原文备份并可在联系人中查看',t=>{
 const f=setup(t),state=f.initial,a=f.card.id,b=f.world.id;
 state.relations[a].memory='甲'.repeat(3998);state.relations[b].memory='乙'.repeat(3990)+'原经历结尾';
 state.communications.drafts={[a]:'a'.repeat(1190)+'卡侧草稿尾',[b]:'b'.repeat(1190)+'世界草稿尾'};f.seed(state);
 resolvePhoneGameContactIdentity(a,true);f.show();f.get('[data-pg-view="relations"]').click();f.get('[data-pg-contact]').click();
 const history=f.get('[data-pg-identity-history]');assert.match(history.textContent,/原经历结尾/);assert.match(history.textContent,/卡侧草稿尾/);assert.match(history.textContent,/世界草稿尾/);
});

test('世界模式与切换聊天后的旧确认动作不能写入新存档',t=>{
 const f=setup(t),scope=f.scope;setPhoneGameMode('world');const before=JSON.stringify(f.ctx.chatMetadata);
 assert.throws(()=>resolvePhoneGameContactIdentity(f.card.id,true),/独立模式/);assert.equal(JSON.stringify(f.ctx.chatMetadata),before);
 f.ctx.chatId='another';f.ctx.chatMetadata={};assert.throws(()=>resolvePhoneGameContactIdentity(f.card.id,true,scope),/切换|聊天/);assert.deepEqual(f.ctx.chatMetadata,{});
});
