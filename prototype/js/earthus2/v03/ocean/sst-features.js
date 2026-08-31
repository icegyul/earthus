export function detectSstFronts(grid,{thresholdCPerCell=0.8}={}){
  const {width,height,values}=grid??{}; if(width<3||height<3||!Array.isArray(values)||values.length!==width*height) throw new TypeError('grid required');
  const out=[]; const at=(x,y)=>values[y*width+x];
  for(let y=1;y<height-1;y++) for(let x=1;x<width-1;x++){
    const l=at(x-1,y),r=at(x+1,y),d=at(x,y-1),u=at(x,y+1); if([l,r,d,u].some(v=>!Number.isFinite(v))) continue;
    const gx=(r-l)/2, gy=(u-d)/2, mag=Math.hypot(gx,gy); if(mag>=thresholdCPerCell) out.push({x,y,gradient:mag,gx,gy});
  }
  return out;
}
export function rotationProxy({duDy,dvDx}){ if(!Number.isFinite(duDy)||!Number.isFinite(dvDx)) return null; return dvDx-duDy; }
