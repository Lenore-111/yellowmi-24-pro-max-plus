import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

// Run the actual module bodies with an isolated SillyTavern host, controllable
// model promises and virtual time. No browser or model credentials are needed.
const paths = ["src/phone-game-actors.js","src/phone-game.js","src/phone-game-ai.js","src/phone-game-view.js","src/world-backstage-bridge.js"];
const sources = Object.fromEntries(await Promise.all(paths.map(async path =>
  [path, await readFile(new URL('../' + path, import.meta.url), 'utf8')])));


function stripModule(source) {
  return source.replace(/^import[\s\S]*?;\s*/gm, '')
    .replace(/^export\s*\{[^\n]*\}(?:\s+from\s+[^;]+)?;\s*/gm, '')
    .replace(/\bexport\s+(?=(?:async\s+)?(?:function|const|let|class))/g, '');
}
function moduleFrom(source, imports, exports) {
  return new Function(...Object.keys(imports), stripModule(source) + ';return {' + exports.join(',') + '};')(...Object.values(imports));
}
function createHarness(sources) {
  let nextId = 0, now = 0, timerId = 0;
  const timers = new Map(), handlers = new Map(), data = new Map();
  const clock = {
    setTimeout(fn, ms) { const id = ++timerId; timers.set(id, {fn, at: now + ms, interval: 0}); return id; },
    setInterval(fn, ms) { const id = ++timerId; timers.set(id, {fn, at: now + ms, interval: ms}); return id; },
    clearTimeout(id) { timers.delete(id); }, clearInterval(id) { timers.delete(id); },
    advance(ms) {
      const end = now + ms;
      while (true) {
        const due = [...timers].filter(([, t]) => t.at <= end).sort((a,b) => a[1].at - b[1].at)[0];
        if (!due) break;
        now = due[1].at;
        if (due[1].interval) due[1].at += due[1].interval; else timers.delete(due[0]);
        due[1].fn();
      }
      now = end;
    },
  };
  const eventSource = {
    on(name, fn) { if (!handlers.has(name)) handlers.set(name,new Set()); handlers.get(name).add(fn); },
    off(name, fn) { handlers.get(name)?.delete(fn); },
    emit(name, ...args) { for (const fn of [...(handlers.get(name) || [])]) fn(...args); },
  };
  const ctx = { characterId: 0, characters: [{avatar:'ash.png',name:'Ash',description:'成年女工程师'}],
    name1:'玲',chatId:'chat-one',chatMetadata:{},saveMetadataDebounced(){},
    eventSource,eventTypes:{GENERATION_STARTED:'started',GENERATION_STOPPED:'stopped'} };
  const globals = {
    ...clock, console:{warn(){},info(){},error(){}}, SillyTavern:{getContext:()=>ctx},crypto:{randomUUID:()=> 'id-' + ++nextId},
    localStorage:{getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)},
  };
  const actors = moduleFrom(sources['src/phone-game-actors.js'], {}, ['collectPhoneGameActors','inferPhoneGamePronoun','phoneGameActorPronoun','isPhoneGameScenarioActor']);
  const game = moduleFrom(sources['src/phone-game.js'], {globalThis:globals,DELIVERY_COLA:{id:'cola',name:'可乐',price:18},readWorldBackstage:()=>({contacts:[]}),...actors},
    ['PHONE_GAME_KEY','capturePhoneGameScope','isPhoneGameScopeCurrent','readPhoneGameMode','setPhoneGameMode','readPhoneGameState','applyPhoneGameReply','applyPhoneGamePosts','PHONE_GAME_GIFTS',
     'queuePhoneGameInteraction','togglePhoneGameLike','startPhoneGameShift','servePhoneGameCoffee','phoneGameClock','phoneGameRelationLabel','phoneGameEventExport','phoneGameActorPronoun','phoneGameEventDisplayText','PHONE_GAME_RECIPES','subscribePhoneGameModeChange','startPhoneGameCall','endPhoneGameCall','flushPhoneGameMetadata']);
  const tavern = {is_send_press:false}, groupChats = {is_group_generating:false};
  const ai = moduleFrom(sources['src/phone-game-ai.js'], {globalThis:globals,console:globals.console,tavern,groupChats,...game},
    ['generatePhoneGameContent','isPhoneGameGenerating','phoneGameGenerationStatus','subscribePhoneGameGeneration','cancelPhoneGameGeneration','PHONE_GAME_GENERATION_TIMEOUT_MS','isMainGenerationActive']);
  const view = moduleFrom(sources['src/phone-game-view.js'], {globalThis:globals,DELIVERY_COLA:{id:'cola'},dCatQuote:()=>'',...game,...ai}, ['renderPhoneGameApp']);
  const deferred = () => { let resolve,reject; const promise = new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject}; };
  function model(cooperative = true) {
    const task = deferred();
    ctx.generateRaw = () => {
      if (cooperative) {
        const abort = () => {eventSource.off('stopped',abort);task.reject(new Error('aborted'));};
        eventSource.on('stopped',abort);
        task.promise.then(()=>eventSource.off('stopped',abort),()=>eventSource.off('stopped',abort));
      }
      return task.promise;
    };
    return task;
  }
  function screenMock() {
    return { _html:'',nodes:{}, get innerHTML(){return this._html;},set innerHTML(value){this._html=value;this.nodes={};},
      querySelector(selector) {
        if (selector === '[data-phone-game-app]') {
          const match = this._html.match(/data-phone-game-view="([^"]+)"/);
          return match ? {dataset:{phoneGameView:match[1]}} : null;
        }
        if (selector === '[data-app-back]' ||
          selector === '[data-pg-message]' && this._html.includes('data-pg-message') ||
          selector === '[data-pg-draft]' && this._html.includes('data-pg-draft') ||
          selector === '[data-pg-cancel]' && this._html.includes('data-pg-cancel')) {
          return this.nodes[selector] ||= {addEventListener(type, fn){this[type]=fn;}};
        }
        return null;
      },querySelectorAll(){return [];}
    };
  }
  return {ctx,game,ai,view,model,clock,tavern,groupChats,timers,handlers,screenMock,globals};
}
async function flush() { for(let i=0;i<16;i++) await Promise.resolve(); }

