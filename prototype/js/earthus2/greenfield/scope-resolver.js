const ORDER = ['GLOBAL','CONTINENT','COUNTRY','REGION','LOCAL','UNDERWATER'];

export function resolveScope({cameraHeightM, underwater=false, thresholds={continent:7000000,country:2500000,region:600000,local:100000}}={}){
  if (underwater) return 'UNDERWATER';
  if (!Number.isFinite(cameraHeightM) || cameraHeightM < 0) throw new RangeError('cameraHeightM must be finite >= 0');
  if (cameraHeightM > thresholds.continent) return 'GLOBAL';
  if (cameraHeightM > thresholds.country) return 'CONTINENT';
  if (cameraHeightM > thresholds.region) return 'COUNTRY';
  if (cameraHeightM > thresholds.local) return 'REGION';
  return 'LOCAL';
}

export function scopeRank(scope){ const i=ORDER.indexOf(scope); if(i<0) throw new RangeError('unknown scope'); return i; }
