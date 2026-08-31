export function renderIntelligencePanel(root, snapshot,{legacyAvailable=false,pulse=null,error=null}={}){
  if(!root)return;
  const scene=snapshot?.scene ?? {};
  const features=snapshot?.features ?? {};
  const rows=[
    ['SCENE',scene.scene ?? 'LAND'],['MENU',scene.menu ?? 'EARTH'],['PRIMARY',features.primary ?? '—'],
    ['CONTEXT',features.secondary ?? '—'],['TIME','NOW'],['LEGACY BRIDGE',legacyAvailable?'READY':'NOT CONNECTED'],
  ];
  root.innerHTML=`<div class="ei-head"><span>EARTH INTELLIGENCE</span><span class="ei-state">${escapeHtml(scene.transition ?? 'IDLE')}</span></div>
  <div class="ei-tabs"><button class="on">NOW</button><button disabled>WHY</button><button disabled>NEXT</button><button disabled>FOR ME</button></div>
  <div class="ei-grid">${rows.map(([k,v])=>`<div><span>${escapeHtml(k)}</span><strong>${escapeHtml(v)}</strong></div>`).join('')}</div>
  ${pulse?`<div class="ei-pulse"><strong>PULSE NEWS</strong><span>${pulse.count} items · source schema ${pulse.schemaRecognized?'recognized':'unknown'}</span></div>`:''}
  ${error?`<div class="ei-error">${escapeHtml(error)}</div>`:''}
  <div class="ei-foot">No derived claim without source + observed time.</div>`;
}
function escapeHtml(value){return String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
