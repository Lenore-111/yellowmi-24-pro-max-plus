import {
  markWorldBackstageConversationRead,
  readWorldBackstage,
  sendWorldBackstageMessage,
  subscribeWorldBackstage,
} from './world-backstage-bridge.js';
import { readPhoneGameMode } from './phone-game.js';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

function initials(name) {
  return escapeHtml(String(name || '?').trim().slice(0, 1) || '?');
}

function latestUnreadMessages(snapshot) {
  return (Array.isArray(snapshot?.unreadNotices) ? snapshot.unreadNotices : [])
    .filter((notice) => notice.kind === 'message')
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, 2);
}

function ensureBadge(host, count, className = 'wp-system-badge') {
  if (!host) return;
  let badge = host.querySelector(`:scope > .${className}`);
  if (!count) {
    badge?.remove();
    return;
  }
  const label = count > 99 ? '99+' : String(count);
  if (!badge) {
    badge = document.createElement('span');
    badge.className = className;
    badge.textContent = label;
    host.append(badge);
    return;
  }
  if (badge.textContent !== label) badge.textContent = label;
}

function noticeSignature(notices) {
  return notices.map((notice) => [
    notice.id,
    notice.conversationId,
    notice.personName,
    notice.text,
    notice.readAt,
  ].join(':')).join('|');
}

function paintNotifications(snapshot) {
  const count = Math.max(0, Number(snapshot?.unreadMessageCount) || 0);
  ensureBadge(document.querySelector('#world-phone-launcher'), count, 'wp-launcher-badge');
  ensureBadge(document.querySelector('.wp-home [data-app="wechat"] .wp-app-icon'), count, 'wp-app-badge');

  const lock = document.querySelector('.wp-lockscreen');
  if (!lock) return;
  let list = lock.querySelector('.wp-lock-notifications');
  const notices = latestUnreadMessages(snapshot);
  if (!notices.length) {
    list?.remove();
    return;
  }
  const signature = noticeSignature(notices);
  if (!list) {
    list = document.createElement('div');
    list.className = 'wp-lock-notifications';
    const anchor = lock.querySelector('.wp-lock-connection');
    anchor?.insertAdjacentElement('afterend', list);
  }
  if (list.dataset.signature === signature) return;
  list.dataset.signature = signature;
  list.innerHTML = notices.map((notice) => `
    <button type="button" class="wp-lock-notification" data-notice-conversation="${escapeHtml(notice.conversationId)}">
      <span class="wp-lock-notification-avatar">${initials(notice.personName)}</span>
      <span><b>${escapeHtml(notice.personName)}</b><small>${escapeHtml(notice.text || '发来一条消息')}</small></span>
      <i>微信</i>
    </button>
  `).join('');
}

function enhanceCompose(activeConversationId) {
  const compose = document.querySelector('.wp-wx-thread-view .wp-wx-compose');
  if (!compose || compose.dataset.liveCompose === '1' || !activeConversationId) return;
  compose.dataset.liveCompose = '1';
  compose.innerHTML = `
    <button type="button" class="wp-wx-compose-mode" aria-label="输入方式">⌨</button>
    <textarea rows="1" maxlength="1600" data-wx-compose-input placeholder="发消息"></textarea>
    <button type="button" class="wp-wx-send" data-wx-send>发送</button>
  `;
}