test('快速切模式后旧短信结果不结算，原短信保留供重试', async () => {
  const h=createHarness(sources),actor=h.game.readPhoneGameState().actors[0];
  const q=h.game.queuePhoneGameInteraction({actorId:actor.id,kind:'sms',text:'稍后联系'}),task=h.model(false);
  const pending=h.ai.generatePhoneGameContent({eventId:q.eventId}),rejected=assert.rejects(pending,/模式/);
  h.game.setPhoneGameMode('world');h.game.setPhoneGameMode('game');
  task.resolve(JSON.stringify({text:'迟到的短信',affinityDelta:3,memory:'不应写入'}));await rejected;await flush();
  const state=h.game.readPhoneGameState();assert.equal(state.events[0].status,'pending');assert.equal(state.relations[actor.id].memory,'');
  assert.equal(h.ai.isPhoneGameGenerating(),false);assert.equal(h.timers.size,0);
});

test('切模式挂断电话，迟到接听不能复活通话', async () => {
  const h=createHarness(sources),state=h.game.readPhoneGameState();
  const call=h.game.startPhoneGameCall(state.communications.contacts[0].number),task=h.model(false);
  const pending=h.ai.generatePhoneGameContent({eventId:call.eventId}),rejected=assert.rejects(pending,/模式/);
  h.game.setPhoneGameMode('world');h.game.setPhoneGameMode('game');
  task.resolve(JSON.stringify({answered:true,text:'迟到接听'}));await rejected;await flush();
  const next=h.game.readPhoneGameState();assert.equal(next.communications.calls[0].outcome,'cancelled');assert.equal(next.events[0].status,'cancelled');
});

test('独立模式不调用世界写命令，世界旧确认在模式切换后失效', async () => {
  const h=createHarness(sources);let calls=0,resolve;
  const surface={connected:true,bridgeVersion:2,branchKey:'a',capabilities:['social-open-direct','social-create-group','social-respond-friend','social-comment-moment','social-send-message','social-read-conversation','social-set-moment-like']};
  h.globals.worldBackstageHost={phoneBridgeVersion:2,getPhoneSurface:()=>surface,phoneAction:()=>{calls++;return new Promise(done=>resolve=done);}};
  const bridge=moduleFrom(sources['src/world-backstage-bridge.js'],{globalThis:h.globals,...h.game},['sendWorldBackstageMessage']);
  await assert.rejects(bridge.sendWorldBackstageMessage('direct-a','独立消息'),/独立模式/);assert.equal(calls,0);
  h.game.setPhoneGameMode('world');const pending=bridge.sendWorldBackstageMessage('direct-a','世界消息'),rejected=assert.rejects(pending,/模式已切换/);
  h.game.setPhoneGameMode('game');h.game.setPhoneGameMode('world');resolve(surface);await rejected;assert.equal(calls,1);
});


