import { readPhoneGameMode } from './phone-game.js?v=0.3.0-alpha.28';

const SUPPORTED = new Set(['weibo', 'rednote']);

function host() {
  const value = globalThis.worldBackstageHost;
  return value && typeof value === 'object' ? value : null;
}

function activePlatform(phone) {
  const current = String(phone?.current?.() || '').replace(/^app:/, '');
  if (SUPPORTED.has(current)) return current;
  const section = document.querySelector('#world-phone-stage .wp-social-realism-app');
  if (section?.classList.contains('is-weibo')) return 'weibo';
  if (section?.classList.contains('is-rednote')) return 'rednote';
  return '';
}

function bridgeReady() {
  const value = host();
  return Boolean(value && typeof value.requestPhoneFeed === 'function');
}

function showRefreshError(button, message) {
  const section = button?.closest?.('#world-phone-stage .wp-native-app');
  if (!section) return;
  section.querySelector('[data-phone-feed-error]')?.remove();
  const paragraph = document.createElement('p');
  paragraph.dataset.phoneFeedError = '1';
  paragraph.setAttribute('role', 'alert');
  paragraph.textContent = String(message || '世界信息流刷新失败');
  const header = section.querySelector('.wp-app-header');
  header?.after(paragraph);
}

export function mountWorldPhoneFeedIntegration({ phone } = {}) {
  let destroyed = false;
  const flights = new Map();
  const timers = new Set();

  const request = (platformValue, { force = false, button = null } = {}) => {
    const platform = String(platformValue || '').trim().toLowerCase();
    const wb = host();
    if (destroyed || readPhoneGameMode() !== 'world' || !SUPPORTED.has(platform)
      || !wb || typeof wb.requestPhoneFeed !== 'function') return Promise.resolve(null);

    const key = `${platform}:${force ? 'force' : 'open'}`;
    const existing = flights.get(key);
    if (existing) return existing;

    const originalText = button?.textContent || '';
    if (button) {
      button.disabled = true;
      button.textContent = '正在刷新…';
      button.closest?.('.wp-native-app')?.querySelector('[data-phone-feed-error]')?.remove();
    }

    const task = Promise.resolve(wb.requestPhoneFeed({ platform, force }))
      .catch((error) => {
        if (!destroyed && button?.isConnected) showRefreshError(button, error?.message || error);
        throw error;
      })
      .finally(() => {
        flights.delete(key);
        if (!destroyed && button?.isConnected) {
          button.disabled = false;
          button.textContent = originalText || '刷新舆情';
        }
      });
    flights.set(key, task);
    return task;
  };

  const scheduleOpenRequest = (platform) => {
    const timer = window.setTimeout(() => {
      timers.delete(timer);
      void request(platform).catch((error) => {
        console.warn('[Echo 手机] 世界信息流按需读取失败', error);
      });
    }, 0);
    timers.add(timer);
  };

  const onClickCapture = (event) => {
    if (destroyed || readPhoneGameMode() !== 'world' || !bridgeReady()) return;

    const refresh = event.target?.closest?.('#world-phone-stage [data-social-opinion-refresh]');
    if (refresh) {
      const platform = activePlatform(phone);
      if (!SUPPORTED.has(platform)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void request(platform, { force: true, button: refresh }).catch(() => {});
      return;
    }

    const app = event.target?.closest?.('#world-phone-stage [data-app="weibo"], #world-phone-stage [data-app="rednote"]');
    const platform = app?.dataset?.app;
    if (SUPPORTED.has(platform)) scheduleOpenRequest(platform);
  };

  document.addEventListener('click', onClickCapture, true);

  return () => {
    destroyed = true;
    document.removeEventListener('click', onClickCapture, true);
    for (const timer of timers) window.clearTimeout(timer);
    timers.clear();
    flights.clear();
  };
}
