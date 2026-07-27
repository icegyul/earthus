// 일식 식심(greatest eclipse) 지점 표시
//
// 무엇을 그리고, 무엇을 안 그리는가
//   그린다   → 식심 지점 하나. NASA 목록에 실린 실제 좌표다.
//   그린다   → **개기대(금환대) 띠와 중심선.** NASA GSFC 경로표의 실제 좌표다.
//               (전에는 "자료가 없다"고 안 그렸는데, 다시 찾아보니 있었다.
//                eclipse-path Lambda 가 받아 S3 에 둔다.)
//   안 그린다 → 폭(km)만으로 만든 원 같은 근사. 실제 띠와 전혀 다르게 읽힌다.
//
// ⚠️⚠️ 라벨이 "개기일식 · 17일 뒤" 뿐이면 **그 자리에서 보라는 말로 읽힌다.**
//    식심 지점은 대개 바다 한가운데다 (2026-08-12 는 아이슬란드 서쪽 대서양).
//    "이건 개기일식을 바다에서 보라는 거야?"라는 지적을 실제로 받았고, 맞는 지적이다.
//    그래서 라벨에 두 가지를 반드시 넣는다:
//      1) 이 점이 **식심 지점**이라는 것 (관측지가 아니다)
//      2) 개기식이 **실제로 지나가는 지역** — 자료에 central 로 들어 있다
//    지나가는 지역까지 보여줘야 "그럼 어디로 가야 하나"에 답이 된다.
//
// 다음 3개만 띄운다. 10년치를 다 찍으면 지구가 점으로 덮이고,
// 5년 뒤 일식은 "지금 볼 것"이 아니다.

import { viewer } from '../viewer.js';
import { i18n } from '../i18n.js';
import { mapLabel } from '../maplabel.js';
import { SOLAR_ECLIPSES, ECLIPSE_TYPE } from '../sky.js';
import { eclipsePaths, bandQuads, centerLine } from '../eclipsepath.js';

const SHOW = 3;

/** 개기식이 지나는 지역을 라벨에 넣을 만큼만 줄인다.
    ⚠️ 원문을 번역하지 않는다. NASA 표기를 그대로 쓴다 —
       나라 이름을 어설프게 옮기면 어디인지 더 헷갈린다. */
function centralShort(central, n = 3) {
  const parts = String(central || '').split(',').map(t => t.trim()).filter(Boolean);
  if (!parts.length) return null;
  const head = parts.slice(0, n).join(', ');
  return parts.length > n ? `${head} …` : head;
}

/** 지구 위 라벨.
    ⚠️ 첫 줄에 "식심"을 반드시 넣는다. 이게 빠지면 "여기서 보라"로 읽힌다. */
function labelText(e, T, dn, near, ko) {
  const when = ko ? `${dn}일 뒤` : `in ${dn}d`;
  const head = ko ? `${T.ko} 식심 · ${when}` : `${T.en} · greatest pt · ${when}`;
  // 가장 가까운 일식만 두 번째 줄까지 — 전부 넣으면 지구가 글자로 덮인다
  if (!near) return head;
  const where = centralShort(e.central);
  if (!where) return head;
  return `${head}\n${ko ? '개기식 통과: ' : 'Path crosses: '}${where}`;
}

