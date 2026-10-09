import {
  markWorldBackstageConversationRead,
  readWorldBackstage,
  subscribeWorldBackstage,
} from './world-backstage-bridge.js';

export const SYSTEM_REALISM_STORAGE_KEY = 'world_phone_system_realism_v1';

function text(value) {
  return String(value ?? '').trim();
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

export function normalizeSystemState(raw = {}) {
  return {
    focus: Boolean(raw?.focus),
    reduceMotion: Boolean(raw?.reduceMotion),
    brightness: clamp(raw?.brightness ?? 1, 0.35, 1),
  };
}

function readState(storage = globalThis.localStorage) {
  try {
    return normalizeSystemState(JSON.parse(storage?.getItem?.(SYSTEM_REALISM_STORAGE_KEY) || '{}'));
  } catch {
    return normalizeSystemState();
  }
}

function writeState(state, storage = globalThis.localStorage) {
  try {
    storage?.setItem?.(SYSTEM_REALISM_STORAGE_KEY, JSON.stringify(normalizeSystemState(state)));
  } catch {}
}

function appLabel(kind) {
  if (kind === 'message') return '微信';
  if (kind === 'moment') return '朋友圈';
  if (kind === 'news') return '世界新闻';
  return 'Echo 手机';
}

export function buildNotificationFeed(snapshot = {}) {
  return (Array.isArray(snapshot?.unreadNotices) ? snapshot.unreadNotices : [])
    .filter((notice) => !notice?.readAt)
    .map((notice, index) => ({
      id: text(notice?.id) || `notice-${index}`,
      kind: text(notice?.kind) || 'system',
      app: appLabel(text(notice?.kind)),
      title: text(notice?.personName || notice?.title || notice?.headline) || '世界通知',
      body: text(notice?.text || notice?.summary || notice?.body) || '有一条新的世界动态',
      createdAt: text(notice?.createdAt || notice?.updatedAt),
      conversationId: text(notice?.conversationId),
    }))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 24);
}

function notificationGroupKey(item) {
  if (item.kind === 'message' && item.conversationId) return `conversation:${item.conversationId}`;
  return `kind:${item.kind}:${item.app}`;
}

export function buildNotificationGroups(snapshot = {}) {
  const feed = buildNotificationFeed(snapshot);
  const groups = new Map();

  for (const item of feed) {
    const key = notificationGroupKey(item);
    let group = groups.get(key);
    if (!group) {
      group = {
        id: key,
        kind: item.kind,
        app: item.app,
        title: item.kind === 'message' && item.conversationId ? item.title : item.app,
        conversationId: item.kind === 'message' ? item.conversationId : '',
        actionable: item.kind === 'message' && Boolean(item.conversationId),
        count: 0,
        latestCreatedAt: item.createdAt,
        items: [],
      };
      groups.set(key, group);
    }
    group.items.push(item);
    group.count += 1;
    if (String(item.createdAt).localeCompare(String(group.latestCreatedAt)) > 0) {
      group.latestCreatedAt = item.createdAt;
    }
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      items: group.items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
    }))
    .sort((a, b) => String(b.latestCreatedAt).localeCompare(String(a.latestCreatedAt)));
}

export function buildSystemSummary(snapshot = {}, systemState = {}) {
  const notices = buildNotificationFeed(snapshot);
  const state = normalizeSystemState(systemState);
  return {
    connected: Boolean(snapshot?.connected),
    unread: notices.length,
    focus: state.focus,
    reduceMotion: state.reduceMotion,
    brightness: state.brightness,
  };
}

function initials(value) {
  return esc(text(value).slice(0, 1) || '•');
}

