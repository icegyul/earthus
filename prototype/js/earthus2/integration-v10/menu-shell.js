import { TOP_MENU } from '../frontend-v10/runtime/constants.js';
import { featuresForMenu } from './feature-registry.js';
import { listCountryFocusPresets } from './country-focus.js';

const MENUS=[TOP_MENU.EARTH,TOP_MENU.WEATHER,TOP_MENU.OCEAN,TOP_MENU.HAZARD,TOP_MENU.HUMAN,TOP_MENU.SPACE,TOP_MENU.PULSE];
export function mountMenuShell({root,controller,onState,onCountryFocus,onPulseOpen}){
  if(!root)throw new TypeError('menu root required');
  root.innerHTML=`<div class="v2-brand"><b>earthus</b><span>2.0</span></div>
    <nav class="v2-topmenus" aria-label="Earthus 2.0 data menus"></nav>
    <div class="v2-submenu" aria-live="polite"></div>
    <div class="v2-country"><div class="section-label">FOCUS</div></div>
    <div class="v2-runtime-status" aria-live="polite"></div>`;
  const nav=root.querySelector('.v2-topmenus'); const submenu=root.querySelector('.v2-submenu'); const status=root.querySelector('.v2-runtime-status'); const country=root.querySelector('.v2-country');
  for(const menu of MENUS){const b=document.createElement('button');b.type='button';b.dataset.menu=menu;b.textContent=menu;b.addEventListener('click',()=>selectMenu(menu));nav.append(b);}
  for(const p of listCountryFocusPresets()){const b=document.createElement('button');b.type='button';b.className='country-chip';b.textContent=p.code;b.title=p.label;b.addEventListener('click',()=>onCountryFocus?.(p.code));country.append(b);}

  async function selectMenu(menu){
    setBusy(true); try{await controller.selectMenu(menu); render(menu); onState?.(controller.snapshot()); if(menu===TOP_MENU.PULSE)onPulseOpen?.();}
    catch(e){status.textContent=e.message;status.dataset.state='error';}finally{setBusy(false);}
  }
  function render(menu){
    nav.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.menu===menu));submenu.replaceChildren();
    const defs=featuresForMenu(menu); if(!defs.length){submenu.innerHTML='<span class="empty">Quiet Earth — choose a data menu.</span>';return;}
    for(const def of defs){const b=document.createElement('button');b.type='button';b.textContent=def.label;b.dataset.feature=def.id;b.addEventListener('click',async()=>{setBusy(true);try{await controller.selectFeature(def.id);renderFeatureState();onState?.(controller.snapshot());}catch(e){status.textContent=e.message;status.dataset.state='error';}finally{setBusy(false);}});submenu.append(b);}
    renderFeatureState();
  }
  function renderFeatureState(){const snap=controller.snapshot();submenu.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.feature===snap.features.primary));status.textContent=`${snap.scene.menu} · ${snap.features.primary??'NO DATA LAYER'}`;status.dataset.state='ok';}
  function setBusy(v){root.dataset.busy=v?'1':'0';}
  render(TOP_MENU.EARTH); onState?.(controller.snapshot());
  return Object.freeze({selectMenu,render});
}
