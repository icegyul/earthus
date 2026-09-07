import { countryReadinessScore } from '../paid/country-unlock.js';

export function compileCountryDataPassport({ countryId, providers, layers, terrain, localization, licenses, performance, qa }) {
  if (!countryId) throw new TypeError('countryId is required');
  const providerReady = providers.length ? providers.filter((provider) => provider.state === 'READY').length / providers.length : 0;
  const layerReady = layers.length ? layers.filter((layer) => ['READY', 'PUBLIC', 'PREVIEW'].includes(layer.state)).length / layers.length : 0;
  const licenseReady = licenses.length ? licenses.filter((item) => item.display === true && item.derivative !== false).length / licenses.length : 0;
  const readiness = countryReadinessScore({
    data: (providerReady + layerReady) / 2,
    license: licenseReady,
    visual: layers.length ? layers.filter((layer) => layer.visualPass === true).length / layers.length : 0,
    performance: performance?.pass === true ? 1 : 0,
    qa: qa?.pass === true ? 1 : 0,
    terrain: terrain?.ready === true ? 1 : 0,
    localization: localization?.ready === true ? 1 : 0,
  });
  return Object.freeze({
    schemaVersion: 'earthus.country-passport.v2.0',
    countryId,
    generatedAt: new Date().toISOString(),
    readiness,
    providerSummary: Object.freeze({ ready: providers.filter((provider) => provider.state === 'READY').length, total: providers.length }),
    layerSummary: Object.freeze({ ready: layers.filter((layer) => ['READY', 'PUBLIC', 'PREVIEW'].includes(layer.state)).length, total: layers.length }),
    licenseSummary: Object.freeze({ ready: licenses.filter((item) => item.display === true && item.derivative !== false).length, total: licenses.length }),
    blockers: readiness.blockers,
  });
}
