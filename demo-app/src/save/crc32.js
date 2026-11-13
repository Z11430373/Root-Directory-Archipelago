/**
 * 存檔代碼的 CRC32 校驗層，無檔案依賴；codec.js 用來檢查貼錯或截斷。
 * 模組載入時計算一次查表；不是簽章或防偽機制，後續函式不改動輸入。
 */
const TABLE = new Uint32Array(256);
for (let i = 0; i < TABLE.length; i++) {
  let c = i;
  for (let bit = 0; bit < 8; bit++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  TABLE[i] = c >>> 0;
}

/** 由 codec 與互通測試呼叫；UTF-8 字串或位元組序列 → unsigned CRC32，無外部副作用。 */
export function crc32(text) {
  const bytes = typeof text === 'string' ? new TextEncoder().encode(text) : text;
  let crc = 0xffffffff;
  for (const byte of bytes) crc = TABLE[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** 由 codec 呼叫；沿用 crc32 的輸入，回傳補零的八碼小寫十六進位校驗值。 */
export const crcHex = text => crc32(text).toString(16).padStart(8, '0');