export const eclipseMarks = {
  ds: null,

  init() {
    this.ds = new Cesium.CustomDataSource('eclipse');
    viewer.dataSources.add(this.ds);
    this.ds.show = false;
    this.draw();
    return this;
  },

  set(on) {
    if (this.ds) this.ds.show = on;
    // ⚠️ 켤 때 받는다. 시작할 때 미리 받으면 안 쓸 사람에게도 내려받게 된다.
    if (on && !eclipsePaths.loaded) {
      eclipsePaths.load().then(() => this.draw()).catch(() => {});
    }
  },

  draw() {
    if (!this.ds) return;
    this.ds.entities.removeAll();
    const ko = i18n.lang === 'ko';
    const now = Date.now();

    SOLAR_ECLIPSES
      .filter(e => new Date(e.date).getTime() > now)
      .slice(0, SHOW)
      .forEach((e, i) => {
        const T = ECLIPSE_TYPE[e.type];
        const col = Cesium.Color.fromCssColorString(T.color);
        const at = new Date(e.date);
        const dn = Math.round((at - now) / 86400e3);
        // 가장 가까운 것만 진하게 — 그 다음 것들은 참고용이다
        const near = i === 0;

        this.ds.entities.add({
          id: `ecl:${e.date}`,
          position: Cesium.Cartesian3.fromDegrees(e.lon, e.lat),
          point: {
            pixelSize: near ? 11 : 7,
            color: col.withAlpha(near ? 0.9 : 0.45),
            outlineColor: Cesium.Color.WHITE.withAlpha(near ? 0.7 : 0.25),
            outlineWidth: near ? 2 : 1,
            disableDepthTestDistance: 600_000,
          },
          label: mapLabel({
            text: labelText(e, T, dn, near, ko),
            color: col.withAlpha(near ? 1 : 0.65), size: 'sm', offsetY: -20,
            maxDistance: 40_000_000,
          }),
          _meta: {
            id: `ecl-${e.date}`, kind: 'eclipse',
            name: ko ? T.ko : `${T.en} solar eclipse`,
            lat: e.lat, lon: e.lon, _ecl: e,
          },
          _layer: 'eclipse',
        });

        // ── 개기대 띠 + 중심선 ──
        this.drawPath(e, T, col, near, ko);
      });
  },

  /** 실제 개기대를 그린다. 자료가 없으면 아무것도 안 그린다 (근사하지 않는다). */
  drawPath(e, T, col, near, ko) {
    const p = e.slug ? eclipsePaths.get(e.slug) : null;
    if (!p?.rows?.length) return;

    /* 띠 — 구간마다 사각형. ⚠️ 하나의 폴리곤으로 이으면 극지에서 꼬인다.
       실측: 2026-08-12 의 17:06 행은 "남쪽 한계선"이 북쪽보다 더 북쪽이다. */
    const fill = col.withAlpha(near ? 0.30 : 0.13);
    bandQuads(p.rows).forEach((q, k) => {
      this.ds.entities.add({
        id: `ecl:${e.date}:band${k}`,
        polygon: {
          hierarchy: Cesium.Cartesian3.fromDegreesArray(q),
          material: fill,
          height: 0,          // 지면에 붙인다 — 정적이라 재생성이 없다
          /* ⚠️ 외곽선을 켜면 사각형 경계가 격자처럼 보인다.
             띠는 하나로 읽혀야 하므로 채움만 쓰고, 경계는 아래 한계선으로 그린다. */
          outline: false,
        },
        _meta: {
          id: `ecl-${e.date}`, kind: 'eclipse',
          name: ko ? `${T.ko} 개기대` : `${T.en} path`,
          lat: e.lat, lon: e.lon, _ecl: e, _area: true,
        },
        _layer: 'eclipse',
      });
    });

    /* 중심선 — 가장 오래 보이는 선. 띠 안에서 어디가 최적인지 알려준다. */
    const line = centerLine(p.rows);
    if (line.length >= 4) {
      this.ds.entities.add({
        id: `ecl:${e.date}:center`,
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArray(line),
          width: near ? 2.4 : 1.4,
          material: new Cesium.ColorMaterialProperty(col.withAlpha(near ? 0.95 : 0.4)),
          // ⚠️ clampToGround 금지 — GroundPolyline 은 비싸고 깜빡임을 만든다
          arcType: Cesium.ArcType.GEODESIC,
        },
        _meta: {
          id: `ecl-${e.date}`, kind: 'eclipse',
          name: ko ? `${T.ko} 중심선` : `${T.en} central line`,
          lat: e.lat, lon: e.lon, _ecl: e, _area: true,
        },
        _layer: 'eclipse',
      });
    }
  },
};
