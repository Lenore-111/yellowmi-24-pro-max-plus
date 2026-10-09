import { phoneThemeStoreMarkup, bindPhoneThemeStore, applyThemeIcons, THEME_CHANGE_EVENT, readPhoneTheme, syncPhoneThemeStoreStatus } from './phone-themes.js';
import {
  APP_CATALOG,
  getCatalogApp,
  installApp,
  isAppInstalled,
  readInstalledApps,
  uninstallApp,
} from './app-store.js';

const STORE_APP_ID = 'appstore';
const STORE_MANAGED_ATTR = 'storeManaged';
const DOWNLOAD_INSTALL_MS = 420;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

function makeHomeApp({ id, icon, name, tone = '' }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `wp-app${tone ? ` ${tone}` : ''}`;
  button.dataset.app = id;
  button.dataset[STORE_MANAGED_ATTR] = '1';
  button.innerHTML = `<span class="wp-app-icon">${escapeHtml(icon)}</span><span>${escapeHtml(name)}</span>`;
  return button;
}

function storeButton() {
  return makeHomeApp({ id: STORE_APP_ID, icon: 'A', name: '应用商店', tone: 'is-appstore' });
}

function installedButton(app) {
  return makeHomeApp(app);
}

function headerCopy(section, title, subtitle) {
  const header = section?.querySelector('.wp-app-header');
  if (!header) return;
  const titleNode = header.querySelector('div > b');
  const subtitleNode = header.querySelector('div > small');
  if (titleNode && titleNode.textContent !== title) titleNode.textContent = title;
  if (subtitleNode && subtitleNode.textContent !== subtitle) subtitleNode.textContent = subtitle;
}

function installedSet() {
  return new Set(readInstalledApps().map((app) => app.id));
}

function numericSize(app) {
  const value = Number.parseInt(String(app?.size || ''), 10);
  return Number.isFinite(value) ? value : 20;
}

function downloadDuration(app) {
  return 980 + Math.min(900, numericSize(app) * 19);
}

