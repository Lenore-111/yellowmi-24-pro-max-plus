const STORAGE_KEY = 'world_phone_music_v1';
const MAX_TRACKS = 80;

function text(value, fallback = '') {
  const clean = String(value ?? '').trim();
  return clean || fallback;
}

function safePersistedAudioUrl(value) {
  const url = text(value);
  return /^(?:https?:\/\/|data:audio\/)/i.test(url) ? url : '';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

function makeId(prefix = 'track') {
  try { return `${prefix}:${crypto.randomUUID()}`; } catch {}
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeTrack(raw, index = 0) {
  if (!raw || typeof raw !== 'object') return null;
  const url = safePersistedAudioUrl(raw.url);
  if (!url) return null;
  return {
    id: text(raw.id, `track:${index}`).slice(0, 180),
    title: text(raw.title, `音轨 ${index + 1}`).slice(0, 120),
    artist: text(raw.artist, '未知作者').slice(0, 100),
    url,
  };
}

export function sanitizeMusicState(value) {
  const source = value && typeof value === 'object' ? value : {};
  const seen = new Set();
  const tracks = [];
  for (const [index, raw] of (Array.isArray(source.tracks) ? source.tracks : []).entries()) {
    const track = normalizeTrack(raw, index);
    if (!track || seen.has(track.id)) continue;
    seen.add(track.id);
    tracks.push(track);
    if (tracks.length >= MAX_TRACKS) break;
  }
  const currentId = tracks.some((track) => track.id === source.currentId) ? String(source.currentId) : '';
  return { version: 1, tracks, currentId };
}

function loadState() {
  try {
    return sanitizeMusicState(JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) || 'null'));
  } catch {
    return sanitizeMusicState(null);
  }
}

let state = loadState();
const sessionTracks = new Map();
let audio = null;
let uiTimer = 0;
let activePaint = null;

function persist() {
  try { globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(sanitizeMusicState(state))); } catch {}
}

function tracks() {
  return [...state.tracks, ...sessionTracks.values()];
}

function trackById(id) {
  return tracks().find((track) => track.id === id) || null;
}

function currentTrack() {
  return trackById(audio?.dataset?.trackId || state.currentId) || null;
}

function durationLabel(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  if (!Number.isFinite(value)) return '0:00';
  const minutes = Math.floor(value / 60);
  const rest = Math.floor(value % 60).toString().padStart(2, '0');
  return `${minutes}:${rest}`;
}

function notifyPaint() {
  if (typeof activePaint === 'function') activePaint();
}

function ensureAudio() {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = 'metadata';
  audio.addEventListener('play', notifyPaint);
  audio.addEventListener('pause', notifyPaint);
  audio.addEventListener('loadedmetadata', notifyPaint);
  audio.addEventListener('ended', () => { void playAdjacent(1); });
  audio.addEventListener('error', notifyPaint);
  return audio;
}

function rememberCurrent(track) {
  if (!track || track.sessionOnly) {
    state.currentId = '';
  } else {
    state.currentId = track.id;
  }
  persist();
}

async function playTrack(id) {
  const track = trackById(id);
  if (!track) return false;
  const player = ensureAudio();
  if (player.dataset.trackId !== track.id || player.src !== track.url) {
    player.pause();
    player.src = track.url;
    player.dataset.trackId = track.id;
    player.load();
  }
  rememberCurrent(track);
  try {
    await player.play();
    return true;
  } catch {
    notifyPaint();
    return false;
  }
}

async function playAdjacent(offset) {
  const list = tracks();
  if (!list.length) return false;
  const currentId = currentTrack()?.id;
  const currentIndex = Math.max(0, list.findIndex((track) => track.id === currentId));
  const nextIndex = (currentIndex + offset + list.length) % list.length;
  return playTrack(list[nextIndex].id);
}

function removeTrack(id) {
  const session = sessionTracks.get(id);
  if (session) {
    if (session.objectUrl) URL.revokeObjectURL?.(session.objectUrl);
    sessionTracks.delete(id);
  } else {
    state.tracks = state.tracks.filter((track) => track.id !== id);
    if (state.currentId === id) state.currentId = '';
    persist();
  }
  const player = ensureAudio();
  if (player.dataset.trackId === id) {
    player.pause();
    player.removeAttribute('src');
    player.dataset.trackId = '';
    player.load();
  }
}

