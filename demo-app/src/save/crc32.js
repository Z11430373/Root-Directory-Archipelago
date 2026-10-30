const TABLE = new Uint32Array(256);
for (let i = 0; i < TABLE.length; i++) {
  let c = i;
  for (let bit = 0; bit < 8; bit++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  TABLE[i] = c >>> 0;
}

export function crc32(text) {
  const bytes = typeof text === 'string' ? new TextEncoder().encode(text) : text;
  let crc = 0xffffffff;
  for (const byte of bytes) crc = TABLE[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export const crcHex = text => crc32(text).toString(16).padStart(8, '0');
