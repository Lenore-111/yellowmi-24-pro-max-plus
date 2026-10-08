import { CASINO_MAX_BET, CASINO_MIN_BET, placeCasinoBet, readCasinoState } from './casino.js';

const SLOT_SYMBOLS = ['🍒', '🍋', '🔔', '⭐', '7'];
const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const SLOT_REEL_DURATIONS = [1880, 2220, 2580];
const ROULETTE_WHEEL_DURATION_MS = 3800;
const ROULETTE_BALL_DURATION_MS = 4100;

const GAME_META = {
  slots: {
    title: '老虎机',
    kicker: 'LUCKY SEVEN',
    rule: '三枚 7 = 10× · 三连 = 5× · 任意对子 = 2×',
    action: '转动滚轴',
    actionHint: '拉下去',
    choices: [],
  },
  roulette: {
    title: '轮盘',
    kicker: 'ROULETTE',
    rule: '0–36 · 红 / 黑 / 单 / 双命中返 2× · 0 为绿色',
    action: '转动轮盘',
    actionHint: '封盘',
    choices: [['red', '红'], ['black', '黑'], ['odd', '单'], ['even', '双']],
  },
  dice: {
    title: '骰子',
    kicker: 'DICE TABLE',
    rule: '大 4–6 · 小 1–3 · 单 / 双命中返 2×',
    action: '摇骰开盅',
    actionHint: '开盅',
    choices: [['big', '大'], ['small', '小'], ['odd', '单'], ['even', '双']],
  },
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function sleep(milliseconds) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}

function reducedMotion() {
  try { return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true; } catch { return false; }
}

function monotonicNow() {
  return Number(globalThis.performance?.now?.()) || Date.now();
}

async function animationFinished(animation, fallbackMs) {
  if (!animation?.finished) {
    await sleep(fallbackMs);
    return;
  }
  try {
    await animation.finished;
  } catch {
    await sleep(Math.min(40, fallbackMs));
  }
}

function header() {
  return '<header class="wp-app-header wp-casino-header"><button type="button" data-app-back aria-label="返回桌面">‹</button><div><b>七号赌场</b><small>NO. 7 · 娱乐筹码</small></div><span class="wp-casino-live-dot" aria-hidden="true"></span></header>';
}

function slotDetail(record) {
  if (Array.isArray(record?.detail) && record.detail.length === 3) return record.detail.map(String);
  const parsed = String(record?.outcome || '').trim().split(/\s+/u).filter(Boolean);
  return parsed.length === 3 ? parsed : ['7', '⭐', '🍒'];
}

function rouletteDetail(record) {
  if (record?.detail && typeof record.detail === 'object') {
    return {
      number: Number(record.detail.number) || 0,
      color: String(record.detail.color || 'green'),
    };
  }
  const match = String(record?.outcome || '').match(/(\d+)\s*·\s*(red|black|green)/i);
  return { number: Number(match?.[1]) || 0, color: match?.[2] || 'green' };
}

function diceDetail(record) {
  const value = Number(record?.detail?.value || String(record?.outcome || '').match(/\d+/)?.[0] || 1);
  return Math.min(6, Math.max(1, value || 1));
}

function resultLabel(record) {
  if (!record) return '';
  if (record.net > 0 && record.multiplier >= 10) return `JACKPOT +${record.net}`;
  if (record.net > 0) return `WIN +${record.net}`;
  if (record.net < 0) return `LOST ${Math.abs(record.net)}`;
  return 'PUSH';
}

function dealerLine(record) {
  if (!record) return '筹码落桌以后，结果才算数。';
  if (record.net > 0 && record.multiplier >= 5) return '桌边安静了一秒。再来？';
  if (record.net > 0) return '筹码推回来了。还跟吗？';
  return '筹码被收走了。下一手？';
}

