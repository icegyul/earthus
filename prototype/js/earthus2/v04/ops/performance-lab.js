function p95(values){ const v=values.filter(Number.isFinite).sort((a,b)=>a-b); return v.length?v[Math.max(0,Math.ceil(v.length*.95)-1)]:null; }
export function evaluatePerformanceRun(samples,{minFps=30,maxP95FrameMs=40,maxMemoryGrowthMb=25,maxThermalLevel=2}={}){
  if(!Array.isArray(samples)||!samples.length) throw new TypeError('samples required');
  const fps=samples.map(s=>s.fps), frame=samples.map(s=>s.frameMs), mem=samples.map(s=>s.memoryMb).filter(Number.isFinite), therm=samples.map(s=>s.thermalLevel).filter(Number.isFinite);
  const metrics={minFps:fps.filter(Number.isFinite).length?Math.min(...fps.filter(Number.isFinite)):null,p95FrameMs:p95(frame),memoryGrowthMb:mem.length>1?mem.at(-1)-mem[0]:null,maxThermalLevel:therm.length?Math.max(...therm):null};
  const failed=[];
  if(!Number.isFinite(metrics.minFps)||metrics.minFps<minFps) failed.push('FPS');
  if(!Number.isFinite(metrics.p95FrameMs)||metrics.p95FrameMs>maxP95FrameMs) failed.push('FRAME_TIME');
  if(Number.isFinite(metrics.memoryGrowthMb)&&metrics.memoryGrowthMb>maxMemoryGrowthMb) failed.push('MEMORY_GROWTH');
  if(Number.isFinite(metrics.maxThermalLevel)&&metrics.maxThermalLevel>maxThermalLevel) failed.push('THERMAL');
  return Object.freeze({pass:failed.length===0,metrics:Object.freeze(metrics),failed:Object.freeze(failed)});
}
