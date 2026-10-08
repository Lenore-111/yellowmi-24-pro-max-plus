const PRESS_SELECTOR = 'button,[role="button"]';
const TOP = 42;
const EDGE = 26;
const BOTTOM = 34;
const RECENTS_HOLD_MS = 260;

function vertical(dx, dy) {
  return Math.abs(dy) > Math.abs(dx) * 1.08;
}

function horizontal(dx, dy) {
  return Math.abs(dx) > Math.abs(dy) * 1.08;
}

function view(stage) {
  return stage.querySelector('[data-screen] > .wp-view');
}

function kind(stage, phone) {
  const current = String(phone?.current?.() || '');
  if (current) return current;
  const active = view(stage);
  if (active?.matches('.wp-lockscreen')) return 'lock';
  if (active?.matches('.wp-home')) return 'home';
  return active ? 'app' : '';
}

function panelOpen(stage) {
  const host = stage.querySelector('[data-system-panel-host]');
  return Boolean(host && !host.hidden);
}

function isScrollable(node) {
  if (!node || node.nodeType !== 1 || node.scrollHeight <= node.clientHeight + 2) return false;
  try {
    return /(auto|scroll|overlay)/i.test(getComputedStyle(node).overflowY || '');
  } catch {
    return false;
  }
}

function refreshSurface(stage, target) {
  const active = view(stage);
  if (!active || !active.classList.contains('wp-native-app')) return null;

  const origin = target?.nodeType === 1 ? target : target?.parentElement;
  // Pull-to-refresh belongs to App content only. System chrome such as the
  // gesture bar/status area is a sibling of the App and must never be promoted
  // into a refresh candidate by walking through shared ancestors.
  if (!origin || !active.contains(origin)) return null;

  const explicit = origin.closest?.('[data-phone-refresh-surface]');
  if (explicit && active.contains(explicit)) return explicit.scrollTop <= 1 ? explicit : null;

  let node = origin;
  while (node && node !== active) {
    if (isScrollable(node)) return node.scrollTop <= 1 ? node : null;
    node = node.parentElement;
  }

  if (isScrollable(active) || active.matches?.('[data-phone-refresh-surface]')) {
    return active.scrollTop <= 1 ? active : null;
  }

  // Static native pages can still opt into pull-to-refresh semantics without
  // pretending that an inner, already-scrolled list is at the top.
  return active;
}

