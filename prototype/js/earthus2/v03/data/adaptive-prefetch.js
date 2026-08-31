export function planPrefetch({frameIndex,totalFrames,mode='IDLE',network='FAST',memory='NORMAL'}={}){
  if(!Number.isInteger(frameIndex)||!Number.isInteger(totalFrames)||totalFrames<1) throw new TypeError('valid frame indices required');
  const forward=mode==='PLAYBACK'?(network==='FAST'?4:2):1, back=mode==='PLAYBACK'?1:2;
  const cap=memory==='LOW'?3:memory==='HIGH'?9:6; const ids=[];
  for(let i=Math.max(0,frameIndex-back);i<=Math.min(totalFrames-1,frameIndex+forward);i++) if(i!==frameIndex) ids.push(i);
  return ids.slice(0,cap);
}
