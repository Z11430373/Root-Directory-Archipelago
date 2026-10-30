export class CodeError extends Error {
  constructor(message, code = 'invalid_save') {
    super(message);
    this.name = 'CodeError';
    this.code = code;
  }
}

export function codeError(error, message = '存檔內容格式錯誤') {
  return error instanceof CodeError ? error : new CodeError(message);
}

export function requireThat(condition, message) {
  if (!condition) throw new CodeError(message);
}
