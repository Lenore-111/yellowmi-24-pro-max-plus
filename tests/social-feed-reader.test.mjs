import test from 'node:test';
import assert from 'node:assert/strict';
import { createSocialFeedReader } from '../src/social-feed-reader.js';
import { phoneDom } from './helpers/phone-dom.mjs';
import { mountSocialRealism, renderWeiboMarkup, renderRedNoteMarkup, sanitizeSocialRealismState, buildRedNoteItems, socialTimeLabel } from '../src/social-realism.js';
import { setPhoneGameMode } from '../src/phone-game.js';
import { setPhoneFeedStatus } from '../src/world-phone-feed-status.js';
import { mountWorldPhone } from '../src/world-phone.js';
const capabilities=['social-open-direct','social-create-group','social-respond-friend','social-comment-moment','social-send-message','social-read-conversation','social-set-moment-like'];
function fixture(t, platform='weibo') {
 const f=phoneDom(t),ctx={name1:'玲',characterId:0,characters:[{name:'阿青',avatar:'a.png'}],chatId:'reader',chat:[],chatMetadata:{},saveMetadataDebounced(){}};
 const surface={connected:true,bridgeVersion:2,branchKey:'b1',capabilities,people:[],clock:{absoluteMinute:660},social:{},publicOpinion:{news:[{id:'n1',headline:'河边散步',summary:'原来的内容',source:'小镇报',worldMinute:600,publishedWorldMinute:600}],forums:[{id:'f1',title:'咖啡探店',summary:'老店记录',board:'生活',worldMinute:600,replies:[{author:'甲',text:'原来的评论'}]}]}};
 f.set('SillyTavern',{getContext:()=>ctx});f.set('worldBackstageHost',{phoneBridgeVersion:2,phoneAction(){},getPhoneSurface:()=>structuredClone(surface)});
 f.set('requestAnimationFrame',fn=>{fn();return 1;});f.set('cancelAnimationFrame',()=>{});f.set('CSS',{escape:x=>x});
 f.set('addEventListener',window.addEventListener.bind(window));f.set('removeEventListener',window.removeEventListener.bind(window));f.set('dispatchEvent',window.dispatchEvent.bind(window));
 setPhoneGameMode('world');
 let current='app:'+platform;
 const shell=()=>{f.screen.innerHTML='<section class="wp-view wp-native-app"><header class="wp-app-header"><button data-app-back>‹</button><div><b></b><small></small></div><span></span></header><div class="wp-placeholder-card"></div></section>';};shell();
 const phone={current:()=>current,openApp(app){current='app:'+app;shell();},shareContent(){}};
 const stop=mountSocialRealism({phone});f.cleanup.push(stop);
 const update=()=>{dispatchEvent(new CustomEvent('world-backstage:phone-update'));return new Promise(r=>setTimeout(r,10));};
 return {...f,ctx,surface,phone,update};
}

test('自动到达的新动态先提示，保留输入、焦点和阅读位置，点击后才插入',async t=>{
 const f=fixture(t),input=f.screen.querySelector('[data-social-search] input'),feed=f.screen.querySelector('.wp-wb-feed');
 input.value='输入中的草稿';input.fire('input');input.focus();input.setSelectionRange(2,4);feed.scrollTop=325;
 f.surface.publicOpinion.news.push({id:'n2',headline:'新动态',summary:'新内容',worldMinute:660});await f.update();
 assert.ok(f.screen.querySelector('[data-social-search] input') === input, '输入框没有重建');assert.equal(input.value,'输入中的草稿');assert.equal(feed.scrollTop,325);assert.ok(document.activeElement === input, '保持焦点');
 const notice=f.screen.querySelector('[data-social-incoming]');assert.match(notice.textContent,/1 条新动态/);
 input.value='';input.fire('input');notice.click();assert.equal(f.screen.querySelector('[data-social-incoming]'),null);assert.match(f.screen.textContent,/新动态/);assert.equal(f.screen.querySelector('.wp-wb-feed').scrollTop,0);
});

test('详情评论保持展开，更新只提示，确认后保留原帖与滚动位置',async t=>{
 const f=fixture(t);f.screen.querySelector('[data-social-detail="forum:f1"]').click();
 const shell=f.screen.querySelector('.wp-social-shell');shell.scrollTop=180;
 f.surface.publicOpinion.forums[0].replies.push({author:'乙',text:'后来补的评论'});await f.update();
 assert.match(f.screen.textContent,/原来的评论/);assert.doesNotMatch(f.screen.textContent,/后来补的评论/);assert.equal(shell.scrollTop,180);
 f.screen.querySelector('[data-social-incoming]').click();assert.match(f.screen.textContent,/后来补的评论/);assert.ok(f.screen.querySelector('.wp-wb-detail'));assert.equal(shell.scrollTop,180);
});

