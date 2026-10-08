const PHONE_STATE_KEY = 'world_phone_v1';

export const APP_CATALOG = Object.freeze([
  {
    id: 'world-square',
    name: '世界广场',
    icon: '广',
    tone: 'is-square',
    category: '社交',
    size: '28 MB',
    releaseReady: false,
    description: '公开动态、热榜、话题与世界讨论。下一阶段优先施工。',
  },
  {
    id: 'short-video',
    name: '短视频',
    icon: '▶',
    tone: 'is-short-video',
    category: '社交',
    size: '36 MB',
    releaseReady: false,
    description: '刷短视频、看评论和世界里的热门片段。',
  },
  {
    id: 'photo-note',
    name: '图集',
    icon: '◇',
    tone: 'is-photo-note',
    category: '社交',
    size: '31 MB',
    releaseReady: false,
    description: '图片动态、生活记录和收藏夹。',
  },
  {
    id: 'anon-forum',
    name: '匿名论坛',
    icon: '#',
    tone: 'is-anon-forum',
    category: '社交',
    size: '18 MB',
    releaseReady: false,
    description: '匿名发帖、围观八卦和公开讨论。',
  },
  {
    id: 'mail',
    name: '邮箱',
    icon: '✉',
    tone: 'is-mail',
    category: '工具',
    size: '12 MB',
    releaseReady: false,
    description: '邮件、系统通知与较正式的通讯入口。',
  },
  {
    id: 'map',
    name: '地图',
    icon: '⌖',
    tone: 'is-map',
    category: '工具',
    size: '24 MB',
    releaseReady: false,
    description: '世界地点与路线入口。只展示已有世界信息。',
  },
]);

const CATALOG_BY_ID = new Map(APP_CATALOG.map((app) => [app.id, app]));

function context() {
  try { return globalThis.SillyTavern?.getContext?.() || null; } catch { return null; }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeInstalled(value) {
  const seen = new Set();
  const installed = [];
  for (const raw of Array.isArray(value) ? value : []) {
    const id = String(raw || '').trim();
    const app = CATALOG_BY_ID.get(id);
    if (!app?.releaseReady || seen.has(id)) continue;
    seen.add(id);
    installed.push(id);
  }
  return installed;
}

function readPhoneStore() {
  const ctx = context();
  if (ctx?.chatMetadata) {
    ctx.chatMetadata[PHONE_STATE_KEY] ||= { version: 1 };
    const store = ctx.chatMetadata[PHONE_STATE_KEY];
    store.version ||= 1;
    const before = JSON.stringify(Array.isArray(store.installedApps) ? store.installedApps : []);
    store.installedApps = normalizeInstalled(store.installedApps);
    if (JSON.stringify(store.installedApps) !== before) persistPhoneStore(ctx, store);
    return { ctx, store };
  }

  let store = { version: 1, installedApps: [] };
  try {
    store = JSON.parse(globalThis.localStorage?.getItem(PHONE_STATE_KEY) || '') || store;
  } catch {}
  store.version ||= 1;
  const before = JSON.stringify(Array.isArray(store.installedApps) ? store.installedApps : []);
  store.installedApps = normalizeInstalled(store.installedApps);
  if (JSON.stringify(store.installedApps) !== before) persistPhoneStore(null, store);
  return { ctx: null, store };
}

function persistPhoneStore(ctx, store) {
  if (ctx) {
    if (typeof ctx.saveMetadataDebounced === 'function') ctx.saveMetadataDebounced();
    else if (typeof ctx.saveMetadata === 'function') void Promise.resolve(ctx.saveMetadata());
    return;
  }
  globalThis.localStorage?.setItem(PHONE_STATE_KEY, JSON.stringify(store));
}

export function getCatalogApp(id) {
  return CATALOG_BY_ID.get(String(id || '').trim()) || null;
}

export function readInstalledAppIds() {
  const { store } = readPhoneStore();
  return [...store.installedApps];
}

export function readInstalledApps() {
  const installed = new Set(readInstalledAppIds());
  return APP_CATALOG.filter((app) => installed.has(app.id)).map(clone);
}

export function isAppInstalled(id) {
  return readInstalledAppIds().includes(String(id || '').trim());
}

export function installApp(id) {
  const app = getCatalogApp(id);
  if (!app) throw new Error('这个 App 不在应用商店里');
  if (!app.releaseReady) throw new Error('这个 App 还在开发中');
  const { ctx, store } = readPhoneStore();
  if (!store.installedApps.includes(app.id)) store.installedApps.push(app.id);
  store.installedApps = normalizeInstalled(store.installedApps);
  persistPhoneStore(ctx, store);
  return clone(app);
}

export function uninstallApp(id) {
  const app = getCatalogApp(id);
  if (!app) throw new Error('这个 App 不在应用商店里');
  const { ctx, store } = readPhoneStore();
  store.installedApps = normalizeInstalled(store.installedApps).filter((item) => item !== app.id);
  persistPhoneStore(ctx, store);
  return clone(app);
}
