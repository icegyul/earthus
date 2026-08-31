import { TOP_MENU } from '../frontend-v10/runtime/constants.js';
import { SceneStateStore, GenerationGuard, SceneTransactionCoordinator, MenuController } from '../frontend-v10/runtime/index.js';
import { FeatureStateStore } from './feature-state-store.js';
import { LegacyLayerBridge } from './legacy-layer-bridge.js';
import { EarthusSceneRuntimeAdapter } from './scene-runtime-adapter.js';
import { EarthusV2AppController } from './app-controller.js';
import { RuntimeEvidenceRecorder } from './runtime-evidence.js';
import { mountMenuShell } from './menu-shell.js';
import { renderIntelligencePanel } from './intelligence-panel.js';
import { focusCountry } from './country-focus.js';
import { fetchPulseNews } from './pulse-source.js';

export async function bootstrapEarthusV2({viewer=null, menuRoot, intelligenceRoot}={}){
  const evidence=new RuntimeEvidenceRecorder();
  let legacyStore=null; let legacyLoadError=null;
  try { legacyStore=(await import('../../store.js')).store; } catch(error){legacyLoadError=error; evidence.record('legacy.store.unavailable',{message:error.message});}
  const bridge=legacyStore?new LegacyLayerBridge({store:legacyStore}):null;
  const sceneState=new SceneStateStore(); const featureState=new FeatureStateStore(); const guard=new GenerationGuard();
  const runtime=new EarthusSceneRuntimeAdapter({legacyStore,viewer});
  const tx=new SceneTransactionCoordinator({runtime,store:sceneState,guard});
  const menuController=new MenuController({transaction:tx,environment:()=>({deviceClass:matchMedia('(max-width: 760px)').matches?'mobile':'desktop',thermal:'NORMAL',panelOpen:true})});
  const controller=new EarthusV2AppController({menuController,bridge,featureState,sceneState,evidence});
  let pulse=null; let pulseAbort=null;
  const draw=error=>renderIntelligencePanel(intelligenceRoot,controller.snapshot(),{legacyAvailable:!!legacyStore,pulse,error:error??legacyLoadError?.message??null});
  const shell=mountMenuShell({root:menuRoot,controller,onState:()=>draw(),onCountryFocus:code=>{try{focusCountry(viewer,code);evidence.record('country.focus',{code});}catch(e){draw(e.message);}},onPulseOpen:async()=>{pulseAbort?.abort();pulseAbort=new AbortController();try{pulse=await fetchPulseNews({signal:pulseAbort.signal});evidence.record('pulse.news.loaded',{count:pulse.count});draw();}catch(e){if(e.name!=='AbortError')draw(e.message);}}});
  draw();
  const api=Object.freeze({controller,shell,evidence,snapshot:()=>Object.freeze({...controller.snapshot(),evidence:evidence.snapshot(),legacyStore:!!legacyStore,pulse}),
    async stress({cycles=50}={}){const order=[TOP_MENU.EARTH,TOP_MENU.WEATHER,TOP_MENU.OCEAN,TOP_MENU.HUMAN,TOP_MENU.HAZARD,TOP_MENU.PULSE];for(let i=0;i<cycles;i++)for(const menu of order)await controller.selectMenu(menu);const snap=controller.snapshot();return Object.freeze({cycles,menuTransitions:cycles*order.length,final:snap,bridge:bridge?.snapshot()??null});}
  });
  globalThis.__earthusV2=api;
  evidence.record('v2.ready',{legacyStore:!!legacyStore});
  return api;
}
