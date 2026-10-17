// Pure presentation shared by world-linked and independent social feeds.
// Receives prepared items only; never reads a host, invokes a model, or writes state.
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

function text(value) {
  return String(value ?? '').trim();
}

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
  if (item.timeLabel) return text(item.timeLabel);
  const nowMinute = Number(snapshot?.clock?.absoluteMinute) || 0;
  const publishedMinute = Number(item?.publishedWorldMinute);
  const worldMinute = Number.isFinite(publishedMinute) && publishedMinute >= 0 ? publishedMinute : Number(item?.worldMinute) || 0;
  if (nowMinute > 0 && worldMinute > 0 && nowMinute >= worldMinute) {
    const delta = nowMinute - worldMinute;
    if (delta < 1) return '刚刚';
    if (delta < 60) return `${delta}分钟前`;
    if (delta < 24 * 60) return `${Math.floor(delta / 60)}小时前`;
    if (delta < 7 * 24 * 60) return `${Math.floor(delta / (24 * 60))}天前`;
  }
  const value = text(item?.publishedAt || item?.createdAt) || stamp(item);
  if (!value) return '时间未记录';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 16);
  return date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

function updatedLabel(item) {
  const published = Number(item.publishedWorldMinute);
  const minuteChanged = Number.isFinite(published) && published >= 0 && Number(item.worldMinute) > published;
  const stampChanged = Date.parse(item.updatedAt) > Date.parse(item.publishedAt);
  return minuteChanged || stampChanged ? ' · 有更新' : '';
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

function includesQuery(item, query) {
  const q = text(query).toLowerCase();
  if (!q) return true;
  return [item.author, item.title, item.body, item.scope, ...(item.tags || []), ...(item.replies || []).flatMap(reply => [reply.author, reply.text])]
    .some((value) => text(value).toLowerCase().includes(q));
}

// The social feed is the scrollport; RedNote's detail screen still uses the outer shell.
function avatarLetter(name) {
  return esc(text(name).slice(0, 1) || '世');
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
    <div class="wp-wb-author"><span>${avatarLetter(item.author)}</span><div><b>${esc(item.author)}${item.verified ? '<i>✓</i>' : ''}</b><small>${esc(socialTimeLabel(item, snapshot))}${updatedLabel(item)}${item.scope ? ` · ${esc(item.scope)}` : ''}</small></div></div>
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

function weiboDetail(item, snapshot, state, copy = {}) {
  const liked = Boolean(state.liked[item.id]);
  const saved = Boolean(state.saved[item.id]);
  return `<div class="wp-social-detail wp-wb-detail">
    <button type="button" class="wp-social-inline-back" data-social-detail-back>‹ 返回</button>
    ${weiboCard(item, snapshot, state, true)}
    <section class="wp-social-comments"><header><b>评论与相关讨论</b><span>${item.replies.length}</span></header>
      ${item.replies.length ? item.replies.map((reply) => `<div class="wp-social-comment"><span>${avatarLetter(reply.author)}</span><div><b>${esc(reply.author || '匿名')}${reply.board ? `<small> · ${esc(reply.board)}</small>` : ''}</b><p>${esc(reply.text)}</p></div></div>`).join('') : emptyMarkup(copy.commentsTitle || '还没有公开讨论', copy.commentsBody || '有公开回复时会显示在这里。')}
    </section>
    <div class="wp-social-detail-bar"><button type="button" data-social-share="${esc(item.id)}" aria-label="转发微博">↗ 转发</button><button type="button" data-social-save="${esc(item.id)}" class="${saved ? 'is-active' : ''}" aria-pressed="${saved}" aria-label="${saved ? '取消收藏' : '收藏'}">${saved ? '★ 已收藏' : '☆ 收藏'}</button><button type="button" data-social-like="${esc(item.id)}" class="${liked ? 'is-active' : ''}" aria-pressed="${liked}" aria-label="${liked ? '取消赞' : '赞'}">${liked ? '♥ 已赞' : '♡ 赞'}</button></div>
  </div>`;
}

function weiboHotMarkup(items, snapshot, copy = {}) {
  const ranked = buildWeiboHotItems(items);
  if (!ranked.length) return emptyMarkup('暂时没有热搜', copy.hotEmpty || '世界里出现带热度的公开话题后会排到这里。');
  return `<section class="wp-wb-hot-section"><header class="wp-wb-hot-head"><b>微博热搜</b><small>${esc(copy.hotHint || '来自已公开的世界话题')}</small></header><div class="wp-wb-hot-list">${ranked.map((item, index) => `<button type="button" class="wp-wb-hot-row" data-social-detail="${esc(item.id)}"><strong>${index + 1}</strong><span><b>${esc(item.title || item.body || '公开话题')}</b><small>${esc(item.author)} · ${esc(socialTimeLabel(item, snapshot))}${updatedLabel(item)} · ${item.sourceCount} 个公开来源</small></span><i>${item.heat}</i></button>`).join('')}</div></section>`;
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

export function renderWeiboMarkup(snapshot, state, items = [], copy = {}) {
  const detail = items.find((item) => item.id === state.detailId);
  if (detail) return weiboDetail(detail, snapshot, state, copy);
  const filtered = items.filter((item) => includesQuery(item, state.query))
    .filter(item => state.tab !== 'home' || state.feedFilter !== 'following' || item.raw?.sourceKind === 'moment');
  const body = state.tab === 'me' ? weiboProfile(snapshot, state, items)
    : !snapshot.connected ? emptyMarkup('暂时无法连接微博', '请在手机设置中连接世界背面 SIM。')
    : state.tab === 'hot' ? weiboHotMarkup(filtered, snapshot, copy)
    : filtered.length ? filtered.map((item) => weiboCard(item, snapshot, state)).join('')
    : emptyMarkup(state.query ? '没有搜到' : state.feedFilter === 'following' ? '好友还没有新动态' : (copy.emptyTitle || '暂时没有公开内容'), state.query ? '换个关键词试试。' : (copy.emptyBody || '世界里的公开动态会显示在这里。'));
  const hasHotTopics = snapshot.connected && state.tab === 'home' && buildWeiboHotItems(items).length > 0;
  return `<div class="wp-weibo-shell" data-social-view="${esc(state.tab)}">${state.tab === 'home' ? `<div class="wp-wb-tabs" aria-label="微博信息流"><button type="button" data-social-filter="all" aria-pressed="${state.feedFilter !== 'following'}" class="${state.feedFilter !== 'following' ? 'is-active' : ''}">推荐</button><button type="button" data-social-filter="following" aria-pressed="${state.feedFilter === 'following'}" class="${state.feedFilter === 'following' ? 'is-active' : ''}">好友</button></div>` : ''}${state.tab === 'me' ? '' : searchMarkup('weibo', state, state.tab === 'hot' ? '搜索热搜、话题' : '搜索微博')}<main class="wp-wb-feed ${state.tab === 'hot' ? 'is-hot' : ''}">${hasHotTopics ? '<button type="button" class="wp-wb-hot-entry" data-social-tab="hot"><b>微博热搜</b><span>查看榜单 ›</span></button>' : ''}${body}</main>${weiboBottomNav(state.tab)}</div>`;
}

function noteCover(item) {
  if (item.imageUrl) return `<div class="wp-rn-cover is-image-note is-seed-${item.coverSeed}"><img src="${esc(item.imageUrl)}" alt="${esc(item.title || '笔记配图')}" loading="lazy" decoding="async"></div>`;
  return `<div class="wp-rn-cover is-text-note is-seed-${item.coverSeed}"><span>生活手记</span><b>${esc(item.title || '随手记下')}</b><p>${esc(text(item.body).slice(0, 90))}</p></div>`;
}

function redNoteCard(item, snapshot, state) {
  const liked = Boolean(state.liked[item.id]);
  return `<article class="wp-rn-card" data-social-item="${esc(item.id)}"><button type="button" data-social-detail="${esc(item.id)}">${noteCover(item)}<div class="wp-rn-copy">${item.imageUrl ? `<b>${esc(item.title || item.body || '公开记录')}</b>` : ''}<small>${esc(socialTimeLabel(item, snapshot))}${updatedLabel(item)}${item.imageUrls?.length > 1 ? ` · ${item.imageUrls.length} 张图` : ''}</small></div></button><div class="wp-rn-foot"><span>${avatarLetter(item.author)}</span><b>${esc(item.author)}</b><button type="button" data-social-like="${esc(item.id)}" class="${liked ? 'is-active' : ''}" aria-label="${liked ? '取消点赞' : '点赞'}" aria-pressed="${liked}">${liked ? '♥' : '♡'}</button></div></article>`;
}

function redNoteDetail(item, snapshot, state, copy = {}) {
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
      <div><b>${esc(item.author)}</b><small>${esc(socialTimeLabel(item, snapshot))}${updatedLabel(item)}</small></div>
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
        ${item.replies.length ? item.replies.map((reply) => `<div class="wp-social-comment"><span>${avatarLetter(reply.author)}</span><div><b>${esc(reply.author || '匿名')}</b><p>${esc(reply.text)}</p></div></div>`).join('') : emptyMarkup(copy.commentsTitle || '还没有评论', copy.commentsBody || '只显示世界里已经存在的公开回复。')}
      </section>
    </div>
    <footer class="wp-rn-detail-actions">
      <button type="button" class="wp-rn-comment-jump" data-social-comment-jump>◌ 查看评论</button>
      <button type="button" data-social-like="${esc(item.id)}" class="${liked ? 'is-active' : ''}" aria-pressed="${liked}" aria-label="${liked ? '取消点赞' : '点赞'}">${liked ? '♥' : '♡'}</button>
      <button type="button" data-social-save="${esc(item.id)}" class="${saved ? 'is-active' : ''}" aria-pressed="${saved}" aria-label="${saved ? '取消收藏' : '收藏'}">${saved ? '★' : '☆'}</button>
    </footer>
  </div>`;
}

export function renderRedNoteMarkup(snapshot, state, items = [], copy = {}) {
  const detail = items.find((item) => item.id === state.detailId);
  if (detail) return redNoteDetail(detail, snapshot, state, copy);
  const categoryPatterns = { food: /美食|餐厅|咖啡|探店|烤饼|吃喝|饮品/, travel: /旅行|游玩|景点|住宿|出行|公园|散步/, daily: /日常|生活|宠物|猫|狗|手作|校园|阅读/ };
  const filtered = items.filter((item) => includesQuery(item, state.query))
    .filter(item => state.tab !== 'discover' || !categoryPatterns[state.category] || categoryPatterns[state.category].test([item.title, item.body, item.scope, item.author].join(' ')));
  const categories = state.tab === 'discover' ? `<nav class="wp-rn-categories" aria-label="笔记分类">${[['all','全部'],['food','美食'],['travel','出行'],['daily','日常']].map(([id,label]) => `<button type="button" data-note-category="${id}" aria-pressed="${(state.category || 'all') === id}" class="${(state.category || 'all') === id ? 'is-active' : ''}">${label}</button>`).join('')}</nav>` : '';
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
    : (copy.emptyTitle || '暂时没有公开内容');
  return `<div class="wp-rednote-shell" data-social-view="${esc(state.tab)}"><div class="wp-rn-topbar"><div class="wp-rn-heading"><b>${esc(title)}</b>${state.tab === 'discover' ? '<small>逛逛大家的生活</small>' : ''}</div>${searchMarkup('rednote', state, '搜索笔记')}${categories}</div>${state.tab === 'me' ? `<div class="wp-rn-profile"><span>${avatarLetter(snapshot.user || '你')}</span><div><b>${esc(snapshot.user || '你')}</b><small>收藏 ${Object.keys(state.saved).length} · 点赞 ${Object.keys(state.liked).length}</small></div></div>${profileTabs}` : ''}<main class="wp-rn-grid">${!snapshot.connected ? emptyMarkup('未插入世界背面 SIM', '发现页需要世界背面 SIM 提供公开世界素材。') : visible.length ? noteGrid : emptyMarkup(emptyTitle, state.query ? '换个关键词试试。' : (copy.emptyBody || '有真实公开内容后才会出现在这里。'))}</main><nav class="wp-rn-bottom-nav" aria-label="小红书导航">${nav}</nav></div>`;
}