function pointInsideDevice(stage, event) {
  const device = stage?.querySelector?.('.wp-device-wrap');
  if (!device) return false;
  const rect = device.getBoundingClientRect();
  const x = Number(event?.clientX);
  const y = Number(event?.clientY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

export function mountInteractionRealism({ phone } = {}) {
  const stage = document.querySelector('#world-phone-stage');
  const glass = stage?.querySelector('.wp-screen-glass');
  const screen = stage?.querySelector('[data-screen]');
  if (!stage || !glass || !screen) return () => {};

  let gesture = null;
  let pressed = null;
  let pending = '';
  let blockClickUntil = 0;
  let holdTimer = 0;
  let screenOff = false;
  const curtain = document.createElement('div');
  curtain.className = 'wp-screen-curtain';
  curtain.setAttribute('aria-hidden', 'true');
  glass.append(curtain);

  stage.dataset.interactionRealism = '1';
  stage.dataset.screenAwake = '1';

  const clearHold = () => {
    window.clearTimeout(holdTimer);
    holdTimer = 0;
  };

  const clearPress = () => {
    pressed?.classList.remove('is-wp-pressed');
    pressed = null;
  };

  const clearDrag = () => {
    stage.classList.remove('is-wp-drag-unlock', 'is-wp-drag-back', 'is-wp-drag-home', 'is-wp-drag-pull', 'is-wp-drag-refresh');
    stage.style.removeProperty('--wp-drag-x');
    stage.style.removeProperty('--wp-drag-y');
    stage.style.removeProperty('--wp-drag-scale');
    stage.style.removeProperty('--wp-pull-y');
    stage.style.removeProperty('--wp-refresh-y');
  };

  const markTransition = (name) => {
    pending = name;
  };

  const playTransition = () => {
    if (!pending) return;
    const active = view(stage);
    if (!active) return;
    const name = pending;
    pending = '';
    active.classList.add(`wp-enter-${name}`);
    window.setTimeout(() => active.classList.remove(`wp-enter-${name}`), 320);
  };

  const sleepScreen = () => {
    phone?.closeRecents?.();
    phone?.lock?.();
    screenOff = true;
    stage.classList.add('is-screen-off');
    stage.dataset.screenAwake = '0';
    clearHold();
    if (gesture?.captured) {
      try { stage.releasePointerCapture?.(gesture.pointerId); } catch {}
    }
    gesture = null;
    clearDrag();
  };

  const wakeScreen = () => {
    screenOff = false;
    stage.classList.remove('is-screen-off');
    stage.dataset.screenAwake = '1';
  };

  if (phone) {
    phone.sleepScreen = sleepScreen;
    phone.wakeScreen = wakeScreen;
    phone.screenAwake = () => !screenOff && !stage.classList.contains('is-screen-off');
  }

  const observer = new MutationObserver(() => {
    playTransition();
    stage.dataset.interactionView = kind(stage, phone);
  });
  observer.observe(screen, { childList: true, subtree: false });

  const down = (event) => {
    if (event.button > 0) return;
    pressed = event.target?.closest?.(PRESS_SELECTOR) || null;
    pressed?.classList.add('is-wp-pressed');
    if (screenOff || stage.classList.contains('is-screen-off')) return;
    if (!glass.contains(event.target) || panelOpen(stage) || phone?.recentsOpen?.()) return;

    const rect = glass.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const current = kind(stage, phone);
    let type = '';
    if (y <= TOP) type = 'pull';
    else if (current === 'lock') type = 'unlock';
    else if (current !== 'home' && current !== 'lock' && x <= EDGE) type = 'back';
    // System navigation zones outrank App-local refresh. Otherwise a native App
    // at scrollTop=0 can steal the bottom Home gesture before it even starts.
    else if (current !== 'lock' && (event.target?.closest?.('.wp-gesture-bar') || y >= rect.height - BOTTOM)) type = 'home';
    else if (current.startsWith('app:') && refreshSurface(stage, event.target)) type = 'refresh';
    if (!type) return;
    if (type === 'home') event.preventDefault();

    gesture = {
      type,
      current,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      side: x < rect.width / 2 ? 'left' : 'right',
      lastDy: 0,
      recentsOpened: false,
      captured: false,
    };
  };

  const captureGesturePointer = (event, dx, dy) => {
    if (!gesture || gesture.captured || Math.hypot(dx, dy) <= 9) return;
    globalThis.getSelection?.()?.removeAllRanges();
    try {
      stage.setPointerCapture?.(event.pointerId);
      gesture.captured = true;
    } catch {}
  };

  const move = (event) => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    const moved = Math.hypot(dx, dy) > 9;
    gesture.lastDy = dy;
    if (moved) clearPress();

    if (gesture.type === 'unlock' && moved && dy < 0 && vertical(dx, dy)) {
      captureGesturePointer(event, dx, dy);
      event.preventDefault();
      const n = Math.min(140, -dy);
      stage.classList.add('is-wp-drag-unlock');
      stage.style.setProperty('--wp-drag-y', `${(-n * .24).toFixed(1)}px`);
      stage.style.setProperty('--wp-drag-scale', String(1 - n / 2600));
    } else if (gesture.type === 'back' && moved && dx > 0 && horizontal(dx, dy)) {
      captureGesturePointer(event, dx, dy);
      event.preventDefault();
      stage.classList.add('is-wp-drag-back');
      stage.style.setProperty('--wp-drag-x', `${(Math.min(150, dx) * .34).toFixed(1)}px`);
    } else if (gesture.type === 'home' && moved && dy < 0 && vertical(dx, dy)) {
      captureGesturePointer(event, dx, dy);
      event.preventDefault();
      const n = Math.min(120, -dy);
      stage.classList.add('is-wp-drag-home');
      stage.style.setProperty('--wp-drag-y', `${(-n * .16).toFixed(1)}px`);
      stage.style.setProperty('--wp-drag-scale', String(1 - n / 1800));
      if (n >= 36 && !holdTimer && typeof phone?.openRecents === 'function') {
        const pointerId = gesture.pointerId;
        holdTimer = window.setTimeout(() => {
          holdTimer = 0;
          if (!gesture || gesture.pointerId !== pointerId || gesture.type !== 'home' || gesture.lastDy > -36) return;
          gesture.recentsOpened = phone.openRecents() !== false;
          if (gesture.recentsOpened) clearDrag();
        }, RECENTS_HOLD_MS);
      } else if (n < 24) {
        clearHold();
      }
    } else if (gesture.type === 'pull' && moved && dy > 0 && vertical(dx, dy)) {
      captureGesturePointer(event, dx, dy);
      event.preventDefault();
      stage.classList.add('is-wp-drag-pull');
      stage.style.setProperty('--wp-pull-y', `${Math.min(28, dy * .24).toFixed(1)}px`);
    } else if (gesture.type === 'refresh' && moved && dy > 0 && vertical(dx, dy)) {
      captureGesturePointer(event, dx, dy);
      event.preventDefault();
      stage.classList.add('is-wp-drag-refresh');
      stage.style.setProperty('--wp-refresh-y', `${Math.min(34, dy * .28).toFixed(1)}px`);
    }
  };

  const blockNativeClick = () => {
    blockClickUntil = Date.now() + 300;
  };

  const releaseGesturePointer = (pointerId, state) => {
    if (!state?.captured) return;
    try { stage.releasePointerCapture?.(pointerId); } catch {}
  };

  const up = (event) => {
    clearPress();
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const active = gesture;
    gesture = null;
    clearHold();
    const dx = event.clientX - active.x;
    const dy = event.clientY - active.y;

    // Once a drag truly captured the pointer, the following native click can be
    // retargeted to the stage itself. Always suppress that click so a gesture can
    // never masquerade as a tap on the backdrop and close the phone.
    if (active.captured) blockNativeClick();

    if (active.recentsOpened) {
      blockNativeClick();
      releaseGesturePointer(event.pointerId, active);
      clearDrag();
      return;
    }
    if (active.type === 'unlock' && dy <= -54 && vertical(dx, dy)) {
      const unlock = stage.querySelector('[data-unlock]');
      if (unlock) {
        blockNativeClick();
        unlock.click();
      }
    } else if (active.type === 'back' && dx >= 58 && horizontal(dx, dy)) {
      const back = view(stage)?.querySelector('[data-app-back]');
      if (back) {
        blockNativeClick();
        back.click();
      }
    } else if (active.type === 'home' && dy <= -50 && vertical(dx, dy) && active.current !== 'home' && typeof phone?.home === 'function') {
      blockNativeClick();
      markTransition('home');
      phone.home();
    } else if (active.type === 'pull' && dy >= 48 && vertical(dx, dy)) {
      const mode = active.side === 'left' ? 'notifications' : 'controls';
      const opener = stage.querySelector(`[data-system-open="${mode}"]`);
      if (opener) {
        blockNativeClick();
        opener.click();
      }
    } else if (active.type === 'refresh' && dy >= 54 && vertical(dx, dy)) {
      if (typeof phone?.refresh === 'function') {
        blockNativeClick();
        phone.refresh();
      }
    }
    releaseGesturePointer(event.pointerId, active);
    clearDrag();
  };

  const cancel = () => {
    if (gesture?.captured) {
      try { stage.releasePointerCapture?.(gesture.pointerId); } catch {}
    }
    clearHold();
    gesture = null;
    clearPress();
    clearDrag();
  };

  const click = (event) => {
    const target = event.target;

    // Pointer capture can retarget a gesture's follow-up click to the stage.
    // If the physical coordinates are still inside the phone chassis, that is
    // never a legitimate backdrop click and must not reach closeStage().
    if (target === stage && pointInsideDevice(stage, event)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      clearPress();
      return;
    }

    const power = target?.closest?.('[data-power]');
    if (power) {
      event.preventDefault();
      event.stopImmediatePropagation();
      clearPress();
      if (screenOff) wakeScreen(); else sleepScreen();
      return;
    }
    if (Date.now() < blockClickUntil && event.isTrusted) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (target?.closest?.('.wp-home [data-app]')) markTransition('app');
    else if (target?.closest?.('[data-wx-chat]')) markTransition('thread');
    else if (target?.closest?.('[data-app-back]')) markTransition('back');
    else if (target?.closest?.('[data-unlock]')) markTransition('unlock');
    else if (target?.closest?.('[data-lock]')) markTransition('lock');
  };

  stage.addEventListener('pointerdown', down, true);
  stage.addEventListener('pointermove', move, { capture: true, passive: false });
  stage.addEventListener('pointerup', up, true);
  stage.addEventListener('pointercancel', cancel, true);
  stage.addEventListener('click', click, true);
  window.addEventListener('blur', cancel);
  stage.dataset.interactionView = kind(stage, phone);

  return () => {
    observer.disconnect();
    cancel();
    stage.removeEventListener('pointerdown', down, true);
    stage.removeEventListener('pointermove', move, true);
    stage.removeEventListener('pointerup', up, true);
    stage.removeEventListener('pointercancel', cancel, true);
    stage.removeEventListener('click', click, true);
    window.removeEventListener('blur', cancel);
    curtain.remove();
    stage.classList.remove('is-screen-off');
    delete stage.dataset.interactionRealism;
    delete stage.dataset.interactionView;
    delete stage.dataset.screenAwake;
    if (phone?.sleepScreen === sleepScreen) delete phone.sleepScreen;
    if (phone?.wakeScreen === wakeScreen) delete phone.wakeScreen;
    if (typeof phone?.screenAwake === 'function') delete phone.screenAwake;
  };
}