function addUrlTrack({ title, artist, url }) {
  const safeUrl = safePersistedAudioUrl(url);
  if (!safeUrl) throw new Error('请输入 http(s) 音频地址或 data:audio 地址');
  const track = {
    id: makeId('url'),
    title: text(title, '未命名音轨').slice(0, 120),
    artist: text(artist, '未知作者').slice(0, 100),
    url: safeUrl,
  };
  state.tracks = [...state.tracks, track].slice(-MAX_TRACKS);
  persist();
  return track;
}

function addLocalFiles(fileList) {
  const added = [];
  for (const file of [...(fileList || [])].slice(0, 20)) {
    if (!file?.type?.startsWith('audio/')) continue;
    const objectUrl = URL.createObjectURL(file);
    const track = {
      id: makeId('local'),
      title: text(file.name?.replace(/\.[^.]+$/, ''), '本地音频').slice(0, 120),
      artist: '本地文件',
      url: objectUrl,
      objectUrl,
      sessionOnly: true,
    };
    sessionTracks.set(track.id, track);
    added.push(track);
  }
  return added;
}

function playerMarkup(track) {
  const player = ensureAudio();
  const isCurrent = Boolean(track && player.dataset.trackId === track.id);
  const playing = isCurrent && !player.paused;
  const duration = isCurrent && Number.isFinite(player.duration) ? player.duration : 0;
  const currentTime = isCurrent ? player.currentTime : 0;
  return `
    <section class="wp-music-player ${track ? '' : 'is-empty'}">
      <div class="wp-music-cover"><span>${track ? '♫' : '♪'}</span></div>
      <div class="wp-music-now"><small>正在播放</small><b>${escapeHtml(track?.title || '还没有音乐')}</b><span>${escapeHtml(track?.artist || '从下方添加音频')}</span></div>
      <div class="wp-music-progress-row">
        <span data-music-current>${durationLabel(currentTime)}</span>
        <input data-music-progress type="range" min="0" max="${Math.max(1, duration || 1)}" step="0.1" value="${Math.min(currentTime, duration || 0)}" ${track ? '' : 'disabled'} aria-label="播放进度">
        <span data-music-duration>${durationLabel(duration)}</span>
      </div>
      <div class="wp-music-controls">
        <button type="button" data-music-prev aria-label="上一首" ${track ? '' : 'disabled'}>‹‹</button>
        <button type="button" class="wp-music-play" data-music-toggle aria-label="${playing ? '暂停' : '播放'}" ${track ? '' : 'disabled'}>${playing ? 'Ⅱ' : '▶'}</button>
        <button type="button" data-music-next aria-label="下一首" ${track ? '' : 'disabled'}>››</button>
      </div>
    </section>`;
}

function playlistMarkup() {
  const list = tracks();
  const currentId = currentTrack()?.id || '';
  if (!list.length) {
    return '<div class="wp-music-empty"><span>♫</span><b>本机还没有音乐</b><p>可以选择本地音频，或者添加一个你自己的音频链接。</p></div>';
  }
  return list.map((track, index) => `
    <div class="wp-music-track ${track.id === currentId ? 'is-current' : ''}" data-music-track-row="${escapeHtml(track.id)}">
      <button type="button" class="wp-music-track-main" data-music-track="${escapeHtml(track.id)}">
        <span>${track.id === currentId ? '♪' : index + 1}</span>
        <div><b>${escapeHtml(track.title)}</b><small>${escapeHtml(track.artist)}${track.sessionOnly ? ' · 本次会话' : ''}</small></div>
      </button>
      <button type="button" class="wp-music-remove" data-music-remove="${escapeHtml(track.id)}" aria-label="移除 ${escapeHtml(track.title)}">×</button>
    </div>`).join('');
}

function syncProgress(screen) {
  const root = screen?.querySelector('.wp-music-app');
  if (!root) return;
  const player = ensureAudio();
  const duration = Number.isFinite(player.duration) ? player.duration : 0;
  const current = Math.min(duration || 0, Math.max(0, player.currentTime || 0));
  const range = root.querySelector('[data-music-progress]');
  if (range && currentTrack()) {
    range.max = String(Math.max(1, duration || 1));
    if (!range.matches(':active')) range.value = String(current);
  }
  const currentNode = root.querySelector('[data-music-current]');
  const durationNode = root.querySelector('[data-music-duration]');
  if (currentNode) currentNode.textContent = durationLabel(current);
  if (durationNode) durationNode.textContent = durationLabel(duration);
}

