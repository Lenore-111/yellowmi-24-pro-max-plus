import { readSocialBucket, writeSocialBucket } from './social-storage.js';
import {
  readWorldBackstage,
  setWorldBackstageMomentLiked,
  subscribeWorldBackstage,
} from './world-backstage-bridge.js';
import { renderCasinoApp } from './casino-app.js';
import { renderWalletApp } from './wallet-app.js';
import { renderMusicApp } from './music-app.js';
import { renderPocketGame } from './pocket-game.js?v=0.3.0-alpha.27';
import { renderDeliveryApp } from './lingqi-delivery.js';
import { readPhoneGameMode, setPhoneGameMode, capturePhoneGameScope } from './phone-game.js?v=0.3.0-alpha.27';
import { renderPhoneGameApp } from './phone-game-view.js?v=0.3.0-alpha.27';
import { renderPhoneGameCommunicationApp } from './phone-game-communication-view.js?v=0.3.0-alpha.27';
import { renderNativeCommunicationApp } from './native-communication-apps.js?v=0.3.0-alpha.27';
import { findMessageMatches, highlightMessageText } from './message-search.js';
import {
  DEFAULT_HOME_LAYOUT,
  mountHomeLayoutEditor,
  readHomeLayout,
  resetHomeLayout,
} from './home-layout.js';

const LAUNCHER_ID = 'world-phone-launcher';
const STAGE_ID = 'world-phone-stage';

const HOME_APP_DEFS = {
  wechat: ['微', '微信', 'is-wechat'],
  news: ['闻', '世界新闻', 'is-news'],
  wallet: ['¥', '钱包', 'is-wallet'],
  delivery: ['🥡', '玲七快送', 'is-delivery'],
  gallery: ['▧', '相册', 'is-gallery'],
  music: ['♫', '音乐', 'is-music'],
  casino: ['♠', '七号赌场', 'is-casino'],
  puzzle: ['2048', '数字花园', 'is-puzzle'],
  settings: ['⚙', '设置', 'is-settings'],
  phone: ['☎', '电话', 'is-phone'],
  messages: ['●', '短信', 'is-messages'],
  browser: ['◎', '浏览器', 'is-browser'],
  backstage: ['SIM', 'SIM 卡', 'is-backstage'],
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

function initials(name) {
  const clean = String(name || '?').trim();
  return escapeHtml(clean.slice(0, 1) || '?');
}

function deviceNow() {
  const now = new Date();
  return {
    time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
    date: now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }),
  };
}

function presentationTime(snapshot) {
  const local = deviceNow();
  return {
    time: snapshot?.clock?.time || local.time,
    date: snapshot?.clock?.date || local.date,
  };
}

function timeLabel(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 16);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function compactDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 16);
  return date.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function signalBars(connected) {
  return `<span class="wp-signal ${connected ? 'is-on' : ''}" aria-label="${connected ? 'SIM 卡已插入' : '未插入 SIM 卡'}"><i></i><i></i><i></i><i></i></span>`;
}

function makeApp(id, icon, label, tone = '') {
  const button = el('button', `wp-app${tone ? ` ${tone}` : ''}`);
  button.type = 'button';
  button.dataset.app = id;
  button.innerHTML = `<span class="wp-app-icon">${icon}</span><span>${label}</span>`;
  return button;
}

function makeHomeApp(id) {
  const def = HOME_APP_DEFS[id];
  return def ? makeApp(id, def[0], def[1], def[2]) : null;
}

function renderLock(screen, snapshot, unlock) {
  const now = presentationTime(snapshot);
  screen.innerHTML = `
    <section class="wp-view wp-lockscreen" data-view="lock">
      <div class="wp-wallpaper-glow wp-wallpaper-glow--a"></div>
      <div class="wp-wallpaper-glow wp-wallpaper-glow--b"></div>
      <div class="wp-lock-top">
        <div class="wp-lock-time">${escapeHtml(now.time)}</div>
        <div class="wp-lock-date">${escapeHtml(now.date)}</div>
      </div>
      <div class="wp-lock-connection ${snapshot.connected ? 'is-connected' : ''}">
        <span class="wp-lock-orb"></span>
        <div><b>${snapshot.connected ? '世界背面 SIM' : '未插入 SIM'}</b><small>${snapshot.connected ? 'SIM READY · WORLD BACKSTAGE' : 'INSERT WORLD BACKSTAGE SIM'}</small></div>
      </div>
      <div class="wp-lock-bottom">
        <button type="button" class="wp-lock-shortcut" aria-label="手电筒">✦</button>
        <button type="button" class="wp-unlock" data-unlock><span></span><b>上滑进入世界小手机</b></button>
        <button type="button" class="wp-lock-shortcut" aria-label="相机">◉</button>
      </div>
    </section>
  `;
  screen.querySelector('[data-unlock]')?.addEventListener('click', unlock);
}

