import test from 'node:test';
import assert from 'node:assert/strict';
import {phoneDom} from './helpers/phone-dom.mjs';
import {readPhoneGameState,applyPhoneGamePosts,normalizePhoneGameState,setPhoneGameMode,capturePhoneGameScope} from '../src/phone-game.js';
import {buildPhoneGamePrompt,generatePhoneGameContent,cancelPhoneGameGeneration,isPhoneGameGenerating} from '../src/phone-game-ai.js';
import {weiboWorldbookBindings,readWeiboWorldbook} from '../src/phone-weibo-lore.js';
import {worldWeiboItems,renderWorldWeibo} from '../src/phone-weibo-opinion.js';
import {renderPhoneGameApp} from '../src/phone-game-view.js';
import {refreshWorldBackstagePublicOpinion} from '../src/world-backstage-bridge.js';
import * as wi from './helpers/world-info-host.mjs';
import {readWeiboTavernContext} from '../src/phone-weibo-context.js';

const settle=()=>new Promise(resolve=>setImmediate(resolve));
const ctxFor=()=>({name1:'玩家',characterId:0,characters:[{name:'陆祈',avatar:'lu.png',description:'成年修灯匠，住在青岚街'}],chatId:'weibo',chat:[{mes:'夜市上出现了偷烤饼的小龙。',name:'陆祈'}],chatMetadata:{},saveMetadataDebounced(){}});
function setup(t){const f=phoneDom(t),ctx=ctxFor();f.set('SillyTavern',{getContext:()=>ctx});f.set('worldBackstageHost',undefined);return{f,ctx};}
const passerby={authorKind:'passerby',authorName:'烤饼巡逻员',title:'谁家的小龙',text:'刚出炉的饼又少了一块。',category:'趣闻',claimStatus:'mixed',heat:4,replies:[{author:'隔壁修灯的',text:'先看它嘴角有没有芝麻。'}]};

test('微博路人帖子保存恢复，不生成联系人；其他平台继续拒绝未知作者',t=>{
 const{ctx}=setup(t),s=readPhoneGameState(),actor=s.actors[0];
 const next=applyPhoneGamePosts('weibo',[passerby,{actorId:actor.id,text:'今天换了三盏灯'},{actorId:'typo',text:'错误编号'}]);
 assert.equal(next.posts.length,2);assert.equal(next.actors.length,1);assert.equal(next.posts[0].actorId,'');
 const restored=normalizePhoneGameState(JSON.parse(JSON.stringify(next)));
 assert.equal(restored.posts[0].authorName,'烤饼巡逻员');assert.deepEqual(restored.posts[0].replies,passerby.replies);
 assert.equal(restored.balance,1000);assert.equal(restored.communications.contacts.length,1);
 assert.throws(()=>applyPhoneGamePosts('rednote',[passerby]),/没有收到有效动态/);
 assert.equal(ctx.chatMetadata.world_backstage_v1,undefined);
});

test('路人详情只显示讨论，角色关注筛选、网名与回复搜索正常',t=>{
 const{f}=setup(t),state=readPhoneGameState();applyPhoneGamePosts('weibo',[{actorId:state.actors[0].id,text:'修灯日常'},passerby]);
 const stop=renderPhoneGameApp(f.screen,{app:'weibo',goHome(){},openApp(){}});f.cleanup.push(stop);
 const id=readPhoneGameState().posts.at(-1).id;
 f.screen.querySelector(`[data-pg-post="${id}"]`).click();assert.match(f.screen.textContent,/芝麻/);
 assert.equal(f.screen.querySelector('[data-pg-chat]'),null);assert.equal(f.screen.querySelector('[data-pg-comment]'),null);
 f.screen.querySelector('[data-pg-like]').click();assert.equal(readPhoneGameState().posts.at(-1).liked,true);
 f.screen.querySelector('[data-pg-post-back]').click();f.screen.querySelector('[data-pg-view="following"]').click();
 assert.match(f.screen.textContent,/修灯日常/);assert.doesNotMatch(f.screen.textContent,/烤饼巡逻员/);
 f.screen.querySelector('[data-pg-view="home"]').click();const q=f.screen.querySelector('[data-pg-query]');q.value='芝麻';f.screen.querySelector('[data-pg-search]').fire('submit');
 assert.match(f.screen.textContent,/烤饼巡逻员/);assert.doesNotMatch(f.screen.textContent,/修灯日常/);
});

