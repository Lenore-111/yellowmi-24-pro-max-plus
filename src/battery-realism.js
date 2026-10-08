export const BATTERY_STORAGE_KEY = 'world_phone_battery_realism_v1';

const DEFAULT_LEVEL = 76;
const CRITICAL_LEVEL = 1;
const BOOT_LEVEL = 3;
const SHUTDOWN_SECONDS = 30;
const ACTIVE_DRAIN_PER_SECOND = 0.018;
const LOCKED_DRAIN_PER_SECOND = 0.0035;
const HIDDEN_DRAIN_PER_SECOND = 0.00035;
const CHARGE_PER_SECOND = 0.72;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

export function normalizeBatteryState(raw = {}) {
  return {
    level: clamp(raw?.level ?? DEFAULT_LEVEL, 0, 100),
    charging: Boolean(raw?.charging),
    shutdownDeadline: Number(raw?.shutdownDeadline) > 0 ? Number(raw.shutdownDeadline) : 0,
    warned20: Boolean(raw?.warned20),
    warned10: Boolean(raw?.warned10),
  };
}

export function readBatteryState(storage = globalThis.localStorage) {
  try { return normalizeBatteryState(JSON.parse(storage?.getItem?.(BATTERY_STORAGE_KEY) || '{}')); }
  catch { return normalizeBatteryState(); }
}

export function writeBatteryState(state, storage = globalThis.localStorage) {
  const normalized = normalizeBatteryState(state);
  try { storage?.setItem?.(BATTERY_STORAGE_KEY, JSON.stringify(normalized)); } catch {}
  return normalized;
}

export function nextBatteryLevel(level, { charging = false, stageVisible = true, screenAwake = true, seconds = 1 } = {}) {
  const duration = Math.max(0, Number(seconds) || 0);
  if (charging) return clamp(level + CHARGE_PER_SECOND * duration, 0, 100);
  const drain = !stageVisible ? HIDDEN_DRAIN_PER_SECOND : screenAwake ? ACTIVE_DRAIN_PER_SECOND : LOCKED_DRAIN_PER_SECOND;
  return clamp(level - drain * duration, 0, 100);
}

export function batterySecondsUntilShutdown(state, now = Date.now()) {
  const deadline = Number(state?.shutdownDeadline) || 0;
  return deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : 0;
}

function whole(state) {
  return Math.max(0, Math.min(100, Math.round(state.level)));
}

function isStageVisible(stage) {
  return Boolean(stage && !stage.hidden && stage.classList.contains('is-open'));
}

function isScreenAwake(stage) {
  return stage?.dataset?.screenAwake !== '0' && !stage?.classList?.contains('is-screen-off');
}

function ensureChrome(stage) {
  const glass = stage?.querySelector?.('.wp-screen-glass');
  if (!glass) return null;
  let chrome = glass.querySelector(':scope > .wp-battery-chrome');
  if (!chrome) {
    chrome = document.createElement('div');
    chrome.className = 'wp-battery-chrome';
    chrome.innerHTML = '<div class="wp-battery-toast" data-battery-toast hidden></div><section class="wp-battery-critical" data-battery-critical hidden></section><section class="wp-battery-dead" data-battery-dead hidden></section>';
    glass.append(chrome);
  }
  return chrome;
}

function paintStatus(stage, state) {
  const battery = stage?.querySelector?.('.wp-statusbar .wp-battery');
  if (!battery) return;
  const level = whole(state);
  battery.dataset.level = String(level);
  battery.dataset.charging = state.charging ? '1' : '0';
  battery.setAttribute('aria-label', `电量 ${level}%${state.charging ? '，正在充电' : ''}`);
  battery.querySelector('i')?.style.setProperty('width', `${level}%`);

  let percent = battery.parentElement?.querySelector?.('[data-battery-percent]');
  if (!percent) {
    percent = document.createElement('span');
    percent.className = 'wp-battery-percent';
    percent.dataset.batteryPercent = '1';
    battery.before(percent);
  }
  const label = `${level}${state.charging ? '⚡' : ''}`;
  if (percent.textContent !== label) percent.textContent = label;
}

function paintCritical(stage, state) {
  const panel = stage?.querySelector?.('[data-battery-critical]');
  if (!panel) return;
  const seconds = batterySecondsUntilShutdown(state);
  const visible = !state.charging && state.level > 0 && state.level <= CRITICAL_LEVEL && seconds > 0;
  panel.hidden = !visible;
  const signature = visible ? String(seconds) : 'hidden';
  if (panel.dataset.signature === signature) return;
  panel.dataset.signature = signature;
  if (!visible) return;
  panel.innerHTML = `<span>1%</span><div><b>电量严重不足</b><small>还有 ${seconds} 秒关机</small></div><button type="button" data-battery-charge-toggle>接入充电器</button>`;
}

