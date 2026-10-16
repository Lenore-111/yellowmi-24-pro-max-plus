import { readSocialBucket, writeSocialBucket } from './social-storage.js';

const KEY = 'worldPhoneFeedSettings';
export const PHONE_FEED_SETTINGS_EVENT = 'world-phone:feed-settings-change';

export function readWorldPhoneFeedAutoUpdate() {
  return readSocialBucket(KEY)?.autoUpdate !== false;
}

export function setWorldPhoneFeedAutoUpdate(enabled) {
  writeSocialBucket(KEY, { autoUpdate: Boolean(enabled) });
  globalThis.dispatchEvent?.(new CustomEvent(PHONE_FEED_SETTINGS_EVENT));
}

export function mountWorldPhoneFeedSettings(screen) {
  const button = screen.querySelector('[data-world-feed-auto]');
  if (!button) return;
  const paint = () => {
    const enabled = readWorldPhoneFeedAutoUpdate();
    button.setAttribute('aria-checked', String(enabled));
    const label = button.querySelector('[data-world-feed-auto-state]');
    if (label) label.textContent = enabled ? '开启' : '关闭';
  };
  paint();
  button.addEventListener('click', () => {
    setWorldPhoneFeedAutoUpdate(!readWorldPhoneFeedAutoUpdate());
    paint();
  });
}
