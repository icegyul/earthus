import { TOP_MENU } from './constants.js';

const menus = new Set(Object.values(TOP_MENU));
const allowedContext = new Map([
  [`${TOP_MENU.HAZARD}:${TOP_MENU.WEATHER}`, 'AUTO_CONTEXT_ONLY'],
  [`${TOP_MENU.HAZARD}:${TOP_MENU.OCEAN}`, 'AUTO_CONTEXT_ONLY'],
  [`${TOP_MENU.HUMAN}:${TOP_MENU.WEATHER}`, 'AUTO_CONTEXT_ONLY'],
  [`${TOP_MENU.OCEAN}:${TOP_MENU.WEATHER}`, 'AUTO_CONTEXT_ONLY'],
  [`${TOP_MENU.WEATHER}:${TOP_MENU.HAZARD}`, 'SAFETY_OVERLAY_ONLY'],
]);

export function assertMenu(value) {
  if (!menus.has(value)) throw new TypeError(`invalid top menu: ${value}`);
  return value;
}

export function contextCompatibility(primary, context) {
  assertMenu(primary); assertMenu(context);
  if (primary === context) return 'SAME_DOMAIN';
  if (primary === TOP_MENU.SPACE || context === TOP_MENU.SPACE) return 'FORBIDDEN';
  return allowedContext.get(`${primary}:${context}`) ?? 'FORBIDDEN';
}

export function canAutoCompose(primary, context) {
  return contextCompatibility(primary, context) === 'AUTO_CONTEXT_ONLY';
}

export function validateComposition({ primary = null, secondary = null, event = null }) {
  const errors = [];
  if (primary) assertMenu(primary);
  if (secondary) assertMenu(secondary);
  if (event && event !== TOP_MENU.PULSE) errors.push('EVENT slot may only be owned by PULSE in v1');
  if (primary && secondary && !canAutoCompose(primary, secondary)) errors.push(`forbidden context pair: ${primary}+${secondary}`);
  if (primary === TOP_MENU.SPACE && (secondary || event)) errors.push('SPACE must be exclusive');
  return Object.freeze(errors);
}
