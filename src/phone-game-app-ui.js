// App-specific presentation for the independent save. All actions still use
// phone-game-view's existing handlers and never reach the world bridge.
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const paths = {
  chat:'M4 5h16v11H9l-5 4V5Z', contacts:'M8 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-6 11v-3a6 6 0 0 1 12 0v3M17 5h5m-5 5h5m-5 5h5',
  discover:'m12 3 9 9-9 9-9-9 9-9Zm3 6-6 2-2 6 6-2 2-6Z', me:'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9v-2a7 7 0 0 1 14 0v2',
  home:'m3 10 9-8 9 8M5 9v12h14V9m-10 12v-7h6v7', search:'M16 16l6 6M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z',
  heart:'M12 21 3 12C-3 4 7-2 12 6 17-2 27 4 21 12l-9 9Z', save:'M6 3h12v19l-6-4-6 4V3Z', comment:'M3 3h18v14H9l-6 5V3Z',
  bag:'M4 7h16l-1 15H5L4 7Zm4 0V5a4 4 0 0 1 8 0v2', orders:'M5 2h14v20H5V2Zm4 5h6M9 12h6m-6 5h6', wallet:'M3 5h17v16H3V5Zm0 0 14-3v3m3 7h-6v5h6', phone:'M5 3h3l2 5-3 2c2 4 3 5 7 7l2-3 5 2v3c0 5-18-1-18-13 0-2 0-3 2-3Z',
};
export const gameIcon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.me}"/></svg>`;
export function gameNav(app, tab) {
  const entries = app === 'wechat' ? [['chats','chat','微信'],['relations','contacts','通讯录'],['moments','discover','发现'],['me','me','我']]
    : app === 'weibo' ? [['home','home','首页'],['hot','search','发现'],['me','me','我']]
    : app === 'rednote' ? [['discover','home','发现'],['saved','save','收藏'],['me','me','我']]
    : app === 'delivery' ? [['chats','home','首页'],['orders','orders','订单']]
    : [['chats','wallet','钱包'],['gifts','bag','礼物']];
  return `<nav class="echo-app-nav is-${app}" aria-label="${esc(app)}导航">${entries.map(([id,icon,label]) => `<button type="button" data-pg-view="${id}" aria-current="${tab === id ? 'page' : 'false'}">${gameIcon(icon)}<span>${label}</span></button>`).join('')}</nav>`;
}
export function gamePost(state, post, app, saved, detail = false, clock = '') {
  const name = state.actors.find(a => a.id === post.actorId)?.name || '角色';
  const comments = state.events.filter(e => e.postId === post.id).length;
  const avatar = `<span class="wpg-avatar">${esc(name.slice(0,1))}</span>`;
  if (app === 'rednote' && !detail) return `<article class="echo-note-card"><button type="button" data-pg-post="${esc(post.id)}" class="echo-note-cover"><span>生活记录</span><b>${esc(post.title || post.text.slice(0,38))}</b><small>${esc(post.mood || '')}</small></button><div class="echo-note-copy"><b>${esc(post.title || post.text.slice(0,48))}</b><div>${avatar}<span>${esc(name)}</span><button type="button" data-pg-like="${esc(post.id)}" aria-pressed="${post.liked}" aria-label="点赞">${gameIcon('heart')}</button></div></div></article>`;
  return `<article class="wpg-post echo-post is-${app}"><header>${avatar}<div><b>${esc(name)}</b><small>${esc(clock)}${post.mood ? ` · ${esc(post.mood)}` : ''}</small></div><button type="button" data-pg-chat="${esc(post.actorId)}" class="echo-follow">私信</button></header>${post.title ? `<h3>${esc(post.title)}</h3>` : ''}<p>${esc(post.text)}</p><footer><button type="button" data-pg-chat="${esc(post.actorId)}">${gameIcon('chat')}<span>私信</span></button>${detail ? '' : `<button type="button" data-pg-post="${esc(post.id)}">${gameIcon('comment')}<span>${comments || '评论'}</span></button>`}<button type="button" data-pg-like="${esc(post.id)}" aria-pressed="${post.liked}">${gameIcon('heart')}<span>${post.liked ? '已赞' : '赞'}</span></button>${app === 'rednote' ? `<button type="button" data-pg-save="${esc(post.id)}" aria-pressed="${saved}">${gameIcon('save')}<span>${saved ? '已收藏' : '收藏'}</span></button>` : ''}</footer></article>`;
}
export function gameFeed(state, platform, ui, cards) {
  const search = `<form class="echo-social-search" data-pg-search>${gameIcon('search')}<input data-pg-query value="${esc(ui.query || '')}" aria-label="搜索动态" placeholder="${platform === 'weibo' ? '搜索微博' : '搜索笔记'}"><button type="submit">搜索</button></form>`;
  const refresh = `<button type="button" data-pg-refresh="${platform}" class="echo-refresh" ${ui.busy || !state.actors.length ? 'disabled' : ''}>${ui.busy ? '更新中…' : '刷新动态'}</button>`;
  const empty = `<div class="echo-feed-empty">${gameIcon(platform === 'rednote' ? 'save' : 'chat')}<b>${ui.tab === 'saved' ? '还没有收藏的笔记' : '这里还没有动态'}</b><p>${state.actors.length ? '刷新动态，看看关注的人最近在做什么。' : '打开一位人物的聊天后，可以查看对方的动态。'}</p>${refresh}</div>`;
  if (platform === 'moments') return `<div class="echo-moments-cover"><div><b>朋友圈</b><span>${esc(state.user)}</span></div><span class="wpg-avatar">${esc(state.user?.slice(0,1) || '我')}</span></div><div class="echo-moments-actions">${refresh}</div><div class="echo-moments-feed">${cards || empty}</div>`;
  if (ui.tab === 'me') return `<section class="echo-social-profile"><span class="wpg-avatar">${esc(state.user?.slice(0,1) || '我')}</span><div><b>${esc(state.user || '我')}</b><small>${platform === 'weibo' ? '我的微博' : '我的小红书'}</small></div></section><div class="echo-profile-stats"><span><b>${state.actors.length}</b>关注</span><span><b>${state.posts.filter(p=>p.platform === platform && p.liked).length}</b>赞过</span></div><h3 class="echo-section-title">我的互动</h3><div class="echo-account-actions"><button type="button" data-pg-view="${platform === 'weibo' ? 'home' : 'discover'}">浏览动态 ›</button><button type="button" data-pg-app="wechat">消息 ›</button></div>`;
  return `${platform === 'weibo' ? `<div class="echo-wb-tabs"><button type="button" data-pg-view="home" class="${ui.tab === 'home' ? 'is-active' : ''}">推荐</button><button type="button" data-pg-view="hot" class="${ui.tab === 'hot' ? 'is-active' : ''}">关注动态</button>${refresh}</div>` : `<div class="echo-rn-tabs"><b>${ui.tab === 'saved' ? '我的收藏' : '发现'}</b><span>世界里的生活笔记</span>${refresh}</div>`}${search}<div class="echo-feed ${platform === 'rednote' ? 'echo-note-grid' : 'echo-weibo-feed'}">${cards || empty}</div>`;
}
export function gameWechatMe(state) {
  return `<section class="echo-wx-profile"><span class="wpg-avatar">${esc(state.user?.slice(0,1) || '我')}</span><div><b>${esc(state.user || '我')}</b><small>个人资料</small></div><span>›</span></section><div class="echo-wx-me-list"><button type="button" data-pg-app="wallet">${gameIcon('wallet')}<span>服务</span><i>›</i></button><button type="button" data-pg-tab="relations">${gameIcon('contacts')}<span>通讯录</span><i>›</i></button><button type="button" data-pg-tab="moments">${gameIcon('discover')}<span>朋友圈</span><i>›</i></button></div>`;
}

