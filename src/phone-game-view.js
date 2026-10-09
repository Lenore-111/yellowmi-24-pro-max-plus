import { DELIVERY_COLA } from './delivery-data.js';
import { dCatQuote } from './delivery-view.js';
import {
  capturePhoneGameScope, isPhoneGameScopeCurrent, readPhoneGameState, readPhoneGameMode,
  queuePhoneGameInteraction, togglePhoneGameLike, startPhoneGameShift, servePhoneGameCoffee,
  phoneGameClock, phoneGameRelationLabel, phoneGameEventExport, phoneGameActorPronoun, phoneGameEventDisplayText, PHONE_GAME_GIFTS, PHONE_GAME_RECIPES,
} from './phone-game.js';
import { generatePhoneGameContent, isPhoneGameGenerating } from './phone-game-ai.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const labels = { wechat: '微信', weibo: '微博', rednote: '小红书', wallet: '钱包', delivery: '玲七快送' };
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
  const scope = capturePhoneGameScope();
  const viewId = Math.random().toString(36).slice(2);
  const ui = { tab: 'chats', actorId, postId: '', draft: '', note: '', filter: '', busy: false, error: '', info: '', ingredients: [] };
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
  function interact(values) {
    if (ui.busy || isPhoneGameGenerating()) { ui.error = '还有一次手机生成进行中，稍等一下。'; paint(); return; }
    try {
      const { eventId } = queuePhoneGameInteraction(values, scope);
      ui.draft = ''; ui.note = ''; ui.actorId = values.actorId;
      void generate({ eventId });
    } catch (error) { ui.error = String(error.message || error); paint(); }
  }
  const nav = () => `<nav class="wpg-nav">${[['wechat','微信'],['weibo','微博'],['rednote','小红书'],['wallet','钱包'],['delivery','快送']].map(([id,name]) => `<button type="button" data-pg-app="${id}" ${id === app ? 'aria-current="page"' : ''}>${name}</button>`).join('')}</nav>`;
  const relation = (state, actor) => state.relations[actor.id];
  const replyMarkup = event => `<div class="wpg-reply">${event.status === 'replied' ? `<span>${esc(event.reply)}</span><small>熟悉度 ${event.affinityDelta > 0 ? '+' : ''}${event.affinityDelta}</small>` : `<span>等待回应</span><button type="button" data-pg-retry="${esc(event.id)}">重试回应</button>`}</div>`;
  function postDetail(state, post) {
    const comments = state.events.filter(event => event.postId === post.id);
    return `<button type="button" class="wpg-text-button" data-pg-post-back>‹ 返回动态</button>${postCard(state, post, true)}<section class="wpg-comments"><h3>评论</h3>${comments.map(event => `<article><b>${esc(state.user)}</b><p>${esc(event.text)}</p>${replyMarkup(event)}<button type="button" class="wpg-text-button" data-pg-export="${esc(event.id)}">带入正文…</button></article>`).join('') || '<p>留一句话，开始这段互动。</p>'}</section><form data-pg-comment class="wpg-compose"><textarea maxlength="1200" aria-label="评论内容" data-pg-draft ${ui.busy ? 'readonly' : ''} placeholder="给${esc(phoneGameActorPronoun(state.actors.find(actor => actor.id === post.actorId)))}留一句话">${esc(ui.draft)}</textarea><button type="submit" ${ui.busy ? 'disabled' : ''}>评论</button></form>`;
  }
  function postCard(state, post, detail = false) {
    const name = actorName(state, post.actorId);
    const comments = state.events.filter(event => event.postId === post.id).length;
    return `<article class="wpg-post ${app === 'rednote' ? 'is-note' : ''}"><header>${avatar(name)}<div><b>${esc(name)}</b><small>${esc(phoneGameClock({ tick: post.tick }))}${post.mood ? ` · ${esc(post.mood)}` : ''}</small></div></header>${post.title ? `<h3>${esc(post.title)}</h3>` : ''}<p>${esc(post.text)}</p><footer><button type="button" data-pg-like="${esc(post.id)}" aria-pressed="${post.liked}">${post.liked ? '♥ 已赞' : '♡ 赞'}</button>${detail ? '' : `<button type="button" data-pg-post="${esc(post.id)}">评论 ${comments || ''}</button>`}<button type="button" data-pg-chat="${esc(post.actorId)}">私聊</button></footer></article>`;
  }
  function feed(state, platform) {
    const selected = state.posts.find(post => post.id === ui.postId && post.platform === platform);
    if (selected) return postDetail(state, selected);
    const posts = state.posts.filter(post => post.platform === platform && (!ui.filter || post.actorId === ui.filter)).slice().reverse();
    return `<div class="wpg-feed-top"><div><h2>${platform === 'weibo' ? '关注的人' : platform === 'rednote' ? '生活记录' : '朋友圈'}</h2><small>${esc(phoneGameClock(state))}</small></div><button type="button" data-pg-refresh="${platform}" ${ui.busy ? 'disabled' : ''}>${ui.busy ? '生成中…' : '看看新动态'}</button></div><label class="wpg-filter">查看<select data-pg-filter><option value="">所有角色</option>${state.actors.map(actor => `<option value="${esc(actor.id)}" ${ui.filter === actor.id ? 'selected' : ''}>${esc(actor.name)}</option>`).join('')}</select></label><div class="wpg-feed ${platform === 'rednote' ? 'wpg-note-grid' : ''}">${posts.map(post => postCard(state, post)).join('') || '<div class="wpg-empty"><b>故事从一条动态开始</b><p>点“看看新动态”，让角色按自己的生活和性格发一条帖子。</p></div>'}</div>`;
  }
  function chats(state) {
    const actor = state.actors.find(actor => actor.id === ui.actorId);
    if (actor) {
      const events = state.events.filter(event => event.actorId === actor.id);
      const rel = relation(state, actor);
      return `<div class="wpg-thread-head"><button type="button" data-pg-chats>‹ 消息</button><b>${esc(actor.name)}</b><button type="button" data-pg-gift-to="${esc(actor.id)}">送礼</button></div><div class="wpg-relation-strip">${esc(phoneGameRelationLabel(rel.affinity))} · 熟悉度 ${rel.affinity}/100</div><div class="wpg-thread">${events.map(event => `<article class="wpg-chat-event"><small>${esc(phoneGameClock({ tick: event.tick }))}${event.kind === 'comment' ? ' · 来自帖子评论' : event.kind === 'gift' ? ' · 收到礼物' : ''}</small><div class="wpg-bubble is-user">${esc(phoneGameEventDisplayText(state, event))}</div><div class="wpg-bubble">${replyMarkup(event)}</div><button type="button" class="wpg-text-button" data-pg-export="${esc(event.id)}">带入正文…</button></article>`).join('') || `<div class="wpg-empty">给${esc(actor.name)}发一句话吧。</div>`}</div><form data-pg-message class="wpg-compose"><textarea data-pg-draft rows="1" maxlength="1200" aria-label="私聊内容" placeholder="发消息" ${ui.busy ? 'readonly' : ''}>${esc(ui.draft)}</textarea><button type="submit" ${ui.busy ? 'disabled' : ''}>发送</button></form>`;
    }
    if (ui.tab === 'moments') return feed(state, 'moments');
    if (ui.tab === 'relations') return `<h2>手机里的关系</h2><p class="wpg-muted">关系来自这份手机存档里的经历。</p>${state.actors.map(actor => {
      const rel = relation(state, actor);
      return `<article class="wpg-person"><header>${avatar(actor.name)}<div><b>${esc(actor.name)}</b><small>${esc(phoneGameRelationLabel(rel.affinity))} · ${rel.affinity}/100</small></div></header><progress max="100" value="${rel.affinity}" aria-label="${esc(actor.name)}的熟悉度"></progress><p>${rel.preferences.length ? `发现的偏好：${esc(rel.preferences.join('、'))}` : `还没有发现${esc(phoneGameActorPronoun(actor))}的偏好，试着聊聊。`}</p>${rel.memory ? `<details><summary>共同经历</summary><p>${esc(rel.memory)}</p></details>` : ''}<button type="button" data-pg-chat="${esc(actor.id)}">聊一会</button><button type="button" data-pg-gift-to="${esc(actor.id)}">选礼物</button></article>`;
    }).join('')}`;
    return `<h2>消息</h2><div class="wpg-chat-list">${state.actors.map(actor => {
      const last = state.events.filter(event => event.actorId === actor.id).at(-1);
      return `<button type="button" data-pg-chat="${esc(actor.id)}">${avatar(actor.name)}<span><b>${esc(actor.name)}</b><small>${esc(last ? last.status === 'pending' ? '等待回应 · 可重试' : last.reply : `开始聊聊${phoneGameActorPronoun(actor)}的生活`)}</small></span><i>›</i></button>`;
    }).join('')}</div>`;
  }
  function giftShop(state) {
    const gifts = app === 'delivery' ? PHONE_GAME_GIFTS.filter(gift => gift.delivery) : PHONE_GAME_GIFTS;
    const actor = state.actors.find(actor => actor.id === ui.actorId) || state.actors[0];
    ui.actorId = actor?.id || '';
    const recipient = phoneGameActorPronoun(actor);
    return `<div class="wpg-feed-top"><div><h2>${app === 'delivery' ? `请${esc(recipient)}吃点好的` : `给${esc(recipient)}的小心意`}</h2><small>钱包余额 ¥${state.balance}</small></div></div><label class="wpg-field">送给<select data-pg-recipient aria-label="收礼角色">${state.actors.map(item => `<option value="${esc(item.id)}" ${item.id === ui.actorId ? 'selected' : ''}>${esc(item.name)}</option>`).join('')}</select></label><label class="wpg-field">附言<input data-pg-note maxlength="200" value="${esc(ui.note)}" placeholder="例如：记得吃饭" ${ui.busy ? 'readonly' : ''}></label><div class="wpg-gift-grid">${gifts.map(gift => `<article><span>${gift.icon}</span><b>${gift.name}</b><small>¥${gift.price}</small><button type="button" data-pg-gift="${gift.id}" ${ui.busy || state.balance < gift.price ? 'disabled' : ''}>${state.balance < gift.price ? '余额不足' : '购买并送出'}</button></article>`).join('')}</div><p class="wpg-muted">手机内送出后会产生角色回应。重复送礼的熟悉度收益会下降。</p>${state.events.filter(event => event.kind === 'gift').slice(-6).reverse().map(event => `<article class="wpg-gift-record"><b>${esc(actorName(state, event.actorId))}</b><p>${esc(phoneGameEventDisplayText(state, event))}</p>${event.giftId === DELIVERY_COLA.id ? dCatQuote(DELIVERY_COLA.catQuote) : ''}${replyMarkup(event)}<button type="button" class="wpg-text-button" data-pg-export="${esc(event.id)}">带入正文…</button></article>`).join('')}`;
  }
  function wallet(state) {
    if (ui.tab === 'gifts') return `<button type="button" class="wpg-text-button" data-pg-wallet>‹ 返回钱包</button>${giftShop(state)}`;
    const shift = state.shift;
    const recipe = shift && shift.index < 3 ? PHONE_GAME_RECIPES.find(recipe => recipe.id === shift.orders[shift.index]) : null;
    return `<section class="wpg-wallet-card"><small>手机游戏余额</small><strong>¥${state.balance}</strong><div><span>挣到 ¥${state.earned}</span><span>花掉 ¥${state.spent}</span></div></section><div class="wpg-wallet-links"><button type="button" data-pg-gifts>挑礼物</button><button type="button" data-pg-app="delivery">请吃饭</button><button type="button" data-pg-app="wechat">看看消息</button></div><section class="wpg-coffee"><h2>街角咖啡店</h2><p>做三杯饮品，领一班工资。选对原料再出杯。</p><details><summary>配方小抄</summary>${PHONE_GAME_RECIPES.map(item => `<p>${item.name}：${item.ingredients.join(' + ')}</p>`).join('')}</details>${recipe ? `<div class="wpg-order"><small>第 ${shift.index + 1}/3 单</small><b>客人要一杯${recipe.name}</b><div class="wpg-ingredients">${['咖啡','水','牛奶','巧克力','茶'].map(item => `<label><input type="checkbox" data-pg-ingredient value="${item}" ${ui.ingredients.includes(item) ? 'checked' : ''}>${item}</label>`).join('')}</div><button type="button" data-pg-serve>出杯</button></div>` : `<div class="wpg-order">${shift?.claimed ? `<b>上一班完成：${shift.correct}/3 单正确，收入 ¥${10 + shift.correct * 20}</b>` : '<b>随时来上一个短班</b>'}<button type="button" data-pg-shift>${shift ? '再来一班' : '开始营业'}</button></div>`}<small>每班底薪 ¥10，每杯正确另加 ¥20；结束后自动入账。</small></section><section class="wpg-ledger"><h3>钱包流水</h3>${state.ledger.slice().reverse().map(item => `<div><span>${esc(item.text)}</span><b>${item.amount > 0 ? '+' : ''}¥${item.amount}</b></div>`).join('') || '<p>还没有流水，去赚第一份工资吧。</p>'}</section>`;
  }
  function paint() {
    if (!isPhoneGameScopeCurrent(scope)) return;
    const state = readPhoneGameState(scope);
    if (ui.actorId && !state.actors.some(actor => actor.id === ui.actorId)) ui.actorId = '';
    const content = !state.actors.length ? '<div class="wpg-empty"><b>暂无可用角色</b><p>打开人物角色卡，或让世界背面提供已认识的联系人。世界观和剧情卡的标题不会作为人物出现。</p></div>'
      : app === 'wallet' ? wallet(state) : app === 'delivery' ? giftShop(state) : app === 'wechat' ? chats(state) : feed(state, app);
    screen.innerHTML = `<section class="wp-view wp-native-app wp-game-app is-game-${app}" data-phone-game-app="${app}" data-phone-game-view="${viewId}"><header class="wp-app-header"><button type="button" data-app-back aria-label="返回桌面">‹</button><div><b>${labels[app]}</b><small>独立游戏 · 仅在手机里</small></div><span>${ui.busy ? '•••' : '◌'}</span></header>${app === 'wechat' && !ui.actorId ? `<div class="wpg-wx-tabs">${[['chats','消息'],['moments','朋友圈'],['relations','关系']].map(([id,label]) => `<button type="button" data-pg-tab="${id}" aria-pressed="${ui.tab === id}">${label}</button>`).join('')}</div>` : ''}<main class="wpg-main${app === 'wechat' && ui.actorId ? ' is-thread' : ''}">${ui.error ? `<p class="wpg-error" role="alert">${esc(ui.error)}</p>` : ''}${ui.info ? `<p class="wpg-info" role="status">${esc(ui.info)}</p>` : ''}${ui.busy ? '<p class="wpg-generating" role="status">角色正在回应…</p>' : ''}${content}</main>${nav()}</section>`;
    screen.querySelector('[data-app-back]').onclick = goHome;
    screen.querySelectorAll('[data-pg-app]').forEach(button => button.onclick = () => openApp(button.dataset.pgApp));
    screen.querySelectorAll('[data-pg-tab]').forEach(button => button.onclick = () => { ui.tab = button.dataset.pgTab; ui.postId = ''; ui.draft = ''; paint(); });
    screen.querySelector('[data-pg-filter]')?.addEventListener('change', event => { ui.filter = event.target.value; paint(); });
    screen.querySelectorAll('[data-pg-refresh]').forEach(button => button.onclick = () => void generate({ platform: button.dataset.pgRefresh }));
    screen.querySelectorAll('[data-pg-like]').forEach(button => button.onclick = () => action(() => togglePhoneGameLike(button.dataset.pgLike, scope)));
    screen.querySelectorAll('[data-pg-post]').forEach(button => button.onclick = () => { ui.postId = button.dataset.pgPost; ui.draft = ''; paint(); });
    screen.querySelector('[data-pg-post-back]')?.addEventListener('click', () => { ui.postId = ''; ui.draft = ''; paint(); });
    screen.querySelectorAll('[data-pg-chat]').forEach(button => button.onclick = () => app === 'wechat' ? (ui.actorId = button.dataset.pgChat, ui.draft = '', paint()) : openApp('wechat', { actorId: button.dataset.pgChat }));
    screen.querySelector('[data-pg-chats]')?.addEventListener('click', () => { ui.actorId = ''; ui.draft = ''; paint(); });
    screen.querySelectorAll('[data-pg-gift-to]').forEach(button => button.onclick = () => openApp('wallet', { actorId: button.dataset.pgGiftTo, giftShop: true }));
    if (actorId && app === 'wallet' && ui.tab === 'chats') { ui.tab = 'gifts'; paint(); return; }
    screen.querySelector('[data-pg-draft]')?.addEventListener('input', event => { ui.draft = event.target.value; });
    screen.querySelector('[data-pg-note]')?.addEventListener('input', event => { ui.note = event.target.value; });
    screen.querySelector('[data-pg-recipient]')?.addEventListener('change', event => { ui.actorId = event.target.value; paint(); });
    screen.querySelector('[data-pg-message]')?.addEventListener('submit', event => { event.preventDefault(); interact({ actorId: ui.actorId, kind: 'chat', text: ui.draft }); });
    screen.querySelector('[data-pg-comment]')?.addEventListener('submit', event => { event.preventDefault(); const post = state.posts.find(post => post.id === ui.postId); if (post) interact({ actorId: post.actorId, kind: 'comment', text: ui.draft, postId: post.id }); });
    screen.querySelectorAll('[data-pg-retry]').forEach(button => button.onclick = () => void generate({ eventId: button.dataset.pgRetry }));
    screen.querySelectorAll('[data-pg-export]').forEach(button => button.onclick = () => exportSheet(screen, readPhoneGameState(scope), button.dataset.pgExport, scope));
    screen.querySelectorAll('[data-pg-gift]').forEach(button => button.onclick = () => interact({ actorId: ui.actorId, kind: 'gift', giftId: button.dataset.pgGift, note: ui.note }));
    screen.querySelector('[data-pg-gifts]')?.addEventListener('click', () => { ui.tab = 'gifts'; paint(); });
    screen.querySelector('[data-pg-wallet]')?.addEventListener('click', () => { ui.tab = 'wallet'; paint(); });
    screen.querySelector('[data-pg-shift]')?.addEventListener('click', () => action(() => { startPhoneGameShift(scope); ui.info = ''; }));
    screen.querySelectorAll('[data-pg-ingredient]').forEach(input => input.onchange = () => { ui.ingredients = [...screen.querySelectorAll('[data-pg-ingredient]:checked')].map(input => input.value); });
    screen.querySelector('[data-pg-serve]')?.addEventListener('click', () => action(() => { const { correct } = servePhoneGameCoffee(ui.ingredients, scope); ui.ingredients = []; ui.info = correct ? '这杯做对了！' : '原料没对上，下一杯再试试。'; }));
    if (app === 'wechat' && ui.actorId) {
      const thread = screen.querySelector('.wpg-thread');
      thread?.scrollTo(0, thread.scrollHeight);
    }
  }
  paint();
}
