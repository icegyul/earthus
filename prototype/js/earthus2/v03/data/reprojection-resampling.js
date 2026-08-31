function finite(v, name) { if (!Number.isFinite(v)) throw new TypeError(`${name} must be finite`); return v; }
export function clampLon(lon) { finite(lon,'lon'); let x=((lon+180)%360+360)%360-180; return x===-180 && lon>0 ? 180 : x; }
export function clampLat(lat) { finite(lat,'lat'); return Math.max(-90, Math.min(90, lat)); }

export function bilinearSample(grid, x, y) {
  const { width, height, values } = grid ?? {};
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2 || !Array.isArray(values) || values.length !== width*height) throw new TypeError('complete grid required');
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  const gx=x*(width-1), gy=y*(height-1), x0=Math.floor(gx), y0=Math.floor(gy), x1=Math.min(width-1,x0+1), y1=Math.min(height-1,y0+1);
  const idx=(xx,yy)=>yy*width+xx;
  const v=[values[idx(x0,y0)],values[idx(x1,y0)],values[idx(x0,y1)],values[idx(x1,y1)]];
  if (v.some(n=>!Number.isFinite(n))) return null;
  const tx=gx-x0, ty=gy-y0;
  return (v[0]*(1-tx)+v[1]*tx)*(1-ty)+(v[2]*(1-tx)+v[3]*tx)*ty;
}

export function resampleGrid(grid, targetWidth, targetHeight, { method='bilinear' } = {}) {
  if (!Number.isInteger(targetWidth) || !Number.isInteger(targetHeight) || targetWidth < 1 || targetHeight < 1) throw new TypeError('target dimensions must be positive integers');
  const values=[];
  for (let y=0;y<targetHeight;y++) for (let x=0;x<targetWidth;x++) {
    const nx=targetWidth===1?0.5:x/(targetWidth-1), ny=targetHeight===1?0.5:y/(targetHeight-1);
    if (method==='nearest') {
      const sx=Math.round(nx*(grid.width-1)), sy=Math.round(ny*(grid.height-1));
      values.push(grid.values[sy*grid.width+sx] ?? null);
    } else if (method==='bilinear') values.push(bilinearSample(grid,nx,ny));
    else throw new TypeError(`unsupported resampling method: ${method}`);
  }
  return { width:targetWidth, height:targetHeight, values, method };
}
