/**
 * ============================================================================
 * 模組：quests.js — 世界/流程之間的快題判定層
 * 所屬系統：流程系統 (Engine / Flow System)
 * 模組關聯：
 *   - 無 import（純本地計算）
 *   - 被：engine/index.js（Engine.questCheck/finishQuest）、一致性測試
 * 職責：
 *   1. substituteManifest()：設定值/manifest → 已替換佔位符的字串。
 *   2. checkQuest()：check、原始指令、stdout、manifest、可選 VFS → boolean。
 * 設計原則：
 *   - 只讀指令/輸出/新檔案，不發獎勵、不寫 commit。
 *   - file_matches 只查 cwd 玩家新建檔，錯誤規則/路徑一律 false。
 *   - 不改資料、不需清理；Engine.finishQuest 負責套用完成副作用。
 * ============================================================================
 */
/** 由 checkQuest 呼叫；設定值/manifest → 已替換佔位符的字串，無外部副作用。 */
export function substituteManifest(value, manifest = {}) {
  return typeof value === 'string' ? value.replace(/\{manifest\.(\w+)\}/g, (_, key) => String(manifest[key])) : String(value);
}

/**
 * 由 Engine.questCheck/測試呼叫；check、原始指令、stdout、manifest、可選 VFS → boolean。
 * file_matches 只查 cwd 玩家新建檔，錯誤規則/路徑一律 false；不改資料、不需清理。
 */
export function checkQuest(check, raw, output, manifest = {}, vfs) {
  if (!check) return false;
  raw = String(raw ?? '');
  output = String(output ?? '');
  try {
    if (check.cmd_regex && !new RegExp(check.cmd_regex).test(raw)) return false;
    switch (check.type) {
      case 'ran_regex': return new RegExp(check.regex).test(raw);
      case 'output_contains': return output.includes(substituteManifest(check.text, manifest));
      case 'output_last_line_equals': {
        const lines = output.split('\n').filter(line => line.trim());
        return lines.length > 0 && lines[lines.length - 1].trim() === substituteManifest(check.value, manifest);
      }
      case 'output_line_contains_all': {
        const values = check.values.map(v => substituteManifest(v, manifest));
        return output.split('\n').some(line => values.every(value => line.includes(value)));
      }
      case 'file_matches': {
        if (!vfs) return false;
        const regex = new RegExp(check.all_lines_regex);
        const count = Number(substituteManifest(check.line_count, manifest));
        return vfs.list(vfs.cwd, { all: true }).some(name => {
          const path = vfs.resolve(name);
          if (name === 'access.log' || !vfs.isFile(path) || vfs.stat(path).original) return false;
          const text = vfs.readFile(path).replace(/\n+$/, '');
          const lines = text.split('\n');
          return text.length > 0 && lines.length === count && lines.every(line => regex.test(line));
        });
      }
      default: return false;
    }
  } catch {
    return false;
  }
}
