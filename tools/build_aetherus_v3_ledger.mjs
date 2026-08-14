#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = path.join(root,
  'work/aetherus-v3.0-master-package/IMPLEMENTATION_SHEET_INDEX.json');
const outputJson = path.join(root, 'docs/earthus-v23/AETHERUS_V3_SHEET_LEDGER.json');
const outputMarkdown = path.join(root, 'docs/earthus-v23/AETHERUS_V3_SHEET_LEDGER.md');
const publicOutputJson = path.join(root, 'prototype/data/aetherus/v3-sheet-ledger.json');
const cultureFixturePath = path.join(root, 'tools/fixtures/aetherus-culture-v1.json');
const publicCultureFixturePath = path.join(root, 'prototype/data/aetherus/culture-fixture.v1.json');
const [sheetsText, cultureFixtureText] = await Promise.all([
  readFile(indexPath, 'utf8'),
  readFile(cultureFixturePath, 'utf8'),
]);
const sheets = JSON.parse(sheetsText);

const numbers = values => new Set(values.flatMap(value => {
  if (Number.isInteger(value)) return [value];
  const [start, end] = value;
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}));

// VERIFIED_EXISTING means current-repository local evidence exists. It never means a completed runtime.
const verified = numbers([
  [1, 11], [14, 18], [21, 24],
  [26, 36], [40, 61],
  62, 64, [65, 78],
  [82, 101],
  [102, 104], 106, 107, [109, 114],
  [115, 125], 127, 128, 129, 131,
  [136, 140], 142, 143, 144, 146, 147, 149, 150,
  [151, 163],
  [215, 245],
  250, [252, 262],
  248, 249, 251, 257, 258, 259,
  239, 240,
  [277, 286], 291, 294, 295, 296,
]);

// 실제 UI가 생겼지만 해당 Sheet의 서버 동기화·offline·알림·전체 widget acceptance가
// 아직 닫히지 않은 범위다. 계약 파일만으로 VERIFIED_EXISTING으로 되돌리지 않는다.
const partialRuntime = numbers([[115, 125], 127, 128, 129, 131]);

// These sheets need authority/evidence that cannot be synthesized safely in this repository.
const blocked = numbers([
  12, 13, 19, 20, 25,
  37, 38, 39,
  63, 73, 75, 76, 79, 80, 81,
  105, 108,
  126, 130, 132,
  133, 134, 135, 140, 141, 145, 148,
  [164, 214],
  246, 247,
  [263, 276],
  287, 288, 289, 290, 292, 293,
]);