test('暂存时撤回内容立即移除；断线和切聊天不能保留旧世界卡片',async t=>{
 const f=fixture(t);f.surface.publicOpinion.news.push({id:'n2',headline:'待展开',summary:'新内容'});await f.update();
 f.surface.publicOpinion.news=f.surface.publicOpinion.news.filter(n=>n.id!=='n1');await f.update();assert.doesNotMatch(f.screen.textContent,/原来的内容/);
 f.ctx.chatId='other';f.ctx.chatMetadata={};setPhoneGameMode('world');f.surface.branchKey='b2';f.surface.publicOpinion={news:[],forums:[]};await f.update();assert.doesNotMatch(f.screen.textContent,/咖啡探店/);assert.equal(f.screen.querySelector('[data-social-incoming]'),null);
 f.surface.connected=false;await f.update();assert.match(f.screen.textContent,/暂时无法连接微博/);
});

test('状态与错误可见，状态变化不重建帖子，重试可触发刷新按钮',t=>{
 const f=fixture(t),feed=f.screen.querySelector('.wp-wb-feed');
 setPhoneFeedStatus('weibo','loading');assert.match(f.screen.querySelector('[data-feed-status-label]').textContent,/正在更新/);
 setPhoneFeedStatus('weibo','error','接口暂时不可用');assert.match(f.screen.textContent,/接口暂时不可用/);assert.equal(f.screen.querySelector('[data-phone-feed-retry]').hidden,false);
 assert.equal(f.screen.querySelector('.wp-wb-feed'),feed);
 setPhoneFeedStatus('weibo','synced');assert.match(f.screen.querySelector('[data-feed-status-label]').textContent,/已同步/);assert.equal(f.screen.querySelector('[data-phone-feed-retry]').hidden,true);
});

test('微博好友筛选与小红书生活分类有各自行为，封面颜色不受排序改变',()=>{
 const snapshot={connected:true,news:[],forums:[{id:'a',title:'修灯日常',summary:'好友今天休息',board:'阿青',raw:{sourceKind:'moment'}},{id:'b',title:'咖啡探店',summary:'一杯咖啡',board:'生活'},{id:'c',title:'公园散步',summary:'出行日记',board:'生活'}]};
 const state=sanitizeSocialRealismState({weibo:{feedFilter:'following'},rednote:{category:'food'}});
 const wb=renderWeiboMarkup(snapshot,state.weibo);assert.match(wb,/修灯日常/);assert.doesNotMatch(wb,/咖啡探店/);
 const rn=renderRedNoteMarkup(snapshot,state.rednote);assert.match(rn,/咖啡探店/);assert.doesNotMatch(rn,/公园散步/);assert.match(rn,/笔记分类/);
 const seeds=new Map(buildRedNoteItems(snapshot).map(i=>[i.id,i.coverSeed]));snapshot.forums.reverse();for(const i of buildRedNoteItems(snapshot))assert.equal(i.coverSeed,seeds.get(i.id));
});

test('发布时间固定，后续更新不会将老帖显示成刚刚发布',()=>{
 assert.equal(socialTimeLabel({publishedWorldMinute:600,worldMinute:660},{clock:{absoluteMinute:660}}),'1小时前');
});

test('设置统计收进连接详情，刷新保留展开与滚动，开关可用',t=>{
 const f=fixture(t);f.stage.remove();const phone=mountWorldPhone();f.cleanup.push(()=>phone.destroy());phone.openApp('settings');
 let details=document.querySelector('[data-connection-details]');assert.equal(details.open,false);assert.ok(details.querySelector('.wp-settings-list'));details.open=true;
 document.querySelector('[data-settings-scroll]').scrollTop=125;phone.refresh();assert.equal(document.querySelector('[data-connection-details]').open,true);assert.equal(document.querySelector('[data-settings-scroll]').scrollTop,125);
 const toggle=document.querySelector('[data-world-feed-auto]');assert.equal(toggle.getAttribute('aria-label'),'自动同步世界动态');toggle.click();assert.equal(toggle.getAttribute('aria-checked'),'false');
});


test('缓存失效期间保留仍可见的好友投影，实际撤回好友动态则立即移除',()=>{
 const reader=createSocialFeedReader((platform,snapshot)=>snapshot.forums.map(item=>({id:item.id,title:item.title,body:item.summary,replies:[]})));
 const raw={id:'phonefeed_weibo_moment_m1',phoneFeed:true,phonePlatform:'weibo',sourceKind:'moment',sourceMomentId:'m1'};
 const first={connected:true,news:[],forums:[{id:raw.id,title:'好友日常',summary:'原文',raw}],moments:[{id:'m1'}]};
 reader.select('weibo',first);
 const updating={...first,forums:[{id:'fresh',title:'新帖子',summary:'内容'}]};
 const pending=reader.select('weibo',updating);assert.equal(pending.displayChanged,false);assert.equal(pending.snapshot.forums.length,1);assert.equal(pending.added,1);
 const revoked=reader.select('weibo',{...updating,moments:[]});assert.equal(revoked.displayChanged,true);assert.equal(revoked.snapshot.forums.length,0);
});
