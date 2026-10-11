import { Unzip, UnzipInflate } from './vendor/fflate-unzip.js';

export const MAX_PHONE_IMAGE_BYTES = 20 * 1024 * 1024;

export function novelImageSize(value) {
  const size = String(value || '').trim();
  if (!size || size === 'auto') return { width: 1024, height: 1024 };
  const match = /^(\d{2,4})x(\d{2,4})$/.exec(size);
  const width = Number(match?.[1]), height = Number(match?.[2]);
  if (!match || width < 64 || height < 64 || width % 64 || height % 64 || width * height > 1024 * 1024)
    throw new Error('NovelAI 尺寸的宽高须为 64 的倍数，总像素不超过 1024x1024；留空默认 1024x1024。');
  return { width, height };
}

export function novelImageBody(settings, prompt) {
  const parameters = {
    params_version: 3, ...novelImageSize(settings.size), n_samples: 1,
    steps: 28, scale: 5, sampler: 'k_euler_ancestral', noise_schedule: 'karras',
    seed: Math.floor(Math.random() * 0x100000000), negative_prompt: '',
    ucPreset: 0, qualityToggle: false, sm: false, sm_dyn: false,
    dynamic_thresholding: false, legacy: false, legacy_v3_extend: false,
    deliberate_euler_ancestral_bug: false, prefer_brownian: true,
    add_original_image: false, uncond_scale: 1,
  };
  if (settings.model.startsWith('nai-diffusion-4')) {
    parameters.v4_prompt = { caption: { base_caption: prompt, char_captions: [] }, use_coords: false, use_order: true };
    parameters.v4_negative_prompt = { caption: { base_caption: '', char_captions: [] } };
  }
  return { input: prompt, model: settings.model, action: 'generate', parameters };
}

function cancelled(signal) { if (signal?.aborted) throw new Error('已取消配图。'); }

// 仅读取首张图片，不解包到文件系统，也不依赖新版浏览器的解压接口。
export async function readNovelImageZip(bytes, { signal } = {}) {
  cancelled(signal);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === bytes.length) { end = i; break; }
  }
  if (end < 0 || view.getUint16(end + 4, true) || view.getUint16(end + 6, true)
    || view.getUint16(end + 10, true) > 100 || view.getUint32(end + 16, true) + view.getUint32(end + 12, true) !== end)
    throw new Error('站点返回的图片压缩包无效或不受支持。');
  let selected = false, complete = false, size = 0, count = 0, failure;
  const chunks = [];
  const unzip = new Unzip(file => {
    if (++count > 100) throw new Error('图片压缩包中的文件过多。');
    if (selected || !/\.(?:png|jpe?g|webp)$/i.test(file.name)) return;
    selected = true;
    if (file.originalSize > MAX_PHONE_IMAGE_BYTES) throw new Error('站点返回的图片过大，单张最多 20 MB。');
    file.ondata = (error, chunk, final) => {
      if (error) { failure = error; return; }
      size += chunk.length;
      if (size > MAX_PHONE_IMAGE_BYTES) throw new Error('站点返回的图片过大，单张最多 20 MB。');
      chunks.push(chunk); complete = final;
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  try {
    // 使用小块输入，限制异常压缩包解码时的临时内存占用。
    for (let offset = 0; offset < bytes.length; offset += 1024) {
      cancelled(signal);
      unzip.push(bytes.subarray(offset, offset + 1024), offset + 1024 >= bytes.length);
      if (failure) throw failure;
      if (offset % 32768 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
  } catch (error) {
    if (/20 MB|取消|文件过多/.test(error.message)) throw error;
    throw new Error('站点返回的图片压缩包无法解码。');
  }
  cancelled(signal);
  if (!selected || !complete || !size) throw new Error('站点返回的压缩包里没有可用图片。');
  const image = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { image.set(chunk, offset); offset += chunk.length; }
  return image;
}
