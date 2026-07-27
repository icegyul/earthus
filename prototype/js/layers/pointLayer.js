// 점 레이어 공통 헬퍼 — 클러스터링 + 줌 임계 + 뷰포트 로딩 (§5-1, §5-10)
import { viewer } from '../viewer.js';
import { store } from '../store.js';
import { T, C } from '../config.js';
import { mapLabel } from '../maplabel.js';
import { power } from '../power.js';

/* ── 파문의 수명 ───────────────────────────────────────────────
   ⚠️⚠️ 여기 숫자들이 발열을 결정한다. 바꿀 때 이유를 읽고 바꿀 것.

   파문이 하는 일은 "여기서 방금 무언가 났다"고 알리는 것이다.
   그런데 예전에는 최근 **24시간** 지진 전부에 파문을 붙이고 영구히 돌렸다.
   실측: 규모 4.0+ 22건에 파문 66개, 나이는 1.9~21.7시간.
         21시간 전 지진이 계속 맥동했다 — 알릴 것이 없는데 알리고 있었다.
         파문마다 CallbackProperty 4개, 그중 semiMajorAxis 는 매 프레임
         ellipse 지오메트리를 다시 만든다. 초당 약 2,000회. 폰이 뜨거워진다.

   그래서 셋을 건다.
     1) 나이 제한 — 오래된 사건에는 파문 대신 정적인 원을 그린다
     2) 개수 상한 — 동시에 이 개수까지만
     3) 수명      — 이 시간이 지나면 파문을 걷고 정적인 원으로 바꾼다
   셋이 다 지나면 애니메이션이 0개가 되고, 지구는 실제로 쉰다.
   (requestRenderMode 를 켜둔 목적이 그것이다.) */
const RIPPLE_MS = 2600;          // 한 번 퍼지는 주기
const RIPPLE_LIFE_MS = 24_000;   // 이만큼만 움직인다
const RIPPLE_MAX_AGE_MIN = 90;   // 이보다 오래된 사건은 처음부터 정적으로
const RIPPLE_MAX = 6;            // 동시 파문 상한

export class PointLayer {
  /**
   * @param {object} o
   *  id        레이어 id
   *  color     점 색상
   *  radius    점 크기
   *  pulse     맥동 여부 (이벤트용)
   *  globalOK  전지구 뷰에서도 보일지 여부를 판단하는 함수 (meta)=>bool. 없으면 국가급부터.
   *  cluster   클러스터링 사용 여부
   */
  /* 파문 — 같은 자리에서 시차를 두고 퍼지는 원 3개.
     주기(RIPPLE_MS)를 셋으로 나눠 겹치게 하면 끊김 없이 계속 퍼진다. */
  _addRipples(m, color, r, meta, layerId) {
    const N = 3;
    // 규모가 클수록 멀리 퍼진다. m.rippleKm 이 있으면 그걸 쓴다.
    const maxM = (m.rippleKm ?? 220) * 1000;

    /* ── 파문을 붙일 자격이 있는가 ──
       ⚠️ 자격이 없으면 아무것도 안 그리는 게 아니라 **정적인 원**을 그린다.
          "여기서 이만큼 규모의 일이 있었다"는 정보는 남기고 움직임만 뺀다. */
    const at = m.at ?? m.data?._time;
    const ageMin = at != null ? (Date.now() - at) / 60_000 : 0;
    if (ageMin > RIPPLE_MAX_AGE_MIN || this._rippleN >= RIPPLE_MAX) {
      this._staticRing(m, color, maxM, meta, layerId);
      return;
    }
    this._rippleN = (this._rippleN || 0) + 1;

    for (let i = 0; i < N; i++) {
      const phase = (i / N) * RIPPLE_MS;
      const t = () => ((Date.now() + phase) % RIPPLE_MS) / RIPPLE_MS;   // 0→1
      this.ds.entities.add({
        id: `${this.id}:${m.id}:ripple${i}`,
        position: Cesium.Cartesian3.fromDegrees(m.lon, m.lat),
        ellipse: {
          semiMajorAxis: new Cesium.CallbackProperty(() => 1 + t() * maxM, false),
          semiMinorAxis: new Cesium.CallbackProperty(() => 1 + t() * maxM, false),
          material: new Cesium.ColorMaterialProperty(
            new Cesium.CallbackProperty(() => color.withAlpha(0.20 * (1 - t())), false)),
          outline: true,
          outlineColor: new Cesium.CallbackProperty(
            () => color.withAlpha(0.75 * (1 - t())), false),
          outlineWidth: 2,
          height: 0,
        },
        /* ⚠️ 파문은 마커 위에 그려져서 클릭을 가로챈다.
           _meta 를 안 주면 "빈 곳 탭"으로 처리돼 엉뚱한 창이 뜬다 (실제로 그랬다).
           주인의 _meta 를 그대로 물려주면 파문을 눌러도 주인 정보가 열리고,
           덤으로 탭 영역이 넓어져 손가락으로 누르기 쉬워진다. */
        _meta: meta,
        _layer: layerId,
        _ripple: true,
      });
    }

    /* 이 시간만 그린다. 지나면 스스로 정적으로 바뀐다 — 아무도 안 깨워주면 멈춘다. */
    power.animate(RIPPLE_LIFE_MS);
    setTimeout(() => this._retireRipples(m, color, maxM, meta, layerId), RIPPLE_LIFE_MS);
  }

