import { PHONE_STATE_KEY, casinoBranchKey } from './casino.js';

export const WALLET_HISTORY_LIMIT = 30;

const SIGNAL_RULES = [
  { id: 'student', label: '学生生活', weight: -1, pattern: /(?:大学|大[一二三四]|学生|校园|宿舍|student|college|university)/iu },
  { id: 'unemployed', label: '暂时没固定工作', weight: -2, pattern: /(?:待业|失业|无业|没有工作|没工作|unemployed|jobless)/iu },
  { id: 'parttime', label: '兼职/打工', weight: -1, pattern: /(?:兼职|打工|零工|part[- ]?time|side job)/iu },
  { id: 'family', label: '家庭支持', weight: 1, pattern: /(?:生活费|家里给|父母给|家庭支持|家里转|allowance)/iu },
  { id: 'rent', label: '有固定居住开销', weight: -1, pattern: /(?:租房|合租|房租|rent|roommate)/iu },
  { id: 'debt', label: '有债务压力', weight: -3, pattern: /(?:负债|欠债|债务|贷款逾期|debt|broke|破产)/iu },
  { id: 'poor', label: '经济偏紧', weight: -3, pattern: /(?:贫穷|很穷|没钱|拮据|吃不起|穷学生|poor|penniless)/iu },
  { id: 'job', label: '有稳定工作', weight: 1, pattern: /(?:上班|工作稳定|正式工作|职员|公务员|教师|医生|工程师|律师|salary|employed|employee)/iu },
  { id: 'professional', label: '职业收入较高', weight: 2, pattern: /(?:高管|管理层|主治|教授|合伙人|企业家|创业成功|executive|partner|founder)/iu },
  { id: 'wealthy', label: '家境/资产优渥', weight: 4, pattern: /(?:富二代|豪门|财团|继承人|继承|家族企业|贵族|王室|有钱人|富豪|wealthy|millionaire|billionaire|heiress|heir)/iu },
  { id: 'luxury', label: '高消费生活', weight: 2, pattern: /(?:豪车|跑车|私人飞机|游艇|奢侈品|别墅|豪宅|庄园|mansion|luxury|yacht|private jet)/iu },
  { id: 'homeless', label: '居住不稳定', weight: -4, pattern: /(?:流浪|无家可归|睡桥洞|homeless)/iu },
];

const TIER_META = {
  strapped: {
    label: '紧巴巴', minBank: 40, maxBank: 1200, minCash: 5, maxCash: 180, minMonthly: 200, maxMonthly: 900,
    verdicts: ['钱包很轻，月底尤其安静。', '每一笔小钱都值得多看一眼。', '能活，但经不起连续几个“算了就买吧”。'],
  },
  modest: {
    label: '普通偏紧', minBank: 800, maxBank: 6800, minCash: 30, maxCash: 480, minMonthly: 800, maxMonthly: 3200,
    verdicts: ['日常够用，大件得先想一想。', '不会立刻饿死，但也不适合心血来潮。', '卡里有一点安全感，只有一点。'],
  },
  ordinary: {
    label: '普通', minBank: 4800, maxBank: 36000, minCash: 80, maxCash: 1200, minMonthly: 2200, maxMonthly: 7800,
    verdicts: ['正常生活没问题，偶尔还能奖励自己。', '看起来就是会认真活着、也会乱买点东西的余额。', '不富，也没穷到需要和余额面面相觑。'],
  },
  comfortable: {
    label: '宽裕', minBank: 28000, maxBank: 180000, minCash: 200, maxCash: 2800, minMonthly: 7000, maxMonthly: 24000,
    verdicts: ['消费时不太需要盯着最后两位数。', '生活挺宽松，余额有一点底气。', '大多数日常开销不会让这张卡皱眉。'],
  },
  wealthy: {
    label: '很有钱', minBank: 180000, maxBank: 2800000, minCash: 600, maxCash: 9000, minMonthly: 26000, maxMonthly: 160000,
    verdicts: ['这已经不是“月底还能剩多少”的问题了。', '余额看起来非常不需要七替它操心。', '有钱，而且是钱包自己知道自己有钱的那种。'],
  },
};

function context() {
  try { return globalThis.SillyTavern?.getContext?.() || null; } catch { return null; }
}

