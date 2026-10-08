import { readPhoneTheme, themeWallpaper, disableThemeWallpaper, THEME_CHANGE_EVENT } from './phone-themes.js';
import { readLocalImages, importLocalImage, setLocalWallpaper, deleteLocalImage, resetLocalWallpaper } from './local-images.js';
import { readSocialBucket, writeSocialBucket, socialScope } from './social-storage.js';
import { readWorldBackstage, subscribeWorldBackstage } from './world-backstage-bridge.js';

const STORAGE_KEY = 'world_phone_utility_realism_v1';
const UTILITY_APPS = new Set(['gallery', 'browser']);

function text(value) {
  return String(value ?? '').trim();
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

function validImage(value) {
  const src = text(value);
  return /^(?:https?:\/\/|data:image\/|blob:|\/(?!\/)|\.\/)/i.test(src) ? src : '';
}

function rawImage(raw) {
  const value = raw?.imageUrl ?? raw?.image_url ?? raw?.coverUrl ?? raw?.cover_url
    ?? raw?.thumbnailUrl ?? raw?.thumbnail_url ?? raw?.image;
  if (Array.isArray(value)) return validImage(value[0]);
  return validImage(value);
}

function defaultState() {
  return {
    gallery: { tab: 'all', detailId: '', favorites: {} },
    browser: { tab: 'home', query: '', pageId: '', history: [], bookmarks: {} },
  };
}

export function sanitizeUtilityRealismState(value) {
  const source = value && typeof value === 'object' ? value : {};
  const gallery = source.gallery && typeof source.gallery === 'object' ? source.gallery : {};
  const browser = source.browser && typeof source.browser === 'object' ? source.browser : {};
  const cleanMap = (map) => Object.fromEntries(Object.entries(map && typeof map === 'object' ? map : {})
    .filter(([key, enabled]) => text(key) && Boolean(enabled))
    .slice(0, 500)
    .map(([key]) => [String(key).slice(0, 180), true]));
  const history = (Array.isArray(browser.history) ? browser.history : [])
    .map((item) => text(item).slice(0, 180))
    .filter(Boolean)
    .slice(-30);
  return {
    gallery: {
      tab: ['all', 'favorites', 'local'].includes(gallery.tab) ? gallery.tab : 'all',
      detailId: text(gallery.detailId).slice(0, 180),
      favorites: cleanMap(gallery.favorites),
    },
    browser: {
      tab: ['home', 'bookmarks', 'history'].includes(browser.tab) ? browser.tab : 'home',
      query: text(browser.query).slice(0, 100),
      pageId: text(browser.pageId).slice(0, 180),
      history,
      bookmarks: cleanMap(browser.bookmarks),
    },
  };
}

function loadState() { return sanitizeUtilityRealismState(readSocialBucket(STORAGE_KEY)); }
function saveState(state) { writeSocialBucket(STORAGE_KEY, sanitizeUtilityRealismState(state)); }

function imageItem(id, src, title, subtitle, source, worldMinute = 0) {
  const image = validImage(src);
  if (!image) return null;
  return { id, src: image, title: text(title, '图片'), subtitle: text(subtitle), source, worldMinute: Number(worldMinute) || 0 };
}

export function extractGalleryItems(snapshot = {}) {
  const items = [];
  for (const moment of snapshot.moments || []) {
    const item = imageItem(`moment:${moment.id}`, moment.imageUrl, moment.text || `${moment.authorName}的朋友圈`, moment.authorName, '朋友圈', moment.worldMinute);
    if (item) items.push(item);
  }
  for (const person of snapshot.people || []) {
    const item = imageItem(`person:${person.id}`, person.avatar, person.name, person.subtitle, '通讯录头像', 0);
    if (item) items.push(item);
  }
  for (const news of snapshot.news || []) {
    const item = imageItem(`news:${news.id}`, rawImage(news.raw), news.headline, news.source || news.category, '公开新闻', news.worldMinute);
    if (item) items.push(item);
  }
  for (const forum of snapshot.forums || []) {
    const item = imageItem(`forum:${forum.id}`, rawImage(forum.raw), forum.title, forum.board, '公开讨论', forum.worldMinute);
    if (item) items.push(item);
  }
  const seen = new Set();
  return items
    .filter((item) => item && !seen.has(item.src) && seen.add(item.src))
    .sort((a, b) => (b.worldMinute || 0) - (a.worldMinute || 0));
}

function browserPage(source, item) {
  if (source === 'news') {
    return {
      id: `news:${item.id}`,
      url: `world://public/news/${item.id}`,
      kind: '新闻',
      title: item.headline,
      body: item.summary,
      byline: item.source || item.category || '世界公开网络',
      scope: item.scope || item.area || '',
      heat: Number(item.heat) || 0,
      replies: [],
      worldMinute: Number(item.worldMinute) || 0,
    };
  }
  return {
    id: `forum:${item.id}`,
    url: `world://public/forum/${item.id}`,
    kind: '讨论',
    title: item.title,
    body: item.summary,
    byline: item.board || '公开讨论',
    scope: item.scope || item.claimStatus || '',
    heat: Number(item.heat) || 0,
    replies: item.replies || [],
    worldMinute: Number(item.worldMinute) || 0,
  };
}

export function buildBrowserPages(snapshot = {}) {
  return [
    ...(snapshot.news || []).map((item) => browserPage('news', item)),
    ...(snapshot.forums || []).map((item) => browserPage('forum', item)),
  ]
    .filter((item) => text(item.title) || text(item.body))
    .sort((a, b) => (b.worldMinute - a.worldMinute) || (b.heat - a.heat));
}

export function searchBrowserPages(pages, query) {
  const q = text(query).toLowerCase();
  if (!q) return pages;
  return (pages || []).filter((page) => [page.url, page.kind, page.title, page.body, page.byline, page.scope]
    .some((value) => text(value).toLowerCase().includes(q)));
}

export function galleryMarkup(snapshot, state, localItems = [], notice = '', busy = false) {
  const items = [...localItems, ...extractGalleryItems(snapshot)];
  const controls = `<div class="wp-gallery-tools"><button type="button" data-utility-gallery-import ${busy ? 'disabled' : ''}>${busy ? '正在导入…' : '导入图片'}</button><input type="file" data-utility-gallery-file accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/bmp" multiple hidden><button type="button" data-utility-wallpaper-reset>恢复默认壁纸</button></div><p class="wp-gallery-notice" role="status">${esc(notice || '从设备选择图片，保存后可查看或设为壁纸。')}</p>`;
  const detail = items.find((item) => item.id === state.detailId);
  if (detail) {
    const favorite = Boolean(state.favorites[detail.id]);
    return `<div class="wp-gallery-detail">${controls}<button type="button" data-utility-gallery-back>‹ 相册</button><div class="wp-gallery-photo"><img src="${esc(detail.src)}" alt=""></div><div class="wp-gallery-caption"><div><b>${esc(detail.title)}</b><small>${esc(detail.source)}${detail.subtitle ? ` · ${esc(detail.subtitle)}` : ''}</small></div><button type="button" data-utility-gallery-fav="${esc(detail.id)}" class="${favorite ? 'is-active' : ''}">${favorite ? '♥' : '♡'}</button></div>${detail.id.startsWith('local:') ? `<div class="wp-gallery-tools"><button type="button" data-utility-wallpaper="home">设为主屏幕</button><button type="button" data-utility-wallpaper="lock">设为锁屏</button><button type="button" data-utility-wallpaper="both">同时设置</button><button type="button" data-utility-gallery-delete>删除图片</button></div>` : ''}</div>`;
  }
  const visible = state.tab === 'favorites' ? items.filter((item) => state.favorites[item.id]) : state.tab === 'local' ? localItems : items;
  const tabs = `<nav class="wp-utility-tabs"><button type="button" data-utility-gallery-tab="local" class="${state.tab === 'local' ? 'is-active' : ''}">本机 ${localItems.length}</button><button type="button" data-utility-gallery-tab="all" class="${state.tab === 'all' ? 'is-active' : ''}">全部</button><button type="button" data-utility-gallery-tab="favorites" class="${state.tab === 'favorites' ? 'is-active' : ''}">收藏 <span>${items.filter((item) => state.favorites[item.id]).length}</span></button></nav>`;
  if (!items.length) return `<div class="wp-gallery-shell">${controls}${tabs}<div class="wp-utility-empty"><span>▧</span><b>相册还是空的</b><p>点击导入图片，从设备照片中选择；世界记录里的图片也会显示在这里。</p></div></div>`;
  return `<div class="wp-gallery-shell">${controls}<header><b>照片</b><small>${items.length} 张图片</small></header>${tabs}${visible.length ? `<main>${visible.map((item) => `<button type="button" data-utility-gallery-open="${esc(item.id)}"><img src="${esc(item.src)}" alt=""><span>${esc(item.source)}</span></button>`).join('')}</main>` : '<div class="wp-utility-empty"><span>♡</span><b>这里还没有照片</b><p>可以导入本机图片，也可以打开照片后点心形收藏。</p></div>'}</div>`;
}

function browserHome(snapshot, state) {
  const pages = buildBrowserPages(snapshot);
  const filtered = searchBrowserPages(pages, state.query);
  const recent = state.history.slice(-5).reverse().map((id) => pages.find((page) => page.id === id)).filter(Boolean);
  const bookmarks = pages.filter((page) => state.bookmarks[page.id]);
  const history = state.history.slice().reverse().map((id) => pages.find((page) => page.id === id)).filter(Boolean);
  const tabs = `<nav class="wp-utility-tabs wp-browser-tabs"><button type="button" data-utility-browser-tab="home" class="${state.tab === 'home' ? 'is-active' : ''}">公开网络</button><button type="button" data-utility-browser-tab="bookmarks" class="${state.tab === 'bookmarks' ? 'is-active' : ''}">书签 <span>${bookmarks.length}</span></button><button type="button" data-utility-browser-tab="history" class="${state.tab === 'history' ? 'is-active' : ''}">历史 <span>${history.length}</span></button></nav>`;
  const resultButton = (page, icon = page.kind === '新闻' ? '闻' : '帖') => `<button type="button" data-utility-browser-open="${esc(page.id)}"><span>${icon}</span><div><b>${esc(page.title)}</b>${page.body ? `<p>${esc(page.body)}</p>` : ''}<small>${esc(page.byline)} · ${esc(page.url)}</small></div></button>`;
  let content = '';
  if (state.tab === 'bookmarks') {
    content = `<section class="wp-browser-results"><header><b>书签</b><span>${bookmarks.length}</span></header>${bookmarks.length ? bookmarks.map((page) => resultButton(page, '★')).join('') : '<div class="wp-utility-empty"><span>☆</span><b>还没有书签</b><p>浏览公开页面时点右上角星标即可收藏。</p></div>'}</section>`;
  } else if (state.tab === 'history') {
    content = `<section class="wp-browser-results"><header><b>浏览历史</b><span>${history.length}</span></header>${history.length ? history.map((page) => resultButton(page, '◷')).join('') : '<div class="wp-utility-empty"><span>◷</span><b>还没有浏览历史</b><p>打开过的世界公开页面会留在本机。</p></div>'}</section>`;
  } else {
    content = `${recent.length && !state.query ? `<section class="wp-browser-recents"><header><b>最近访问</b></header>${recent.map((page) => `<button type="button" data-utility-browser-open="${esc(page.id)}"><span>◷</span><div><b>${esc(page.title)}</b><small>${esc(page.url)}</small></div></button>`).join('')}</section>` : ''}<section class="wp-browser-results"><header><b>${state.query ? '搜索结果' : '公开网络'}</b><span>${filtered.length}</span></header>${!snapshot.connected ? '<div class="wp-utility-empty"><span>⌁</span><b>未连接世界背面</b><p>浏览器不会自己伪造网页。</p></div>' : filtered.length ? filtered.map((page) => resultButton(page)).join('') : '<div class="wp-utility-empty"><span>⌕</span><b>没有找到</b><p>换个关键词，或者返回公开网络首页。</p></div>'}</section>`;
  }
  return `<div class="wp-browser-shell"><form data-utility-browser-search class="wp-browser-address"><span>⌕</span><input maxlength="100" value="${esc(state.query)}" placeholder="搜索世界公开网络或输入 world:// 地址" autocomplete="off"><button type="submit">前往</button></form>${tabs}${content}</div>`;
}

function browserPageMarkup(page, state) {
  const bookmarked = Boolean(state.bookmarks[page.id]);
  return `<div class="wp-browser-page"><div class="wp-browser-pagebar"><button type="button" data-utility-browser-back>‹</button><div><span>安全</span><small>${esc(page.url)}</small></div><button type="button" data-utility-browser-bookmark="${esc(page.id)}" class="${bookmarked ? 'is-active' : ''}">${bookmarked ? '★' : '☆'}</button></div><article><span>${esc(page.kind)}</span><h2>${esc(page.title)}</h2><small>${esc(page.byline)}${page.scope ? ` · ${esc(page.scope)}` : ''}</small>${page.body ? `<p>${esc(page.body)}</p>` : ''}${page.heat ? `<div class="wp-browser-page-meta">当前公开热度 ${page.heat}</div>` : ''}</article>${page.replies.length ? `<section class="wp-browser-comments"><b>公开回复</b>${page.replies.map((reply) => `<div><strong>${esc(reply.author)}</strong><p>${esc(reply.text)}</p></div>`).join('')}</section>` : ''}</div>`;
}

function browserMarkup(snapshot, state) {
  const pages = buildBrowserPages(snapshot);
  const page = pages.find((item) => item.id === state.pageId);
  return page ? browserPageMarkup(page, state) : browserHome(snapshot, state);
}

export function mountUtilityRealism() {
  let destroyed = false;
  let active = '';
  let snapshot = readWorldBackstage();
  let state = loadState();
  let scope = socialScope();
  let localItems = [];
  let wallpaper = {};
  let notice = '';
  let importing = false;
  let localRevision = 0;
  function applyWallpaper() {
    for (const [target, selector] of [['home', '.wp-home'], ['lock', '.wp-lockscreen']]) {
      const node = document.querySelector(`#world-phone-stage ${selector}`);
      if (!node) continue;
      const item = localItems.find(item => item.id === wallpaper[target]);
      const theme = themeWallpaper(target);
      if(theme) node.dataset.phoneWallpaper = readPhoneTheme().id; else delete node.dataset.phoneWallpaper;
      node.classList.toggle('has-local-wallpaper', Boolean(item || theme));
      node.style.backgroundImage = theme ? `url("${theme}")` : item ? `linear-gradient(rgba(0,0,0,.25),rgba(0,0,0,.45)), url("${item.src}")` : '';
      node.style.backgroundSize = item || theme ? 'cover' : '';
      node.style.backgroundPosition = item || theme ? 'center' : '';
    }
    const stage = document.querySelector('#world-phone-stage');
    if(stage) { if(stage.querySelector('.wp-view[data-phone-wallpaper]')) stage.dataset.phoneSkinTone = 'light'; else delete stage.dataset.phoneSkinTone; }
  }
  async function refreshLocal() {
    const revision = ++localRevision;
    try {
      const value = await readLocalImages();
      if (destroyed || revision !== localRevision) return;
      localItems.forEach(item => URL.revokeObjectURL(item.src));
      localItems = value.images.map(item => ({ ...item, src: URL.createObjectURL(item.blob), source: '本机导入', subtitle: '', worldMinute: 0 }));
      wallpaper = value.wallpaper;
      applyWallpaper();
      paint();
    } catch (error) { if (!destroyed) { notice = error.message; paint(); } }
  }
  async function localAction(action, message) {
    try { await action(); notice = message; await refreshLocal(); }
    catch (error) { notice = error.message; paint(); }
  }
  const changeHandler = async event => {
    if (!event.target?.matches?.('#world-phone-stage [data-utility-gallery-file]') || importing) return;
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    importing = true; paint();
    let count = 0;
    const errors = [];
    for (const file of files) {
      if (destroyed) break;
      try { await importLocalImage(file); count++; }
      catch (error) { errors.push(`${file.name}：${error.message}`); }
    }
    importing = false;
    notice = `已导入 ${count} 张图片。${errors.join('；')}`;
    await refreshLocal();
  };
  const syncScope = () => { if (scope !== socialScope()) { scope = socialScope(); state = loadState(); } };
  let refreshQueued = false;

  function persist() {
    state = sanitizeUtilityRealismState(state);
    saveState(state);
  }

  function paint(preserveScroll = false) {
    syncScope();
    if (destroyed || !active) return;
    const section = document.querySelector('#world-phone-stage .wp-native-app');
    if (!section) return;
    section.classList.add('wp-utility-realism-app', `is-${active}`);
    const title = section.querySelector('.wp-app-header div > b');
    const subtitle = section.querySelector('.wp-app-header div > small');
    if (title) title.textContent = active === 'gallery' ? '相册' : '浏览器';
    if (subtitle) subtitle.textContent = active === 'gallery' ? '本机照片与世界图片' : '世界公开网络';
    const body = section.querySelector('.wp-placeholder-card, .wp-utility-shell');
    if (!body) return;
    const previousScrollTop = preserveScroll ? body.scrollTop : 0;
    body.className = 'wp-utility-shell';
    body.innerHTML = active === 'gallery' ? galleryMarkup(snapshot, state.gallery, localItems, notice, importing) : browserMarkup(snapshot, state.browser);
    if (preserveScroll) body.scrollTop = previousScrollTop;
    body.querySelector('[data-utility-browser-search] input')?.addEventListener('input', (event) => {
      state.browser.query = String(event.target.value || '').slice(0, 100);
      persist();
    });
  }

  function queuePaint() {
    if (destroyed || refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(() => {
      refreshQueued = false;
      applyWallpaper();
      syncScope();
      snapshot = readWorldBackstage();
      paint(true);
    });
  }

  const runBrowserSearch = (input) => {
    if (!input || active !== 'browser') return;
    const query = text(input.value);
    const pages = buildBrowserPages(snapshot);
    const exact = pages.find((page) => page.url === query);
    state.browser.tab = 'home';
    state.browser.query = exact ? '' : query;
    state.browser.pageId = exact?.id || '';
    if (exact) state.browser.history = [...state.browser.history.filter((id) => id !== exact.id), exact.id].slice(-30);
    persist();
    paint();
  };

  const clickHandler = (event) => {
    const addressButton = event.target?.closest?.('#world-phone-stage .wp-utility-realism-app [data-utility-browser-search] button[type="submit"]');
    if (addressButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      runBrowserSearch(addressButton.closest('form')?.querySelector('input'));
      return;
    }
    const appButton = event.target?.closest?.('#world-phone-stage .wp-home [data-app]');
    if (appButton) {
      const id = appButton.dataset.app;
      active = UTILITY_APPS.has(id) ? id : '';
      if (active) {
        persist();
        window.setTimeout(queuePaint, 0);
      }
      return;
    }
    if (!active) return;
    if (event.target?.closest?.('#world-phone-stage .wp-utility-realism-app [data-app-back]')) {
      active = '';
      return;
    }
    if (active === 'gallery') {
      if (event.target?.closest?.('[data-utility-gallery-import]')) {
        document.querySelector('#world-phone-stage [data-utility-gallery-file]')?.click(); return;
      }
      const wallpaperButton = event.target?.closest?.('[data-utility-wallpaper]');
      if (wallpaperButton) {
        void localAction(async () => { await setLocalWallpaper(state.gallery.detailId, wallpaperButton.dataset.utilityWallpaper); await disableThemeWallpaper(wallpaperButton.dataset.utilityWallpaper); }, '壁纸已设置。'); return;
      }
      if (event.target?.closest?.('[data-utility-wallpaper-reset]')) {
        void localAction(async () => { await resetLocalWallpaper(); await disableThemeWallpaper('both'); }, '已恢复默认壁纸。'); return;
      }
      if (event.target?.closest?.('[data-utility-gallery-delete]')) {
        const id = state.gallery.detailId;
        if (!window.confirm('删除这张本机图片？使用它的壁纸会恢复默认。')) return;
        void localAction(async () => { await deleteLocalImage(id); delete state.gallery.favorites[id]; state.gallery.detailId = ''; persist(); }, '图片已删除。'); return;
      }
    }
    const galleryTab = event.target?.closest?.('[data-utility-gallery-tab]');
    if (galleryTab && active === 'gallery') {
      state.gallery.tab = galleryTab.dataset.utilityGalleryTab;
      state.gallery.detailId = '';
      persist(); paint(); return;
    }
    const browserTab = event.target?.closest?.('[data-utility-browser-tab]');
    if (browserTab && active === 'browser') {
      state.browser.tab = browserTab.dataset.utilityBrowserTab;
      state.browser.pageId = '';
      if (state.browser.tab !== 'home') state.browser.query = '';
      persist(); paint(); return;
    }
    const galleryOpen = event.target?.closest?.('[data-utility-gallery-open]');
    if (galleryOpen && active === 'gallery') {
      state.gallery.detailId = galleryOpen.dataset.utilityGalleryOpen;
      persist(); paint(); return;
    }
    if (event.target?.closest?.('[data-utility-gallery-back]') && active === 'gallery') {
      state.gallery.detailId = ''; persist(); paint(); return;
    }
    const favorite = event.target?.closest?.('[data-utility-gallery-fav]');
    if (favorite && active === 'gallery') {
      const id = favorite.dataset.utilityGalleryFav;
      if (state.gallery.favorites[id]) delete state.gallery.favorites[id]; else state.gallery.favorites[id] = true;
      persist(); paint(); return;
    }
    const browserOpen = event.target?.closest?.('[data-utility-browser-open]');
    if (browserOpen && active === 'browser') {
      const id = browserOpen.dataset.utilityBrowserOpen;
      state.browser.pageId = id;
      state.browser.history = [...state.browser.history.filter((item) => item !== id), id].slice(-30);
      persist(); paint(); return;
    }
    if (event.target?.closest?.('[data-utility-browser-back]') && active === 'browser') {
      state.browser.pageId = ''; persist(); paint(); return;
    }
    const bookmark = event.target?.closest?.('[data-utility-browser-bookmark]');
    if (bookmark && active === 'browser') {
      const id = bookmark.dataset.utilityBrowserBookmark;
      if (state.browser.bookmarks[id]) delete state.browser.bookmarks[id]; else state.browser.bookmarks[id] = true;
      persist(); paint();
    }
  };

  const submitHandler = (event) => {
    const form = event.target?.closest?.('#world-phone-stage .wp-utility-realism-app [data-utility-browser-search]');
    if (!form || active !== 'browser') return;
    event.preventDefault();
    runBrowserSearch(form.querySelector('input'));
  };

  const keydownHandler = (event) => {
    const input = event.target?.closest?.('#world-phone-stage .wp-utility-realism-app [data-utility-browser-search] input');
    if (!input || event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    runBrowserSearch(input);
  };

  window.addEventListener(THEME_CHANGE_EVENT, applyWallpaper);
  document.addEventListener('change', changeHandler);
  void refreshLocal();
  document.addEventListener('click', clickHandler, true);
  document.addEventListener('keydown', keydownHandler, true);
  document.addEventListener('submit', submitHandler, true);
  const stage = document.querySelector('#world-phone-stage');
  const observer = new MutationObserver((records) => {
    applyWallpaper();
    if (!active) return;
    const replaced = records.some((record) => !record.target?.closest?.('.wp-utility-realism-app'));
    if (replaced) queuePaint();
  });
  if (stage) observer.observe(stage, { childList: true, subtree: true });
  const unsubscribe = subscribeWorldBackstage((next) => { snapshot = next; window.setTimeout(queuePaint, 0); });

  return () => {
    destroyed = true;
    window.removeEventListener(THEME_CHANGE_EVENT, applyWallpaper);
    localRevision++;
    localItems.forEach(item => URL.revokeObjectURL(item.src));
    document.removeEventListener('change', changeHandler);
    document.removeEventListener('click', clickHandler, true);
    document.removeEventListener('keydown', keydownHandler, true);
    document.removeEventListener('submit', submitHandler, true);
    observer.disconnect();
    unsubscribe?.();
  };
}

export { STORAGE_KEY as UTILITY_REALISM_STORAGE_KEY };