test("正文推进、编辑与候选切换不重置手机存档", async () => {

const h=createHarness(sources);const s=h.game.readPhoneGameState();const actor=s.actors[0];
h.game.startPhoneGameShift(undefined,()=>0);for(let i=0;i<3;i++)h.game.servePhoneGameCoffee(['咖啡','水']);
const q=h.game.queuePhoneGameInteraction({actorId:actor.id,kind:'gift',giftId:'coffee'});
h.game.applyPhoneGameReply(q.eventId,{text:'谢谢',affinityDelta:3,memory:'收到咖啡'});
const before=h.game.readPhoneGameState(), key=h.game.capturePhoneGameScope().key;
for(const sourceKey of ['12:0:new','12:1:swipe','12:1:edited']) {
 h.ctx.chatMetadata.world_backstage_v1={currentState:{lastCommit:{sourceKey}}};
 assert(h.game.capturePhoneGameScope().key===key,'scope changed');
 const after=h.game.readPhoneGameState();assert(after.balance===145&&after.events.length===1&&after.relations[actor.id].affinity===3,'save reset');
}
h.ctx.chatId='other';assert(h.game.readPhoneGameState().events.length===0,'chat isolation failed');
h.ctx.chatId='chat-one';h.ctx.name1='另一身份';assert(h.game.readPhoneGameState().events.length===0,'persona isolation failed');

});

test("旧存档恢复完整进度且保留所有原记录", async () => {

const h=createHarness(sources), full=h.game.readPhoneGameState();
full.tick=8;full.balance=245;full.earned=170;full.posts=[{id:'post',actorId:full.actors[0].id,platform:'weibo',text:'生活记录',tick:8}];
const reset={...full,tick:0,balance:100,earned:0,posts:[]};
const key=JSON.stringify(['card:ash.png','玲','10:0:old','chat-one']);
const resetKey=JSON.stringify(['card:ash.png','玲','12:0:new','chat-one']);
const foreign=JSON.stringify(['card:ash.png','别人','10:0:other','chat-one']);
h.ctx.chatMetadata[h.game.PHONE_GAME_KEY]={mode:'game',saves:{[key]:full,[resetKey]:reset,[foreign]:{...full,tick:100,balance:99999}}};
const migrated=h.game.readPhoneGameState();assert(migrated.balance===245&&migrated.posts.length===1,'wrong legacy choice');
const saves=h.ctx.chatMetadata[h.game.PHONE_GAME_KEY].saves;assert(Object.keys(saves).length===4&&saves[key].balance===245,'legacy overwritten');
migrated.balance=888;h.ctx.chatMetadata[h.game.PHONE_GAME_KEY].saves[h.game.capturePhoneGameScope().key]=migrated;
assert(h.game.readPhoneGameState().balance===888,'stable save replaced');

});

test("超时能重试礼物，余额不会再次扣除", async () => {

const h=createHarness(sources),actor=h.game.readPhoneGameState().actors[0];
const q=h.game.queuePhoneGameInteraction({actorId:actor.id,kind:'gift',giftId:'coffee'});
h.model();const pending=h.ai.generatePhoneGameContent({eventId:q.eventId});const caught=pending.catch(e=>e);
h.clock.advance(h.ai.PHONE_GAME_GENERATION_TIMEOUT_MS);const error=await caught;await flush();
assert(error.message.includes('一分钟'),'timeout missing');assert(!h.ai.isPhoneGameGenerating()&&h.timers.size===0,'lock/timer leak');
assert(h.game.readPhoneGameState().balance===75&&h.game.readPhoneGameState().events[0].status==='pending','gift changed');
h.ctx.generateRaw=async()=>JSON.stringify({text:'谢谢你的咖啡',affinityDelta:2});
await h.ai.generatePhoneGameContent({eventId:q.eventId});assert(h.game.readPhoneGameState().balance===75&&h.game.readPhoneGameState().events[0].status==='replied','retry charged twice');

});

test("取消后迟到结果不结算、不并发新请求", async () => {

const h=createHarness(sources),actor=h.game.readPhoneGameState().actors[0],q=h.game.queuePhoneGameInteraction({actorId:actor.id,text:'你好'});
const task=h.model(false),pending=h.ai.generatePhoneGameContent({eventId:q.eventId}),caught=pending.catch(e=>e);
h.ai.cancelPhoneGameGeneration();await caught;assert(!h.ai.isPhoneGameGenerating(),'UI locked');
let stopped=false;try{await h.ai.generatePhoneGameContent({eventId:q.eventId});}catch(e){stopped=e.message.includes('正在停止');}assert(stopped,'overlapping raw request');
task.resolve(JSON.stringify({text:'迟到的回应',affinityDelta:3}));await flush();
assert(h.game.readPhoneGameState().events[0].status==='pending','late response written');
h.ctx.generateRaw=async()=>JSON.stringify({text:'重试成功',affinityDelta:1});await h.ai.generatePhoneGameContent({eventId:q.eventId});
assert(h.game.readPhoneGameState().events[0].reply==='重试成功'&&h.game.readPhoneGameState().relations[actor.id].affinity===1,'duplicate settlement');

});

