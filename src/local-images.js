// Device-local image files are deliberately kept out of chat/world metadata.
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/bmp']);
export function validateImageFile(file) {
  if (!file || !IMAGE_TYPES.has(file.type)) throw new Error('请选择可显示的图片：普通照片、截图或动图。暂不支持矢量图和高效图片格式，请先转为普通照片。');
  if (!file.size || file.size > MAX_IMAGE_BYTES) throw new Error('单张图片需大于零且不超过 20 兆字节。');
}
let database;
function openDatabase() {
  if (!globalThis.indexedDB) return Promise.reject(new Error('当前环境无法保存本机图片，请检查浏览器存储权限。'));
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open('world_phone_local_images_v1', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('images', { keyPath: 'id' });
      request.result.createObjectStore('settings');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = null; reject(new Error('无法打开图片存储。')); };
    request.onblocked = () => { database = null; reject(new Error('图片存储被其他页面占用，请关闭旧页面后重试。')); };
  });
  return database;
}
async function transaction(storeNames, mode, run) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    let result;
    try { result = run(tx); } catch (error) { tx.abort(); reject(error); return; }
    tx.oncomplete = () => resolve(typeof result === 'function' ? result() : result);
    tx.onerror = tx.onabort = () => reject(new Error('图片保存失败，可能是存储空间不足。请清理空间后重试。'));
  });
}
export async function readLocalImages() {
  return transaction(['images', 'settings'], 'readonly', tx => {
    const images = tx.objectStore('images').getAll();
    const wallpaper = tx.objectStore('settings').get('wallpaper');
    return () => ({ images: images.result.sort((a, b) => b.createdAt - a.createdAt), wallpaper: wallpaper.result || {} });
  });
}
export async function importLocalImage(file) {
  validateImageFile(file);
  const url = URL.createObjectURL(file);
  try {
    await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => image.naturalWidth && image.naturalHeight ? resolve() : reject(new Error('图片内容无法读取。'));
      image.onerror = () => reject(new Error('图片损坏或当前浏览器不支持此格式。'));
      image.src = url;
    });
  } finally { URL.revokeObjectURL(url); }
  const item = { id: `local:${crypto.randomUUID()}`, title: file.name.slice(0, 180), blob: file, createdAt: Date.now() };
  await transaction(['images'], 'readwrite', tx => tx.objectStore('images').put(item));
  return item;
}
export async function setLocalWallpaper(id, target) {
  if (!['home', 'lock', 'both'].includes(target)) throw new Error('无效的壁纸位置。');
  await transaction(['images', 'settings'], 'readwrite', tx => {
    const images = tx.objectStore('images');
    const settings = tx.objectStore('settings');
    const found = images.get(id);
    found.onsuccess = () => {
      if (!found.result) { tx.abort(); return; }
      const request = settings.get('wallpaper');
      request.onsuccess = () => {
        const value = request.result || {};
        if (target === 'home' || target === 'both') value.home = id;
        if (target === 'lock' || target === 'both') value.lock = id;
        settings.put(value, 'wallpaper');
      };
    };
  });
}
export async function deleteLocalImage(id) {
  await transaction(['images', 'settings'], 'readwrite', tx => {
    tx.objectStore('images').delete(id);
    const settings = tx.objectStore('settings');
    const request = settings.get('wallpaper');
    request.onsuccess = () => {
      const value = request.result || {};
      for (const key of ['home', 'lock']) if (value[key] === id) delete value[key];
      settings.put(value, 'wallpaper');
    };
  });
}
export async function resetLocalWallpaper() {
  await transaction(['settings'], 'readwrite', tx => tx.objectStore('settings').delete('wallpaper'));
}
