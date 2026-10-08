import { LocalWerewolfGameController } from './werewolf-local-game.js';
import { roleLabel, WEREWOLF_PHASES } from './werewolf-local-engine.js';
import { crowHostMarkup, crowDealMarkup } from './werewolf-dm.js';

const APP_ID = 'werewolf-local';

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function phaseLabel(phase) {
  return ({
    night_wolves: '夜晚 · 狼人行动',
    night_seer: '夜晚 · 预言家查验',
    night_witch: '夜晚 · 女巫行动',
    day_discussion: '白天 · 公开讨论',
    day_vote: '白天 · 放逐投票',
    hunter_shot: '猎人发动技能',
    ended: '游戏结束',
  })[phase] || '准备开局';
}

function makeAppButton() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'wp-app is-werewolf-local';
  button.dataset.app = APP_ID;
  button.dataset.werewolfLocalManaged = '1';
  button.innerHTML = '<span class="wp-app-icon">狼</span><span>狼人杀</span>';
  return button;
}

function headerCopy(section, subtitle) {
  const header = section?.querySelector('.wp-app-header');
  if (!header) return;
  const title = header.querySelector('div > b');
  const sub = header.querySelector('div > small');
  if (title) title.textContent = '狼人杀';
  if (sub) sub.textContent = subtitle;
}

function landingMarkup(state) {
  return `<div class="wp-wwl-landing">
    ${crowHostMarkup(null)}<div class="wp-wwl-rule-strip"><span>狼人 · 隐藏阵营</span><span>神职 · 夜间技能</span><span>村民 · 观察与投票</span></div>
    <label class="wp-wwl-field"><span>你的名字</span><input data-wwl-name maxlength="24" value="玩家" autocomplete="off"></label>
    <label class="wp-wwl-field"><span>本局人数</span><div class="wp-wwl-total-picker"><button type="button" data-wwl-total-step="-1" aria-label="减少人数">−</button><select data-wwl-total aria-label="选择本局人数">${[6,7,8,9,10,11,12].map((n) => `<option value="${n}"${n === 6 ? ' selected' : ''}>${n} 人 · 你 + ${n - 1} 个 AI</option>`).join('')}</select><button type="button" data-wwl-total-step="1" aria-label="增加人数">＋</button></div></label>
    <button type="button" class="wp-wwl-primary" data-wwl-new>让鸦发牌</button>
    ${state.has_game ? '<button type="button" class="wp-wwl-ghost" data-wwl-resume>继续上次对局</button>' : ''}
    <details class="wp-wwl-privacy"><summary>怎么玩？</summary><span>夜晚按身份行动，白天讨论后投票放逐。好人找出全部狼人，狼人争取人数优势。对局自动保存在本机，可随时返回手机后继续；AI 发言由可用模型代演，无模型时使用本地策略。</span></details>
    ${state.error ? `<p class="wp-wwl-error">${esc(state.error)}</p>` : ''}
  </div>`;
}

function nameOf(view, playerId) {
  return view.players.find((player) => player.player_id === playerId)?.display_name || '未知玩家';
}

function playersMarkup(view) {
  return view.players.map((player, index) => `<div class="wp-wwl-player ${player.alive ? '' : 'is-dead'}">
    <span class="wp-wwl-seat-number">${String(index + 1).padStart(2, '0')}</span><span class="wp-wwl-avatar">${esc(player.display_name.slice(0, 1))}</span>
    <span class="wp-wwl-player-copy"><b>${esc(player.display_name)}</b><small>${player.kind === 'human' ? '你' : 'AI 玩家'}${player.role ? ` · ${esc(roleLabel(player.role))}` : ''}</small></span>
    <span class="wp-wwl-badges">${player.alive ? '' : '<i>出局</i>'}</span>
  </div>`).join('');
}

function publicMessagesMarkup(view) {
  const messages = view.public_messages.slice(-80);
  if (!messages.length) return '<div class="wp-wwl-empty">白天还没人开口。</div>';
  return messages.map((message) => `<div class="wp-wwl-message" data-message-id="${esc(message.message_id)}"><b>${esc(nameOf(view, message.player_id))}</b><p>${esc(message.text)}</p></div>`).join('');
}

