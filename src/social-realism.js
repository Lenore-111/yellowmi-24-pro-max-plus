import { readSocialBucket, writeSocialBucket, socialScope } from './social-storage.js';
import { buildCommunicationRegistry } from './communication-registry.js';
import { readWorldBackstage, subscribeWorldBackstage } from './world-backstage-bridge.js';
import { readPhoneGameMode } from './phone-game.js';

const STORAGE_KEY = 'world_phone_social_realism_v1';
const APPS = {
  weibo: { id: 'weibo', label: '微博', icon: '博', tone: 'is-weibo' },
  rednote: { id: 'rednote', label: '小红书', icon: '书', tone: 'is-rednote' },
};

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

function text(value) {
  return String(value ?? '').trim();
}

function validImage(value) {
  const src = text(value);
  return /^(?:https?:\/\/|data:image\/)/i.test(src) ? src : '';
}

function imageList(raw) {
  const candidates = [
    raw?.imageUrls, raw?.image_urls, raw?.images, raw?.photos,
    raw?.imageUrl, raw?.image_url, raw?.coverUrl, raw?.cover_url,
    raw?.thumbnailUrl, raw?.thumbnail_url, raw?.image,
  ].flatMap((value) => Array.isArray(value) ? value : value == null ? [] : [value]);
  return [...new Set(candidates.map((value) => validImage(
    value && typeof value === 'object' ? (value.url ?? value.src ?? value.imageUrl ?? value.image_url) : value,
  )).filter(Boolean))].slice(0, 9);
}

export function redNoteGalleryIndex(scrollLeft, viewportWidth, slideCount) {
  const count = Math.max(0, Math.floor(Number(slideCount) || 0));
  if (!count) return 0;
  const width = Math.max(1, Number(viewportWidth) || 1);
  const offset = Math.max(0, Number(scrollLeft) || 0);
  return Math.min(count - 1, Math.max(0, Math.round(offset / width)));
}

function firstImage(raw) {
  return imageList(raw)[0] || '';
}

function defaultState() {
  return {
    weibo: { liked: {}, saved: {}, tab: 'home', query: '', detailId: '' },
    rednote: { liked: {}, saved: {}, tab: 'discover', query: '', detailId: '' },
  };
}

export function sanitizeSocialRealismState(value) {
  const source = value && typeof value === 'object' ? value : {};
  const cleanBucket = (bucket, allowedTabs, fallbackTab) => {
    const raw = bucket && typeof bucket === 'object' ? bucket : {};
    const cleanMap = (map) => Object.fromEntries(Object.entries(map && typeof map === 'object' ? map : {})
      .filter(([key, enabled]) => text(key) && Boolean(enabled))
      .slice(0, 400)
      .map(([key]) => [String(key).slice(0, 180), true]));
    return {
      liked: cleanMap(raw.liked),
      saved: cleanMap(raw.saved),
      tab: allowedTabs.includes(raw.tab) ? raw.tab : fallbackTab,
      query: text(raw.query).slice(0, 80),
      detailId: text(raw.detailId).slice(0, 180),
    };
  };
  return {
    weibo: { ...cleanBucket(source.weibo, ['home', 'hot', 'me'], 'home'), profileView: source.weibo?.profileView === 'liked' ? 'liked' : 'saved' },
    rednote: { ...cleanBucket(source.rednote, ['discover', 'saved', 'me'], 'discover'), profileView: source.rednote?.profileView === 'liked' ? 'liked' : 'saved' },
  };
}

function loadState() { return sanitizeSocialRealismState(readSocialBucket(STORAGE_KEY)); }
function saveState(state) { writeSocialBucket(STORAGE_KEY, sanitizeSocialRealismState(state)); }

function stamp(item) {
  return text(item.updatedAt || item.publishedAt || item.createdAt || item.raw?.createdAt || item.raw?.created_at);
}

