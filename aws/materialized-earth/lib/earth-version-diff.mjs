import { createHash } from 'node:crypto';

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha(value) { return createHash('sha256').update(stable(value)).digest('hex'); }

export function buildEarthVersion({ parentVersion = null, artifacts = {}, createdAt = null } = {}) {
  const leaves = Object.freeze(Object.fromEntries(Object.entries(artifacts).sort(([a], [b]) => a.localeCompare(b))));
  const rootManifestHash = `sha256:${sha(leaves)}`;
  return Object.freeze({
    earthVersion: `ev_${sha({ parentVersion, rootManifestHash }).slice(0, 24)}`,
    parentVersion,
    createdAt,
    rootManifestHash,
    artifacts: leaves,
  });
}

export function diffEarthVersions(before, after) {
  if (!before || !after) throw new Error('EARTH_VERSION_PAIR_REQUIRED');
  if (before.rootManifestHash === after.rootManifestHash) {
    return Object.freeze({ fromVersion: before.earthVersion, toVersion: after.earthVersion, changes: Object.freeze([]), visitedLeaves: 0 });
  }
  const changes = [];
  for (const key of new Set([...Object.keys(before.artifacts), ...Object.keys(after.artifacts)])) {
    const from = before.artifacts[key] ?? null;
    const to = after.artifacts[key] ?? null;
    if (from !== to) changes.push(Object.freeze({ key, from, to }));
  }
  changes.sort((a, b) => a.key.localeCompare(b.key));
  return Object.freeze({
    fromVersion: before.earthVersion,
    toVersion: after.earthVersion,
    changes: Object.freeze(changes),
    visitedLeaves: changes.length,
  });
}
