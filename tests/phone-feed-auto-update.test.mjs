import test from 'node:test';
import assert from 'node:assert/strict';
import { phoneDom } from './helpers/phone-dom.mjs';
import { mountWorldPhoneFeedIntegration } from '../src/world-phone-feed-integration.js';
import { mountWorldPhoneFeedSettings, readWorldPhoneFeedAutoUpdate, setWorldPhoneFeedAutoUpdate } from '../src/world-phone-feed-settings.js';
import { setPhoneGameMode } from '../src/phone-game.js';

function setup(t) {
  const f = phoneDom(t);
  let ctx = { name1: '玩家', characterId: 0, characters: [{ name: '阿青', avatar: 'a.png' }], chatId: 'A', chat: [], chatMetadata: {}, saveMetadataDebounced() {} };
  f.set('SillyTavern', { getContext: () => ctx });
  f.set('addEventListener', window.addEventListener.bind(window));
  f.set('removeEventListener', window.removeEventListener.bind(window));
  f.set('dispatchEvent', window.dispatchEvent.bind(window));
  const timers = new Map(), polls = new Map(); let seq = 0;
  window.setTimeout = fn => { const id = ++seq; timers.set(id, fn); return id; };
  window.clearTimeout = id => timers.delete(id);
  f.set('setInterval', fn => { const id = ++seq; polls.set(id, fn); return id; });
  f.set('clearInterval', id => polls.delete(id));
  let mutation;
  f.set('MutationObserver', class { constructor(fn) { mutation = fn; } observe() {} disconnect() { mutation = null; } });
  const surface = { capabilities: ['social-open-direct', 'social-create-group', 'social-respond-friend', 'social-comment-moment', 'social-send-message', 'social-read-conversation', 'social-set-moment-like'], bridgeVersion: 2, connected: true, branchKey: 'b1', people: [], events: [], social: { moments: [] }, publicOpinion: { news: [], forums: [] }, clock: { absoluteMinute: 600 } };
  let signature = 'source-1', onRequest = null;
  const calls = [];
  const host = {
    phoneBridgeVersion: 2, phoneAction() {}, getPhoneSurface: () => structuredClone(surface),
    getPhoneFeedSourceSignature: () => signature,
    activatePhoneFeed() {},
    async requestPhoneFeed(options) {
      calls.push({ ...options, chatId: ctx.chatId, branch: surface.branchKey });
      if (onRequest) await onRequest(options);
      dispatchEvent(new CustomEvent('world-backstage:phone-update'));
    },
  };
  f.set('worldBackstageHost', host);
  setPhoneGameMode('world');
  const stop = mountWorldPhoneFeedIntegration(); f.cleanup.push(stop);
  const show = platform => { f.screen.innerHTML = `<section class="wp-native-app wp-social-realism-app is-${platform}"><button type="button" data-social-opinion-refresh>刷新舆情</button></section>`; mutation?.(); };
  async function flush() {
    for (let round = 0; round < 8; round++) {
      const next = [...timers.values()]; timers.clear(); next.forEach(fn => fn());
      await new Promise(resolve => setImmediate(resolve));
      if (!timers.size) return;
    }
    assert.fail('自动更新没有收敛，可能被自己的事件再次触发');
  }
  const poll = async () => { for (const fn of polls.values()) fn(); await flush(); };
  return { ...f, host, surface, calls, show, flush, poll, stop, timers, polls,
    change(value) { signature = value; surface.events = [{ id: value, publicSummary: value }]; },
    onRequest(fn) { onRequest = fn; },
    switchChat() { ctx = { ...ctx, chatId: 'B', chatMetadata: {} }; setPhoneGameMode('world'); },
  };
}

test('设置开关默认开启，点击保存且按聊天隔离', async t => {
  const f = setup(t);
  f.screen.innerHTML = '<button data-world-feed-auto role="switch"><i data-world-feed-auto-state></i></button>';
  mountWorldPhoneFeedSettings(f.screen);
  const button = f.screen.querySelector('[data-world-feed-auto]');
  assert.equal(button.getAttribute('aria-checked'), 'true');
  button.click(); assert.equal(readWorldPhoneFeedAutoUpdate(), false);
  assert.equal(button.getAttribute('aria-checked'), 'false'); assert.match(button.textContent, /关闭/);
  f.switchChat(); assert.equal(readWorldPhoneFeedAutoUpdate(), true);
});

