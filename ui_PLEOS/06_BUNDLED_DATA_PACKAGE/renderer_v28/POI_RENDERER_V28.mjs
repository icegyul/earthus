/** EARTHUS V28 Local POI Renderer
 * Runtime-only, network-free viewport selection over bundled spatial index.
 */
import fs from 'node:fs/promises';

export function normalizeBbox(bbox) {
  const [minLon,minLat,maxLon,maxLat]=bbox.map(Number);
  if (![minLon,minLat,maxLon,maxLat].every(Number.isFinite) || minLon>maxLon || minLat>maxLat) throw new Error('INVALID_BBOX');
  return [minLon,minLat,maxLon,maxLat];
}
export function cellKey(lon,lat,cellDegrees=.05) {
  return `${Math.floor(lat/cellDegrees)},${Math.floor(lon/cellDegrees)}`;
}
export function viewportCells(bbox,cellDegrees=.05) {
  const [minLon,minLat,maxLon,maxLat]=normalizeBbox(bbox);
  const out=[];
  for(let y=Math.floor(minLat/cellDegrees); y<=Math.floor(maxLat/cellDegrees); y++)
    for(let x=Math.floor(minLon/cellDegrees); x<=Math.floor(maxLon/cellDegrees); x++) out.push(`${y},${x}`);
  return out;
}
export function pointInBbox(p,bbox){ return p.lon>=bbox[0]&&p.lon<=bbox[2]&&p.lat>=bbox[1]&&p.lat<=bbox[3]; }
export function queryViewport({poiMaster,spatialIndex,bbox,categories=null,statuses=['ACTIVE'],limit=200,cellDegrees=.05}) {
  const b=normalizeBbox(bbox); const ids=new Set();
  for(const c of viewportCells(b,cellDegrees)) for(const i of (spatialIndex.cells[c]||[])) ids.add(i);
  const cat=categories ? new Set(categories) : null, stat=new Set(statuses);
  const items=[];
  for(const i of ids){ const p=poiMaster.items[i]; if(!p||!pointInBbox(p,b)) continue; if(cat&&!cat.has(p.category)) continue; if(stat.size&&!stat.has(p.status)) continue; items.push(p); if(items.length>=limit) break; }
  return {items,matchedCellCount:viewportCells(b,cellDegrees).length,candidateCount:ids.size,truncated:items.length>=limit};
}

export async function loadBundle(baseDir) {
  const [poi,idx]=await Promise.all([
    fs.readFile(`${baseDir}/spatial_v24/POI_MASTER.json`,'utf8').then(JSON.parse),
    fs.readFile(`${baseDir}/spatial_v24/SPATIAL_GRID_INDEX.json`,'utf8').then(JSON.parse)
  ]);
  return {poiMaster:poi,spatialIndex:idx};
}
