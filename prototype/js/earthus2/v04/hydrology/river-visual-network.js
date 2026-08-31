export function compileRiverVisualNetwork(network, { zoomLevel = 6, selectedBasinId = null } = {}) {
  if (!Array.isArray(network?.segments)) throw new TypeError('network.segments required');
  const minOrder = zoomLevel >= 12 ? 1 : zoomLevel >= 8 ? 2 : zoomLevel >= 5 ? 3 : 4;
  const segments = network.segments.filter(s => (s.streamOrder ?? 1) >= minOrder && (!selectedBasinId || s.basinId === selectedBasinId)).map(s => Object.freeze({
    id:s.id, geometry:structuredClone(s.geometry), basinId:s.basinId ?? null,
    lineWidthPx: Math.min(5, 0.7 + Math.max(1,s.streamOrder ?? 1)*0.55),
    direction: s.flowDirectionVerified === true ? (s.direction ?? null) : null,
    flowValue: Number.isFinite(s.flowValue) ? s.flowValue : null,
    evidence: s.flowDirectionVerified === true ? 'VERIFIED_DIRECTION' : 'NETWORK_ONLY',
  }));
  return Object.freeze({ renderer:'DATA_NETWORK', segments:Object.freeze(segments), inventedDirections:false });
}
