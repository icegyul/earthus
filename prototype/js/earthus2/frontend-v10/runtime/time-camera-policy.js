import { TOP_MENU } from './constants.js';
export function resolveTimeCarry({fromMenu,toMenu,currentTimeMode='NOW',targetSupports=[]}) {
  if (toMenu === TOP_MENU.EARTH) return Object.freeze({mode:'NOW',carry:false,reason:'EARTH_RESET'});
  if (toMenu === TOP_MENU.SPACE || fromMenu === TOP_MENU.SPACE) return Object.freeze({mode:'NOW',carry:false,reason:'SPACE_TIME_DOMAIN'});
  if (targetSupports.includes(currentTimeMode)) return Object.freeze({mode:currentTimeMode,carry:true,reason:'COMPATIBLE_TIME'});
  return Object.freeze({mode:'NOW',carry:false,reason:'TARGET_UNSUPPORTED'});
}
export function resolveCameraCarry({fromMenu,toMenu,hasExplicitFocus=false}) {
  if (hasExplicitFocus) return Object.freeze({preserve:false,action:'FLY_TO_FOCUS'});
  if (toMenu === TOP_MENU.SPACE || fromMenu === TOP_MENU.SPACE) return Object.freeze({preserve:false,action:'DOMAIN_RESET'});
  if (toMenu === TOP_MENU.EARTH) return Object.freeze({preserve:true,action:'KEEP_VIEW_CLEAR_LAYERS'});
  return Object.freeze({preserve:true,action:'KEEP_VIEW'});
}
