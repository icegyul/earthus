function percentile95(values) { const sorted = [...values].sort((a,b)=>a-b); return sorted[Math.max(0, Math.ceil(sorted.length * .95) - 1)] || 1; }
export function buildTourismRelief(snapshot) {
  if (!Array.isArray(snapshot?.cells) || snapshot.cells.length === 0) throw new TypeError('tourism cells are required');
  const values = snapshot.cells.map(cell => Math.max(0, Number(cell.value) || 0));
  const p95 = percentile95(values);
  const cells = snapshot.cells.map((cell, index) => {
    const value = values[index];
    const renderHeight = Math.min(180, Math.max(8, 8 + 172 * Math.log1p(Math.min(value, p95)) / Math.log1p(p95)));
    const polygon = ['Polygon','MultiPolygon'].includes(cell.geometry?.type);
    return { ...structuredClone(cell), renderHeight, primitive: polygon ? 'POLYGON_EXTRUSION' : 'AREA_MARKER',
      footprintMeaning: polygon ? 'OFFICIAL_OR_DECLARED_GEOMETRY' : 'FIXED_DISPLAY_CELL_NOT_OFFICIAL_AREA',
      aggregationLabel: `${snapshot.aggregationLevel ?? 'REGION'} 집계` };
  });
  return { schemaVersion: '8.0', aggregationLevel: snapshot.aggregationLevel ?? 'REGION', cells, flows: snapshot.odAvailable ? structuredClone(snapshot.flows ?? []) : [] };
}
