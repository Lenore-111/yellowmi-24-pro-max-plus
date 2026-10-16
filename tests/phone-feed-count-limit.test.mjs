import test from 'node:test';
import assert from 'node:assert/strict';
import { phoneDom } from './helpers/phone-dom.mjs';
import { readPhoneGameState, applyPhoneGamePosts } from '../src/phone-game.js';

function setup(t) {
  const f = phoneDom(t);
  const ctx = {
    name1: '玩家', characterId: 0,
    characters: [{ name: '陆祈', avatar: 'lu.png', description: '修灯匠' }],
    chatId: 'feed-count-limit', chat: [{ mes: '夜市开门了' }], chatMetadata: {},
    saveMetadataDebounced() {},
  };
  f.set('SillyTavern', { getContext: () => ctx });
  f.set('worldBackstageHost', undefined);
  return { f, ctx };
}

test('小红书和朋友圈保存全部有效返回，不再静默截成四条；微博仍保留一屏六条上限', t => {
  setup(t);
  const actor = readPhoneGameState().actors[0];
  const seven = Array.from({ length: 7 }, (_, index) => ({
    actorId: actor.id,
    title: `第${index + 1}条`,
    text: `这是第 ${index + 1} 条完整有效动态。`,
  }));

  let state = applyPhoneGamePosts('rednote', seven);
  assert.equal(state.posts.filter(post => post.platform === 'rednote').length, 7);
  assert.deepEqual(state.posts.filter(post => post.platform === 'rednote').map(post => post.title), seven.map(post => post.title));

  state = applyPhoneGamePosts('moments', seven.map(item => ({ ...item, title: '' })));
  assert.equal(state.posts.filter(post => post.platform === 'moments').length, 7);

  const weibo = seven.map((item, index) => ({ ...item, actorId: actor.id, authorKind: 'character', text: `微博 ${index + 1}` }));
  state = applyPhoneGamePosts('weibo', weibo);
  assert.equal(state.posts.filter(post => post.platform === 'weibo').length, 6);
});
