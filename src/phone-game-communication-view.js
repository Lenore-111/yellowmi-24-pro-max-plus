import {
  capturePhoneGameScope, isPhoneGameScopeCurrent, readPhoneGameMode, readPhoneGameState,
  phoneGameDialNumber, phoneGameClock, queuePhoneGameInteraction, startPhoneGameCall, endPhoneGameCall,
  togglePhoneGameContactFavorite, savePhoneGameSmsDraft,
} from './phone-game.js?v=0.3.0-alpha.27';
import { generatePhoneGameContent, isPhoneGameGenerating, phoneGameGenerationStatus, subscribePhoneGameGeneration, cancelPhoneGameGeneration } from './phone-game-ai.js?v=0.3.0-alpha.27';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const outcomes = { dialing:'正在呼叫', connected:'通话中', ended:'已结束', cancelled:'已取消', declined:'对方未接听', unavailable:'未接通' };
const elapsed = call => {
  const seconds = call?.connectedAt ? Math.max(0, Math.floor(((call.endedAt || Date.now()) - call.connectedAt) / 1000)) : 0;
  return `${String(Math.floor(seconds / 60)).padStart(2,'0')}:${String(seconds % 60).padStart(2,'0')}`;
};

export function renderPhoneGameCommunicationApp(screen, { app, goHome, openApp, actorId = '', autoCall = false }) {
  if (readPhoneGameMode() !== 'game') return () => {};
  const scope = capturePhoneGameScope(), viewId = Math.random().toString(36).slice(2);
  let stopped = false, painted = false, timer = null, paintedRoute = '';
  const first = readPhoneGameState(scope);
  const initialContact = first.communications.contacts.find(contact => contact.actorId === actorId);
  const activeCall = first.communications.calls.slice().reverse().find(call => ['dialing','connected'].includes(call.outcome));
  const ui = { tab: initialContact ? 'keypad' : 'recents', mode: actorId ? 'thread' : 'list', actorId,
    number: initialContact?.number || '', draft: first.communications.drafts[actorId || 'new'] || '', query:'', callId:activeCall?.id || '',
    callDraft:'', followReplies:true, ...phoneGameGenerationStatus(scope), requestId:0 };
  const current = () => !stopped && isPhoneGameScopeCurrent(scope) && readPhoneGameMode() === 'game'
    && screen.querySelector('[data-phone-game-app]')?.dataset.phoneGameView === viewId;
  const contactOf = state => state.communications.contacts.find(contact => contact.actorId === ui.actorId);
  const actorOf = (state, id) => state.actors.find(actor => actor.id === id);
  function action(fn) {
    if (!current()) return;
    try { fn(); ui.error = ''; } catch (error) { ui.error = String(error.message || error); }
    if (current()) paint();
  }
  async function request(eventId, dialing = false) {
    const requestId = ++ui.requestId, callId = ui.callId;
    ui.busy = true; ui.error = ''; paint();
    try { await generatePhoneGameContent({ eventId }, scope); }
    catch (error) {
      if (dialing && isPhoneGameScopeCurrent(scope) && readPhoneGameMode() === 'game') endPhoneGameCall(callId, scope, 'unavailable');
      if (requestId === ui.requestId && current()) ui.error = String(error.message || error);
    } finally {
      if (requestId === ui.requestId) { ui.busy = false; if (current()) paint(); }
    }
  }
  function dial(number) {
    action(() => {
      if (isPhoneGameGenerating()) throw new Error('手机正在等待一次回应，结束后再拨号。');
      const result = startPhoneGameCall(number, scope);
      ui.callId = result.callId; ui.callDraft = '';
      if (result.eventId) void request(result.eventId, true);
    });
  }
  function hangup() {
    action(() => { endPhoneGameCall(ui.callId, scope); ui.requestId++; ui.busy = false; ui.callId = ''; ui.tab = 'recents'; ui.callDraft = ''; });
  }
  function openThread(id) {
    const state = readPhoneGameState(scope), contact = state.communications.contacts.find(contact => contact.actorId === id);
    ui.actorId = id; ui.number = contact?.number || ''; ui.mode = 'thread'; ui.draft = state.communications.drafts[id] || ''; ui.error = ''; paint();
  }
  function sendSms() {
    action(() => {
      if (ui.busy || isPhoneGameGenerating()) throw new Error('还有一次手机回应进行中，稍等一下。');
      const state = readPhoneGameState(scope), contact = state.communications.contacts.find(contact => contact.number === phoneGameDialNumber(ui.number));
      if (!contact) { savePhoneGameSmsDraft('new', ui.draft, scope); throw new Error('这个号码不在当前通讯录中，短信未发送；草稿已保留。'); }
      const { eventId } = queuePhoneGameInteraction({ actorId:contact.actorId, kind:'sms', text:ui.draft }, scope);
      savePhoneGameSmsDraft(contact.actorId, '', scope); savePhoneGameSmsDraft('new', '', scope);
      ui.actorId = contact.actorId; ui.mode = 'thread'; ui.draft = ''; ui.followReplies = true; void request(eventId);
    });
  }
  function sendCallLine() {
    action(() => {
      if (ui.busy || isPhoneGameGenerating()) throw new Error('等对方说完这一句再继续。');
      const call = readPhoneGameState(scope).communications.calls.find(call => call.id === ui.callId);
      const { eventId } = queuePhoneGameInteraction({ actorId:call?.actorId, kind:'call', callId:call?.id, text:ui.callDraft }, scope);
      ui.callDraft = ''; ui.followReplies = true; void request(eventId);
    });
  }
  function contacts(state) {
    const entries = state.communications.contacts.filter(contact => (ui.tab !== 'favorites' || contact.favorite)
      && `${actorOf(state, contact.actorId)?.name} ${contact.number}`.includes(ui.query.trim()));
    return `<label class="wpg-comm-search">搜索<input data-gpc-search value="${esc(ui.query)}" placeholder="姓名或号码" aria-label="搜索通讯录"></label><div class="wpg-comm-list">${entries.map(contact => {
      const actor = actorOf(state, contact.actorId);
      return `<article class="wpg-contact" data-gpc-contact><span class="wpg-avatar">${esc(actor.name.slice(0,1))}</span><div><b>${esc(actor.name)}</b><small>${esc(contact.number)}${contact.virtual ? ' · 游戏内号码' : ''}</small></div><button type="button" data-gpc-favorite="${esc(actor.id)}" aria-label="${contact.favorite?'取消收藏':'收藏'}${esc(actor.name)}" aria-pressed="${contact.favorite}">${contact.favorite?'★':'☆'}</button><button type="button" data-gpc-call="${esc(contact.number)}" aria-label="呼叫${esc(actor.name)}">☎</button><button type="button" data-gpc-sms="${esc(actor.id)}" aria-label="给${esc(actor.name)}发短信">短信</button></article>`;
    }).join('')}<p class="wpg-empty" data-gpc-search-empty ${entries.length?'hidden':''}>没有找到联系人。</p></div>`;
  }
  function callPanel(state, call) {
    const actor = actorOf(state, call.actorId), ongoing = ['dialing','connected'].includes(call.outcome);
    const events = state.events.filter(event => event.callId === call.id && event.status !== 'cancelled');
    return `<section class="wpg-call"><div class="wpg-call-person"><span>${esc(actor?.name.slice(0,1) || '☎')}</span><h2>${esc(actor?.name || call.number)}</h2><small>${esc(call.number)}</small><p role="status">${outcomes[call.outcome]}${call.outcome==='connected' ? ` · <span data-gpc-duration>${elapsed(call)}</span>` : ''}</p></div><div class="wpg-call-lines">${events.map((event,index) => `<article>${index ? `<p class="is-user"><b>你</b>${esc(event.text)}</p>` : ''}${event.status==='replied' ? `<p><b>${esc(actor?.name)}</b>${esc(event.reply)}</p>` : `<p class="wpg-muted">${ui.busy?'等待对方回应…':'回应尚未完成'}</p>${!ui.busy && ongoing ? `<button type="button" data-gpc-retry="${esc(event.id)}">重试回应</button>` : ''}`}</article>`).join('')}${call.outcome==='unavailable' && !ui.error ? '<p>这个号码未接通，请从通讯录选择角色。</p>' : ''}</div>${call.outcome==='connected' ? `<form data-gpc-call-form class="wpg-comm-compose"><textarea rows="1" data-gpc-call-draft placeholder="在电话里说点什么…" aria-label="通话发言" ${ui.busy?'readonly':''}>${esc(ui.callDraft)}</textarea><button type="submit" ${ui.busy?'disabled':''}>说话</button></form>` : ''}<button type="button" class="wpg-hangup" data-gpc-hangup>${ongoing?'挂断':'返回通话记录'}</button><small class="wpg-call-note">文字通话 · 对方的台词由当前模型生成</small></section>`;
  }
  function phoneBody(state) {
    const call = state.communications.calls.find(call => call.id === ui.callId);
    if (call) return callPanel(state,call);
    if (ui.tab==='contacts' || ui.tab==='favorites') return contacts(state);
    if (ui.tab==='keypad') return `<section class="wpg-dialer"><label>拨号<input data-gpc-number type="tel" inputmode="tel" value="${esc(ui.number)}" maxlength="24" aria-label="电话号码" placeholder="输入号码"></label><div class="wpg-digits">${['1','2','3','4','5','6','7','8','9','*','0','#'].map(digit => `<button type="button" data-gpc-digit="${digit}">${digit}</button>`).join('')}</div><div class="wpg-dial-actions"><button type="button" data-gpc-clear>清空</button><button type="button" class="wpg-dial-call" data-gpc-dial aria-label="拨打电话">☎ 呼叫</button><button type="button" data-gpc-erase aria-label="删除最后一位">⌫</button></div><p class="wpg-muted">可输入通讯录中的号码，与角色通话。</p></section>`;
    return `<div class="wpg-feed-top"><h2>最近通话</h2><button type="button" data-gpc-keypad>拨号</button></div><div class="wpg-comm-list">${state.communications.calls.slice().reverse().map(call => `<button type="button" class="wpg-call-record" data-gpc-call="${esc(call.number)}"><span>☎</span><div><b>${esc(actorOf(state,call.actorId)?.name || call.number)}</b><small>${outcomes[call.outcome]}${call.connectedAt ? ` · ${elapsed(call)}` : ''} · ${new Date(call.startedAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false})}</small></div><i>再次呼叫 ›</i></button>`).join('') || '<p class="wpg-empty">还没有通话记录。到通讯录选择角色，或打开拨号盘。</p>'}</div>`;
  }
  function smsComposer() {
    return `<form data-gpc-sms-form class="wpg-comm-compose"><textarea rows="1" data-gpc-sms-draft maxlength="1200" placeholder="短信内容" aria-label="短信内容" ${ui.busy?'readonly':''}>${esc(ui.draft)}</textarea><button type="submit" ${ui.busy?'disabled':''}>发送</button></form>`;
  }
  function smsBody(state) {
    if (ui.mode==='new') return `<section class="wpg-new-sms"><h2>新短信</h2><label>收件人<input type="tel" inputmode="tel" data-gpc-number value="${esc(ui.number)}" placeholder="输入号码" aria-label="短信收件人号码" maxlength="24"></label><label>从通讯录选择<select data-gpc-recipient><option value="">选择联系人</option>${state.communications.contacts.map(contact => `<option value="${esc(contact.actorId)}" ${contact.actorId===ui.actorId?'selected':''}>${esc(actorOf(state,contact.actorId)?.name)} · ${esc(contact.number)}</option>`).join('')}</select></label><div class="wpg-sms-space"><p>短信会保留在单独的会话中。</p></div>${smsComposer()}</section>`;
    const actor = actorOf(state,ui.actorId);
    if (ui.mode==='thread' && actor) {
      const contact = contactOf(state), events = state.events.filter(event => event.kind==='sms' && event.actorId===actor.id);
      return `<div class="wpg-sms-person"><span>${esc(contact?.number)}</span><button type="button" data-gpc-call-contact="${esc(actor.id)}" aria-label="呼叫${esc(actor.name)}">☎ 通话</button></div><div class="wpg-sms-history">${events.map(event => `<article><small>${esc(phoneGameClock({tick:event.tick}))}</small><p class="wpg-sms-bubble is-user">${esc(event.text)}</p><small class="wpg-sms-status">${event.status==='replied'?'已回复':'已记录 · 等待回复'}</small>${event.status==='replied' ? `<p class="wpg-sms-bubble">${esc(event.reply)}</p>` : `<button type="button" class="wpg-sms-retry" data-gpc-retry="${esc(event.id)}" ${ui.busy?'disabled':''}>${ui.busy?'等待回应…':'重试回复'}</button>`}</article>`).join('') || '<p class="wpg-empty">还没有短信，给对方发第一条吧。</p>'}</div>${smsComposer()}`;
    }
    const conversations = state.actors.map(actor => ({actor,last:state.events.filter(event => event.kind==='sms' && event.actorId===actor.id).at(-1),draft:state.communications.drafts[actor.id]})).filter(item => item.last || item.draft);
    return `<div class="wpg-feed-top"><h2>短信</h2><button type="button" data-gpc-new>＋ 新短信</button></div><div class="wpg-comm-list">${conversations.map(({actor,last,draft}) => `<button type="button" class="wpg-sms-row" data-gpc-thread="${esc(actor.id)}"><span class="wpg-avatar">${esc(actor.name.slice(0,1))}</span><div><b>${esc(actor.name)}</b><small>${esc(draft ? `草稿：${draft}` : last?.reply || last?.text)}</small></div><i>›</i></button>`).join('') || '<p class="wpg-empty">暂无短信。点“新短信”选择收件人。</p>'}</div>`;
  }
  function paint() {
    if (stopped || !isPhoneGameScopeCurrent(scope) || readPhoneGameMode()!=='game' || (painted && !current())) return;
    const state = readPhoneGameState(scope), actor = actorOf(state,ui.actorId);
    if (ui.mode==='thread' && !actor) ui.mode='list';
    const title = app==='phone' ? '电话' : ui.mode==='thread' ? actor.name : '短信';
    const thread = app==='messages' && ui.mode!=='list';
    if (ui.mode==='thread' && contactOf(state)) ui.number=contactOf(state).number;
    const route=[app,ui.tab,ui.mode,ui.actorId,ui.callId].join('|'), sameRoute=route===paintedRoute;
    const mainTop=sameRoute ? screen.querySelector('.wpg-main')?.scrollTop || 0 : 0;
    const history=screen.querySelector(app==='phone'?'.wpg-call-lines':'.wpg-sms-history');
    const historyTop=history?.scrollTop || 0;
    const follow=ui.followReplies || !sameRoute || !history || history.scrollTop+history.clientHeight>=history.scrollHeight-48;
    paintedRoute=route;ui.followReplies=false;
    screen.innerHTML = `<section class="wp-view wp-native-app wp-game-app wpg-communication is-game-${app}" data-phone-game-app="${app}" data-phone-game-view="${viewId}"><header class="wp-app-header"><button type="button" data-app-back aria-label="${thread?'返回短信':'返回桌面'}">‹</button><div><b>${esc(title)}</b><small>${app==='phone'?'独立游戏 · 电话':'独立游戏 · 短信'}</small></div><span></span></header><main class="wpg-main${thread?' is-sms':''}${ui.callId && app==='phone'?' is-call':''}">${ui.error ? `<p class="wpg-error" role="alert">${esc(ui.error)}</p>` : ''}${ui.busy ? '<p class="wpg-generating" role="status">角色正在回应… <button type="button" data-gpc-cancel>停止等待</button></p>' : ''}${app==='phone'?phoneBody(state):smsBody(state)}</main>${app==='phone' && !ui.callId ? `<nav class="wpg-phone-tabs">${[['favorites','收藏'],['recents','最近'],['contacts','通讯录'],['keypad','拨号']].map(([tab,label]) => `<button type="button" data-gpc-tab="${tab}" aria-pressed="${ui.tab===tab}">${label}</button>`).join('')}</nav>` : ''}</section>`;
    painted = true;
    const root = screen.querySelector('[data-phone-game-app]');
    for (const type of ['click', 'input', 'change', 'submit']) root?.addEventListener(type, event => {
      if (current() && screen.querySelector('[data-phone-game-app]') === root) return;
      event.preventDefault(); event.stopImmediatePropagation();
    }, true);
    screen.querySelector('[data-gpc-cancel]')?.addEventListener('click',()=>cancelPhoneGameGeneration(scope));
    screen.querySelector('[data-app-back]').onclick = () => {
      if (ui.callId && app==='phone') goHome();
      else if (thread) { ui.mode='list'; ui.actorId=''; ui.error=''; paint(); }
      else goHome();
    };
    screen.querySelectorAll('[data-gpc-tab]').forEach(button => button.onclick=()=>{ui.tab=button.dataset.gpcTab;ui.error='';paint();});
    screen.querySelector('[data-gpc-keypad]')?.addEventListener('click',()=>{ui.tab='keypad';paint();});
    screen.querySelector('[data-gpc-number]')?.addEventListener('input',event=>{ui.number=phoneGameDialNumber(event.target.value);if(app==='messages') ui.actorId=state.communications.contacts.find(contact=>contact.number===ui.number)?.actorId || '';});
    screen.querySelectorAll('[data-gpc-digit]').forEach(button=>button.onclick=()=>{ui.number=phoneGameDialNumber(ui.number+button.dataset.gpcDigit);paint();});
    screen.querySelector('[data-gpc-erase]')?.addEventListener('click',()=>{ui.number=ui.number.slice(0,-1);paint();});
    screen.querySelector('[data-gpc-clear]')?.addEventListener('click',()=>{ui.number='';paint();});
    screen.querySelector('[data-gpc-dial]')?.addEventListener('click',()=>dial(ui.number));
    screen.querySelectorAll('[data-gpc-call]').forEach(button=>button.onclick=()=>dial(button.dataset.gpcCall));
    screen.querySelectorAll('[data-gpc-favorite]').forEach(button=>button.onclick=()=>action(()=>togglePhoneGameContactFavorite(button.dataset.gpcFavorite,scope)));
    screen.querySelectorAll('[data-gpc-sms]').forEach(button=>button.onclick=()=>openApp('messages',{actorId:button.dataset.gpcSms}));
    screen.querySelector('[data-gpc-hangup]')?.addEventListener('click',hangup);
    screen.querySelector('[data-gpc-call-draft]')?.addEventListener('input',event=>{ui.callDraft=event.target.value;});
    screen.querySelector('[data-gpc-call-form]')?.addEventListener('submit',event=>{event.preventDefault();sendCallLine();});
    screen.querySelector('[data-gpc-search]')?.addEventListener('input',event=>{
      ui.query=event.target.value;let count=0;screen.querySelectorAll('[data-gpc-contact]').forEach(row=>{row.hidden=!row.textContent.includes(ui.query.trim());if(!row.hidden)count++;});screen.querySelector('[data-gpc-search-empty]').hidden=count>0;
    });
    screen.querySelector('[data-gpc-new]')?.addEventListener('click',()=>{ui.mode='new';ui.actorId='';ui.number='';ui.draft=state.communications.drafts.new || '';ui.error='';paint();});
    screen.querySelectorAll('[data-gpc-thread]').forEach(button=>button.onclick=()=>openThread(button.dataset.gpcThread));
    screen.querySelector('[data-gpc-recipient]')?.addEventListener('change',event=>{
      ui.actorId=event.target.value;ui.number=state.communications.contacts.find(contact=>contact.actorId===ui.actorId)?.number || '';ui.draft=ui.draft || state.communications.drafts[ui.actorId] || '';paint();
    });
    screen.querySelector('[data-gpc-sms-draft]')?.addEventListener('input',event=>{ui.draft=event.target.value;try {savePhoneGameSmsDraft(ui.actorId || 'new',ui.draft,scope);}catch{}});
    screen.querySelector('[data-gpc-sms-form]')?.addEventListener('submit',event=>{event.preventDefault();sendSms();});
    screen.querySelector('[data-gpc-call-contact]')?.addEventListener('click',()=>openApp('phone',{actorId:ui.actorId,autoCall:true}));
    screen.querySelectorAll('[data-gpc-retry]').forEach(button=>button.onclick=()=>{if(!ui.busy) void request(button.dataset.gpcRetry, app==='phone' && state.communications.calls.find(call=>call.id===ui.callId)?.outcome==='dialing');});
    screen.querySelector('.wpg-main').scrollTop=mainTop;
    const nextHistory=screen.querySelector(app==='phone'?'.wpg-call-lines':'.wpg-sms-history');
    nextHistory?.scrollTo(0,follow?nextHistory.scrollHeight:historyTop);
    if (timer) { clearInterval(timer);timer=null; }
    const call=state.communications.calls.find(call=>call.id===ui.callId);
    if (call?.outcome==='connected') timer=setInterval(()=>{if(!current())return;const label=screen.querySelector('[data-gpc-duration]');if(label)label.textContent=elapsed(call);},1000);
  }
  paint();
  const unsubscribe = subscribePhoneGameGeneration(({ scope: changedScope, busy, error }) => {
    if (changedScope.key !== scope.key || changedScope.metadata !== scope.metadata || changedScope.modeEpoch !== scope.modeEpoch || !current()) return;
    ui.busy = busy; ui.error = error; paint();
  });
  if (app==='phone' && initialContact && autoCall) dial(initialContact.number);
  return () => {
    if(stopped)return;
    stopped=true;ui.requestId++;unsubscribe();if(timer)clearInterval(timer);
    if(ui.callId && isPhoneGameScopeCurrent(scope) && readPhoneGameMode() !== 'game') { try {endPhoneGameCall(ui.callId,scope);}catch{} }
  };
}
