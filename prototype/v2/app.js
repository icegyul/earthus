import { initViewer, viewer, setAmbientView } from '../js/viewer.js';
import { bootstrapEarthusV2 } from '../js/earthus2/integration-v10/bootstrap.js';

async function boot(){
  try{
    initViewer('earthusV2Globe');
    setAmbientView?.(127,25);
    document.documentElement.dataset.viewer='ready';
    const api=await bootstrapEarthusV2({viewer,menuRoot:document.getElementById('v2Menu'),intelligenceRoot:document.getElementById('v2Intelligence')});
    document.documentElement.dataset.v2='ready';
    window.dispatchEvent(new CustomEvent('earthus:v2-ready',{detail:{snapshot:api.snapshot()}}));
  }catch(error){
    console.error('[earthus-v2]',error);
    document.documentElement.dataset.v2='error';
    const box=document.getElementById('v2Fatal');if(box){box.hidden=false;box.textContent=`EARTHUS 2.0 preview failed: ${error.message}`;}
  }
}
boot();
