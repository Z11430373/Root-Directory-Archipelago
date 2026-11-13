/**
 * ============================================================================
 * 模組：save/codec.js — RA1 代碼編解碼邊界
 * 所屬系統：存檔系統 (Save Subsystem)
 * 模組關聯：
 *   - 依賴：vendor/pako（Inflate/deflate）、canonical.js（規範化）、crc32.js（crcHex）、config.js（LIMITS/PREFIX）、errors.js（CodeError/codeError/requireThat）、json.js（parseSaveJSON）、state.js（pack/unpack）、validate.js（checkShape）、hash.js（verifyChain）
 *   - 被：main.js、Engine 測試、互通檢查、import.js（匯入 JSON 檔）
 * 職責：
 *   1. base64url/unbase64url：RA1 代碼的 base64url 編碼/解碼，尾位核對防截斷。
 *   2. inflateBounded()：有界解壓（RFC 1950 zlib 單一串流），超限即中止。
 *   3. importCode()：代碼 → save 物件（CRC → base64url → 解壓 → 嚴格 JSON → unpack → 形狀檢查）。
 *   4. exportCode()：save → RA1 代碼（驗鏈 → pack → 壓縮 → base64url → CRC → 自檢）。
 * 設計原則：
 *   - 不碰 DOM、網路或本機儲存，純編解碼邊界。
 *   - 資料流：CRC → base64url → 有界 zlib → 嚴格 JSON → unpack/形狀；分級由 integrity.js 另做。
 *   - 只接受單一 RFC 1950 zlib 串流，拒絕 gzip/raw DEFLATE 與多餘資料。
 * ============================================================================
 */

import { Inflate, deflate } from '../../vendor/pako.esm.mjs';
import { canonical } from './canonical.js';
import { crcHex } from './crc32.js';
import { LIMITS, PREFIX } from './config.js';
import { CodeError, codeError, requireThat as need } from './errors.js';
import { parseSaveJSON } from './json.js';
import { pack, unpack } from './state.js';
import { checkShape } from './validate.js';
import { verifyChain } from './hash.js';

/**
 * 將位元組序列編碼為不補等號的 base64url 字串。
 * 由匯出及尾位核對呼叫，無副作用。
 *
 * @param {Uint8Array} bytes - 要編碼的位元組序列
 * @returns {string} 不補等號的 base64url 字串
 */
function base64url(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * 將 base64url 本體解碼為 Uint8Array，重編碼核對尾位，非法內容拋錯。
 * 由 importCode 呼叫。
 *
 * @param {string} body - base64url 本體字串
 * @returns {Uint8Array} 解碼後的位元組序列
 * @throws {CodeError} 當長度不符或尾端不合法時
 */
function unbase64url(body) {
  need(body.length % 4 !== 1, '代碼無法解開：base64url 長度不符');
  const binary = atob(body.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - body.length % 4) % 4));
  const raw = Uint8Array.from(binary, c => c.charCodeAt(0));
  need(base64url(raw) === body, '代碼無法解開：base64url 尾端不合規則');
  return raw;
}

/**
 * 有界解壓函式：將壓縮位元組解壓為明文位元組，超限即中止並拋 CodeError。
 * 由 importCode/安全測試呼叫，只接受單一 RFC1950 zlib 串流。
 *
 * @param {Uint8Array} raw - 壓縮位元組
 * @param {number} [limit=LIMITS.max_inflated_bytes] - 解壓後大小上限（bytes）
 * @returns {Uint8Array} 解壓後的位元組序列
 * @throws {CodeError} 當解壓參數、資料不合法、超限或截斷時
 */