function historyMarkup(history) {
  if (!history.length) {
    return '<details class="wp-casino-history"><summary><span>开奖记录</span><b>还没开局</b><i>⌄</i></summary><div class="wp-casino-empty">第一枚筹码还在你手里。</div></details>';
  }
  const latest = history[0];
  const records = history.slice(0, 8).map((item) => `
    <div class="wp-casino-record ${item.net >= 0 ? 'is-win' : 'is-loss'}">
      <span>${escapeHtml(GAME_META[item.game]?.title || item.game)} · ${escapeHtml(item.outcome)}</span>
      <b>${item.net >= 0 ? '+' : ''}${item.net}</b>
    </div>`).join('');
  return `<details class="wp-casino-history">
    <summary><span>上一局 · ${escapeHtml(GAME_META[latest.game]?.title || latest.game)}</span><b class="${latest.net >= 0 ? 'is-win' : 'is-loss'}">${latest.net >= 0 ? '+' : ''}${latest.net}</b><i>⌄</i></summary>
    <div class="wp-casino-history-list">${records}</div>
  </details>`;
}

function slotsStage(record) {
  const values = record ? slotDetail(record) : ['7', '⭐', '🍒'];
  return `<div class="wp-casino-stage wp-casino-stage-slots">
    <div class="wp-casino-marquee"><span>✦</span><b>LUCKY SEVEN</b><span>✦</span></div>
    <div class="wp-slot-machine" aria-label="老虎机滚轴">
      <div class="wp-slot-payline" aria-hidden="true"></div>
      ${values.map((value, index) => `<div class="wp-slot-reel" data-casino-reel="${index}"><span>${escapeHtml(value)}</span></div>`).join('')}
    </div>
    <div class="wp-casino-stage-caption" data-casino-stage-caption>${record ? dealerLine(record) : '三轴会一枚一枚停下来。别急。'}</div>
  </div>`;
}

function rouletteStage(record) {
  const detail = record ? rouletteDetail(record) : { number: 7, color: 'red' };
  return `<div class="wp-casino-stage wp-casino-stage-roulette">
    <div class="wp-roulette-shell">
      <div class="wp-roulette-wheel" data-casino-wheel>
        <span class="wp-roulette-ball" aria-hidden="true"></span>
        <div class="wp-roulette-hub"><small>NO.</small><b data-casino-roulette-number data-color="${escapeHtml(detail.color)}">${detail.number}</b></div>
      </div>
    </div>
    <div class="wp-casino-stage-caption" data-casino-stage-caption>${record ? dealerLine(record) : '封盘之后，球停下前都不算。'}</div>
  </div>`;
}

function diceStage(record) {
  const value = record ? diceDetail(record) : 6;
  return `<div class="wp-casino-stage wp-casino-stage-dice">
    <div class="wp-dice-table">
      <div class="wp-dice-cup" data-casino-dice-cup aria-hidden="true"><span></span></div>
      <div class="wp-die" data-casino-die data-value="${value}">${DICE_FACES[value - 1]}</div>
      <div class="wp-dice-shadow" aria-hidden="true"></div>
    </div>
    <div class="wp-casino-stage-caption" data-casino-stage-caption>${record ? dealerLine(record) : '骰盅落桌。你押哪边？'}</div>
  </div>`;
}

function stageMarkup(game, record) {
  if (game === 'roulette') return rouletteStage(record);
  if (game === 'dice') return diceStage(record);
  return slotsStage(record);
}

function riskTier(bet, balance) {
  const wager = Math.max(0, Number(bet) || 0);
  const bankroll = Math.max(0, Number(balance) || 0);
  if (bankroll > 0 && bankroll <= CASINO_MAX_BET && wager >= bankroll) return { id: 'all-in', label: 'ALL IN' };
  const ratio = bankroll > 0 ? wager / bankroll : 0;
  if (ratio >= 0.5) return { id: 'high', label: '豪赌' };
  if (ratio >= 0.25) return { id: 'raised', label: '重注' };
  return { id: 'normal', label: '常规' };
}

function setBusyUi(screen, busy) {
  screen.querySelector('.wp-casino-app')?.classList.toggle('is-busy', busy);
  screen.querySelectorAll('[data-casino-game], [data-casino-choice], [data-casino-quick], [data-casino-bet], [data-casino-adjust], [data-casino-play]').forEach((node) => {
    node.disabled = busy;
  });
  const button = screen.querySelector('[data-casino-play]');
  if (button && busy) {
    button.classList.add('is-locked');
    button.querySelector('b')?.replaceChildren(document.createTextNode('已封盘 · 开奖中'));
    button.querySelector('small')?.replaceChildren(document.createTextNode('开奖中'));
  }
}

