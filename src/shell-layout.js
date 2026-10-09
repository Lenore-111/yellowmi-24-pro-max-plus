const POSITION_KEY = 'world_phone_shell_positions_v1';
const MOBILE_QUERY = '(max-width: 700px)';
const EDGE_GAP = 8;
const LAUNCHER_IDLE_MS = 2000;
const LAUNCHER_PEEK = 24;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function readPositions() {
  try {
    const parsed = JSON.parse(globalThis.localStorage?.getItem?.(POSITION_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writePositions(value) {
  try {
    globalThis.localStorage?.setItem?.(POSITION_KEY, JSON.stringify(value));
  } catch {}
}

function viewportSize() {
  const visual = globalThis.visualViewport;
  return {
    width: Math.max(1, Number(visual?.width || globalThis.innerWidth || document.documentElement.clientWidth || 1)),
    height: Math.max(1, Number(visual?.height || globalThis.innerHeight || document.documentElement.clientHeight || 1)),
  };
}

function applyAbsolutePosition(node, left, top) {
  if (!node) return;
  node.style.left = `${Math.round(left)}px`;
  node.style.top = `${Math.round(top)}px`;
  node.style.right = 'auto';
  node.style.bottom = 'auto';
}

function clearAbsolutePosition(node) {
  if (!node) return;
  for (const property of ['left', 'top', 'right', 'bottom']) node.style.removeProperty(property);
}

function clampNodePosition(node, left, top) {
  const rect = node.getBoundingClientRect();
  const viewport = viewportSize();
  return {
    left: clamp(left, EDGE_GAP, viewport.width - rect.width - EDGE_GAP),
    top: clamp(top, EDGE_GAP, viewport.height - rect.height - EDGE_GAP),
  };
}

export function mountShellLayout() {
  const stage = document.querySelector('#world-phone-stage');
  const launcher = document.querySelector('#world-phone-launcher');
  const wrap = stage?.querySelector('.wp-device-wrap');
  const close = stage?.querySelector('[data-stage-close]');
  if (!stage || !launcher || !wrap) return () => {};

  const media = globalThis.matchMedia?.(MOBILE_QUERY);
  const positions = readPositions();
  let drag = null;
  let suppressLauncherClick = false;
  let suppressTimer = 0;
  let idleTimer = 0;
  let keyboardInput = false;

  // 将入口及其点击区域裁切到屏幕内，避免撑宽页面。
  const launcherLayer = document.createElement('div');
  launcherLayer.id = 'world-phone-launcher-layer';
  const initialViewport = viewportSize();
  Object.assign(launcherLayer.style, {
    position: 'absolute', left: '0px', top: '0px',
    width: `${Math.round(initialViewport.width)}px`, height: `${Math.round(initialViewport.height)}px`,
  });
  launcher.before(launcherLayer);
  launcherLayer.append(launcher);

  stage.dataset.shellLayout = '1';
  launcher.style.setProperty('--phone-launcher-peek', `${LAUNCHER_PEEK}px`);

  if (close && close.parentElement !== wrap) wrap.prepend(close);

  let handle = wrap.querySelector('[data-shell-drag-handle]');
  if (!handle) {
    handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'wp-shell-drag-handle';
    handle.dataset.shellDragHandle = '1';
    handle.setAttribute('aria-label', '拖动Echo 手机');
    handle.title = '拖动Echo 手机';
    handle.innerHTML = '<span></span>';
    wrap.prepend(handle);
  }

  const isMobile = () => Boolean(media?.matches ?? globalThis.innerWidth <= 700);

  // Tavern's transformed root makes fixed children follow host scrolling.
  // Offset only the phone overlay, preserving the host's layout and scroll.
  function syncHostScroll() {
    const transformedRoot = getComputedStyle(document.documentElement).transform !== 'none';
    stage.style.setProperty('--phone-host-scroll-x', `${transformedRoot ? globalThis.scrollX : 0}px`);
    stage.style.setProperty('--phone-host-scroll-y', `${transformedRoot ? globalThis.scrollY : 0}px`);
  }
  window.addEventListener('scroll', syncHostScroll, { passive: true });
  syncHostScroll();

  function positionLauncher(edge, top, tucked = false) {
    const viewport = viewportSize();
    // 显式设置屏幕尺寸，避免根元素布局高度为零时裁掉整个入口。
    launcherLayer.style.width = `${Math.round(viewport.width)}px`;
    launcherLayer.style.height = `${Math.round(viewport.height)}px`;
    const width = launcher.offsetWidth;
    const height = launcher.offsetHeight;
    launcher.dataset.edge = edge;
    launcher.classList.toggle('is-edge-tucked', tucked);
    const left = tucked
      ? (edge === 'left' ? LAUNCHER_PEEK - width : viewport.width - LAUNCHER_PEEK)
      : (edge === 'left' ? EDGE_GAP : viewport.width - width - EDGE_GAP);
    applyAbsolutePosition(launcher, left, clamp(top, EDGE_GAP, viewport.height - height - EDGE_GAP));
  }

  function wakeLauncher() {
    window.clearTimeout(idleTimer);
    const rect = launcher.getBoundingClientRect();
    positionLauncher(launcher.dataset.edge || 'right', rect.top);
  }

  function queueLauncherTuck() {
    window.clearTimeout(idleTimer);
    if (drag || !stage.hidden) return;
    idleTimer = window.setTimeout(() => {
      if (drag || !stage.hidden || (keyboardInput && document.activeElement === launcher)) return;
      positionLauncher(launcher.dataset.edge || 'right', launcher.getBoundingClientRect().top, true);
    }, LAUNCHER_IDLE_MS);
  }

  function onLauncherEnter(event) {
    if (event.pointerType !== 'touch' && !drag) { wakeLauncher(); queueLauncherTuck(); }
  }

  function onLauncherFocus() { wakeLauncher(); queueLauncherTuck(); }

  function onPointerInput() { keyboardInput = false; }

  function onKeyboardInput(event) {
    keyboardInput = true;
    if (event.target === launcher) wakeLauncher();
  }

  function persist(kind, node) {
    if (!node) return;
    const rect = node.getBoundingClientRect();
    positions[kind] = { left: Math.round(rect.left), top: Math.round(rect.top) };
    if (kind === 'launcher') {
      positions[kind].edge = node.dataset.edge;
      positions[kind].left = Math.round(Number.parseFloat(node.style.left));
    }
    writePositions(positions);
  }

  function restoreNode(kind, node) {
    const saved = positions[kind];
    if (kind === 'launcher') {
      const rect = node.getBoundingClientRect();
      const valid = saved && Number.isFinite(saved.left) && Number.isFinite(saved.top);
      const edge = valid
        ? (['left', 'right'].includes(saved.edge) ? saved.edge : (saved.left + rect.width / 2 < viewportSize().width / 2 ? 'left' : 'right'))
        : (node.dataset.edge || (rect.left + rect.width / 2 < viewportSize().width / 2 ? 'left' : 'right'));
      positionLauncher(edge, valid ? saved.top : rect.top, node.classList.contains('is-edge-tucked'));
      return;
    }
    if (!saved || !Number.isFinite(saved.left) || !Number.isFinite(saved.top)) {
      clearAbsolutePosition(node);
      return;
    }
    const next = clampNodePosition(node, saved.left, saved.top);
    applyAbsolutePosition(node, next.left, next.top);

  }

  function syncMode() {
    const mobile = isMobile();
    stage.dataset.shellMode = mobile ? 'mobile-fullscreen' : 'desktop-floating';
    if (mobile) stage.style.setProperty('--phone-visible-height', `${Math.round(viewportSize().height)}px`);
    else stage.style.removeProperty('--phone-visible-height');
    document.documentElement.classList.toggle('wp-mobile-fullscreen-active', mobile && !stage.hidden);

    if (close) {
      const label = mobile ? '返回酒馆' : '收起Echo 手机';
      close.setAttribute('aria-label', label);
      close.title = label;
    }

    if (mobile) {
      clearAbsolutePosition(wrap);
    } else {
      restoreNode('device', wrap);
    }
    restoreNode('launcher', launcher);
  }

  function beginDrag(kind, node, event) {
    if (event.button !== undefined && event.button !== 0) return;
    if (kind === 'device' && isMobile()) return;
    if (drag) return;
    if (kind === 'launcher') { launcher.classList.add('is-launcher-dragging'); wakeLauncher(); }
    const rect = node.getBoundingClientRect();
    drag = {
      kind,
      node,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: rect.left,
      top: rect.top,
      moved: false,
    };
    node.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }

  function moveDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    drag.moved = true;
    const next = clampNodePosition(drag.node, drag.left + dx, drag.top + dy);
    applyAbsolutePosition(drag.node, next.left, next.top);
    event.preventDefault();
  }

  function endDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const finished = drag;
    drag = null;
    finished.node.classList.remove('is-launcher-dragging');
    if (finished.node.hasPointerCapture?.(event.pointerId)) finished.node.releasePointerCapture(event.pointerId);
    if (!finished.moved) { queueLauncherTuck(); return; }
    if (finished.kind === 'launcher') {
      const rect = finished.node.getBoundingClientRect();
      const size = viewportSize();
      const edge = rect.left + rect.width / 2 < size.width / 2 ? 'left' : 'right';
      positionLauncher(edge, rect.top);
    }
    persist(finished.kind, finished.node);
    queueLauncherTuck();
    if (finished.kind === 'launcher') {
      suppressLauncherClick = true;
      window.clearTimeout(suppressTimer);
      suppressTimer = window.setTimeout(() => { suppressLauncherClick = false; }, 400);
    }
    event.preventDefault();
  }

  function blockDraggedLauncherClick(event) {
    if (!suppressLauncherClick) return;
    suppressLauncherClick = false;
    window.clearTimeout(suppressTimer);
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function onStageMutation() {
    document.documentElement.classList.toggle('wp-mobile-fullscreen-active', isMobile() && !stage.hidden);
    if (stage.hidden) queueLauncherTuck(); else wakeLauncher();
  }

  function onViewportChange() {
    if (drag) return;
    syncHostScroll();
    syncMode();
  }

  const onDeviceDown = event => beginDrag('device', wrap, event);
  const onLauncherDown = event => beginDrag('launcher', launcher, event);
  handle.addEventListener('pointerdown', onDeviceDown);
  launcher.addEventListener('pointerdown', onLauncherDown);
  launcher.addEventListener('pointerenter', onLauncherEnter);
  launcher.addEventListener('pointerleave', queueLauncherTuck);
  launcher.addEventListener('focus', onLauncherFocus);
  launcher.addEventListener('blur', queueLauncherTuck);
  launcher.addEventListener('click', blockDraggedLauncherClick, true);
  window.addEventListener('pointermove', moveDrag, { passive: false });
  window.addEventListener('pointerup', endDrag, { passive: false });
  window.addEventListener('pointercancel', endDrag, { passive: false });
  window.addEventListener('lostpointercapture', endDrag);
  window.addEventListener('pointerdown', onPointerInput, true);
  window.addEventListener('keydown', onKeyboardInput, true);
  window.addEventListener('resize', onViewportChange);
  globalThis.visualViewport?.addEventListener?.('resize', onViewportChange);
  media?.addEventListener?.('change', onViewportChange);
  const sizeObserver = globalThis.ResizeObserver ? new ResizeObserver(onViewportChange) : null;
  sizeObserver?.observe(launcher);

  // Read only the companion's visual palette, never its world store.
  let paletteRoot = null;
  const paletteVariables = {'--wb-bg':'--phone-orb-bg', '--wb-accent':'--phone-orb-accent', '--wb-line-strong':'--phone-orb-line', '--wb-amber':'--phone-orb-notice'};
  const syncPalette = () => {
    const root = document.querySelector('#world-backstage-root');
    if (root !== paletteRoot) {
      paletteObserver.disconnect(); paletteRoot = root;
      if (root) paletteObserver.observe(root, {attributes:true, attributeFilter:['class','style']});
    }
    const style = root ? getComputedStyle(root) : null;
    for (const [source,target] of Object.entries(paletteVariables)) {
      const value = style?.getPropertyValue(source).trim();
      if (value) launcher.style.setProperty(target,value); else launcher.style.removeProperty(target);
    }
  };
  const paletteObserver = new MutationObserver(syncPalette);
  const rootObserver = new MutationObserver(syncPalette);
  rootObserver.observe(document.body, {childList:true});
  window.addEventListener('world-backstage:ready', syncPalette);
  syncPalette();

  const observer = new MutationObserver(onStageMutation);
  observer.observe(stage, { attributes: true, attributeFilter: ['hidden', 'class'] });

  // Status ink follows the active page, including independent phone apps.
  const screen = stage.querySelector('[data-screen]');
  let themeFrame = 0;
  function syncStatusTheme() {
    themeFrame = 0;
    const view = screen?.querySelector(':scope > .wp-view');
    if (!view) return;
    let lightBackground = stage.dataset.phoneSkinTone === 'light';
    if (!view.matches('.wp-home, .wp-lockscreen')) {
      for (const node of [view, view.querySelector('.wp-app-header'), screen]) {
        if (!node) continue;
        const values = getComputedStyle(node).backgroundColor.match(/[\d.]+/g)?.map(Number);
        if (!values || (values[3] ?? 1) < .9) continue;
        lightBackground = .2126 * values[0] + .7152 * values[1] + .0722 * values[2] > 150;
        break;
      }
    }
    stage.dataset.statusTheme = lightBackground ? 'dark' : 'light';
  }
  const scheduleStatusTheme = () => {
    if (!themeFrame) themeFrame = requestAnimationFrame(syncStatusTheme);
  };
  const themeObserver = new MutationObserver(scheduleStatusTheme);
  if (screen) themeObserver.observe(screen, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'data-phone-wallpaper'] });
  syncStatusTheme();
  syncMode();
  onStageMutation();

  return () => {
    observer.disconnect();
    themeObserver.disconnect();
    cancelAnimationFrame(themeFrame);
    delete stage.dataset.statusTheme;
    paletteObserver.disconnect(); rootObserver.disconnect();
    window.removeEventListener('world-backstage:ready', syncPalette);
    window.clearTimeout(suppressTimer);
    window.clearTimeout(idleTimer);
    sizeObserver?.disconnect();
    launcher.removeEventListener('pointerdown', onLauncherDown);
    launcher.removeEventListener('pointerenter', onLauncherEnter);
    launcher.removeEventListener('pointerleave', queueLauncherTuck);
    launcher.removeEventListener('focus', onLauncherFocus);
    launcher.removeEventListener('blur', queueLauncherTuck);
    handle.removeEventListener('pointerdown', onDeviceDown);
    launcher.classList.remove('is-edge-tucked', 'is-launcher-dragging');
    wakeLauncher();
    launcherLayer.before(launcher);
    launcherLayer.remove();
    window.removeEventListener('pointermove', moveDrag);
    window.removeEventListener('pointerup', endDrag);
    window.removeEventListener('pointercancel', endDrag);
    window.removeEventListener('lostpointercapture', endDrag);
    window.removeEventListener('pointerdown', onPointerInput, true);
    window.removeEventListener('keydown', onKeyboardInput, true);
    window.removeEventListener('resize', onViewportChange);
    window.removeEventListener('scroll', syncHostScroll);
    stage.style.removeProperty('--phone-host-scroll-x');
    stage.style.removeProperty('--phone-host-scroll-y');
    globalThis.visualViewport?.removeEventListener?.('resize', onViewportChange);
    media?.removeEventListener?.('change', onViewportChange);
    launcher.removeEventListener('click', blockDraggedLauncherClick, true);
    handle?.remove();
    delete stage.dataset.shellLayout;
    delete stage.dataset.shellMode;
    stage.style.removeProperty('--phone-visible-height');
    document.documentElement.classList.remove('wp-mobile-fullscreen-active');
  };
}

export { POSITION_KEY as SHELL_LAYOUT_STORAGE_KEY };