function evidenceFor(sheet) {
  if ([6, 8, 10, 11, 14, 15, 16, 17, 18, 21, 22, 23].includes(sheet)) return {
    files: ['prototype/js/space/platform-operating-contract.js',
      'prototype/data/aetherus/platform-operating-policy.v1.json',
      'docs/earthus-v23/AETHERUS_PLATFORM_OPERATING_FOUNDATION.md'],
    tests: ['tools/test_aetherus_platform_operating_contract.mjs'],
  };
  if ([43, 47, 50, 56, 61].includes(sheet)) return {
    files: ['prototype/js/space/discovery-contract.js',
      'prototype/data/aetherus/discovery-policy.v1.json',
      'docs/earthus-v23/AETHERUS_DISCOVERY_FOUNDATION.md'],
    tests: ['tools/test_aetherus_discovery_contract.mjs'],
  };
  if (sheet >= 102 && sheet <= 114) return {
    files: ['prototype/js/space/spotlight-contract.js',
      'prototype/data/aetherus/spotlight-policy.v1.json',
      'docs/earthus-v23/AETHERUS_SPOTLIGHT_FOUNDATION.md'],
    tests: ['tools/test_aetherus_spotlight_contract.mjs'],
  };
  if (sheet >= 219 && sheet <= 232) return {
    files: ['prototype/js/space/database-contract.js',
      'prototype/data/aetherus/database-contract.v1.json',
      'docs/earthus-v23/AETHERUS_DATABASE_FOUNDATION.md'],
    tests: ['tools/test_aetherus_database_contract.mjs'],
  };
  if ((sheet >= 233 && sheet <= 238) || (sheet >= 241 && sheet <= 245)) return {
    files: ['prototype/js/space/infrastructure-contract.js',
      'prototype/data/aetherus/infrastructure-policy.v1.json',
      'docs/earthus-v23/AETHERUS_INFRASTRUCTURE_FOUNDATION.md'],
    tests: ['tools/test_aetherus_infrastructure_contract.mjs'],
  };
  if ([250, 252, 253, 254, 255, 256, 260, 261, 262].includes(sheet)) return {
    files: ['prototype/js/space/security-privacy-contract.js',
      'prototype/data/aetherus/security-policy.v1.json',
      'docs/earthus-v23/AETHERUS_SECURITY_PRIVACY_FOUNDATION.md'],
    tests: ['tools/test_aetherus_security_privacy_contract.mjs'],
  };
  if ([279, 284, 286, 291, 295].includes(sheet)) return {
    files: ['prototype/js/space/release-qa-contract.js',
      'prototype/data/aetherus/release-qa-policy.v1.json',
      'docs/earthus-v23/AETHERUS_RELEASE_DATA_ROLLBACK_HOTFIX.md'],
    tests: ['tools/test_aetherus_release_qa_contract.mjs'],
  };
  if (sheet >= 215 && sheet <= 218) return {
    files: ['prototype/js/space/api-contract.js',
      'prototype/data/aetherus/api-contract-policy.v1.json',
      'docs/earthus-v23/AETHERUS_API_CONTRACT_FOUNDATION.md'],
    tests: ['tools/test_aetherus_api_contract.mjs'],
  };
  if ((sheet >= 65 && sheet <= 78) || (sheet >= 82 && sheet <= 90)
    || sheet === 282 || sheet === 283) return {
    files: ['prototype/js/space/launch-payload-contract.js',
      'docs/earthus-v23/AETHERUS_LAUNCH_PAYLOAD_FOUNDATION.md',
      'work/aetherus-v3.0-master-package/LAUNCH_SATELLITE_MISSION_CONTROL.md'],
    tests: ['tools/test_aetherus_launch_payload.mjs'],
  };
  if (sheet >= 91 && sheet <= 101) return {
    files: ['prototype/js/space/satellite-object-contract.js',
      'prototype/data/aetherus/satellite-policy.v1.json',
      'docs/earthus-v23/AETHERUS_SATELLITE_FOUNDATION.md'],
    tests: ['tools/test_aetherus_satellite_contract.mjs'],
  };
  if ([137, 138, 139, 140, 239, 240, 281].includes(sheet)) return {
    files: ['prototype/js/space/media-rendition-policy.js',
      'prototype/data/aetherus/media-rendition-policy.v1.json',
      'docs/earthus-v23/AETHERUS_MEDIA_RENDITION_FOUNDATION.md'],
    tests: ['tools/test_aetherus_media_renditions.mjs', 'tools/test_aetherus_observation_media.mjs'],
  };
  if (sheet <= 10) return {
    files: ['docs/AETHERUS-V3-EXECUTION-2026-08-14.md', 'prototype/js/space/contracts.js'],
    tests: ['tools/test_aetherus_foundation.mjs', 'tools/test_aetherus_hardening.mjs'],
  };
  if (sheet <= 25) return {
    files: ['docs/earthus-v23/CURRENT_STATE.md',
      'work/aetherus-v3.0-master-package/data-model.json',
      'work/aetherus-v3.0-master-package/API_CONTRACT.md'],
    tests: ['tools/test_aetherus_hardening.mjs'],
  };
  if (sheet <= 43) return {
    files: ['prototype/js/main.js', 'prototype/js/layerbar.js', 'prototype/js/safety-engine.js',
      'docs/earthus-v23/CURRENT_STATE.md'],
    tests: ['tools/test_safety_engine.mjs', 'tools/test_continuous_layers.mjs',
      'tools/test_earth_route_state.mjs'],
  };
  if (sheet <= 61) return {
    files: ['prototype/js/space/contracts.js', 'prototype/js/space/astronomy.js',
      'prototype/js/space/observation-media.js', 'prototype/data/space-photos.json'],
    tests: ['tools/test_aetherus_foundation.mjs', 'tools/test_aetherus_astronomy.mjs',
      'tools/test_aetherus_observation_media.mjs', 'tools/test_aetherus_photo_ownership.mjs'],
  };
  if (sheet <= 81) return {
    files: ['prototype/js/layers/launchpad.js',
      'work/aetherus-v3.0-master-package/LAUNCH_SATELLITE_MISSION_CONTROL.md'],
    tests: ['tools/test_aetherus_mission_replay.mjs'],
  };
  if (sheet <= 101) return {
    files: ['prototype/js/layers/satcat.js', 'prototype/js/satellite-frame-contract.js',
      'work/aetherus-v3.0-master-package/LAUNCH_SATELLITE_MISSION_CONTROL.md'],
    tests: ['tools/test_satellite_imagery_requests.mjs', 'tools/test_aetherus_foundation.mjs'],
  };
  if (sheet <= 114) return {
    files: ['prototype/js/layers/satcat.js',
      'work/aetherus-v3.0-master-package/LAUNCH_SATELLITE_MISSION_CONTROL.md'],
    tests: ['tools/test_aetherus_foundation.mjs'],
  };
  if (sheet <= 132) return {
    files: ['prototype/js/space/aetherus-dashboard.js', 'prototype/css/aetherus-dashboard.css',
      'prototype/js/space/mission-control.js',
      'prototype/data/aetherus/mission-control-policy.v1.json',
      'docs/earthus-v23/AETHERUS_MISSION_CONTROL_FOUNDATION.md'],
    tests: ['tools/test_aetherus_mission_control_ui.mjs',
      'tools/test_aetherus_mission_control_live_sources.mjs',
      'tools/test_aetherus_mission_control.mjs'],
  };
  if (sheet <= 150) return {
    files: ['prototype/js/space/observation-media.js', 'prototype/js/space/observation-session.js',
      'prototype/js/space/personal-universe.js',
      'prototype/supabase/migrations/20260814090000_aetherus_private_data.sql'],
    tests: ['tools/test_aetherus_observation_media.mjs', 'tools/test_aetherus_observation_session.mjs',
      'tools/test_aetherus_personal_universe.mjs', 'tools/test_aetherus_photo_ownership.mjs'],
  };
  if (sheet <= 163) return {
    files: ['prototype/js/space/culture-reference.js',
      'tools/fixtures/aetherus-culture-v1.json',
      'docs/earthus-v23/AETHERUS_CULTURE_FOUNDATION.md'],
    tests: ['tools/test_aetherus_culture.mjs'],
  };
  if (sheet <= 194) return {
    files: ['work/aetherus-v3.0-master-package/SPATIAL_JOURNEY_VISIONOS.md',
      'prototype/js/space/sky-ar.js'],
    tests: ['tools/test_aetherus_sky_ar.mjs', 'tools/test_aetherus_device_qa.mjs'],
  };
  if (sheet <= 204) return {
    files: ['work/aetherus-v3.0-master-package/APPLE_PLATFORM_DISTRIBUTION.md'], tests: [],
  };
  if (sheet <= 214) return {
    files: ['work/aetherus-v3.0-master-package/APPLE_PLATFORM_DISTRIBUTION.md',
      'docs/FOUNDING-500.md'], tests: [],
  };
  if (sheet <= 232) return {
    files: ['work/aetherus-v3.0-master-package/API_CONTRACT.md',
      'work/aetherus-v3.0-master-package/data-model.json',
      'prototype/supabase/migrations/20260814090000_aetherus_private_data.sql'],
    tests: ['tools/verify_aetherus_rls.mjs'],
  };
  if (sheet <= 247) return {
    files: ['prototype/js/satellite-tile-cache.js', 'prototype/js/space/observation-media.js',
      'docs/earthus-v23/RUNBOOK.md'],
    tests: ['tools/test_aetherus_observation_media.mjs', 'tools/test_satellite_imagery_requests.mjs'],
  };
  if (sheet <= 262) return {
    files: ['prototype/js/space/contracts.js', 'prototype/js/space/observation-media.js',
      'prototype/supabase/migrations/20260814090000_aetherus_private_data.sql'],
    tests: ['tools/test_aetherus_hardening.mjs', 'tools/test_aetherus_observation_media.mjs',
      'tools/verify_aetherus_rls.mjs'],
  };
  if (sheet <= 276) return {
    files: ['docs/earthus-v23/RUNBOOK.md', 'docs/earthus-v23/CURRENT_STATE.md'], tests: [],
  };
  return {
    files: ['docs/earthus-v23/TEST_MATRIX.md',
      'docs/earthus-v23/RELEASE-2026-08-14-AETHERUS-DEVICE-RC.md'],
    tests: ['tools/test_aetherus_foundation.mjs', 'tools/test_aetherus_hardening.mjs',
      'tools/test_aetherus_device_qa.mjs'],
  };
}

