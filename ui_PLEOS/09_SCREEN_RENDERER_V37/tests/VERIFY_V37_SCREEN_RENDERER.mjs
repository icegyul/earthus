import assert from 'node:assert/strict';
import { assertProductTarget, targetMatrix } from '../core/PRODUCT_TARGET_V37.mjs';
import { assertPleosRegistration } from '../core/PLEOS_BUILD_TARGET_V37.mjs';
import { EarthusScreenRendererV37, AetherusScreenTargetV37 } from '../core/EARTHUS_SCREEN_RENDERER_V37.mjs';

assert.deepEqual(targetMatrix(), {
  EARTHUS: { WEB: true, MOBILE: true, PLEOS: true },
  AETHERUS: { WEB: true, MOBILE: true, PLEOS: false }
});
assert.doesNotThrow(() => assertProductTarget('EARTHUS','PLEOS'));
assert.throws(() => assertProductTarget('AETHERUS','PLEOS'), /INVALID_PRODUCT_TARGET/);
assert.doesNotThrow(() => assertPleosRegistration({route:'/earthus/weather', bundleNamespace:'earthus/weather', analyticsEvent:'earthus.weather.open'}));
assert.throws(() => assertPleosRegistration({route:'/aetherus/space'}), /PLEOS_ROUTE_REJECTED/);
assert.throws(() => assertPleosRegistration({route:'/earthus/weather', bundleNamespace:'aetherus/space'}), /PLEOS_BUNDLE_NAMESPACE_REJECTED/);
assert.throws(() => assertPleosRegistration({route:'/earthus/weather', analyticsEvent:'aetherus.launch.open'}), /PLEOS_ANALYTICS_REJECTED/);

const pleos = new EarthusScreenRendererV37({product:'EARTHUS', platform:'PLEOS', layout:'PLEOS'});
pleos.openDock('weather');
const pleosHtml = pleos.renderHTML();
assert.match(pleosHtml, /data-product="EARTHUS"/);
assert.match(pleosHtml, /PLEOS · EARTHUS ONLY/);
assert(!pleosHtml.includes('AETHERUS'));
assert.equal(pleos.model().productVisibility.AETHERUS, false);

const mobileEarthus = new EarthusScreenRendererV37({product:'EARTHUS', platform:'MOBILE', layout:'PHONE'});
assert.equal(mobileEarthus.model().productVisibility.AETHERUS, false);

const aetherusMobile = new AetherusScreenTargetV37({platform:'MOBILE', layout:'PHONE'});
const aetherusWeb = new AetherusScreenTargetV37({platform:'WEB', layout:'WEB'});
assert.match(aetherusMobile.renderHTML(), /AETHERUS/);
assert.match(aetherusWeb.renderHTML(), /AETHERUS/);
assert.throws(() => new AetherusScreenTargetV37({platform:'PLEOS'}), /AETHERUS_IS_NOT_A_PLEOS_PRODUCT/);

console.log(JSON.stringify({
  status:'PASS',
  productMatrix:targetMatrix(),
  checks:['EARTHUS_PLEOS_RENDER','PLEOS_ROUTE_EXCLUSION','PLEOS_BUNDLE_EXCLUSION','PLEOS_ANALYTICS_EXCLUSION','AETHERUS_PLEOS_REJECTED','AETHERUS_MOBILE_ALLOWED','AETHERUS_WEB_ALLOWED','EARTHUS_MOBILE_RENDER']
}, null, 2));
