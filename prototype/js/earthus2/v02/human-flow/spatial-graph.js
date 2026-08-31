export class SpatialGraph {
  #nodes = new Map();
  #edges = new Map();

  addNode(node) {
    if (!node?.id || !node?.type) throw new TypeError('node id and type are required');
    if (this.#nodes.has(node.id)) throw new Error(`node already exists: ${node.id}`);
    this.#nodes.set(node.id, Object.freeze(structuredClone(node)));
  }

  addEdge(edge) {
    if (!edge?.id || !edge?.from || !edge?.to || !edge?.mode) throw new TypeError('edge id/from/to/mode are required');
    if (!this.#nodes.has(edge.from) || !this.#nodes.has(edge.to)) throw new Error('edge endpoints must exist');
    if (this.#edges.has(edge.id)) throw new Error(`edge already exists: ${edge.id}`);
    this.#edges.set(edge.id, Object.freeze({ status: 'OPEN', directionality: 'BIDIRECTIONAL', ...structuredClone(edge) }));
  }

  node(id) { return this.#nodes.get(id) ?? null; }
  edge(id) { return this.#edges.get(id) ?? null; }
  listNodes() { return Object.freeze([...this.#nodes.values()]); }
  listEdges() { return Object.freeze([...this.#edges.values()]); }

  neighbors(nodeId, { modes = null, includeClosed = false } = {}) {
    const allowed = modes ? new Set(modes) : null;
    const result = [];
    for (const edge of this.#edges.values()) {
      if (!includeClosed && edge.status !== 'OPEN') continue;
      if (allowed && !allowed.has(edge.mode)) continue;
      if (edge.from === nodeId) result.push({ edge, node: this.#nodes.get(edge.to) });
      if (edge.to === nodeId && edge.directionality !== 'ONE_WAY') result.push({ edge, node: this.#nodes.get(edge.from) });
    }
    return Object.freeze(result);
  }

  shortestPath(from, to, { modes = null, cost = defaultEdgeCost } = {}) {
    if (!this.#nodes.has(from) || !this.#nodes.has(to)) return Object.freeze({ found: false, reason: 'UNKNOWN_NODE' });
    const distances = new Map([[from, 0]]);
    const previous = new Map();
    const queue = new Set(this.#nodes.keys());
    while (queue.size) {
      let current = null;
      let best = Infinity;
      for (const id of queue) {
        const distance = distances.get(id) ?? Infinity;
        if (distance < best) { best = distance; current = id; }
      }
      if (current === null || best === Infinity) break;
      queue.delete(current);
      if (current === to) break;
      for (const { edge, node } of this.neighbors(current, { modes })) {
        if (!node || !queue.has(node.id)) continue;
        const candidate = best + cost(edge);
        if (candidate < (distances.get(node.id) ?? Infinity)) {
          distances.set(node.id, candidate);
          previous.set(node.id, { nodeId: current, edgeId: edge.id });
        }
      }
    }
    if (!distances.has(to)) return Object.freeze({ found: false, reason: 'NO_PATH' });
    const nodes = [to]; const edges = [];
    let cursor = to;
    while (cursor !== from) {
      const step = previous.get(cursor);
      if (!step) return Object.freeze({ found: false, reason: 'BROKEN_PATH' });
      edges.push(step.edgeId); nodes.push(step.nodeId); cursor = step.nodeId;
    }
    nodes.reverse(); edges.reverse();
    return Object.freeze({ found: true, cost: distances.get(to), nodes: Object.freeze(nodes), edges: Object.freeze(edges) });
  }
}

export function defaultEdgeCost(edge) {
  if (edge.status !== 'OPEN') return Infinity;
  const distance = Number.isFinite(edge.distanceM) ? Math.max(0, edge.distanceM) : 1;
  const speed = Number.isFinite(edge.currentSpeedMps) && edge.currentSpeedMps > 0 ? edge.currentSpeedMps : 1.2;
  const accessibilityPenalty = edge.accessibility === 'BLOCKED' ? Infinity : edge.accessibility === 'LIMITED' ? 1.5 : 1;
  const capacityPenalty = Number.isFinite(edge.capacityPressure) ? 1 + Math.max(0, edge.capacityPressure - 0.7) * 3 : 1;
  return distance / speed * accessibilityPenalty * capacityPenalty;
}