function blockersFor(sheet, status) {
  if (status !== 'BLOCKED_EXTERNAL') return [];
  if (sheet >= 164 && sheet <= 194) return ['native visionOS target', 'Vision Pro hardware attestation',
    'thermal/accessibility/privacy evidence'];
  if (sheet >= 195 && sheet <= 214) return ['Apple developer/App Store authority',
    'approved entitlement and receipt policy', 'real platform build/device evidence'];
  if (sheet >= 263 && sheet <= 276) return ['production telemetry', 'approved SLI/SLO and owner',
    'dashboard/on-call operating evidence'];
  if ([37, 38, 63, 73, 75, 76, 79, 80, 81, 105, 108].includes(sheet)) {
    return ['provider rights/freshness contract', 'live adapter evidence', 'notification/publication approval'];
  }
  if ([133, 134, 135, 140, 141, 145, 148].includes(sheet)) {
    return ['authenticated server principal', 'private storage/worker/moderation infrastructure',
      'two-principal operating evidence'];
  }
  if ([287, 288, 289, 290, 292, 293].includes(sheet)) {
    return ['real target device/account', 'manual or operating test evidence', 'release authority'];
  }
  return ['external authority or operating evidence required'];
}

function nextActionFor(sheet, status) {
  if (status === 'VERIFIED_EXISTING') return 'Audit the linked local evidence against the actual runtime acceptance criteria; do not call it complete from contract tests alone.';
  if (status === 'PARTIAL_RUNTIME') return 'Finish every widget in the sheet, account sync/offline/fullscreen/alerts as applicable, then rerun real-browser acceptance.';
  if (status === 'BLOCKED_EXTERNAL') return 'Do not simulate the blocker; collect the named external evidence first.';
  if (sheet >= 115 && sheet <= 132) return 'Implement a private local Mission Control layout/revision contract before UI wiring.';
  if (sheet >= 215 && sheet <= 232) return 'Map the seed model to existing schema, then add migration/API contract tests.';
  if (sheet >= 233 && sheet <= 262) return 'Add the smallest fail-closed policy contract and a failure fixture.';
  return 'Implement domain + API/fallback + UI contract + tests as one local shadow batch.';
}

