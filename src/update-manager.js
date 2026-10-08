const VERSION_ENDPOINT = '/api/extensions/version';
const UPDATE_ENDPOINT = '/api/extensions/update';
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const STORAGE_KEY = 'world_phone_update_last_check';

export function extensionFolderFromUrl(url = import.meta.url) {
  try {
    const parts = new URL('.', url, globalThis.location?.href || 'http://localhost/')
      .pathname.split('/')
      .map((part) => decodeURIComponent(part))
      .filter(Boolean);
    // update-manager.js lives in <extension>/src/, so the extension folder is one level up from src.
    const srcIndex = parts.lastIndexOf('src');
    if (srcIndex > 0) return parts[srcIndex - 1];
    return parts.at(-2) || parts.at(-1) || 'phone';
  } catch {
    return 'phone';
  }
}

async function requestHeaders() {
  try {
    const script = await import('/script.js');
    if (typeof script.getRequestHeaders === 'function') return script.getRequestHeaders();
  } catch {
    // Fall back for non-Tavern tests. Real Tavern normally provides getRequestHeaders.
  }
  return { 'Content-Type': 'application/json' };
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: await requestHeaders(),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

async function tryScope(url, body) {
  try {
    return await postJson(url, { ...body, global: false });
  } catch (error) {
    if (error?.status !== 404) throw error;
    return postJson(url, { ...body, global: true });
  }
}

function extensionName() {
  return extensionFolderFromUrl();
}

export async function checkWorldPhoneUpdate() {
  const name = extensionName();
  const data = await tryScope(VERSION_ENDPOINT, { extensionName: name });
  return {
    extensionName: name,
    available: data?.isUpToDate === false,
    branch: String(data?.currentBranchName || ''),
    commit: String(data?.currentCommitHash || '').slice(0, 7),
    remoteUrl: String(data?.remoteUrl || ''),
    raw: data,
  };
}

export async function updateWorldPhone() {
  const name = extensionName();
  const data = await tryScope(UPDATE_ENDPOINT, { extensionName: name });
  return {
    extensionName: name,
    updated: data?.isUpToDate === false,
    commit: String(data?.shortCommitHash || ''),
    remoteUrl: String(data?.remoteUrl || ''),
    raw: data,
  };
}

function ensureNotice() {
  let notice = document.querySelector('.wp-update-notice');
  if (notice) return notice;
  notice = document.createElement('div');
  notice.className = 'wp-update-notice';
  notice.hidden = true;
  notice.innerHTML = `
    <div class="wp-update-card" role="status" aria-live="polite">
      <span class="wp-update-mark">↻</span>
      <span class="wp-update-copy"><b>世界小手机有更新</b><small>点一下就能手动更新，不会自动安装。</small></span>
      <button type="button" data-phone-update-action>更新</button>
      <button type="button" data-phone-update-close aria-label="稍后提醒">×</button>
    </div>`;
  document.body.append(notice);
  return notice;
}

function showNotice() {
  ensureNotice().hidden = false;
}

function hideNotice() {
  const notice = document.querySelector('.wp-update-notice');
  if (notice) notice.hidden = true;
}

function setLauncherUpdateBadge(active) {
  const launcher = document.querySelector('#world-phone-launcher');
  if (!launcher) return;
  launcher.classList.toggle('has-phone-update', Boolean(active));
  launcher.setAttribute('data-phone-update', active ? '1' : '0');
}

async function runUpdateFromNotice() {
  const notice = ensureNotice();
  const action = notice.querySelector('[data-phone-update-action]');
  if (!action || action.disabled) return;
  action.disabled = true;
  action.textContent = '更新中…';
  try {
    await updateWorldPhone();
    action.textContent = '刷新酒馆';
    action.disabled = false;
    action.dataset.refresh = '1';
    notice.querySelector('.wp-update-copy b').textContent = '世界小手机已更新';
    notice.querySelector('.wp-update-copy small').textContent = '刷新页面后载入新版本。';
    setLauncherUpdateBadge(false);
  } catch (error) {
    console.error('[世界小手机] 更新失败:', error);
    action.textContent = '重试更新';
    action.disabled = false;
    notice.querySelector('.wp-update-copy small').textContent = '更新失败，请重试；不会改动现有手机数据。';
  }
}

function bindNotice() {
  const notice = ensureNotice();
  if (notice.dataset.bound === '1') return;
  notice.dataset.bound = '1';
  notice.querySelector('[data-phone-update-close]')?.addEventListener('click', hideNotice);
  notice.querySelector('[data-phone-update-action]')?.addEventListener('click', async (event) => {
    const action = event.currentTarget;
    if (action?.dataset?.refresh === '1') {
      globalThis.location?.reload?.();
      return;
    }
    await runUpdateFromNotice();
  });
}

function shouldCheckNow() {
  let last = 0;
  try { last = Number(globalThis.localStorage?.getItem(STORAGE_KEY) || 0); } catch {}
  return !last || Date.now() - last >= CHECK_INTERVAL_MS;
}

function rememberCheck() {
  try { globalThis.localStorage?.setItem(STORAGE_KEY, String(Date.now())); } catch {}
}

export async function checkAndNotifyWorldPhoneUpdate({ force = false } = {}) {
  if (!force && !shouldCheckNow()) return null;
  try {
    const status = await checkWorldPhoneUpdate();
    rememberCheck();
    setLauncherUpdateBadge(status.available);
    if (status.available) showNotice();
    return status;
  } catch (error) {
    console.warn('[世界小手机] 更新检查失败:', error);
    return null;
  }
}

export function mountWorldPhoneUpdateManager() {
  bindNotice();
  const timer = window.setTimeout(() => void checkAndNotifyWorldPhoneUpdate(), 1800);
  return () => {
    window.clearTimeout(timer);
    document.querySelector('.wp-update-notice')?.remove();
  };
}