function renderHome(screen, snapshot, openApp, lock) {
  const now = presentationTime(snapshot);
  const layout = readHomeLayout();
  delete screen.dataset.homeEditing;

  screen.innerHTML = `
    <section class="wp-view wp-home" data-view="home">
      <div class="wp-wallpaper-glow wp-wallpaper-glow--a"></div>
      <div class="wp-wallpaper-glow wp-wallpaper-glow--b"></div>
      <div class="wp-home-widget">
        <span>${escapeHtml(now.date)}</span>
        <strong>${escapeHtml(now.time)}</strong>
        <small>${readPhoneGameMode() === 'game' ? '独立游戏 · 仅在手机里' : snapshot.connected ? 'SIM 卡已插入' : '未插入 SIM 卡'}</small>
      </div>
      <div class="wp-app-grid" data-app-grid></div>
      <div class="wp-dock" data-dock></div>
      <div class="wp-home-edit-hint" data-home-edit-hint hidden>拖动图标调整位置 · Dock 最多 4 个</div>
      <button type="button" class="wp-home-done" data-home-done hidden>完成</button>
      <button type="button" class="wp-screen-lock" data-lock aria-label="锁屏">⌁</button>
    </section>
  `;

  const home = screen.querySelector('.wp-home');
  const grid = screen.querySelector('[data-app-grid]');
  const dock = screen.querySelector('[data-dock]');

  for (const id of layout.desktop) {
    const app = makeHomeApp(id);
    if (app) grid?.append(app);
  }

  for (const id of layout.dock) {
    const app = makeHomeApp(id);
    if (app) dock?.append(app);
  }

  mountHomeLayoutEditor({
    screen,
    home,
    grid,
    dock,
    onOpenApp: openApp,
  });

  screen.querySelector('[data-lock]')?.addEventListener('click', lock);
}
function renderAppHeader(title, subtitle = '', backLabel = '返回桌面', trailing = '') {
  return `
    <header class="wp-app-header">
      <button type="button" data-app-back aria-label="${escapeHtml(backLabel)}">‹</button>
      <div><b>${escapeHtml(title)}</b>${subtitle ? `<small>${escapeHtml(subtitle)}</small>` : ''}</div>
      <span>${trailing}</span>
    </header>
  `;
}

function renderPlaceholder(screen, app, snapshot, goHome) {
  const meta = {
    gallery: ['相册', '本机内容', '以后用于查看世界小手机里真实产生或保存的图片。'],
    phone: ['电话', '语音通讯', '预留电话与来电界面。不会偷偷生成第二套角色关系。'],
    messages: ['短信', '系统通讯', '预留短信与验证码等轻量通讯。'],
    browser: ['浏览器', '公开网络', '预留世界网页与公共信息入口。'],
    backstage: ['SIM 卡', '世界背面', snapshot.connected ? '世界背面 SIM 已插入，可读取授权的世界数据。' : '当前没有检测到世界背面 SIM。'],
  }[app] || ['应用', 'WORLD PHONE', '施工中。'];

  screen.innerHTML = `
    <section class="wp-view wp-native-app">
      ${renderAppHeader(meta[0], meta[1])}
      <div class="wp-placeholder-card">
        <div class="wp-placeholder-icon">◌</div>
        <h2>${escapeHtml(meta[0])}</h2>
        <p>${escapeHtml(meta[2])}</p>
        <div class="wp-bridge-pill ${snapshot.connected ? 'is-connected' : ''}"><i></i>${snapshot.connected ? '世界背面 SIM · 已插入' : '世界背面 SIM · 未插入'}</div>
      </div>
    </section>
  `;
  screen.querySelector('[data-app-back]')?.addEventListener('click', goHome);
}

