import { readWorldBackstage } from './world-backstage-bridge.js';

const VERSION = '0.3.0-alpha.25';
const KNOWN_KEYS = {
  social: 'world_phone_social_realism_v1',
  utility: 'world_phone_utility_realism_v1',
  communication: 'world_phone_communication_realism_v1',
  werewolf: 'world_phone_werewolf_local_v1',
};

function text(value) {
  return String(value ?? '').trim();
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

function parseStorage(storage, key) {
  try {
    const raw = storage?.getItem?.(key);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function countEnabled(map) {
  return Object.values(map && typeof map === 'object' ? map : {}).filter(Boolean).length;
}

function storageByteLength(storage) {
  let bytes = 0;
  try {
    const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
    for (let i = 0; i < Number(storage?.length || 0); i += 1) {
      const key = storage.key(i);
      if (!String(key || '').startsWith('world_phone_')) continue;
      const value = storage.getItem(key) || '';
      const joined = `${key}${value}`;
      bytes += encoder ? encoder.encode(joined).length : joined.length * 2;
    }
  } catch {}
  return bytes;
}

function formatBytes(bytes) {
  const value = Math.max(0, Number(bytes) || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(value >= 10 * 1024 ? 0 : 1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function buildDeviceSummary(snapshot = {}, storage = globalThis.localStorage) {
  const social = parseStorage(storage, KNOWN_KEYS.social);
  const utility = parseStorage(storage, KNOWN_KEYS.utility);
  const communication = parseStorage(storage, KNOWN_KEYS.communication);
  const werewolf = parseStorage(storage, KNOWN_KEYS.werewolf);
  const socialActions = countEnabled(social.weibo?.liked) + countEnabled(social.weibo?.saved)
    + countEnabled(social.rednote?.liked) + countEnabled(social.rednote?.saved);
  const worldTime = [text(snapshot.clock?.date), text(snapshot.clock?.time)].filter(Boolean).join(' ');
  return {
    connected: Boolean(snapshot.connected),
    user: text(snapshot.user) || '你',
    worldTime: worldTime || '跟随设备时间',
    people: Array.isArray(snapshot.people) ? snapshot.people.length : 0,
    contacts: Array.isArray(snapshot.contacts) ? snapshot.contacts.length : 0,
    conversations: Array.isArray(snapshot.conversations) ? snapshot.conversations.length : 0,
    socialActions,
    galleryFavorites: countEnabled(utility.gallery?.favorites),
    browserBookmarks: countEnabled(utility.browser?.bookmarks),
    browserHistory: Array.isArray(utility.browser?.history) ? utility.browser.history.length : 0,
    phoneRecents: Array.isArray(communication.phone?.recents) ? communication.phone.recents.length : 0,
    smsDrafts: Object.values(communication.sms?.drafts && typeof communication.sms.drafts === 'object' ? communication.sms.drafts : {}).filter((value) => text(value)).length,
    werewolfActive: Boolean(werewolf?.game_id && werewolf?.status !== 'ended'),
    localBytes: storageByteLength(storage),
  };
}

function settingsRow(icon, title, value, options = {}) {
  const tag = options.app ? 'button' : 'div';
  const app = options.app ? ` data-device-open-app="${esc(options.app)}"` : '';
  const cls = options.good ? ' is-good' : '';
  return `<${tag} class="wp-device-row"${app}><span class="wp-device-row-icon">${esc(icon)}</span><div><b>${esc(title)}</b>${options.note ? `<small>${esc(options.note)}</small>` : ''}</div><strong class="${cls}">${esc(value)}</strong>${options.app ? '<i>›</i>' : ''}</${tag}>`;
}

function renderSettingsDetails(section, phone) {
  const snapshot = readWorldBackstage();
  const summary = buildDeviceSummary(snapshot);
  section.classList.add('wp-device-settings');
  section.dataset.deviceRealism = '1';

  const header = section.querySelector('.wp-app-header');
  const subtitle = header?.querySelector('small');
  if (subtitle) subtitle.textContent = '设备与隐私';

  const hero = section.querySelector('.wp-settings-hero');
  if (hero) {
    hero.outerHTML = `<div class="wp-device-profile"><span>${esc(summary.user.slice(0, 1) || '我')}</span><div><b>${esc(summary.user)}</b><small>世界小手机 · ${esc(VERSION)}</small></div><i class="${summary.connected ? 'is-good' : ''}">${summary.connected ? 'SIM 已插入' : '无 SIM'}</i></div>`;
  }

  const list = section.querySelector('.wp-settings-list');
  if (list) {
    list.outerHTML = `<main class="wp-device-settings-body">
      <section class="wp-device-group"><header>连接与隐私</header>
        ${settingsRow('SIM', 'SIM 卡', summary.connected ? '已插入' : '未插入', { good: summary.connected, note: '世界背面 · 只读取 Phone Bridge v2 授权表面' })}
        ${settingsRow('时', '世界时间', summary.worldTime, { note: '有世界时间时优先显示世界时间' })}
        <div class="wp-device-privacy-note"><b>数据边界</b><p>微博、小红书、浏览历史、相册收藏、拨号失败记录和短信草稿都是本机 UI 数据，不会被写成世界事实。</p></div>
      </section>
      <section class="wp-device-group"><header>应用与本机数据</header>
        ${settingsRow('微', '通讯', `${summary.contacts} 联系人 · ${summary.conversations} 会话`, { note: `${summary.people} 个世界人物` })}
        ${settingsRow('博', '社交互动', `${summary.socialActions}`, { note: '本机点赞与收藏' })}
        ${settingsRow('▧', '相册', `${summary.galleryFavorites} 收藏`, { app: 'gallery', note: '只收真实图片来源' })}
        ${settingsRow('◎', '浏览器', `${summary.browserBookmarks} 书签`, { app: 'browser', note: `${summary.browserHistory} 条本机历史` })}
        ${settingsRow('☎', '电话', `${summary.phoneRecents} 最近`, { app: 'phone', note: '未开放通话桥时只记失败尝试' })}
        ${settingsRow('●', '短信', `${summary.smsDrafts} 草稿`, { app: 'messages', note: '未开放发送桥时不伪造送达' })}
        ${settingsRow('狼', '狼人杀', summary.werewolfActive ? '进行中' : '无进行中对局', { app: 'werewolf-local', note: '游戏状态只在本机' })}
      </section>
      <section class="wp-device-group"><header>设备</header>
        ${settingsRow('存', '世界小手机数据', formatBytes(summary.localBytes), { note: '仅统计 world_phone_ 本机存储' })}
        ${settingsRow('版', '版本', VERSION, { note: 'Alpha 构建' })}
        <button type="button" class="wp-device-refresh" data-device-refresh>↻ 重新读取设备状态</button>
      </section>
    </main>`;
  }

  const foot = section.querySelector('.wp-settings-foot');
  if (foot) foot.innerHTML = 'World Phone<br><small>世界背面作为 SIM 提供世界数据，本机交互状态归小手机。</small>';

  section.querySelector('[data-device-refresh]')?.addEventListener('click', () => phone?.refresh?.());
  section.querySelectorAll('[data-device-open-app]').forEach((button) => button.addEventListener('click', () => {
    const app = button.dataset.deviceOpenApp;
    section.querySelector('[data-app-back]')?.click();
    window.setTimeout(() => document.querySelector(`#world-phone-stage .wp-home [data-app="${CSS.escape(app)}"]`)?.click(), 80);
  }));
}

function addScreenLight(lock) {
  let overlay = lock.querySelector('.wp-screen-light-overlay');
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.className = 'wp-screen-light-overlay';
  overlay.innerHTML = '<span>屏幕补光</span>';
  lock.prepend(overlay);
  return overlay;
}

function enhanceLock(phone, state) {
  const lock = document.querySelector('#world-phone-stage .wp-lockscreen');
  if (!lock || lock.dataset.deviceRealism === '1') return;
  lock.dataset.deviceRealism = '1';
  const shortcuts = [...lock.querySelectorAll('.wp-lock-shortcut')];
  const light = shortcuts.find((button) => button.getAttribute('aria-label') === '手电筒') || shortcuts[0];
  const camera = shortcuts.find((button) => button.getAttribute('aria-label') === '相机') || shortcuts[1];

  if (light) {
    light.setAttribute('aria-label', '屏幕补光');
    light.title = '屏幕补光（不会控制设备物理手电筒）';
    light.classList.toggle('is-active', state.lightOn);
    if (state.lightOn) addScreenLight(lock);
    light.addEventListener('click', () => {
      state.lightOn = !state.lightOn;
      light.classList.toggle('is-active', state.lightOn);
      if (state.lightOn) addScreenLight(lock); else lock.querySelector('.wp-screen-light-overlay')?.remove();
    });
  }

  if (camera) {
    camera.setAttribute('aria-label', '打开相册');
    camera.title = '打开相册（浏览世界里真实存在的图片）';
    camera.addEventListener('click', () => {
      state.lightOn = false;
      lock.querySelector('[data-unlock]')?.click();
      window.setTimeout(() => document.querySelector('#world-phone-stage .wp-home [data-app="gallery"]')?.click(), 80);
    });
  }
}

export function mountDeviceRealism({ phone } = {}) {
  const state = { lightOn: false };
  let destroyed = false;
  let queued = false;

  const enhance = () => {
    if (destroyed) return;
    const settings = document.querySelector('#world-phone-stage .wp-settings-app:not([data-device-realism="1"])');
    if (settings) renderSettingsDetails(settings, phone);
    enhanceLock(phone, state);
  };

  const queueEnhance = () => {
    if (queued || destroyed) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      enhance();
    });
  };

  const stage = document.querySelector('#world-phone-stage');
  const observer = new MutationObserver(queueEnhance);
  if (stage) observer.observe(stage, { childList: true, subtree: true });
  enhance();

  return () => {
    destroyed = true;
    observer.disconnect();
  };
}

export { KNOWN_KEYS as DEVICE_REALISM_STORAGE_KEYS };
