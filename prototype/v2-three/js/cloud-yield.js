// EARTHUS v2 — 색면이 주인공일 때 구름이 물러나는 규칙 (DEV-DIRECTIVE 2026-09-20 · 작업 E3 ②③ · B1 반박 검증)
//
// 무엇이 잘못돼 있었나 — 둘 다 main.js starLayers 가 'star === field' 하나만 보고 구름 불투명도를 0 으로 눌렀기 때문이다:
//   ② **죽은 토글.** 색면이 켜져 있는 동안 구름 단추를 누르면 모드는 바뀌는데(CloudManager 는 그 모드로 바뀐다)
//      다음 프레임에 불투명도가 도로 0 이 돼 화면은 그대로였다. 누를 수는 있는데 아무 일도 안 나는 단추다.
//   ③ **맨 지구.** 예보 범위 밖이거나 자료가 없으면 색면은 안 그려지는데(FieldLayer.hideDrawing) 구름은 그대로 0 이라,
//      화면에 색면도 구름도 없는 맨 지구만 남았다. '켜져 있다'와 '그려지고 있다'는 다른 말이다.
//
// 규칙 — 무대를 치우는 것은 **주인공이 실제로 무대에 있을 때**뿐이고, **사용자의 손이 늘 이긴다**:
//   · 색면이 그려지는 중 + 사용자가 구름을 직접 고르지 않았다 → 구름을 끈다(0). 흰 베일이 구간색을 바꿔 범례와 어긋나서다.
//   · 사용자가 구름 단추를 직접 눌렀다 → 그 뒤로는 물리지 않는다. 색면을 껐다 켜면 손자국을 지우고 다시 물린다.
//   · 색면이 안 그려지면 물리지 않는다(③).
//   · 입자(바람)만이면 옅게 남긴다 — 옛 규칙 그대로다.
//   어느 쪽이든 **화면에 말한다.** 말없이 남의 레이어를 끄거나 말없이 겹쳐 그리지 않는다.
//
// 화면이 한 말은 카드·메뉴 줄이 읽어 간다. 이 파일은 DOM 을 모르고 글자만 낸다 — 시험이 그대로 부른다.
// ⚠️ 매 프레임 불린다. 바뀐 것이 없으면 쥐고 있던 객체를 그대로 돌려준다(폰 발열 — 글자도 객체도 새로 짓지 않는다).

export const CLOUD_LEVEL = Object.freeze({ OFF: 'off', DIM: 'dim', FULL: 'full' });

/**
 * 지금 구름을 어떻게 할까 + 그 사실을 어떻게 말할까.
 *   star     'field' | 'wind' | null (LiveLayers.starLayer)
 *   drawing  그 색면이 **지금 실제로 그려지고 있나**(FieldLayer.isDrawing — 예보 범위 밖·자료 없음이면 거짓)
 *   manual   사용자가 구름을 직접 골랐나 · cloudsOn  그 손이 고른 것이 '끔'이 아닌가
 *   quantity 색면이 무엇인가 { ko, en } (FIELD_DESCRIPTORS[id].quantity) — 없으면 '색면'
 * → { level, note, yielded }
 */
export const cloudYieldFor = ({
  star = null, drawing = false, manual = false, cloudsOn = true, quantity = null, ko = true,
} = {}) => {
  const field = star === 'field';
  // ⚠️ cloudsOn 을 본다(2026-09-20 정정) — 사용자가 이미 구름을 꺼 둔 채로 색면을 켜면 우리는 아무것도 물린 것이 없다.
  //    그런데도 '구름을 숨겼습니다'라고 적으면 **하지 않은 일을 했다고 말하는 것**이다. v2 의 출처 줄은 '무엇을 왜 했는지'를
  //    말하는 자리라 그 한 줄이 곧 거짓 진술이 된다. level 은 어차피 화면에 차이가 없다 — 구름이 꺼져 있으면
  //    CloudManager.set('off') 가 mesh·precip·bolts 를 visible=false 로 두고 있어서 불투명도가 무엇이든 안 보인다.
  const yielded = field && !!drawing && !manual && !!cloudsOn;
  const level = yielded ? CLOUD_LEVEL.OFF : (star === 'wind' ? CLOUD_LEVEL.DIM : CLOUD_LEVEL.FULL);
  const name = quantity ? (ko ? quantity.ko : quantity.en) : (ko ? '색면' : 'this field');
  let note = null;
  if (yielded) {
    note = ko ? `${name} 색면을 보는 동안 구름을 숨겼습니다` : `Clouds hidden while the ${name} field is shown`;
  } else if (field && drawing && manual && cloudsOn) {
    // 손이 이긴 자리 — 그냥 두면 '왜 구름이 색을 덮지?' 가 된다. 겹쳐 보인다고 미리 말한다.
    note = ko ? `구름은 직접 켠 대로 둡니다 — ${name} 색면 위에 겹쳐 보입니다`
      : `Clouds kept as you set them — they overlap the ${name} field`;
  }
  return { level, note, yielded };
};

/**
 * 손자국을 기억하는 작은 상태. main.js 가 하나 만들어 매 프레임 read() 한다.
 * ⚠️ 색면이 하나도 없으면(star !== 'field') 손자국을 지운다 — "색면을 껐다 켜면 다시 물린다".
 *    색면을 **다른 색면으로 바꿀 때**도 한 프레임 star 가 null 을 지나므로 손자국이 지워진다(그것도 '껐다 켰다'로 친다).
 */
export function createCloudYield() {
  let manual = false;
  const out = { level: CLOUD_LEVEL.FULL, note: null, yielded: false };
  // 직전에 본 입력 — 하나라도 바뀌어야 글자를 다시 짓는다.
  let pStar = false; let pDraw = false; let pManual = false; let pOn = false; let pKo = false; let pName = false;
  return {
    /** 사용자가 구름 단추를 직접 눌렀다. 자동 전환(재생·스크럽·주소 복원·전부 끄기)에서는 부르지 않는다. */
    handPicked() { manual = true; },
    reset() { manual = false; },
    get manual() { return manual; },
    /** 마지막으로 셈한 것을 그대로 — 카드·메뉴 줄이 읽는 자리다. **아무것도 바꾸지 않는다**(read 는 손자국을 지울 수 있다). */
    peek() { return out; },
    read({ star = null, drawing = false, cloudsOn = true, quantity = null, ko = true } = {}) {
      if (star !== 'field') manual = false;
      const name = quantity || null;
      if (star === pStar && drawing === pDraw && manual === pManual && cloudsOn === pOn && ko === pKo && name === pName) return out;
      pStar = star; pDraw = drawing; pManual = manual; pOn = cloudsOn; pKo = ko; pName = name;
      const r = cloudYieldFor({ star, drawing, manual, cloudsOn, quantity: name, ko });
      out.level = r.level; out.note = r.note; out.yielded = r.yielded;
      return out;
    },
  };
}
