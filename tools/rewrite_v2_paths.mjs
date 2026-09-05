// Selected v2 modules move from prototype/v2-three/js to app/v2/js.
// Keep module-relative new URL('../data/...', import.meta.url) unchanged: only a
// direct fetch('../data/...') uses the document base and needs './data/...'.
// This lexical walk skips comments and regex bodies and visits template expressions.

const REGEX_PREFIX = new Set(['(', '[', '{', '=', ':', ',', ';', '!', '?', '&&', '||', '??', '=>',
  'return', 'throw', 'case', 'yield', 'await', 'else', 'do']);

export function inspectJavaScriptLiterals(source, visit) {
  const length = source.length;
  const code = (start, closing = null) => {
    let i = start;
    const previous = [];
    const push = token => { previous.push(token); if (previous.length > 5) previous.shift(); };
    while (i < length) {
      const c = source[i], next = source[i + 1];
      if (/\s/.test(c)) { i++; continue; }
      if (closing && c === closing) return i + 1;
      if (c === '/' && next === '/') {
        const end = source.indexOf('\n', i + 2); i = end < 0 ? length : end + 1; continue;
      }
      if (c === '/' && next === '*') {
        const end = source.indexOf('*/', i + 2); i = end < 0 ? length : end + 2; continue;
      }
      if (c === '/' && (!previous.length || REGEX_PREFIX.has(previous.at(-1)))) {
        i++; let inClass = false;
        while (i < length) {
          if (source[i] === '\\') { i += 2; continue; }
          if (source[i] === '[') inClass = true;
          else if (source[i] === ']') inClass = false;
          else if (source[i] === '/' && !inClass) { i++; break; }
          i++;
        }
        while (/[a-z]/i.test(source[i] || '') && i < length) i++;
        push('<regex>'); continue;
      }
      if (c === '"' || c === "'") {
        const start = i++;
        while (i < length && source[i] !== c) { i += source[i] === '\\' ? 2 : 1; }
        visit({ start, end: Math.min(i + 1, length), quote: c, value: source.slice(start + 1, i), previous: [...previous] });
        i++; push('<literal>'); continue;
      }
      if (c === '`') {
        const start = i++, context = [...previous];
        while (i < length) {
          if (source[i] === '\\') { i += 2; continue; }
          if (source[i] === '`') break;
          if (source[i] === '$' && source[i + 1] === '{') { i = code(i + 2, '}'); continue; }
          i++;
        }
        visit({ start, end: Math.min(i + 1, length), quote: c, value: source.slice(start + 1, i), previous: context });
        i++; push('<literal>'); continue;
      }
      if (c === '{') { i = code(i + 1, '}'); push('}'); continue; }
      if (/[A-Za-z_$]/.test(c)) {
        const start = i++;
        while (i < length && /[\w$]/.test(source[i])) i++;
        push(source.slice(start, i)); continue;
      }
      const pair = source.slice(i, i + 2);
      if (['=>', '&&', '||', '??'].includes(pair)) { push(pair); i += 2; }
      else { push(c); i++; }
    }
    return i;
  };
  code(0);
}

export function rewriteV2Paths(source) {
  const edits = [];
  inspectJavaScriptLiterals(source, literal => {
    const { value, previous } = literal;
    let from = null, to = null, rule = null;
    const engine = value.match(/^\.\.\/\.\.\/js\/earthus2\/([A-Za-z0-9_-]+)(?=\/|$)/);
    if (engine) {
      from = engine[0]; to = engine[1] === 'v02' ? '../engine' : `../engine-${engine[1]}`;
      rule = 'engine-module';
    } else if (value.startsWith('../../vendor/')) {
      from = '../../vendor/'; to = '../vendor/'; rule = 'vendor-module';
    } else if (value.startsWith('../../js/aetherus/')) {
      from = '../../js/aetherus/'; to = './aetherus/'; rule = 'aetherus-module';
    } else if (value.startsWith('../v2/assets/')) {
      from = '../v2/assets/'; to = './assets/'; rule = 'document-assets';
    } else if (value.startsWith('../data/') && previous.at(-1) === '(' && previous.at(-2) === 'fetch') {
      from = '../data/'; to = './data/'; rule = 'document-fetch';
    }
    if (from) edits.push({ start: literal.start + 1, end: literal.start + 1 + from.length, from, to, rule });
  });
  let code = source;
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    code = code.slice(0, edit.start) + edit.to + code.slice(edit.end);
  }
  return { code, rewrites: edits.map(({ from, to, rule }) => ({ from, to, rule })) };
}

export function relativeModuleSpecifiers(source) {
  const result = [];
  inspectJavaScriptLiterals(source, ({ value, quote, previous }) => {
    const module = previous.at(-1) === 'from' || previous.at(-1) === 'import'
      || (previous.at(-1) === '(' && previous.at(-2) === 'import');
    if (module && value.startsWith('.') && !(quote === '`' && value.includes('${'))) result.push(value);
  });
  return [...new Set(result)];
}
