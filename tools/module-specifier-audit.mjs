import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '..');
const DEFAULT_BASELINE = path.join(HERE, 'fixtures/module-specifier-baseline.json');

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(target);
    return entry.isFile() && entry.name.endsWith('.js') ? [target] : [];
  });
}

function splitSpecifier(specifier) {
  const match = specifier.match(/^([^?#]+)([?#].*)?$/);
  return { pathname: match?.[1] || specifier, suffix: match?.[2] || '' };
}

export function auditModuleSpecifiers({ root = DEFAULT_ROOT, baseline = null } = {}) {
  const sourceRoot = path.join(root, 'prototype/js');
  const imports = new Map();
  const expression = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(["'])([^"']+)\1/g;
  for (const importer of walk(sourceRoot)) {
    const source = fs.readFileSync(importer, 'utf8');
    let match;
    while ((match = expression.exec(source))) {
      const specifier = match[2];
      if (!specifier.startsWith('.')) continue;
      const parts = splitSpecifier(specifier);
      const absoluteTarget = path.normalize(path.resolve(path.dirname(importer), parts.pathname));
      const target = path.relative(root, absoluteTarget).split(path.sep).join('/');
      if (!imports.has(target)) imports.set(target, new Map());
      const variants = imports.get(target);
      if (!variants.has(parts.suffix)) variants.set(parts.suffix, []);
      variants.get(parts.suffix).push(path.relative(root, importer).split(path.sep).join('/'));
    }
  }

  const allowed = baseline?.allowed || {};
  const mismatches = [];
  for (const [target, variants] of imports) {
    if (variants.size < 2) continue;
    const suffixes = [...variants.keys()].sort();
    const expected = Array.isArray(allowed[target]) ? [...allowed[target]].sort() : null;
    const acknowledged = !!expected && JSON.stringify(expected) === JSON.stringify(suffixes);
    mismatches.push({
      target,
      variants: suffixes.map(suffix => ({
        suffix,
        importers: [...new Set(variants.get(suffix))].sort(),
      })),
      acknowledged,
    });
  }
  mismatches.sort((a, b) => a.target.localeCompare(b.target));

  const staleBaseline = Object.keys(allowed).filter(target => !mismatches.some(item => item.target === target));
  const unexpected = mismatches.filter(item => !item.acknowledged);
  return {
    schema: 'earthus.module-specifier-audit.v1',
    scannedFileCount: walk(sourceRoot).length,
    mismatchCount: mismatches.length,
    acknowledgedMismatchCount: mismatches.length - unexpected.length,
    unexpectedMismatchCount: unexpected.length,
    staleBaseline,
    mismatches,
  };
}

export function loadModuleSpecifierBaseline(file = DEFAULT_BASELINE) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const strict = process.argv.includes('--strict');
  const report = auditModuleSpecifiers({
    root: DEFAULT_ROOT,
    baseline: strict ? null : loadModuleSpecifierBaseline(),
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.staleBaseline.length || report.unexpectedMismatchCount || (strict && report.mismatchCount)) {
    process.exitCode = 1;
  }
}