function paintDead(stage, state) {
  const panel = stage?.querySelector?.('[data-battery-dead]');
  if (!panel) return;
  const dead = stage.classList.contains('is-battery-dead');
  const level = whole(state);
  panel.hidden = !dead;
  const signature = dead ? `${state.charging ? 1 : 0}|${level}` : 'hidden';
  if (panel.dataset.signature === signature) return;
  panel.dataset.signature = signature;
  if (!dead) return;
  panel.innerHTML = state.charging
    ? `<div class="wp-battery-dead-icon is-charging"><i style="width:${level}%"></i><span>⚡</span></div><b>${level}%</b><small>${level >= BOOT_LEVEL ? '电量已足够，按电源键开机' : `正在充电 · ${BOOT_LEVEL}% 后可开机`}</small><button type="button" data-battery-charge-toggle>拔掉充电器</button>`
    : '<div class="wp-battery-dead-icon"><i style="width:0%"></i></div><b>电量耗尽</b><small>世界小手机已关机</small><button type="button" data-battery-dead-charge>连接充电器</button>';
}

function paintSettings(stage, state) {
  const body = stage?.querySelector?.('.wp-device-settings-body');
  if (!body) return;
  let group = body.querySelector('[data-battery-settings-group]');
  if (!group) {
    group = document.createElement('section');
    group.className = 'wp-device-group wp-battery-settings-group';
    group.dataset.batterySettingsGroup = '1';
    body.prepend(group);
  }
  const level = whole(state);
  const signature = `${level}|${state.charging ? 1 : 0}`;
  if (group.dataset.signature === signature) return;
  group.dataset.signature = signature;
  group.innerHTML = `<header>电池</header><div class="wp-device-row wp-battery-settings-readout"><span>▰</span><div><b>剩余电量</b><small>${state.charging ? '已接入充电器' : level <= 20 ? '建议尽快充电' : '按小手机实际使用缓慢消耗'}</small></div><strong>${level}%</strong></div><button type="button" class="wp-device-row" data-battery-charge-toggle><span>⚡</span><div><b>${state.charging ? '断开充电器' : '连接充电器'}</b><small>只控制世界小手机的虚拟供电</small></div><strong>${state.charging ? '充电中' : '未连接'}</strong><i>›</i></button>`;
}

function paintControl(stage, state) {
  const body = stage?.querySelector?.('.wp-system-control-body');
  if (!body) return;
  let card = body.querySelector('[data-battery-control-card]');
  if (!card) {
    card = document.createElement('section');
    card.className = 'wp-battery-control-card';
    card.dataset.batteryControlCard = '1';
    body.querySelector('.wp-system-control-grid')?.insertAdjacentElement('afterend', card);
  }
  const level = whole(state);
  const signature = `${level}|${state.charging ? 1 : 0}`;
  if (card.dataset.signature === signature) return;
  card.dataset.signature = signature;
  card.innerHTML = `<div><span class="wp-battery-control-icon">${state.charging ? '⚡' : '▰'}</span><div><b>电池 ${level}%</b><small>${state.charging ? '正在充电' : level <= 20 ? '低电量' : '正常供电'}</small></div></div><button type="button" data-battery-charge-toggle>${state.charging ? '断开' : '充电'}</button>`;
}

function toast(stage, message, kind = '') {
  const node = stage?.querySelector?.('[data-battery-toast]');
  if (!node) return;
  if (node.textContent !== message) node.textContent = message;
  node.className = `wp-battery-toast${kind ? ` is-${kind}` : ''}`;
  node.hidden = false;
  window.clearTimeout(Number(node.dataset.timer) || 0);
  node.dataset.timer = String(window.setTimeout(() => { node.hidden = true; }, 3200));
}

