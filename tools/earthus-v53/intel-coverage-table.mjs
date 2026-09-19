// P6 완료 기준 "현상별 5칸 표" — INTELLIGENCE-LAYER-PLAN §3 P6 (2026-09-20)
//
// 레지스트리의 intelligence:true 현상마다 5절(WHAT·WHY·NEXT·IMPACT·EVIDENCE)이 지금 되는지를 **기계적으로** 적는다.
//   패킷 생산자가 있는 현상 → 운영 패킷 그대로의 픽스처를 intel-questions.js sectionStatus 로 판정한다(화면과 같은 판정).
//   생산자가 없는 현상   → '생산자 없음' — 띠가 그려지지 않는다. 손으로 ✅ 를 적지 않는다.
//
// 실행: node tools/earthus-v53/intel-coverage-table.mjs > docs/INTEL-COVERAGE-2026-09-20.md
import { readFileSync } from 'node:fs';

const here = (p) => new URL(p, import.meta.url);
const { PHENOMENA } = await import('../../prototype/v2-three/js/phenomenon-registry.js');
const { INTEL_QUESTIONS, sectionStatus } = await import('../../prototype/v2-three/js/intel-questions.js');

// 패킷 생산자 — 운영에서 확인한 것만(2026-09-20). 픽스처는 운영 패킷을 그대로 옮긴 것이다.
export const PRODUCERS = Object.freeze({
  'hazards.typhoon': { lambda: 'cyclone-analog', doc: 'ocean/cyclone-events/{id}.json', fixture: 'intel-v1-typhoon-1001322.json' },
  'ocean.sst': { lambda: 'marine-grid', doc: 'ocean/sst-global.json', fixture: 'intel-v1-sst-20260920.json' },
  'hazards.earthquake': { lambda: 'lab-events', doc: 'ocean/earthquake-intel.json', fixture: 'intel-v1-quake-us7000tdvt.json' },
  'weather.temperature_anomaly': { lambda: 'kma-aws', doc: 'wind/kma-aws.json', fixture: 'intel-v1-temp-anomaly-fullday.json',
    note: '픽스처는 빠진 3시간을 채운 하루 — 운영은 어제 이력이 24회·8회를 못 채우면 평년차가 빈다' },
});

export function coverageRows() {
  const sections = INTEL_QUESTIONS.map((q) => q.section);
  const rows = [];
  for (const [id, p] of Object.entries(PHENOMENA)) {
    if (!p.capabilities || !p.capabilities.intelligence) continue;
    const prod = PRODUCERS[id];
    const cells = {};
    if (prod) {
      const packet = JSON.parse(readFileSync(here(`./fixtures/${prod.fixture}`), 'utf8'));
      for (const s of sections) {
        const st = sectionStatus(packet, s);
        cells[s] = st.status === 'available' ? '✅' : `— ${String(st.reason || '재료 없음').slice(0, 60)}`;
      }
    }
    rows.push({ id, label: p.label.ko, profile: p.evidenceProfile || '', prod, cells, sections });
  }
  // 생산자 있는 현상 먼저, 그다음 레지스트리 순서(=P0 감사표 순서)
  return rows.sort((a, b) => (b.prod ? 1 : 0) - (a.prod ? 1 : 0));
}

function markdown() {
  const rows = coverageRows();
  const sections = rows[0] ? rows[0].sections : [];
  const out = [];
  out.push('# 현상별 인텔리전스 5칸 표 (P6 완료 기준) — 2026-09-20');
  out.push('');
  out.push('> 생성: `node tools/earthus-v53/intel-coverage-table.mjs` — 손으로 고치지 않는다. 판정은 화면과 같은 `sectionStatus`.');
  out.push('> ✅ = 그 절의 재료가 패킷에 있다(띠에 질문이 뜬다) · — = 재료 없음(이유) · 생산자 없음 = 띠가 그려지지 않는다.');
  out.push('');
  const withProd = rows.filter((r) => r.prod).length;
  out.push(`intelligence:true **${rows.length}** 현상 중 패킷 생산자가 있는 것 **${withProd}** (운영 확인).`);
  out.push('');
  out.push(`| 현상 | 이름 | 생산자 | ${sections.join(' | ')} |`);
  out.push(`|---|---|---|${sections.map(() => '---').join('|')}|`);
  for (const r of rows) {
    const prod = r.prod ? `\`${r.prod.lambda}\` → \`${r.prod.doc}\`` : '생산자 없음';
    const cells = r.prod ? sections.map((s) => r.cells[s]) : sections.map(() => '');
    out.push(`| \`${r.id}\` | ${r.label} | ${prod} | ${cells.join(' | ')} |`);
  }
  out.push('');
  for (const r of rows.filter((x) => x.prod && x.prod.note)) out.push(`- \`${r.id}\`: ${r.prod.note}`);
  out.push('');
  out.push('## 다음 생산자 후보 (PD 우선순위 결정용)');
  out.push('');
  out.push('- `space.solar_activity`·`ocean.sea_observation`(부이) — 둘 다 `aws/ocean-solar` 가 쓰는 문서에 싣는 것이 자연스럽다. **그 파일에 다른 세션의 미커밋 수정(09-08, X선 0 채움 결측 수정)이 있어** 오늘 밤 손대지 않았다. 그 수정을 먼저 정리해야 한다.');
  out.push('- 공기질·파고 등 Open-Meteo 파생 현상 — 비상업 조항 결정(`docs/R0-OPEN-METEO-AUDIT-2026-09-20.md`) 전에는 공개 패킷을 늘리지 않는다.');
  out.push('- 나머지 — P0 감사표(`docs/INTEL-REAUDIT-2026-09-20.md`) 순서. 생산자가 생기기 전에는 띠가 없다(빈 띠 금지, 계약 §C-0).');
  return out.join('\n');
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  process.stdout.write(`${markdown()}\n`);
}