function reelStepDuration(progress, reelIndex) {
  const eased = Math.max(0, Math.min(1, progress));
  return Math.round(54 + (eased ** 2.6) * 176 + reelIndex * 5);
}

async function animateReel(reel, finalValue, totalMs, reelIndex) {
  const face = reel.querySelector('span');
  if (!face) return;
  reel.classList.remove('is-locked');
  reel.classList.add('is-spinning');
  const startedAt = monotonicNow();
  let tick = reelIndex * 2;

  while (true) {
    const elapsed = monotonicNow() - startedAt;
    const remaining = totalMs - elapsed;
    if (remaining <= 275) break;
    const progress = elapsed / totalMs;
    const duration = Math.min(reelStepDuration(progress, reelIndex), Math.max(56, remaining - 220));
    face.textContent = SLOT_SYMBOLS[tick % SLOT_SYMBOLS.length];
    tick += 1;

    if (typeof face.animate === 'function') {
      const motion = face.animate([
        { transform: 'translateY(-70%) scaleY(.92)', opacity: .36, filter: 'blur(2.2px)' },
        { offset: .48, transform: 'translateY(0) scaleY(1.08)', opacity: 1, filter: 'blur(.65px)' },
        { transform: 'translateY(70%) scaleY(.92)', opacity: .36, filter: 'blur(2.2px)' },
      ], { duration, easing: 'linear' });
      await animationFinished(motion, duration);
    } else {
      await sleep(duration);
    }
  }

  face.textContent = finalValue;
  reel.classList.remove('is-spinning');
  reel.classList.add('is-locked');
  if (typeof face.animate === 'function') {
    const settle = face.animate([
      { transform: 'translateY(-28%) scaleY(.96)', filter: 'blur(1px)' },
      { offset: .66, transform: 'translateY(7%) scaleY(1.025)', filter: 'blur(0)' },
      { offset: .84, transform: 'translateY(-2%)', filter: 'blur(0)' },
      { transform: 'translateY(0)', filter: 'blur(0)' },
    ], { duration: 270, easing: 'cubic-bezier(.16,.82,.24,1)' });
    await animationFinished(settle, 270);
  } else {
    await sleep(120);
  }
}

async function animateSlots(screen, record) {
  const reels = [...screen.querySelectorAll('[data-casino-reel]')];
  const finalValues = slotDetail(record);
  if (!reels.length) return;
  const caption = screen.querySelector('[data-casino-stage-caption]');
  const machine = screen.querySelector('.wp-slot-machine');
  machine?.classList.remove('is-final-lock');

  if (reducedMotion()) {
    reels.forEach((reel, index) => { reel.querySelector('span').textContent = finalValues[index]; });
    await sleep(30);
    return;
  }

  if (caption) caption.textContent = '第一轴……';
  const spins = reels.map((reel, index) => animateReel(
    reel,
    finalValues[index],
    SLOT_REEL_DURATIONS[index] || SLOT_REEL_DURATIONS.at(-1),
    index,
  ));

  await spins[0];
  if (caption) caption.textContent = '第二轴……';
  await spins[1];
  if (caption) caption.textContent = '最后一轴。';
  await spins[2];
  machine?.classList.add('is-final-lock');
  if (caption) caption.textContent = dealerLine(record);
}