function wolfMessagesMarkup(view) {
  const messages = view.wolf_messages.filter((message) => message.round_number === view.round_number).slice(-40);
  if (!messages.length) return '<div class="wp-wwl-empty">狼队今晚还没说话。</div>';
  return messages.map((message) => `<div class="wp-wwl-message is-wolf"><b>${esc(nameOf(view, message.player_id))}</b><p>${esc(message.text)}</p></div>`).join('');
}

function targetButtons(view, action, targets) {
  return (targets || []).map((id) => `<button type="button" class="wp-wwl-target" data-wwl-action="${esc(action)}" data-target-id="${esc(id)}" aria-pressed="false"><small>${view.players.findIndex(player => player.player_id === id) + 1} 号</small>${esc(nameOf(view, id))}</button>`).join('');
}

function seerKnowledge(view) {
  if (!view.seer_checks?.length) return '';
  return `<div class="wp-wwl-secret"><b>你的查验记录</b>${view.seer_checks.map((check) => `<span>${esc(nameOf(view, check.target_id))} · ${check.alignment === 'wolves' ? '狼人阵营' : '好人阵营'}</span>`).join('')}</div>`;
}

function phaseActionMarkup(state) {
  const view = state.view;
  const self = view.players.find((player) => player.player_id === view.self_player_id);
  if (view.phase === WEREWOLF_PHASES.ended) {
    return `<div class="wp-wwl-result"><b>${view.winner === 'wolves' ? '狼人阵营胜利' : '好人阵营胜利'}</b><span>${esc(view.win_reason)}</span></div>`;
  }
  if (state.busy) return '<div class="wp-wwl-thinking"><i></i><span>AI 正在思考这一桌的下一步…</span></div>';
  if (view.phase === WEREWOLF_PHASES.wolves && view.your_role === 'wolf' && self?.alive && !view.submitted.wolf) {
    return `<section class="wp-wwl-action"><b>今晚狼队刀谁？</b>${targetButtons(view, 'wolf_kill', view.legal_targets.wolf_kill)}</section>`;
  }
  if (view.phase === WEREWOLF_PHASES.seer && view.your_role === 'seer' && self?.alive && !view.submitted.seer) {
    return `<section class="wp-wwl-action"><b>选择一名玩家查验</b>${targetButtons(view, 'seer_check', view.legal_targets.seer_check)}</section>`;
  }
  if (view.phase === WEREWOLF_PHASES.witch && view.your_role === 'witch' && self?.alive && !view.submitted.witch) {
    return `<section class="wp-wwl-action"><b>女巫行动</b>
      ${view.witch?.wolf_target && view.witch?.antidote_available ? `<button type="button" class="wp-wwl-target" data-witch-choice="save">救 ${esc(nameOf(view, view.witch.wolf_target))}</button>` : ''}
      ${view.witch?.poison_available ? `<select data-witch-poison><option value="">选择毒杀目标</option>${view.legal_targets.witch_poison.map((id) => `<option value="${esc(id)}">${esc(nameOf(view, id))}</option>`).join('')}</select><button type="button" class="wp-wwl-target" data-witch-choice="poison">使用毒药</button>` : ''}
      <button type="button" class="wp-wwl-ghost" data-witch-choice="pass">今晚不用药</button>
    </section>`;
  }
  if (view.phase === WEREWOLF_PHASES.hunter && view.hunter_pending) {
    return `<section class="wp-wwl-action"><b>猎人最后一枪</b>${targetButtons(view, 'hunter_shot', view.legal_targets.hunter_shot)}<button type="button" class="wp-wwl-ghost" data-wwl-action="hunter_pass">不开枪</button></section>`;
  }
  if (view.phase === WEREWOLF_PHASES.vote && self?.alive && !view.submitted.vote) {
    return `<section class="wp-wwl-action"><b>放逐投票 · ${view.vote_progress}/${view.vote_total}</b>${targetButtons(view, 'vote', view.legal_targets.vote)}</section>`;
  }
  if (!self?.alive) return '<div class="wp-wwl-spectator">你已经出局，现在以观战视角看这桌继续发疯。</div>';
  return '<div class="wp-wwl-waiting">当前没有需要你提交的操作。</div>';
}