  /** 파문을 걷고 정적인 원으로 바꾼다.
      ⚠️ 그 사이 setData() 가 다시 불려 엔티티가 사라졌을 수 있다 —
         없으면 조용히 넘어간다 (없는 걸 지우려다 터지면 안 된다). */
  _retireRipples(m, color, maxM, meta, layerId) {
    let removed = 0;
    for (let i = 0; i < 3; i++) {
      const e = this.ds.entities.getById(`${this.id}:${m.id}:ripple${i}`);
      if (e) { this.ds.entities.remove(e); removed++; }
    }
    if (!removed) return;                    // 이미 새로 그려졌다 — 건드리지 않는다
    this._rippleN = Math.max(0, (this._rippleN || 1) - 1);
    this._staticRing(m, color, maxM, meta, layerId);
    // 지운 것이 화면에서 사라지는 걸 한 번은 그려줘야 한다
    power.animate(120);
  }

  /** 정적인 원 — 움직이지 않는다. CallbackProperty 를 쓰지 않는 것이 핵심이다. */
  _staticRing(m, color, maxM, meta, layerId) {
    const id = `${this.id}:${m.id}:ring`;
    if (this.ds.entities.getById(id)) return;
    this.ds.entities.add({
      id,
      position: Cesium.Cartesian3.fromDegrees(m.lon, m.lat),
      ellipse: {
        semiMajorAxis: maxM * 0.62,
        semiMinorAxis: maxM * 0.62,
        material: color.withAlpha(0.05),
        outline: true,
        outlineColor: color.withAlpha(0.3),
        outlineWidth: 1.5,
        height: 0,
      },
      _meta: meta,
      _layer: layerId,
      _ripple: true,
    });
  }

  constructor(o) {
    Object.assign(this, {
      radius: 5, pulse: false, cluster: true, globalOK: null, ...o,
    });
    this.ds = new Cesium.CustomDataSource(this.id);
    viewer.dataSources.add(this.ds);
    this.items = [];

    if (this.cluster) {
      const cl = this.ds.clustering;
      cl.enabled = true;
      cl.pixelRange = 46;
      cl.minimumClusterSize = 2;
      cl.clusterEvent.addEventListener((entities, cluster) => {
        cluster.billboard.show = false;
        cluster.point.show = true;
        cluster.label.show = true;
        cluster.point.pixelSize = 19 + Math.min(entities.length, 14);
        cluster.point.color = Cesium.Color.fromCssColorString(this.color).withAlpha(0.2);
        cluster.point.outlineColor = Cesium.Color.fromCssColorString(this.color);
        cluster.point.outlineWidth = 1.4;
        cluster.point.disableDepthTestDistance = Number.POSITIVE_INFINITY;
        cluster.label.text = String(entities.length);
        cluster.label.font = '500 12px ui-monospace, SFMono-Regular, Menlo, monospace';
        cluster.label.fillColor = Cesium.Color.WHITE;
        cluster.label.pixelOffset = new Cesium.Cartesian2(0, 0);
        cluster.label.verticalOrigin = Cesium.VerticalOrigin.CENTER;
        cluster.label.horizontalOrigin = Cesium.HorizontalOrigin.CENTER;
        cluster.label.disableDepthTestDistance = Number.POSITIVE_INFINITY;
        cluster._isCluster = true;
      });
    }
  }

