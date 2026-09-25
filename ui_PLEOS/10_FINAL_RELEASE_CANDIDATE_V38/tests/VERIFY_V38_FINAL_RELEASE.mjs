import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { PleosEarthusRendererFinal } from '../pleos/PLEOS_EARTHUS_RENDERER_FINAL.mjs';
import { AetherusScreenFinal } from '../web_mobile/AETHERUS_SCREEN_WEB_MOBILE_FINAL.mjs';
import { assertPleosRegistration } from '../pleos/PRODUCT_TARGET_PLEOS_FINAL.mjs';
import { createTarget, PRODUCTS, PLATFORMS, targetMatrix } from '../../09_SCREEN_RENDERER_V37/core/PRODUCT_TARGET_V37.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const report = {version:'V38', status:'PASS', checks:[]};

function ok(name, cond, detail='') {
  if (!cond) throw new Error(`FAIL:${name}${detail ? `:${detail}` : ''}`);
  report.checks.push(name);
}
function run(script){
  return execFileSync(process.execPath, [script], {encoding:'utf8'}).trim();
}

// Prior gates
const v35 = JSON.parse(run(path.join(ROOT,'07_APP_INTEGRATION_V35/tests/VERIFY_V35_INTEGRATION.mjs')));
ok('V35_INTEGRATION_PASS', v35.status === 'PASS');
const v36 = JSON.parse(run(path.join(ROOT,'08_UI_ADAPTER_V36/tests/VERIFY_V36_USER_JOURNEY.mjs')));
ok('V36_UI_JOURNEY_PASS', v36.status === 'PASS');
const v37 = JSON.parse(run(path.join(ROOT,'09_SCREEN_RENDERER_V37/tests/VERIFY_V37_SCREEN_RENDERER.mjs')));
ok('V37_RENDERER_PASS', v37.status === 'PASS');

// Final target matrix
const matrix = targetMatrix();
ok('TARGET_MATRIX', matrix.EARTHUS.PLEOS === true && matrix.AETHERUS.PLEOS === false);
ok('PLEOS_TARGET_REGISTRATION', assertPleosRegistration({route:'/earthus', bundleNamespace:'earthus/', analyticsEvent:'earthus.screen.open'}) === true);
let rejected = 0;
for (const bad of [
  () => assertPleosRegistration({route:'/aetherus/space'}),
  () => assertPleosRegistration({bundleNamespace:'aetherus/renderer'}),
  () => assertPleosRegistration({analyticsEvent:'aetherus.open'})
]) { try { bad(); } catch { rejected++; } }
ok('PLEOS_AETHERUS_REGISTRATION_REJECTED', rejected === 3);

// Standalone Pleos renderer has no AETHERUS renderer dependency.
const pleosSource = fs.readFileSync(path.join(ROOT,'10_FINAL_RELEASE_CANDIDATE_V38/pleos/PLEOS_EARTHUS_RENDERER_FINAL.mjs'),'utf8');
ok('PLEOS_RENDERER_NO_AETHERUS_IMPORT', !/Aetherus|aetherus\//.test(pleosSource));
const renderer = new PleosEarthusRendererFinal();
const html = renderer.renderHTML();
ok('PLEOS_BRAND_EARTHUS', /EARTHUS/.test(html));
ok('PLEOS_HTML_NO_AETHERUS', !/AETHERUS/i.test(html));

// Web/Mobile keeps AETHERUS available.
const mobileA = new AetherusScreenFinal({platform:'MOBILE',layout:'PHONE'});
const webA = new AetherusScreenFinal({platform:'WEB',layout:'WEB'});
ok('AETHERUS_MOBILE_ALLOWED', mobileA.model().brand === 'AETHERUS' && /AETHERUS/.test(mobileA.renderHTML()));
ok('AETHERUS_WEB_ALLOWED', webA.model().brand === 'AETHERUS' && /AETHERUS/.test(webA.renderHTML()));

// Production source handoff marker.
const handoff = fs.readFileSync(path.join(ROOT,'10_FINAL_RELEASE_CANDIDATE_V38/gate/SOURCE_INTEGRATION_HANDOFF_V38.md'),'utf8');
ok('SOURCE_HANDOFF_PRESENT', handoff.includes('EARTHUS') && handoff.includes('AETHERUS') && handoff.includes('PLEOS'));

console.log(JSON.stringify(report, null, 2));
