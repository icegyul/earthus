// 지진 단층 메커니즘 — "상하로 흔들렸나, 좌우로 어긋났나"
//
// ⚠️ 요약 피드(all_day/2.5_week)에는 이 정보가 없다. 상세 API 를 따로 불러야 한다.
//    게다가 모멘트 텐서는 큰 지진에만 계산된다 —
//    실측: 최근 일주일 규모 5.5 이상 4건 중 3건에만 있었다. 작은 지진은 대부분 없다.
//    → 없으면 "산출되지 않았다"고 정직하게 말한다. 지어내지 않는다.
//
// 판정 방법
//   모멘트 텐서의 rake(미끌림각)가 단층 종류를 결정한다. 지진학의 표준 분류다.
//     rake ≈  +90°  역단층   — 위아래로 밀어올림 (압축)
//     rake ≈  -90°  정단층   — 위아래로 떨어짐 (인장)
//     rake ≈ 0/180° 주향이동 — 좌우로 어긋남 (예: 산안드레아스)
//   그 사이는 빗겨나는 성분이 섞인 것이다.

import { i18n } from './i18n.js';
import { fetchT } from './net.js';

const cache = new Map();

/** rake(도) → 단층 종류 */
export function faultType(rake) {
  if (rake == null) return null;
  // -180~180 으로 정규화
  let r = ((rake + 180) % 360 + 360) % 360 - 180;
  const ko = i18n.lang === 'ko';
  const A = Math.abs(r);

  // 표준 분류 경계는 30°/60° 를 쓴다
  if (A <= 30) return {
    id: 'strike-slip',
    name: ko ? '주향이동 단층' : 'Strike-slip',
    motion: ko ? '좌우로 어긋남' : 'Horizontal sliding',
    detail: ko
      ? '두 지괴가 수평으로 스쳐 지나가며 어긋났습니다. 땅이 위아래보다 좌우로 흔들립니다. 산안드레아스 단층이 대표적입니다.'
      : 'Two blocks slid past each other horizontally — shaking is mostly side-to-side.',
  };
  if (A >= 150) return {
    id: 'strike-slip',
    name: ko ? '주향이동 단층' : 'Strike-slip',
    motion: ko ? '좌우로 어긋남 (반대 방향)' : 'Horizontal sliding (opposite sense)',
    detail: ko
      ? '두 지괴가 수평으로 스쳐 지나갔습니다. 위 경우와 어긋난 방향만 반대입니다.'
      : 'Horizontal sliding, opposite sense to the other strike-slip case.',
  };
  if (r > 30 && r < 150) return {
    id: 'reverse',
    name: ko ? '역단층 (충상)' : 'Reverse / thrust',
    motion: ko ? '위로 밀어올림' : 'Upward thrust',
    detail: ko
      ? '판이 서로 밀며 한쪽이 다른 쪽 위로 올라탔습니다. 압축력이 원인이고, 해저에서 일어나면 바닷물을 밀어올려 쓰나미를 만들 수 있습니다.'
      : 'Compression pushed one block up over the other. Undersea, this type can lift water and cause tsunamis.',
  };
  return {
    id: 'normal',
    name: ko ? '정단층' : 'Normal',
    motion: ko ? '아래로 떨어짐' : 'Downward drop',
    detail: ko
      ? '땅이 양쪽으로 벌어지며 가운데가 아래로 내려앉았습니다. 인장력이 원인이며 열곡대나 해령에서 흔합니다.'
      : 'The crust pulled apart and one block dropped. Common at rifts and mid-ocean ridges.',
  };
}

/** 두 절단면 중 더 대표적인 것을 고른다.
    ⚠️ 모멘트 텐서는 두 면 중 어느 쪽이 실제 단층인지 알려주지 못한다 (수학적으로 동등하다).
       그래서 둘 다 보여주되, 종류 판정은 첫 번째 면으로 한다. */
export async function fetchMechanism(detailUrl) {
  if (!detailUrl) return null;
  if (cache.has(detailUrl)) return cache.get(detailUrl);
  let out = null;
  try {
    const r = await fetchT(detailUrl, { timeout: 12_000 });
    if (r.ok) {
      const j = await r.json();
      const prods = j.properties?.products || {};
      const src = prods['moment-tensor']?.[0] || prods['focal-mechanism']?.[0];
      if (src) {
        const p = src.properties || {};
        const n = k => (p[k] != null ? Number(p[k]) : null);
        const rake1 = n('nodal-plane-1-rake');
        out = {
          type: faultType(rake1),
          plane1: { strike: n('nodal-plane-1-strike'), dip: n('nodal-plane-1-dip'), rake: rake1 },
          plane2: { strike: n('nodal-plane-2-strike'), dip: n('nodal-plane-2-dip'), rake: n('nodal-plane-2-rake') },
          depthKm: n('derived-depth') ?? n('depth'),
          // 단순 이중우력에 가까울수록 "깨끗한" 단층 운동이다
          doubleCouple: p['percent-double-couple'] != null
            ? Math.round(Number(p['percent-double-couple']) * 100) : null,
          magType: p['derived-magnitude-type'] || null,
        };
      }
    }
  } catch (_) { /* 실패해도 지진 정보 자체는 보여줘야 한다 */ }
  cache.set(detailUrl, out);
  return out;
}
