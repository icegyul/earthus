// 위성 패널 — 그룹 선택 + 예정된 로켓 발사
//
// ⚠️ 발사는 원래 커뮤니티 "소식"에 있었다. 지진·분화와 같은 목록에 섞이면
//    무엇이 위험한지 구분이 안 된다. 발사는 경고가 아니라 예정된 일정이고,
//    궤도에 올라가는 것이므로 위성과 같은 화면에 있는 게 맞다 (§5-5).
import { orbits } from './layers/space.js';
import { SAT_GROUPS } from './layers/satcat.js';
import { store } from './store.js';
import { i18n } from './i18n.js';

const $ = s => document.querySelector(s);

export const satPanel = {
  /** 위성 시트를 연다.
   *
   * ⚠️ 여기서 레이어를 켠다. 예전에는 시트만 열리고 orbits 레이어는 꺼진 채였다 —
   *    그룹 체크박스는 켜져 있는데 지구에는 아무것도 안 나와서 "위성 기능 안 된다"는
   *    지적을 받았다. 그룹을 고르는 화면을 여는 것 = 위성을 보겠다는 뜻이다.
   */
  open() {
    document.getElementById('satSheet')?.classList.add('up');
    if (orbits.selected?.length && !store.isOn('orbits')) store.setLayer('orbits', true);
    this.renderStatus();
  },

  init() {
    const keep = document.getElementById('satKeep');
    if (keep) {
      keep.checked = orbits.keepVisible;
      keep.onchange = () => {
        orbits.setKeepVisible(keep.checked);
        // 지금 화면에 바로 반영되도록 가시성을 다시 계산한다
        import('./layers/registry.js').then(({ registry }) => registry.applyAll());
      };
    }
    this.render();
    this.renderLaunches();
    orbits.onChange(() => this.renderStatus());
    i18n.onChange(() => { this.render(); this.renderLaunches(); });
  },

  /* ── 예정된 발사 ────────────────────────────────────────────
     ⚠️ LL2 는 시간당 호출 한도가 빡빡하다(실측 429). 여기서 새로 받지 않고
        이미 레이어가 가진 목록을 쓴다. */
  async renderLaunches() {
    const box = document.getElementById('satLaunches');
    if (!box) return;
    const ko = i18n.lang === 'ko';
    const { upcomingLaunches } = await import('./community.js');
    const list = await upcomingLaunches(6);
    box.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'sl-head';
    head.textContent = ko ? '예정된 발사' : 'Upcoming launches';
    box.appendChild(head);

    if (!list.length) {
      const p = document.createElement('div');
      p.className = 'sl-empty';
      p.textContent = ko
        ? '발사 일정을 불러오지 못했습니다 (Launch Library 호출 한도).'
        : 'Could not load the launch schedule (Launch Library rate limit).';
      box.appendChild(p);
      return;
    }

    list.forEach(m => {
      const h = m.data._hoursOut;
      const soon = h != null && h <= 24;
      const row = document.createElement('button');
      row.className = 'sl-row' + (soon ? ' soon' : '');
      const when = h == null ? '—'
        : h < 1 ? (ko ? `${Math.round(h * 60)}분 뒤` : `in ${Math.round(h * 60)}m`)
        : h < 48 ? (ko ? `${Math.round(h)}시간 뒤` : `in ${Math.round(h)}h`)
        : (ko ? `${Math.round(h / 24)}일 뒤` : `in ${Math.round(h / 24)}d`);
      row.innerHTML = `<b>${m.name}</b>`
        + `<span>${m.data[i18n.t.F.pad] || '—'}</span>`
        + `<em>${when}</em>`;
      row.onclick = async () => {
        document.getElementById('satSheet').classList.remove('up');
        const { flyTo } = await import('./viewer.js');
        flyTo(m.lon, m.lat, 900_000);
        store.select(m);
      };
      box.appendChild(row);
    });

    const note = document.createElement('div');
    note.className = 'sl-note';
    note.textContent = ko
      ? '자료: The Space Devs (Launch Library 2). 발사 시각은 자주 변경됩니다 — 기관 공지가 정본입니다.'
      : 'Source: The Space Devs (Launch Library 2). Launch times change often — the agency notice is authoritative.';
    box.appendChild(note);
  },

  render() {
    const ko = i18n.lang === 'ko';
    const box = $('#satGroups');
    box.innerHTML = '';

    SAT_GROUPS.forEach(g => {
      const row = document.createElement('label');
      row.className = 'sat-row' + (g.heavy ? ' heavy' : '');

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = orbits.isSelected(g.id);
      cb.onchange = () => this.onToggle(g, cb);

      const name = document.createElement('span');
      name.className = 'sat-name';
      name.textContent = ko ? g.ko : g.en;

      const cnt = document.createElement('span');
      cnt.className = 'sat-cnt';
      cnt.textContent = g.est >= 1000 ? `~${Math.round(g.est / 1000)}k` : `~${g.est}`;

      const dot = document.createElement('i');
      dot.className = 'sat-dot';
      dot.style.background = g.color;

      row.append(cb, dot, name, cnt);
      box.appendChild(row);
    });
    this.renderStatus();
  },

  async onToggle(g, cb) {
    const ko = i18n.lang === 'ko';
    const next = cb.checked
      ? [...orbits.selected, g.id]
      : orbits.selected.filter(x => x !== g.id);

    /* 무거운 그룹(스타링크 8,000 / 전체 16,000)은 **2026-09-02부터 무료**다.
       Celestrak 카탈로그는 공개고 다른 앱도 다 보여준다 — 우리만 만드는 게 아니라 가둘 근거가 없다.
       ⚠️ 다만 무거운 건 여전히 사실이다. 유료 게이트만 없앴고 성능 보호는 그대로 둔다:
          ① 아래 확인 대화  ② renderStatus 의 기기별 표시 수 제한 고지.
          "무료로 풀었다"와 "아무 경고 없이 16,000개를 그린다"는 다른 말이다. */
    if (cb.checked && g.heavy) {
      const est = orbits.estimate(next);
      const msg = ko
        ? `${g.ko}는 위성이 약 ${g.est.toLocaleString()}개입니다.\n` +
          `모두 켜면 총 ${est.toLocaleString()}개가 되어 기기에 따라 화면이 버벅일 수 있습니다.\n\n` +
          `계속하시겠습니까?`
        : `${g.en} has roughly ${g.est.toLocaleString()} satellites.\n` +
          `Total would be ${est.toLocaleString()} — this may slow the display on some devices.\n\nContinue?`;
      if (!confirm(msg)) { cb.checked = false; return; }
    }

    await orbits.setGroups(next);
    /* 고른 그룹이 하나도 없으면 레이어를 끈다 — 켜져 있는데 아무것도 안 보이면
       고장으로 읽힌다. 하나라도 있으면 켠다. */
    store.setLayer('orbits', next.length > 0);
    this.renderStatus();
  },

  renderStatus() {
    const ko = i18n.lang === 'ko';
    const el = $('#satStatus');
    if (!el) return;
    if (orbits.loading) {
      el.textContent = ko ? '불러오는 중…' : 'Loading…';
      el.className = 'sat-status loading';
      return;
    }
    const n = orbits.sats.length;
    /* ⚠️ 기기 성능 때문에 잘렸으면 **반드시 그 사실을 적는다.**
       무료로 풀었다고 조용히 버려도 되는 게 아니다 — 켰는데 80%가 없으면 그건 속이는 것이다.
       실측: 위성 1개당 SGP4+좌표변환 0.006ms → 16,123개면 100ms 틱마다 99ms.
       그대로 두면 코어 하나를 통째로 문다. */
    if (orbits.satsCapped) {
      const total = (orbits.satsTotal || n).toLocaleString();
      el.textContent = ko
        ? `${total}개 중 ${n.toLocaleString()}개 표시 중 · 기기 성능에 맞춰 줄였습니다`
        : `${n.toLocaleString()} of ${total} shown · limited to what this device can run`;
      el.className = 'sat-status warn';
      el.title = ko
        ? '위성 하나를 초당 4번 다시 계산합니다. 전부 그리면 화면이 멈추고 기기가 뜨거워집니다.'
        : 'Each satellite is recomputed four times a second. Drawing them all would stall the display and heat the device.';
      return;
    }
    el.textContent = ko ? `${n.toLocaleString()}개 표시 중` : `${n.toLocaleString()} shown`;
    el.className = 'sat-status' + (n > 3000 ? ' warn' : '');
    el.title = '';
  },
};