function discussionMarkup(state) {
  const view = state.view;
  if (view.phase !== WEREWOLF_PHASES.discussion) return '';
  const self = view.players.find((player) => player.player_id === view.self_player_id);
  return `<section class="wp-wwl-chat">
    <div class="wp-wwl-chat-title"><b>白天公聊</b><small>${self?.alive ? '你也可以发言' : '观战中'}</small></div>
    <div class="wp-wwl-messages">${publicMessagesMarkup(view)}</div>
    ${self?.alive && !state.busy ? '<form data-wwl-chat="public"><input maxlength="500" placeholder="说点什么…" autocomplete="off"><button>发送</button></form>' : ''}
    ${view.day_ready_for_vote && !state.busy ? '<button type="button" class="wp-wwl-primary" data-wwl-finish-talk>进入投票</button>' : ''}
  </section>`;
}

function wolfChatMarkup(state) {
  const view = state.view;
  const self = view.players.find((player) => player.player_id === view.self_player_id);
  if (view.phase !== WEREWOLF_PHASES.wolves || view.your_role !== 'wolf' || !self?.alive) return '';
  return `<section class="wp-wwl-chat is-wolf"><div class="wp-wwl-chat-title"><b>狼人夜聊</b><small>只有活着的狼能看到</small></div><div class="wp-wwl-messages">${wolfMessagesMarkup(view)}</div>${!state.busy ? '<form data-wwl-chat="wolves"><input maxlength="500" placeholder="和狼队友说一句…" autocomplete="off"><button>发送</button></form>' : ''}</section>`;
}

function gameMarkup(state) {
  const view = state.view;
  return `<div class="wp-wwl-game" data-game-id="${esc(view.game_id)}">
    ${crowHostMarkup(view)}
    <section class="wp-wwl-phase"><div><small>第 ${view.round_number} 轮</small><b>${esc(phaseLabel(view.phase))}</b></div><span class="wp-wwl-role">你是 ${esc(roleLabel(view.your_role))}</span></section>
    ${seerKnowledge(view)}
    <nav class="wp-wwl-phase-track" aria-label="对局阶段">${[['night','夜晚行动'],['day_discussion','公开讨论'],['day_vote','放逐投票']].map(([key,label]) => `<span class="${view.phase.startsWith(key) ? 'is-current' : ''}">${label}</span>`).join('')}</nav>
    ${phaseActionMarkup(state)}
    <div class="wp-wwl-confirm" data-wwl-confirm-host hidden></div>
    ${wolfChatMarkup(state)}
    ${discussionMarkup(state)}
    <details class="wp-wwl-players" open><summary>在场 ${view.players.filter(player => player.alive).length} / ${view.players.length}<span>座位一览</span></summary><div class="wp-wwl-seat-grid">${playersMarkup(view)}</div></details>
    ${view.phase !== WEREWOLF_PHASES.discussion && view.public_messages.length ? `<details class="wp-wwl-chat"><summary>回看公开发言</summary><div class="wp-wwl-messages">${publicMessagesMarkup(view)}</div></details>` : ''}
    ${state.error ? `<p class="wp-wwl-error">${esc(state.error)}</p>` : ''}
    <button type="button" class="wp-wwl-ghost wp-wwl-abandon" data-wwl-abandon>${view.phase === WEREWOLF_PHASES.ended ? '回到开局页' : '放弃这局'}</button>
  </div>`;
}

