export function substituteManifest(value, manifest = {}) {
  return typeof value === 'string' ? value.replace(/\{manifest\.(\w+)\}/g, (_, key) => String(manifest[key])) : String(value);
}

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