function timeLabel(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

function panelShell(kind, title, subtitle, body) {
  return `<section class="wp-system-panel wp-system-panel--${kind}" data-system-panel="${kind}">
    <header><div><b>${esc(title)}</b><small>${esc(subtitle)}</small></div><button type="button" data-system-close aria-label="关闭">×</button></header>
    ${body}
  </section>`;
}

function notificationBody(item, state) {
  return state.focus ? '已在勿扰模式隐藏通知内容' : esc(item.body);
}

function renderNotificationGroup(group, state) {
  const action = group.actionable
    ? `<button type="button" class="wp-system-notification-read" data-system-mark-read="${esc(group.conversationId)}">标为已读</button>`
    : '<span class="wp-system-notification-read is-unavailable">仅查看</span>';
  const items = group.items.map((item) => `
    <button type="button" class="wp-system-notification"${item.conversationId ? ` data-system-conversation="${esc(item.conversationId)}"` : ''}>
      <span class="wp-system-notification-icon">${initials(item.app)}</span>
      <div><small>${item.createdAt ? esc(timeLabel(item.createdAt)) : '未标时间'}</small><b>${esc(item.title)}</b><p>${notificationBody(item, state)}</p></div>
    </button>`).join('');
  return `<section class="wp-system-notification-group" data-system-notification-group="${esc(group.id)}">
    <header>
      <div class="wp-system-notification-group-title"><span class="wp-system-unread-dot"></span><b>${esc(group.title)}</b><small>${esc(group.app)} · ${group.count} 条未读</small></div>
      ${action}
    </header>
    <div class="wp-system-notification-group-items">${items}</div>
  </section>`;
}

function renderNotificationPanel(snapshot, state) {
  const items = buildNotificationFeed(snapshot);
  const groups = buildNotificationGroups(snapshot);
  const body = groups.length
    ? `<main class="wp-system-notification-list">${groups.map((group) => renderNotificationGroup(group, state)).join('')}</main>`
    : '<div class="wp-system-empty"><b>没有未读通知</b><span>新的世界消息会出现在这里。</span></div>';
  const subtitle = state.focus
    ? `勿扰模式已开启 · ${items.length} 条未读 · ${groups.length} 组`
    : `${items.length} 条未读 · ${groups.length} 组`;
  return panelShell('notifications', '通知中心', subtitle, body);
}

function toggleTile(id, icon, title, note, active) {
  return `<button type="button" class="wp-system-tile${active ? ' is-active' : ''}" data-system-toggle="${id}"><span>${esc(icon)}</span><b>${esc(title)}</b><small>${esc(note)}</small></button>`;
}

function renderControlPanel(snapshot, state) {
  const connected = Boolean(snapshot?.connected);
  const body = `<main class="wp-system-control-body">
    <section class="wp-system-control-grid">
      <div class="wp-system-tile is-readonly${connected ? ' is-active' : ''}"><span>SIM</span><b>SIM 卡</b><small>${connected ? '世界背面已插入' : '未插入世界背面 SIM'}</small></div>
      ${toggleTile('focus', '月', '勿扰模式', state.focus ? '通知预览已隐藏' : '通知正常显示', state.focus)}
      ${toggleTile('reduceMotion', '◌', '减少动效', state.reduceMotion ? '系统动画已减少' : '系统动画正常', state.reduceMotion)}
      <button type="button" class="wp-system-tile" data-system-refresh><span>↻</span><b>刷新世界</b><small>重新读取 Phone Bridge</small></button>
    </section>
    <section class="wp-system-slider-card">
      <div><span>☀</span><b>小手机屏幕亮度</b><small>${Math.round(state.brightness * 100)}%</small></div>
      <input type="range" min="35" max="100" step="1" value="${Math.round(state.brightness * 100)}" data-system-brightness aria-label="小手机屏幕亮度">
      <p>只调整这台Echo 手机的画面，不控制真实设备亮度。</p>
    </section>
    <p class="wp-system-boundary">控制中心只管理小手机本机 UI。网络、蓝牙、蜂窝、物理手电筒等真实设备能力不会被伪造。</p>
  </main>`;
  return panelShell('controls', '控制中心', connected ? 'SIM 卡 · 已插入' : 'SIM 卡 · 未插入', body);
}

function ensureChrome(stage) {
  const glass = stage?.querySelector?.('.wp-screen-glass');
  if (!glass) return null;
  let chrome = glass.querySelector(':scope > .wp-system-chrome');
  if (!chrome) {
    chrome = document.createElement('div');
    chrome.className = 'wp-system-chrome';
    chrome.innerHTML = `
      <button type="button" class="wp-system-hotzone wp-system-hotzone--left" data-system-open="notifications" aria-label="打开通知中心"></button>
      <button type="button" class="wp-system-hotzone wp-system-hotzone--right" data-system-open="controls" aria-label="打开控制中心"></button>
      <div class="wp-system-dimmer" aria-hidden="true"></div>
      <div class="wp-system-panel-host" data-system-panel-host hidden></div>`;
    glass.append(chrome);
  }
  return chrome;
}

function ensureSettingsControls(stage, state) {
  const body = stage?.querySelector?.('.wp-device-settings-body');
  if (!body) return false;
  let group = body.querySelector('[data-system-settings-group]');
  if (!group) {
    group = document.createElement('section');
    group.className = 'wp-device-group wp-system-settings-group';
    group.dataset.systemSettingsGroup = '1';
    const firstGroup = body.querySelector('.wp-device-group');
    if (firstGroup) firstGroup.insertAdjacentElement('afterend', group);
    else body.prepend(group);
  }
  const signature = `${state.focus ? 1 : 0}|${state.reduceMotion ? 1 : 0}|${Math.round(state.brightness * 100)}`;
  if (group.dataset.systemStateSignature === signature) return true;
  group.dataset.systemStateSignature = signature;
  group.innerHTML = `<header>系统控制</header>
    <button type="button" class="wp-device-row" data-system-settings-open><span>月</span><div><b>勿扰模式</b><small>点按打开控制中心</small></div><strong>${state.focus ? '已开启' : '关闭'}</strong><i>›</i></button>
    <button type="button" class="wp-device-row" data-system-settings-open><span>☀</span><div><b>屏幕亮度</b><small>仅影响Echo 手机画面</small></div><strong>${Math.round(state.brightness * 100)}%</strong><i>›</i></button>
    <button type="button" class="wp-device-row" data-system-settings-open><span>◌</span><div><b>减少动效</b><small>点按打开控制中心</small></div><strong>${state.reduceMotion ? '已开启' : '关闭'}</strong><i>›</i></button>`;
  return true;
}

function applyState(stage, state) {
  if (!stage) return;
  stage.classList.toggle('is-system-focus', state.focus);
  stage.classList.toggle('is-system-reduce-motion', state.reduceMotion);
  stage.style.setProperty('--wp-system-dim', String((1 - state.brightness) * 0.62));
}

function navigateConversation(conversationId, phone) {
  if (!conversationId) return;
  try { markWorldBackstageConversationRead(conversationId); } catch {}
  phone?.wakeScreen?.();
  if (phone?.openWechatConversation?.(conversationId)) return;
  document.querySelector('#world-phone-stage [data-unlock]')?.click();
  window.setTimeout(() => {
    document.querySelector('#world-phone-stage .wp-home [data-app="wechat"]')?.click();
    window.setTimeout(() => document.querySelector(`#world-phone-stage [data-wx-chat="${CSS.escape(conversationId)}"]`)?.click(), 60);
  }, 60);
}

export function mountSystemRealism({ phone } = {}) {
  let state = readState();
  let snapshot = readWorldBackstage();
  let destroyed = false;
  let observer = null;
  let unsubscribe = null;
  let settingsTimers = [];

  const stage = document.querySelector('#world-phone-stage');

  const syncSnapshot = () => {
    const latest = readWorldBackstage();
    if (latest && typeof latest === 'object') snapshot = latest;
    return snapshot;
  };

  const scheduleSettingsSync = () => {
    settingsTimers.forEach((timer) => clearTimeout(timer));
    settingsTimers = [0, 80, 240].map((delay) => setTimeout(() => {
      if (!destroyed && stage) ensureSettingsControls(stage, state);
    }, delay));
  };

  const closePanel = () => {
    const host = stage?.querySelector?.('[data-system-panel-host]');
    if (!host) return;
    host.hidden = true;
    host.innerHTML = '';
  };

  const paint = () => {
    if (destroyed || !stage) return;
    syncSnapshot();
    const chrome = ensureChrome(stage);
    if (!chrome) return;
    applyState(stage, state);
    ensureSettingsControls(stage, state);
    const count = buildNotificationFeed(snapshot).length;
    const left = chrome.querySelector('[data-system-open="notifications"]');
    if (left) {
      left.dataset.count = count ? String(Math.min(count, 99)) : '';
      left.classList.toggle('has-unread', count > 0);
      left.setAttribute('aria-label', count ? `打开通知中心，${count} 条未读` : '打开通知中心');
    }
  };

  const openPanel = (kind) => {
    syncSnapshot();
    const host = stage?.querySelector?.('[data-system-panel-host]');
    if (!host) return;
    host.hidden = false;
    host.innerHTML = kind === 'controls'
      ? renderControlPanel(snapshot, state)
      : renderNotificationPanel(snapshot, state);
  };

  const persist = () => {
    state = normalizeSystemState(state);
    writeState(state);
    paint();
  };

  const markConversationRead = (conversationId) => {
    const id = text(conversationId);
    if (!id) return;
    try {
      snapshot = markWorldBackstageConversationRead(id) || readWorldBackstage();
    } catch (error) {
      console.error('[Echo 手机] 标记会话已读失败:', error);
      return;
    }
    phone?.refresh?.();
    paint();
    window.setTimeout(() => {
      if (!destroyed) openPanel('notifications');
    }, 0);
  };

  const clickHandler = (event) => {
    if (!stage?.contains(event.target)) return;
    if (event.target?.closest?.('.wp-home [data-app="settings"]')) {
      scheduleSettingsSync();
    }
    const open = event.target?.closest?.('[data-system-open]');
    if (open) {
      event.preventDefault();
      event.stopPropagation();
      openPanel(open.dataset.systemOpen);
      return;
    }
    if (event.target?.closest?.('[data-system-close]')) {
      closePanel();
      return;
    }
    if (event.target?.closest?.('[data-system-settings-open]')) {
      openPanel('controls');
      return;
    }
    const markRead = event.target?.closest?.('[data-system-mark-read]');
    if (markRead?.dataset?.systemMarkRead) {
      event.preventDefault();
      event.stopPropagation();
      markConversationRead(markRead.dataset.systemMarkRead);
      return;
    }
    const toggle = event.target?.closest?.('[data-system-toggle]');
    if (toggle) {
      const key = toggle.dataset.systemToggle;
      if (key === 'focus' || key === 'reduceMotion') state[key] = !state[key];
      persist();
      openPanel('controls');
      return;
    }
    if (event.target?.closest?.('[data-system-refresh]')) {
      syncSnapshot();
      phone?.refresh?.();
      openPanel('controls');
      return;
    }
    const notice = event.target?.closest?.('[data-system-conversation]');
    if (notice?.dataset?.systemConversation) {
      const id = notice.dataset.systemConversation;
      closePanel();
      navigateConversation(id, phone);
    }
  };

  const inputHandler = (event) => {
    if (!event.target?.matches?.('[data-system-brightness]')) return;
    state.brightness = clamp(Number(event.target.value) / 100, 0.35, 1);
    persist();
    const label = event.target.closest('.wp-system-slider-card')?.querySelector('small');
    if (label) label.textContent = `${Math.round(state.brightness * 100)}%`;
  };

  stage?.addEventListener('click', clickHandler, true);
  stage?.addEventListener('input', inputHandler, true);
  if (stage) {
    observer = new MutationObserver(paint);
    observer.observe(stage, { childList: true, subtree: true });
  }
  unsubscribe = subscribeWorldBackstage((next) => {
    snapshot = next || readWorldBackstage();
    paint();
  });
  paint();

  return () => {
    destroyed = true;
    settingsTimers.forEach((timer) => clearTimeout(timer));
    settingsTimers = [];
    stage?.removeEventListener('click', clickHandler, true);
    stage?.removeEventListener('input', inputHandler, true);
    observer?.disconnect();
    unsubscribe?.();
    stage?.querySelector?.('.wp-system-chrome')?.remove();
    stage?.querySelector?.('[data-system-settings-group]')?.remove();
    stage?.classList.remove('is-system-focus', 'is-system-reduce-motion');
    stage?.style.removeProperty('--wp-system-dim');
  };
}
