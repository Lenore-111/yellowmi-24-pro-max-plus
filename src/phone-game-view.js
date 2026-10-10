import { gameNav, gamePost, gameFeed, gameWechatMe } from './phone-game-app-ui.js';
import { installPhoneGameUiClosureStyles, renderRedNoteGameDetail, renderWechatContacts, renderWechatDiscovery, wrapWechatMoments, renderDeliveryGame } from './phone-game-ui-closure.js';
import { DELIVERY_COLA } from './delivery-data.js';
import { dCatQuote } from './delivery-view.js';
import {
  capturePhoneGameScope, isPhoneGameScopeCurrent, readPhoneGameState, readPhoneGameMode,
  queuePhoneGameInteraction, togglePhoneGameLike, startPhoneGameShift, servePhoneGameCoffee,
  phoneGameClock, phoneGameRelationLabel, phoneGameEventExport, phoneGameActorPronoun, phoneGameEventDisplayText, PHONE_GAME_GIFTS, PHONE_GAME_RECIPES,
} from './phone-game.js?v=0.3.0-alpha.27';
import { generatePhoneGameContent, isPhoneGameGenerating, phoneGameGenerationStatus, subscribePhoneGameGeneration, cancelPhoneGameGeneration } from './phone-game-ai.js?v=0.3.0-alpha.27';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const labels = { wechat: '微信', weibo: '微博', rednote: '小红书', wallet: '钱包', delivery: 'Echo快送' };
const actorName = (state, actorId) => state.actors.find(actor => actor.id === actorId)?.name || '角色';
const avatar = name => `<span class="wpg-avatar">${esc(String(name || '?').slice(0, 1))}</span>`;

function exportSheet(screen, state, eventId, scope) {
  const text = phoneGameEventExport(state, eventId);
  const sheet = document.createElement('section');
  sheet.className = 'wpg-export'; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-label', '带入正文前预览');
  sheet.innerHTML = `<div><header><b>带入正文前预览</b><button type="button" data-export-close aria-label="关闭">×</button></header><p>只带入你选中的行动。正文中的角色回应由当前剧情重新决定。</p><textarea readonly aria-label="待带入的行动">${esc(text)}</textarea><button type="button" data-export-compose>放入正文输入框</button><button type="button" data-export-copy>复制这段行动</button><small role="status">不会自动发送，也不会带入手机内的好感数值。</small></div>`;
  screen.append(sheet);
  sheet.querySelector('[data-export-close]').onclick = () => sheet.remove();
  sheet.querySelector('[data-export-compose]').onclick = () => {
    const status = sheet.querySelector('[role="status"]');
    if (!isPhoneGameScopeCurrent(scope)) { status.textContent = '聊天已经切换，请回到原存档。'; return; }
    const input = document.querySelector('#send_textarea');
    if (!input) { status.textContent = '没有找到正文输入框，请使用复制。'; return; }
    input.value = input.value.trim() ? `${input.value}\n\n${text}` : text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    status.textContent = '已放入输入框，检查后由你发送。';
    sheet.querySelector('[data-export-compose]').disabled = true;
  };
  sheet.querySelector('[data-export-copy]').onclick = async () => {
    try { await navigator.clipboard.writeText(text); sheet.querySelector('[role="status"]').textContent = '已复制。'; }
    catch { sheet.querySelector('textarea').select(); sheet.querySelector('[role="status"]').textContent = '可长按选中的文本复制。'; }
  };
  sheet.querySelector('[data-export-close]').focus();
}

