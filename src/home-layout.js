const STORAGE_KEY = 'world_phone_home_layout_v1';
export const MAX_DOCK_APPS = 4;

export const DEFAULT_HOME_LAYOUT = Object.freeze({
  desktop: Object.freeze([
    'wechat',
    'news',
    'wallet',
    'delivery',
    'gallery',
    'music',
    'casino',
    'puzzle',
    'settings',
  ]),
  dock: Object.freeze([
    'phone',
    'messages',
    'browser',
    'backstage',
  ]),
});

const KNOWN_IDS = new Set([...DEFAULT_HOME_LAYOUT.desktop, ...DEFAULT_HOME_LAYOUT.dock]);

function cloneDefault() {
  return {
    desktop: [...DEFAULT_HOME_LAYOUT.desktop],
    dock: [...DEFAULT_HOME_LAYOUT.dock],
  };
}

export function normalizeHomeLayout(value) {
  if (!value || typeof value !== 'object') return cloneDefault();

  const desktop = [];
  const dock = [];
  const seen = new Set();

  const take = (source, target, limit = Infinity) => {
    if (!Array.isArray(source)) return;
    for (const raw of source) {
      const id = String(raw || '').trim();
      if (!KNOWN_IDS.has(id) || seen.has(id)) continue;
      if (target.length >= limit) continue;
      seen.add(id);
      target.push(id);
    }
  };

  take(value.dock, dock, MAX_DOCK_APPS);
  take(value.desktop, desktop);

  for (const id of DEFAULT_HOME_LAYOUT.desktop) {
    if (seen.has(id)) continue;
    seen.add(id);
    desktop.push(id);
  }

  for (const id of DEFAULT_HOME_LAYOUT.dock) {
    if (seen.has(id)) continue;
    seen.add(id);
    if (dock.length < MAX_DOCK_APPS) dock.push(id);
    else desktop.push(id);
  }

  return { desktop, dock };
}

export function readHomeLayout(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem?.(STORAGE_KEY);
    if (!raw) return cloneDefault();
    return normalizeHomeLayout(JSON.parse(raw));
  } catch {
    return cloneDefault();
  }
}

export function writeHomeLayout(layout, storage = globalThis.localStorage) {
  const normalized = normalizeHomeLayout(layout);
  try {
    storage?.setItem?.(STORAGE_KEY, JSON.stringify(normalized));
  } catch {}
  return normalized;
}

export function resetHomeLayout(storage = globalThis.localStorage) {
  try {
    storage?.removeItem?.(STORAGE_KEY);
  } catch {}
  return cloneDefault();
}

function idsFrom(container) {
  return [...(container?.querySelectorAll?.(':scope > .wp-app[data-app]') || [])]
    .map((node) => node.dataset.app)
    .filter(Boolean);
}

function domLayout(grid, dock) {
  return normalizeHomeLayout({
    desktop: idsFrom(grid),
    dock: idsFrom(dock),
  });
}

function placeGhost(ghost, home, clientX, clientY) {
  if (!ghost || !home) return;
  const homeRect = home.getBoundingClientRect();
  const width = Number(ghost.dataset.dragWidth || 0);
  const height = Number(ghost.dataset.dragHeight || 0);
  ghost.style.left = `${clientX - homeRect.left - width / 2}px`;
  ghost.style.top = `${clientY - homeRect.top - height / 2}px`;
}

function insertAroundTarget(node, target, container, clientX, clientY) {
  if (!node || !target || target === node || target.parentElement !== container) return;
  const rect = target.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const sameRow = Math.abs(clientY - centerY) <= rect.height * 0.48;
  const before = sameRow ? clientX < centerX : clientY < centerY;

  if (before) container.insertBefore(node, target);
  else container.insertBefore(node, target.nextSibling);
}