function itemSortValue(item) {
  const minute = Number(item.worldMinute) || 0;
  if (minute) return minute * 60_000;
  const parsed = Date.parse(stamp(item));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function socialTimeLabel(item, snapshot = {}) {
  const nowMinute = Number(snapshot?.clock?.absoluteMinute) || 0;
  const worldMinute = Number(item?.worldMinute) || 0;
  if (nowMinute > 0 && worldMinute > 0 && nowMinute >= worldMinute) {
    const delta = nowMinute - worldMinute;
    if (delta < 1) return '刚刚';
    if (delta < 60) return `${delta}分钟前`;
    if (delta < 24 * 60) return `${Math.floor(delta / 60)}小时前`;
    if (delta < 7 * 24 * 60) return `${Math.floor(delta / (24 * 60))}天前`;
  }
  const value = stamp(item);
  if (!value) return '刚刚';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 16);
  return date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

function relatedForumReplies(snapshot, eventId) {
  const id = text(eventId);
  if (!id) return [];
  return (snapshot.forums || [])
    .filter((forum) => text(forum.relatedEventId) === id)
    .flatMap((forum) => (forum.replies || []).map((reply) => ({ ...reply, board: forum.board })))
    .slice(0, 12);
}

export function buildWeiboItems(snapshot = {}) {
  const news = (snapshot.news || []).map((item) => ({
    id: `news:${item.id}`,
    sourceId: item.id,
    kind: 'news',
    author: item.source || item.category || '世界新闻',
    verified: item.sourceType === 'official',
    title: item.headline,
    body: item.summary,
    scope: item.scope || item.area || item.category || '',
    heat: Math.max(0, Number(item.heat) || 0),
    replies: relatedForumReplies(snapshot, item.relatedEventId),
    relatedEventId: item.relatedEventId || '',
    worldMinute: Number(item.worldMinute) || 0,
    publishedAt: item.publishedAt || item.createdAt || '',
    updatedAt: item.updatedAt || '',
    imageUrl: firstImage(item.raw),
    raw: item.raw,
  }));
  const forums = (snapshot.forums || []).map((item) => ({
    id: `forum:${item.id}`,
    sourceId: item.id,
    kind: 'forum',
    author: item.board || '公开讨论',
    verified: false,
    title: item.title,
    body: item.summary,
    scope: item.scope || item.claimStatus || '公开讨论',
    heat: Math.max(0, Number(item.heat) || 0),
    replies: item.replies || [],
    relatedEventId: item.relatedEventId || '',
    worldMinute: Number(item.worldMinute) || 0,
    publishedAt: item.publishedAt || '',
    updatedAt: item.updatedAt || '',
    imageUrl: firstImage(item.raw),
    raw: item.raw,
  }));
  return [...news, ...forums]
    .filter((item) => text(item.title) || text(item.body))
    .sort((a, b) => itemSortValue(b) - itemSortValue(a));
}

function noteTags(item) {
  const source = [item.scope, item.author, item.kind === 'news' ? '现场记录' : '真实讨论'].map(text).filter(Boolean);
  return [...new Set(source)].slice(0, 3);
}

function redNoteFriendlyNews(item) {
  if (firstImage(item.raw)) return true;
  const copy = [item.category, item.scope, item.headline, item.summary].map(text).join(' ');
  return /夜市|市集|散步|生活|美食|旅行|游玩|校园|穿搭|咖啡|餐厅|公园|展览|电影|音乐|购物|探店|体验|日常|照片|图集|景点|住宿/i.test(copy);
}

function redNoteFriendlyForum(item) {
  if (firstImage(item.raw)) return true;
  const copy = [item.board, item.title, item.summary, item.scope].map(text).join(' ');
  return /探店|美食|餐厅|咖啡|旅行|游玩|景点|住宿|穿搭|护肤|妆|摄影|照片|图集|公园|展览|电影|音乐|购物|开箱|体验|日常|生活|散步|市集|夜市|宠物|猫|狗|校园|书|阅读|手作|健身|运动|周末/i.test(copy);
}

export function buildWeiboHotItems(items = []) {
  const groups = new Map();
  for (const item of items) {
    if (!(item.heat > 0)) continue;
    const eventId = text(item.relatedEventId);
    const key = eventId ? `event:${eventId}` : `item:${item.id}`;
    const current = groups.get(key);
    if (!current) {
      groups.set(key, {
        ...item,
        id: item.id,
        sourceCount: 1,
        sourceKinds: new Set([item.kind]),
        relatedEventId: eventId,
      });
      continue;
    }
    current.sourceCount += 1;
    current.sourceKinds.add(item.kind);
    if (item.heat > current.heat) current.heat = item.heat;
    if (item.kind === 'news' && current.kind !== 'news') {
      current.title = item.title || current.title;
      current.body = item.body || current.body;
      current.author = item.author || current.author;
      current.verified = item.verified;
      current.imageUrl = item.imageUrl || current.imageUrl;
      current.scope = item.scope || current.scope;
      current.id = item.id;
    }
    current.replies = [...(current.replies || []), ...(item.replies || [])]
      .filter((reply, index, replies) => replies.findIndex((candidate) => candidate.author === reply.author && candidate.text === reply.text) === index)
      .slice(0, 12);
  }
  return [...groups.values()]
    .map((item) => ({ ...item, sourceKinds: [...item.sourceKinds] }))
    .sort((a, b) => (b.heat - a.heat) || (itemSortValue(b) - itemSortValue(a)))
    .slice(0, 30);
}

export function buildRedNoteItems(snapshot = {}) {
  const forums = (snapshot.forums || []).filter(redNoteFriendlyForum).map((item) => ({
    id: `forum:${item.id}`, sourceId: item.id, kind: 'forum', author: item.board || '公开记录', verified: false,
    title: item.title, body: item.summary, scope: item.scope || item.claimStatus || '公开讨论', heat: Math.max(0, Number(item.heat) || 0),
    replies: item.replies || [], relatedEventId: item.relatedEventId || '', worldMinute: Number(item.worldMinute) || 0,
    publishedAt: item.publishedAt || '', updatedAt: item.updatedAt || '', imageUrl: firstImage(item.raw), imageUrls: imageList(item.raw), raw: item.raw,
  }));
  const news = (snapshot.news || []).filter(redNoteFriendlyNews).map((item) => ({
    id: `news:${item.id}`, sourceId: item.id, kind: 'news', author: item.source || item.category || '公开记录',
    verified: item.sourceType === 'official', title: item.headline, body: item.summary,
    scope: item.scope || item.area || item.category || '', heat: Math.max(0, Number(item.heat) || 0),
    replies: relatedForumReplies(snapshot, item.relatedEventId), relatedEventId: item.relatedEventId || '', worldMinute: Number(item.worldMinute) || 0,
    publishedAt: item.publishedAt || item.createdAt || '', updatedAt: item.updatedAt || '', imageUrl: firstImage(item.raw), imageUrls: imageList(item.raw), raw: item.raw,
  }));
  return [...forums, ...news].filter((item) => text(item.title) || text(item.body))
    .sort((x, y) => itemSortValue(y) - itemSortValue(x)).map((item, index) => ({
      ...item, noteId: `note:${item.id}`, tags: noteTags(item),
      coverSeed: Math.abs([...item.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) + index) % 6,
    }));
}

function includesQuery(item, query) {
  const q = text(query).toLowerCase();
  if (!q) return true;
  return [item.author, item.title, item.body, item.scope, ...(item.tags || [])]
    .some((value) => text(value).toLowerCase().includes(q));
}

// The social feed is the scrollport; RedNote's detail screen still uses the outer shell.
export function socialFeedScroller(appId, shell) {
  if (appId === 'weibo') return shell?.querySelector?.('.wp-wb-feed') || shell;
  if (appId !== 'rednote') return shell;
  return shell?.querySelector?.('.wp-rn-grid')
    || shell?.querySelector?.('.wp-rn-detail-scroll') || shell;
}

function mutationNeedsRefresh(records) {
  return records.some((record) => {
    const target = record.target?.nodeType === 1 ? record.target : record.target?.parentElement;
    if (!target?.closest) return true;
    if (target.closest('#world-phone-stage .wp-social-realism-app')) return false;
    if (target.closest('#world-phone-stage .wp-wx-app')) return false;
    return true;
  });
}

function avatarLetter(name) {
  return esc(text(name).slice(0, 1) || '世');
}

function appButton(meta) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `wp-app ${meta.tone}`;
  button.dataset.app = meta.id;
  button.dataset.socialRealismManaged = '1';
  button.innerHTML = `<span class="wp-app-icon">${esc(meta.icon)}</span><span>${esc(meta.label)}</span>`;
  return button;
}

