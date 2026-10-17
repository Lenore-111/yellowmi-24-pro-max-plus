import { renderWeiboMarkup, renderRedNoteMarkup } from './social-feed-ui.js';
import { phoneImagePath } from './phone-image-paths.js';
import { weiboAuthorName } from './phone-weibo-opinion.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const COUNT_KEY = 'echo_phone_feed_count:';

export function independentSocialHeader(platform, ui, canGenerate) {
  let count = 2;
  try {
    const saved = Number(globalThis.localStorage?.getItem(COUNT_KEY + platform));
    if (Number.isSafeInteger(saved) && saved > 0) count = saved;
  } catch {}
  const settings = platform === 'rednote' ? `<details class="wp-independent-feed-settings"><summary aria-label="生成设置">•••</summary><label>每次生成<input type="number" inputmode="numeric" min="1" step="1" value="${count}" data-pg-feed-count="rednote" aria-label="每次生成条数" ${ui.busy ? 'disabled' : ''}>条</label></details>` : '';
  return `<span class="wp-independent-feed-tools">${settings}<button type="button" data-pg-refresh="${esc(platform)}" ${ui.busy || !canGenerate ? 'disabled' : ''}>${ui.busy ? '正在更新…' : '刷新动态'}</button></span>`;
}

export function independentSocialItems(state, platform, timeLabel = () => '') {
  return state.posts.filter(post => post.platform === platform).slice().reverse().map(post => ({
    id: post.id, sourceId: post.id, kind: 'forum', author: weiboAuthorName(state, post),
    title: post.title, body: post.text, scope: post.category || post.mood || '',
    verified: false, heat: Number(post.heat) || 1, replies: post.replies || [],
    worldMinute: Number(post.tick) || 0, publishedWorldMinute: Number(post.tick) || 0,
    timeLabel: timeLabel(post), imageUrl: phoneImagePath(post.imageUrl),
    imageUrls: phoneImagePath(post.imageUrl) ? [phoneImagePath(post.imageUrl)] : [],
    tags: [...new Set([post.category || post.mood, ...(post.text.match(/#[^\s#，。！？,!?]{1,24}/g) || []).map(tag => tag.slice(1))].filter(Boolean))].slice(0, 4),
    coverSeed: Math.abs([...post.id].reduce((sum, char) => sum + char.charCodeAt(0), 0)) % 6,
    raw: { sourceKind: state.actors.some(actor => actor.id === post.actorId) ? 'moment' : 'passerby' },
  }));
}

function independentActions(markup) {
  const actions = {
    'data-social-detail-back': 'data-pg-post-back', 'data-social-detail': 'data-pg-post',
    'data-social-comment-jump': 'data-pg-comment-focus', 'data-social-tab': 'data-pg-view',
    'data-social-like': 'data-pg-like', 'data-social-save': 'data-pg-save',
    'data-social-share': 'data-pg-share', 'data-social-filter': 'data-pg-feed-filter',
    'data-note-category': 'data-pg-category', 'data-social-profile': 'data-pg-profile',
    'data-social-search': 'data-pg-search', 'data-social-clear': 'data-pg-search-clear',
  };
  return markup.replace(/<[^>]+>/g, tag => tag.replace(/data-(?:social-(?:detail-back|detail|comment-jump|tab|like|save|share|filter|profile|search|clear)|note-category)\b(?=\s|=|>)/g, key => actions[key])
    .replace(/^<input value=/, '<input data-pg-query value='));
}

export function renderIndependentSocialView(state, platform, ui, { timeLabel, replyMarkup = () => '', imageControls = () => '' } = {}) {
  const items = independentSocialItems(state, platform, timeLabel);
  const view = {
    tab: ui.tab === 'following' ? 'home' : ui.tab, query: ui.query || '', detailId: ui.postId || '',
    feedFilter: ui.tab === 'following' ? 'following' : ui.feedFilter || 'all',
    category: ui.category || 'all', profileView: ui.profileView || 'saved',
    saved: Object.fromEntries(ui.savedIds.map(id => [id, true])),
    liked: Object.fromEntries(state.posts.filter(post => post.liked).map(post => [post.id, true])),
  };
  const copy = {
    hotHint: '角色动态与讨论', hotEmpty: '有新的动态与讨论后会排到这里。',
    commentsTitle: '还没有讨论', commentsBody: '留一句话，开始这段互动。',
    emptyTitle: '这里还没有动态', emptyBody: state.actors.length ? '点击上方刷新动态，看看角色最近在做什么。' : '打开一位人物的聊天后，可以查看对方的动态。',
  };
  const snapshot = { connected: true, user: state.user };
  let markup = platform === 'weibo' ? renderWeiboMarkup(snapshot, view, items, copy) : renderRedNoteMarkup(snapshot, view, items, copy);
  const post = state.posts.find(item => item.id === ui.postId && item.platform === platform);
  if (post) {
    const actor = state.actors.find(item => item.id === post.actorId);
    const comments = state.events.filter(event => event.postId === post.id);
    const composer = actor ? `<form data-pg-comment class="echo-rn-comment-compose"><textarea rows="1" maxlength="1200" aria-label="评论内容" data-pg-draft ${ui.busy ? 'readonly' : ''} placeholder="给${esc(actor.name)}留一句话">${esc(ui.draft || '')}</textarea><button type="submit" ${ui.busy ? 'disabled' : ''}>评论</button></form>` : '';
    const interactions = `<section class="wp-social-comments wp-independent-comments" id="echo-rn-comments"><header><b>我的互动</b><span>${comments.length}</span></header>${comments.map(event => `<article class="echo-rn-comment"><b>${esc(state.user)}</b><p>${esc(event.text)}</p>${replyMarkup(event)}<button type="button" class="wpg-text-button" data-pg-export="${esc(event.id)}">带入正文…</button></article>`).join('')}${composer}${actor ? `<button type="button" class="wpg-text-button" data-pg-chat="${esc(actor.id)}">私信${esc(actor.name)}</button>` : ''}${imageControls(post, ui.imageBusy)}</section>`;
    markup = markup.replace(/<section class="wp-social-comments"[^>]*>[\s\S]*?<\/section>/, match => match + interactions);
  }
  return `<div class="wp-social-shell">${independentActions(markup)}</div>`;
}