export function mountLocalWerewolfIntegration({ phone } = {}) {
  let destroyed = false;
  let active = false;
  let routing = false;
  let refreshQueued = false;
  const controller = new LocalWerewolfGameController();
  let pendingAction = null;
  let paintKey = '';
  let abandonConfirmed = false;

  function syncHome() {
    if (destroyed) return;
    const grid = document.querySelector('#world-phone-stage .wp-home [data-app-grid]');
    if (grid && !grid.querySelector('[data-werewolf-local-managed="1"]')) grid.append(makeAppButton());
  }

  function routeThroughShell() {
    const home = document.querySelector('#world-phone-stage .wp-home');
    const bridge = home?.querySelector('[data-app="settings"]') || home?.querySelector('[data-app]:not([data-werewolf-local-managed="1"])');
    if (!bridge) return false;
    const original = bridge.dataset.app;
    routing = true;
    try {
      bridge.dataset.app = APP_ID;
      bridge.click();
    } finally {
      bridge.dataset.app = original;
      routing = false;
    }
    return true;
  }

  function openLocalWerewolf() {
    active = true;
    if (routeThroughShell()) window.setTimeout(queueRefresh, 0);
  }

  function paint() {
    if (!active || destroyed) return;
    const section = document.querySelector('#world-phone-stage .wp-native-app');
    if (!section) return;
    section.classList.add('wp-werewolf-local-app');
    const state = controller.getState();
    headerCopy(section, state.deal_pending ? '乌鸦发牌 · 收好你的身份' : state.view ? `${phaseLabel(state.view.phase)} · 本地对局` : '乌鸦主持 · 本地对局');
    const old = section.querySelector('.wp-placeholder-card, .wp-wwl-shell');
    if (!old) return;
    const key = state.view ? `${state.view.game_id}:${state.view.round_number}:${state.view.phase}` : 'landing';
    const samePhase = key === paintKey;
    const scrollTop = samePhase ? old.scrollTop : 0;
    const input = old.querySelector('input:focus');
    const drafts = [...old.querySelectorAll('[data-wwl-chat]')].map(form => ({channel:form.dataset.wwlChat, value:form.querySelector('input')?.value || ''}));
    const focusedChannel = input?.closest('[data-wwl-chat]')?.dataset.wwlChat;
    const selection = input ? [input.selectionStart, input.selectionEnd] : null;
    const seatsOpen = old.querySelector('.wp-wwl-players')?.open ?? true;
    if (!samePhase || state.busy) pendingAction = null;
    paintKey = key;
    abandonConfirmed = false;
    old.className = 'wp-wwl-shell';
    old.innerHTML = state.deal_pending ? crowDealMarkup(state) : state.view ? gameMarkup(state) : landingMarkup(state);
    if (samePhase) {
      old.querySelector('.wp-wwl-players')?.toggleAttribute('open', seatsOpen);
      for (const draft of drafts) {
        const field = old.querySelector(`[data-wwl-chat="${draft.channel}"] input`);
        if (field) { field.value = draft.value; if (focusedChannel === draft.channel) { field.focus({preventScroll:true}); if (selection) field.setSelectionRange(...selection); } }
      }
    }
    old.scrollTop = scrollTop;
    bind(section, state);
    showPending(section);
  }

  function showPending(section) {
    const host = section.querySelector('[data-wwl-confirm-host]');
    if (!host) return;
    host.hidden = !pendingAction;
    section.querySelectorAll('[data-wwl-action]').forEach(button => button.setAttribute('aria-pressed', String(Boolean(pendingAction && button.dataset.targetId === pendingAction.target_id && button.dataset.wwlAction === pendingAction.type))));
    if (!pendingAction) { host.replaceChildren(); return; }
    host.innerHTML = `<span>已选择 <b>${esc(nameOf(controller.getState().view, pendingAction.target_id))}</b></span><button type="button" data-wwl-confirm>确认${pendingAction.type === 'vote' ? '投票' : '行动'}</button><button type="button" data-wwl-cancel aria-label="取消选择">×</button>`;
    host.querySelector('[data-wwl-cancel]').onclick = () => { pendingAction = null; showPending(section); };
    host.querySelector('[data-wwl-confirm]').onclick = () => {
      const action = pendingAction; pendingAction = null; showPending(section);
      if (action) guarded(() => controller.humanAction(action));
    };
  }

  function queueRefresh() {
    if (destroyed || refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(() => {
      refreshQueued = false;
      syncHome();
      paint();
    });
  }

  async function guarded(task) {
    try { await task(); } catch (error) { controller.error = String(error?.message || error); controller.emit(); }
    queueRefresh();
  }

  function bind(section, state) {
    section.querySelectorAll('[data-wwl-total-step]').forEach((button) => button.addEventListener('click', () => {
      const select = section.querySelector('[data-wwl-total]');
      if (!select) return;
      const next = Math.max(6, Math.min(12, Number(select.value || 6) + Number(button.dataset.wwlTotalStep || 0)));
      select.value = String(next);
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }));
    section.querySelector('[data-wwl-new]')?.addEventListener('click', () => guarded(() => controller.newGame({
      humanName: section.querySelector('[data-wwl-name]')?.value || '玩家',
      totalPlayers: Number(section.querySelector('[data-wwl-total]')?.value || 6),
      awaitDeal: true,
    })));
    section.querySelector('[data-wwl-deal-reveal]')?.addEventListener('click', () => guarded(() => controller.revealDeal()));
    section.querySelector('[data-wwl-deal-confirm]')?.addEventListener('click', () => guarded(() => controller.confirmDeal()));
    section.querySelector('[data-wwl-resume]')?.addEventListener('click', () => guarded(() => controller.resume()));
    section.querySelector('[data-wwl-abandon]')?.addEventListener('click', event => {
      if (!abandonConfirmed && state.view?.phase !== WEREWOLF_PHASES.ended) { abandonConfirmed = true; event.currentTarget.textContent = '确认结束这局？再次点击放弃'; return; }
      abandonConfirmed = false; controller.abandon(); queueRefresh();
    });
    section.querySelector('[data-wwl-finish-talk]')?.addEventListener('click', () => guarded(() => controller.finishDiscussion()));
    section.querySelectorAll('[data-wwl-action]').forEach(button => button.addEventListener('click', () => {
      if (state.busy) return;
      const type = button.dataset.wwlAction;
      if (type === 'hunter_pass') { guarded(() => controller.humanAction({ type })); return; }
      pendingAction = { type, target_id: button.dataset.targetId || '' };
      showPending(section);
      section.querySelector('[data-wwl-confirm-host]')?.scrollIntoView({block:'nearest'});
    }));
    section.querySelectorAll('[data-witch-choice]').forEach((button) => button.addEventListener('click', () => guarded(() => {
      const choice = button.dataset.witchChoice;
      const target_id = choice === 'poison' ? section.querySelector('[data-witch-poison]')?.value || '' : '';
      return controller.humanAction({ type: 'witch', choice, target_id });
    })));
    section.querySelectorAll('[data-wwl-chat]').forEach((form) => form.addEventListener('submit', (event) => {
      event.preventDefault();
      const input = form.querySelector('input');
      const text = input?.value || '';
      if (!text.trim()) return;
      input.value = '';
      guarded(() => controller.humanMessage(text));
    }));
  }

  function clickHandler(event) {
    const button = event.target?.closest?.('#world-phone-stage [data-app]');
    if (!button || routing) return;
    if (button.dataset.werewolfLocalManaged === '1') {
      event.preventDefault();
      event.stopImmediatePropagation();
      openLocalWerewolf();
      return;
    }
    active = false;
  }

  const unsubscribe = controller.subscribe(queueRefresh);
  document.addEventListener('click', clickHandler, true);
  const observer = new MutationObserver((records) => {
    const needsRefresh = records.some((record) => {
      const target = record.target?.nodeType === 1 ? record.target : record.target?.parentElement;
      return !target?.closest?.('#world-phone-stage .wp-werewolf-local-app');
    });
    if (needsRefresh) queueRefresh();
  });
  const observerRoot = document.querySelector('#world-phone-stage');
  if (observerRoot) observer.observe(observerRoot, { childList: true, subtree: true });
  queueRefresh();

  return () => {
    destroyed = true;
    unsubscribe();
    controller.destroy();
    document.removeEventListener('click', clickHandler, true);
    observer.disconnect();
    document.querySelectorAll('#world-phone-stage [data-werewolf-local-managed="1"]').forEach((node) => node.remove());
  };
}
