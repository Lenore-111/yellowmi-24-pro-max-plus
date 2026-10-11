import { deflateRawSync } from 'node:zlib';

// 独立的压缩包测试编码器，包含流式数据描述符。
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
export function imageZip(entries, { compressed = true, descriptor = false, declaredSize } = {}) {
  const locals = [], directory = []; let offset = 0;
  for (const [name, value] of Object.entries(entries)) {
    const data = Buffer.from(value), filename = Buffer.from(name), packed = compressed ? deflateRawSync(data) : data;
    const checksum = crc32(data), size = declaredSize ?? data.length;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(descriptor ? 8 : 0, 6);
    local.writeUInt16LE(compressed ? 8 : 0, 8); local.writeUInt16LE(filename.length, 26);
    if (!descriptor) { local.writeUInt32LE(checksum, 14); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(size, 22); }
    const trailer = descriptor ? Buffer.alloc(16) : Buffer.alloc(0);
    if (descriptor) { trailer.writeUInt32LE(0x08074b50); trailer.writeUInt32LE(checksum, 4); trailer.writeUInt32LE(packed.length, 8); trailer.writeUInt32LE(size, 12); }
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(descriptor ? 8 : 0, 8); central.writeUInt16LE(compressed ? 8 : 0, 10);
    central.writeUInt32LE(checksum, 16); central.writeUInt32LE(packed.length, 20); central.writeUInt32LE(size, 24);
    central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, filename, packed, trailer); directory.push(central, filename);
    offset += local.length + filename.length + packed.length + trailer.length;
  }
  const central = Buffer.concat(directory), end = Buffer.alloc(22), count = Object.keys(entries).length;
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(count, 8); end.writeUInt16LE(count, 10);
  end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, central, end]);
}