export function mountAppStoreIntegration({ phone } = {}) {
  let destroyed = false;
  let activeManagedApp = '';
  let routingThroughShell = false;
  let refreshQueued = false;
  let storeMode = 'apps';
  let storeDetailId = '';
  let storeQuery = '';
  let ticker = 0;
  let toastTimer = 0;
  const downloadJobs = new Map();

  function syncHome() {
    if (destroyed) return;
    const grid = document.querySelector('#world-phone-stage .wp-home [data-app-grid]');
    if (!grid) return;

    const desired = new Map([
      [STORE_APP_ID, { id: STORE_APP_ID }],
      ...readInstalledApps().map((app) => [app.id, app]),
    ]);

    grid.querySelectorAll(`[data-${STORE_MANAGED_ATTR.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}="1"]`).forEach((button) => {
      if (!desired.has(button.dataset.app)) button.remove();
    });

    if (!grid.querySelector(`[data-app="${STORE_APP_ID}"]`)) grid.append(storeButton());
    for (const app of readInstalledApps()) {
      if (!grid.querySelector(`[data-app="${CSS.escape(app.id)}"]`)) grid.append(installedButton(app));
    }
    applyThemeIcons();
  }

  function routeThroughShell(appId) {
    if (typeof phone?.openApp === 'function') {
      phone.openApp(appId);
      return true;
    }
    const home = document.querySelector('#world-phone-stage .wp-home');
    const bridge = home?.querySelector('[data-app="settings"]')
      || home?.querySelector('[data-app]:not([data-store-managed="1"])');
    if (!bridge) return false;

    const original = bridge.dataset.app;
    routingThroughShell = true;
    try {
      bridge.dataset.app = appId;
      bridge.click();
    } finally {
      bridge.dataset.app = original;
      routingThroughShell = false;
    }
    return true;
  }

  function openManagedApp(appId) {
    activeManagedApp = appId;
    if (appId === STORE_APP_ID) storeDetailId = '';
    if (routeThroughShell(appId)) {
      window.setTimeout(queueRefresh, 0);
      return;
    }

    const back = document.querySelector('#world-phone-stage [data-app-back]');
    if (back) {
      back.click();
      window.setTimeout(() => {
        if (routeThroughShell(appId)) window.setTimeout(queueRefresh, 0);
      }, 40);
    }
  }

  function showToast(message) {
    const section = document.querySelector('#world-phone-stage .wp-native-app');
    if (!section) return;
    section.querySelector('.wp-store-toast')?.remove();
    const toast = document.createElement('div');
    toast.className = 'wp-store-toast';
    toast.setAttribute('role', 'status');
    toast.textContent = message;
    section.append(toast);
    requestAnimationFrame(() => toast.classList.add('is-visible'));
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.classList.remove('is-visible');
      window.setTimeout(() => toast.remove(), 180);
    }, 1350);
  }

  function jobState(id) {
    return downloadJobs.get(id) || null;
  }

  function actionLabel(id) {
    const app = getCatalogApp(id);
    if (!app?.releaseReady) return '开发中';
    if (isAppInstalled(id)) return '打开';
    const job = jobState(id);
    if (!job) return '获取';
    if (job.phase === 'installing') return '安装中';
    return `${Math.max(1, Math.min(99, job.progress || 1))}%`;
  }

  function appActionMarkup(app) {
    const available = Boolean(app?.releaseReady);
    const ready = available && isAppInstalled(app.id);
    const job = available ? jobState(app.id) : null;
    return `<button type="button" class="wp-store-action ${ready ? 'is-installed' : ''} ${job ? 'is-downloading' : ''} ${available ? '' : 'is-coming-soon'}" data-store-action="${escapeHtml(app.id)}" ${!available || job?.phase === 'installing' ? 'disabled' : ''}>${escapeHtml(actionLabel(app.id))}</button>`;
  }

  function appRowsMarkup() {
    const installed = installedSet();
    const query = storeQuery.trim().toLowerCase();
    const apps = query
      ? APP_CATALOG.filter((app) => [app.name, app.category, app.description].some((value) => String(value || '').toLowerCase().includes(query)))
      : APP_CATALOG;

    if (!apps.length) {
      return `<div class="wp-store-empty"><span>⌕</span><b>没有找到 App</b><p>换个关键词试试。</p></div>`;
    }

    return apps.map((app) => {
      const ready = installed.has(app.id);
      return `
        <article class="wp-store-row" data-store-row="${escapeHtml(app.id)}">
          <button type="button" class="wp-store-main" data-store-detail="${escapeHtml(app.id)}">
            <span class="wp-store-icon ${escapeHtml(app.tone)}">${escapeHtml(app.icon)}</span>
            <span class="wp-store-copy">
              <b>${escapeHtml(app.name)}</b>
              <small>${escapeHtml(app.category)} · ${escapeHtml(app.size)}</small>
              <p>${escapeHtml(app.description)}</p>
              ${ready ? `<span class="wp-store-installed-note">已安装</span>` : !app.releaseReady ? `<span class="wp-store-installed-note">开发中 · 暂未开放安装</span>` : ''}
            </span>
          </button>
          <span class="wp-store-row-actions">
            ${appActionMarkup(app)}
            ${ready ? `<button type="button" class="wp-store-remove" data-store-remove="${escapeHtml(app.id)}">移除</button>` : ''}
          </span>
        </article>
      `;
    }).join('');
  }

  function storeListMarkup() {
    const nav = `<nav class="wp-theme-nav"><button type="button" data-store-mode="apps" class="${storeMode === 'apps' ? 'is-active' : ''}">应用</button><button type="button" data-store-mode="themes" class="${storeMode === 'themes' ? 'is-active' : ''}">主题</button></nav>`;
    if (storeMode === 'themes') return nav + phoneThemeStoreMarkup();
    return nav + `
      <div class="wp-store-hero">
        <span class="wp-store-hero-icon">A</span>
        <div><b>小手机 App 目录</b><p>只有做完并通过实机验证的 App 才开放安装；开发中的不会塞一个空壳到桌面。</p></div>
      </div>
      <form class="wp-store-search" data-store-search>
        <span>⌕</span><input maxlength="60" value="${escapeHtml(storeQuery)}" placeholder="搜索 App" autocomplete="off"><button type="submit">搜索</button>
        ${storeQuery ? '<button type="button" data-store-search-clear aria-label="清除搜索">×</button>' : ''}
      </form>
      <div class="wp-store-section-title"><b>${storeQuery ? '搜索结果' : 'App 目录'}</b><span>${APP_CATALOG.length} 个</span></div>
      <div class="wp-store-list">${appRowsMarkup()}</div>
    `;
  }

  function storeDetailMarkup(app) {
    const ready = isAppInstalled(app.id);
    return `
      <div class="wp-store-detail" data-store-detail-page="${escapeHtml(app.id)}">
        <button type="button" class="wp-store-detail-back" data-store-detail-back>‹ 应用商店</button>
        <div class="wp-store-detail-head">
          <span class="wp-store-icon ${escapeHtml(app.tone)}">${escapeHtml(app.icon)}</span>
          <div><h2>${escapeHtml(app.name)}</h2><p>${escapeHtml(app.category)} · ${escapeHtml(app.size)}</p></div>
          ${appActionMarkup(app)}
        </div>
        <div class="wp-store-detail-status" data-store-progress-copy="${escapeHtml(app.id)}">${ready ? '已安装，可直接打开。' : app.releaseReady ? '尚未安装到这台小手机。' : '开发中，完成并通过实机验证后才会开放安装。'}</div>
        <section class="wp-store-detail-card"><b>关于这个 App</b><p>${escapeHtml(app.description)}</p></section>
        <section class="wp-store-detail-card is-data"><b>数据与世界状态</b><p>App 只读取它实际支持的数据源；没有的数据不会为了“像真的”而凭空生成。</p></section>
        ${ready ? `<button type="button" class="wp-store-detail-remove" data-store-remove="${escapeHtml(app.id)}">从小手机移除</button>` : ''}
      </div>
    `;
  }

  function paintDownloadStates(section) {
    if (!section) return;
    section.querySelectorAll('[data-store-action]').forEach((button) => {
      const id = button.dataset.storeAction;
      const app = getCatalogApp(id);
      const available = Boolean(app?.releaseReady);
      const job = available ? jobState(id) : null;
      const ready = available && isAppInstalled(id);
      const label = actionLabel(id);
      if (button.textContent !== label) button.textContent = label;
      button.classList.toggle('is-installed', ready);
      button.classList.toggle('is-downloading', Boolean(job));
      button.classList.toggle('is-installing', job?.phase === 'installing');
      button.disabled = !available || job?.phase === 'installing';
      button.style.setProperty('--store-progress', `${job?.progress || 0}%`);
      button.setAttribute('aria-label', job ? `${label}，点击取消下载` : ready ? '打开' : '获取');
    });

    section.querySelectorAll('[data-store-progress-copy]').forEach((node) => {
      const id = node.dataset.storeProgressCopy;
      const app = getCatalogApp(id);
      const available = Boolean(app?.releaseReady);
      const job = available ? jobState(id) : null;
      const ready = available && isAppInstalled(id);
      const next = !available
        ? '开发中，暂未开放安装。'
        : ready
        ? '已安装，可直接打开。'
        : job?.phase === 'installing'
          ? '下载完成，正在安装…'
          : job
            ? `正在下载 ${Math.max(1, job.progress)}% · 离开应用商店也会继续`
            : '尚未安装到这台小手机。';
      if (node.textContent !== next) node.textContent = next;
    });
  }

  function bindStore(section) {
    section.querySelectorAll('[data-store-mode]').forEach(button => button.addEventListener('click', () => { storeMode = button.dataset.storeMode; storeDetailId = ''; paintStore(section, true); }));
    bindPhoneThemeStore(section, () => paintStore(section, true));
    section.querySelector('[data-store-search]')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const input = event.currentTarget.querySelector('input');
      storeQuery = String(input?.value || '').trim().slice(0, 60);
      storeDetailId = '';
      paintStore(section, true);
    });

    section.querySelector('[data-store-search-clear]')?.addEventListener('click', () => {
      storeQuery = '';
      storeDetailId = '';
      paintStore(section, true);
    });

    section.querySelectorAll('[data-store-detail]').forEach((button) => {
      button.addEventListener('click', () => {
        storeDetailId = button.dataset.storeDetail || '';
        paintStore(section, true);
      });
    });

    section.querySelector('[data-store-detail-back]')?.addEventListener('click', () => {
      storeDetailId = '';
      paintStore(section, true);
    });

    section.querySelectorAll('[data-store-action]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.storeAction;
        if (!id) return;
        if (isAppInstalled(id)) {
          openManagedApp(id);
          return;
        }
        if (jobState(id)) {
          cancelDownload(id);
          showToast('已取消下载');
          paintDownloadStates(section);
          return;
        }
        startDownload(id);
        paintDownloadStates(section);
      });
    });

    section.querySelectorAll('[data-store-remove]').forEach((button) => {
      button.addEventListener('click', () => showUninstallSheet(section, button.dataset.storeRemove));
    });
  }

  function paintStore(section, force = false) {
    if (typeof phone?.current === 'function' && phone.current() !== `app:${STORE_APP_ID}`) return;
    if (!section) return;
    const old = section.querySelector('.wp-placeholder-card, .wp-store-shell');
    if (!old) return;
    section.classList.add('wp-store-app');
    const detail = storeDetailId ? getCatalogApp(storeDetailId) : null;
    headerCopy(section, detail ? detail.name : '应用商店', detail ? 'APP STORE · App 详情' : 'APP STORE · 本机安装');

    // Theme changes must not rebuild a skin editor or erase its save feedback.
    const signature = `${readInstalledApps().map((app) => app.id).join('|')}::${storeQuery}::${detail?.id || ''}::${storeMode}::${storeMode === 'themes' ? '' : JSON.stringify(readPhoneTheme())}`;
    if (!force && old.classList.contains('wp-store-shell') && old.dataset.signature === signature) {
      paintDownloadStates(section);
      if (storeMode === 'themes') syncPhoneThemeStoreStatus(section);
      return;
    }

    old.className = 'wp-store-shell';
    old.dataset.signature = signature;
    old.innerHTML = detail ? storeDetailMarkup(detail) : storeListMarkup();
    bindStore(section);
    paintDownloadStates(section);
  }

  function showUninstallSheet(section, id) {
    const app = getCatalogApp(id);
    if (!app || !isAppInstalled(id)) return;
    section.querySelector('.wp-store-confirm-layer')?.remove();
    const layer = document.createElement('div');
    layer.className = 'wp-store-confirm-layer';
    layer.innerHTML = `
      <button type="button" class="wp-store-confirm-mask" data-store-confirm-close aria-label="取消"></button>
      <div class="wp-store-confirm-sheet" role="dialog" aria-modal="true">
        <span class="wp-store-icon ${escapeHtml(app.tone)}">${escapeHtml(app.icon)}</span>
        <div><b>移除“${escapeHtml(app.name)}”？</b><p>它会从桌面消失。应用自己的本机数据暂时不会被擅自清空。</p></div>
        <button type="button" class="is-danger" data-store-confirm-remove>移除 App</button>
        <button type="button" data-store-confirm-close>取消</button>
      </div>
    `;
    section.append(layer);
    requestAnimationFrame(() => layer.classList.add('is-open'));
    const close = () => {
      layer.classList.remove('is-open');
      window.setTimeout(() => layer.remove(), 180);
    };
    layer.querySelectorAll('[data-store-confirm-close]').forEach((button) => button.addEventListener('click', close));
    layer.querySelector('[data-store-confirm-remove]')?.addEventListener('click', () => {
      uninstallApp(id);
      syncHome();
      if (storeDetailId === id) storeDetailId = '';
      close();
      showToast(`已移除 ${app.name}`);
      paintStore(section, true);
    });
  }

  function startDownload(id) {
    const app = getCatalogApp(id);
    if (!app?.releaseReady || isAppInstalled(id) || jobState(id)) return;
    downloadJobs.set(id, {
      id,
      phase: 'downloading',
      progress: 1,
      startedAt: Date.now(),
      duration: downloadDuration(app),
      installingAt: 0,
    });
    ensureTicker();
    showToast(`${app.name} 开始下载`);
  }

  function cancelDownload(id) {
    downloadJobs.delete(id);
    if (!downloadJobs.size && ticker) {
      window.clearInterval(ticker);
      ticker = 0;
    }
  }

  function finishInstall(id) {
    const app = getCatalogApp(id);
    if (!app || isAppInstalled(id)) {
      downloadJobs.delete(id);
      return;
    }
    installApp(id);
    downloadJobs.delete(id);
    syncHome();
    phone?.refresh?.();
    showToast(`${app.name} 已安装`);
    const section = document.querySelector('#world-phone-stage .wp-native-app');
    if (activeManagedApp === STORE_APP_ID && section) paintStore(section, true);
  }

  function tickDownloads() {
    if (destroyed) return;
    const now = Date.now();
    for (const [id, job] of [...downloadJobs.entries()]) {
      if (job.phase === 'downloading') {
        const ratio = Math.max(0, Math.min(1, (now - job.startedAt) / job.duration));
        job.progress = Math.max(job.progress, Math.min(92, Math.floor(ratio * 92)));
        if (ratio >= 1) {
          job.phase = 'installing';
          job.progress = 96;
          job.installingAt = now;
        }
      } else if (job.phase === 'installing' && now - job.installingAt >= DOWNLOAD_INSTALL_MS) {
        finishInstall(id);
      }
    }

    const section = document.querySelector('#world-phone-stage .wp-native-app');
    if (activeManagedApp === STORE_APP_ID) paintDownloadStates(section);
    if (!downloadJobs.size && ticker) {
      window.clearInterval(ticker);
      ticker = 0;
    }
  }

  function ensureTicker() {
    if (ticker || destroyed) return;
    ticker = window.setInterval(tickDownloads, 120);
  }

  function paintDownloadedApp(section, appId) {
    if (typeof phone?.current === 'function' && phone.current() !== `app:${appId}`) return;
    if (!section) return;
    const app = getCatalogApp(appId);
    if (!app) return;
    const old = section.querySelector('.wp-placeholder-card, .wp-download-shell');
    if (!old) return;
    const installed = isAppInstalled(app.id);
    section.classList.add('wp-downloaded-app');
    headerCopy(section, app.name, `${app.category} · ${installed ? '已安装' : '未安装'}`);
    const signature = `${app.id}:${installed}`;
    if (old.classList.contains('wp-download-shell') && old.dataset.signature === signature) return;
    old.className = 'wp-download-shell';
    old.dataset.signature = signature;
    old.innerHTML = `
      <div class="wp-download-hero">
        <span class="wp-store-icon ${escapeHtml(app.tone)}">${escapeHtml(app.icon)}</span>
        <div><b>${escapeHtml(app.name)}</b><small>${escapeHtml(app.category)} · ${escapeHtml(app.size)}</small></div>
      </div>
      <p>${escapeHtml(app.description)}</p>
      ${installed ? `
        <div class="wp-download-ready"><i></i><span><b>已经装进小手机</b><small>App 壳已可用，具体内容会按功能继续施工。</small></span></div>
      ` : `
        <div class="wp-download-ready is-missing"><i></i><span><b>这个 App 已被移除</b><small>回应用商店重新下载即可。</small></span></div>
      `}
    `;
  }

  function enhanceManagedRoute() {
    if (typeof phone?.current === 'function') {
      const appId = phone.current().replace(/^app:/, '');
      activeManagedApp = appId === STORE_APP_ID || getCatalogApp(appId) ? appId : '';
    }
    if (!activeManagedApp) return;
    const section = document.querySelector('#world-phone-stage .wp-native-app');
    if (!section) return;
    if (activeManagedApp === STORE_APP_ID) paintStore(section);
    else paintDownloadedApp(section, activeManagedApp);
  }

  function queueRefresh() {
    if (destroyed || refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(() => {
      refreshQueued = false;
      syncHome();
      enhanceManagedRoute();
    });
  }

  function clickHandler(event) {
    const button = event.target?.closest?.('#world-phone-stage [data-app]');
    if (!button || routingThroughShell) return;

    const id = String(button.dataset.app || '');
    if (button.dataset.storeManaged === '1') {
      event.preventDefault();
      event.stopImmediatePropagation();
      openManagedApp(id);
      return;
    }

    activeManagedApp = '';
  }

  window.addEventListener(THEME_CHANGE_EVENT, queueRefresh);
  document.addEventListener('click', clickHandler, true);
  const observer = new MutationObserver(queueRefresh);
  const observerRoot = document.querySelector('#world-phone-stage [data-screen]') || document.querySelector('#world-phone-stage');
  if (observerRoot) observer.observe(observerRoot, { childList: true, subtree: true });
  queueRefresh();

  return () => {
    destroyed = true;
    window.removeEventListener(THEME_CHANGE_EVENT, queueRefresh);
    window.clearInterval(ticker);
    window.clearTimeout(toastTimer);
    document.removeEventListener('click', clickHandler, true);
    observer.disconnect();
    downloadJobs.clear();
    document.querySelectorAll('#world-phone-stage [data-store-managed="1"]').forEach((node) => node.remove());
    document.querySelectorAll('#world-phone-stage .wp-store-toast, #world-phone-stage .wp-store-confirm-layer').forEach((node) => node.remove());
  };
}