export function renderMusicApp(screen, { goHome } = {}) {
  if (!screen) return;
  function paint() {
    if (!screen.isConnected) return;
    const chosen = currentTrack() || tracks()[0] || null;
    screen.innerHTML = `
      <section class="wp-view wp-native-app wp-music-app">
        <header class="wp-app-header"><button type="button" data-app-back aria-label="返回桌面">‹</button><div><b>音乐</b><small>本机播放器</small></div><span></span></header>
        <main class="wp-music-body" data-phone-refresh-surface>
          ${playerMarkup(chosen)}
          <section class="wp-music-library"><header><b>播放列表</b><span>${tracks().length} 首</span></header><div class="wp-music-list">${playlistMarkup()}</div></section>
          <details class="wp-music-add"><summary>＋ 添加音乐</summary>
            <div class="wp-music-add-body">
              <label class="wp-music-file"><span>选择本地音频</span><input type="file" accept="audio/*" multiple data-music-files></label>
              <small>本地文件只在本次打开酒馆期间有效，不会偷偷上传。</small>
              <div class="wp-music-or">或者添加自己的音频链接</div>
              <form data-music-url-form>
                <input name="title" maxlength="120" placeholder="歌曲名">
                <input name="artist" maxlength="100" placeholder="作者 / 艺术家">
                <input name="url" inputmode="url" required placeholder="https://…/audio.mp3">
                <button type="submit">加入歌单</button>
              </form>
              <p data-music-error role="status"></p>
            </div>
          </details>
        </main>
      </section>`;

    screen.querySelector('[data-app-back]')?.addEventListener('click', () => goHome?.());
    screen.querySelectorAll('[data-music-track]').forEach((button) => button.addEventListener('click', () => { void playTrack(button.dataset.musicTrack); }));
    screen.querySelectorAll('[data-music-remove]').forEach((button) => button.addEventListener('click', () => { removeTrack(button.dataset.musicRemove); paint(); }));
    screen.querySelector('[data-music-toggle]')?.addEventListener('click', () => {
      const player = ensureAudio();
      const chosenTrack = currentTrack() || chosen;
      if (!chosenTrack) return;
      if (player.dataset.trackId === chosenTrack.id && !player.paused) player.pause();
      else void playTrack(chosenTrack.id);
    });
    screen.querySelector('[data-music-prev]')?.addEventListener('click', () => { void playAdjacent(-1); });
    screen.querySelector('[data-music-next]')?.addEventListener('click', () => { void playAdjacent(1); });
    screen.querySelector('[data-music-progress]')?.addEventListener('input', (event) => {
      const player = ensureAudio();
      const next = Number(event.target.value);
      if (Number.isFinite(next) && Number.isFinite(player.duration)) player.currentTime = Math.max(0, Math.min(player.duration, next));
      syncProgress(screen);
    });
    screen.querySelector('[data-music-files]')?.addEventListener('change', (event) => {
      const added = addLocalFiles(event.target.files);
      if (added.length) paint();
    });
    screen.querySelector('[data-music-url-form]')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const error = screen.querySelector('[data-music-error]');
      try {
        const track = addUrlTrack({ title: form.elements.title?.value, artist: form.elements.artist?.value, url: form.elements.url?.value });
        form.reset();
        if (error) error.textContent = '';
        paint();
        void playTrack(track.id);
      } catch (cause) {
        if (error) error.textContent = String(cause?.message || cause);
      }
    });
    syncProgress(screen);
  }

  activePaint = paint;
  window.clearInterval(uiTimer);
  uiTimer = window.setInterval(() => {
    if (!screen.querySelector('.wp-music-app')) {
      window.clearInterval(uiTimer);
      uiTimer = 0;
      if (activePaint === paint) activePaint = null;
      return;
    }
    syncProgress(screen);
  }, 500);
  paint();
}

export { STORAGE_KEY as MUSIC_STORAGE_KEY };