function productionStatusFor(status) {
  if (status === 'VERIFIED_EXISTING') return 'LOCAL_EVIDENCE_ONLY';
  if (status === 'PARTIAL_RUNTIME') return 'PARTIAL_RUNTIME';
  if (status === 'BLOCKED_EXTERNAL') return 'BLOCKED_EXTERNAL';
  if (status === 'NOT_APPLICABLE') return 'NOT_APPLICABLE';
  return 'IMPLEMENTATION_REQUIRED';
}

const entries = sheets.map(sheet => {
  const status = blocked.has(sheet.sheet) ? 'BLOCKED_EXTERNAL'
    : partialRuntime.has(sheet.sheet) ? 'PARTIAL_RUNTIME'
      : verified.has(sheet.sheet) ? 'VERIFIED_EXISTING' : 'IMPLEMENT';
  const evidence = evidenceFor(sheet.sheet);
  return {
    sheet: sheet.sheet,
    part: sheet.part,
    title: sheet.title,
    items: sheet.items,
    kind: sheet.kind,
    status,
    evidence,
    blockers: blockersFor(sheet.sheet, status),
    nextAction: nextActionFor(sheet.sheet, status),
    productionStatus: productionStatusFor(status),
  };
});

const allowedStatuses = new Set(['VERIFIED_EXISTING', 'PARTIAL_RUNTIME', 'IMPLEMENT',
  'BLOCKED_EXTERNAL', 'NOT_APPLICABLE']);
if (entries.length !== 296 || entries.some((entry, index) => entry.sheet !== index + 1)
  || entries.some(entry => !allowedStatuses.has(entry.status))) {
  throw new Error('Aetherus ledger integrity failed');
}
const counts = Object.fromEntries([...allowedStatuses].map(status =>
  [status, entries.filter(entry => entry.status === status).length]));
