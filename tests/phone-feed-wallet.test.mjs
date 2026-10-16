import test from 'node:test';
import assert from 'node:assert/strict';
import {phoneDom} from './helpers/phone-dom.mjs';
import {parsePhoneGameResponse} from '../src/phone-game-response.js';
import {readPhoneGameState,capturePhoneGameScope,PHONE_GAME_KEY,queuePhoneGameInteraction,applyPhoneGameReply,flushPhoneGameMetadata} from '../src/phone-game.js';
import {generatePhoneGameContent,phoneGameGenerationStatus} from '../src/phone-game-ai.js';

function setup(t) {
  const f=phoneDom(t),ctx={name1:'玩家',characterId:0,characters:[{name:'陆祈',avatar:'lu.png',description:'修灯匠'}],chatId:'wallet',chat:[{mes:'夜市开门了'}],chatMetadata:{},saveMetadataDebounced(){}};
  f.set('SillyTavern',{getContext:()=>ctx});f.set('worldBackstageHost',undefined);
  return {f,ctx};
}

test('旧100元存档一次性补900，保留帖子、礼物、工资、支出及另一存档',async t=>{
  const {ctx}=setup(t),state=readPhoneGameState(),actor=state.actors[0],key=capturePhoneGameScope().key;
  delete state.startingFunds;state.balance=145;state.earned=70;state.spent=25;state.tick=8;
  state.posts=[{id:'p',actorId:actor.id,platform:'rednote',title:'逛夜市',text:'买到了热饼'}];
  state.events=[{id:'e',actorId:actor.id,kind:'gift',giftId:'coffee',status:'pending'}];
  state.ledger=[{id:'buy',text:'咖啡',amount:-25,tick:1},{id:'wage',text:'工资',amount:70,tick:2}];
  const other=JSON.parse(JSON.stringify(state));ctx.chatMetadata[PHONE_GAME_KEY].saves={[key]:state,other};
  const upgraded=readPhoneGameState();assert.equal(upgraded.balance,1045);assert.equal(upgraded.earned,70);assert.equal(upgraded.spent,25);
  assert.equal(upgraded.posts[0].id,'p');assert.equal(upgraded.events[0].status,'pending');assert.equal(upgraded.ledger.length,3);
  assert.equal(upgraded.ledger.at(-1).amount,900);assert.deepEqual(ctx.chatMetadata[PHONE_GAME_KEY].saves.other,other);
  await flushPhoneGameMetadata(capturePhoneGameScope());ctx.chatMetadata=JSON.parse(JSON.stringify(ctx.chatMetadata));
  assert.equal(readPhoneGameState().balance,1045);assert.equal(readPhoneGameState().ledger.length,3);
  applyPhoneGameReply('e',{text:'收到咖啡了'});
  queuePhoneGameInteraction({actorId:actor.id,kind:'gift',giftId:'coffee'});
  assert.equal(readPhoneGameState().balance,1020);assert.equal(readPhoneGameState().ledger.filter(x=>x.text==='初始资金补发').length,1);
});

test('旧未消费存档升到1000，新1000存档消费到100不再补发，未知本金不改动',t=>{
  const {ctx}=setup(t),state=readPhoneGameState(),key=capturePhoneGameScope().key;
  delete state.startingFunds;state.balance=100;ctx.chatMetadata[PHONE_GAME_KEY].saves[key]=state;
  assert.equal(readPhoneGameState().balance,1000);assert.equal(readPhoneGameState().ledger.at(-1).amount,900);
  ctx.chatMetadata[PHONE_GAME_KEY].saves[key]={...state,balance:100,spent:900};
  assert.equal(readPhoneGameState().balance,100);assert.equal(readPhoneGameState().startingFunds,1000);assert.equal(readPhoneGameState().ledger.length,0);
  ctx.chatMetadata[PHONE_GAME_KEY].saves[key]={...state,balance:500,earned:0,spent:0};
  assert.equal(readPhoneGameState().balance,500);assert.equal(readPhoneGameState().ledger.length,0);
});