  /** meta: { id, name, lat, lon, kind, data:{}, radius?, color?, alwaysGlobal? } */
  setData(list) {
    this.ds.entities.removeAll();
    this.items = list;
    /* ⚠️ 파문 개수 상한은 setData() 마다 다시 센다.
       안 그러면 갱신이 반복될수록 카운터가 올라가 파문이 아예 안 붙는다. */
    this._rippleN = 0;
    /* 최신 사건이 먼저 파문을 받게 한다 — 상한에 걸릴 때 오래된 것이
       자리를 차지하면 "방금 난 일"에 파문이 없어진다. */
    if (list.some(m => (m.at ?? m.data?._time) != null)) {
      list = [...list].sort((a, b) =>
        ((b.at ?? b.data?._time) || 0) - ((a.at ?? a.data?._time) || 0));
    }
    list.forEach(m => {
      const color = Cesium.Color.fromCssColorString(m.color || this.color);
      const r = m.radius || this.radius;
      const pulse = m.pulse ?? this.pulse;
      /* ⚠️ 이벤트(지진·화산·태풍)는 점만으로는 "무슨 일이 났다"가 안 읽힌다.
         파문이 퍼지는 원을 겹쳐 그린다 — 셋을 시차를 두고 퍼뜨리면
         자연히 "여기서 무언가 터졌다"로 읽힌다.
         ⚠️ ellipse 를 쓰면 지표에 붙어 지구 뒤편에서 가려진다 (점과 동작이 같다).
            반경은 규모에 비례시켜 큰 지진이 크게 퍼지게 한다. */
      if (pulse) this._addRipples(m, color, r, m, this.id);

      this.ds.entities.add({
        id: `${this.id}:${m.id}`,
        position: Cesium.Cartesian3.fromDegrees(m.lon, m.lat),
        point: {
          pixelSize: pulse
            ? new Cesium.CallbackProperty(() => r + Math.sin(Date.now() / 340) * 3.2, false)
            : r,
          color,
          outlineColor: color.withAlpha(pulse ? 0.3 : 0.25),
          outlineWidth: pulse ? 9 : 3,
          // ⚠️ Infinity 를 쓰면 지구 반대편 핀이 뚫고 보인다
          //    (증상: 아르헨티나 지진이 한국 상공에서 보임).
          //    유한값을 쓰면 "카메라가 이 거리보다 가까울 때만" 깊이검사를 끈다:
          //      전지구 뷰(수만 km) → 깊이검사 ON  → 뒤편 핀 가려짐 ✓
          //      근접 뷰(수백 km)   → 깊이검사 OFF → 지표와 z-fighting 없음 ✓
          disableDepthTestDistance: 600_000,
        },
        /* 핀 이름 — 배경 알약을 깐다.
           위성사진 위에 흰 글자만 얹으면 밝은 지형(사막·설원)에서 안 읽힌다. */
        label: mapLabel({
          text: m.name, color: Cesium.Color.WHITE.withAlpha(0.95),
          size: 'sm', weight: 400, offsetY: -17,
          // 라벨은 개별 전개 구간에서만 — 클러스터 구간에선 숨김
          maxDistance: T.EXPAND * 2.4,
        }),
        _meta: m,
        _layer: this.id,
      });
    });
    this.applyVisibility();
  }

  /** 줌 임계 + 레이어 토글 반영 (§5-10) */
  applyVisibility() {
    const layerOn = store.isOn(this.id);
    const pinsOn = store.pinsVisible();

    if (!layerOn) { this.ds.show = false; return; }

    /* ⚠️ 파문 엔티티는 _meta 가 없다. globalOK 에 넘기면 터진다 (실제로 터졌다).
       파문은 주인 핀을 따라가야 하므로, 주인의 표시 여부를 그대로 물려준다. */
    // 파문도 주인과 같은 _meta 를 갖고 있어 같은 규칙으로 처리된다
    if (this.globalOK && !pinsOn) {
      this.ds.show = true;
      this.ds.entities.values.forEach(e => { e.show = !!(e._meta && this.globalOK(e._meta)); });
    } else {
      this.ds.show = pinsOn;
      this.ds.entities.values.forEach(e => { e.show = true; });
    }

    if (this.cluster) {
      const want = store.cluster && pinsOn;
      if (this.ds.clustering.enabled !== want) this.ds.clustering.enabled = want;
    }
  }

  count() {
    if (!this.ds.show) return 0;
    return this.ds.entities.values.filter(e => e.show !== false).length;
  }

  destroy() { viewer.dataSources.remove(this.ds, true); }
}