test("页面重开后自动显示已保存回应，注销后不再刷新", async () => {

const h=createHarness(sources), actorId=h.game.readPhoneGameState().actors[0].id, screen=h.screenMock(),task=h.model();
const unmountA=h.view.renderPhoneGameApp(screen,{app:'wechat',actorId,goHome(){},openApp(){}});
screen.querySelector('[data-pg-draft]').input({target:{value:'晚上好'}});
screen.querySelector('[data-pg-message]').submit({preventDefault(){}});
unmountA();const unmountB=h.view.renderPhoneGameApp(screen,{app:'wechat',actorId,goHome(){},openApp(){}});
assert(screen.innerHTML.includes('停止等待'),'new page lost busy status');
task.resolve(JSON.stringify({text:'晚上好，玲',affinityDelta:1}));await flush();
assert(screen.innerHTML.includes('晚上好，玲')&&!screen.innerHTML.includes('等待回应'),'stale page');
unmountB();screen.innerHTML='desktop';
h.ctx.generateRaw=async()=>JSON.stringify({posts:[{actorId,text:'动态'}]});await h.ai.generatePhoneGameContent({platform:'weibo'});
assert(screen.innerHTML==='desktop','unmounted view refreshed');

});

test("流式、非流式及群聊正文生成时均不调用手机模型", async () => {

const h=createHarness(sources),actorId=h.game.readPhoneGameState().actors[0].id;let calls=0;
h.ctx.generateRaw=async()=>{calls++;return JSON.stringify({posts:[{actorId,text:'新动态'}]});};
for(const kind of ['stream','plain','group','export']) {
 h.ctx.streamingProcessor=kind==='stream'?{isStopped:false}:null;
 h.tavern.is_send_press=kind==='plain';h.groupChats.is_group_generating=kind==='group';
 h.tavern.isGenerating=kind==='export'?()=>true:undefined;
 let blocked=false;try{await h.ai.generatePhoneGameContent({platform:'weibo'});}catch(e){blocked=e.message.includes('正文正在生成');}
 assert(blocked&&calls===0,'host generation overlap '+kind);
}
h.tavern.isGenerating=()=>false;h.ctx.streamingProcessor={isStopped:true};h.groupChats.is_group_generating=false;h.tavern.is_send_press=false;
await h.ai.generatePhoneGameContent({platform:'weibo'});assert(calls===1,'stopped stream blocks forever');

});

test("切换聊天或手机模式会停止等待并保留原互动", async () => {

for(const modeSwitch of [false,true]) {
 const h=createHarness(sources),actor=h.game.readPhoneGameState().actors[0],q=h.game.queuePhoneGameInteraction({actorId:actor.id,text:'你好'});
 h.model();const pending=h.ai.generatePhoneGameContent({eventId:q.eventId}),caught=pending.catch(e=>e);
 if(modeSwitch)h.game.setPhoneGameMode('world');else h.ctx.chatId='other';
 h.clock.advance(250);await caught;await flush();
 assert(!h.ai.isPhoneGameGenerating()&&h.timers.size===0,'scope cancellation leak');
 if(modeSwitch)h.game.setPhoneGameMode('game');else h.ctx.chatId='chat-one';
 assert(h.game.readPhoneGameState().events[0].status==='pending','original event lost');
}

});

test("正文中途开始时不会向宿主广播停止事件", async () => {

const h=createHarness(sources),actorId=h.game.readPhoneGameState().actors[0].id,task=h.model(false);let stops=0;
h.ctx.eventSource.on('stopped',()=>stops++);
const pending=h.ai.generatePhoneGameContent({platform:'weibo'}),caught=pending.catch(e=>e);
h.ctx.eventSource.emit('started','normal',{},false);await caught;
assert(stops===0&&!h.ai.isPhoneGameGenerating()&&h.timers.size===0,'main generation stopped');
task.resolve(JSON.stringify({posts:[{actorId,text:'迟到动态'}]}));await flush();
assert(h.game.readPhoneGameState().posts.length===0,'late posts written');
assert((h.handlers.get('started')?.size||0)===0,'main-start listener leaked');

});