test('只读取绑定世界书，跳过禁用、显式私密、剧透和不适用人物条目',async()=>{
 const ctx=ctxFor();ctx.chatMetadata.world_info='聊天书';ctx.powerUserSettings={persona_description_lorebook:'玩家书'};
 ctx.characters[0].data={extensions:{world:'角色书'},character_book:{entries:[{enabled:true,content:'青岚街每晚有夜市',name:'街景'},{enabled:false,content:'不能读取的禁用条目'}]}};
 const called=[];const host={selected_world_info:['全局书'],world_info:{charLore:[{name:'lu',extraBooks:['附加书']}]},loadWorldInfo:async name=>{called.push(name);return{entries:{0:{content:name+'的公开习惯'},1:{comment:'隐藏结局',content:'不可显示'},2:{content:'私密资料',visibility:'private'},3:{content:'别人的设定',characterFilter:{names:['other'],isExclude:false}}}};}};
 assert.deepEqual(weiboWorldbookBindings(ctx,host).names,['全局书','聊天书','玩家书','角色书','附加书']);
 const result=await readWeiboWorldbook(ctx,{host,seed:0});assert.equal(called.length,5);
 assert.equal(result.entries.length,6);assert.doesNotMatch(JSON.stringify(result.entries),/不可显示|私密资料|别人的设定|不能读取/);
});

test('读取期间切换绑定世界书或聊天使结果失效，读取失败继续使用已取得设定',async()=>{
 const ctx=ctxFor();ctx.chatMetadata.world_info='一';const host={selected_world_info:[],loadWorldInfo:async()=>{ctx.chatMetadata.world_info='二';return{entries:{a:{content:'旧书'}}};}};
 await assert.rejects(readWeiboWorldbook(ctx,{host}),/世界书已切换/);
 const fallback=await readWeiboWorldbook(ctx,{host:{selected_world_info:[],loadWorldInfo:async()=>null}});assert.deepEqual(fallback.unavailableBooks,['二']);
 await assert.rejects(readWeiboWorldbook(ctx,{host,current:()=>false}),/切换/);
});

test('模型请求使用绑定世界书，切书后迟到帖子不能保存',async t=>{
 const{f,ctx}=setup(t);ctx.chatMetadata.world_info='公开设定';f.set('__phoneWorldbooks',{'公开设定':{entries:{0:{content:'青岚街靠月光晶石照明。'}}}});
 let resolve,called;ctx.generateRaw=options=>{called=options;return new Promise(r=>resolve=r);};
 const pending=generatePhoneGameContent({platform:'weibo'});const caught=pending.catch(e=>e);await settle();await settle();
 assert.match(called.prompt,/月光晶石/);assert.match(called.prompt,/passerby/);assert.equal(called.responseLength,2000);
 ctx.chatMetadata.world_info='别的书';resolve(JSON.stringify({posts:[passerby]}));assert.match((await caught).message,/世界书已切换/);assert.equal(readPhoneGameState().posts.length,0);
});

test('群像或场景卡没有联系人时，仍能依据世界书生成路人微博',async t=>{
 const{ctx}=setup(t);ctx.characters[0].name='夜市世界卡';ctx.characters[0].data={character_book:{entries:[{enabled:true,content:'月光集市住着会偷饼的小龙。'}]}};
 ctx.generateRaw=async options=>{assert.match(options.prompt,/月光集市/);return JSON.stringify({posts:[passerby]});};
 assert.equal(readPhoneGameState().actors.length,0);await generatePhoneGameContent({platform:'weibo'});
 assert.equal(readPhoneGameState().posts.length,1);assert.equal(readPhoneGameState().actors.length,0);
 assert.match(buildPhoneGamePrompt(readPhoneGameState(),{platform:'weibo'}),/不新增会改变主线的大事件/);
});

test('每次微博刷新读取最新正文，排除系统及隐藏消息；编辑后迟到生成失效',async t=>{
 const{ctx}=setup(t);readPhoneGameState();ctx.chat.push({name:'陆祈',mes:'灯会刚刚公开宣布提前开始。'},{is_system:true,mes:'系统密钥不进入微博'},{name:'旁白',mes:'隐藏内容不可读取',extra:{isHidden:true}});
 assert.match(JSON.stringify(readWeiboTavernContext(ctx)),/公开宣布/);assert.doesNotMatch(JSON.stringify(readWeiboTavernContext(ctx)),/系统密钥|隐藏内容/);
 let resolve,called;ctx.generateRaw=options=>{called=options;return new Promise(r=>resolve=r);};
 const pending=generatePhoneGameContent({platform:'weibo'}),caught=pending.catch(e=>e);await settle();await settle();
 assert.match(called.prompt,/灯会刚刚公开宣布提前开始/);ctx.chat[1].mes='选中的另一回复：灯会延期。';resolve(JSON.stringify({posts:[passerby]}));
 assert.match((await caught).message,/正文已更新或编辑/);assert.equal(readPhoneGameState().posts.length,0);
 let nextPrompt;ctx.generateRaw=async options=>{nextPrompt=options.prompt;return JSON.stringify({posts:[passerby]});};await generatePhoneGameContent({platform:'weibo'});
 assert.match(nextPrompt,/灯会延期/);assert.doesNotMatch(nextPrompt,/灯会刚刚公开宣布/);
});

