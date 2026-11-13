/**
 * 存檔設定橋接層；依賴 ../data.js 中的 demo.yaml、integrity.yaml、import_rules.yaml。
 * 供 validate/codec/state/integrity/import 等模組讀取同一份限制與攜帶白名單。
 * 匯出的是來源物件參照，呼叫端應視為唯讀；變更規則須同步檢查 Python 參考與測資。
 */
import { DATA } from '../data.js';

export const demoConfig = DATA.yaml['demo/demo.yaml'];
export const integrityConfig = DATA.yaml['demo/integrity.yaml'];
export const importRules = DATA.yaml['demo/import_rules.yaml'];
export const LIMITS = integrityConfig.limits;
export const PREFIX = 'RA1-';
