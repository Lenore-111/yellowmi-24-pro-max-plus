import { readWalletState, rerollWalletEntertainment } from './wallet.js';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

function money(state, value) {
  const amount = Math.max(0, Math.round(Number(value) || 0));
  return `${state.currency}${amount.toLocaleString('zh-CN')}`;
}

function historyMarkup(state) {
  if (!state.history.length) {
    return '<div class="wp-wallet-history-empty">还没有娱乐流水。以后小手机里的消费可以从这里走。</div>';
  }
  return state.history.slice(0, 8).map((item) => `
    <div class="wp-wallet-history-row">
      <span><b>${escapeHtml(item.reason || '娱乐变动')}</b><small>${item.account === 'cash' ? '现金' : '银行卡'} · 非正史</small></span>
      <strong class="${Number(item.amount) >= 0 ? 'is-plus' : 'is-minus'}">${Number(item.amount) >= 0 ? '+' : '−'}${escapeHtml(money(state, Math.abs(Number(item.amount) || 0)))}</strong>
    </div>
  `).join('');
}

export function renderWalletApp(screen, { goHome }) {
  function paint() {
    const state = readWalletState();
    const total = state.bank + state.cash;
    screen.innerHTML = `
      <section class="wp-view wp-native-app wp-wallet-app">
        <header class="wp-app-header wp-wallet-header">
          <button type="button" data-app-back aria-label="返回桌面">‹</button>
          <div><b>钱包</b><small>ENTERTAINMENT WALLET</small></div>
          <span></span>
        </header>
        <main class="wp-wallet-main">
          <section class="wp-wallet-card">
            <div class="wp-wallet-card-top"><span>推测余额</span><b>非正史</b></div>
            <strong>${escapeHtml(money(state, total))}</strong>
            <div class="wp-wallet-card-meta"><span>${escapeHtml(state.personaName)}</span><span>•••• ${escapeHtml(state.cardLast4)}</span></div>
          </section>

          <div class="wp-wallet-notice">
            <b>纯娱乐钱包</b>
            <span>根据当前 U 人设和开局文本估算。不会写进正文，也不会修改世界背面的真实状态。</span>
          </div>

          <section class="wp-wallet-accounts">
            <div><span><i>卡</i><b>银行卡</b><small>${escapeHtml(state.incomeLabel)}</small></span><strong>${escapeHtml(money(state, state.bank))}</strong></div>
            <div><span><i>现</i><b>现金</b><small>口袋里大概有这些</small></span><strong>${escapeHtml(money(state, state.cash))}</strong></div>
            <div><span><i>月</i><b>本月可支配</b><small>只是生活感估算</small></span><strong>${escapeHtml(money(state, state.monthlyDisposable))}</strong></div>
          </section>

          <section class="wp-wallet-guess">
            <div class="wp-wallet-guess-head"><span><small>七的估算</small><b>${escapeHtml(state.tierLabel)}</b></span><em>第 ${state.revision + 1} 版</em></div>
            <p>${escapeHtml(state.verdict)}</p>
            <div class="wp-wallet-signals">${state.signals.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}</div>
            <div class="wp-wallet-controls">
              <button type="button" data-wallet-nudge="-1">我哪有这么有钱</button>
              <button type="button" data-wallet-reroll>重新估算</button>
              <button type="button" data-wallet-nudge="1">我哪有这么穷</button>
            </div>
          </section>

          <details class="wp-wallet-history">
            <summary><span>娱乐流水</span><b>${state.history.length}</b><i>⌄</i></summary>
            <div>${historyMarkup(state)}</div>
          </details>
        </main>
      </section>
    `;

    screen.querySelector('[data-app-back]')?.addEventListener('click', goHome);
    screen.querySelector('[data-wallet-reroll]')?.addEventListener('click', () => {
      rerollWalletEntertainment();
      paint();
    });
    screen.querySelectorAll('[data-wallet-nudge]').forEach((button) => {
      button.addEventListener('click', () => {
        rerollWalletEntertainment({ direction: Number(button.dataset.walletNudge) || 0 });
        paint();
      });
    });
  }

  paint();
}
