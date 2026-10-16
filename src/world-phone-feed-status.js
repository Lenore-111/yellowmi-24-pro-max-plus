import { capturePhoneGameScope } from './phone-game.js?v=0.3.0-alpha.28';

export const PHONE_FEED_STATUS_EVENT = 'world-phone:feed-status';
let scope = null;
let branch = '';
const statuses = new Map();

function syncScope() {
  const next = capturePhoneGameScope();
  let nextBranch = '';
  try { nextBranch = globalThis.worldBackstageHost?.getPhoneSurface?.()?.branchKey || ''; } catch {}
  if (!scope || next.metadata !== scope.metadata || next.key !== scope.key
    || next.modeEpoch !== scope.modeEpoch || nextBranch !== branch) {
    statuses.clear(); scope = next; branch = nextBranch;
  }
}

export function readPhoneFeedStatus(platform) {
  syncScope();
  return statuses.get(platform) || { phase: 'idle', message: '' };
}

export function setPhoneFeedStatus(platform, phase, message = '') {
  syncScope();
  statuses.set(platform, { phase, message: String(message || '').slice(0, 300) });
  globalThis.dispatchEvent?.(new CustomEvent(PHONE_FEED_STATUS_EVENT, { detail: { platform } }));
}

export function paintPhoneFeedStatus(section, platform, { connected = true, onRetry } = {}) {
  const status = readPhoneFeedStatus(platform);
  let row = section.querySelector('[data-phone-feed-status]');
  if (!row) {
    row = document.createElement('div');
    row.dataset.phoneFeedStatus = '1';
    row.className = 'wp-feed-status';
    row.setAttribute('role', 'status'); row.setAttribute('aria-live', 'polite');
    row.innerHTML = '<span data-feed-status-label></span><small data-feed-status-message></small><button type="button" data-phone-feed-retry>重试</button>';
    section.querySelector('.wp-app-header')?.after(row);
  }
  const phase = connected ? status.phase : 'offline';
  row.dataset.phase = phase;
  const label = { idle: '世界动态', loading: '正在更新…', synced: '已同步', error: '更新失败', offline: '暂未连接' }[phase] || '世界动态';
  const labelNode = row.querySelector('[data-feed-status-label]');
  if (labelNode.textContent !== label) labelNode.textContent = label;
  const message = phase === 'error' ? status.message : '';
  const messageNode = row.querySelector('[data-feed-status-message]');
  if (messageNode.textContent !== message) messageNode.textContent = message;
  messageNode.title = message;
  const retry = row.querySelector('[data-phone-feed-retry]');
  retry.hidden = phase !== 'error'; retry.onclick = onRetry;
}