export function mountHomeLayoutEditor({
  screen,
  home,
  grid,
  dock,
  onOpenApp,
  storage = globalThis.localStorage,
} = {}) {
  if (!screen || !home || !grid || !dock) return null;

  const done = home.querySelector('[data-home-done]');
  const hint = home.querySelector('[data-home-edit-hint]');
  const lock = home.querySelector('[data-lock]');
  let editMode = false;
  let interaction = null;
  let suppressClickUntil = 0;

  delete screen.dataset.homeEditing;

  function enterEdit() {
    if (editMode) return;
    editMode = true;
    home.classList.add('is-editing');
    screen.dataset.homeEditing = '1';
    if (done) done.hidden = false;
    if (hint) hint.hidden = false;
    if (lock) lock.hidden = true;
  }

  function exitEdit() {
    editMode = false;
    suppressClickUntil = 0;
    home.classList.remove('is-editing', 'is-reordering');
    dock.classList.remove('is-full');
    delete screen.dataset.homeEditing;
    if (done) done.hidden = true;
    if (hint) hint.hidden = true;
    if (lock) lock.hidden = false;
  }

  function persist() {
    return writeHomeLayout(domLayout(grid, dock), storage);
  }

  function activateDrag(event) {
    if (!interaction || interaction.active) return;
    // Capturing on a simple press can retarget the native click from the icon to
    // its parent. Capture only once a long press has actually become a drag.
    try { home.setPointerCapture?.(interaction.pointerId); } catch {}
    enterEdit();
    interaction.active = true;
    interaction.node.classList.add('is-dragging');
    home.classList.add('is-reordering');

    const rect = interaction.node.getBoundingClientRect();
    const ghost = interaction.node.cloneNode(true);
    ghost.removeAttribute('data-app');
    ghost.removeAttribute('id');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.classList.add('wp-app-drag-ghost');
    ghost.dataset.dragWidth = String(rect.width);
    ghost.dataset.dragHeight = String(rect.height);
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    interaction.ghost = ghost;
    home.append(ghost);
    placeGhost(ghost, home, event.clientX, event.clientY);
  }

  function clearInteraction({ save = false } = {}) {
    if (!interaction) return;
    window.clearTimeout(interaction.holdTimer);
    interaction.node?.classList.remove('is-dragging');
    interaction.ghost?.remove();
    dock.classList.remove('is-full');
    home.classList.remove('is-reordering');
    if (save && interaction.active) persist();
    interaction = null;
  }

  function onPointerDown(event) {
    const app = event.target.closest?.('.wp-app[data-app]');
    if (!app || !home.contains(app)) return;
    if (event.button !== undefined && event.button !== 0) return;

    clearInteraction();

    interaction = {
      node: app,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      ghost: null,
      holdTimer: 0,
    };

    if (editMode) {
      activateDrag(event);
      event.preventDefault();
      return;
    }

    interaction.holdTimer = window.setTimeout(() => {
      if (!interaction || interaction.pointerId !== event.pointerId) return;
      activateDrag(event);
      suppressClickUntil = Date.now() + 500;
    }, 420);
  }

  function onPointerMove(event) {
    if (!interaction || event.pointerId !== interaction.pointerId) return;

    const dx = event.clientX - interaction.startX;
    const dy = event.clientY - interaction.startY;
    if (!interaction.active) {
      if (Math.hypot(dx, dy) > 9) {
        window.clearTimeout(interaction.holdTimer);
        interaction.holdTimer = 0;
      }
      return;
    }

    event.preventDefault();
    placeGhost(interaction.ghost, home, event.clientX, event.clientY);

    const hit = document.elementFromPoint(event.clientX, event.clientY);
    const container = hit?.closest?.('[data-app-grid], [data-dock]');
    if (!container || !home.contains(container)) return;

    const node = interaction.node;
    const target = hit?.closest?.('.wp-app[data-app]');
    const movingIntoDock = container === dock && node.parentElement !== dock;

    if (movingIntoDock && idsFrom(dock).length >= MAX_DOCK_APPS) {
      if (target && target !== node && target.parentElement === dock) {
        const source = node.parentElement;
        const sourceNext = node.nextSibling;
        dock.insertBefore(node, target);
        if (sourceNext) source.insertBefore(target, sourceNext);
        else source.append(target);
        dock.classList.remove('is-full');
      } else {
        dock.classList.add('is-full');
      }
      return;
    }

    dock.classList.remove('is-full');
    if (target && target !== node) {
      insertAroundTarget(node, target, container, event.clientX, event.clientY);
    } else if (node.parentElement !== container) {
      container.append(node);
    }
  }

  function onPointerEnd(event) {
    if (!interaction || event.pointerId !== interaction.pointerId) return;
    const dragged = interaction.active;
    clearInteraction({ save: dragged });
    try {
      home.releasePointerCapture?.(event.pointerId);
    } catch {}
    if (dragged) {
      suppressClickUntil = Date.now() + 350;
      event.preventDefault();
    }
  }

  function onClick(event) {
    const app = event.target.closest?.('.wp-app[data-app]');
    if (!app || !home.contains(app)) return;

    if (editMode || Date.now() < suppressClickUntil) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    onOpenApp?.(app.dataset.app);
  }

  function onContextMenu(event) {
    if (event.target.closest?.('.wp-app[data-app]')) event.preventDefault();
  }

  done?.addEventListener('click', (event) => {
    event.preventDefault();
    exitEdit();
  });
  home.addEventListener('pointerdown', onPointerDown);
  home.addEventListener('pointermove', onPointerMove, { passive: false });
  home.addEventListener('pointerup', onPointerEnd, { passive: false });
  home.addEventListener('pointercancel', onPointerEnd, { passive: false });
  home.addEventListener('click', onClick, true);
  home.addEventListener('contextmenu', onContextMenu);

  return {
    enterEdit,
    exitEdit,
    persist,
    isEditing: () => editMode,
  };
}

export { STORAGE_KEY as HOME_LAYOUT_STORAGE_KEY };
