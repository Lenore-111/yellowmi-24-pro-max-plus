import test from 'node:test';
import assert from 'node:assert/strict';
import { decodePhoneImageResponse } from '../src/phone-image-response.js';

function rawFrame(data) {
  const frame = new Uint8Array(12 + data.length), view = new DataView(frame.buffer);
  view.setUint32(0, 0xfd2fb528, true); frame[4] = 0xa0; view.setUint32(5, data.length, true);
  const block = data.length * 8 + 1; frame[9] = block & 255; frame[10] = block >> 8 & 255; frame[11] = block >> 16;
  frame.set(data, 12); return frame;
}

test('普通 JSON、PNG 和 ZIP 响应不重复解压；压缩帧可连续读取', async () => {
  const json = new TextEncoder().encode('{"data":[{"id":"模型"}]}');
  for (const bytes of [json, Uint8Array.of(137,80,78,71), Uint8Array.of(80,75,3,4)])
    assert.equal(await decodePhoneImageResponse(bytes, { maximum: 1000 }), bytes);
  const frame = rawFrame(json);
  assert.deepEqual(await decodePhoneImageResponse(frame, { maximum: 1000 }), json);
  const second = rawFrame(Uint8Array.of(10));
  const joined = new Uint8Array(frame.length + second.length); joined.set(frame); joined.set(second, frame.length);
  assert.deepEqual(await decodePhoneImageResponse(joined, { maximum: 1000 }), new Uint8Array([...json,10]));
});

test('压缩响应的截断、过大声明、窗口和实际解码输出均受限制', async () => {
  const frame = rawFrame(new TextEncoder().encode('test'));
  await assert.rejects(decodePhoneImageResponse(frame.subarray(0,frame.length-1), { maximum: 100 }), /不完整/);
  const oversized = frame.slice(); new DataView(oversized.buffer).setUint32(5, 1000000000, true);
  await assert.rejects(decodePhoneImageResponse(oversized, { maximum: 100 }), /过大/);
  const window = Uint8Array.of(0x28,0xb5,0x2f,0xfd,0,0xff,1,0,0);
  await assert.rejects(decodePhoneImageResponse(window, { maximum: 100 }), /过大/);
  // 未声明总大小的 RLE 帧，输出限制不能仅依赖帧头。
  const rle = Uint8Array.of(0x28,0xb5,0x2f,0xfd,0,0x38,0x03,0x04,0,65);
  await assert.rejects(decodePhoneImageResponse(rle, { maximum: 100 }), /过大/);
});

test('大压缩响应处理过程中可取消，不返回迟到的已解码内容', async () => {
  const controller = new AbortController();
  const promise = decodePhoneImageResponse(rawFrame(new Uint8Array(65536).fill(65)), { maximum: 100000, signal: controller.signal });
  controller.abort(); await assert.rejects(promise, /取消/);
});
