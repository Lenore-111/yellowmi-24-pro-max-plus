import { renderWeiboMarkup as sharedWeiboMarkup, renderRedNoteMarkup as sharedRedNoteMarkup, socialTimeLabel, buildWeiboHotItems } from './social-feed-ui.js';
export { socialTimeLabel, buildWeiboHotItems } from './social-feed-ui.js';
import { readSocialBucket, writeSocialBucket, socialScope } from './social-storage.js';
import { buildCommunicationRegistry } from './communication-registry.js';
import { readWorldBackstage, subscribeWorldBackstage, refreshWorldBackstagePublicOpinion } from './world-backstage-bridge.js';
import { readPhoneGameMode, capturePhoneGameScope, isPhoneGameScopeCurrent, subscribePhoneGameModeChange } from './phone-game.js?v=0.3.0-alpha.28';

import { readPhoneFeedStatus, setPhoneFeedStatus, paintPhoneFeedStatus, PHONE_FEED_STATUS_EVENT } from './world-phone-feed-status.js';

import { createSocialFeedReader } from './social-feed-reader.js';

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
      feedFilter: raw.feedFilter === 'following' ? 'following' : 'all',
      category: ['food', 'travel', 'daily'].includes(raw.category) ? raw.category : 'all',
    };
  };
  return {
    weibo: { ...cleanBucket(source.weibo, ['home', 'hot', 'me'], 'home'), profileView: source.weibo?.profileView === 'liked' ? 'liked' : 'saved' },
    rednote: { ...cleanBucket(source.rednote, ['discover', 'saved', 'me'], 'discover'), profileView: source.rednote?.profileView === 'liked' ? 'liked' : 'saved' },
  };
}

function loadState() { return sanitizeSocialRealismState(readSocialBucket(STORAGE_KEY)); }
function saveState(state) { writeSocialBucket(STORAGE_KEY, sanitizeSocialRealismState(state)); }

function renderWeiboMarkup(snapshot, state) { return sharedWeiboMarkup(snapshot, state, buildWeiboItems(snapshot)); }
function renderRedNoteMarkup(snapshot, state) { return sharedRedNoteMarkup(snapshot, state, buildRedNoteItems(snapshot)); }

function stamp(item) {
  return text(item.updatedAt || item.publishedAt || item.createdAt || item.raw?.createdAt || item.raw?.created_at);
}

