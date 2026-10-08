export const APP_SWITCHER_STORAGE_KEY = 'world_phone_recent_apps_v1';
export const APP_SWITCHER_LIMIT = 8;

function text(value, max = 120) {
  return String(value ?? '').trim().slice(0, max);
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

function safeTime(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function normalizeRecentApps(raw) {
  const source = Array.isArray(raw) ? raw : raw?.apps;
  const seen = new Set();
  const apps = [];
  for (const item of (Array.isArray(source) ? source : []).slice(0, 64)) {
    const id = text(item?.id, 80);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    apps.push({
      id,
      label: text(item?.label, 40) || id,
      icon: text(item?.icon, 8) || '◌',
      openedAt: safeTime(item?.openedAt, 0),
    });
  }
  return apps.sort((a, b) => b.openedAt - a.openedAt).slice(0, APP_SWITCHER_LIMIT);
}

export function recordRecentApp(current, app, openedAt = Date.now()) {
  const id = text(app?.id, 80);
  if (!id) return normalizeRecentApps(current);
  const entry = {
    id,
    label: text(app?.label, 40) || id,
    icon: text(app?.icon, 8) || '◌',
    openedAt: safeTime(openedAt, Date.now()),
  };
  return normalizeRecentApps([entry, ...normalizeRecentApps(current).filter((item) => item.id !== id)]);
}

function readState(storage = globalThis.localStorage) {
  try { return normalizeRecentApps(JSON.parse(storage?.getItem?.(APP_SWITCHER_STORAGE_KEY) || '[]')); }
  catch { return []; }
}

function writeState(apps, storage = globalThis.localStorage) {
  const clean = normalizeRecentApps(apps);
  try { storage?.setItem?.(APP_SWITCHER_STORAGE_KEY, JSON.stringify(clean)); } catch {}
  return clean;
}

function relativeTime(openedAt, now = Date.now()) {
  const delta = Math.max(0, now - Number(openedAt || 0));
  if (delta < 60_000) return '刚刚';
  if (delta < 60 * 60_000) return `${Math.floor(delta / 60_000)} 分钟前`;
  if (delta < 24 * 60 * 60_000) return `${Math.floor(delta / (60 * 60_000))} 小时前`;
  return `${Math.floor(delta / (24 * 60 * 60_000))} 天前`;
}

function buttonMeta(button) {
  const id = text(button?.dataset?.app, 80);
  if (!id) return null;
  const icon = text(button.querySelector?.('.wp-app-icon')?.textContent, 8) || '◌';
  const directChildren = [...(button?.children || [])];
  const labelNode = [...directChildren].reverse().find((node) => (
    node?.tagName === 'SPAN' && !node.classList?.contains('wp-app-icon')
  ));
  const label = text(labelNode?.textContent || button.getAttribute?.('aria-label') || id, 40) || id;
  return { id, icon, label };
}

function canonicalHomeButton(stage, button) {
  const id = text(button?.dataset?.app, 80);
  if (!id) return button;
  try {
    const matches = [...(stage?.querySelectorAll?.(`.wp-home [data-app="${CSS.escape(id)}"]`) || [])];
    return matches.find((candidate) => candidate.dataset?.socialRealismManaged === '1') || button;
  } catch {
    return button;
  }
}

function ensureLayer(stage) {
  const glass = stage?.querySelector?.('.wp-screen-glass');
  if (!glass) return null;
  let layer = glass.querySelector(':scope > .wp-app-switcher-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'wp-app-switcher-layer';
    layer.hidden = true;
    glass.append(layer);
  }
  return layer;
}

function renderSwitcher(layer, apps) {
  if (!layer) return;
  layer.hidden = false;
  layer.innerHTML = `<section class="wp-recents" data-recents-panel>
    <header><div><b>最近任务</b><small>${apps.length ? `${apps.length} 个最近打开的 App` : '还没有最近任务'}</small></div>${apps.length ? '<button type="button" data-recents-clear>清除</button>' : ''}</header>
    ${apps.length ? `<main class="wp-recents-track">${apps.map((app) => `
      <article class="wp-recents-card" data-recents-card="${esc(app.id)}">
        <button type="button" class="wp-recents-remove" data-recents-remove="${esc(app.id)}" aria-label="从最近任务移除 ${esc(app.label)}">×</button>
        <button type="button" class="wp-recents-open" data-recents-open="${esc(app.id)}">
          <div class="wp-recents-preview"><span>${esc(app.icon)}</span><i></i><i></i><i></i></div>
          <footer><span class="wp-recents-app-icon">${esc(app.icon)}</span><div><b>${esc(app.label)}</b><small>${esc(relativeTime(app.openedAt))}打开</small></div></footer>
        </button>
      </article>`).join('')}</main>` : '<div class="wp-recents-empty"><span>▱</span><b>最近任务是空的</b><p>打开过的 App 会出现在这里。这里只记录本机访问历史，不伪造后台进程。</p></div>'}
    <p class="wp-recents-boundary">最近任务表示“最近打开过”，不是虚构的后台进程、内存占用或实时截图。</p>
  </section>`;
}

function findHomeButton(stage, appId) {
  if (!appId) return null;
  try { return stage?.querySelector?.(`.wp-home [data-app="${CSS.escape(appId)}"]`) || null; }
  catch { return null; }
}

export function mountAppSwitcherRealism({ phone } = {}) {
  const stage = document.querySelector('#world-phone-stage');
  if (!stage || !phone) return () => {};
  let apps = readState();
  let destroyed = false;
  const layer = ensureLayer(stage);
  const gesture = stage.querySelector('.wp-gesture-bar');

  const persist = () => { apps = writeState(apps); };
  const closeSwitcher = () => {
    if (!layer) return;
    layer.hidden = true;
    layer.innerHTML = '';
    stage.classList.remove('is-wp-recents-open');
  };
  const openSwitcher = () => {
    if (destroyed || stage.classList.contains('is-screen-off')) return false;
    apps = readState();
    renderSwitcher(layer, apps);
    stage.classList.add('is-wp-recents-open');
    return true;
  };
  const openRecentApp = (appId) => {
    closeSwitcher();
    phone.home?.();
    const attempt = () => {
      const button = findHomeButton(stage, appId);
      if (!button) return false;
      button.click();
      return true;
    };
    if (!attempt()) [40, 100, 180].forEach((delay) => window.setTimeout(attempt, delay));
  };

  phone.openRecents = openSwitcher;
  phone.closeRecents = closeSwitcher;
  phone.recentsOpen = () => Boolean(layer && !layer.hidden);

  if (gesture) {
    gesture.removeAttribute('aria-hidden');
    gesture.setAttribute('role', 'button');
    gesture.setAttribute('tabindex', '0');
    gesture.setAttribute('aria-label', '快速上滑返回桌面，上滑停顿打开最近任务');
  }

  const clickHandler = (event) => {
    if (!stage.contains(event.target)) return;
    const appButton = event.target?.closest?.('.wp-home [data-app]');
    if (appButton) {
      const meta = buttonMeta(canonicalHomeButton(stage, appButton));
      if (meta) {
        apps = recordRecentApp(apps, meta);
        persist();
      }
      return;
    }
    const remove = event.target?.closest?.('[data-recents-remove]');
    if (remove) {
      event.preventDefault();
      event.stopPropagation();
      apps = apps.filter((item) => item.id !== remove.dataset.recentsRemove);
      persist();
      renderSwitcher(layer, apps);
      return;
    }
    if (event.target?.closest?.('[data-recents-clear]')) {
      apps = [];
      persist();
      renderSwitcher(layer, apps);
      return;
    }
    const open = event.target?.closest?.('[data-recents-open]');
    if (open?.dataset?.recentsOpen) {
      openRecentApp(open.dataset.recentsOpen);
      return;
    }
    if (event.target === layer) closeSwitcher();
  };

  const keyHandler = (event) => {
    if (event.target !== gesture) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openSwitcher();
    }
  };

  window.addEventListener('click', clickHandler, true);
  stage.addEventListener('keydown', keyHandler, true);

  return () => {
    destroyed = true;
    window.removeEventListener('click', clickHandler, true);
    stage.removeEventListener('keydown', keyHandler, true);
    if (phone.openRecents === openSwitcher) delete phone.openRecents;
    if (phone.closeRecents === closeSwitcher) delete phone.closeRecents;
    delete phone.recentsOpen;
    gesture?.removeAttribute('role');
    gesture?.removeAttribute('tabindex');
    gesture?.setAttribute('aria-hidden', 'true');
    gesture?.removeAttribute('aria-label');
    layer?.remove();
    stage.classList.remove('is-wp-recents-open');
  };
}