export function mountBatteryRealism({ phone } = {}) {
  const stage = document.querySelector('#world-phone-stage');
  if (!stage) return () => {};

  let state = readBatteryState();
  let destroyed = false;
  let lastTick = performance.now();
  let lastPersistAt = Date.now();
  let lastPersistedWhole = whole(state);
  let paintQueued = false;

  stage.dataset.batteryRealism = '1';
  ensureChrome(stage);

  const paint = () => {
    if (destroyed) return;
    ensureChrome(stage);
    paintStatus(stage, state);
    paintSettings(stage, state);
    paintControl(stage, state);
    paintCritical(stage, state);
    paintDead(stage, state);
    stage.classList.toggle('is-battery-charging', state.charging);
    stage.classList.toggle('is-battery-low', state.level > 0 && state.level <= 20);
    stage.dataset.batteryLevel = String(whole(state));
    stage.dataset.batteryCharging = state.charging ? '1' : '0';
  };

  const queuePaint = () => {
    if (paintQueued || destroyed) return;
    paintQueued = true;
    requestAnimationFrame(() => {
      paintQueued = false;
      paint();
    });
  };

  const persist = (force = false) => {
    const level = whole(state);
    const now = Date.now();
    if (!force && level === lastPersistedWhole && now - lastPersistAt < 7000) return;
    state = writeBatteryState(state);
    lastPersistedWhole = level;
    lastPersistAt = now;
  };

  const clearCritical = () => { state.shutdownDeadline = 0; };

  const beginCritical = () => {
    if (state.charging || state.level <= 0 || state.level > CRITICAL_LEVEL || state.shutdownDeadline) return;
    state.shutdownDeadline = Date.now() + SHUTDOWN_SECONDS * 1000;
    persist(true);
  };

  const shutdown = () => {
    state.level = 0;
    state.shutdownDeadline = 0;
    stage.classList.add('is-battery-dead');
    phone?.closeRecents?.();
    phone?.lock?.();
    phone?.sleepScreen?.();
    stage.classList.add('is-screen-off');
    stage.dataset.screenAwake = '0';
    persist(true);
    paint();
  };

  const boot = () => {
    if (state.level < BOOT_LEVEL) {
      toast(stage, `电量太低，充到 ${BOOT_LEVEL}% 才能开机`, 'warning');
      return false;
    }
    stage.classList.remove('is-battery-dead');
    phone?.lock?.();
    phone?.wakeScreen?.();
    stage.classList.remove('is-screen-off');
    stage.dataset.screenAwake = '1';
    paint();
    return true;
  };

  const setCharging = (charging) => {
    state.charging = Boolean(charging);
    if (state.charging) {
      clearCritical();
      if (state.level <= 0) state.level = 0.2;
      toast(stage, '已接入充电器', 'charging');
    } else {
      toast(stage, '已断开充电器');
      beginCritical();
    }
    persist(true);
    paint();
  };

  const setLevel = (value) => {
    state.level = clamp(value, 0, 100);
    if (state.level > CRITICAL_LEVEL) clearCritical();
    if (state.level <= 0) shutdown();
    else {
      stage.classList.remove('is-battery-dead');
      beginCritical();
      persist(true);
      paint();
    }
    return state.level;
  };

  const tick = () => {
    const now = performance.now();
    const seconds = Math.min(5, Math.max(0, (now - lastTick) / 1000));
    lastTick = now;

    if (!stage.classList.contains('is-battery-dead') || state.charging) {
      state.level = nextBatteryLevel(state.level, {
        charging: state.charging,
        stageVisible: isStageVisible(stage),
        screenAwake: isScreenAwake(stage),
        seconds,
      });
    }

    if (state.charging) {
      clearCritical();
      if (state.level > 25) { state.warned20 = false; state.warned10 = false; }
    } else {
      if (state.level <= 20 && state.level > 10 && !state.warned20) {
        state.warned20 = true;
        toast(stage, `低电量 · ${whole(state)}%`, 'warning');
      }
      if (state.level <= 10 && state.level > CRITICAL_LEVEL && !state.warned10) {
        state.warned10 = true;
        toast(stage, `电量仅剩 ${whole(state)}%`, 'danger');
      }
      beginCritical();
      if (state.shutdownDeadline && batterySecondsUntilShutdown(state) <= 0) {
        shutdown();
        return;
      }
    }

    persist(false);
    paint();
  };

  const blockDeadContent = (event) => {
    if (!stage.classList.contains('is-battery-dead')) return;
    if (event.target?.closest?.('[data-stage-close], [data-battery-charge-toggle], [data-battery-dead-charge], [data-power]')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  const deadPower = (event) => {
    if (!stage.classList.contains('is-battery-dead')) return;
    if (!event.target?.closest?.('#world-phone-stage [data-power]')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    boot();
  };

  const click = (event) => {
    const toggle = event.target?.closest?.('[data-battery-charge-toggle]');
    const deadCharge = event.target?.closest?.('[data-battery-dead-charge]');
    if (!toggle && !deadCharge) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    setCharging(deadCharge ? true : !state.charging);
  };

  stage.addEventListener('pointerdown', blockDeadContent, true);
  stage.addEventListener('pointermove', blockDeadContent, true);
  stage.addEventListener('pointerup', blockDeadContent, true);
  stage.addEventListener('click', blockDeadContent, true);
  stage.addEventListener('click', click, true);
  document.addEventListener('click', deadPower, true);

  const observer = new MutationObserver(queuePaint);
  observer.observe(stage, { childList: true, subtree: true });
  const timer = window.setInterval(tick, 1000);

  if (phone) {
    phone.battery = {
      state: () => ({ ...state, level: Number(state.level.toFixed(2)) }),
      setLevel,
      setCharging,
      boot,
    };
  }

  beginCritical();
  if (state.level <= 0) shutdown(); else paint();

  return () => {
    destroyed = true;
    window.clearInterval(timer);
    persist(true);
    observer.disconnect();
    stage.removeEventListener('pointerdown', blockDeadContent, true);
    stage.removeEventListener('pointermove', blockDeadContent, true);
    stage.removeEventListener('pointerup', blockDeadContent, true);
    stage.removeEventListener('click', blockDeadContent, true);
    stage.removeEventListener('click', click, true);
    document.removeEventListener('click', deadPower, true);
    stage.querySelector('.wp-battery-chrome')?.remove();
    stage.querySelector('[data-battery-settings-group]')?.remove();
    stage.querySelector('[data-battery-control-card]')?.remove();
    stage.classList.remove('is-battery-dead', 'is-battery-charging', 'is-battery-low');
    delete stage.dataset.batteryRealism;
    delete stage.dataset.batteryLevel;
    delete stage.dataset.batteryCharging;
    if (phone?.battery) delete phone.battery;
  };
}