async function animateRoulette(screen, record) {
  const wheel = screen.querySelector('[data-casino-wheel]');
  const ball = wheel?.querySelector('.wp-roulette-ball');
  const shell = wheel?.closest('.wp-roulette-shell');
  const number = screen.querySelector('[data-casino-roulette-number]');
  const caption = screen.querySelector('[data-casino-stage-caption]');
  const detail = rouletteDetail(record);
  if (!wheel || !ball || !number) return;

  if (caption) caption.textContent = '封盘。球还没停。';
  number.textContent = '•';
  number.removeAttribute('data-color');

  if (reducedMotion()) {
    await sleep(60);
    number.textContent = String(detail.number);
    number.dataset.color = detail.color;
    if (caption) caption.textContent = dealerLine(record);
    return;
  }

  shell?.classList.remove('is-landed');
  shell?.classList.add('is-spinning');
  wheel.classList.remove('is-landed');
  wheel.classList.add('is-spinning');

  const sector = 360 / 37;
  const targetOffset = (360 - (detail.number * sector)) % 360;
  const wheelEnd = 2160 + targetOffset;
  const ballEnd = -wheelEnd - (8 * 360);

  let wheelMotion = null;
  let ballMotion = null;
  if (typeof wheel.animate === 'function' && typeof ball.animate === 'function') {
    wheelMotion = wheel.animate([
      { offset: 0, transform: 'rotate(0deg)', filter: 'blur(0)' },
      { offset: .12, transform: `rotate(${wheelEnd * .29}deg)`, filter: 'blur(.6px)' },
      { offset: .55, transform: `rotate(${wheelEnd * .74}deg)`, filter: 'blur(.35px)' },
      { offset: .80, transform: `rotate(${wheelEnd * .91}deg)`, filter: 'blur(.15px)' },
      { offset: .94, transform: `rotate(${wheelEnd + 13}deg)`, filter: 'blur(0)' },
      { offset: 1, transform: `rotate(${wheelEnd}deg)`, filter: 'blur(0)' },
    ], { duration: ROULETTE_WHEEL_DURATION_MS, easing: 'linear', fill: 'forwards' });

    ballMotion = ball.animate([
      { offset: 0, transform: 'rotate(0deg)', filter: 'blur(0)' },
      { offset: .12, transform: `rotate(${ballEnd * .27}deg)`, filter: 'blur(.8px)' },
      { offset: .55, transform: `rotate(${ballEnd * .70}deg)`, filter: 'blur(.55px)' },
      { offset: .80, transform: `rotate(${ballEnd * .88}deg)`, filter: 'blur(.25px)' },
      { offset: .94, transform: `rotate(${ballEnd * .978}deg)`, filter: 'blur(0)' },
      { offset: 1, transform: `rotate(${ballEnd}deg)`, filter: 'blur(0)' },
    ], { duration: ROULETTE_BALL_DURATION_MS, easing: 'linear', fill: 'forwards' });

    await Promise.all([
      animationFinished(wheelMotion, ROULETTE_WHEEL_DURATION_MS),
      animationFinished(ballMotion, ROULETTE_BALL_DURATION_MS),
    ]);
  } else {
    wheel.classList.add('is-css-spinning');
    await sleep(ROULETTE_WHEEL_DURATION_MS);
    await sleep(300);
  }

  wheelMotion?.cancel?.();
  ballMotion?.cancel?.();
  wheel.classList.remove('is-spinning', 'is-css-spinning');
  shell?.classList.remove('is-spinning');
  wheel.classList.add('is-landed');
  shell?.classList.add('is-landed');
  number.textContent = String(detail.number);
  number.dataset.color = detail.color;
  if (caption) caption.textContent = dealerLine(record);
}

async function animateDice(screen, record) {
  const cup = screen.querySelector('[data-casino-dice-cup]');
  const die = screen.querySelector('[data-casino-die]');
  const caption = screen.querySelector('[data-casino-stage-caption]');
  if (!die) return;
  if (caption) caption.textContent = '别开。再摇一下。';
  cup?.classList.add('is-shaking');
  if (reducedMotion()) {
    await sleep(40);
  } else {
    let tick = 0;
    const timer = globalThis.setInterval(() => {
      die.textContent = DICE_FACES[tick % DICE_FACES.length];
      tick += 1;
    }, 92);
    await sleep(920);
    globalThis.clearInterval(timer);
  }
  cup?.classList.remove('is-shaking');
  cup?.classList.add('is-open');
  const value = diceDetail(record);
  die.textContent = DICE_FACES[value - 1];
  die.dataset.value = String(value);
  die.classList.add('is-revealed');
  if (caption) caption.textContent = dealerLine(record);
}

async function animateOutcome(screen, record) {
  if (record.game === 'roulette') await animateRoulette(screen, record);
  else if (record.game === 'dice') await animateDice(screen, record);
  else await animateSlots(screen, record);
  await sleep(reducedMotion() ? 20 : 220);
}

