import test from 'node:test';
import assert from 'node:assert/strict';
import { phoneDom } from './helpers/phone-dom.mjs';
import { renderPhoneImageSettings } from '../src/phone-image-view.js';
import { renderPhoneGameApp } from '../src/phone-game-view.js';
import { savePhoneImageSettings } from '../src/phone-image-provider.js';
import { readPhoneGameState, applyPhoneGamePosts, attachPhoneGameImage } from '../src/phone-game.js';

const settle = () => new Promise(resolve => setImmediate(resolve));
function fixture(t) {
  const f = phoneDom(t), storage = new Map();
  const ctx = { name1: '玩家', characterId: 0, chatId: crypto.randomUUID(), characters: [{ name: '配图角色', avatar: 'image-ui.png' }], chat: [], chatMetadata: {}, extensionSettings: {}, saveMetadataDebounced() {}, saveSettingsDebounced() {}, getRequestHeaders: () => ({}) };
  f.set('SillyTavern', { getContext: () => ctx });
  f.set('localStorage', { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) });
  f.set('CSS', { supports: () => true });
  return { ...f, ctx };
}

test('密钥使用普通输入遮蔽；拒绝读取时就近提示，迟到剪贴板不能覆盖新输入或新页面', async t => {
  const f = fixture(t);
  let release;
  f.set('navigator', { clipboard: { readText: () => new Promise(resolve => { release = resolve; }) } });
  let stop = renderPhoneImageSettings(f.screen, () => {});
  const key = f.screen.querySelector('[data-image-key]');
  assert.equal(key.type, 'text'); assert.equal(key.getAttribute('autocomplete'), 'off');
  assert.equal(key.style.webkitTextSecurity, 'disc');
  f.screen.querySelector('[data-image-key-visibility]').click();
  assert.equal(key.style.webkitTextSecurity, 'none');
  f.screen.querySelector('[data-image-paste]').click();
  key.value = '后来手动填写'; key.fire('input'); release('过时剪贴板'); await settle();
  assert.equal(key.value, '后来手动填写');
  f.screen.querySelector('[data-image-paste]').click(); stop();
  stop = renderPhoneImageSettings(f.screen, () => {});
  const replacement = f.screen.querySelector('[data-image-key]'); replacement.value = '新页面内容';
  release('原页面剪贴板'); await settle(); assert.equal(replacement.value, '新页面内容');
  navigator.clipboard.readText = async () => { throw new DOMException('拒绝', 'NotAllowedError'); };
  f.screen.querySelector('[data-image-paste]').click(); await settle();
  assert.equal(document.activeElement, replacement);
  assert.match(f.screen.querySelector('[data-image-key-status]').textContent, /长按/);
  assert.equal(replacement.value, '新页面内容');
  assert.equal(f.screen.querySelector('[data-image-key-status]').hidden, false);
  assert.equal(f.screen.querySelector('[data-image-paste]').disabled, false);
  stop();
  f.set('CSS', { supports: () => false });
  stop = renderPhoneImageSettings(f.screen, () => {});
  assert.equal(f.screen.querySelector('[data-image-key]').type, 'password');
  f.screen.querySelector('[data-image-key-visibility]').click();
  assert.equal(f.screen.querySelector('[data-image-key]').type, 'text');
  stop();
});

test('深滚动配图的等待和错误位于滚动区外；服务拒绝后保留原图与浏览位置', async t => {
  const f = fixture(t);
  savePhoneImageSettings({ baseUrl: 'https://image.example/v1', model: 'fixture-image', apiKey: 'fixture-ui-key' });
  const actor = readPhoneGameState().actors[0];
  const post = applyPhoneGamePosts('weibo', [{ actorId: actor.id, text: '动态', imagePrompt: '一杯咖啡' }]).posts.at(-1);
  attachPhoneGameImage(post.id, '/user/files/world-phone-image-original.png', '原配图');
  let release, request;
  f.set('fetch', (url, options) => { request = { url, options }; return new Promise(resolve => { release = resolve; }); });
  const stop = renderPhoneGameApp(f.screen, { app: 'weibo', goHome() {}, openApp() {} }); f.cleanup.push(stop);
  f.screen.querySelector('[data-pg-post]').click();
  f.screen.querySelector('.wp-social-shell').scrollTop = 900;
  f.screen.querySelector('[data-pg-image]').click(); f.screen.querySelector('[data-image-generate]').click();
  const waiting = f.screen.querySelector('[data-pg-image-status]');
  assert.match(waiting.textContent, /生成中/);
  assert.equal(waiting.parentElement, f.screen.querySelector('[data-phone-game-app]'));
  assert.equal(f.screen.querySelector('.wp-social-shell').scrollTop, 900);
  assert.equal(request.options.headers.Authorization, 'Bearer fixture-ui-key');
  release(new Response('上游拒绝', { status: 502 })); await settle(); await settle();
  const failure = f.screen.querySelector('[data-pg-image-status]');
  assert.match(failure.textContent, /502/); assert.equal(failure.getAttribute('role'), 'alert');
  assert.equal(failure.parentElement, f.screen.querySelector('[data-phone-game-app]'));
  assert.equal(f.screen.querySelector('.wp-social-shell').scrollTop, 900);
  assert.equal(readPhoneGameState().posts.find(p => p.id === post.id).imageUrl, '/user/files/world-phone-image-original.png');
  f.screen.querySelector('[data-pg-image-dismiss]').click(); assert.equal(f.screen.querySelector('[data-pg-image-status]'), null);
});


test('绘图模型区分常用选项和站点结果；换地址后丢弃迟到列表',async t=>{
 const f=fixture(t);savePhoneImageSettings({provider:'novelai',baseUrl:'https://novel.example',model:'',apiKey:'fixture-ui-key'});
 let release;f.set('fetch',()=>new Promise(resolve=>{release=resolve;}));
 const stop=renderPhoneImageSettings(f.screen,()=>{});f.cleanup.push(stop);
 const select=f.screen.querySelector('[data-image-model-choice]');
 assert.equal(select.hidden,false);assert.equal(select.dataset.source,'builtin');assert.match(select.textContent,/未验证/);
 const choice=select.querySelectorAll('option')[1];select.value=choice.value;select.fire('change');assert.equal(f.screen.querySelector('[data-image-model]').value,'nai-diffusion-4-5-full');
 f.screen.querySelector('[data-image-models]').click();
 f.screen.querySelector('[data-image-url]').value='https://new.example';f.screen.querySelector('[data-image-url]').fire('input');
 release(new Response(JSON.stringify({data:[{id:'old-site-model'}]})));await settle();await settle();
 assert.equal(select.dataset.source,'builtin');assert.ok(!select.textContent.includes('old-site-model'));
 f.set('fetch',async()=>new Response(JSON.stringify({data:[{id:'new-site-model'}]})));
 f.screen.querySelector('[data-image-models]').click();await settle();await settle();
 assert.equal(select.dataset.source,'site');assert.match(select.textContent,/new-site-model/);assert.ok(!select.textContent.includes('nai-diffusion'));
 assert.match(f.screen.querySelector('[data-image-model-status]').textContent,/站点返回/);
});