export function gameDelivery(state, ui, gifts, records) {
  if (ui.tab === 'orders') return `<div class="echo-delivery-orders"><h2>我的订单</h2>${records || '<div class="echo-feed-empty"><b>还没有订单</b><p>购买后，你可以在这里查看送达回应。</p></div>'}</div>`;
  const actor = state.actors.find(a=>a.id === ui.actorId) || state.actors[0];
  return `<div class="echo-delivery-hero"><small>ECHO DELIVERY</small><h1>好好吃饭，<br>今天也有好味道。</h1><span aria-hidden="true">🥡</span></div><div class="echo-delivery-address">${gameIcon('bag')}<span>${actor ? `送给 ${esc(actor.name)}` : '选择收礼人'}</span><b>›</b></div><div class="echo-delivery-categories"><span>🍱<b>美食</b></span><span>☕<b>饮品</b></span><span>🎁<b>心意</b></span><span>🧾<b>订单</b></span></div><div class="echo-delivery-section"><h2>附近好味道</h2><small>余额 ¥${state.balance}</small></div><label class="wpg-field">送给<select data-pg-recipient aria-label="收礼角色">${state.actors.map(a=>`<option value="${esc(a.id)}" ${a.id===actor?.id?'selected':''}>${esc(a.name)}</option>`).join('') || '<option value="">打开人物聊天后可选择</option>'}</select></label><label class="wpg-field">附言<input data-pg-note maxlength="200" value="${esc(ui.note)}" placeholder="给对方留句话" ${ui.busy?'readonly':''}></label><div class="echo-delivery-products">${gifts.map(g=>`<article><span class="echo-product-picture">${g.icon}</span><div><h3>${esc(g.name)}</h3><small>Echo 快送 · 送给关心的人</small><strong>¥${g.price}</strong></div><button type="button" data-pg-gift="${esc(g.id)}" aria-label="购买${esc(g.name)}并送出" ${ui.busy||!actor||state.balance<g.price?'disabled':''}>＋</button></article>`).join('')}</div>`;
}