function animateBalance(screen, from, to) {
  const target = screen.querySelector('[data-casino-balance]');
  if (!target) return;
  if (reducedMotion() || from === to || typeof globalThis.requestAnimationFrame !== 'function') {
    target.textContent = Number(to).toLocaleString('zh-CN');
    return;
  }
  const duration = 520;
  const started = performance.now();
  target.textContent = Number(from).toLocaleString('zh-CN');
  const frame = (now) => {
    const progress = Math.min(1, (now - started) / duration);
    const eased = 1 - ((1 - progress) ** 3);
    const current = Math.round(from + (to - from) * eased);
    target.textContent = current.toLocaleString('zh-CN');
    if (progress < 1) globalThis.requestAnimationFrame(frame);
  };
  globalThis.requestAnimationFrame(frame);
}

export function renderCasinoApp(screen, { goHome }) {
  let game = screen.dataset.casinoGame || 'slots';
  let choice = screen.dataset.casinoChoice || 'red';
  let betValue = Number(screen.dataset.casinoBetValue || 50) || 50;
  let busy = false;

  function paint(lastRecord = null, error = '') {
    const state = readCasinoState();
    const meta = GAME_META[game];
    const outcomeClass = lastRecord ? (lastRecord.net > 0 ? 'is-win' : 'is-loss') : '';
    screen.dataset.casinoGame = game;
    screen.dataset.casinoChoice = choice;
    screen.dataset.casinoBetValue = String(betValue);
    screen.innerHTML = `
      <section class="wp-view wp-native-app wp-casino-app ${lastRecord ? `is-settled ${outcomeClass}` : ''}">
        ${header()}
        <main class="wp-casino-main">
          <section class="wp-casino-bankroll">
            <div><small>可用筹码</small><strong data-casino-balance>${state.balance.toLocaleString('zh-CN')}</strong></div>
            <span><i aria-hidden="true"></i> 虚拟筹码 · 无充值提现</span>
          </section>
          <nav class="wp-casino-tabs" aria-label="赌场游戏">
            ${Object.entries(GAME_META).map(([id, item]) => `<button type="button" data-casino-game="${id}" class="${game === id ? 'is-active' : ''}" aria-pressed="${game === id}"><small>${item.kicker}</small><b>${item.title}</b></button>`).join('')}
          </nav>
          <section class="wp-casino-machine ${lastRecord ? 'is-settled' : ''}" data-casino-machine>
            <div class="wp-casino-rule">${escapeHtml(meta.rule)}</div>
            ${stageMarkup(game, lastRecord)}
            ${error ? `<div class="wp-casino-result is-error" role="alert">${escapeHtml(error)}</div>` : lastRecord ? `<div class="wp-casino-result ${outcomeClass}" aria-live="polite"><small>${escapeHtml(lastRecord.outcome)}</small><b>${escapeHtml(resultLabel(lastRecord))}</b></div>` : ''}
          </section>
          ${historyMarkup(state.history)}
        </main>
          <section class="wp-casino-bet-panel">
            ${meta.choices.length ? `<div class="wp-casino-choices">${meta.choices.map(([id, label]) => `<button type="button" data-casino-choice="${id}" class="${choice === id ? 'is-active' : ''}"><span></span>${label}</button>`).join('')}</div>` : ''}
            <div class="wp-casino-wager">
              <span>本局下注</span>
              <button type="button" data-casino-adjust="half" aria-label="减半下注">½</button><label><em>◆</em><input data-casino-bet aria-label="下注筹码" type="number" inputmode="numeric" min="${CASINO_MIN_BET}" max="${CASINO_MAX_BET}" step="10" value="${betValue}"></label><button type="button" data-casino-adjust="double" aria-label="加倍下注">×2</button>
              <b data-casino-risk>常规</b>
            </div>
            <div class="wp-casino-quick" aria-label="快捷筹码">${[10, 50, 100, 500].map((value) => `<button type="button" data-casino-quick="${value}" aria-label="下注 ${value} 筹码"><span>${value}</span></button>`).join('')}</div>
            <div class="wp-casino-ticket" data-casino-ticket role="status"></div>
            <button type="button" class="wp-casino-play" data-casino-play><b>${meta.action}</b><small>${meta.actionHint}</small></button>
          </section>
      </section>`;

    const syncRisk = () => {
      const currentState = readCasinoState();
      const input = screen.querySelector('[data-casino-bet]');
      const raw = Number(input?.value || betValue || 0);
      betValue = Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : betValue;
      screen.dataset.casinoBetValue = String(betValue);
      const tier = riskTier(betValue, currentState.balance);
      const app = screen.querySelector('.wp-casino-app');
      if (app) app.dataset.risk = tier.id;
      const label = screen.querySelector('[data-casino-risk]');
      if (label) label.textContent = tier.label;
      screen.querySelectorAll('[data-casino-quick]').forEach((button) => {
        button.classList.toggle('is-active', Number(button.dataset.casinoQuick) === betValue);
      });
      const action = screen.querySelector('[data-casino-play] b');
      const hint = screen.querySelector('[data-casino-play] small');
      if (action) action.textContent = tier.id === 'all-in' ? 'ALL IN' : meta.action;
      if (hint) hint.textContent = `本局 ${betValue} 筹码 · ${tier.id === 'all-in' ? '全押' : meta.actionHint}`;
      const ticket = screen.querySelector('[data-casino-ticket]');
      const selected = meta.choices.find(([id]) => id === choice)?.[1] || '三轴连线';
      if (ticket) ticket.textContent = `${selected} · ${betValue > currentState.balance ? '筹码不足，请调整下注' : `下注后余 ${Math.max(0, currentState.balance - betValue)}`} ${lastRecord ? `· 上局${lastRecord.net >= 0 ? '+' : ''}${lastRecord.net}` : ''}`;
      screen.querySelectorAll('[data-casino-choice]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.casinoChoice === choice)));
    };

    screen.querySelector('[data-app-back]')?.addEventListener('click', () => {
      if (!busy) goHome();
    });
    screen.querySelectorAll('[data-casino-game]').forEach((button) => button.addEventListener('click', () => {
      if (busy) return;
      game = button.dataset.casinoGame;
      choice = game === 'dice' ? 'big' : 'red';
      paint();
    }));
    screen.querySelectorAll('[data-casino-choice]').forEach((button) => button.addEventListener('click', () => {
      if (busy) return;
      choice = button.dataset.casinoChoice;
      screen.dataset.casinoChoice = choice;
      screen.querySelectorAll('[data-casino-choice]').forEach(node => node.classList.toggle('is-active', node.dataset.casinoChoice === choice));
      syncRisk();
    }));
    screen.querySelectorAll('[data-casino-quick]').forEach((button) => button.addEventListener('click', () => {
      if (busy) return;
      betValue = Number(button.dataset.casinoQuick) || betValue;
      const input = screen.querySelector('[data-casino-bet]');
      if (input) input.value = String(betValue);
      syncRisk();
    }));
    screen.querySelectorAll('[data-casino-adjust]').forEach(button => button.addEventListener('click', () => {
      if (busy) return;
      const amount = button.dataset.casinoAdjust === 'half' ? Math.floor(betValue / 2) : betValue * 2;
      betValue = Math.max(CASINO_MIN_BET, Math.min(CASINO_MAX_BET, amount));
      screen.querySelector('[data-casino-bet]').value = String(betValue);
      syncRisk();
    }));
    screen.querySelector('[data-casino-bet]')?.addEventListener('input', syncRisk);
    screen.querySelector('[data-casino-play]')?.addEventListener('click', async () => {
      if (busy) return;
      busy = true;
      const roundApp = screen.querySelector('.wp-casino-app');
      const balanceBefore = readCasinoState().balance;
      setBusyUi(screen, true);
      try {
        await Promise.resolve();
        const bet = Number(screen.querySelector('[data-casino-bet]')?.value || betValue || 0);
        betValue = bet;
        const { record, state: settledState } = placeCasinoBet({ game, choice, bet });
        await animateOutcome(screen, record);
        busy = false;
        if (!roundApp?.isConnected || screen.querySelector('.wp-casino-app') !== roundApp) return;
        paint(record);
        animateBalance(screen, balanceBefore, settledState.balance);
      } catch (cause) {
        busy = false;
        if (!roundApp?.isConnected || screen.querySelector('.wp-casino-app') !== roundApp) return;
        paint(null, cause?.message || '这一局没能结算');
      }
    });
    syncRisk();
  }

  paint();
}
