export type WonderAction = 'wave'|'point'|'fart'|'special'|'greet'|'focus'|'look'|'jump'|'nod'|'wiggle'|'reaction';

export interface CharacterInteractionProfile {
  id: string;
  actions: WonderAction[];
  fartEnabled: boolean;
  special: WonderAction;
  fallback: 'sprite-reaction';
}

export interface InteractionContext {
  reducedMotion?: boolean;
  focused?: boolean;
}

export function resolveTap(profile: CharacterInteractionProfile, ctx: InteractionContext = {}): WonderAction[] {
  const seq: WonderAction[] = ['greet'];
  if (!ctx.reducedMotion) seq.push(profile.special);
  else seq.push('reaction');
  return seq;
}

export function resolveLongPress(profile: CharacterInteractionProfile, ctx: InteractionContext = {}): WonderAction[] {
  if (ctx.reducedMotion) return ['focus'];
  return ['focus', profile.special === 'point' ? 'look' : 'point'];
}

export function resolveFart(profile: CharacterInteractionProfile): WonderAction[] {
  return profile.fartEnabled ? ['fart'] : ['reaction'];
}

/**
 * IMPORTANT: this runtime supports full-body sprite fallback.
 * True arm/hand deformation requires semantic parts supplied by the art pipeline.
 */
export function getFx(action: WonderAction): string | null {
  switch (action) {
    case 'wave': return '/assets/interaction/fx/wave-lines.svg';
    case 'point': return '/assets/interaction/fx/point-glow.svg';
    case 'fart': return '/assets/interaction/fx/fart-cloud.svg';
    case 'special':
    case 'reaction':
    case 'greet': return '/assets/interaction/fx/sparkle.svg';
    default: return null;
  }
}