function itemSortValue(item) {
  const minute = Number(item.worldMinute) || 0;
  if (minute) return minute * 60_000;
  const parsed = Date.parse(stamp(item));
  return Number.isFinite(parsed) ? parsed : 0;
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
    publishedWorldMinute: item.publishedWorldMinute ?? item.worldMinute,
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
    scope: item.scope || ({ fact: '公开记录', mixed: '网友讨论', rumor: '坊间传闻' }[item.claimStatus]) || '网友讨论',
    heat: Math.max(0, Number(item.heat) || 0),
    replies: item.replies || [],
    relatedEventId: item.relatedEventId || '',
    worldMinute: Number(item.worldMinute) || 0,
    publishedWorldMinute: item.publishedWorldMinute ?? item.worldMinute,
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

export function buildRedNoteItems(snapshot = {}) {
  const forums = (snapshot.forums || []).filter(redNoteFriendlyForum).map((item) => ({
    id: `forum:${item.id}`, sourceId: item.id, kind: 'forum', author: item.board || '公开记录', verified: false,
    title: item.title, body: item.summary, scope: item.scope || ({ fact: '公开记录', mixed: '网友讨论', rumor: '坊间传闻' }[item.claimStatus]) || '网友讨论', heat: Math.max(0, Number(item.heat) || 0),
    replies: item.replies || [], relatedEventId: item.relatedEventId || '', worldMinute: Number(item.worldMinute) || 0,
    publishedWorldMinute: item.publishedWorldMinute ?? item.worldMinute,
    publishedAt: item.publishedAt || '', updatedAt: item.updatedAt || '', imageUrl: firstImage(item.raw), imageUrls: imageList(item.raw), raw: item.raw,
  }));
  const news = (snapshot.news || []).filter(redNoteFriendlyNews).map((item) => ({
    id: `news:${item.id}`, sourceId: item.id, kind: 'news', author: item.source || item.category || '公开记录',
    verified: item.sourceType === 'official', title: item.headline, body: item.summary,
    scope: item.scope || item.area || item.category || '', heat: Math.max(0, Number(item.heat) || 0),
    replies: relatedForumReplies(snapshot, item.relatedEventId), relatedEventId: item.relatedEventId || '', worldMinute: Number(item.worldMinute) || 0,
    publishedWorldMinute: item.publishedWorldMinute ?? item.worldMinute,
    publishedAt: item.publishedAt || item.createdAt || '', updatedAt: item.updatedAt || '', imageUrl: firstImage(item.raw), imageUrls: imageList(item.raw), raw: item.raw,
  }));
  return [...forums, ...news].filter((item) => text(item.title) || text(item.body))
    .sort((x, y) => itemSortValue(y) - itemSortValue(x)).map((item) => ({
      ...item, noteId: `note:${item.id}`, tags: noteTags(item),
      coverSeed: Math.abs([...item.id].reduce((sum, char) => sum + char.charCodeAt(0), 0)) % 6,
    }));
}

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
  let opinionRefresh = null;
  let awaitingInitialSync = '';
  let snapshot = readWorldBackstage();
  let state = loadState();
  let scope = socialScope();
  let scopeKey = '';
  const itemsFor = (app, value) => app === 'weibo' ? buildWeiboItems(value) : buildRedNoteItems(value);
  const reader = createSocialFeedReader(itemsFor);
  let displaySnapshot = snapshot;
  const syncScope = () => {
    const gameScope = capturePhoneGameScope();
    const nextKey = JSON.stringify([gameScope.key, gameScope.modeEpoch, readWorldBackstage().branchKey]);
    if (scope !== socialScope() || scopeKey !== nextKey) {
      scope = socialScope(); scopeKey = nextKey; state = loadState(); reader.clear();
      tabScroll.weibo = {}; tabScroll.rednote = {}; paintedShell = null;
    }
  };
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
  if (readPhoneGameMode() === 'game') {
    const oldWorld = [...document.querySelectorAll('#world-phone-stage .wp-social-realism-app')]
      .find(section => section.getAttribute('data-phone-game-app') === null);
    const oldFeed = oldWorld?.querySelector('.wp-social-shell');
    if (oldFeed) oldFeed.innerHTML = '';
    oldWorld?.querySelector('[data-social-incoming]')?.remove();
    oldWorld?.querySelector('[data-phone-feed-status]')?.remove();
    reader.clear(); active = ''; paintedShell = null; return;
  }
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
  const newView = old !== paintedShell;
  if (newView) awaitingInitialSync = active;
  const view = reader.select(active, snapshot, { newView, accept: options.acceptIncoming });
  displaySnapshot = view.snapshot;
  if (state[active].detailId && !itemsFor(active, displaySnapshot).some(item => item.id === state[active].detailId)) {
    state[active].detailId = ''; saveState(state);
  }
  const markup = active === 'weibo' ? renderWeiboMarkup(displaySnapshot, state.weibo) : renderRedNoteMarkup(displaySnapshot, state.rednote);
  paintIncomingNotice(section, view);
  if (options.background && old === paintedShell && !view.displayChanged) { bindOpinionRefresh(section); return; }
  section.classList.add('wp-social-realism-app', `is-${active}`);
  headerCopy(section, active === 'weibo' ? (state.weibo.detailId ? '微博正文' : { home: '微博', hot: '发现', me: '我' }[state.weibo.tab]) : '小红书', active === 'weibo' ? '' : snapshot.connected ? '世界里的日常' : '暂未连接');
  if (preserveScroll && old === paintedShell && markup === renderedMarkup) { bindOpinionRefresh(section); return; }
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

  function paintIncomingNotice(section, view) {
    let notice = section.querySelector('[data-social-incoming]');
    if (!view.added && !view.updated) { notice?.remove(); return; }
    if (!notice) {
      notice = document.createElement('button'); notice.type = 'button';
      notice.dataset.socialIncoming = '1'; notice.className = 'wp-feed-incoming';
      notice.setAttribute('aria-live', 'polite'); section.append(notice);
    }
    const label = [view.added ? `有 ${view.added} 条新动态` : '', view.updated ? `${view.updated} 条内容有更新` : ''].filter(Boolean).join(' · ');
    if (notice.textContent !== label) notice.textContent = label;
    notice.onclick = () => paint(true, { acceptIncoming: true, scrollTop: state[active]?.detailId ? undefined : 0 });
  }

  function bindOpinionRefresh(section) {
    const header = section.querySelector('.wp-app-header');
    if (header) {
      let refreshButton = header.querySelector('[data-social-opinion-refresh]');
      if (!refreshButton) {
        refreshButton = document.createElement('button');
        refreshButton.type = 'button';
        refreshButton.dataset.socialOpinionRefresh = '1';
        (header.querySelector('span') || header).append(refreshButton);
      }
      const opened = capturePhoneGameScope(), openedSocialScope = socialScope(), openedApp = active;
      const current = () => !destroyed && readPhoneGameMode() === 'world'
        && isPhoneGameScopeCurrent(opened) && socialScope() === openedSocialScope
        && active === openedApp && phone?.current?.() === `app:${openedApp}`
        && document.querySelector('#world-phone-stage .wp-native-app') === section;
      const busy = opinionRefresh && isPhoneGameScopeCurrent(opinionRefresh.scope)
        && opinionRefresh.socialScope === openedSocialScope;
      const feedStatus = readPhoneFeedStatus(active);
      refreshButton.disabled = Boolean(busy || feedStatus.phase === 'loading' || !snapshot.connected);
      refreshButton.textContent = busy || feedStatus.phase === 'loading' ? '正在更新…' : '刷新动态';
      paintPhoneFeedStatus(section, active, { connected: snapshot.connected, onRetry: () => refreshButton.click() });
      refreshButton.onclick = async () => {
        if (!current() || refreshButton.disabled) return;
        const task = { scope: opened, socialScope: openedSocialScope };
        opinionRefresh = task;
        setPhoneFeedStatus(openedApp, 'loading');
        refreshButton.disabled = true;
        refreshButton.textContent = '正在刷新…';
        section.querySelector('[data-social-opinion-error]')?.remove();
        try {
          const next = await refreshWorldBackstagePublicOpinion();
          if (current()) { snapshot = next; setPhoneFeedStatus(openedApp, 'synced'); paint(true); }
        } catch (error) {
          if (current()) {
            setPhoneFeedStatus(openedApp, 'error', error.message);
          }
        } finally {
          if (opinionRefresh === task) opinionRefresh = null;
          if (!destroyed && readPhoneGameMode() === 'world' && isPhoneGameScopeCurrent(opened)
            && socialScope() === openedSocialScope) queueRefresh();
        }
      };
    }
  }

  function bind(section) {
    bindOpinionRefresh(section);
    section.querySelectorAll('[data-social-filter]').forEach(button => button.addEventListener('click', () => {
      mutate(bucket => { bucket.feedFilter = button.dataset.socialFilter; }, { preserveScroll: false });
    }));
    section.querySelectorAll('[data-note-category]').forEach(button => button.addEventListener('click', () => {
      mutate(bucket => { bucket.category = button.dataset.noteCategory; }, { preserveScroll: false });
    }));
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
        const items = itemsFor(active, displaySnapshot);
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
      paint(true, { background: true });
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
  const onFeedStatus = () => {
    const section = document.querySelector('#world-phone-stage .wp-social-realism-app');
    if (section && active) {
      if (awaitingInitialSync === active && readPhoneFeedStatus(active).phase === 'synced') {
        awaitingInitialSync = '';
        const scroller = feedScroller(section.querySelector('.wp-social-shell'));
        const reading = state[active].detailId || state[active].query || (scroller?.scrollTop || 0) > 1
          || section.contains(document.activeElement);
        if (!reading) { snapshot = readWorldBackstage(); paint(true, { acceptIncoming: true }); return; }
      }
      bindOpinionRefresh(section);
    }
  };
  globalThis.addEventListener?.(PHONE_FEED_STATUS_EVENT, onFeedStatus);
  const unsubscribe = subscribeWorldBackstage((next) => { snapshot = next; window.setTimeout(queueRefresh, 0); });
  const unsubscribeMode = subscribePhoneGameModeChange(queueRefresh);
  const poll = window.setInterval(() => {
    if (!active) queueRefresh();
  }, 3500);
  queueRefresh();

  return () => {
    destroyed = true;
    document.removeEventListener('click', clickHandler, true);
    document.removeEventListener('keydown', keydownHandler, true);
    observer.disconnect();
    globalThis.removeEventListener?.(PHONE_FEED_STATUS_EVENT, onFeedStatus);
    unsubscribe?.();
    unsubscribeMode?.();
    window.clearInterval(poll);
  };
}

export { STORAGE_KEY as SOCIAL_REALISM_STORAGE_KEY, renderWeiboMarkup, renderRedNoteMarkup };
