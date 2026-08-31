export class HydrographyNetwork {
  #segments = new Map();
  #downstream = new Map();

  addSegment(segment) {
    if (!segment?.segmentId || !Number.isFinite(segment.lengthM) || segment.lengthM < 0) throw new TypeError('segmentId and lengthM are required');
    if (this.#segments.has(segment.segmentId)) throw new Error(`segment exists: ${segment.segmentId}`);
    this.#segments.set(segment.segmentId, Object.freeze({ order: 1, status: 'OPEN', ...structuredClone(segment) }));
    if (segment.downstreamId) this.#downstream.set(segment.segmentId, segment.downstreamId);
  }

  downstreamPath(segmentId) {
    const path = [];
    const visited = new Set();
    let cursor = segmentId;
    while (cursor) {
      if (visited.has(cursor)) throw new Error('hydrography network cycle detected');
      visited.add(cursor);
      const segment = this.#segments.get(cursor);
      if (!segment) break;
      path.push(segment);
      cursor = this.#downstream.get(cursor) ?? null;
    }
    return Object.freeze(path);
  }

  list() { return Object.freeze([...this.#segments.values()]); }
}
