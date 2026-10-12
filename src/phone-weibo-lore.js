import * as worldInfo from '/scripts/world-info.js';

const text = value => String(value ?? '').trim();
const list = value => Array.isArray(value) ? value : [];
function cardsFor(ctx) {
  if (ctx?.groupId) {
    const group = list(ctx.groups).find(item => String(item.id) === String(ctx.groupId));
    return list(group?.members).map(avatar => list(ctx.characters).find(card => card.avatar === avatar)).filter(Boolean);
  }
  return [ctx?.characters?.[ctx.characterId]].filter(Boolean);
}

export function weiboWorldbookBindings(ctx, host = worldInfo) {
  const settings = host.world_info || host.getWorldInfoSettings?.().world_info || {};
  const selected = host.selected_world_info || settings.globalSelect || [];
  const cards = cardsFor(ctx);
  const names = [...list(selected), ctx?.chatMetadata?.world_info, ctx?.powerUserSettings?.persona_description_lorebook];
  for (const card of cards) {
    names.push(card.data?.extensions?.world);
    const filename = text(card.avatar).replace(/\.[^.]+$/, '');
    names.push(...list(settings.charLore).filter(item => item.name === filename).flatMap(item => list(item.extraBooks)));
  }
  return { cards, names: [...new Set(names.map(text).filter(Boolean))].slice(0, 12) };
}

export function weiboWorldbookSignature(ctx, host = worldInfo) {
  const {cards,names} = weiboWorldbookBindings(ctx,host);
  return JSON.stringify([names,cards.map(card => [card.avatar,card.data?.character_book || card.character_book])]);
}

function allowed(entry, cards) {
  if (!entry || entry.disable === true || entry.enabled === false || entry.extensions?.disable === true) return false;
  const visibility = entry.visibility || entry.extensions?.world_phone?.visibility;
  if (['private','secret','hidden'].includes(visibility) || entry.extensions?.world_phone?.public === false) return false;
  if (/隐藏|剧透|秘密|结局|伏笔|\b(?:hidden|secrets?|spoilers?|endings?)\b/i.test(text(entry.comment || entry.name))) return false;
  const filter = entry.characterFilter || entry.extensions?.characterFilter;
  if (list(filter?.names).length) {
    const hit = cards.some(card => list(filter.names).includes(text(card.avatar).replace(/\.[^.]+$/, '')));
    if (Boolean(filter.isExclude) === hit) return false;
  }
  return Boolean(text(entry.content));
}

// Read only books bound to the current chat/card/persona or globally selected.
// Do not run the host's activation scanner or advance its world-info timers.
export async function readWeiboWorldbook(ctx, {host = worldInfo, seed = Math.random(), current = () => true} = {}) {
  const {cards,names} = weiboWorldbookBindings(ctx,host);
  const signature = weiboWorldbookSignature(ctx,host);
  const entries = cards.flatMap(card => list((card.data?.character_book || card.character_book)?.entries)
    .map(entry => ({entry,book:card.name || '角色世界书'})));
  const warnings = [];
  for (const name of names) {
    if (!current() || signature !== weiboWorldbookSignature(ctx,host)) throw new Error('聊天或世界书已切换，本次微博内容未生成。');
    try {
      const book = await host.loadWorldInfo?.(name);
      if (!book?.entries) { warnings.push(name); continue; }
      entries.push(...Object.values(book.entries).map(entry => ({entry,book:name})));
    } catch { warnings.push(name); }
  }
  if (!current() || signature !== weiboWorldbookSignature(ctx,host)) throw new Error('聊天或世界书已切换，本次微博内容未生成。');
  const known = [ctx?.name1,...cards.map(card => card.name)].filter(Boolean);
  const seen = new Set();
  const enabled = entries.filter(({entry}) => allowed(entry,cards) && !seen.has(text(entry.content)) && seen.add(text(entry.content)));
  const related = enabled.filter(({entry}) => known.some(name => list(entry.key || entry.keys).includes(name))).slice(0,4);
  related.push(...enabled.filter(({entry})=>(entry.constant || entry.extensions?.constant)&&!related.some(item=>item.entry===entry)).slice(0,2));
  const rest = enabled.filter(item => !related.includes(item));
  const offset = rest.length ? Math.floor(seed * rest.length) % rest.length : 0;
  const ordered = [...related,...rest.slice(offset),...rest.slice(0,offset)];
  let remaining = 12000;
  const selected = [];
  for (const {entry,book} of ordered.slice(0, 24)) {
    const content = text(entry.content).slice(0,Math.min(1000,remaining));
    if (!content) break;
    selected.push({book,title:text(entry.comment || entry.name).slice(0,120),keys:list(entry.key || entry.keys).map(text).slice(0,8),content});
    remaining -= content.length;
  }
  return {entries:selected,unavailableBooks:warnings,signature};
}