test('完整 JSON 与代码块正常，截断只恢复闭合帖子，转义引号和嵌套回复不误判',()=>{
  const post={actorId:'a',text:'他说“这有一个 }”，还写了 "["。',replies:[{text:'括号 } ]'}]};
  assert.deepEqual(parsePhoneGameResponse('```json\n'+JSON.stringify({posts:[post]})+'\n```',{feed:true}),{value:{posts:[post]},partial:false});
  const broken=JSON.stringify({posts:[post]}).slice(0,-2)+',{"actorId":"a","text":"未结束';
  assert.deepEqual(parsePhoneGameResponse(broken,{feed:true}),{value:{posts:[post]},partial:true});
  assert.deepEqual(parsePhoneGameResponse(JSON.stringify({posts:[post]}).slice(0,-1),{feed:true}).value.posts,[post]);
  assert.throws(()=>parsePhoneGameResponse('{"posts":[{"actorId":"a","text":"半篇',{feed:true}),/被截断/);
  assert.throws(()=>parsePhoneGameResponse('{"posts":['+JSON.stringify(post)+',BROKEN]}',{feed:true}),/没有返回有效动态/);
  assert.throws(()=>parsePhoneGameResponse('{"text":"互动回复没有写完'),/互动已保存/);
});

test('小红书和朋友圈不再固定 token，上限交给模型；条数可自定义且截断只保留完整帖子',async t=>{
  const {f,ctx}=setup(t),state=readPhoneGameState(),actor=state.actors[0],key=capturePhoneGameScope().key;
  const storage=new Map([['echo_phone_feed_count:rednote','7'],['echo_phone_feed_count:moments','5']]);
  f.set('localStorage',{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value))});
  state.posts=[{id:'old',actorId:actor.id,platform:'rednote',title:'昨天',text:'昨天修灯'}];ctx.chatMetadata[PHONE_GAME_KEY].saves[key]=state;
  const newPost={actorId:actor.id,title:'今天',text:'今天买了夜市的烤饼。'};
  ctx.generateRaw=async options=>{
    assert.equal(Object.hasOwn(options,'responseLength'),false);
    assert.match(options.prompt,/本次目标生成7条新帖/);
    assert.match(options.prompt,/正文80到220字/);
    return '{"posts":['+JSON.stringify(newPost)+',{"actorId":"'+actor.id+'","text":"后半篇';
  };
  await generatePhoneGameContent({platform:'rednote'});
  assert.equal(readPhoneGameState().posts.length,2);assert.equal(readPhoneGameState().posts.at(-1).title,'今天');
  assert.equal(readPhoneGameState().balance,1000);assert.match(phoneGameGenerationStatus().error,/已保留完整返回的 1 条动态/);

  ctx.generateRaw=async options=>{
    assert.equal(Object.hasOwn(options,'responseLength'),false);
    assert.match(options.prompt,/本次目标生成5条新帖/);
    return JSON.stringify({posts:[{actorId:actor.id,text:'朋友圈完整一条'}]});
  };
  await generatePhoneGameContent({platform:'moments'});
  assert.equal(readPhoneGameState().posts.filter(post=>post.platform==='moments').length,1);

  ctx.generateRaw=async()=>'{"posts":[{"actorId":"'+actor.id+'","text":"截断';
  await assert.rejects(generatePhoneGameContent({platform:'rednote'}),/动态内容被截断/);
  assert.equal(readPhoneGameState().posts.filter(post=>post.platform==='rednote').length,2);assert.equal(readPhoneGameState().balance,1000);
  ctx.generateRaw=async()=>JSON.stringify({posts:[{...newPost,title:'重试成功'}]});await generatePhoneGameContent({platform:'rednote'});
  assert.equal(readPhoneGameState().posts.filter(post=>post.platform==='rednote').at(-1).title,'重试成功');assert.equal(phoneGameGenerationStatus().error,'');
  assert.equal(ctx.chatMetadata.world_backstage_v1,undefined);
});
