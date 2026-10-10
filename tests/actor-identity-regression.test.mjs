import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const actorUrl = new URL('../src/phone-game-actors.js', import.meta.url);
const gameUrl = new URL('../src/phone-game.js', import.meta.url);
const actorSource = await readFile(actorUrl, 'utf8');
const actors = await import(`data:text/javascript;base64,${Buffer.from(actorSource).toString('base64')}`);

test('同名 SillyTavern 角色和世界联系人保持独立 actor id', () => {
  const ctx = {
    name1: '玲',
    groupId: 'g1',
    groups: [{ id: 'g1', members: ['a.png', 'b.png'] }],
    characters: [
      { avatar: 'a.png', name: '同名', description: '成年人物 A' },
      { avatar: 'b.png', name: '同名', description: '成年人物 B' },
    ],
  };
  const result = actors.collectPhoneGameActors(ctx, [
    { id: 'person-1', name: '同名', raw: { backgroundProfile: '世界联系人' } },
  ]);

  assert.deepEqual(result.map(actor => actor.id), ['card:a.png', 'card:b.png', 'world:person-1']);
  assert.equal(new Set(result.map(actor => actor.id)).size, 3);
});

test('无头像 SillyTavern 角色不用 name 生成 actor id', () => {
  const ctx = {
    name1: '玲',
    characterId: 0,
    characters: [{ id: 'st-42', name: '可重复名字', description: '成年人物' }],
  };
  const result = actors.collectPhoneGameActors(ctx, []);

  assert.equal(result[0].id, 'card:id:st-42');
  assert.equal(result[0].id.includes('可重复名字'), false);
});

test('同名世界联系人不会被场景卡按名字排除', () => {
  const ctx = {
    name1: '玲',
    characterId: 0,
    characters: [{ avatar: 'world.png', name: '世界模拟器', cardType: 'world', description: '世界观卡' }],
  };
  const result = actors.collectPhoneGameActors(ctx, [
    { id: 'p1', name: '世界模拟器', raw: {} },
  ]);

  assert.deepEqual(result.map(actor => actor.id), ['world:p1']);
  assert.equal(actors.isPhoneGameScenarioActor(result[0], ctx), false);
});

test('存档 reconciliation 和 scope key 不再用显示名做身份兜底', async () => {
  const source = await readFile(gameUrl, 'utf8');
  const reconcile = source.match(/function reconcileActors[\s\S]*?\n}\n\nfunction legacyPhoneGameSave/)?.[0] || '';
  const capture = source.match(/export function capturePhoneGameScope[\s\S]*?\n}\nexport function isPhoneGameScopeCurrent/)?.[0] || '';

  assert.ok(reconcile.includes('known.find(item => item.id === actor.id)'));
  assert.equal(reconcile.includes('item.name === actor.name'), false);
  assert.equal(capture.includes('card?.name'), false);
  assert.ok(capture.includes('card?.id ?? card?.data?.id'));
});
