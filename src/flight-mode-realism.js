import { readWorldBackstage, subscribeWorldBackstage } from './world-backstage-bridge.js';

const NETWORK_MODE_WORLD = 'world';
const NETWORK_MODE_NO_SIM = 'no-sim';
// Compatibility alias for older imports. Disconnected is no longer presented as airplane mode.
const NETWORK_MODE_FLIGHT = NETWORK_MODE_NO_SIM;

const NO_SIM_TEXT_REPLACEMENTS = [
  ['世界背面未连接', '未插入世界背面 SIM'],
  ['未连接世界背面', '未插入世界背面 SIM'],
  ['未连接世界', '未插入世界背面 SIM'],
  ['世界背面 · OFFLINE', 'SIM · 未插入'],
  ['还没有连接世界背面', '尚未插入世界背面 SIM'],
  ['OPEN 世界背面 TO CONNECT', 'INSERT WORLD BACKSTAGE SIM'],
  ['世界背面连接后，真实会话会出现在这里。', '插入世界背面 SIM 后，真实会话会出现在这里。'],
  ['联系人不会在手机里单独复制一份。', '未插入 SIM 时不刷新世界联系人；本地功能仍可使用。'],
  ['朋友圈只显示世界背面里真实存在的动态。', '未插入 SIM 时不刷新朋友圈；插入世界背面 SIM 后恢复真实动态。'],
  ['新闻不会在手机里单独生成一份。', '未插入 SIM 时不刷新世界新闻；本地功能仍可使用。'],
  ['当前没有检测到世界背面状态。', '当前未插入世界背面 SIM。小手机本地功能仍可使用。'],
  ['电话不会自己生成联系人或通话记录。', '未插入 SIM 时无法使用世界通讯；本机通话草稿与本地记录仍保留。'],
  ['短信不会自己生成联系人或历史消息。', '未插入 SIM 时无法使用世界短信；本机草稿仍保留。'],
];

function text(value) {
  return String(value ?? '').trim();
}

export function networkModeFromSnapshot(snapshot) {
  return snapshot?.connected ? NETWORK_MODE_WORLD : NETWORK_MODE_NO_SIM;
}

export function networkModeLabel(snapshot) {
  return networkModeFromSnapshot(snapshot) === NETWORK_MODE_WORLD ? 'SIM 卡已插入' : '未插入 SIM 卡';
}

export function rewriteNoSimText(value) {
  let output = String(value ?? '');
  for (const [from, to] of NO_SIM_TEXT_REPLACEMENTS) output = output.split(from).join(to);
  return output;
}

// Kept for compatibility with any older extension-side caller; semantics now follow no-SIM state.
export const rewriteFlightModeText = rewriteNoSimText;

function rewriteDisconnectedCopy(root) {
  if (!root || typeof document === 'undefined') return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const parent = node.parentElement;
    if (!parent || parent.closest('script, style, textarea, input')) continue;
    const next = rewriteNoSimText(node.nodeValue);
    if (next !== node.nodeValue) node.nodeValue = next;
  }
}

function ensureNoSimIndicator(stage) {
  const icons = stage?.querySelector?.('[data-statusbar] .wp-status-icons');
  if (!icons) return;
  let indicator = icons.querySelector('.wp-no-sim-status');
  if (!indicator) {
    indicator = document.createElement('span');
    indicator.className = 'wp-no-sim-status';
    indicator.textContent = 'SIM×';
    indicator.setAttribute('aria-label', '未插入 SIM 卡');
    indicator.title = '未插入世界背面 SIM';
    icons.prepend(indicator);
  }
}

function removeNoSimIndicator(stage) {
  stage?.querySelectorAll?.('.wp-no-sim-status, .wp-flight-mode-status').forEach((node) => node.remove());
}

export function mountFlightModeRealism({ phone } = {}) {
  const stage = document.getElementById('world-phone-stage');
  if (!stage) return () => {};

  let snapshot = readWorldBackstage();
  let applying = false;
  let queued = false;

  const apply = () => {
    if (applying) return;
    applying = true;
    try {
      const mode = networkModeFromSnapshot(snapshot);
      const noSim = mode === NETWORK_MODE_NO_SIM;
      stage.dataset.networkMode = mode;
      stage.classList.toggle('is-no-sim', noSim);
      stage.classList.toggle('is-world-connected', !noSim);
      // Remove the obsolete presentation if a previous build left it behind in the DOM.
      stage.classList.remove('is-flight-mode');
      if (noSim) {
        ensureNoSimIndicator(stage);
        rewriteDisconnectedCopy(stage);
      } else {
        removeNoSimIndicator(stage);
      }
    } finally {
      applying = false;
    }
  };

  const scheduleApply = () => {
    if (queued || applying) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      apply();
    });
  };

  const observer = new MutationObserver(scheduleApply);
  observer.observe(stage, { subtree: true, childList: true, characterData: true });

  const unsubscribe = subscribeWorldBackstage((next) => {
    snapshot = next;
    apply();
  });

  const networkMode = () => networkModeFromSnapshot(snapshot);
  const worldConnected = () => networkMode() === NETWORK_MODE_WORLD;
  if (phone && typeof phone === 'object') {
    phone.networkMode = networkMode;
    phone.worldConnected = worldConnected;
  }

  apply();
  console.info(`[世界小手机] SIM state: ${text(networkModeLabel(snapshot))}`);

  return () => {
    observer.disconnect();
    unsubscribe?.();
    removeNoSimIndicator(stage);
    stage.classList.remove('is-no-sim', 'is-flight-mode', 'is-world-connected');
    delete stage.dataset.networkMode;
    if (phone?.networkMode === networkMode) delete phone.networkMode;
    if (phone?.worldConnected === worldConnected) delete phone.worldConnected;
  };
}

export { NETWORK_MODE_WORLD, NETWORK_MODE_NO_SIM, NETWORK_MODE_FLIGHT };
