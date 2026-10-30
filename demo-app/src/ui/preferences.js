const choices={style:['islands','server'],theme:['dark','contrast'],font:['small','medium','large']};

// Preferences are untrusted local JSON, independent from the portable game save.
export function sanitizePreferences(value) {
  const clean={};
  if(!value||typeof value!=='object'||Array.isArray(value))return clean;
  for(const [key,allowed] of Object.entries(choices)) {
    if(Object.hasOwn(value,key)&&allowed.includes(value[key]))clean[key]=value[key];
  }
  return clean;
}
export function resolvePreferences(value,{prefersLight=false,hostMode=false}={}) {
  const prefs=sanitizePreferences(value);
  return {style:prefs.style||'islands',theme:prefs.theme||(prefersLight?'contrast':'dark'),font:prefs.font||(hostMode?'large':'medium')};
}
export const styleDescription=style=>style==='server'
  ?'Server 終端：等寬文字、低彩度、無卡片裝飾。這仍是瀏覽器模擬，不是真實 Ubuntu 系統。'
  :'群島介面：保留目前的面板與卡片風格。切換外觀不會改變進度、指令或存檔。';
