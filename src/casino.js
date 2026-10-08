export const PHONE_STATE_KEY = 'world_phone_v1';
export const CASINO_INITIAL_CHIPS = 1000;
export const CASINO_MIN_BET = 10;
export const CASINO_MAX_BET = 500;
export const CASINO_HISTORY_LIMIT = 50;

const SLOT_REELS = ['🍒', '🍋', '🔔', '⭐', '7'];
const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const pendingBranches = new Set();

function context() {
  try { return globalThis.SillyTavern?.getContext?.() || null; } catch { return null; }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function safeInt(value, fallback = 0) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) ? number : fallback;
}

export function casinoBranchKey(backstageState = null) {
  const state = backstageState || context()?.chatMetadata?.world_backstage_v1 || null;
  return String(
    state?.currentState?.lastCommit?.sourceKey
    || state?.currentState?.lastCommit?.source_key
    || state?.lastCommit?.sourceKey
    || 'root',
  ).trim() || 'root';
}

export function createCasinoState() {
  return { version: 1, balance: CASINO_INITIAL_CHIPS, nextRound: 1, history: [] };
}

export function normalizeCasinoState(raw) {
  const state = raw && typeof raw === 'object' ? raw : {};
  return {
    version: 1,
    balance: Math.max(0, safeInt(state.balance, CASINO_INITIAL_CHIPS)),
    nextRound: Math.max(1, safeInt(state.nextRound, 1)),
    history: Array.isArray(state.history) ? state.history.slice(0, CASINO_HISTORY_LIMIT) : [],
  };
}

function readPhoneStore() {
  const ctx = context();
  if (ctx?.chatMetadata) {
    ctx.chatMetadata[PHONE_STATE_KEY] ||= { version: 1, casinoByBranch: {} };
    const store = ctx.chatMetadata[PHONE_STATE_KEY];
    store.casinoByBranch ||= {};
    return { ctx, store };
  }
  let store = { version: 1, casinoByBranch: {} };
  try { store = JSON.parse(globalThis.localStorage?.getItem(PHONE_STATE_KEY) || '') || store; } catch {}
  store.casinoByBranch ||= {};
  return { ctx: null, store };
}

function persistPhoneStore(ctx, store) {
  if (ctx) {
    if (typeof ctx.saveMetadataDebounced === 'function') ctx.saveMetadataDebounced();
    else if (typeof ctx.saveMetadata === 'function') void Promise.resolve(ctx.saveMetadata());
  } else {
    globalThis.localStorage?.setItem(PHONE_STATE_KEY, JSON.stringify(store));
  }
}

export function readCasinoState(branchKey = casinoBranchKey()) {
  const { store } = readPhoneStore();
  return clone(normalizeCasinoState(store.casinoByBranch[branchKey]));
}

function randomIndex(size, rng) {
  const value = Number(rng());
  const bounded = Number.isFinite(value) ? Math.min(0.999999999999, Math.max(0, value)) : 0;
  return Math.floor(bounded * size);
}

export function spinSlots(rng = Math.random) {
  const reels = [0, 1, 2].map(() => SLOT_REELS[randomIndex(SLOT_REELS.length, rng)]);
  let multiplier = 0;
  if (reels.every((symbol) => symbol === '7')) multiplier = 10;
  else if (reels[0] === reels[1] && reels[1] === reels[2]) multiplier = 5;
  else if (new Set(reels).size === 2) multiplier = 2;
  return { outcome: reels.join(' '), multiplier, detail: reels };
}

export function spinRoulette(choice = 'red', rng = Math.random) {
  const number = randomIndex(37, rng);
  const color = number === 0 ? 'green' : RED_NUMBERS.has(number) ? 'red' : 'black';
  const won = (choice === color)
    || (choice === 'even' && number > 0 && number % 2 === 0)
    || (choice === 'odd' && number % 2 === 1);
  return { outcome: `${number} · ${color}`, multiplier: won ? 2 : 0, detail: { number, color, choice } };
}

export function rollDice(choice = 'big', rng = Math.random) {
  const value = randomIndex(6, rng) + 1;
  const won = (choice === 'big' && value >= 4)
    || (choice === 'small' && value <= 3)
    || (choice === 'even' && value % 2 === 0)
    || (choice === 'odd' && value % 2 === 1);
  return { outcome: `⚄ ${value}`, multiplier: won ? 2 : 0, detail: { value, choice } };
}

export function settleCasinoRound(stateInput, { game, choice = '', bet, rng = Math.random, now = () => new Date().toISOString() }) {
  const state = normalizeCasinoState(stateInput);
  const wager = safeInt(bet, 0);
  if (wager < CASINO_MIN_BET) throw new Error(`最低下注 ${CASINO_MIN_BET} 筹码`);
  if (wager > CASINO_MAX_BET) throw new Error(`单局最多下注 ${CASINO_MAX_BET} 筹码`);
  if (wager > state.balance) throw new Error('筹码不足，别把口袋押穿啦');
  const result = game === 'slots' ? spinSlots(rng)
    : game === 'roulette' ? spinRoulette(choice, rng)
      : game === 'dice' ? rollDice(choice, rng)
        : null;
  if (!result) throw new Error('未知赌场游戏');
  const payout = wager * result.multiplier;
  const balance = state.balance - wager + payout;
  if (balance < 0) throw new Error('结算拒绝：余额不能为负数');
  const record = {
    id: `casino-${state.nextRound}`,
    game,
    choice,
    bet: wager,
    payout,
    net: payout - wager,
    outcome: result.outcome,
    detail: clone(result.detail),
    multiplier: result.multiplier,
    createdAt: now(),
  };
  return {
    state: { ...state, balance, nextRound: state.nextRound + 1, history: [record, ...state.history].slice(0, CASINO_HISTORY_LIMIT) },
    record,
  };
}

export function placeCasinoBet(input, { rng = Math.random, branchKey = casinoBranchKey(), now } = {}) {
  if (pendingBranches.has(branchKey)) throw new Error('上一局还在结算，手慢一点点');
  pendingBranches.add(branchKey);
  try {
    const { ctx, store } = readPhoneStore();
    const current = normalizeCasinoState(store.casinoByBranch[branchKey]);
    const settled = settleCasinoRound(current, { ...input, rng, now });
    store.casinoByBranch[branchKey] = settled.state;
    persistPhoneStore(ctx, store);
    return clone(settled);
  } finally {
    pendingBranches.delete(branchKey);
  }
}

export function resetCasinoEntertainment(branchKey = casinoBranchKey()) {
  const { ctx, store } = readPhoneStore();
  store.casinoByBranch[branchKey] = createCasinoState();
  persistPhoneStore(ctx, store);
  return readCasinoState(branchKey);
}
