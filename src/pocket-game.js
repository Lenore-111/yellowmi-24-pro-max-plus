const KEY = 'world_phone_number_garden_v1';
const directions = ['left', 'right', 'up', 'down'];

export function slideBoard(board, direction) {
  if (!directions.includes(direction)) return { board: [...board], gain: 0, changed: false };
  const next = [...board];
  let gain = 0;
  for (let line = 0; line < 4; line++) {
    const ids = Array.from({ length: 4 }, (_, i) => direction === 'left' ? line * 4 + i : direction === 'right' ? line * 4 + 3 - i : direction === 'up' ? i * 4 + line : (3 - i) * 4 + line);
    const values = ids.map(i => board[i]).filter(Boolean);
    const merged = [];
    for (let i = 0; i < values.length; i++) {
      if (values[i] === values[i + 1]) { merged.push(values[i] * 2); gain += values[i] * 2; i++; }
      else merged.push(values[i]);
    }
    ids.forEach((id, i) => { next[id] = merged[i] || 0; });
  }
  return { board: next, gain, changed: next.some((value, i) => value !== board[i]) };
}

export function canMove(board) {
  return board.includes(0) || directions.some(direction => slideBoard(board, direction).changed);
}

function spawn(board) {
  const empty = board.map((value, i) => value ? -1 : i).filter(i => i >= 0);
  if (empty.length) board[empty[Math.floor(Math.random() * empty.length)]] = Math.random() < .9 ? 2 : 4;
}

export function validGame(value) {
  return Array.isArray(value?.board) && value.board.length === 16 && value.board.some(Boolean)
    && value.board.every(n => Number.isInteger(n) && n >= 0 && n <= 131072 && (!n || (n >= 2 && Number.isInteger(Math.log2(n)))))
    && Number.isSafeInteger(value.score) && value.score >= 0;
}

export function renderPocketGame(screen, { goHome }) {
  let state;
  try { state = JSON.parse(localStorage.getItem(KEY)); } catch {}
  if (!validGame(state)) state = { board: Array(16).fill(0), score: 0, best: 0 };
  state.best = Math.max(state.score, Number.isSafeInteger(state.best) && state.best >= 0 ? state.best : 0);
  if (!state.board.some(Boolean)) { spawn(state.board); spawn(state.board); }
  let undo = null;
  let confirmRestart = false;
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} };
  const move = direction => {
    const result = slideBoard(state.board, direction);
    if (!result.changed) return;
    undo = { board: [...state.board], score: state.score };
    state.board = result.board; state.score += result.gain;
    state.best = Math.max(state.best, state.score);
    spawn(state.board); confirmRestart = false; save(); paint();
  };
  const paint = () => {
    const focus = screen.querySelector('.wp-garden')?.contains(document.activeElement);
    screen.innerHTML = `<section class="wp-view wp-native-app wp-garden"><header class="wp-app-header"><button type="button" data-app-back aria-label="返回桌面">‹</button><div><b>数字花园</b><small>一小局，慢慢长大</small></div><span></span></header><main class="wp-garden-body"><div class="wp-garden-title"><h2>2048<span>合在一起，长大一点。</span></h2><div><small>本局 / 最佳</small><b>${state.score} / ${state.best}</b></div></div><div class="wp-garden-board" tabindex="0" role="group" aria-label="数字棋盘，使用方向键移动">${state.board.map(n => `<div class="wp-garden-tile" data-level="${n ? Math.min(11, Math.log2(n)) : 0}">${n || ''}</div>`).join('')}</div><p class="wp-garden-status" role="status">${!canMove(state.board) ? '花园满了。撤销一步，或再开一局？' : state.board.some(n => n >= 2048) ? '开出了 2048！还可以继续生长。' : '相同数字相遇就合并。滑动棋盘、方向键或按钮移动。'}</p><nav class="wp-garden-controls" aria-label="移动方向"><button data-move="left" aria-label="向左">←</button><button data-move="up" aria-label="向上">↑</button><button data-move="down" aria-label="向下">↓</button><button data-move="right" aria-label="向右">→</button></nav><footer><button data-garden-undo ${undo ? '' : 'disabled'}>撤销一步</button><button data-garden-restart>${confirmRestart ? '确认重新开始' : '新的一局'}</button></footer><small class="wp-garden-note">自动保存到本机 · 不消耗钱包余额</small></main></section>`;
    screen.querySelector('[data-app-back]').onclick = goHome;
    screen.querySelectorAll('[data-move]').forEach(button => button.onclick = () => move(button.dataset.move));
    screen.querySelector('[data-garden-undo]').onclick = () => { if (!undo) return; state.board = undo.board; state.score = undo.score; undo = null; save(); paint(); };
    screen.querySelector('[data-garden-restart]').onclick = () => {
      if (!confirmRestart) { confirmRestart = true; paint(); return; }
      state.board = Array(16).fill(0); state.score = 0; undo = null; confirmRestart = false;
      spawn(state.board); spawn(state.board); save(); paint();
    };
    screen.querySelector('.wp-garden').onkeydown = event => {
      const direction = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[event.key];
      if (direction) { event.preventDefault(); event.stopPropagation(); move(direction); }
    };
    const board = screen.querySelector('.wp-garden-board');
    let touch = null;
    board.onpointerdown = event => {
      if (event.button > 0 || event.clientX - screen.getBoundingClientRect().left <= 28) return;
      touch = { id: event.pointerId, x: event.clientX, y: event.clientY };
      board.setPointerCapture(event.pointerId);
    };
    board.onpointercancel = () => { touch = null; };
    board.onpointerup = event => {
      if (!touch || touch.id !== event.pointerId) return;
      const dx = event.clientX - touch.x, dy = event.clientY - touch.y;
      touch = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
      move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    };
    if (focus) board.focus({ preventScroll: true });
  };
  save(); paint();
}
