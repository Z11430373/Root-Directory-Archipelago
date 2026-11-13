/**
 * 存檔系統的公開入口：供 engine/index.js、main.js 與測試共用，避免外部依賴內部拆檔。
 * 依賴下列同目錄模組；資料規則由 config.js 連到建置產生的 ../data.js。
 * 資料流：事件 → state/hash → fold/score；代碼匯入另經 codec/json/validate。
 * 本檔只轉匯出；可變參數與清理責任見各函式，勿把完整性分級當成防作弊驗證。
 */
export { CodeError } from './errors.js';
export { canonical } from './canonical.js';
export { crc32 } from './crc32.js';
export { commitId, verifyChain } from './hash.js';
export { newSave, addCommit, seal, pack, unpack } from './state.js';
export { checkShape } from './validate.js';
export { importCode, exportCode, inflateBounded } from './codec.js';
export { importFile, toFullgame } from './import.js';
export { plausibility, level } from './integrity.js';
export { fold } from './fold.js';
export { score } from './score.js';
export { card, fmtTime } from './card.js';
