export const PHYSICAL_3D_FALLBACK = Object.freeze([
  'HIGH_3D','MEDIUM_3D','LOW_3D','STATIC_3D','OFF'
]);

export function assertNoPhotoAsWorld(mode){
  const banned = new Set(['PHOTO','IMAGE_SHELL','SATELLITE_SHELL','STATIC_SHELL','THREE_SHELL','BLUE_MARBLE_SPHERE']);
  if (banned.has(String(mode).toUpperCase())) throw new Error('PHOTO_AS_WORLD_FORBIDDEN');
  return true;
}

export function resolvePhysical3DFidelity({device='desktop',thermal='NORMAL',dataReady=true}={}){
  if (!dataReady) return 'OFF';
  if (thermal === 'SAFE') return 'STATIC_3D';
  if (thermal === 'ECO') return 'LOW_3D';
  if (device === 'mobile' || thermal === 'BALANCED') return 'MEDIUM_3D';
  return 'HIGH_3D';
}