const ledger = {
  schema: 'earthus.aetherus-v3-sheet-ledger.v2',
  source: 'work/aetherus-v3.0-master-package/IMPLEMENTATION_SHEET_INDEX.json',
  generatedAt: '2026-08-14T17:39:03Z',
  statusMeaning: {
    VERIFIED_EXISTING: 'Current repository local evidence exists; this is not a runtime-complete verdict.',
    PARTIAL_RUNTIME: 'A user-visible runtime exists, but one or more sheet acceptance items remain incomplete.',
    IMPLEMENT: 'A concrete local implementation or evidence gap remains.',
    BLOCKED_EXTERNAL: 'External authority, account, rights, device, or operating evidence is required.',
    NOT_APPLICABLE: 'Confirmed outside the product scope; none assigned in this baseline.',
  },
  productionStatusMeaning: {
    LOCAL_EVIDENCE_ONLY: 'Contract, fixture, file, or test evidence exists locally; deployment and product completion are not inferred.',
    PARTIAL_RUNTIME: 'A user-visible surface is available, but the sheet is not accepted as complete.',
    BLOCKED_EXTERNAL: 'No deployment claim; rights, account, device, infrastructure, or operating evidence is still required.',
    IMPLEMENTATION_REQUIRED: 'A concrete repository implementation remains before deployment.',
    NOT_APPLICABLE: 'Confirmed outside the product scope.',
  },
  counts,
  entries,
};
await writeFile(outputJson, `${JSON.stringify(ledger, null, 2)}\n`);
await writeFile(publicOutputJson, `${JSON.stringify(ledger, null, 2)}\n`);
await writeFile(publicCultureFixturePath, cultureFixtureText);

const rows = entries.map(entry => {
  const evidence = [...entry.evidence.files, ...entry.evidence.tests].slice(0, 3).join('<br>');
  const blocker = entry.blockers.join('; ') || '—';
  return `| ${String(entry.sheet).padStart(3, '0')} | ${entry.title.replaceAll('|', '\\|')} | ${entry.status} | ${entry.productionStatus} | ${evidence} | ${blocker} |`;
}).join('\n');
const markdown = `# Aetherus v3.0 Implementation Sheet Ledger — 296 sheets

## 판정

- 정본: \`${ledger.source}\`
- 총 296개, 번호 001–296 연속.
- \`VERIFIED_EXISTING\` ${counts.VERIFIED_EXISTING}, \`PARTIAL_RUNTIME\` ${counts.PARTIAL_RUNTIME},
  \`IMPLEMENT\` ${counts.IMPLEMENT}, \`BLOCKED_EXTERNAL\` ${counts.BLOCKED_EXTERNAL},
  \`NOT_APPLICABLE\` ${counts.NOT_APPLICABLE}.
- \`VERIFIED_EXISTING\`은 코드·fixture·test 등 로컬 증거가 있다는 뜻일 뿐, 배포 또는 제품
  완료 판정이 아니다. 계약 테스트만으로 런타임 완료를 주장하지 않는다.
- Mission Control의 사용자 화면이 연결된 15개 시트는 \`PARTIAL_RUNTIME\`이다. 실제 브라우저
  진입·room별 레이아웃 저장·공식 데이터 위젯은 검증했지만 sync·fullscreen·offline·전체
  접근성 acceptance가 남아 있어 완료가 아니다.
- 외부 증거가 필요한 \`BLOCKED_EXTERNAL\` ${counts.BLOCKED_EXTERNAL}개는 배포 누락이 아니라 외부 관문으로 분리한다.
- 이 파일은 \`tools/build_aetherus_v3_ledger.mjs\`로 index에서 재생성한다.

## 다음 결정

1. \`VERIFIED_EXISTING\`은 실제 화면·데이터·실패 상태·기기 acceptance를 다시 대조한다.
2. \`PARTIAL_RUNTIME\`과 \`IMPLEMENT\`는 domain + API/fallback + UI + real-browser test를 한 배치로 닫는다.
3. \`BLOCKED_EXTERNAL\`은 값을 추정하거나 fixture 성공을 운영 성공으로 바꾸지 않는다.
4. Sheet 151–163 Culture Layer는 합성 fixture 로컬 계약이며 제품 완료가 아니다.

| Sheet | 제목 | 구현 상태 | 배포 상태 | 현재 증거 후보 | 외부 blocker |
|---:|---|---|---|---|---|
${rows}
`;
await writeFile(outputMarkdown, markdown);
console.log(JSON.stringify({ schema: ledger.schema, counts }, null, 2));