function headerCopy(section, title, subtitle) {
  const header = section?.querySelector('.wp-app-header');
  if (!header) return;
  const titleNode = header.querySelector('div > b');
  const subNode = header.querySelector('div > small');
  if (titleNode && titleNode.textContent !== title) titleNode.textContent = title;
  if (subNode && subNode.textContent !== subtitle) subNode.textContent = subtitle;
}

function emptyMarkup(title, body) {
  return `<div class="wp-social-empty"><span>◌</span><b>${esc(title)}</b><p>${esc(body)}</p></div>`;
}

function searchMarkup(kind, state, placeholder) {
  return `<form class="wp-social-search" data-social-search="${esc(kind)}">
    <button type="submit" aria-label="搜索">⌕</button><input value="${esc(state.query)}" maxlength="80" placeholder="${esc(placeholder)}" autocomplete="off">
    ${state.query ? '<button type="button" data-social-clear aria-label="清除搜索">×</button>' : ''}
  </form>`;
}

function weiboCard(item, snapshot, state, detail = false) {
  const liked = Boolean(state.liked[item.id]);
  const saved = Boolean(state.saved[item.id]);
  return `<article class="wp-wb-card" data-social-item="${esc(item.id)}">
    <div class="wp-wb-author"><span>${avatarLetter(item.author)}</span><div><b>${esc(item.author)}${item.verified ? '<i>✓</i>' : ''}</b><small>${esc(socialTimeLabel(item, snapshot))}${item.scope ? ` · ${esc(item.scope)}` : ''}</small></div></div>
    <button type="button" class="wp-wb-main" data-social-detail="${esc(item.id)}">
      ${item.title ? `<h3>${esc(item.title)}</h3>` : ''}
      ${item.body ? `<p>${esc(item.body)}</p>` : ''}
      ${item.imageUrl ? `<img src="${esc(item.imageUrl)}" alt="${esc(item.title || '动态配图')}" loading="lazy" decoding="async">` : ''}
    </button>
    <div class="wp-wb-meta">${item.heat ? `<span>热度 ${item.heat}</span>` : '<span>公开动态</span>'}<span>${item.replies.length ? `${item.replies.length} 条讨论` : '暂无讨论'}</span></div>
    ${detail ? '' : `<div class="wp-wb-actions">
      <button type="button" data-social-share="${esc(item.id)}">${weiboIcon('share')}转发</button>
      <button type="button" data-social-detail="${esc(item.id)}">${weiboIcon('comment')}评论</button>
      <button type="button" data-social-like="${esc(item.id)}" class="${liked ? 'is-active' : ''}" aria-pressed="${liked}" aria-label="${liked ? '取消赞' : '赞'}">${weiboIcon('liked')}${liked ? '已赞' : '赞'}</button>
    </div>`}
  </article>`;
}

function weiboDetail(item, snapshot, state) {
  const liked = Boolean(state.liked[item.id]);
  const saved = Boolean(state.saved[item.id]);
  return `<div class="wp-social-detail wp-wb-detail">
    <button type="button" class="wp-social-inline-back" data-social-detail-back>‹ 返回</button>
    ${weiboCard(item, snapshot, state, true)}
    <section class="wp-social-comments"><header><b>评论与相关讨论</b><span>${item.replies.length}</span></header>
      ${item.replies.length ? item.replies.map((reply) => `<div class="wp-social-comment"><span>${avatarLetter(reply.author)}</span><div><b>${esc(reply.author || '匿名')}${reply.board ? `<small> · ${esc(reply.board)}</small>` : ''}</b><p>${esc(reply.text)}</p></div></div>`).join('') : emptyMarkup('还没有公开讨论', '有公开回复时会显示在这里。')}
    </section>
    <div class="wp-social-detail-bar"><button type="button" data-social-share="${esc(item.id)}" aria-label="转发微博">↗ 转发</button><button type="button" data-social-save="${esc(item.id)}" class="${saved ? 'is-active' : ''}" aria-pressed="${saved}" aria-label="${saved ? '取消收藏' : '收藏'}">${saved ? '★ 已收藏' : '☆ 收藏'}</button><button type="button" data-social-like="${esc(item.id)}" class="${liked ? 'is-active' : ''}" aria-pressed="${liked}" aria-label="${liked ? '取消赞' : '赞'}">${liked ? '♥ 已赞' : '♡ 赞'}</button></div>
  </div>`;
}