function text(value, fallback = '') {
  const clean = String(value ?? '').trim();
  return clean || fallback;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function hash32(value) {
  let hash = 2166136261;
  for (const char of String(value ?? '')) {
    hash ^= char.codePointAt(0) || 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed) {
  let state = (seed >>> 0) || 0x6d2b79f5;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function roundedBetween(min, max, rng, step = 1) {
  const raw = min + ((max - min) * rng());
  return Math.max(0, Math.round(raw / step) * step);
}

function selectedPersona(ctx) {
  const power = ctx?.powerUserSettings || {};
  const personas = power?.personas || {};
  const descriptions = power?.persona_descriptions || {};
  let id = text(ctx?.chatMetadata?.persona);
  if (!id) {
    id = Object.entries(personas).find(([, name]) => text(name) === text(ctx?.name1))?.[0]
      || text(power?.default_persona);
  }
  const record = descriptions?.[id] || {};
  return {
    id,
    name: text(personas?.[id], text(ctx?.name1, '你')),
    title: text(record?.title),
    description: text(record?.description),
  };
}

function openingText(ctx) {
  const chat = Array.isArray(ctx?.chat) ? ctx.chat : [];
  return chat.slice(0, 8)
    .map((message) => text(message?.mes ?? message?.text ?? message?.content))
    .filter(Boolean)
    .join('\n')
    .slice(0, 7000);
}

function scenarioText(ctx) {
  const index = Number(ctx?.characterId);
  const character = Number.isInteger(index) && index >= 0 ? ctx?.characters?.[index] : null;
  return text(character?.scenario ?? character?.data?.scenario).slice(0, 2200);
}

export function collectWalletProfile(ctx = context()) {
  const persona = selectedPersona(ctx);
  const opening = openingText(ctx);
  const scenario = scenarioText(ctx);
  const combined = [persona.title, persona.description, opening, scenario].filter(Boolean).join('\n');
  return {
    personaId: persona.id,
    personaName: persona.name,
    personaTitle: persona.title,
    personaDescription: persona.description,
    opening,
    scenario,
    combined,
  };
}

function detectCurrency(input) {
  if (/(?:美元|美金|usd|dollars?|\$)/iu.test(input)) return { symbol: '$', code: 'USD' };
  if (/(?:欧元|eur|euros?|€)/iu.test(input)) return { symbol: '€', code: 'EUR' };
  if (/(?:英镑|gbp|pounds?|£)/iu.test(input)) return { symbol: '£', code: 'GBP' };
  if (/(?:日元|円|jpy|日本)/iu.test(input)) return { symbol: '¥', code: 'JPY' };
  return { symbol: '¥', code: 'CNY' };
}

function tierForScore(score) {
  if (score <= -3) return 'strapped';
  if (score <= -1) return 'modest';
  if (score <= 1) return 'ordinary';
  if (score <= 3) return 'comfortable';
  return 'wealthy';
}

function incomeLabel(signalIds, tier) {
  if (signalIds.has('student') && signalIds.has('family')) return '生活费 / 家庭投喂';
  if (signalIds.has('student') && signalIds.has('parttime')) return '生活费 + 兼职';
  if (signalIds.has('student')) return '生活费 / 零散收入';
  if (signalIds.has('wealthy')) return '家庭资产 / 自由现金流';
  if (signalIds.has('professional')) return '职业收入';
  if (signalIds.has('job')) return '工资 / 固定收入';
  if (tier === 'strapped' || tier === 'modest') return '零散收入 / 暂不稳定';
  return '日常收入';
}

export function estimateWalletProfile(profile, { revision = 0, bias = 0 } = {}) {
  const source = text(profile?.combined);
  const matches = SIGNAL_RULES.filter((rule) => rule.pattern.test(source));
  const score = matches.reduce((sum, rule) => sum + rule.weight, 0) + clamp(bias, -2, 2);
  const tier = tierForScore(score);
  const meta = TIER_META[tier];
  const signature = `${profile?.personaId}|${profile?.personaName}|${source}|${revision}|${bias}`;
  const rng = seededRandom(hash32(signature));
  const currency = detectCurrency(source);
  const bank = roundedBetween(meta.minBank, meta.maxBank, rng, tier === 'wealthy' ? 100 : 10);
  const cash = roundedBetween(meta.minCash, meta.maxCash, rng, 1);
  const monthlyDisposable = roundedBetween(meta.minMonthly, meta.maxMonthly, rng, tier === 'wealthy' ? 100 : 10);
  const signalIds = new Set(matches.map((item) => item.id));
  const verdict = meta.verdicts[Math.floor(rng() * meta.verdicts.length)] || meta.verdicts[0];
  const cardLast4 = String(1000 + Math.floor(rng() * 9000));
  const signals = matches.length
    ? matches.slice(0, 4).map((item) => item.label)
    : ['没有明显财富线索', '按普通生活估算'];
  return {
    version: 1,
    mode: 'entertainment',
    nonCanon: true,
    revision: Math.max(0, Math.floor(Number(revision) || 0)),
    bias: clamp(bias, -2, 2),
    personaName: text(profile?.personaName, '你'),
    personaId: text(profile?.personaId),
    tier,
    tierLabel: meta.label,
    currency: currency.symbol,
    currencyCode: currency.code,
    bank,
    cash,
    monthlyDisposable,
    incomeLabel: incomeLabel(signalIds, tier),
    verdict,
    signals,
    cardLast4,
    profileHash: hash32(`${profile?.personaId}|${source}`).toString(16),
    estimatedAt: new Date().toISOString(),
    history: [],
  };
}

function normalizeWalletState(raw) {
  const state = raw && typeof raw === 'object' ? raw : {};
  const tier = Object.hasOwn(TIER_META, state.tier) ? state.tier : 'ordinary';
  return {
    version: 1,
    mode: 'entertainment',
    nonCanon: true,
    revision: Math.max(0, Math.floor(Number(state.revision) || 0)),
    bias: clamp(state.bias, -2, 2),
    personaName: text(state.personaName, '你'),
    personaId: text(state.personaId),
    tier,
    tierLabel: text(state.tierLabel, TIER_META[tier].label),
    currency: text(state.currency, '¥'),
    currencyCode: text(state.currencyCode, 'CNY'),
    bank: Math.max(0, Math.round(Number(state.bank) || 0)),
    cash: Math.max(0, Math.round(Number(state.cash) || 0)),
    monthlyDisposable: Math.max(0, Math.round(Number(state.monthlyDisposable) || 0)),
    incomeLabel: text(state.incomeLabel, '日常收入'),
    verdict: text(state.verdict, '只是一个娱乐估算。'),
    signals: Array.isArray(state.signals) ? state.signals.map(String).slice(0, 6) : [],
    cardLast4: /^\d{4}$/.test(String(state.cardLast4 || '')) ? String(state.cardLast4) : '0007',
    profileHash: text(state.profileHash),
    estimatedAt: text(state.estimatedAt),
    history: Array.isArray(state.history) ? state.history.slice(0, WALLET_HISTORY_LIMIT) : [],
  };
}

function readPhoneStore() {
  const ctx = context();
  if (ctx?.chatMetadata) {
    ctx.chatMetadata[PHONE_STATE_KEY] ||= { version: 1, casinoByBranch: {}, walletByBranch: {} };
    const store = ctx.chatMetadata[PHONE_STATE_KEY];
    store.casinoByBranch ||= {};
    store.walletByBranch ||= {};
    return { ctx, store };
  }
  let store = { version: 1, casinoByBranch: {}, walletByBranch: {} };
  try { store = JSON.parse(globalThis.localStorage?.getItem(PHONE_STATE_KEY) || '') || store; } catch {}
  store.casinoByBranch ||= {};
  store.walletByBranch ||= {};
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

export function readWalletState(branchKey = casinoBranchKey()) {
  const { ctx, store } = readPhoneStore();
  const existing = store.walletByBranch[branchKey];
  if (existing) return clone(normalizeWalletState(existing));
  const initial = estimateWalletProfile(collectWalletProfile(ctx), { revision: 0, bias: 0 });
  store.walletByBranch[branchKey] = initial;
  persistPhoneStore(ctx, store);
  return clone(normalizeWalletState(initial));
}

export function rerollWalletEntertainment({ direction = 0, branchKey = casinoBranchKey() } = {}) {
  const { ctx, store } = readPhoneStore();
  const current = existingOrCreate(store, ctx, branchKey);
  const nextBias = clamp(current.bias + clamp(direction, -1, 1), -2, 2);
  const next = estimateWalletProfile(collectWalletProfile(ctx), {
    revision: current.revision + 1,
    bias: nextBias,
  });
  store.walletByBranch[branchKey] = next;
  persistPhoneStore(ctx, store);
  return clone(normalizeWalletState(next));
}

function existingOrCreate(store, ctx, branchKey) {
  if (store.walletByBranch[branchKey]) return normalizeWalletState(store.walletByBranch[branchKey]);
  const created = estimateWalletProfile(collectWalletProfile(ctx), { revision: 0, bias: 0 });
  store.walletByBranch[branchKey] = created;
  return created;
}

export function adjustWalletEntertainment({ amount, account = 'bank', reason = '娱乐消费', source = 'world-phone', branchKey = casinoBranchKey() }) {
  const delta = Math.round(Number(amount) || 0);
  if (!delta) throw new Error('金额不能为 0');
  if (!['bank', 'cash'].includes(account)) throw new Error('未知钱包账户');
  const { ctx, store } = readPhoneStore();
  const current = existingOrCreate(store, ctx, branchKey);
  const nextBalance = current[account] + delta;
  if (nextBalance < 0) throw new Error('娱乐钱包余额不足');
  const record = {
    id: `wallet-${Date.now().toString(36)}-${Math.abs(delta)}`,
    account,
    amount: delta,
    reason: text(reason, '娱乐变动').slice(0, 120),
    source: text(source, 'world-phone').slice(0, 80),
    createdAt: new Date().toISOString(),
    nonCanon: true,
  };
  const next = normalizeWalletState({
    ...current,
    [account]: nextBalance,
    history: [record, ...current.history].slice(0, WALLET_HISTORY_LIMIT),
  });
  store.walletByBranch[branchKey] = next;
  persistPhoneStore(ctx, store);
  return clone(next);
}

export function resetWalletEntertainment(branchKey = casinoBranchKey()) {
  const { ctx, store } = readPhoneStore();
  delete store.walletByBranch[branchKey];
  persistPhoneStore(ctx, store);
  return readWalletState(branchKey);
}
