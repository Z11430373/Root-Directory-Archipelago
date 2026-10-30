import { Inflate, deflate } from '../../vendor/pako.esm.mjs';
import { canonical } from './canonical.js';
import { crcHex } from './crc32.js';
import { LIMITS, PREFIX } from './config.js';
import { CodeError, codeError, requireThat as need } from './errors.js';
import { parseSaveJSON } from './json.js';
import { pack, unpack } from './state.js';
import { checkShape } from './validate.js';
import { verifyChain } from './hash.js';

function base64url(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unbase64url(body) {
  need(body.length % 4 !== 1, '代碼無法解開：base64url 長度不符');
  const binary = atob(body.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - body.length % 4) % 4));
  const raw = Uint8Array.from(binary, c => c.charCodeAt(0));
  need(base64url(raw) === body, '代碼無法解開：base64url 尾端不合規則');
  return raw;
}

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
