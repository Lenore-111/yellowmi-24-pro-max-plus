import { readSocialBucket, writeSocialBucket, socialScope } from './social-storage.js';
import { buildCommunicationRegistry } from './communication-registry.js';
import { readWorldBackstage, subscribeWorldBackstage } from './world-backstage-bridge.js';

const COMMUNICATION_STORAGE_KEY = 'world_phone_communication_realism_v1';

function text(value) {
  return String(value ?? '').trim();
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

function initials(name) {
  return escapeHtml(String(name || '?').trim().slice(0, 1) || '?');
}

function safeNumber(value) {
  return text(value).replace(/[^0-9+*#-]/g, '').slice(0, 24);
}

function defaultState() {
  return {
    phone: { tab: 'recents', draftNumber: '', favorites: {}, recents: [] },
    sms: { selectedPersonId: '', drafts: {} },
  };
}

export function sanitizeCommunicationRealismState(value) {
  const source = value && typeof value === 'object' ? value : {};
  const phone = source.phone && typeof source.phone === 'object' ? source.phone : {};
  const sms = source.sms && typeof source.sms === 'object' ? source.sms : {};
  const favorites = Object.fromEntries(Object.entries(phone.favorites && typeof phone.favorites === 'object' ? phone.favorites : {})
    .filter(([key, enabled]) => text(key) && Boolean(enabled))
    .slice(0, 200)
    .map(([key]) => [String(key).slice(0, 180), true]));
  const recents = (Array.isArray(phone.recents) ? phone.recents : [])
    .map((item) => ({
      id: text(item?.id).slice(0, 180),
      personId: text(item?.personId).slice(0, 180),
      number: safeNumber(item?.number),
      at: Math.max(0, Number(item?.at) || 0),
      outcome: item?.outcome === 'unavailable' ? 'unavailable' : 'unavailable',
    }))
    .filter((item) => item.id && item.number)
    .slice(-40);
  const drafts = Object.fromEntries(Object.entries(sms.drafts && typeof sms.drafts === 'object' ? sms.drafts : {})
    .map(([key, body]) => [String(key).slice(0, 180), String(body ?? '').slice(0, 1200)])
    .filter(([key, body]) => text(key) && body)
    .slice(0, 80));
  return {
    phone: {
      tab: ['recents', 'contacts', 'favorites', 'keypad'].includes(phone.tab) ? phone.tab : 'recents',
      draftNumber: safeNumber(phone.draftNumber),
      favorites,
      recents,
    },
    sms: {
      selectedPersonId: text(sms.selectedPersonId).slice(0, 180),
      drafts,
    },
  };
}

function loadState() { return sanitizeCommunicationRealismState(readSocialBucket(COMMUNICATION_STORAGE_KEY)); }
function saveState(state) { writeSocialBucket(COMMUNICATION_STORAGE_KEY, sanitizeCommunicationRealismState(state)); }

function formatAttemptTime(timestamp) {
  const date = new Date(Number(timestamp) || Date.now());
  if (Number.isNaN(date.getTime())) return '刚刚';
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function header(title, subtitle, backLabel = '返回桌面') {
  return `
    <header class="wp-comm-header">
      <button type="button" data-comm-home data-app-back aria-label="${escapeHtml(backLabel)}">‹</button>
      <div><b>${escapeHtml(title)}</b><small>${escapeHtml(subtitle)}</small></div>
      <span></span>
    </header>
  `;
}

function avatar(person) {
  const image = person?.avatar;
  if (image && /^(?:https?:\/\/|data:image\/)/i.test(image)) {
    return `<span class="wp-comm-avatar"><img src="${escapeHtml(image)}" alt=""></span>`;
  }
  return `<span class="wp-comm-avatar">${initials(person?.name)}</span>`;
}

function cellularData() {
  const snapshot = readWorldBackstage();
  const registry = buildCommunicationRegistry(snapshot);
  return {
    snapshot,
    people: registry.people.filter((person) => person.channels.cellular.available),
  };
}

function phoneTabs(active) {
  return `
    <nav class="wp-phone-dialer">
      <button type="button" data-phone-tab="favorites" class="${active === 'favorites' ? 'is-active' : ''}">☆<small>收藏</small></button>
      <button type="button" data-phone-tab="recents" class="${active === 'recents' ? 'is-active' : ''}">◷<small>最近</small></button>
      <button type="button" data-phone-tab="contacts" class="${active === 'contacts' ? 'is-active' : ''}">人<small>联系人</small></button>
      <button type="button" data-phone-tab="keypad" class="${active === 'keypad' ? 'is-active' : ''}">⌨<small>拨号键盘</small></button>
    </nav>
  `;
}

function phoneContactRow(person, state) {
  const favorite = Boolean(state.phone.favorites[person.personId]);
  return `
    <article class="wp-comm-row wp-phone-contact-row">
      ${avatar(person)}
      <div><b>${escapeHtml(person.name)}</b><small>${escapeHtml(person.channels.cellular.number)}${person.subtitle ? ` · ${escapeHtml(person.subtitle)}` : ''}</small></div>
      <div class="wp-comm-actions">
        <button type="button" data-phone-favorite="${escapeHtml(person.personId)}" class="${favorite ? 'is-active' : ''}" title="${favorite ? '取消收藏' : '收藏'}">${favorite ? '★' : '☆'}</button>
        <button type="button" class="wp-call-button" data-cell-call="${escapeHtml(person.personId)}" title="拨打手机电话">☎</button>
      </div>
    </article>
  `;
}

function renderPhoneBody(snapshot, people, state, notice) {
  if (notice) {
    return `<section class="wp-call-result"><span>☎</span><b>${escapeHtml(notice.name || notice.number)}</b><small>${escapeHtml(notice.number)}</small><p>无法接通：当前没有可用的通话服务。</p><button type="button" data-call-result-close>返回电话</button></section>`;
  }
  if (state.phone.tab === 'keypad') {
    const number = state.phone.draftNumber;
    return `
      <section class="wp-keypad">
        <div class="wp-keypad-display"><b>${escapeHtml(number || '输入号码')}</b><small>${number ? '本机拨号草稿' : '号码只保存在小手机本地'}</small></div>
        <div class="wp-keypad-grid">
          ${['1','2','3','4','5','6','7','8','9','*','0','#'].map((digit) => `<button type="button" data-keypad-digit="${digit}">${digit}</button>`).join('')}
        </div>
        <div class="wp-keypad-actions"><button type="button" data-keypad-backspace>⌫</button><button type="button" data-keypad-call class="wp-keypad-call" ${number ? '' : 'disabled'}>☎</button><button type="button" data-keypad-clear>清除</button></div>
      </section>
    `;
  }
  if (state.phone.tab === 'recents') {
    const recents = [...state.phone.recents].reverse();
    if (!recents.length) return `<div class="wp-comm-empty"><b>暂无最近通话</b><p>拨号尝试会留在本机，但不会伪造世界里真的接通了一通电话。</p></div>`;
    return `<div class="wp-comm-list">${recents.map((item) => {
      const person = people.find((candidate) => candidate.personId === item.personId);
      return `<button type="button" class="wp-comm-row wp-recent-row" data-recent-number="${escapeHtml(item.number)}"><span class="wp-comm-avatar">${initials(person?.name || item.number)}</span><div><b>${escapeHtml(person?.name || item.number)}</b><small>未接通 · ${formatAttemptTime(item.at)}</small></div><span>›</span></button>`;
    }).join('')}</div>`;
  }
  const visible = state.phone.tab === 'favorites' ? people.filter((person) => state.phone.favorites[person.personId]) : people;
  if (!visible.length) {
    return `<div class="wp-comm-empty"><b>${state.phone.tab === 'favorites' ? '还没有收藏联系人' : '还没有可拨打的号码'}</b><p>${state.phone.tab === 'favorites' ? '在联系人页点星标即可收藏。' : '微信好友不会自动变成电话联系人；世界里真正记录了手机号后，这里才会出现。'}</p></div>`;
  }
  return `<div class="wp-comm-list">${visible.map((person) => phoneContactRow(person, state)).join('')}</div>`;
}

function renderPhone(screen, goHome, state, context) {
  const { snapshot, people } = cellularData();
  const label = { recents: '最近通话', contacts: '联系人', favorites: '收藏', keypad: '拨号键盘' }[state.phone.tab] || '电话';
  screen.innerHTML = `
    <section class="wp-view wp-comm-app wp-phone-app">
      ${header('电话', snapshot.connected ? `蜂窝通讯 · ${label}` : '未连接世界背面')}
      <main class="wp-comm-body">${renderPhoneBody(snapshot, people, state, context.phoneNotice)}</main>
      ${phoneTabs(state.phone.tab)}
    </section>
  `;
  screen.querySelector('[data-comm-home]')?.addEventListener('click', goHome);
  screen.querySelector('[data-call-result-close]')?.addEventListener('click', () => { context.phoneNotice = null; renderPhone(screen, goHome, state, context); });
  screen.querySelectorAll('[data-phone-tab]').forEach((button) => button.addEventListener('click', () => {
    context.phoneNotice = null;
    state.phone.tab = button.dataset.phoneTab;
    saveState(state);
    renderPhone(screen, goHome, state, context);
  }));
  screen.querySelectorAll('[data-phone-favorite]').forEach((button) => button.addEventListener('click', () => {
    const id = button.dataset.phoneFavorite;
    if (state.phone.favorites[id]) delete state.phone.favorites[id]; else state.phone.favorites[id] = true;
    saveState(state);
    renderPhone(screen, goHome, state, context);
  }));

  const recordAttempt = (number, personId = '') => {
    const person = people.find((candidate) => candidate.personId === personId) || people.find((candidate) => candidate.channels.cellular.number === number);
    const normalized = safeNumber(number || person?.channels.cellular.number);
    if (!normalized) return;
    state.phone.recents.push({ id: `call:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`, personId: person?.personId || personId, number: normalized, at: Date.now(), outcome: 'unavailable' });
    state.phone.recents = state.phone.recents.slice(-40);
    saveState(state);
    context.phoneNotice = { number: normalized, name: person?.name || normalized };
    renderPhone(screen, goHome, state, context);
  };

  screen.querySelectorAll('[data-cell-call]').forEach((button) => button.addEventListener('click', () => {
    const person = people.find((candidate) => candidate.personId === button.dataset.cellCall);
    recordAttempt(person?.channels.cellular.number, person?.personId || '');
  }));
  screen.querySelectorAll('[data-recent-number]').forEach((button) => button.addEventListener('click', () => recordAttempt(button.dataset.recentNumber)));
  screen.querySelectorAll('[data-keypad-digit]').forEach((button) => button.addEventListener('click', () => {
    state.phone.draftNumber = safeNumber(`${state.phone.draftNumber}${button.dataset.keypadDigit}`);
    saveState(state);
    renderPhone(screen, goHome, state, context);
  }));
  screen.querySelector('[data-keypad-backspace]')?.addEventListener('click', () => {
    state.phone.draftNumber = state.phone.draftNumber.slice(0, -1);
    saveState(state);
    renderPhone(screen, goHome, state, context);
  });
  screen.querySelector('[data-keypad-clear]')?.addEventListener('click', () => {
    state.phone.draftNumber = '';
    saveState(state);
    renderPhone(screen, goHome, state, context);
  });
  screen.querySelector('[data-keypad-call]')?.addEventListener('click', () => recordAttempt(state.phone.draftNumber));
}

function smsListMarkup(snapshot, people, state) {
  if (!snapshot.connected) return `<div class="wp-comm-empty"><b>未连接世界背面</b><p>短信不会自己生成联系人或历史消息。</p></div>`;
  if (!people.length) return `<div class="wp-comm-empty"><b>暂无短信联系人</b><p>只有世界里确实记录了手机号的人物才会出现在这里。</p></div>`;
  return `<div class="wp-comm-list">${people.map((person) => {
    const draft = state.sms.drafts[person.personId] || '';
    return `<button type="button" class="wp-comm-row wp-sms-row" data-sms-person="${escapeHtml(person.personId)}">${avatar(person)}<div><b>${escapeHtml(person.name)}</b><small>${draft ? `草稿：${escapeHtml(draft.slice(0, 38))}` : `${escapeHtml(person.channels.cellular.number)} · 暂无短信记录`}</small></div><span>›</span></button>`;
  }).join('')}</div>`;
}

function smsThreadMarkup(person, state, context) {
  const draft = state.sms.drafts[person.personId] || '';
  return `
    <section class="wp-sms-thread">
      <div class="wp-sms-thread-head">${avatar(person)}<div><b>${escapeHtml(person.name)}</b><small>${escapeHtml(person.channels.cellular.number)}</small></div></div>
      <div class="wp-sms-history-empty"><span>短信</span><b>还没有短信记录</b><p>世界背面当前没有向小手机开放蜂窝短信历史与发送命令，所以这里不会把微信聊天冒充成短信。</p></div>
      ${context.smsNotice ? `<div class="wp-comm-notice">${escapeHtml(context.smsNotice)}</div>` : ''}
      <div class="wp-sms-compose-box"><textarea rows="3" maxlength="1200" data-sms-draft placeholder="短信草稿，只保存在本机">${escapeHtml(draft)}</textarea><div><small>${draft.length}/1200</small><button type="button" data-sms-send>发送</button></div></div>
    </section>
  `;
}

function renderSms(screen, goHome, state, context) {
  const { snapshot, people } = cellularData();
  const person = people.find((candidate) => candidate.personId === state.sms.selectedPersonId) || null;
  screen.innerHTML = `
    <section class="wp-view wp-comm-app wp-sms-app">
      ${header(person ? person.name : '短信', person ? person.channels.cellular.number : (snapshot.connected ? '号码消息' : '未连接世界背面'), person ? '返回短信' : '返回桌面')}
      <main class="wp-comm-body">${!person && context.smsNotice ? `<div class="wp-comm-notice" role="status">${escapeHtml(context.smsNotice)}</div>` : ''}${person ? smsThreadMarkup(person, state, context) : smsListMarkup(snapshot, people, state)}</main>
      ${person ? '' : '<button type="button" class="wp-sms-compose" aria-label="新短信" data-sms-new>＋</button>'}
    </section>
  `;
  screen.querySelector('[data-comm-home]')?.addEventListener('click', () => {
    if (person) {
      state.sms.selectedPersonId = '';
      context.smsNotice = '';
      saveState(state);
      renderSms(screen, goHome, state, context);
    } else goHome();
  });
  screen.querySelectorAll('[data-sms-person]').forEach((button) => button.addEventListener('click', () => {
    state.sms.selectedPersonId = button.dataset.smsPerson;
    context.smsNotice = '';
    saveState(state);
    renderSms(screen, goHome, state, context);
  }));
  screen.querySelector('[data-sms-new]')?.addEventListener('click', () => {
    context.smsNotice = people.length ? '选择一个有真实手机号的联系人开始写短信草稿。' : '没有可用手机号。';
    renderSms(screen, goHome, state, context);
  });
  const draft = screen.querySelector('[data-sms-draft]');
  draft?.addEventListener('input', () => {
    const body = String(draft.value || '').slice(0, 1200);
    if (body) state.sms.drafts[person.personId] = body; else delete state.sms.drafts[person.personId];
    saveState(state);
    const counter = draft.parentElement?.querySelector('small');
    if (counter) counter.textContent = `${body.length}/1200`;
  });
  screen.querySelector('[data-sms-send]')?.addEventListener('click', () => {
    const body = String(draft?.value || '').trim();
    if (!body) {
      context.smsNotice = '先写点什么。';
    } else {
      state.sms.drafts[person.personId] = body.slice(0, 1200);
      saveState(state);
      context.smsNotice = '短信发送接口尚未开放：草稿已保留在本机，没有伪造“已送达”。';
    }
    renderSms(screen, goHome, state, context);
  });
}

export function renderNativeCommunicationApp(screen, { app, goHome }) {
  const state = loadState();
  const context = { phoneNotice: null, smsNotice: '' };
  if (app === 'phone') renderPhone(screen, goHome, state, context);
  else renderSms(screen, goHome, state, context);
}

export function mountNativeCommunicationApps({ phone } = {}) {
  let state = loadState();
  let scope = socialScope();
  const context = { phoneNotice: null, smsNotice: '' };
  const clickHandler = (event) => {
    const appButton = event.target?.closest?.('[data-app="phone"], [data-app="messages"]');
    if (!appButton || !document.querySelector('#world-phone-stage')?.contains(appButton)) return;
    const screen = document.querySelector('#world-phone-stage [data-screen]');
    if (!screen || screen.dataset.homeEditing === '1') return;

    event.preventDefault();
    event.stopImmediatePropagation();

    // 先登记当前应用，避免刷新、后台切换仍把通讯页当成桌面。
    phone?.openApp?.(appButton.dataset.app);
    if (screen.querySelector('[data-phone-game-app], .wp-comm-app')) return;
    const goHome = () => typeof phone?.home === 'function' ? phone.home() : phone?.refresh?.();
    if (appButton.dataset.app === 'phone') {
      context.phoneNotice = null;
      renderPhone(screen, goHome, state, context);
    } else {
      context.smsNotice = '';
      renderSms(screen, goHome, state, context);
    }
  };

  const unsubscribe = subscribeWorldBackstage(() => { if (scope !== socialScope()) { scope = socialScope(); state = loadState(); if (document.querySelector('.wp-comm-app')) phone?.home?.(); } });
  document.addEventListener('click', clickHandler, true);
  return () => { unsubscribe(); document.removeEventListener('click', clickHandler, true); };
}

export { COMMUNICATION_STORAGE_KEY };
