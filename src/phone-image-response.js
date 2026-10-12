import { Decompress } from './vendor/fzstd.js';

const FRAME = 0xfd2fb528;
const invalid = () => new Error('站点返回的压缩响应不完整或无法解码。');
const tooLarge = () => new Error('站点返回的响应过大，请减小图片尺寸或稍后重试。');
function cancelled(signal) { if (signal?.aborted) throw new Error('已取消配图。'); }

// 酒馆代理可能保留浏览器的压缩协商，却丢失响应编码；按帧标识识别，普通 JSON 和图片不变。
export async function decodePhoneImageResponse(bytes, { maximum, signal } = {}) {
  if (bytes.length < 4) return bytes;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = view.getUint32(0, true);
  if (magic !== FRAME && (magic & 0xfffffff0) !== 0x184d2a50) return bytes;
  cancelled(signal);
  const windowLimit = Math.max(maximum, 8 * 1024 * 1024);
  let p = 0, frames = 0, blocks = 0, declaredTotal = 0;
  const need = length => { if (p + length > bytes.length) throw invalid(); };
  // 解码前检查所有帧的声明大小和窗口，避免给解码器分配异常的大块内存。
  while (p < bytes.length) {
    cancelled(signal); need(4);
    const type = view.getUint32(p, true); p += 4;
    if (++frames > 64) throw invalid();
    if ((type & 0xfffffff0) === 0x184d2a50) { need(4); const size = view.getUint32(p, true); p += 4; need(size); p += size; continue; }
    if (type !== FRAME) throw invalid();
    need(1); const descriptor = bytes[p++];
    if (descriptor & 8) throw invalid();
    const single = Boolean(descriptor & 32), checksum = Boolean(descriptor & 4);
    let window = 0;
    if (!single) { need(1); const wd = bytes[p++], base = 2 ** (10 + (wd >> 3)); window = base + base / 8 * (wd & 7); }
    const dictionaryBytes = [0, 1, 2, 4][descriptor & 3]; need(dictionaryBytes);
    for (let i = 0; i < dictionaryBytes; i++) if (bytes[p + i]) throw invalid();
    p += dictionaryBytes;
    const flag = descriptor >> 6, sizeBytes = flag ? 2 ** flag : single ? 1 : 0;
    need(sizeBytes); let size = 0;
    for (let i = 0; i < sizeBytes; i++) size += bytes[p++] * 2 ** (8 * i);
    if (flag === 1) size += 256;
    declaredTotal += size;
    if (single) window = size;
    if (window > windowLimit || declaredTotal > maximum) throw tooLarge();
    let last = false;
    do {
      need(3); const header = bytes[p] | bytes[p + 1] << 8 | bytes[p + 2] << 16; p += 3;
      last = Boolean(header & 1); const blockType = header >> 1 & 3, blockSize = header >> 3;
      if (++blocks > 4096 || blockType === 3 || blockSize > 131072) throw invalid();
      const stored = blockType === 1 ? 1 : blockSize; need(stored); p += stored;
    } while (!last);
    if (checksum) { need(4); p += 4; }
  }
  const chunks = []; let length = 0, complete = false;
  const decoder = new Decompress((chunk, final) => {
    length += chunk.length; if (length > maximum) throw tooLarge();
    if (chunk.length) chunks.push(chunk.slice()); complete = final;
  });
  try {
    for (let offset = 0; offset < bytes.length; offset += 16384) {
      cancelled(signal); decoder.push(bytes.subarray(offset, offset + 16384), offset + 16384 >= bytes.length);
      if (offset + 16384 < bytes.length) await new Promise(resolve => setTimeout(resolve, 0));
    }
  } catch (error) {
    if (signal?.aborted) throw new Error('已取消配图。');
    if (error.message === tooLarge().message) throw error;
    throw invalid();
  }
  cancelled(signal); if (!complete) throw invalid();
  const result = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}
