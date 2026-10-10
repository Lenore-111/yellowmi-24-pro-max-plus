import { DELIVERY_COLA } from './delivery-data.js';
import { readWorldBackstage } from './world-backstage-bridge.js';
import { collectPhoneGameActors, inferPhoneGamePronoun, phoneGameActorPronoun, isPhoneGameScenarioActor } from './phone-game-actors.js?v=0.3.0-alpha.28';

export { phoneGameActorPronoun } from './phone-game-actors.js?v=0.3.0-alpha.28';

export const PHONE_GAME_KEY = 'world_phone_game_v1';
export const PHONE_GAME_GIFTS = Object.freeze([
  { id: DELIVERY_COLA.id, name: DELIVERY_COLA.name, icon: DELIVERY_COLA.emoji, price: DELIVERY_COLA.price, tag: '饮品', delivery: true },
  { id: 'coffee', name: '热咖啡', icon: '☕', price: 25, tag: '咖啡', delivery: true },
  { id: 'cake', name: '草莓小蛋糕', icon: '🍰', price: 45, tag: '甜点', delivery: true },
  { id: 'dinner', name: '暖胃晚餐', icon: '🍱', price: 60, tag: '美食', delivery: true },
  { id: 'tea', name: '清香茶饮', icon: '🍵', price: 20, tag: '茶', delivery: true },
  { id: 'book', name: '一本新书', icon: '📖', price: 55, tag: '阅读' },
  { id: 'plant', name: '窗边小盆栽', icon: '🌱', price: 35, tag: '植物' },
  { id: 'flowers', name: '一束鲜花', icon: '💐', price: 90, tag: '鲜花' },
  { id: 'music', name: '音乐会门票', icon: '🎫', price: 180, tag: '音乐' },
]);
export const PHONE_GAME_RECIPES = Object.freeze([
  { id: 'black', name: '美式', ingredients: ['咖啡', '水'] },
  { id: 'latte', name: '拿铁', ingredients: ['咖啡', '牛奶'] },
  { id: 'mocha', name: '摩卡', ingredients: ['咖啡', '牛奶', '巧克力'] },
  { id: 'tea', name: '奶茶', ingredients: ['茶', '牛奶'] },
]);
const platforms = ['weibo', 'rednote', 'moments'];
const clone = value => JSON.parse(JSON.stringify(value));
const clean = (value, max = 800) => String(value ?? '').trim().slice(0, max);
const integer = (value, min = 0, max = 1000000000) => Math.min(max, Math.max(min, Number.isFinite(Number(value)) ? Math.floor(Number(value)) : 0));
const id = () => globalThis.crypto?.randomUUID?.() || `pg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
function context() { try { return globalThis.SillyTavern?.getContext?.() || null; } catch { return null; } }
const modeListeners = new Set();
let metadataSaveTask = null;
function savePhoneMetadata(scope) {
  if (typeof scope.ctx?.saveMetadata !== 'function') {
    scope.ctx?.saveMetadataDebounced?.();
    return;
  }
  if (metadataSaveTask?.scope.metadata === scope.metadata && metadataSaveTask.scope.key === scope.key) {
    metadataSaveTask.pending = true;
    return metadataSaveTask;
  }
  const task = { scope, pending: false };
  metadataSaveTask = task;
  const sameChat = () => {
    const current = capturePhoneGameScope();
    return current.metadata === scope.metadata && current.key === scope.key;
  };
  task.promise = (async () => {
    try {
      do {
        task.pending = false;
        if (!sameChat()) return;
        await scope.ctx.saveMetadata();
      } while (task.pending && sameChat());
    } catch (error) {
      task.error = new Error(`手机存档保存失败：${error?.message || '请稍后重试'}`);
      console.warn('[Echo 手机] 手机存档保存失败', error);
    }
    finally { if (metadataSaveTask === task) metadataSaveTask = null; }
  })();
  return task;
}
export function flushPhoneGameMetadata(scope) {
  requireScope(scope);
  const task = metadataSaveTask?.scope.metadata === scope.metadata && metadataSaveTask.scope.key === scope.key
    ? metadataSaveTask : savePhoneMetadata(scope);
  if (!task) return null;
  return task.promise.then(() => { if (task.error) throw task.error; });
}
export function subscribePhoneGameModeChange(listener) {
  modeListeners.add(listener);
  return () => modeListeners.delete(listener);
}

export function capturePhoneGameScope() {
  const ctx = context();
  const card = ctx?.characters?.[ctx.characterId];
  const cardIdentity = clean(card?.avatar || card?.data?.avatar)
    || clean(card?.id ?? card?.data?.id)
    || (ctx?.characterId !== undefined && ctx?.characterId !== null ? `character:${ctx.characterId}` : 'none');
  const characterKey = ctx?.groupId ? `group:${ctx.groupId}` : `card:${cardIdentity}`;
  const metadata = ctx?.chatMetadata || null;
  return { ctx, metadata, modeEpoch: integer(readStore({ metadata }).modeEpoch), key: JSON.stringify(['phone-game-v2', characterKey, ctx?.chatMetadata?.persona || ctx?.name1 || '', ctx?.chatId || ctx?.getCurrentChatId?.() || '']) };
}
export function isPhoneGameScopeCurrent(scope) {
  const current = capturePhoneGameScope();
  return current.metadata === scope.metadata && current.key === scope.key && current.modeEpoch === scope.modeEpoch;
}
function requireScope(scope) {
  if (!isPhoneGameScopeCurrent(scope)) throw new Error('聊天或角色已切换，这次操作保留在原存档，请回到原聊天继续。');
}
function readStore(scope) {
  const source = scope.metadata?.[PHONE_GAME_KEY];
  if (scope.metadata) return source && typeof source === 'object' ? source : { mode: 'game', saves: {} };
  try { return JSON.parse(globalThis.localStorage?.getItem(PHONE_GAME_KEY) || 'null') || { mode: 'game', saves: {} }; }
  catch { return { mode: 'game', saves: {} }; }
}
function persist(scope, store) {
  requireScope(scope);
  if (scope.metadata) {
    scope.metadata[PHONE_GAME_KEY] = clone(store);
    // The host cancels debounced metadata saves when a chat closes. Start the
    // save now so a pending SMS survives an immediate chat switch.
    savePhoneMetadata(scope);
  } else {
    if (!globalThis.localStorage) throw new Error('无法保存手机游戏存档');
    globalThis.localStorage.setItem(PHONE_GAME_KEY, JSON.stringify(store));
  }
}
export function readPhoneGameMode() { return readStore(capturePhoneGameScope()).mode === 'world' ? 'world' : 'game'; }
export function setPhoneGameMode(mode) {
  if (!['game', 'world'].includes(mode)) throw new Error('未知手机模式');
  const scope = capturePhoneGameScope();
  const previous = readPhoneGameMode();
  if (previous === 'game' && mode === 'world') {
    for (const call of readPhoneGameState(scope).communications.calls) {
      if (['dialing', 'connected'].includes(call.outcome)) endPhoneGameCall(call.id, scope);
    }
  }
  const store = readStore(scope);
  persist(scope, { ...store, mode, modeEpoch: integer(store.modeEpoch) + (previous === mode ? 0 : 1) });
  if (previous !== mode) for (const listener of modeListeners) {
    try { listener(); } catch (error) { console.warn('[世界小手机] 模式切换通知失败', error); }
  }
}
function collectActors(ctx) {
  return collectPhoneGameActors(ctx, readWorldBackstage().contacts || []);
}
function createState(scope) {
  const ctx = scope.ctx;
  const power = ctx?.powerUserSettings || {};
  const persona = ctx?.chatMetadata?.persona || Object.keys(power.personas || {}).find(key => power.personas[key] === ctx?.name1) || power.default_persona;
  return {
    version: 3, user: clean(ctx?.name1 || '你', 80), userProfile: clean(power.persona_descriptions?.[persona]?.description, 4000),
    actors: collectActors(ctx),
    origin: clean((ctx?.chat || []).filter(message => !message.is_system).slice(-6).map(message => `${message.is_user ? ctx?.name1 || '你' : message.name || ctx?.name2 || '角色'}：${message.mes || ''}`).join('\n'), 7000),
    tick: 0, balance: 100, earned: 0, spent: 0, ledger: [], posts: [], events: [], relations: {}, shift: null,
  };
}
export const phoneGameDialNumber = value => String(value ?? '').replace(/[^0-9+*#]/g, '').slice(0, 24);
function normalizeCommunications(raw, actors) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const actorIds = new Set(actors.map(actor => actor.id));
  const usedNumbers = new Set();
  const contacts = actors.map(actor => {
    const old = (Array.isArray(source.contacts) ? source.contacts : []).find(item => item.actorId === actor.id);
    const supplied = actor.phoneNumber || actor.profile.match(/(?:手机号|手机号码|联系电话|电话号码|phoneNumber)\s*[：:=]\s*([+\d][\d +()-]{3,24})/i)?.[1];
    let hash = 0;
    for (const char of actor.id) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
    const virtual = supplied ? false : old?.number ? Boolean(old.virtual) : true;
    let number = phoneGameDialNumber(supplied || old?.number) || `800${String(hash % 100000000).padStart(8, '0')}`;
    while (virtual && usedNumbers.has(number)) number = `800${String(++hash % 100000000).padStart(8, '0')}`;
    usedNumbers.add(number);
    return { actorId: actor.id, number, virtual, favorite: Boolean(old?.favorite) };
  });
  const calls = (Array.isArray(source.calls) ? source.calls : []).filter(call => call && (!call.actorId || actorIds.has(call.actorId))).slice(-80)
    .map(call => ({ id: clean(call.id, 100), actorId: clean(call.actorId, 180), number: phoneGameDialNumber(call.number),
      startedAt: integer(call.startedAt, 0, Number.MAX_SAFE_INTEGER), connectedAt: integer(call.connectedAt, 0, Number.MAX_SAFE_INTEGER), endedAt: integer(call.endedAt, 0, Number.MAX_SAFE_INTEGER),
      outcome: ['dialing', 'connected', 'ended', 'cancelled', 'declined', 'unavailable'].includes(call.outcome) ? call.outcome : 'unavailable' }));
  const drafts = Object.fromEntries(Object.entries(source.drafts || {}).filter(([key]) => actorIds.has(key) || key === 'new')
    .map(([key, value]) => [key, String(value ?? '').slice(0, 1200)]).filter(([, value]) => value));
  return { contacts, calls, drafts };
}
export function normalizePhoneGameState(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const actors = (Array.isArray(source.actors) ? source.actors : []).filter(actor => actor && clean(actor.id) && clean(actor.name)).slice(0, 12)
    .map(actor => ({ id: clean(actor.id, 180), name: clean(actor.name, 80), profile: clean(actor.profile, 7000), phoneNumber: phoneGameDialNumber(actor.phoneNumber), pronoun: inferPhoneGamePronoun(actor, clean(actor.profile, 7000)) }));
  const actorIds = new Set(actors.map(actor => actor.id));
  const events = (Array.isArray(source.events) ? source.events : []).filter(event => event && actorIds.has(event.actorId)).slice(-160)
    .map(event => ({ id: clean(event.id, 100), actorId: event.actorId, kind: ['chat', 'comment', 'gift', 'sms', 'call'].includes(event.kind) ? event.kind : 'chat',
      text: clean(event.text, 1200), postId: clean(event.postId, 100), giftId: clean(event.giftId, 80), note: clean(event.note, 200),
      tick: integer(event.tick), status: ['replied', 'cancelled'].includes(event.status) ? event.status : 'pending', callId: clean(event.callId, 100), reply: clean(event.reply, 1200),
      affinityDelta: integer(event.affinityDelta, -3, 3) }));
  const posts = (Array.isArray(source.posts) ? source.posts : []).filter(post => post && actorIds.has(post.actorId) && platforms.includes(post.platform)).slice(-80)
    .map(post => ({ id: clean(post.id, 100), actorId: post.actorId, platform: post.platform, title: clean(post.title, 80), text: clean(post.text, 1000),
      liked: Boolean(post.liked), tick: integer(post.tick), mood: clean(post.mood, 40) }));
  const relations = Object.fromEntries(actors.map(actor => {
    const value = Object.hasOwn(source.relations || {}, actor.id) ? source.relations[actor.id] : {};
    return [actor.id, { affinity: integer(value?.affinity, 0, 100), memory: clean(value?.memory, 4000),
      preferences: (Array.isArray(value?.preferences) ? value.preferences : []).map(item => clean(item, 30)).filter(Boolean).slice(0, 6),
      giftCounts: Object.fromEntries(PHONE_GAME_GIFTS.map(gift => [gift.id, integer(value?.giftCounts?.[gift.id])])) }];
  }));
  const shift = source.shift && Array.isArray(source.shift.orders) && source.shift.orders.length === 3
    && source.shift.orders.every(recipe => PHONE_GAME_RECIPES.some(item => item.id === recipe))
    ? { id: clean(source.shift.id, 100), orders: [...source.shift.orders], index: integer(source.shift.index, 0, 3), correct: integer(source.shift.correct, 0, 3), claimed: Boolean(source.shift.claimed) } : null;
  return { version: 3, user: clean(source.user || '你', 80), userProfile: clean(source.userProfile, 4000), actors,
    origin: clean(source.origin, 7000), tick: integer(source.tick), balance: integer(source.balance), earned: integer(source.earned), spent: integer(source.spent),
    ledger: (Array.isArray(source.ledger) ? source.ledger : []).slice(-50).map(item => ({ id: clean(item.id, 100), text: clean(item.text, 160), amount: integer(item.amount, -1000000, 1000000), tick: integer(item.tick) })),
    posts, events, relations, shift, communications: normalizeCommunications(source.communications, actors),
    actorArchive: Array.isArray(source.actorArchive) ? clone(source.actorArchive) : [] };
}
function reconcileActors(raw, ctx) {
  const source = clone(raw);
  const known = collectActors(ctx);
  const actors = Array.isArray(source.actors) ? source.actors : [];
  const excluded = actors.filter(actor => actor && isPhoneGameScenarioActor(actor, ctx));
  const excludedIds = new Set(excluded.map(actor => actor.id));
  const actorArchive = Array.isArray(source.actorArchive) ? source.actorArchive : [];
  const events = Array.isArray(source.events) ? source.events : [];
  const posts = Array.isArray(source.posts) ? source.posts : [];
  for (const actor of excluded) {
    actorArchive.push({ actor, events: events.filter(event => event?.actorId === actor.id),
      posts: posts.filter(post => post?.actorId === actor.id), relation: source.relations?.[actor.id] || {} });
  }
  const active = actors.filter(actor => actor && !excludedIds.has(actor.id)).map(actor => {
    const current = known.find(item => item.id === actor.id);
    return current ? { ...actor, name: current.name, pronoun: current.pronoun,
      profile: current.profile || actor.profile, phoneNumber: current.phoneNumber || actor.phoneNumber } : actor;
  });
  for (const actor of known) {
    if (active.length >= 12) break;
    if (!active.some(item => item.id === actor.id)) active.push(actor);
  }
  return { ...source, actors: active, actorArchive };
}

function legacyPhoneGameSave(store, scope) {
  const [, characterKey, personaKey, chatId] = JSON.parse(scope.key);
  const candidates = Object.entries(store.saves || {}).filter(([key, value]) => {
    if (!value || typeof value !== 'object') return false;
    try {
      const parts = JSON.parse(key);
      return Array.isArray(parts) && parts.length === 4
        && parts[0] === characterKey && parts[1] === personaKey && parts[3] === chatId;
    } catch { return false; }
  });
  // Old versions made one save per committed floor. Recover the furthest phone
  // progress, rather than a freshly reset save at the newest narrative floor.
  // Keep every original entry; never merge balances, gifts or pending replies.
  const progress = value => [
    integer(value.tick), (Array.isArray(value.events) ? value.events : []).length, (Array.isArray(value.posts) ? value.posts : []).length,
    (Array.isArray(value.events) ? value.events : []).filter(event => event?.status === 'replied').length,
    integer(value.earned) + integer(value.spent), (Array.isArray(value.ledger) ? value.ledger : []).length,
  ];
  candidates.sort(([keyA, a], [keyB, b]) => {
    const left = progress(a), right = progress(b);
    for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return right[i] - left[i];
    return keyA.localeCompare(keyB);
  });
  return candidates[0]?.[1] || null;
}

export function readPhoneGameState(scope = capturePhoneGameScope()) {
  requireScope(scope);
  const store = readStore(scope);
  const hasStableSave = Object.hasOwn(store.saves || {}, scope.key);
  const raw = hasStableSave ? store.saves[scope.key] : legacyPhoneGameSave(store, scope);
  if (raw) {
    const state = normalizePhoneGameState(reconcileActors(raw, scope.ctx));
    if (!hasStableSave || JSON.stringify(state) !== JSON.stringify(raw)) persist(scope, { ...store, saves: { ...store.saves, [scope.key]: state } });
    return clone(state);
  }
  const state = normalizePhoneGameState(createState(scope));
  persist(scope, { ...store, saves: { ...store.saves, [scope.key]: state } });
  return clone(state);
}
function commit(scope, mutator) {
  const state = readPhoneGameState(scope);
  mutator(state);
  const next = normalizePhoneGameState(state);
  const store = readStore(scope);
  persist(scope, { ...store, saves: { ...store.saves, [scope.key]: next } });
  return clone(next);
}
function actorIn(state, actorId) {
  const actor = state.actors.find(actor => actor.id === actorId);
  if (!actor) throw new Error('这个角色不在当前手机存档里');
  return actor;
}
export function togglePhoneGameContactFavorite(actorId, scope = capturePhoneGameScope()) {
  return commit(scope, state => {
    actorIn(state, actorId);
    const contact = state.communications.contacts.find(contact => contact.actorId === actorId);
    contact.favorite = !contact.favorite;
  });
}
export function savePhoneGameSmsDraft(actorId, text, scope = capturePhoneGameScope()) {
  return commit(scope, state => {
    if (actorId !== 'new') actorIn(state, actorId);
    if (text) state.communications.drafts[actorId] = String(text).slice(0, 1200);
    else delete state.communications.drafts[actorId];
  });
}
export function startPhoneGameCall(number, scope = capturePhoneGameScope()) {
  let callId, eventId = '';
  const next = commit(scope, state => {
    const dialed = phoneGameDialNumber(number);
    if (!dialed) throw new Error('先输入号码，或选择联系人');
    if (state.communications.calls.some(call => ['dialing', 'connected'].includes(call.outcome))) throw new Error('先挂断当前通话');
    const matches = state.communications.contacts.filter(contact => contact.number === dialed);
    if (matches.length > 1) throw new Error('这个号码对应多个联系人，请检查角色资料里的号码');
    const contact = matches[0];
    const actor = contact ? actorIn(state, contact.actorId) : null;
    if (actor && state.events.some(event => event.actorId === actor.id && event.status === 'pending')) throw new Error('对方还有一条待回应的互动，请先回到原应用重试回应');
    callId = id();
    const now = Date.now();
    state.communications.calls.push({ id: callId, actorId: actor?.id || '', number: dialed, startedAt: now, connectedAt: 0, endedAt: actor ? 0 : now, outcome: actor ? 'dialing' : 'unavailable' });
    if (actor) {
      state.tick += 1; eventId = id();
      state.events.push({ id: eventId, actorId: actor.id, kind: 'call', callId, text: `我拨打了${actor.name}的电话。`, tick: state.tick, status: 'pending', reply: '', affinityDelta: 0 });
    }
  });
  return { state: next, callId, eventId };
}
export function endPhoneGameCall(callId, scope = capturePhoneGameScope(), outcome = '') {
  return commit(scope, state => {
    const call = state.communications.calls.find(call => call.id === callId);
    if (!call || !['dialing', 'connected'].includes(call.outcome)) return;
    call.outcome = outcome === 'unavailable' ? 'unavailable' : call.outcome === 'connected' ? 'ended' : 'cancelled';
    call.endedAt = Date.now();
    for (const event of state.events) if (event.callId === callId && event.status === 'pending') event.status = 'cancelled';
  });
}
export function phoneGameClock(state) { return `第 ${1 + Math.floor(state.tick / 24)} 天 · ${String(8 + Math.floor((state.tick % 24) / 2)).padStart(2, '0')}:${state.tick % 2 ? '30' : '00'}`; }
export function phoneGameRelationLabel(value) { return value >= 75 ? '亲近' : value >= 40 ? '熟悉' : value >= 15 ? '渐渐熟络' : '初识'; }
export function phoneGameEventDisplayText(state, event) {
  const gift = event.kind === 'gift' && PHONE_GAME_GIFTS.find(item => item.id === event.giftId);
  if (!gift) return event.text;
  const actor = state.actors.find(item => item.id === event.actorId);
  return `送给${phoneGameActorPronoun(actor)}${gift.name}${event.note ? `。附言：${event.note}` : ''}`;
}
export function togglePhoneGameLike(postId, scope = capturePhoneGameScope()) {
  return commit(scope, state => { const post = state.posts.find(post => post.id === postId); if (post) post.liked = !post.liked; });
}
export function queuePhoneGameInteraction({ actorId, kind = 'chat', text = '', postId = '', giftId = '', note = '', callId = '' }, scope = capturePhoneGameScope()) {
  let eventId;
  const next = commit(scope, state => {
    const actor = actorIn(state, actorId);
    if (!['chat', 'comment', 'gift', 'sms', 'call'].includes(kind)) throw new Error('未知互动');
    if (state.events.some(event => event.actorId === actorId && event.status === 'pending')) throw new Error(`${phoneGameActorPronoun(actor)}还有一条待回应的互动，先点“重试回应”。`);
    if (kind === 'call' && !state.communications.calls.some(call => call.id === callId && call.actorId === actorId && call.outcome === 'connected')) throw new Error('通话已经结束，请重新拨号');
    if (kind === 'comment' && !state.posts.some(post => post.id === postId && post.actorId === actorId)) throw new Error('原帖已不存在');
    let body = clean(text, 1200);
    if (kind === 'gift') {
      const gift = PHONE_GAME_GIFTS.find(gift => gift.id === giftId);
      if (!gift) throw new Error('礼物不存在');
      if (state.balance < gift.price) throw new Error('余额不够，去钱包玩一班咖啡店吧。');
      state.balance -= gift.price; state.spent += gift.price;
      state.relations[actorId].giftCounts[gift.id] += 1;
      state.ledger.push({ id: id(), text: `送给${actor.name}：${gift.name}`, amount: -gift.price, tick: state.tick });
      body = `送给${phoneGameActorPronoun(actor)}${gift.name}${clean(note, 200) ? `。附言：${clean(note, 200)}` : ''}`;
    }
    if (!body) throw new Error('先写点什么');
    state.tick += 1; eventId = id();
    state.events.push({ id: eventId, actorId, kind, text: body, postId, giftId, callId, note: clean(note, 200), tick: state.tick, status: 'pending', reply: '', affinityDelta: 0 });
  });
  return { state: next, eventId };
}
export function applyPhoneGameReply(eventId, response, scope = capturePhoneGameScope()) {
  return commit(scope, state => {
    const event = state.events.find(event => event.id === eventId);
    if (!event || event.status !== 'pending') throw new Error('这条互动已处理，不会重复结算');
    const reply = typeof response?.text === 'string' ? clean(response.text, 1200) : '';
    if (!reply) throw new Error('角色回应为空，请重试');
    const call = event.kind === 'call' ? state.communications.calls.find(call => call.id === event.callId) : null;
    if (event.kind === 'call') {
      if (!call || !['dialing', 'connected'].includes(call.outcome)) throw new Error('通话已挂断，本次回应未写入');
      if (call.outcome === 'dialing') {
        call.outcome = response.answered === false ? 'declined' : 'connected';
        if (call.outcome === 'connected') call.connectedAt = Date.now(); else call.endedAt = Date.now();
      }
    }
    const relation = state.relations[event.actorId];
    let delta = integer(response.affinityDelta, -3, 3);
    if (call?.outcome === 'declined') delta = 0;
    if (event.kind === 'gift' && relation.giftCounts[event.giftId] > 2) delta = Math.min(delta, 1);
    event.affinityDelta = Math.min(100, Math.max(0, relation.affinity + delta)) - relation.affinity;
    relation.affinity += event.affinityDelta;
    relation.memory = clean(response.memory, 4000) || relation.memory;
    relation.preferences = [...new Set([...relation.preferences, ...(Array.isArray(response.preferences) ? response.preferences : []).map(item => clean(item, 30)).filter(Boolean)])].slice(-6);
    event.reply = reply; event.status = 'replied';
  });
}
export function applyPhoneGamePosts(platform, responses, scope = capturePhoneGameScope()) {
  if (!platforms.includes(platform)) throw new Error('未知平台');
  return commit(scope, state => {
    const posts = (Array.isArray(responses) ? responses : []).filter(item => item && state.actors.some(actor => actor.id === item.actorId) && typeof item.text === 'string' && clean(item.text)).slice(0, 4);
    if (!posts.length) throw new Error('没有收到有效动态，请重试');
    state.tick += 1;
    state.posts.push(...posts.map(item => ({ id: id(), actorId: item.actorId, platform, title: clean(item.title, 80), text: clean(item.text, 1000), mood: clean(item.mood, 40), tick: state.tick, liked: false })));
  });
}
export function startPhoneGameShift(scope = capturePhoneGameScope(), rng = Math.random) {
  return commit(scope, state => {
    if (state.shift && !state.shift.claimed) throw new Error('先做完这一班再开下一班');
    state.shift = { id: id(), orders: Array.from({ length: 3 }, () => PHONE_GAME_RECIPES[integer(rng() * 4, 0, 3)].id), index: 0, correct: 0, claimed: false };
  });
}
export function servePhoneGameCoffee(ingredients, scope = capturePhoneGameScope()) {
  let correct = false;
  const next = commit(scope, state => {
    const shift = state.shift;
    if (!shift || shift.claimed || shift.index >= 3) throw new Error('这一班已经结束');
    const recipe = PHONE_GAME_RECIPES.find(item => item.id === shift.orders[shift.index]);
    const chosen = [...new Set(Array.isArray(ingredients) ? ingredients : [])].sort();
    correct = JSON.stringify(chosen) === JSON.stringify([...recipe.ingredients].sort());
    if (correct) shift.correct += 1;
    shift.index += 1;
    if (shift.index === 3) {
      const reward = 10 + shift.correct * 20;
      shift.claimed = true; state.balance += reward; state.earned += reward; state.tick += 1;
      state.ledger.push({ id: shift.id, text: `咖啡店一班 · ${shift.correct}/3 单正确`, amount: reward, tick: state.tick });
    }
  });
  return { state: next, correct };
}
export function phoneGameEventExport(state, eventId) {
  const event = state.events.find(event => event.id === eventId);
  if (!event) throw new Error('事件已不存在');
  const actor = actorIn(state, event.actorId);
  const action = event.kind === 'gift' ? `我给${actor.name}送了${PHONE_GAME_GIFTS.find(gift => gift.id === event.giftId)?.name || '一份礼物'}${event.note ? `，附言“${event.note}”` : ''}。`
    : event.kind === 'sms' ? `我给${actor.name}发了一条短信：“${event.text}”。`
    : event.kind === 'call' ? `我在与${actor.name}的电话中说：“${event.text}”。`
    : event.kind === 'comment' ? `我在${actor.name}的帖子下留言：“${event.text}”。` : `我用手机给${actor.name}发了一条消息：“${event.text}”。`;
  return `${action}\n请结合正文当前场景安排这个行动及后续回应。`;
}
