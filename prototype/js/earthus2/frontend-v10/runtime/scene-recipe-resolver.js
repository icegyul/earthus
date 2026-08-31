import { SCENE, TOP_MENU } from './constants.js';
import { canAutoCompose, validateComposition } from './compatibility-registry.js';
import { computeSceneBudget } from './device-budget.js';

const DEFAULT_SCENE = Object.freeze({
  [TOP_MENU.EARTH]: SCENE.LAND,
  [TOP_MENU.WEATHER]: SCENE.ATMOSPHERE,
  [TOP_MENU.OCEAN]: SCENE.OCEAN,
  [TOP_MENU.HAZARD]: SCENE.EVENT,
  [TOP_MENU.HUMAN]: SCENE.URBAN,
  [TOP_MENU.SPACE]: SCENE.SPACE,
  [TOP_MENU.PULSE]: SCENE.EVENT,
});

export function resolveSceneRecipe(intent, env={}) {
  if (!intent || typeof intent !== 'object') throw new TypeError('scene intent is required');
  const budget = computeSceneBudget(env);
  if (intent.type === 'TOP_MENU_SELECT') {
    const menu = intent.menu;
    if (!DEFAULT_SCENE[menu]) throw new TypeError(`unsupported menu: ${menu}`);
    if (menu === TOP_MENU.EARTH) return freezeRecipe({menu, scene:SCENE.LAND, primary:null, secondary:null, event:null, panel:'EARTH', cesiumSuspended:false, budget, reason:'QUIET_EARTH'});
    if (menu === TOP_MENU.PULSE) return freezeRecipe({menu, scene:SCENE.EVENT, primary:null, secondary:null, event:TOP_MENU.PULSE, panel:'PULSE', cesiumSuspended:false, budget, reason:'PULSE_OVERVIEW'});
    if (menu === TOP_MENU.SPACE) return freezeRecipe({menu, scene:SCENE.SPACE, primary:TOP_MENU.SPACE, secondary:null, event:null, panel:'SPACE', cesiumSuspended:true, budget, reason:'SPACE_EXCLUSIVE'});
    return freezeRecipe({menu, scene:DEFAULT_SCENE[menu], primary:menu, secondary:null, event:null, panel:menu, cesiumSuspended:false, budget, reason:'TOP_MENU_EXCLUSIVE'});
  }
  if (intent.type === 'PULSE_EVENT_OPEN') {
    const primary = intent.domain;
    const secondary = intent.contextDomain && budget.maxSecondary > 0 && canAutoCompose(primary, intent.contextDomain) ? intent.contextDomain : null;
    return freezeRecipe({menu:TOP_MENU.PULSE, scene:DEFAULT_SCENE[primary] ?? SCENE.EVENT, primary, secondary, event: primary === TOP_MENU.SPACE ? null : TOP_MENU.PULSE, panel:'PULSE', cesiumSuspended: primary === TOP_MENU.SPACE, budget, reason:'PULSE_EVENT_COMPOSITION', focus:intent.focus ?? null, pinnedTime:intent.pinnedTime ?? null});
  }
  if (intent.type === 'DOMAIN_CONTEXT_OPEN') {
    const {primary, context} = intent;
    if (!canAutoCompose(primary, context)) throw new Error(`context composition not approved: ${primary}+${context}`);
    const secondary = budget.maxSecondary > 0 ? context : null;
    return freezeRecipe({menu:primary, scene:DEFAULT_SCENE[primary], primary, secondary, event:null, panel:primary, cesiumSuspended:false, budget, reason:'APPROVED_CONTEXT_RECIPE'});
  }
  throw new TypeError(`unsupported scene intent: ${intent.type}`);
}

function freezeRecipe(recipe) {
  const errors = validateComposition(recipe);
  if (errors.length) throw new Error(errors.join('; '));
  return Object.freeze({...recipe, focus: recipe.focus ? structuredClone(recipe.focus) : null});
}
