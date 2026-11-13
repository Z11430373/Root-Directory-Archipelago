/**
 * ============================================================================
 * 模組：save/crc32.js — 存檔代碼 CRC32 校驗層
 * 所屬系統：存檔系統 (Save Subsystem)
 * 模組關聯：被 codec.js 使用，用於驗證貼上的 RA1 代碼是否截斷或錯誤；無任何檔案依賴（純本地計算）。
 * 職責：
 *   1. 載入時預計算 256 入 CRC32 查表（TABLE）。
 *   2. crc32() 計算 UTF-8 字串或位元組序列的無符號 CRC32 值。
 *   3. crcHex() 回傳補零的八碼小寫十六進位校驗值，用於代碼尾端驗證。
 * 設計原則：
 *   - 不是簽章或防偽機制，僅用於偵測代碼貼錯或截斷。
 *   - 後續函式不改動輸入，純計算，無外部副作用。
 * ============================================================================
 */

/**
 * CRC32 查表，模組載入時計算一次。
 * 每個位元組值 (0-255) 對應一個 32-bit CRC 結果，後續計算直接查表而非逐位計算。
 * @type {Uint32Array}
 */
const TABLE = new Uint32Array(256);

/**
 * 建立 CRC32 查表（多項式 0xEDB88320，反向 CRC32 標準）。
 * 對每個位元組值 i，經過 8 次位移與 XOR 得到對應的表項，再取無符號 32-bit 結果。
 */
for (let i = 0; i < TABLE.length; i++) {
  let c = i;
  for (let bit = 0; bit < 8; bit++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  TABLE[i] = c >>> 0;
}

/**
 * 計算 UTF-8 字串或位元組序列的無符號 CRC32 值。
 * 由 codec 與互通測試呼叫，用於驗證代碼完整性。
 *
 * @param {string|Uint8Array} text - 輸入字串（會以 UTF-8 編碼）或位元組序列
 * @returns {number} 無符號 32-bit CRC32 值，無外部副作用，不改動輸入
 */
export function crc32(text) {
  const bytes = typeof text === 'string' ? new TextEncoder().encode(text) : text;
  let crc = 0xffffffff;
  for (const byte of bytes) crc = TABLE[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * 回傳輸入的 CRC32 校驗值，格式為補零的八碼小寫十六進位字串。
 * 由 codec 呼叫，用於代碼尾端的 CRC 驗證（RA1-代碼-CRC 格式）。
 *
 * @param {string|Uint8Array} text - 輸入字串或位元組序列
 * @returns {string} 八碼小寫十六進位校驗值（如 'a1b2c3d4'）
 */
export const crcHex = text => crc32(text).toString(16).padStart(8, '0');
