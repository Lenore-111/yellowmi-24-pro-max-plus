import { phoneImagePath } from './phone-image-paths.js';
import { MAX_PHONE_IMAGE_BYTES, novelImageSize, novelImageBody, readNovelImageZip } from './phone-image-novelai.js';

const SETTINGS_KEY = 'world_phone_images_v1';
const DEVICE_KEY = 'world-phone-image-key:';
const sessionKeys = new Map();
const MAX_IMAGE_BYTES = MAX_PHONE_IMAGE_BYTES;
const uuid = () => crypto.randomUUID();
function context() { return globalThis.SillyTavern?.getContext?.(); }

export function imageApiBase(value, provider = 'openai') {
  let url;
  try { url = new URL(String(value || '').trim()); } catch { throw new Error('请填写完整的生图接口地址，例如 https://你的站点/v1。'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
    throw new Error('接口地址只支持 HTTP/HTTPS，密钥请填在密钥栏。');
  if (/\/(?:signup|login|register)(?:\/|$)/i.test(url.pathname))
    throw new Error('这里需要站点的生图接口地址，不能填写登录或注册页面。');
  const endpoint = provider === 'novelai' ? /\/ai\/generate-image\/?$/ : /\/(?:images\/generations|models)\/?$/;
  url.pathname = url.pathname.replace(endpoint, '').replace(/\/+$/, '') || (provider === 'novelai' ? '/' : '/v1');
  return url.toString().replace(/\/$/, '');
}
export function readPhoneImageSettings() {
  const raw = context()?.extensionSettings?.[SETTINGS_KEY] || {};
  return { provider: raw.provider === 'novelai' ? 'novelai' : 'openai', baseUrl: String(raw.baseUrl || ''), model: String(raw.model || ''), size: String(raw.size || ''),
    style: String(raw.style || ''), transport: raw.transport === 'proxy' ? 'proxy' : 'direct',
    credentialId: String(raw.credentialId || ''), rememberKey: Boolean(raw.rememberKey) };
}
function credential(settings) {
  if (!settings.credentialId) return '';
  if (sessionKeys.has(settings.credentialId)) return sessionKeys.get(settings.credentialId);
  if (settings.rememberKey) {
    try { return globalThis.localStorage?.getItem(DEVICE_KEY + settings.credentialId) || ''; } catch {}
  }
  return '';
}
export function hasPhoneImageKey() { return Boolean(credential(readPhoneImageSettings())); }
export function savePhoneImageSettings(values) {
  const ctx = context();
  if (!ctx?.extensionSettings || typeof ctx.saveSettingsDebounced !== 'function') throw new Error('当前酒馆无法保存生图设置。');
  const previous = readPhoneImageSettings();
  const provider = values.provider === 'novelai' ? 'novelai' : 'openai';
  const baseUrl = imageApiBase(values.baseUrl, provider);
  const model = String(values.model || '').trim().slice(0, 200);
  const size = String(values.size || '').trim();
  if (size && size !== 'auto' && !/^\d{2,4}x\d{2,4}$/.test(size)) throw new Error('尺寸请填 auto 或宽x高，例如 1024x1024；留空使用站点默认值。');
  if (provider === 'novelai') novelImageSize(size);
  // Changing the destination never carries an old provider's credential along.
  const key = String(values.apiKey || '').trim() || (baseUrl === previous.baseUrl ? credential(previous) : '');
  if (/[\r\n]/.test(key)) throw new Error('密钥不能包含换行。');
  const credentialId = previous.credentialId || uuid();
  const next = { provider, baseUrl, model, size, style: String(values.style || '').trim().slice(0, 300),
    transport: values.transport === 'proxy' ? 'proxy' : 'direct', credentialId, rememberKey: Boolean(values.rememberKey) };
  if (next.rememberKey && key) {
    try { globalThis.localStorage.setItem(DEVICE_KEY + credentialId, key); }
    catch { throw new Error('浏览器未能记住密钥，请取消“在此设备记住密钥”后保存。'); }
  } else globalThis.localStorage?.removeItem(DEVICE_KEY + credentialId);
  if (key) sessionKeys.set(credentialId, key); else sessionKeys.delete(credentialId);
  ctx.extensionSettings[SETTINGS_KEY] = next;
  ctx.saveSettingsDebounced();
  return { ...next };
}
export function forgetPhoneImageKey() {
  const settings = readPhoneImageSettings();
  sessionKeys.delete(settings.credentialId);
  globalThis.localStorage?.removeItem(DEVICE_KEY + settings.credentialId);
}
async function boundedBody(response, maximum) {
  if (Number(response.headers.get('content-length')) > maximum) throw new Error('站点返回的图片过大，单张最多 20 MB。');
  const reader = response.body?.getReader();
  if (!reader) {
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > maximum) throw new Error('站点返回的图片过大，单张最多 20 MB。');
    return new Uint8Array(buffer);
  }
  let size = 0; const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) throw new Error('站点返回的图片过大，单张最多 20 MB。');
      chunks.push(value);
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
async function request(url, { settings, key = '', body, signal, timeout = 30000 }) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, timeout);
  try {
    const proxy = settings.transport === 'proxy';
    const headers = proxy ? { ...context()?.getRequestHeaders?.() } : {};
    if (body) headers['Content-Type'] = 'application/json';
    if (body && settings.provider === 'novelai') headers.Accept = 'application/zip';
    if (key || proxy) headers.Authorization = key ? 'Bearer ' + key : '';
    // Encode the full destination so signed image query strings reach the proxy.
    const response = await fetch(proxy ? '/proxy/' + encodeURIComponent(url) : url, {
      method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined,
      credentials: proxy ? 'same-origin' : 'omit', redirect: 'error', signal: controller.signal,
    });
    if (!response.ok) {
      if (response.status === 404) {
        const detail = proxy ? await boundedBody(response, 8192).then(bytes => new TextDecoder().decode(bytes)).catch(() => '') : '';
        if (proxy && /CORS proxy is disabled/i.test(detail)) throw new Error('酒馆代理尚未开启，请在 config.yaml 设置 enableCorsProxy: true 并重启酒馆，或改用浏览器直连。');
        throw new Error('接口返回 404：请检查接口类型和站点提供的 API 地址，不要填写登录或注册页面。');
      }
      if ([401, 403].includes(response.status)) throw new Error('站点拒绝访问，请检查生图密钥及模型权限。');
      throw new Error(`生图站点请求失败（HTTP ${response.status}），请检查接口和模型，稍后重试。`);
    }
    // Keep the timeout and abort listener alive while reading large responses.
    return await boundedBody(response, body ? MAX_IMAGE_BYTES * 1.4 : MAX_IMAGE_BYTES);
  } catch (error) {
    if (controller.signal.aborted) throw new Error(signal?.aborted ? '已取消配图。' : '生图站点响应超时，请稍后重试。');
    if (error instanceof TypeError) throw new Error('无法连接生图站点。浏览器直连需要站点允许跨域（CORS）；也可选择酒馆代理。');
    throw error;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
function json(bytes, provider = 'openai') {
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new Error(provider === 'novelai' ? '站点未返回有效图片压缩包或图片 JSON，请确认它支持 NovelAI 生图接口。' : '站点未返回有效 JSON，请使用 OpenAI 兼容接口。'); }
}
function configured() {
  const settings = readPhoneImageSettings();
  return { ...settings, baseUrl: imageApiBase(settings.baseUrl, settings.provider) };
}
export async function listPhoneImageModels({ signal } = {}) {
  const settings = configured();
  if (settings.provider === 'novelai') throw new Error('NovelAI 接口不使用通用模型列表，请按站点说明直接填写生图模型名称。');
  const data = json(await request(settings.baseUrl + '/models', { settings, key: credential(settings), signal }));
  const models = [...new Set((Array.isArray(data.data) ? data.data : []).map(x => String(x?.id || '').trim()).filter(Boolean))].slice(0, 500);
  if (!models.length) throw new Error('站点未提供模型列表，请直接填写它的生图模型名称。');
  return models;
}
function imageBlob(bytes) {
  let type = '';
  if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) type = 'image/png';
  else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) type = 'image/jpeg';
  else if (new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP') type = 'image/webp';
  if (!type || !bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error('站点未返回可用的 PNG、JPEG 或 WebP 图片。');
  return new Blob([bytes], { type });
}
export async function generatePhoneImage(prompt, { signal } = {}) {
  const settings = configured();
  if (!settings.model) throw new Error('请先在生图设置中选择或填写模型。');
  const text = String(prompt || '').trim().slice(0, 6000);
  if (!text) throw new Error('先写一点你想画的内容。');
  let bytes;
  if (settings.provider === 'novelai') {
    const result = await request(settings.baseUrl + '/ai/generate-image', { settings, key: credential(settings), body: novelImageBody(settings, text), signal, timeout: 180000 });
    if (result[0] === 80 && result[1] === 75) bytes = await readNovelImageZip(result, { signal });
    else bytes = base64Image(json(result, 'novelai')?.images?.[0]?.image);
  } else bytes = await generateCompatibleImage(settings, text, signal);
  if (signal?.aborted) throw new Error('已取消配图。');
  const blob = imageBlob(bytes);
  if (typeof createImageBitmap === 'function') {
    let bitmap; try { bitmap = await createImageBitmap(blob); } catch { throw new Error('站点返回的图片无法打开。'); }
    bitmap.close();
  }
  return blob;
}
function base64Image(value) {
  if (typeof value !== 'string' || !value) throw new Error('站点没有返回可用图片，请确认所选模型和接口类型。');
  if (value.length > MAX_IMAGE_BYTES * 1.4) throw new Error('站点返回的图片过大，单张最多 20 MB。');
  try { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }
  catch { throw new Error('站点返回的图片编码无效。'); }
}
async function generateCompatibleImage(settings, text, signal) {
  const body = { model: settings.model, prompt: text, n: 1 };
  if (settings.size) body.size = settings.size;
  // Do not force response_format: some image APIs always return base64.
  const data = json(await request(settings.baseUrl + '/images/generations', { settings, key: credential(settings), body, signal, timeout: 180000 }));
  const item = data?.data?.[0]; let bytes;
  if (typeof item?.b64_json === 'string') {
    bytes = base64Image(item.b64_json);
  } else if (typeof item?.url === 'string') {
    let url; try { url = new URL(item.url); } catch { throw new Error('站点返回的图片地址无效。'); }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('站点返回的图片地址无效。');
    // Downloads never receive the user's API credential.
    bytes = await request(url.toString(), { settings, signal, timeout: 60000 });
  } else throw new Error('站点没有返回图片，请确认所选模型支持 images/generations 生图。');
  return bytes;
}
export async function savePhoneImageAsset(blob, { signal } = {}) {
  if (signal?.aborted) throw new Error('已取消配图。');
  const ctx = context();
  if (typeof ctx?.getRequestHeaders !== 'function') throw new Error('当前酒馆无法保存图片。');
  const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[blob.type];
  if (!extension || blob.size > MAX_IMAGE_BYTES) throw new Error('图片格式或大小不受支持。');
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = () => reject(new Error('无法读取图片。')); reader.readAsDataURL(blob);
  });
  const response = await fetch('/api/files/upload', { method: 'POST', headers: ctx.getRequestHeaders(),
    body: JSON.stringify({ name: 'world-phone-image-' + uuid() + '.' + extension, data }) });
  if (!response.ok) throw new Error('酒馆未能保存图片，请检查连接或磁盘空间。');
  const path = phoneImagePath((await response.json()).path);
  if (!path) throw new Error('酒馆返回的图片地址无效。');
  return path;
}
export async function removePhoneImageAsset(path) {
  if (!phoneImagePath(path)) return;
  try { await fetch('/api/files/delete', { method: 'POST', headers: context().getRequestHeaders(), body: JSON.stringify({ path: path.replace(/^\//, '') }) }); } catch {}
}