test('世界书读取卡住时可以取消和重试，迟到书本不会启动旧模型请求',async t=>{
 const{f,ctx}=setup(t);ctx.chatMetadata.world_info='等待的书';let release,calls=0;
 f.set('__phoneWorldbookLoader',()=>new Promise(resolve=>release=resolve));ctx.generateRaw=async()=>{calls++;return JSON.stringify({posts:[passerby]});};
 const pending=generatePhoneGameContent({platform:'weibo'}),caught=pending.catch(e=>e);await settle();assert.equal(isPhoneGameGenerating(),true);
 cancelPhoneGameGeneration();assert.match((await caught).message,/停止等待/);await settle();assert.equal(isPhoneGameGenerating(),false);assert.equal(calls,0);
 ctx.chatMetadata.world_info='';await generatePhoneGameContent({platform:'weibo'});assert.equal(calls,1);
 release({entries:{a:{content:'迟到的旧世界设定'}}});await settle();await settle();assert.equal(calls,1);assert.equal(readPhoneGameState().posts.length,1);
});

test('世界微博显示新闻、独立论坛和传闻回复；断线清空且旧控件失效',t=>{
 const{f}=setup(t),route={tab:'home',query:'',selected:''};let live=true,refreshes=0,homes=0;
 const snapshot={connected:true,news:[{id:'n',headline:'灯会开始',summary:'街上的月光灯亮了',source:'镇报',heat:2,worldMinute:9}],forums:[{id:'f',title:'小龙是谁家的',summary:'没看到主人',board:'夜市',heat:5,claimStatus:'rumor',replies:[{author:'路过',text:'饼摊老板说的'}],worldMinute:10}]};
 assert.equal(worldWeiboItems(snapshot).length,2);
 const view=renderWorldWeibo(f.screen,{snapshot,route,current:()=>live,goHome:()=>homes++,refreshOpinion:async()=>{refreshes++;return snapshot;}});
 assert.match(f.screen.textContent,/灯会开始/);assert.match(f.screen.textContent,/小龙是谁家的/);
 f.screen.querySelector('[data-world-weibo-open="forum:f"]').click();assert.match(f.screen.textContent,/饼摊老板说的/);assert.match(f.screen.textContent,/传闻/);
 f.screen.querySelector('[data-app-back]').click();f.screen.querySelector('[data-world-weibo-tab="news"]').click();assert.doesNotMatch(f.screen.textContent,/小龙是谁家的/);
 view.refresh({connected:false,news:[],forums:[],connectionMessage:'已断线'});assert.doesNotMatch(f.screen.textContent,/灯会开始/);
 const old=f.screen.querySelector('[data-app-back]');view.dispose();old.click();assert.equal(homes,0);assert.equal(refreshes,0);
});

test('世界舆情刷新交给宿主，切模式后不接收迟到结果，独立模式不调用宿主',async t=>{
 const{f,ctx}=setup(t);let calls=0,resolve;
 const capabilities=['social-open-direct','social-create-group','social-respond-friend','social-comment-moment','social-send-message','social-read-conversation','social-set-moment-like'];
 f.set('worldBackstageHost',{phoneBridgeVersion:2,phoneAction(){throw Error('不得调用社交写入');},getPhoneSurface:()=>({bridgeVersion:2,connected:true,capabilities,branchKey:'1',people:[],social:{},publicOpinion:{}}),refreshPublicOpinion:()=>{calls++;return new Promise(r=>resolve=r);}});
 await assert.rejects(refreshWorldBackstagePublicOpinion(),/世界模式/);assert.equal(calls,0);
 setPhoneGameMode('world');const pending=refreshWorldBackstagePublicOpinion();setPhoneGameMode('game');resolve();await assert.rejects(pending,/已切换/);assert.equal(calls,1);
 assert.equal(ctx.chatMetadata.world_backstage_v1,undefined);assert.equal(capturePhoneGameScope().ctx,ctx);
});