export function renderPhoneGameApp(screen, { app, goHome, openApp, actorId = '' }) {
  installPhoneGameUiClosureStyles();
  const scope = capturePhoneGameScope();
  const viewId = Math.random().toString(36).slice(2);
  let paintedRoute = '';
  const ui = {
    tab: app === 'weibo' ? 'home' : app === 'rednote' ? 'discover' : 'chats',
    query: '', savedIds: [], actorId, postId: '', draft: '', note: '', filter: '', busy: false, error: '', info: '', ingredients: [],
    contactId: '', discoveryView: '', deliveryView: 'home', deliveryMerchantId: '', deliveryGiftId: '', deliveryOrderId: '', deliveryAddress: '',
  };
  try { ui.savedIds = JSON.parse(globalThis.localStorage?.getItem('echo_phone_saved:' + scope.key) || '[]'); if (!Array.isArray(ui.savedIds)) ui.savedIds = []; } catch {}
  function current() { return isPhoneGameScopeCurrent(scope) && readPhoneGameMode() === 'game' && screen.querySelector('[data-phone-game-app]')?.dataset.phoneGameView === viewId; }
  function action(fn) {
    try { fn(); ui.error = ''; } catch (error) { ui.error = String(error.message || error); }
    paint();
  }
  async function generate(request) {
    if (ui.busy) return;
    ui.busy = true; ui.error = ''; ui.info = ''; paint();
    try { await generatePhoneGameContent(request, scope); }
    catch (error) { ui.error = String(error.message || error); }
    finally { ui.busy = false; if (current()) paint(); }
  }
  function interact(values, onQueued = null) {
    if (ui.busy || isPhoneGameGenerating()) { ui.error = '还有一次手机生成进行中，稍等一下。'; paint(); return ''; }
    try {
      const { eventId } = queuePhoneGameInteraction(values, scope);
      ui.draft = ''; ui.note = ''; ui.actorId = values.actorId;
      if (typeof onQueued === 'function') onQueued(eventId);
      void generate({ eventId });
      return eventId;
    } catch (error) { ui.error = String(error.message || error); paint(); return ''; }
  }
  const nav = () => {
    const wechatNested = app === 'wechat' && (ui.actorId || ui.contactId || ui.discoveryView === 'moments');
    const deliveryNested = app === 'delivery' && !['home', 'orders'].includes(ui.deliveryView);
    return wechatNested || ui.postId || deliveryNested ? '' : gameNav(app, ui.tab);
  };
  const relation = (state, actor) => state.relations[actor.id];
  const replyMarkup = event => `<div class="wpg-reply">${event.status === 'replied' ? `<span>${esc(event.reply)}</span><small>熟悉度 ${event.affinityDelta > 0 ? '+' : ''}${event.affinityDelta}</small>` : `<span>等待回应</span><button type="button" data-pg-retry="${esc(event.id)}">重试回应</button>`}</div>`;
  function postDetail(state, post) {
    if (app === 'rednote') return renderRedNoteGameDetail(state, post, { saved: ui.savedIds.includes(post.id), busy: ui.busy, draft: ui.draft, replyMarkup });
    const comments = state.events.filter(event => event.postId === post.id);
    return `<button type="button" class="wpg-text-button" data-pg-post-back>‹ 返回动态</button>${postCard(state, post, true)}<section class="wpg-comments"><h3>评论</h3>${comments.map(event => `<article><b>${esc(state.user)}</b><p>${esc(event.text)}</p>${replyMarkup(event)}<button type="button" class="wpg-text-button" data-pg-export="${esc(event.id)}">带入正文…</button></article>`).join('') || '<p>留一句话，开始这段互动。</p>'}</section><form data-pg-comment class="wpg-compose"><textarea maxlength="1200" aria-label="评论内容" data-pg-draft ${ui.busy ? 'readonly' : ''} placeholder="给${esc(phoneGameActorPronoun(state.actors.find(actor => actor.id === post.actorId)))}留一句话">${esc(ui.draft)}</textarea><button type="submit" ${ui.busy ? 'disabled' : ''}>评论</button></form>`;
  }
  function postCard(state, post, detail = false) {
    return gamePost(state, post, app, ui.savedIds.includes(post.id), detail, phoneGameClock({ tick: post.tick }));
  }
  function feed(state, platform) {
    const selected = state.posts.find(post => post.id === ui.postId && post.platform === platform);
    if (selected) return postDetail(state, selected);
    let posts = state.posts.filter(post => post.platform === platform && (!ui.filter || post.actorId === ui.filter)
      && (!ui.query || [post.title,post.text,actorName(state,post.actorId)].join(' ').includes(ui.query))
      && (ui.tab !== 'saved' || ui.savedIds.includes(post.id))).slice().reverse();
    if (ui.tab === 'hot') posts.sort((a,b)=>Number(b.liked)-Number(a.liked));
    return gameFeed(state, platform, ui, posts.map(post=>postCard(state,post)).join(''));
  }
  function chats(state) {
    if (ui.tab === 'me' && !ui.actorId) return gameWechatMe(state);
    const actor = state.actors.find(actor => actor.id === ui.actorId);
    if (actor) {
      const events = state.events.filter(event => event.actorId === actor.id && !['sms', 'call'].includes(event.kind));
      const rel = relation(state, actor);
      return `<div class="wpg-thread-head"><button type="button" data-pg-chats>‹ 消息</button><b>${esc(actor.name)}</b><button type="button" data-pg-gift-to="${esc(actor.id)}">送礼</button></div><div class="wpg-relation-strip">${esc(phoneGameRelationLabel(rel.affinity))} · 熟悉度 ${rel.affinity}/100</div><div class="wpg-thread">${events.map(event => `<article class="wpg-chat-event"><small>${esc(phoneGameClock({ tick: event.tick }))}${event.kind === 'comment' ? ' · 来自帖子评论' : event.kind === 'gift' ? ' · 收到礼物' : ''}</small><div class="wpg-bubble is-user">${esc(phoneGameEventDisplayText(state, event))}</div><div class="wpg-bubble">${replyMarkup(event)}</div><button type="button" class="wpg-text-button" data-pg-export="${esc(event.id)}">带入正文…</button></article>`).join('') || `<div class="wpg-empty">给${esc(actor.name)}发一句话吧。</div>`}</div><form data-pg-message class="wpg-compose"><textarea data-pg-draft rows="1" maxlength="1200" aria-label="私聊内容" placeholder="发消息" ${ui.busy ? 'readonly' : ''}>${esc(ui.draft)}</textarea><button type="submit" ${ui.busy ? 'disabled' : ''}>发送</button></form>`;
    }
    if (ui.tab === 'moments') return ui.discoveryView === 'moments' ? wrapWechatMoments(feed(state, 'moments')) : renderWechatDiscovery();
    if (ui.tab === 'relations') return renderWechatContacts(state, ui);
    return `<form class="echo-wx-search" data-pg-search><input data-pg-query aria-label="搜索联系人" placeholder="搜索" value="${esc(ui.query)}"><button type="submit">搜索</button></form><div class="wpg-chat-list">${state.actors.filter(actor=>!ui.query || actor.name.includes(ui.query)).map(actor => {
      const last = state.events.filter(event => event.actorId === actor.id && !['sms', 'call'].includes(event.kind)).at(-1);
      return `<button type="button" data-pg-chat="${esc(actor.id)}">${avatar(actor.name)}<span><b>${esc(actor.name)}</b><small>${esc(last ? last.status === 'pending' ? '等待回应 · 可重试' : last.reply : `开始聊聊${phoneGameActorPronoun(actor)}的生活`)}</small></span><i>›</i></button>`;
    }).join('') || '<div class="echo-feed-empty"><b>还没有聊天</b><p>打开一位人物的聊天后，对方会出现在这里。</p></div>'}</div>`;
  }
  function giftShop(state) {
    const gifts = PHONE_GAME_GIFTS;
    const actor = state.actors.find(actor => actor.id === ui.actorId) || state.actors[0];
    ui.actorId = actor?.id || '';
    const recipient = phoneGameActorPronoun(actor);
    return `<div class="wpg-feed-top"><div><h2>给${esc(recipient)}的小心意</h2><small>钱包余额 ¥${state.balance}</small></div></div><label class="wpg-field">送给<select data-pg-recipient aria-label="收礼角色">${state.actors.map(item => `<option value="${esc(item.id)}" ${item.id === ui.actorId ? 'selected' : ''}>${esc(item.name)}</option>`).join('')}</select></label><label class="wpg-field">附言<input data-pg-note maxlength="200" value="${esc(ui.note)}" placeholder="例如：记得吃饭" ${ui.busy ? 'readonly' : ''}></label><div class="wpg-gift-grid">${gifts.map(gift => `<article><span>${gift.icon}</span><b>${gift.name}</b><small>¥${gift.price}</small><button type="button" data-pg-gift="${gift.id}" ${ui.busy || !actor || state.balance < gift.price ? 'disabled' : ''}>${state.balance < gift.price ? '余额不足' : '购买并送出'}</button></article>`).join('')}</div><p class="wpg-muted">手机内送出后会产生角色回应。重复送礼的熟悉度收益会下降。</p>${state.events.filter(event => event.kind === 'gift').slice(-6).reverse().map(event => `<article class="wpg-gift-record"><b>${esc(actorName(state, event.actorId))}</b><p>${esc(phoneGameEventDisplayText(state, event))}</p>${event.giftId === DELIVERY_COLA.id ? dCatQuote(DELIVERY_COLA.catQuote) : ''}${replyMarkup(event)}<button type="button" class="wpg-text-button" data-pg-export="${esc(event.id)}">带入正文…</button></article>`).join('')}`;
  }
  function wallet(state) {
    if (ui.tab === 'gifts') return `<button type="button" class="wpg-text-button" data-pg-wallet>‹ 返回钱包</button>${giftShop(state)}`;
    const shift = state.shift;
    const recipe = shift && shift.index < 3 ? PHONE_GAME_RECIPES.find(recipe => recipe.id === shift.orders[shift.index]) : null;
    return `<section class="wpg-wallet-card wp-wallet-card"><small>总资产（元）</small><strong>¥${state.balance}</strong><div><span>挣到 ¥${state.earned}</span><span>花掉 ¥${state.spent}</span></div></section><div class="wpg-wallet-links"><button type="button" data-pg-gifts>挑礼物</button><button type="button" data-pg-app="delivery">请吃饭</button><button type="button" data-pg-app="wechat">看看消息</button></div><section class="wpg-coffee"><h2>街角咖啡店</h2><p>做三杯饮品，领一班工资。选对原料再出杯。</p><details><summary>配方小抄</summary>${PHONE_GAME_RECIPES.map(item => `<p>${item.name}：${item.ingredients.join(' + ')}</p>`).join('')}</details>${recipe ? `<div class="wpg-order"><small>第 ${shift.index + 1}/3 单</small><b>客人要一杯${recipe.name}</b><div class="wpg-ingredients" role="group" aria-label="选择饮品原料">${['咖啡','水','牛奶','巧克力','茶'].map(item => `<button type="button" data-pg-ingredient="${item}" aria-pressed="${ui.ingredients.includes(item)}"><span aria-hidden="true">${ui.ingredients.includes(item) ? '✓' : '+'}</span>${item}</button>`).join('')}</div><small data-pg-order-status role="status">${ui.info ? esc(ui.info) : '点选需要的原料，再点击出杯。'}</small><button type="button" data-pg-serve>出杯</button></div>` : `<div class="wpg-order">${ui.info ? `<small role="status">${esc(ui.info)}</small>` : ''}${shift?.claimed ? `<b>上一班完成：${shift.correct}/3 单正确，收入 ¥${10 + shift.correct * 20}</b>` : '<b>随时来上一个短班</b>'}<button type="button" data-pg-shift>${shift ? '再来一班' : '开始营业'}</button></div>`}<small>每班底薪 ¥10，每杯正确另加 ¥20；结束后自动入账。</small></section><section class="wpg-ledger"><h3>钱包流水</h3>${state.ledger.slice().reverse().map(item => `<div><span>${esc(item.text)}</span><b>${item.amount > 0 ? '+' : ''}¥${item.amount}</b></div>`).join('') || '<p>还没有流水，去赚第一份工资吧。</p>'}</section>`;
  }
  function paint() {
    if (!isPhoneGameScopeCurrent(scope)) return;
    const generationStatus = phoneGameGenerationStatus(scope);
    ui.busy = generationStatus.busy;
    if (generationStatus.error && !ui.error) ui.error = generationStatus.error;
    const state = readPhoneGameState(scope);
    if (ui.actorId && !state.actors.some(actor => actor.id === ui.actorId)) ui.actorId = '';
    if (ui.contactId && !state.actors.some(actor => actor.id === ui.contactId)) ui.contactId = '';
    const deliveryGifts = PHONE_GAME_GIFTS.filter(gift => gift.delivery);
    const content = app === 'wallet' ? wallet(state)
      : app === 'delivery' ? renderDeliveryGame(state, ui, deliveryGifts, replyMarkup)
      : app === 'wechat' ? chats(state)
      : feed(state, app);
    const route = [app, ui.tab, app === 'wechat' ? ui.actorId : '', ui.postId, ui.filter, ui.contactId, ui.discoveryView, ui.deliveryView, ui.deliveryMerchantId, ui.deliveryGiftId, ui.deliveryOrderId].join('|');
    const keepPosition = route === paintedRoute;
    const scrollTop = keepPosition ? screen.querySelector('.wpg-main')?.scrollTop || 0 : 0;
    const recipeOpen = keepPosition && Boolean(screen.querySelector('.wpg-coffee details')?.open);
    paintedRoute = route;
    screen.innerHTML = `<section class="wp-view wp-native-app wp-game-app echo-restored-app is-game-${app}" data-phone-game-app="${app}" data-phone-game-view="${viewId}"><header class="wp-app-header"><button type="button" data-app-back aria-label="返回桌面">‹</button><div><b>${labels[app]}</b><small>${ui.busy ? '正在更新…' : ''}</small></div><span>${ui.busy ? '•••' : '◌'}</span></header><main class="wpg-main${app === 'wechat' && ui.actorId ? ' is-thread' : ''}">${ui.error ? `<p class="wpg-error" role="alert">${esc(ui.error)}</p>` : ''}${ui.info && app !== 'wallet' ? `<p class="wpg-info" role="status">${esc(ui.info)}</p>` : ''}${ui.busy ? '<p class="wpg-generating" role="status">角色正在回应… <button type="button" data-pg-cancel>停止等待</button></p>' : ''}${content}</main>${nav()}</section>`;
    screen.querySelector('[data-app-back]').onclick = goHome;
    screen.querySelector('[data-pg-cancel]')?.addEventListener('click', () => cancelPhoneGameGeneration(scope));
    screen.querySelectorAll('[data-pg-view]').forEach(button => button.onclick = () => {
      ui.tab = button.dataset.pgView; ui.postId = ''; ui.actorId = ''; ui.contactId = ''; ui.discoveryView = ''; ui.draft = ''; ui.query = '';
      if (app === 'delivery') { ui.deliveryView = ui.tab === 'orders' ? 'orders' : 'home'; ui.deliveryOrderId = ''; }
      paint();
    });
    screen.querySelector('[data-pg-search]')?.addEventListener('submit', event => { event.preventDefault(); ui.query = screen.querySelector('[data-pg-query]')?.value.trim() || ''; paint(); });
    screen.querySelectorAll('[data-pg-save]').forEach(button=>button.onclick=()=>{ const id=button.dataset.pgSave; ui.savedIds=ui.savedIds.includes(id)?ui.savedIds.filter(x=>x!==id):[...ui.savedIds,id];try { globalThis.localStorage?.setItem('echo_phone_saved:'+scope.key,JSON.stringify(ui.savedIds)); } catch {} paint(); });
    screen.querySelectorAll('[data-pg-app]').forEach(button => button.onclick = () => openApp(button.dataset.pgApp));
    screen.querySelectorAll('[data-pg-tab]').forEach(button => button.onclick = () => { ui.tab = button.dataset.pgTab; ui.postId = ''; ui.contactId = ''; ui.discoveryView = ''; ui.draft = ''; paint(); });
    screen.querySelector('[data-pg-filter]')?.addEventListener('change', event => { ui.filter = event.target.value; paint(); });
    screen.querySelectorAll('[data-pg-refresh]').forEach(button => button.onclick = () => void generate({ platform: button.dataset.pgRefresh }));
    screen.querySelectorAll('[data-pg-like]').forEach(button => button.onclick = () => action(() => togglePhoneGameLike(button.dataset.pgLike, scope)));
    screen.querySelectorAll('[data-pg-post]').forEach(button => button.onclick = () => { ui.postId = button.dataset.pgPost; ui.draft = ''; paint(); });
    screen.querySelector('[data-pg-post-back]')?.addEventListener('click', () => { ui.postId = ''; ui.draft = ''; paint(); });
    screen.querySelector('[data-pg-comment-focus]')?.addEventListener('click', () => screen.querySelector('[data-pg-draft]')?.focus());
    screen.querySelectorAll('[data-pg-chat]').forEach(button => button.onclick = () => app === 'wechat'
      ? (ui.actorId = button.dataset.pgChat, ui.contactId = '', ui.discoveryView = '', ui.draft = '', paint())
      : openApp('wechat', { actorId: button.dataset.pgChat }));
    screen.querySelector('[data-pg-chats]')?.addEventListener('click', () => { ui.actorId = ''; ui.draft = ''; paint(); });
    screen.querySelectorAll('[data-pg-contact]').forEach(button => button.onclick = () => { ui.contactId = button.dataset.pgContact; paint(); });
    screen.querySelector('[data-pg-contact-back]')?.addEventListener('click', () => { ui.contactId = ''; paint(); });
    screen.querySelector('[data-pg-open-moments]')?.addEventListener('click', () => { ui.discoveryView = 'moments'; paint(); });
    screen.querySelector('[data-pg-discovery-back]')?.addEventListener('click', () => { ui.discoveryView = ''; ui.postId = ''; paint(); });
    screen.querySelectorAll('[data-pg-gift-to]').forEach(button => button.onclick = () => openApp('wallet', { actorId: button.dataset.pgGiftTo, giftShop: true }));
    if (actorId && app === 'wallet' && ui.tab === 'chats') { ui.tab = 'gifts'; paint(); return; }
    screen.querySelector('[data-pg-draft]')?.addEventListener('input', event => { ui.draft = event.target.value; });
    screen.querySelector('[data-pg-note]')?.addEventListener('input', event => { ui.note = event.target.value; });
    screen.querySelector('[data-pg-recipient]')?.addEventListener('change', event => { ui.actorId = event.target.value; paint(); });
    screen.querySelector('[data-pg-delivery-address]')?.addEventListener('input', event => { ui.deliveryAddress = event.target.value; });
    screen.querySelectorAll('[data-pg-delivery-merchant]').forEach(button => button.onclick = () => { ui.deliveryMerchantId = button.dataset.pgDeliveryMerchant; ui.deliveryView = 'merchant'; paint(); });
    screen.querySelectorAll('[data-pg-delivery-add]').forEach(button => button.onclick = () => { ui.deliveryGiftId = button.dataset.pgDeliveryAdd; ui.deliveryView = 'cart'; paint(); });
    screen.querySelectorAll('[data-pg-delivery-order]').forEach(button => button.onclick = () => { ui.deliveryOrderId = button.dataset.pgDeliveryOrder; ui.deliveryView = 'order'; paint(); });
    screen.querySelectorAll('[data-pg-delivery-go]').forEach(button => button.onclick = () => {
      const next = button.dataset.pgDeliveryGo;
      ui.deliveryView = next;
      if (next === 'home') { ui.tab = 'chats'; ui.deliveryOrderId = ''; }
      if (next === 'orders') { ui.tab = 'orders'; ui.deliveryOrderId = ''; }
      if (next === 'merchant' && !ui.deliveryMerchantId) ui.deliveryView = 'home';
      paint();
    });
    screen.querySelector('[data-pg-delivery-confirm]')?.addEventListener('click', () => {
      const gift = PHONE_GAME_GIFTS.find(item => item.id === ui.deliveryGiftId && item.delivery);
      if (!gift || !ui.actorId) { ui.error = '先选择商品和收礼角色。'; paint(); return; }
      const address = ui.deliveryAddress.trim();
      const note = [ui.note.trim(), address ? `配送地址：${address}` : ''].filter(Boolean).join('；');
      interact({ actorId: ui.actorId, kind: 'gift', giftId: gift.id, note }, eventId => {
        ui.deliveryOrderId = eventId; ui.deliveryView = 'order'; ui.tab = 'chats'; ui.deliveryAddress = '';
      });
    });
    screen.querySelector('[data-pg-message]')?.addEventListener('submit', event => { event.preventDefault(); interact({ actorId: ui.actorId, kind: 'chat', text: ui.draft }); });
    screen.querySelector('[data-pg-comment]')?.addEventListener('submit', event => { event.preventDefault(); const post = state.posts.find(post => post.id === ui.postId); if (post) interact({ actorId: post.actorId, kind: 'comment', text: ui.draft, postId: post.id }); });
    screen.querySelectorAll('[data-pg-retry]').forEach(button => button.onclick = () => void generate({ eventId: button.dataset.pgRetry }));
    screen.querySelectorAll('[data-pg-export]').forEach(button => button.onclick = () => exportSheet(screen, readPhoneGameState(scope), button.dataset.pgExport, scope));
    screen.querySelectorAll('[data-pg-gift]').forEach(button => button.onclick = () => interact({ actorId: ui.actorId, kind: 'gift', giftId: button.dataset.pgGift, note: ui.note }));
    screen.querySelector('[data-pg-gifts]')?.addEventListener('click', () => { ui.tab = 'gifts'; paint(); });
    screen.querySelector('[data-pg-wallet]')?.addEventListener('click', () => { ui.tab = 'wallet'; paint(); });
    screen.querySelector('[data-pg-shift]')?.addEventListener('click', () => action(() => { startPhoneGameShift(scope); ui.info = ''; }));
    screen.querySelectorAll('[data-pg-ingredient]').forEach(button => button.onclick = () => {
      const ingredient = button.dataset.pgIngredient;
      const selected = !ui.ingredients.includes(ingredient);
      ui.ingredients = selected ? [...ui.ingredients, ingredient] : ui.ingredients.filter(item => item !== ingredient);
      button.setAttribute('aria-pressed', String(selected));
      button.querySelector('span').textContent = selected ? '✓' : '+';
      screen.querySelector('[data-pg-order-status]').textContent = ui.ingredients.length ? `已选：${ui.ingredients.join('、')}` : '点选需要的原料，再点击出杯。';
    });
    screen.querySelector('[data-pg-serve]')?.addEventListener('click', () => {
      if (!ui.ingredients.length) { screen.querySelector('[data-pg-order-status]').textContent = '先选原料再出杯，这一单还在等你。'; return; }
      action(() => { const { correct } = servePhoneGameCoffee(ui.ingredients, scope); ui.ingredients = []; ui.info = correct ? '这杯做对了！' : '原料没对上，下一杯再试试。'; });
    });
    const recipeDetails = screen.querySelector('.wpg-coffee details');
    if (recipeDetails) recipeDetails.open = recipeOpen;
    const main = screen.querySelector('.wpg-main');
    if (main) main.scrollTop = scrollTop;
    if (app === 'wechat' && ui.actorId) {
      const thread = screen.querySelector('.wpg-thread');
      thread?.scrollTo(0, thread.scrollHeight);
    }
  }
  paint();
  const unsubscribe = subscribePhoneGameGeneration(({ scope: changedScope, busy, error }) => {
    if (changedScope.key !== scope.key || changedScope.metadata !== scope.metadata || !current()) return;
    ui.busy = busy; ui.error = error;
    paint();
  });
  return unsubscribe;
}