function weiboHotMarkup(items, snapshot) {
  const ranked = buildWeiboHotItems(items);
  if (!ranked.length) return emptyMarkup('暂时没有热搜', '世界里出现带热度的公开话题后会排到这里。');
  return `<section class="wp-wb-hot-section"><header class="wp-wb-hot-head"><b>微博热搜</b><small>来自已公开的世界话题</small></header><div class="wp-wb-hot-list">${ranked.map((item, index) => `<button type="button" class="wp-wb-hot-row" data-social-detail="${esc(item.id)}"><strong>${index + 1}</strong><span><b>${esc(item.title || item.body || '公开话题')}</b><small>${esc(item.author)} · ${esc(socialTimeLabel(item, snapshot))} · ${item.sourceCount} 个公开来源</small></span><i>${item.heat}</i></button>`).join('')}</div></section>`;
}

function weiboIcon(name) {
  const paths = {
    share: '<path d="M8 5h12v12M20 5 9 16M5 9H3v12h12v-2"/>',
    comment: '<path d="M21 11a9 9 0 0 1-9 9H4l-2 2v-9a9 9 0 0 1 19-2z"/>',
    home: '<path d="m3 10 9-7 9 7v10H6V10M9 20v-7h6v7"/>',
    hot: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    me: '<circle cx="12" cy="7" r="4"/><path d="M4 21v-3a8 8 0 0 1 16 0v3"/>',
    saved: '<path d="M6 3h12v18l-6-4-6 4z"/>',
    liked: '<path d="M20 5c-3-3-6-1-8 1-2-2-5-4-8-1s0 7 8 14c8-7 11-11 8-14z"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.home}</svg>`;
}

function weiboBottomNav(tab) {
  return `<nav class="wp-wb-bottom-nav" aria-label="微博导航">${[
    ['home', '首页'], ['hot', '发现'], ['me', '我'],
  ].map(([id, label]) => `<button type="button" data-social-tab="${id}" class="${tab === id ? 'is-active' : ''}" aria-current="${tab === id ? 'page' : 'false'}">${weiboIcon(id)}<span>${label}</span></button>`).join('')}</nav>`;
}

function weiboProfile(snapshot, state, items) {
  const selected = state.profileView || 'saved';
  const visible = items.filter((item) => state[selected === 'liked' ? 'liked' : 'saved'][item.id]);
  return `<section class="wp-wb-profile">
    <div class="wp-wb-profile-head"><span class="wp-wb-profile-avatar">${avatarLetter(snapshot.user || '你')}</span><div><h2>${esc(snapshot.user || '你')}</h2><p>记录生活，发现新鲜事</p></div></div>
    <div class="wp-wb-profile-stats"><div><b>—</b><span>微博</span></div><div><b>—</b><span>关注</span></div><div><b>—</b><span>粉丝</span></div></div>
    <nav class="wp-wb-profile-tools" aria-label="个人内容"><button type="button" data-social-profile="saved" class="${selected === 'saved' ? 'is-active' : ''}">${weiboIcon('saved')}<span>我的收藏</span><small>${Object.keys(state.saved).length}</small></button><button type="button" data-social-profile="liked" class="${selected === 'liked' ? 'is-active' : ''}">${weiboIcon('liked')}<span>我的赞</span><small>${Object.keys(state.liked).length}</small></button></nav>
    <div class="wp-wb-local-note">收藏和赞保存在本机 · 账号数据暂未接入</div>
  </section><section class="wp-wb-profile-content"><h3>${selected === 'liked' ? '赞过的微博' : '收藏的微博'}</h3>${visible.length ? visible.map((item) => weiboCard(item, snapshot, state)).join('') : emptyMarkup(selected === 'liked' ? '还没有赞过的微博' : '还没有收藏的微博', !snapshot.connected && Object.keys(state[selected]).length ? '连接世界背面 SIM 后查看已保存的内容。' : '浏览微博时，可以把喜欢的内容留在这里。')}</section>`;
}

function renderWeiboMarkup(snapshot, state) {
  const items = buildWeiboItems(snapshot);
  const detail = items.find((item) => item.id === state.detailId);
  if (detail) return weiboDetail(detail, snapshot, state);
  const filtered = items.filter((item) => includesQuery(item, state.query));
  const body = state.tab === 'me' ? weiboProfile(snapshot, state, items)
    : !snapshot.connected ? emptyMarkup('暂时无法连接微博', '请在手机设置中连接世界背面 SIM。')
    : state.tab === 'hot' ? weiboHotMarkup(filtered, snapshot)
    : filtered.length ? filtered.map((item) => weiboCard(item, snapshot, state)).join('')
    : emptyMarkup(state.query ? '没有搜到' : '暂时没有公开内容', state.query ? '换个关键词试试。' : '世界里的公开动态会显示在这里。');
  const hasHotTopics = snapshot.connected && state.tab === 'home' && buildWeiboHotItems(items).length > 0;
  return `<div class="wp-weibo-shell" data-social-view="${esc(state.tab)}">${state.tab === 'home' ? '<div class="wp-wb-tabs"><b class="is-active">推荐</b><span>公开动态</span></div>' : ''}${state.tab === 'me' ? '' : searchMarkup('weibo', state, state.tab === 'hot' ? '搜索热搜、话题' : '搜索微博')}<main class="wp-wb-feed ${state.tab === 'hot' ? 'is-hot' : ''}">${hasHotTopics ? '<button type="button" class="wp-wb-hot-entry" data-social-tab="hot"><b>微博热搜</b><span>查看榜单 ›</span></button>' : ''}${body}</main>${weiboBottomNav(state.tab)}</div>`;
}

function noteCover(item) {
  if (item.imageUrl) return `<div class="wp-rn-cover is-image-note is-seed-${item.coverSeed}"><img src="${esc(item.imageUrl)}" alt="${esc(item.title || '笔记配图')}" loading="lazy" decoding="async"></div>`;
  return `<div class="wp-rn-cover is-text-note is-seed-${item.coverSeed}"><span>文字笔记</span><b>${esc(item.title || item.body || '一条公开记录')}</b></div>`;
}

function redNoteCard(item, snapshot, state) {
  const liked = Boolean(state.liked[item.id]);
  return `<article class="wp-rn-card"><button type="button" data-social-detail="${esc(item.id)}">${noteCover(item)}<div class="wp-rn-copy"><b>${esc(item.title || item.body || '公开记录')}</b></div></button><div class="wp-rn-foot"><span>${avatarLetter(item.author)}</span><b>${esc(item.author)}</b><button type="button" data-social-like="${esc(item.id)}" class="${liked ? 'is-active' : ''}" aria-label="${liked ? '取消点赞' : '点赞'}" aria-pressed="${liked}">${liked ? '♥' : '♡'}</button></div></article>`;
}

function redNoteDetail(item, snapshot, state) {
  const liked = Boolean(state.liked[item.id]);
  const saved = Boolean(state.saved[item.id]);
  const images = item.imageUrls?.length ? item.imageUrls : (item.imageUrl ? [item.imageUrl] : []);
  const media = images.length > 1
    ? `<div class="wp-rn-gallery" aria-label="笔记图片，共${images.length}张"><div class="wp-rn-gallery-track">${images.map((src, index) => `<figure class="wp-rn-gallery-slide"><img src="${esc(src)}" alt="${esc(item.title || '笔记配图')} ${index + 1}/${images.length}" loading="${index ? 'lazy' : 'eager'}" decoding="async"></figure>`).join('')}</div><span class="wp-rn-gallery-count">1/${images.length}</span></div>`
    : noteCover(item);
  return `<div class="wp-social-detail wp-rn-detail">
    <header class="wp-rn-detail-top">
      <button type="button" data-social-detail-back aria-label="返回笔记列表">‹</button>
      <span class="wp-rn-detail-avatar">${avatarLetter(item.author)}</span>
      <div><b>${esc(item.author)}</b><small>${esc(socialTimeLabel(item, snapshot))}</small></div>
      <button type="button" data-social-share="${esc(item.id)}" aria-label="分享笔记">↗</button>
    </header>
    <div class="wp-rn-detail-scroll">
      ${media}
      <article class="wp-rn-detail-copy">
        <h2>${esc(item.title || '公开记录')}</h2>
        ${item.body ? `<p>${esc(item.body)}</p>` : ''}
        <div class="wp-rn-tags">${item.tags.map((tag) => `<span># ${esc(tag)}</span>`).join('')}</div>
      </article>
      <section class="wp-social-comments" id="wp-rn-public-comments">
        <header><b>评论</b><span>${item.replies.length}</span></header>
        ${item.replies.length ? item.replies.map((reply) => `<div class="wp-social-comment"><span>${avatarLetter(reply.author)}</span><div><b>${esc(reply.author || '匿名')}</b><p>${esc(reply.text)}</p></div></div>`).join('') : emptyMarkup('还没有评论', '只显示世界里已经存在的公开回复。')}
      </section>
    </div>
    <footer class="wp-rn-detail-actions">
      <button type="button" class="wp-rn-comment-jump" data-social-comment-jump>◌ 查看评论</button>
      <button type="button" data-social-like="${esc(item.id)}" class="${liked ? 'is-active' : ''}" aria-pressed="${liked}" aria-label="${liked ? '取消点赞' : '点赞'}">${liked ? '♥' : '♡'}</button>
      <button type="button" data-social-save="${esc(item.id)}" class="${saved ? 'is-active' : ''}" aria-pressed="${saved}" aria-label="${saved ? '取消收藏' : '收藏'}">${saved ? '★' : '☆'}</button>
    </footer>
  </div>`;
}

function renderRedNoteMarkup(snapshot, state) {
  const items = buildRedNoteItems(snapshot);
  const detail = items.find((item) => item.id === state.detailId);
  if (detail) return redNoteDetail(detail, snapshot, state);
  const filtered = items.filter((item) => includesQuery(item, state.query));
  const profileView = state.profileView === 'liked' ? 'liked' : 'saved';
  const visible = state.tab === 'saved'
    ? filtered.filter((item) => state.saved[item.id])
    : state.tab === 'me'
      ? filtered.filter((item) => profileView === 'liked' ? state.liked[item.id] : state.saved[item.id])
      : filtered;
  const title = { discover: '发现', saved: '收藏', me: '我' }[state.tab] || '发现';
  const nav = [
    { id: 'discover', icon: '⌂', label: '发现' },
    { id: 'saved', icon: '☆', label: '收藏' },
    { id: 'me', icon: '◉', label: '我' },
  ].map((entry) => `<button type="button" data-social-tab="${entry.id}" class="${state.tab === entry.id ? 'is-active' : ''}" aria-current="${state.tab === entry.id ? 'page' : 'false'}"><span aria-hidden="true">${entry.icon}</span><b>${entry.label}</b></button>`).join('');
  const columns = [[], []];
  visible.forEach((item, index) => columns[index % 2].push(redNoteCard(item, snapshot, state)));
  const noteGrid = columns.map((cards) => `<div class="wp-rn-column">${cards.join('')}</div>`).join('');
  const profileTabs = state.tab === 'me'
    ? `<div class="wp-rn-profile-tabs" role="group" aria-label="我的笔记"><button type="button" data-social-profile="saved" class="${profileView === 'saved' ? 'is-active' : ''}" aria-pressed="${profileView === 'saved'}">收藏</button><button type="button" data-social-profile="liked" class="${profileView === 'liked' ? 'is-active' : ''}" aria-pressed="${profileView === 'liked'}">赞过</button></div>`
    : '';
  const emptyTitle = state.query ? '没有搜到相关笔记'
    : state.tab === 'saved' ? '收藏夹还是空的'
    : state.tab === 'me' ? (profileView === 'liked' ? '还没有赞过的笔记' : '还没有收藏的笔记')
    : '暂时没有公开内容';
  return `<div class="wp-rednote-shell" data-social-view="${esc(state.tab)}"><div class="wp-rn-topbar"><div class="wp-rn-heading"><b>${esc(title)}</b>${state.tab === 'discover' ? '<small>世界里的公开生活笔记</small>' : ''}</div>${searchMarkup('rednote', state, '搜索笔记')}</div>${state.tab === 'me' ? `<div class="wp-rn-profile"><span>${avatarLetter(snapshot.user || '你')}</span><div><b>${esc(snapshot.user || '你')}</b><small>收藏 ${Object.keys(state.saved).length} · 点赞 ${Object.keys(state.liked).length}</small></div></div>${profileTabs}` : ''}<main class="wp-rn-grid">${!snapshot.connected ? emptyMarkup('未插入世界背面 SIM', '发现页需要世界背面 SIM 提供公开世界素材。') : visible.length ? noteGrid : emptyMarkup(emptyTitle, state.query ? '换个关键词试试。' : '有真实公开内容后才会出现在这里。')}</main><nav class="wp-rn-bottom-nav" aria-label="小红书导航">${nav}</nav></div>`;
}

function enhanceWeChat(snapshot) {
  const app = document.querySelector('#world-phone-stage .wp-wx-app');
  if (!app) return;

  const chatContent = app.querySelector('.wp-wx-content');
  if (chatContent?.querySelector('.wp-wx-chat-row') && !chatContent.querySelector('[data-wxr-search]')) {
    const search = document.createElement('label');
    search.className = 'wp-wxr-search';
    search.dataset.wxrSearch = '1';
    search.innerHTML = '<span>⌕</span><input placeholder="搜索" autocomplete="off">';
    chatContent.prepend(search);
    const input = search.querySelector('input');
    input?.addEventListener('input', () => {
      const query = text(input.value).toLowerCase();
      chatContent.querySelectorAll('.wp-wx-chat-row').forEach((row) => {
        row.hidden = Boolean(query) && !text(row.innerText).toLowerCase().includes(query);
      });
    });
  }

  const registry = buildCommunicationRegistry(snapshot);
  app.querySelectorAll('.wp-wx-contact-row').forEach((row) => {
    if (row.dataset.wxrBound === '1') return;
    const name = text(row.querySelector('b')?.textContent);
    const person = registry.people.find((item) => item.personId === row.dataset.contactPerson) || registry.people.find((item) => item.name === name);
    if (!person) return;
    row.dataset.wxrBound = '1';
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    const open = () => showContactSheet(app, snapshot, person);
    row.addEventListener('click', open);
    row.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } });
  });

}

function showContactSheet(app, snapshot, person) {
  app.querySelector('.wp-wxr-contact-sheet')?.remove();
  const registry = buildCommunicationRegistry(snapshot);
  const full = registry.byPersonId.get(person.personId) || person;
  const direct = snapshot.conversations.find((conversation) => conversation.type === 'direct' && conversation.memberIds.includes(person.personId));
  const sheet = document.createElement('div');
  sheet.className = 'wp-wxr-contact-sheet';
  sheet.innerHTML = `<button type="button" class="wp-wxr-sheet-mask" data-wxr-close aria-label="关闭"></button><section><button type="button" class="wp-wxr-sheet-close" data-wxr-close>×</button><div class="wp-wxr-contact-head"><span>${avatarLetter(person.name)}</span><div><b>${esc(person.name)}</b>${person.subtitle ? `<small>${esc(person.subtitle)}</small>` : ''}</div></div><div class="wp-wxr-contact-info"><div><span>微信</span><b>${esc(full.channels?.wechat?.id || '已连接')}</b></div><div><span>手机</span><b>${esc(full.channels?.cellular?.number || '未记录')}</b></div></div>${direct ? `<button type="button" class="wp-wxr-primary" data-wxr-message="${esc(direct.id)}">发消息</button>` : `<button type="button" class="wp-wxr-primary" data-social-direct="${esc(person.personId)}">发起聊天</button>`}</section>`;
  app.append(sheet);
  sheet.querySelectorAll('[data-wxr-close]').forEach((button) => button.addEventListener('click', () => sheet.remove()));
  sheet.querySelector('[data-wxr-message]')?.addEventListener('click', (event) => {
    const id = event.currentTarget.dataset.wxrMessage;
    sheet.remove();
    app.dispatchEvent(new CustomEvent('world-phone:open-conversation', { bubbles: true, detail: { conversationId: id } }));
  });
}

export function mountSocialRealism({ phone } = {}) {
  let destroyed = false;
  let active = '';
  let routing = false;
  let refreshQueued = false;
  let paintedShell = null;
  let renderedMarkup = '';
  let snapshot = readWorldBackstage();
  let state = loadState();
  let scope = socialScope();
  const syncScope = () => { if (scope !== socialScope()) { scope = socialScope(); state = loadState(); tabScroll.weibo = {}; tabScroll.rednote = {}; } };
  const tabScroll = { weibo: {}, rednote: {} };

  function syncHome() {
    if (destroyed) return;
    const grid = document.querySelector('#world-phone-stage .wp-home [data-app-grid]');
    if (!grid) return;
    for (const meta of Object.values(APPS)) {
      if (!grid.querySelector(`[data-app="${meta.id}"]`)) grid.append(appButton(meta));
    }
  }

  function routeThroughShell(appId) {
    if (typeof phone?.openApp === 'function') {
      phone.openApp(appId);
      return true;
    }
    const home = document.querySelector('#world-phone-stage .wp-home');
    const bridge = home?.querySelector('[data-app="settings"]') || home?.querySelector('[data-app]:not([data-social-realism-managed="1"])');
    if (!bridge) return false;
    const original = bridge.dataset.app;
    routing = true;
    try {
      bridge.dataset.app = appId;
      bridge.click();
    } finally {
      bridge.dataset.app = original;
      routing = false;
    }
    return true;
  }

  function open(appId) {
    syncScope();
    active = appId;
    saveState(state);
    if (routeThroughShell(appId)) window.setTimeout(queueRefresh, 0);
  }

  // RedNote scrolls its note grid independently so its navigation stays visible.
  const feedScroller = (shell) => socialFeedScroller(active, shell);

  function paint(preserveScroll = false, options = {}) {
  if (destroyed) return;
  if (readPhoneGameMode() === 'game') { active = ''; return; }
  enhanceWeChat(snapshot);
  if (typeof phone?.current === 'function') {
    const appId = phone.current().replace(/^app:/, '');
    active = Object.hasOwn(APPS, appId) ? appId : '';
  }
  if (!active) return;
  const section = document.querySelector('#world-phone-stage .wp-native-app');
  if (!section) return;
  const old = section.querySelector('.wp-placeholder-card, .wp-social-shell');
  if (!old) return;
  const markup = active === 'weibo' ? renderWeiboMarkup(snapshot, state.weibo) : renderRedNoteMarkup(snapshot, state.rednote);
  section.classList.add('wp-social-realism-app', `is-${active}`);
  headerCopy(section, active === 'weibo' ? (state.weibo.detailId ? '微博正文' : { home: '微博', hot: '发现', me: '我' }[state.weibo.tab]) : '小红书', active === 'weibo' ? '' : snapshot.connected ? 'SIM 已插入 · 世界公开网络' : '未插入世界背面 SIM');
  if (preserveScroll && old === paintedShell && markup === renderedMarkup) return;
  const focused = old.querySelector('[data-social-search] input:focus');
  const selection = focused ? [focused.selectionStart, focused.selectionEnd] : null;
  const previousScrollTop = Number.isFinite(options.scrollTop)
    ? options.scrollTop : preserveScroll ? (feedScroller(old)?.scrollTop || 0) : 0;
  const oldGallery = old.querySelector('.wp-rn-gallery-track');
  const galleryOffset = preserveScroll && oldGallery?.clientWidth ? oldGallery.scrollLeft / oldGallery.clientWidth : 0;
  old.className = 'wp-social-shell';
  paintedShell = old;
  renderedMarkup = markup;
  old.innerHTML = markup;
  const nextScroller = feedScroller(old);
  if (nextScroller) nextScroller.scrollTop = previousScrollTop;
  const nextGallery = old.querySelector('.wp-rn-gallery-track');
  if (nextGallery && galleryOffset) nextGallery.scrollLeft = galleryOffset * nextGallery.clientWidth;
  bind(section);
  if (selection) { const input = old.querySelector('[data-social-search] input'); input?.focus({preventScroll:true}); input?.setSelectionRange(...selection); }
  if (options.direction && !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches && typeof old.animate === 'function') {
    old.animate([{ opacity: .55, transform: `translateX(${options.direction * 12}px)` }, { opacity: 1, transform: 'translateX(0)' }], { duration: 170, easing: 'cubic-bezier(.2,.75,.25,1)' });
  }
}

function mutate(mutator, options = {}) {
  if (!active) return;
  mutator(state[active]);
  state = sanitizeSocialRealismState(state);
  saveState(state);
  paint(options.preserveScroll ?? true, options);
}

  function bind(section) {
    section.querySelectorAll('[data-social-profile]').forEach((button) => button.addEventListener('click', () => {
      mutate((bucket) => { bucket.profileView = button.dataset.socialProfile; }, { preserveScroll: false });
    }));
    section.querySelector('[data-social-comment-jump]')?.addEventListener('click', () => {
      section.querySelector('.wp-rn-detail-scroll .wp-social-comments')?.scrollIntoView({ block: 'start', behavior: 'auto' });
    });
    const galleryTrack = section.querySelector('.wp-rn-gallery-track');
    const galleryCount = section.querySelector('.wp-rn-gallery-count');
    if (galleryTrack && galleryCount) {
      const slides = galleryTrack.querySelectorAll('.wp-rn-gallery-slide');
      let galleryFrame = 0;
      const syncGalleryCount = () => {
        galleryFrame = 0;
        const index = redNoteGalleryIndex(galleryTrack.scrollLeft, galleryTrack.clientWidth, slides.length);
        galleryCount.textContent = `${index + 1}/${slides.length}`;
      };
      galleryTrack.addEventListener('scroll', () => {
        if (galleryFrame) return;
        galleryFrame = requestAnimationFrame(syncGalleryCount);
      }, { passive: true });
      syncGalleryCount();
    }
    section.querySelectorAll('[data-social-share]').forEach((button) => {
      const canShare = typeof phone?.shareContent === 'function';
      if (!canShare) {
        button.disabled = true;
        button.setAttribute('aria-disabled', 'true');
        button.title = '当前宿主暂不支持转发';
        const label = button.querySelector('svg') ? '暂不可转发' : '↗ 暂不可转发';
        if (button.querySelector('svg')) {
          const svg = button.querySelector('svg');
          button.replaceChildren(svg, document.createTextNode(label));
        } else {
          button.textContent = label;
        }
        return;
      }
      button.addEventListener('click', () => {
        const items = active === 'weibo' ? buildWeiboItems(snapshot) : buildRedNoteItems(snapshot);
        const item = items.find(item => item.id === button.dataset.socialShare);
        if (item) phone.shareContent({ headline: item.title, summary: item.body, source: item.author });
      });
    });
    section.querySelector('[data-social-search] input')?.addEventListener('input', (event) => {
      if (!active || !state[active]) return;
      state[active].query = String(event.target.value || '').slice(0, 80);
      saveState(state);
    });
    section.querySelectorAll('[data-social-tab]').forEach((button) => button.addEventListener('click', () => {
      const nextTab = button.dataset.socialTab; const previousTab = state[active]?.tab;
      if (!nextTab || !previousTab || nextTab === previousTab) return;
      const shell = section.querySelector('.wp-social-shell');
      tabScroll[active][previousTab] = feedScroller(shell)?.scrollTop || 0;
      const order = active === 'weibo' ? ['home', 'hot', 'me'] : ['discover', 'saved', 'me'];
      const direction = Math.sign(order.indexOf(nextTab) - order.indexOf(previousTab)) || 1;
      mutate((draft) => { draft.tab = nextTab; draft.detailId = ''; }, { preserveScroll: false, scrollTop: tabScroll[active][nextTab] || 0, direction });
    }));
    section.querySelector('[data-social-clear]')?.addEventListener('click', () => mutate((draft) => { draft.query = ''; draft.detailId = ''; }, { preserveScroll: false }));
    section.querySelectorAll('[data-social-detail]').forEach((button) => button.addEventListener('click', () => {
      const shell = section.querySelector('.wp-social-shell');
      tabScroll[active][state[active].tab] = feedScroller(shell)?.scrollTop || 0;
      mutate((draft) => { draft.detailId = button.dataset.socialDetail; }, { preserveScroll: false });
    }));
    section.querySelector('[data-social-detail-back]')?.addEventListener('click', () => mutate((draft) => {
      draft.detailId = '';
    }, { preserveScroll: false, scrollTop: tabScroll[active][state[active].tab] || 0 }));
    section.querySelectorAll('[data-social-like]').forEach((button) => button.addEventListener('click', () => mutate((draft) => {
      const id = button.dataset.socialLike;
      if (draft.liked[id]) delete draft.liked[id]; else draft.liked[id] = true;
    })));
    section.querySelectorAll('[data-social-save]').forEach((button) => button.addEventListener('click', () => mutate((draft) => {
      const id = button.dataset.socialSave;
      if (draft.saved[id]) delete draft.saved[id]; else draft.saved[id] = true;
    })));
  }

  function queueRefresh() {
    if (destroyed || refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(() => {
      refreshQueued = false;
      syncScope();
      snapshot = readWorldBackstage();
      syncHome();
      paint(true);
    });
  }

  const runSearchFromInput = (input) => {
    const form = input?.closest?.('[data-social-search]');
    if (!form || !active || form.dataset.socialSearch !== active) return;
    mutate((draft) => { draft.query = input.value || ''; draft.detailId = ''; });
  };

  const clickHandler = (event) => {
    const searchButton = event.target?.closest?.('#world-phone-stage .wp-social-realism-app [data-social-search] button[type="submit"]');
    if (searchButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      runSearchFromInput(searchButton.closest('form')?.querySelector('input'));
      return;
    }
    const managed = event.target?.closest?.('[data-social-realism-managed="1"]');
    if (managed) {
      event.preventDefault();
      event.stopImmediatePropagation();
      open(managed.dataset.app);
      return;
    }
    const back = event.target?.closest?.('#world-phone-stage .wp-social-realism-app [data-app-back]');
    if (back) active = '';
    const otherApp = event.target?.closest?.('#world-phone-stage .wp-home [data-app]');
    if (otherApp && !otherApp.dataset.socialRealismManaged && !routing) active = '';
  };

  const keydownHandler = (event) => {
    const input = event.target?.closest?.('#world-phone-stage .wp-social-realism-app [data-social-search] input');
    if (!input || event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    runSearchFromInput(input);
  };

  document.addEventListener('click', clickHandler, true);
  document.addEventListener('keydown', keydownHandler, true);
  const observer = new MutationObserver((records) => {
    if (mutationNeedsRefresh(records)) queueRefresh();
  });
  const observerRoot = document.querySelector('#world-phone-stage [data-screen]') || document.querySelector('#world-phone-stage');
  if (observerRoot) observer.observe(observerRoot, { childList: true, subtree: true });
  const unsubscribe = subscribeWorldBackstage((next) => { snapshot = next; window.setTimeout(queueRefresh, 0); });
  const poll = window.setInterval(() => {
    if (!active) queueRefresh();
  }, 3500);
  queueRefresh();

  return () => {
    destroyed = true;
    document.removeEventListener('click', clickHandler, true);
    document.removeEventListener('keydown', keydownHandler, true);
    observer.disconnect();
    unsubscribe?.();
    window.clearInterval(poll);
  };
}

export { STORAGE_KEY as SOCIAL_REALISM_STORAGE_KEY, renderWeiboMarkup, renderRedNoteMarkup };