test('未打开社交平台和关闭手机时不生成，世界变化自动更新，自身事件不循环', async t => {
  const f = setup(t); await f.flush(); assert.equal(f.calls.length, 0);
  f.show('weibo'); await f.poll(); assert.equal(f.calls.length, 1);
  await f.poll(); assert.equal(f.calls.length, 1);
  f.change('source-2'); await f.poll(); assert.equal(f.calls.length, 2);
  f.stage.hidden = true; f.change('source-3'); await f.poll(); assert.equal(f.calls.length, 2);
  f.stage.hidden = false; f.doc.fire('visibilitychange'); await f.poll(); assert.equal(f.calls.length, 3);
});

test('关闭开关阻止自动生成，手动刷新保留，重新开启补齐更新', async t => {
  const f = setup(t); setWorldPhoneFeedAutoUpdate(false); f.show('weibo');
  await f.flush(); f.change('source-2'); await f.poll(); assert.equal(f.calls.length, 0);
  f.screen.querySelector('[data-social-opinion-refresh]').click(); await f.flush();
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].force, true);
  setWorldPhoneFeedAutoUpdate(true); await f.flush(); assert.equal(f.calls.length, 2); assert.equal(f.calls[1].force, false);
});

test('独立模式、断线、页面后台不自动调用，两个平台分别跟踪来源', async t => {
  const f = setup(t); f.show('weibo'); setPhoneGameMode('game'); await f.flush(); assert.equal(f.calls.length, 0);
  setPhoneGameMode('world'); f.surface.connected = false; await f.flush(); assert.equal(f.calls.length, 0);
  f.surface.connected = true; f.doc.hidden = true; await f.poll(); assert.equal(f.calls.length, 0);
  f.doc.hidden = false; f.doc.fire('visibilitychange'); await f.poll(); assert.equal(f.calls.length, 1);
  f.show('rednote'); await f.poll(); assert.equal(f.calls.length, 2); assert.equal(f.calls[1].platform, 'rednote');
});

test('在途更新合并，新世界内容等完成后只补一次，手动点击不重复调用', async t => {
  const f = setup(t); f.show('weibo'); let release;
  f.onRequest(() => new Promise(resolve => release = resolve));
  await f.flush(); assert.equal(f.calls.length, 1);
  f.screen.querySelector('[data-social-opinion-refresh]').click();
  f.change('source-2'); await f.poll(); assert.equal(f.calls.length, 1);
  f.onRequest(null); release(); await f.flush(); assert.equal(f.calls.length, 2);
  await f.poll(); assert.equal(f.calls.length, 2);
});

test('同branchKey跨聊天不被旧请求挡住，切分支后重新更新', async t => {
  const f = setup(t); f.show('weibo'); let release;
  f.onRequest(() => new Promise(resolve => release = resolve));
  await f.flush(); f.onRequest(null); f.switchChat(); await f.poll();
  assert.deepEqual(f.calls.map(c => c.chatId), ['A', 'B']);
  release(); await f.flush(); assert.equal(f.calls.length, 2);
  f.surface.branchKey = 'b2'; f.change('source-2'); await f.poll(); assert.equal(f.calls.length, 3);
});

test('失败不轮询重试，手动刷新可恢复，卸载清理监听与定时器', async t => {
  const f = setup(t); f.show('weibo'); f.onRequest(() => { throw Error('临时失败'); });
  await f.flush(); await f.poll(); assert.equal(f.calls.length, 1);
  f.onRequest(null); f.screen.querySelector('[data-social-opinion-refresh]').click(); await f.flush(); assert.equal(f.calls.length, 2);
  f.stop(); assert.equal(f.polls.size, 0); assert.equal(f.timers.size, 0);
  f.change('source-3'); dispatchEvent(new CustomEvent('world-backstage:phone-update')); await f.flush(); assert.equal(f.calls.length, 2);
});
