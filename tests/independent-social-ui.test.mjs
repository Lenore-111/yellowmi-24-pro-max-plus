import test from 'node:test';
import assert from 'node:assert/strict';
import {phoneDom} from './helpers/phone-dom.mjs';
import {renderPhoneGameApp} from '../src/phone-game-view.js';
import {readPhoneGameState,applyPhoneGamePosts,setPhoneGameMode} from '../src/phone-game.js';
import {mountSocialRealism} from '../src/social-realism.js';

const settle=()=>new Promise(resolve=>setImmediate(resolve));
function setup(t,app='rednote') {
  const f=phoneDom(t),storage=new Map(),opened=[];
  const ctx={name1:'玩家',characterId:0,chatId:crypto.randomUUID(),characters:[{name:'阿青',avatar:'a.png'}],chat:[{mes:'午后的日常'}],chatMetadata:{world_backstage_v1:{sentinel:'只读世界'}},saveMetadataDebounced(){}};
  f.set('SillyTavern',{getContext:()=>ctx});f.set('worldBackstageHost',undefined);
  f.set('localStorage',{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value))});
  const actor=readPhoneGameState().actors[0];
  applyPhoneGamePosts(app,[{actorId:actor.id,title:'咖啡探店',text:'美食日常，店里的拿铁很好喝。'},{actorId:actor.id,title:'公园散步',text:'周末出行，在河边看花。'},{actorId:actor.id,title:'阅读手记',text:'读书时记下了 data-social-like 与 $&。'}]);
  const mount=()=>{const stop=renderPhoneGameApp(f.screen,{app,goHome(){},openApp:(...args)=>opened.push(args)});f.cleanup.push(stop);return stop;};
  mount();const get=selector=>{const node=f.screen.querySelector(selector);assert.ok(node,selector);return node;};
  return {...f,ctx,actor,storage,opened,get,mount};
}

test('独立小红书复用联动双列布局，分类、搜索、清空搜索都实际筛选',t=>{
  const f=setup(t);assert.equal(f.screen.querySelectorAll('.wp-rn-column').length,2);assert.equal(f.screen.querySelectorAll('.wp-rn-card').length,3);
  f.get('[data-pg-category="food"]').click();assert.equal(f.screen.querySelectorAll('.wp-rn-card').length,1);assert.match(f.screen.textContent,/咖啡探店/);assert.doesNotMatch(f.screen.textContent,/公园散步/);
  f.get('[data-pg-category="all"]').click();const query=f.get('[data-pg-query]');query.value='散步';query.fire('input');f.get('[data-pg-search]').fire('submit');assert.equal(f.screen.querySelectorAll('.wp-rn-card').length,1);
  f.get('[data-pg-search-clear]').click();assert.equal(f.screen.querySelectorAll('.wp-rn-card').length,3);assert.match(f.screen.textContent,/data-social-like 与 \$&/);
});

test('笔记详情的点赞收藏和浏览位置保留，旧帖子与原钱包不被迁移',t=>{
  const f=setup(t),original=readPhoneGameState(),post=original.posts[0];
  f.get('.wp-rn-grid').scrollTop=260;f.get(`[data-pg-post="${post.id}"]`).click();assert.ok(f.get('[data-pg-image]'));assert.ok(f.get('[data-pg-comment]'));
  f.get('[data-pg-like]').click();f.get('[data-pg-save]').click();f.get('[data-pg-post-back]').click();assert.equal(f.get('.wp-rn-grid').scrollTop,260);
  f.get('[data-pg-view="saved"]').click();assert.equal(f.screen.querySelectorAll('.wp-rn-card').length,1);
  f.mount();assert.equal(f.screen.querySelectorAll('.wp-rn-card').length,3);f.get('[data-pg-view="me"]').click();f.get('[data-pg-profile="liked"]').click();assert.equal(f.screen.querySelectorAll('.wp-rn-card').length,1);
  const current=readPhoneGameState();assert.deepEqual(current.posts.map(p=>p.id),original.posts.map(p=>p.id));assert.equal(current.balance,original.balance);assert.equal(current.posts[0].liked,true);
});

test('独立刷新沿用模型和条数设置，不安装世界背面也能生成且不写世界状态',async t=>{
  const f=setup(t),before=JSON.stringify(f.ctx.chatMetadata.world_backstage_v1);let calls=0;
  f.get('[data-pg-feed-count]').value='7';f.get('[data-pg-feed-count]').fire('input');
  f.ctx.generateRaw=async options=>{calls++;assert.match(options.prompt,/7/);return JSON.stringify({posts:[{actorId:f.actor.id,title:'刷新后的日常',text:'新的午后记录。'}]});};
  f.get('[data-pg-refresh]').click();for(let i=0;i<5;i++)await settle();
  assert.equal(calls,1);assert.match(f.screen.textContent,/刷新后的日常/);assert.equal(f.get('[data-pg-feed-count]').value,'7');assert.equal(f.get('[data-pg-refresh]').disabled,false);
  assert.equal(JSON.stringify(f.ctx.chatMetadata.world_backstage_v1),before);assert.equal(readPhoneGameState().posts.length,4);
});

test('分享只打开独立微信草稿，未经发送不调用模型或写世界',t=>{
  const f=setup(t,'weibo'),before=JSON.stringify(f.ctx.chatMetadata);let calls=0;f.ctx.generateRaw=()=>calls++;
  f.get('[data-pg-share]').click();f.get('[data-pg-share-to]').click();
  assert.equal(f.opened.length,1);assert.equal(f.opened[0][0],'wechat');assert.equal(f.opened[0][1].actorId,f.actor.id);assert.match(f.opened[0][1].draft,/分享：/);
  assert.equal(calls,0);assert.equal(JSON.stringify(f.ctx.chatMetadata),before);
});

test('切换模式后旧的独立界面按钮不能点赞、分享或生成',t=>{
  const f=setup(t),like=f.get('[data-pg-like]'),refresh=f.get('[data-pg-refresh]');let calls=0;f.ctx.generateRaw=()=>calls++;
  setPhoneGameMode('world');const before=JSON.stringify(f.ctx.chatMetadata);like.click();refresh.click();assert.equal(calls,0);assert.equal(JSON.stringify(f.ctx.chatMetadata),before);
});

test('联动控制器的退出清理不会清空使用共用界面的独立信息流',async t=>{
  const f=setup(t);
  f.set('requestAnimationFrame',fn=>setTimeout(fn,0));
  f.set('cancelAnimationFrame',clearTimeout);
  f.cleanup.push(mountSocialRealism({phone:{current:()=> 'app:rednote'}}));
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(f.screen.querySelectorAll('.wp-rn-card').length,3);
  assert.ok(f.get('[data-pg-refresh]'));
});