export function inflateBounded(raw, limit = LIMITS.max_inflated_bytes) {
  try {
    need(raw instanceof Uint8Array && Number.isSafeInteger(limit) && limit >= 0 && limit <= LIMITS.max_inflated_bytes,
      '解壓參數不合規則');
    // windowBits:15 permits RFC 1950 zlib only, not gzip or raw DEFLATE.
    const inflater = new Inflate({ windowBits: 15, chunkSize: 4096 });
    const chunks = [];
    let size = 0;
    inflater.onData = chunk => {
      size += chunk.length;
      if (size > limit) {
        const error = new CodeError('代碼解開後過大（上限 ' + limit + ' bytes）', 'inflate_limit');
        error.inflatedBytes = size;
        throw error; // Interrupt pako immediately, before retaining the overflowing chunk.
      }
      chunks.push(chunk);
    };
    inflater.onEnd = status => { inflater.err = status; };
    // Single-byte compressed feeds make the first stream boundary observable.
    // This avoids pako's automatic concatenated-stream reset and rejects tails.
    for (let i = 0; i < raw.length; i++) {
      const ok = inflater.push(raw.subarray(i, i + 1), false);
      need(ok && !inflater.err, '代碼無法解開：壓縮資料不合法');
      if (inflater.ended) {
        need(i === raw.length - 1 && inflater.strm.avail_in === 0, '代碼含多餘的壓縮資料');
        break;
      }
    }
    need(inflater.ended && !inflater.err, '代碼不完整（壓縮資料被截斷）');
    const out = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; }
    return out;
  } catch (error) { throw codeError(error, '代碼無法解開：壓縮資料不合法'); }
}

/**
 * 將 RA1 代碼字串解碼為存檔物件。
 * 由 UI/互通測試呼叫，可含貼上空白（自動移除）。
 * 資料流：CRC → base64url → 解壓 → 嚴格 JSON → unpack → 形狀檢查。
 * 只驗安全形狀，完整性須另呼叫 level()。
 *
 * @param {string} input - RA1 代碼字串（可含貼上空白）
 * @returns {Promise<Object>} 解碼後的存檔物件
 * @throws {CodeError} 當代碼格式、CRC、解壓、JSON 或形狀不合規則時
 */
export async function importCode(input) {
  try {
    need(typeof input === 'string', '不是存檔代碼（應以 RA1- 開頭）');
    // Python str.split also treats U+001C..U+001F and U+0085 as whitespace.
    const code = input.replace(/[\s\x1c-\x1f\x85]/g, '');
    need(code.length <= LIMITS.max_code_chars, '代碼太長（上限 ' + LIMITS.max_code_chars + ' 字元）');
    const last = code.lastIndexOf('-');
    need(code.startsWith(PREFIX) && last >= PREFIX.length, '不是存檔代碼（應以 RA1- 開頭）');
    const body = code.slice(PREFIX.length, last);
    const crc = code.slice(last + 1);
    need(crc.toLowerCase() === crcHex(PREFIX + body), '代碼被截斷或貼錯（CRC 不符）');
    need(/^[A-Za-z0-9_-]+$/.test(body), '代碼含有不合法的字元');
    const raw = unbase64url(body);
    const bytes = inflateBounded(raw);
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    const save = await unpack(parseSaveJSON(text));
    checkShape(save);
    return save;
  } catch (error) { throw codeError(error, '代碼無法解開'); }
}

/**
 * 將存檔物件編碼為 RA1 代碼字串。
 * 由 UI/互通測試呼叫，驗鏈後壓縮並重新匯入自檢。
 * pack 會 seal 更新來源 head；壞鏈不替換 head，錯誤附 rawJSON 供使用者自行備份。
 *
 * @param {Object} save - 存檔物件
 * @returns {Promise<string>} RA1 代碼字串（PREFIX + body + '-' + CRC）
 * @throws {CodeError} 當雜湊鏈不符或自檢失敗時
 */
export async function exportCode(save) {
  checkShape(save);
  // Check hashes before seal() can replace a contradictory imported head.
  const [ok] = await verifyChain(save);
  if (!ok) {
    const error = new CodeError('存檔雜湊鏈不符，請改下載原始 JSON', 'export_self_check');
    error.rawJSON = canonical(save);
    throw error;
  }
  const body = base64url(deflate(new TextEncoder().encode(canonical(pack(save))), { level: 9 }));
  const code = PREFIX + body + '-' + crcHex(PREFIX + body);
  try {
    const restored = await importCode(code);
    need(restored.head === save.head && (await verifyChain(restored))[0], '匯出後自我檢查失敗');
  } catch (cause) {
    const error = new CodeError('匯出後自我檢查失敗，請改下載原始 JSON', 'export_self_check');
    error.rawJSON = canonical(save);
    throw error;
  }
  return code;
}