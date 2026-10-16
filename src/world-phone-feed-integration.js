import { readPhoneGameMode, capturePhoneGameScope, isPhoneGameScopeCurrent, subscribePhoneGameModeChange } from './phone-game.js?v=0.3.0-alpha.28';
import { subscribeWorldBackstage } from './world-backstage-bridge.js';
import { readWorldPhoneFeedAutoUpdate, PHONE_FEED_SETTINGS_EVENT } from './world-phone-feed-settings.js';

const SUPPORTED = new Set(['weibo', 'rednote']);

function host() {
  const value = globalThis.worldBackstageHost;
  return value && typeof value === 'object' ? value : null;
}

function activePlatform() {
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
  const attempted = new Map();
  let observedScope = null;
  let observedBranch = '';
  let observedHost = null;
  let checkTimer = null;

  function visiblePlatform() {
    const stage = document.querySelector('#world-phone-stage');
    if (!stage || stage.hidden || document.hidden) return '';
    return activePlatform();
  }

  function sourceSignature(platform) {
    const wb = host();
    const surface = wb?.getPhoneSurface?.();
    if (!surface?.connected || !surface.branchKey) return '';
    const scope = capturePhoneGameScope();
    if (!observedScope || observedScope.metadata !== scope.metadata
      || observedScope.key !== scope.key || observedScope.modeEpoch !== scope.modeEpoch
      || observedBranch !== surface.branchKey || observedHost !== wb) {
      observedScope = scope;
      observedBranch = surface.branchKey;
      observedHost = wb;
      attempted.clear();
      flights.clear();
    }
    if (typeof wb.getPhoneFeedSourceSignature === 'function') return wb.getPhoneFeedSourceSignature(platform);
    // Older feed hosts expose a merged surface. Ignore cache-generated cards so
    // publishing a feed cannot trigger another generation by itself.
    const opinion = surface.publicOpinion || {};
    return JSON.stringify([surface.branchKey, surface.worldName,
      Math.floor((Number(surface.clock?.absoluteMinute) || 0) / 180),
      surface.people, surface.events, surface.social?.moments,
      opinion.generatedAt, opinion.sourceWorldMinute,
      (opinion.news || []).filter(item => !item.phoneFeed),
      (opinion.forums || []).filter(item => !item.phoneFeed)]);
  }

  function checkForWorldChanges() {
    if (destroyed || readPhoneGameMode() !== 'world' || !readWorldPhoneFeedAutoUpdate() || !bridgeReady()) return;
    const platform = visiblePlatform();
    if (!SUPPORTED.has(platform)) return;
    const signature = sourceSignature(platform);
    if (!signature || attempted.get(platform) === signature || flights.has(platform)) return;
    attempted.set(platform, signature);
    void request(platform).catch(error => console.warn('[Echo 手机] 世界信息流自动更新失败', error));
  }

  function scheduleCheck() {
    if (destroyed || checkTimer !== null) return;
    checkTimer = window.setTimeout(() => {
      checkTimer = null;
      checkForWorldChanges();
    }, 120);
  }

  const request = (platformValue, { force = false, button = null } = {}) => {
    const platform = String(platformValue || '').trim().toLowerCase();
    const wb = host();
    if (destroyed || readPhoneGameMode() !== 'world' || !SUPPORTED.has(platform)
      || !wb || typeof wb.requestPhoneFeed !== 'function') return Promise.resolve(null);

    const scope = capturePhoneGameScope();
    const branchKey = wb.getPhoneSurface?.()?.branchKey;
    const current = () => !destroyed && isPhoneGameScopeCurrent(scope)
      && host() === wb && wb.getPhoneSurface?.()?.branchKey === branchKey;
    const key = platform;
    const existing = flights.get(key);
    if (existing) return existing;

    const originalText = button?.textContent || '';
    if (button) {
      button.disabled = true;
      button.textContent = '正在刷新…';
      button.closest?.('.wp-native-app')?.querySelector('[data-phone-feed-error]')?.remove();
    }

    const task = Promise.resolve().then(() => {
      if (!current() || (!force && (!readWorldPhoneFeedAutoUpdate() || visiblePlatform() !== platform))) return null;
      return wb.requestPhoneFeed({ platform, force });
    })
      .catch((error) => {
        if (current() && button?.isConnected) showRefreshError(button, error?.message || error);
        throw error;
      })
      .finally(() => {
        if (flights.get(key) === task) flights.delete(key);
        scheduleCheck();
        if (current() && button?.isConnected) {
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
      if (destroyed || readPhoneGameMode() !== 'world' || visiblePlatform() !== platform) return;
      // Cached projection is safe even with automatic generation switched off.
      host()?.activatePhoneFeed?.(platform);
      if (readWorldPhoneFeedAutoUpdate()) {
        attempted.delete(platform); // An explicit reopen also lets a failed load retry.
        checkForWorldChanges();
      }
    }, 0);
    timers.add(timer);
  };

  const onClickCapture = (event) => {
    if (destroyed || readPhoneGameMode() !== 'world' || !bridgeReady()) return;

    const refresh = event.target?.closest?.('#world-phone-stage [data-social-opinion-refresh]');
    if (refresh) {
      const platform = activePlatform();
      if (!SUPPORTED.has(platform)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      sourceSignature(platform); // Reset request scope before deduplicating.
      void request(platform, { force: true, button: refresh }).catch(() => {});
      return;
    }

    const app = event.target?.closest?.('#world-phone-stage [data-app="weibo"], #world-phone-stage [data-app="rednote"]');
    const platform = app?.dataset?.app;
    if (SUPPORTED.has(platform) && document.querySelector('#world-phone-stage [data-screen]')?.dataset.homeEditing !== '1') scheduleOpenRequest(platform);
  };

  document.addEventListener('click', onClickCapture, true);
  const unsubscribe = subscribeWorldBackstage(scheduleCheck);
  const unsubscribeMode = subscribePhoneGameModeChange(scheduleCheck);
  const onSettingsChange = () => { attempted.clear(); scheduleCheck(); };
  globalThis.addEventListener?.(PHONE_FEED_SETTINGS_EVENT, onSettingsChange);
  globalThis.addEventListener?.('world-backstage:phone-feed-ready', scheduleCheck);
  document.addEventListener('visibilitychange', scheduleCheck);
  const observer = new MutationObserver(scheduleCheck);
  const stage = document.querySelector('#world-phone-stage');
  if (stage) observer.observe(stage, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class'] });

  return () => {
    destroyed = true;
    document.removeEventListener('click', onClickCapture, true);
    document.removeEventListener('visibilitychange', scheduleCheck);
    globalThis.removeEventListener?.(PHONE_FEED_SETTINGS_EVENT, onSettingsChange);
    globalThis.removeEventListener?.('world-backstage:phone-feed-ready', scheduleCheck);
    unsubscribe?.();
    unsubscribeMode?.();
    observer.disconnect();
    if (checkTimer !== null) window.clearTimeout(checkTimer);
    for (const timer of timers) window.clearTimeout(timer);
    timers.clear();
    flights.clear();
  };
}