function relatedForums(snapshot, eventId) {
  const target = String(eventId || '').trim();
  if (!target) return [];
  const seen = new Set();
  return snapshot.forums
    .filter((forum) => String(forum.relatedEventId || '').trim() === target)
    .filter((forum) => {
      const key = `${forum.board}\u0000${forum.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
}

function renderNews(screen, snapshot, goHome, shareNews) {
  const news = Array.isArray(snapshot.news) ? snapshot.news : [];
  screen.innerHTML = `
    <section class="wp-view wp-native-app wp-news-app">
      ${renderAppHeader('世界新闻', snapshot.connected ? 'SIM 已插入 · 公开世界窗口' : '未插入世界背面 SIM')}
      <main class="wp-news-feed" data-phone-refresh-surface>
        ${!snapshot.connected ? `
          <div class="wp-news-empty"><b>未插入世界背面 SIM</b><span>新闻不会在手机里单独生成一份。</span></div>
        ` : !news.length ? `
          <div class="wp-news-empty"><b>暂时没有公开新闻</b><span>只有世界背面已存在的公开信息才会出现在这里。</span></div>
        ` : news.map((item) => {
          const forums = relatedForums(snapshot, item.relatedEventId);
          const source = item.source || (item.sourceType === 'official' ? '公开机构信息' : '公开世界信息');
          const stamp = compactDateTime(item.updatedAt || item.publishedAt || item.createdAt);
          return `
            <article class="wp-news-card" data-news-id="${escapeHtml(item.id)}" data-related-event-id="${escapeHtml(item.relatedEventId)}">
              <div class="wp-news-kicker"><b>${escapeHtml(item.category || '世界新闻')}</b><span>${escapeHtml(item.scope || item.area || '')}</span></div>
              <h3>${escapeHtml(item.headline)}</h3>
              <p>${escapeHtml(item.summary)}</p>
              <div class="wp-news-meta"><span>${escapeHtml(source)}</span><time>${escapeHtml(stamp)}</time></div>
              <button type="button" class="wp-news-share" data-share-news="${escapeHtml(item.id)}">分享给朋友 ↗</button>
              ${forums.length ? `
                <details class="wp-news-discussion">
                  <summary>相关讨论 · ${forums.length} 个话题</summary>
                  <div class="wp-news-topics">
                    ${forums.map((forum) => `
                      <section class="wp-news-topic">
                        <b>${escapeHtml(forum.board)} · ${escapeHtml(forum.title)}</b>
                        ${forum.summary ? `<p>${escapeHtml(forum.summary)}</p>` : ''}
                        ${forum.replies.length ? `
                          <div class="wp-news-replies">
                            ${forum.replies.slice(0, 4).map((reply) => `
                              <div class="wp-news-reply"><b>${escapeHtml(reply.author)}</b><span>${escapeHtml(reply.text)}</span></div>
                            `).join('')}
                          </div>
                        ` : ''}
                      </section>
                    `).join('')}
                  </div>
                </details>
              ` : ''}
            </article>
          `;
        }).join('')}
      </main>
    </section>
  `;
  screen.querySelectorAll('[data-share-news]').forEach(button => button.addEventListener('click', () => shareNews(button.dataset.shareNews)));
  screen.querySelector('[data-app-back]')?.addEventListener('click', goHome);
}

function avatarMarkup(person, fallbackName) {
  const avatar = person?.avatar;
  if (avatar && /^(?:https?:\/\/|data:image\/)/i.test(avatar)) {
    return `<span class="wp-wx-avatar"><img src="${escapeHtml(avatar)}" alt=""></span>`;
  }
  return `<span class="wp-wx-avatar">${initials(person?.name || fallbackName)}</span>`;
}

function conversationTitle(conversation, snapshot) {
  if (conversation?.type === 'group') return conversation.title || '群聊';
  const id = conversation?.memberIds?.[0];
  return snapshot.people.find((person) => person.id === id)?.name || conversation?.title || '未命名会话';
}

function conversationPerson(conversation, snapshot) {
  const id = conversation?.memberIds?.[0];
  return snapshot.people.find((person) => person.id === id) || null;
}

function renderWxChats(content, snapshot, route, repaint) {
  const prefs = readSocialBucket('wechat-list') || { pinned: {}, query: '', unread: false };
  prefs.pinned ||= {};
  const conversations = [...snapshot.conversations].sort((a, b) => Number(Boolean(prefs.pinned[b.id])) - Number(Boolean(prefs.pinned[a.id])) || String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  if (!snapshot.connected) {
    content.innerHTML = '<div class="wp-wx-empty"><b>未插入世界背面 SIM</b><p>插入世界背面 SIM 后，真实会话会出现在这里。</p></div>';
    return;
  }
  if (!conversations.length) {
    content.innerHTML = '<div class="wp-wx-empty"><b>暂无聊天</b><p>这里只显示世界背面里已经存在的通讯会话。</p></div>';
    return;
  }

  content.innerHTML = `<div class="wp-chat-toolbar"><label class="wp-wxr-search" data-wxr-search><span>⌕</span><input data-chat-search placeholder="搜索联系人或消息" value="${escapeHtml(prefs.query || '')}"></label><button type="button" data-chat-unread aria-pressed="${Boolean(prefs.unread)}">未读</button></div>` + conversations.map((conversation) => {
    const person = conversationPerson(conversation, snapshot);
    const title = conversationTitle(conversation, snapshot);
    const last = conversation.lastMessage;
    return `
      <div class="wp-chat-entry" data-chat-entry="${escapeHtml(conversation.id)}" data-unread="${conversation.unread || 0}"><button type="button" class="wp-wx-chat-row" data-wx-chat="${escapeHtml(conversation.id)}">
        ${avatarMarkup(person, title)}
        <span class="wp-wx-chat-copy"><b>${escapeHtml(title)}</b><small>${escapeHtml(last?.text || '暂无消息')}</small></span>
        <span class="wp-wx-chat-meta"><time>${escapeHtml(timeLabel(last?.createdAt || conversation.updatedAt))}</time>${conversation.unread ? `<i>${Math.min(99, conversation.unread)}</i>` : ''}</span>
      </button>
      <button type="button" class="wp-chat-pin" data-chat-pin="${escapeHtml(conversation.id)}" aria-label="${prefs.pinned[conversation.id] ? '取消置顶' : '置顶会话'}" aria-pressed="${Boolean(prefs.pinned[conversation.id])}">${prefs.pinned[conversation.id] ? '★' : '☆'}</button></div>
    `;
  }).join('');

  const filterChats = () => {
    const query = String(prefs.query || '').toLowerCase();
    let count = 0;
    content.querySelectorAll('[data-chat-entry]').forEach(row => {
      row.hidden = Boolean((prefs.unread && !Number(row.dataset.unread)) || (query && !row.textContent.toLowerCase().includes(query)));
      if (!row.hidden) count++;
    });
    let empty = content.querySelector('[data-chat-no-results]');
    if (!empty) { empty = el('p', 'wp-chat-no-results', '没有符合条件的会话'); empty.dataset.chatNoResults = '';content.append(empty); }
    empty.hidden = count > 0;
  };
  content.querySelector('[data-chat-search]').addEventListener('input', event => { prefs.query=event.target.value;writeSocialBucket('wechat-list',prefs);filterChats(); });
  content.querySelector('[data-chat-unread]').addEventListener('click', event => { prefs.unread=!prefs.unread;writeSocialBucket('wechat-list',prefs);event.currentTarget.setAttribute('aria-pressed',String(prefs.unread));filterChats(); });
  content.querySelectorAll('[data-chat-pin]').forEach(button => button.addEventListener('click',()=>{const id=button.dataset.chatPin;if(prefs.pinned[id])delete prefs.pinned[id];else prefs.pinned[id]=true;writeSocialBucket('wechat-list',prefs);repaint();}));
  filterChats();

  content.querySelectorAll('[data-wx-chat]').forEach((button) => {
    button.addEventListener('click', () => {
      route.conversationId = button.dataset.wxChat;
      repaint();
    });
  });
}

function renderWxContacts(content, snapshot) {
  if (!snapshot.connected) {
    content.innerHTML = '<div class="wp-wx-empty"><b>未插入世界背面 SIM</b><p>联系人不会在手机里单独复制一份。</p></div>';
    return;
  }
  if (!snapshot.contacts.length) {
    content.innerHTML = '<button type="button" class="wp-social-entry" data-social-friends>新的朋友 · 查看申请</button><div class="wp-wx-empty"><b>暂无联系人</b><p>接受好友申请后，就可以开始聊天。</p></div>';
    return;
  }
  content.innerHTML = `
    <div class="wp-wx-contact-tools"><button type="button" data-social-friends><span>＋</span><b>新的朋友</b></button><button type="button" data-social-group><span>群</span><b>发起群聊</b></button></div>
    <div class="wp-wx-contact-list">
      ${snapshot.contacts.map((person) => `<div class="wp-wx-contact-row" data-contact-person="${escapeHtml(person.id)}">${avatarMarkup(person, person.name)}<span><b>${escapeHtml(person.name)}</b>${person.subtitle ? `<small>${escapeHtml(person.subtitle)}</small>` : ''}</span></div>`).join('')}
    </div>
  `;
}

function renderWxMoments(content, snapshot, toggleMomentLike) {
  if (!snapshot.connected) {
    content.innerHTML = '<div class="wp-wx-empty"><b>未插入世界背面 SIM</b><p>朋友圈只显示世界背面里真实存在的动态。</p></div>';
    return;
  }
  const moments = [...snapshot.moments].reverse();
  content.innerHTML = `
    <div class="wp-wx-moments-cover"><div><b>${escapeHtml(snapshot.user)}</b><span>${initials(snapshot.user)}</span></div></div>
    <div class="wp-wx-moment-list">
      ${moments.length ? moments.map((moment) => `
        <article class="wp-wx-moment" data-moment-id="${escapeHtml(moment.id)}">
          ${avatarMarkup({ name: moment.authorName, avatar: moment.avatar }, moment.authorName)}
          <div class="wp-wx-moment-copy">
            <b>${escapeHtml(moment.authorName)}</b>
            <p>${escapeHtml(moment.text)}</p>
            ${moment.imageUrl ? `<img src="${escapeHtml(moment.imageUrl)}" alt="朋友圈图片">` : ''}
            <div class="wp-wx-moment-meta">
              <time>${escapeHtml(timeLabel(moment.createdAt))}</time>
              <button type="button" class="wp-wx-like ${moment.likedByUser ? 'is-liked' : ''}" data-moment-like="${escapeHtml(moment.id)}" aria-pressed="${moment.likedByUser ? 'true' : 'false'}" aria-label="${moment.likedByUser ? '取消点赞' : '点赞'}">
                <span>${moment.likedByUser ? '♥' : '♡'}</span>${moment.likes ? `<b>${moment.likes}</b>` : ''}
              </button>
            </div>
          </div>
        </article>
      `).join('') : '<div class="wp-wx-empty"><b>朋友圈还是空的</b><p>这里不会填演示动态。</p></div>'}
    </div>
  `;

  content.querySelectorAll('[data-moment-like]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.dataset.momentLike;
      const moment = snapshot.moments.find((item) => item.id === id);
      if (!moment) return;
      toggleMomentLike(id, !moment.likedByUser);
    });
  });
}

function renderWxMe(content, snapshot, route, repaint) {
  content.innerHTML = `
    <div class="wp-wx-me-card">
      <span class="wp-wx-me-avatar">${initials(snapshot.user)}</span>
      <div><b>${escapeHtml(snapshot.user)}</b><small>世界小手机用户</small></div>
    </div>
    <div class="wp-wx-me-list">
      <button type="button" data-social-collections><span>社交收藏</span><b>›</b></button>
      <button type="button" data-me-moments><span>朋友圈</span><b>${snapshot.moments.length} ›</b></button>
      <div><span>SIM 卡</span><b class="${snapshot.connected ? 'is-good' : ''}">${snapshot.connected ? '已插入' : '未插入'}</b></div>
    </div>
  `;
  content.querySelector('[data-me-moments]').onclick = () => { route.tab = 'moments'; repaint(); };
}

function renderWxThread(screen, snapshot, route, repaint, goHome) {
  if (route.searchConversationId !== route.conversationId) {
    route.searchConversationId = route.conversationId;
    route.searchOpen = false;
    route.searchQuery = '';
    route.searchIndex = 0;
  }
  const previousCompose = screen.querySelector('[data-conversation-id]')?.dataset.conversationId === route.conversationId ? screen.querySelector('.wp-wx-compose[data-live-compose]') : null;
  const focusedSearch = screen.querySelector('[data-wx-thread-search]:focus');
  const searchSelection = focusedSearch ? [focusedSearch.selectionStart, focusedSearch.selectionEnd] : null;
  const focused = previousCompose?.contains(document.activeElement) ? document.activeElement : null;
  const previousThread = screen.querySelector('[data-wx-thread]');
  const sameThread = screen.querySelector('[data-conversation-id]')?.dataset.conversationId === route.conversationId;
  const visibleMessageIds = sameThread
    ? new Set([...(previousThread?.querySelectorAll('[data-wx-message-id]') || [])].map(node => node.dataset.wxMessageId))
    : null;
  const previousScrollTop = previousThread?.scrollTop || 0;
  const wasNearBottom = previousThread
    ? previousThread.scrollHeight - previousThread.scrollTop - previousThread.clientHeight < 24
    : true;
  const conversation = snapshot.conversations.find((item) => item.id === route.conversationId);
  if (!conversation) {
    route.conversationId = '';
    repaint();
    return;
  }
  const title = conversationTitle(conversation, snapshot);
  const query = String(route.searchQuery || '').trim();
  const matches = findMessageMatches(conversation.messages, query);
  const incoming = visibleMessageIds
    ? conversation.messages.filter(message => message.id && !visibleMessageIds.has(message.id)
      && message.senderId !== 'user' && message.senderName !== snapshot.user)
    : [];
  const arrivingIds = incoming.length <= 3 ? incoming.map(message => message.id) : [];
  if (matches.length) route.searchIndex = Math.max(0, Math.min(route.searchIndex || 0, matches.length - 1));
  else route.searchIndex = 0;
  screen.innerHTML = `
    <section class="wp-view wp-native-app wp-wx-app wp-wx-thread-view ${route.searchOpen ? 'is-searching' : ''}" data-conversation-id="${escapeHtml(route.conversationId)}">
      ${renderAppHeader(title, conversation.type === 'group' ? `${conversation.memberIds.length}人` : '微信', '返回微信', '<button type="button" data-wx-search-toggle aria-label="查找聊天记录">⌕</button>')}
      ${route.searchOpen ? `<div class="wp-wx-thread-search"><input type="search" data-wx-thread-search placeholder="查找这段聊天" aria-label="查找这段聊天" value="${escapeHtml(route.searchQuery || '')}"><span aria-live="polite">${query ? (matches.length ? `${route.searchIndex + 1} / ${matches.length}` : '没有结果') : '输入关键词'}</span><button type="button" data-wx-search-prev aria-label="上一个结果" ${matches.length ? '' : 'disabled'}>↑</button><button type="button" data-wx-search-next aria-label="下一个结果" ${matches.length ? '' : 'disabled'}>↓</button><button type="button" data-wx-search-close aria-label="关闭查找">×</button></div>` : ''}
      <div class="wp-wx-thread" data-wx-thread data-phone-refresh-surface>
        ${conversation.messages.map((message, index) => {
          const mine = message.senderId === 'user' || message.senderName === snapshot.user;
          const sender = snapshot.people.find((person) => person.id === message.senderId);
          const senderName = message.senderName || sender?.name || (conversation.type === 'group' ? '未署名成员' : title);
          const showSenderName = conversation.type === 'group' && !mine && Boolean(senderName);
          const matchIndex = matches.indexOf(index);
          const arrivalIndex = arrivingIds.indexOf(message.id);
          return `
            <div class="wp-wx-message ${mine ? 'is-mine' : ''} ${arrivalIndex >= 0 ? 'is-arriving' : ''} ${matchIndex === route.searchIndex && query ? 'is-search-match' : ''}" data-wx-message-id="${escapeHtml(message.id)}" ${arrivalIndex >= 0 ? `style="--wp-arrival-delay:${arrivalIndex * 100}ms"` : ''} ${matchIndex < 0 ? '' : 'data-wx-search-match'}>
              ${mine ? '' : avatarMarkup(sender, senderName)}
              <div>${showSenderName ? `<small class="wp-wx-sender-name">${escapeHtml(senderName)}</small>` : ''}<span>${highlightMessageText(message.text, query)}</span><time>${escapeHtml(timeLabel(message.createdAt))}</time></div>
              ${mine ? `<span class="wp-wx-avatar is-me">${initials(snapshot.user)}</span>` : ''}
            </div>
          `;
        }).join('') || '<div class="wp-wx-empty"><b>暂无消息</b></div>'}
      </div>
      <div class="wp-wx-compose"><button type="button">⌨</button><div>发送功能下一阶段接入世界背面</div><button type="button">＋</button></div>
    </section>
  `;
  screen.querySelector('[data-app-back]')?.addEventListener('click', () => {
    route.conversationId = '';
    repaint();
  });
  if (previousCompose) screen.querySelector('.wp-wx-compose')?.replaceWith(previousCompose);
  focused?.focus({ preventScroll: true });
  if (searchSelection) {
    const input = screen.querySelector('[data-wx-thread-search]');
    input?.focus({ preventScroll: true });
    input?.setSelectionRange(...searchSelection);
  }
  screen.querySelector('[data-wx-search-toggle]')?.addEventListener('click', () => {
    route.searchOpen = !route.searchOpen;
    if (!route.searchOpen) route.searchQuery = '';
    repaint();
    if (route.searchOpen) screen.querySelector('[data-wx-thread-search]')?.focus({ preventScroll: true });
  });
  screen.querySelector('[data-wx-search-close]')?.addEventListener('click', () => {
    route.searchOpen = false; route.searchQuery = ''; repaint();
  });
  const threadSearch = screen.querySelector('[data-wx-thread-search]');
  threadSearch?.addEventListener('compositionstart', () => { route.searchComposing = true; });
  threadSearch?.addEventListener('compositionend', event => {
    route.searchComposing = false;
    route.searchQuery = event.target.value.slice(0, 120);
    route.searchIndex = 0;
    route.searchJump = true;
    repaint();
  });
  threadSearch?.addEventListener('input', event => {
    route.searchQuery = event.target.value.slice(0, 120);
    route.searchIndex = 0;
    route.searchJump = true;
    if (event.isComposing || route.searchComposing) return;
    repaint();
  });
  for (const [selector, delta] of [['[data-wx-search-prev]', -1], ['[data-wx-search-next]', 1]]) {
    screen.querySelector(selector)?.addEventListener('click', () => {
      if (!matches.length) return;
      route.searchIndex = (route.searchIndex + delta + matches.length) % matches.length;
      route.searchJump = true;
      repaint();
    });
  }
  const thread = screen.querySelector('[data-wx-thread]');
  if (thread) {
    thread.scrollTop = previousThread && !wasNearBottom
      ? Math.min(previousScrollTop, thread.scrollHeight)
      : thread.scrollHeight;
    if (route.searchJump && matches.length) {
      const selected = thread.querySelector('.wp-wx-message.is-search-match');
      if (selected) thread.scrollTop = Math.max(0, selected.offsetTop - thread.clientHeight / 2);
    }
  }
  route.searchJump = false;
}

function renderWeChat(screen, snapshot, route, repaint, goHome, toggleMomentLike) {
  if (route.conversationId) {
    renderWxThread(screen, snapshot, route, repaint, goHome);
    return;
  }

  const focusedSearch = screen.querySelector('[data-chat-search]:focus');
  const selection = focusedSearch ? [focusedSearch.selectionStart, focusedSearch.selectionEnd] : null;
  const titleByTab = { chats: '微信', contacts: '通讯录', moments: '发现', me: '我' };
  screen.innerHTML = `
    <section class="wp-view wp-native-app wp-wx-app">
      ${renderAppHeader(titleByTab[route.tab] || '微信', snapshot.connected ? 'SIM 卡已插入' : '未插入世界背面 SIM')}
      <main class="wp-wx-content" data-wx-content data-phone-refresh-surface></main>
      <nav class="wp-wx-tabs">
        <button type="button" data-wx-tab="chats" class="${route.tab === 'chats' ? 'is-active' : ''}"><span>●</span><b>微信</b></button>
        <button type="button" data-wx-tab="contacts" class="${route.tab === 'contacts' ? 'is-active' : ''}"><span>人</span><b>通讯录</b></button>
        <button type="button" data-wx-tab="moments" class="${route.tab === 'moments' ? 'is-active' : ''}"><span>◎</span><b>发现</b></button>
        <button type="button" data-wx-tab="me" class="${route.tab === 'me' ? 'is-active' : ''}"><span>我</span><b>我</b></button>
      </nav>
    </section>
  `;

  const content = screen.querySelector('[data-wx-content]');
  if (route.tab === 'contacts') renderWxContacts(content, snapshot);
  else if (route.tab === 'moments') renderWxMoments(content, snapshot, toggleMomentLike);
  else if (route.tab === 'me') renderWxMe(content, snapshot, route, repaint);
  else renderWxChats(content, snapshot, route, repaint);
  if (selection) { const input=screen.querySelector('[data-chat-search]');input?.focus({preventScroll:true});input?.setSelectionRange(...selection); }

  screen.querySelector('[data-app-back]')?.addEventListener('click', goHome);
  screen.querySelectorAll('[data-wx-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      route.tab = button.dataset.wxTab;
      route.conversationId = '';
      repaint();
    });
  });
}

function renderSettings(screen, snapshot, goHome, onResetHome) {
  screen.innerHTML = `
    <section class="wp-view wp-native-app wp-settings-app">
      ${renderAppHeader('设置', '世界小手机')}
      <div class="wp-settings-hero"><div class="wp-settings-device">世界小手机</div><p>REAL PHONE SHELL · WORLD BACKSTAGE SIM</p></div>
      <div class="wpg-mode-settings">
        <b>手机玩法</b>
        <button type="button" data-game-mode="game" aria-pressed="${readPhoneGameMode() === 'game'}">独立游戏 · 仅在手机里</button>
        <button type="button" data-game-mode="world" aria-pressed="${readPhoneGameMode() === 'world'}">世界背面 · 原有联动模式</button>
        <p>独立游戏有自己的帖子、私聊、钱包和关系存档。只有你选中“带入正文”的行动才会进入正文输入框。</p>
      </div>
      <div class="wp-settings-list">
        <div><span>SIM 卡</span><b class="${snapshot.connected ? 'is-good' : ''}">${snapshot.connected ? '已插入' : '未插入'}</b></div>
        <div><span>世界人物</span><b>${snapshot.people.length}</b></div>
        <div><span>微信联系人</span><b>${snapshot.contacts.length}</b></div>
        <div><span>通讯会话</span><b>${snapshot.conversations.length}</b></div>
        <div><span>朋友圈内容</span><b>${snapshot.moments.length}</b></div>
        <div><span>世界新闻</span><b>${snapshot.news.length}</b></div>
        <div><span>论坛讨论</span><b>${snapshot.forums.length}</b></div>
        <div><span>当前会话消息</span><b>${snapshot.chatMessages}</b></div>
      </div>
      <div class="wp-settings-section">
        <span class="wp-settings-section-label">主屏幕</span>
        <button type="button" class="wp-settings-reset-home" data-reset-home>
          <span><b>恢复默认桌面布局</b><small>重置 App 与 Dock 的排列位置</small></span>
          <i>›</i>
        </button>
      </div>
      <div class="wp-settings-foot">World Phone · Alpha</div>
    </section>
  `;
  screen.querySelector('[data-app-back]')?.addEventListener('click', goHome);
  screen.querySelectorAll('[data-game-mode]').forEach(button => button.addEventListener('click', () => {
    setPhoneGameMode(button.dataset.gameMode);
    renderSettings(screen, snapshot, goHome, onResetHome);
  }));
  screen.querySelector('[data-reset-home]')?.addEventListener('click', (event) => {
    onResetHome?.();
    const button = event.currentTarget;
    const label = button?.querySelector('b');
    const note = button?.querySelector('small');
    if (label) label.textContent = '已恢复默认布局';
    if (note) note.textContent = '返回桌面后生效';
  });
}
function mountStage() {
  const launcher = el('button', 'wp-launcher');
  launcher.id = LAUNCHER_ID;
  launcher.type = 'button';
  launcher.title = '世界小手机 · 拖动调整位置';
  launcher.setAttribute('aria-label', '打开世界小手机');
  launcher.setAttribute('aria-controls', STAGE_ID);
  launcher.setAttribute('aria-expanded', 'false');
  launcher.innerHTML = '<span class="wp-orb-halo" aria-hidden="true"></span><span class="wp-orb-orbit is-one" aria-hidden="true"></span><span class="wp-orb-orbit is-two" aria-hidden="true"></span><span class="wp-orb-light" aria-hidden="true"></span><span class="wp-launcher-phone" aria-hidden="true"><svg viewBox="0 0 24 30" fill="none"><rect x="5" y="3" width="14" height="24" rx="4" fill="var(--phone-orb-bg)" stroke="currentColor" stroke-width="1.35"/><path d="M10 6h4M10 23h4" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/><circle cx="12" cy="14.5" r="2" fill="currentColor"/></svg></span><b>世界小手机</b>';

  const stage = el('div', 'wp-stage');
  stage.id = STAGE_ID;
  stage.hidden = true;
  stage.innerHTML = `
    <button type="button" class="wp-stage-close" data-stage-close aria-label="关闭世界小手机">×</button>
    <div class="wp-device-wrap">
      <div class="wp-device">
        <span class="wp-side-key wp-side-key--volume-up"></span>
        <span class="wp-side-key wp-side-key--volume-down"></span>
        <button type="button" class="wp-side-key wp-side-key--power" data-power aria-label="电源键"></button>
        <div class="wp-screen-glass">
          <div class="wp-camera-hole" aria-hidden="true"></div>
          <div class="wp-statusbar" data-statusbar></div>
          <main class="wp-screen" data-screen></main>
          <div class="wp-gesture-bar" aria-hidden="true"></div>
        </div>
        <div class="wp-bottom-hardware" aria-hidden="true"><i></i><i></i><i></i><b></b><i></i><i></i><i></i></div>
      </div>
    </div>
  `;
  document.body.append(launcher, stage);
  return { launcher, stage };
}

export function mountWorldPhone() {
  if (document.getElementById(LAUNCHER_ID)) return null;

  const { launcher, stage } = mountStage();
  const screen = stage.querySelector('[data-screen]');
  const statusbar = stage.querySelector('[data-statusbar]');
  const power = stage.querySelector('[data-power]');
  const close = stage.querySelector('[data-stage-close]');
  const wechatRoute = { tab: 'chats', conversationId: '' };
  let closeTimer = 0;
  let current = 'lock';
  let snapshot = readWorldBackstage();
  const chatScope = () => { const ctx = globalThis.SillyTavern?.getContext?.(); return ctx?.chatMetadata ?? ctx?.chat_metadata ?? null; };
  let scope = chatScope();
  const worldScopeKey = () => {
    const ctx = globalThis.SillyTavern?.getContext?.();
    return JSON.stringify([
      ctx?.chatId ?? ctx?.getCurrentChatId?.() ?? '',
      ctx?.characterId ?? '',
      ctx?.groupId ?? '',
      readWorldBackstage().branchKey,
    ]);
  };
  let scopeKey = worldScopeKey();
  let gameScope = capturePhoneGameScope().key;
  let modeEpoch = capturePhoneGameScope().modeEpoch;
  let composing = false;
  let pendingRefresh = false;
  let statusMarkup = '';
  let disposeApp = () => {};
  function disposeCurrentApp() { disposeApp(); disposeApp = () => {}; }

  function paintStatusbar() {
    const now = presentationTime(snapshot);
    const markup = `<span class="wp-status-time">${escapeHtml(now.time)}</span><span class="wp-status-icons">${signalBars(snapshot.connected)}<span class="wp-wifi">⌁</span><span class="wp-battery"><i></i></span></span>`;
    if (markup === statusMarkup) return;
    statusMarkup = markup;
    statusbar.innerHTML = markup;
  }

  function showLock() {
    disposeCurrentApp();
    current = 'lock';
    delete screen.dataset.homeEditing;
    renderLock(screen, snapshot, showHome);
    paintStatusbar();
  }

  function showHome() {
    disposeCurrentApp();
    current = 'home';
    renderHome(screen, snapshot, openApp, showLock);
    paintStatusbar();
  }

  async function toggleMomentLike(momentId, liked) {
    try {
      const next = await setWorldBackstageMomentLiked(momentId, liked);
      snapshot = next;
      if (current === 'app:wechat') repaintWechat();
    } catch (error) {
      console.warn('[世界小手机] 点赞操作未完成：', error);
      if (current === 'app:wechat') {
        const area = screen.querySelector('[data-wx-content]');
        if (area) area.insertAdjacentHTML('afterbegin', '<p role="alert">点赞失败，请确认世界背面连接和权限后重试。</p>');
      }
    }
  }

  function repaintWechat() {
    current = 'app:wechat';
    renderWeChat(screen, snapshot, wechatRoute, repaintWechat, showHome, toggleMomentLike);
    paintStatusbar();
  }

  function openWechatConversation(conversationId) {
    if (readPhoneGameMode() === 'game') return false;
    const id = String(conversationId || '').trim();
    const latest = readWorldBackstage();
    if (!id || !latest?.conversations?.some((conversation) => conversation.id === id)) return false;
    snapshot = latest;
    wechatRoute.tab = 'chats';
    wechatRoute.conversationId = id;
    repaintWechat();
    return true;
  }

  function shareNews(newsId) {
    const item = snapshot.news.find(entry => entry.id === newsId);
    if (item) shareContent(item);
  }

  function shareContent(item) {
    screen.querySelector('.wp-share-sheet')?.remove();
    const sheet = el('section', 'wp-share-sheet');
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-label', '分享内容');
    sheet.innerHTML = `<header><b>分享给朋友</b><button type="button" data-share-cancel aria-label="取消分享">×</button></header><p>选择聊天，编辑后再发送。</p><div>${snapshot.conversations.map(chat => `<button type="button" data-share-chat="${escapeHtml(chat.id)}">${escapeHtml(conversationTitle(chat, snapshot))}<span>↗</span></button>`).join('') || '<p>还没有可分享的会话，先在世界背面建立联系。</p>'}</div>`;
    screen.append(sheet);
    sheet.querySelector('[data-share-cancel]').onclick = () => sheet.remove();
    sheet.querySelectorAll('[data-share-chat]').forEach(button => button.onclick = () => {
      const draft = `分享：${item.headline}\n${item.summary || ''}\n${item.source || '世界动态'}`.slice(0, 1600);
      if (openWechatConversation(button.dataset.shareChat)) {
        screen.dispatchEvent(new CustomEvent('world-phone:compose-draft', { bubbles: true, detail: { conversationId: button.dataset.shareChat, text: draft } }));
      }
    });
    sheet.querySelector('button')?.focus();
  }

  function openApp(app, options = {}) {
    disposeCurrentApp();
    current = `app:${app}`;
    if (readPhoneGameMode() === 'game' && ['phone', 'messages'].includes(app)) {
      disposeApp = renderPhoneGameCommunicationApp(screen, { app, goHome: showHome, openApp, ...options });
    }
    else if (readPhoneGameMode() === 'game' && ['wechat', 'weibo', 'rednote', 'wallet', 'delivery'].includes(app)) {
      disposeApp = renderPhoneGameApp(screen, { app, goHome: showHome, openApp, ...options });
    }
    else if (app === 'phone' || app === 'messages') renderNativeCommunicationApp(screen, { app, goHome: showHome });
    else if (app === 'wechat') repaintWechat();
    else if (app === 'news') renderNews(screen, snapshot, showHome, shareNews);
    else if (app === 'puzzle') renderPocketGame(screen, { goHome: showHome });
    else if (app === 'wallet') renderWalletApp(screen, { goHome: showHome });
    else if (app === 'delivery') renderDeliveryApp(screen, { goHome: showHome });
    else if (app === 'casino') renderCasinoApp(screen, { goHome: showHome });
    else if (app === 'music') renderMusicApp(screen, { goHome: showHome });
    else if (app === 'settings') renderSettings(screen, snapshot, showHome, resetHomeLayout);
    else renderPlaceholder(screen, app, snapshot, showHome);
    paintStatusbar();
  }

  function refresh(nextSnapshot = null) {
    const nextScope = chatScope();
    const nextGameScope = capturePhoneGameScope().key;
    const nextModeEpoch = capturePhoneGameScope().modeEpoch;
    if (nextModeEpoch !== modeEpoch && current.startsWith('app:')) current = 'home';
    modeEpoch = nextModeEpoch;
    if (nextGameScope !== gameScope && screen.querySelector('[data-phone-game-app]')) current = 'home';
    gameScope = nextGameScope;
    const nextScopeKey = worldScopeKey();
    const sameScope = nextScope === scope && nextScopeKey === scopeKey;
    if (!sameScope) {
      scope = nextScope;
      scopeKey = nextScopeKey;
      wechatRoute.conversationId = '';
      wechatRoute.tab = 'chats';
      composing = false;
      if (screen.querySelector('[data-phone-game-app]') || ['app:wechat', 'app:delivery', 'app:phone', 'app:messages'].includes(current)) current = 'home';
    }
    if (sameScope && composing && current === 'app:wechat') { pendingRefresh = true; return; }
    snapshot = nextSnapshot || readWorldBackstage();
    const sheet = sameScope ? screen.querySelector('.wp-social-sheet, .wp-wxr-contact-sheet, .wp-share-sheet') : null;
    if (!sameScope) screen.querySelectorAll('.wp-social-sheet, .wp-wxr-contact-sheet, .wp-share-sheet').forEach(item => item.remove());
    const focused = sheet?.contains(document.activeElement) ? document.activeElement : null;
    sheet?.remove();
    if (current === 'lock') showLock();
    else if (current === 'home') {
      if (screen.dataset.homeEditing === '1') paintStatusbar();
      else showHome();
    }
    else if (current === 'app:wechat' && readPhoneGameMode() !== 'game') repaintWechat();
    else if (current === 'app:news' || current === 'app:settings') openApp(current.slice(4));
    else paintStatusbar();
    if (sheet) { screen.append(sheet); focused?.focus({ preventScroll: true }); }
  }

  function openStage() {
    window.clearTimeout(closeTimer);
    launcher.setAttribute('aria-expanded', 'true');
    refresh();
    stage.hidden = false;
    requestAnimationFrame(() => stage.classList.add('is-open'));
  }

  function closeStage() {
    stage.classList.remove('is-open');
    launcher.setAttribute('aria-expanded', 'false');
    closeTimer = window.setTimeout(() => { stage.hidden = true; launcher.focus({ preventScroll: true }); }, 180);
  }

  launcher.addEventListener('click', openStage);
  // Registered before app enhancers: independent routes cannot reach world write handlers.
  const onGameAppClick = event => {
    if (readPhoneGameMode() !== 'game') return;
    const app = event.target?.closest?.('#world-phone-stage .wp-home [data-app]');
    if (!app || !['wechat', 'weibo', 'rednote', 'wallet', 'delivery', 'phone', 'messages'].includes(app.dataset.app) || screen.dataset.homeEditing === '1') return;
    event.preventDefault(); event.stopImmediatePropagation(); openApp(app.dataset.app);
  };
  document.addEventListener('click', onGameAppClick, true);
  close?.addEventListener('click', closeStage);
  stage.addEventListener('click', (event) => { if (event.target === stage) closeStage(); });
  power?.addEventListener('click', () => { if (current === 'lock') showHome(); else showLock(); });

  const onCompositionStart = () => { composing = true; };
  const onCompositionEnd = () => { composing = false; if (pendingRefresh) { pendingRefresh = false; refresh(); } };
  screen.addEventListener('compositionstart', onCompositionStart);
  screen.addEventListener('compositionend', onCompositionEnd);

  const onEscape = event => {
    if (event.key !== 'Escape' || stage.hidden || event.isComposing) return;
    const sheet = screen.querySelector('.wp-share-sheet');
    if (sheet) sheet.remove(); else closeStage();
  };
  document.addEventListener('keydown', onEscape);

  const unsubscribe = subscribeWorldBackstage((next) => refresh(next));
  const clockTimer = window.setInterval(() => {
    if (stage.hidden) return;
    snapshot = readWorldBackstage();
    paintStatusbar();
    if (current === 'lock') showLock();
  }, 30_000);

  showLock();
  console.info('[世界小手机] shell + live WeChat + news + wallet active');

  return {
    refresh,
    home: showHome,
    openApp,
    lock: showLock,
    openWechatConversation,
    shareContent,
    current: () => current,
    destroy() {
      disposeCurrentApp();
      unsubscribe?.();
      window.clearTimeout(closeTimer);
      document.removeEventListener('keydown', onEscape);
      document.removeEventListener('click', onGameAppClick, true);
      window.clearInterval(clockTimer);
      launcher.remove();
      stage.remove();
    },
  };
}