export function mountPhoneInteractions({ phone } = {}) {
  let activeConversationId = '';
  const drafts = new Map();
  let lastUnreadSignature = '';
  let destroyed = false;
  let refreshQueued = false;
  let sending = false;
  let draftContext = null;
  const syncConversation = () => {
    const ctx = globalThis.SillyTavern?.getContext?.();
    const scope = ctx?.chatMetadata ?? ctx?.chat_metadata ?? null;
    if (scope !== draftContext) { drafts.clear(); draftContext = scope; }
    activeConversationId = document.querySelector('#world-phone-stage [data-conversation-id]')?.dataset.conversationId || '';
  };

  const submitActiveCompose = () => {
    syncConversation();
    if (sending || !activeConversationId) return;
    const compose = document.querySelector('.wp-wx-thread-view .wp-wx-compose[data-live-compose="1"]');
    const input = compose?.querySelector('[data-wx-compose-input]');
    const send = compose?.querySelector('[data-wx-send]');
    const body = String(input?.value || '').trim();
    if (!compose || !input || !send || !body) return;

    sending = true;
    send.disabled = true;
    try {
      sendWorldBackstageMessage(activeConversationId, body);
      drafts.delete(activeConversationId);
      input.value = '';
      delete compose.dataset.error;
      phone?.refresh?.();
    } catch (error) {
      const message = String(error?.message || error || '发送失败');
      if (!message.includes('手机桥未连接')) console.error('[世界小手机] 微信发送失败:', error);
      compose.dataset.error = message;
    } finally {
      sending = false;
      send.disabled = false;
    }
  };

  const refreshEnhancements = (snapshot = readWorldBackstage()) => {
    if (destroyed) return;
    if (readPhoneGameMode() === 'game') {
      paintNotifications({ unreadMessageCount: 0, unreadNotices: [] });
      return;
    }
    syncConversation();
    paintNotifications(snapshot);
    enhanceCompose(activeConversationId);
    const input = document.querySelector('.wp-wx-thread-view .wp-wx-compose[data-live-compose="1"] [data-wx-compose-input]');
    const draft = drafts.get(activeConversationId);
    if (input && draft && document.activeElement !== input && input.value !== draft) input.value = draft;

    const signature = noticeSignature(latestUnreadMessages(snapshot));
    if (lastUnreadSignature && signature !== lastUnreadSignature && snapshot.unreadMessageCount > 0) {
      const device = document.querySelector('.wp-device');
      device?.classList.remove('is-notification-pulse');
      requestAnimationFrame(() => device?.classList.add('is-notification-pulse'));
    }
    lastUnreadSignature = signature;
  };

  const queueRefresh = () => {
    if (refreshQueued || destroyed) return;
    refreshQueued = true;
    requestAnimationFrame(() => {
      refreshQueued = false;
      refreshEnhancements();
    });
  };

  const clickHandler = (event) => {
    if (readPhoneGameMode() === 'game') return;
    const sendButton = event.target?.closest?.('[data-wx-send]');
    if (sendButton) {
      event.preventDefault();
      submitActiveCompose();
      return;
    }

    const chatButton = event.target?.closest?.('[data-wx-chat]');
    if (chatButton?.dataset?.wxChat) {
      activeConversationId = chatButton.dataset.wxChat;
      markWorldBackstageConversationRead(activeConversationId);
      setTimeout(queueRefresh, 0);
      return;
    }

    const lockNotice = event.target?.closest?.('[data-notice-conversation]');
    if (lockNotice?.dataset?.noticeConversation) {
      activeConversationId = lockNotice.dataset.noticeConversation;
      markWorldBackstageConversationRead(activeConversationId);
      phone?.wakeScreen?.();
      if (phone?.openWechatConversation?.(activeConversationId)) {
        setTimeout(queueRefresh, 0);
        return;
      }
      document.querySelector('[data-unlock]')?.click();
      setTimeout(() => {
        document.querySelector('[data-app="wechat"]')?.click();
        setTimeout(() => {
          document.querySelector(`[data-wx-chat="${CSS.escape(activeConversationId)}"]`)?.click();
        }, 40);
      }, 40);
    }
  };

  const keydownHandler = (event) => {
    if (!event.target?.matches?.('[data-wx-compose-input]')) return;
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      submitActiveCompose();
    }
  };

  const inputHandler = (event) => {
    if (!event.target?.matches?.('[data-wx-compose-input]') || !activeConversationId) return;
    const value = String(event.target.value || '');
    if (value) drafts.set(activeConversationId, value);
    else drafts.delete(activeConversationId);
  };

  const openConversationHandler = event => {
    if (phone?.openWechatConversation?.(event.detail?.conversationId)) {
      syncConversation();
      markWorldBackstageConversationRead(activeConversationId);
      refreshEnhancements();
    }
  };
  document.addEventListener('world-phone:open-conversation', openConversationHandler);
  const draftHandler = event => {
    syncConversation();
    if (!activeConversationId || event.detail?.conversationId !== activeConversationId) return;
    markWorldBackstageConversationRead(activeConversationId);
    const previous = drafts.get(activeConversationId) || '';
    drafts.set(activeConversationId, `${previous}${previous ? '\n' : ''}${event.detail.text}`.slice(0, 1600));
    refreshEnhancements();
    document.querySelector('[data-wx-compose-input]')?.focus();
  };
  document.addEventListener('world-phone:compose-draft', draftHandler);
  document.addEventListener('click', clickHandler, true);
  document.addEventListener('keydown', keydownHandler, true);
  document.addEventListener('input', inputHandler, true);
  const observer = new MutationObserver(queueRefresh);
  observer.observe(document.body, { childList: true, subtree: true });
  const unsubscribe = subscribeWorldBackstage((snapshot) => {
    setTimeout(() => refreshEnhancements(snapshot), 0);
  });
  const poll = window.setInterval(queueRefresh, 3000);

  refreshEnhancements();

  return () => {
    destroyed = true;
    document.removeEventListener('world-phone:open-conversation', openConversationHandler);
    document.removeEventListener('world-phone:compose-draft', draftHandler);
    document.removeEventListener('click', clickHandler, true);
    document.removeEventListener('keydown', keydownHandler, true);
    document.removeEventListener('input', inputHandler, true);
    observer.disconnect();
    unsubscribe?.();
    window.clearInterval(poll);
  };
}
