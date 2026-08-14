// 항공편 패널 — 예약 · 예상 항로 · 내 비행기 추적
//
// 흐름
//   1) 출발/도착 공항을 고른다 → 대권항로와 거리·소요시간이 바로 나온다 (계산만, 네트워크 불필요)
//   2) 예매는 판매처로 넘긴다 — 우리는 항공권을 팔지 않는다
//   3) 탑승일에 편명 숫자를 넣으면 항로 위의 후보를 찾아준다 → 내 비행기를 고른다
//   4) 고른 뒤에는 그 기체만 추적한다
//
// ⚠️ 3번에서 우리가 자동으로 확정하지 않는 이유는 flight.js 머리말에 적어두었다.
//    요약: 편명→호출부호 변환표가 금방 낡아 엉뚱한 비행기를 잡을 수 있다.

import { i18n } from './i18n.js';
import { toast } from './ui.js';
import { flyTo } from './viewer.js';
import { myFlight } from './layers/myflight.js';
import {
  airports, search, byIata, greatCircle, distanceKm, roughDuration,
  progressAlong, tracker, bookingLinks,
} from './flight.js';

const $ = s => document.querySelector(s);
const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };

const LS = 'earthus.myflight';

export const flightPanel = {
  list: null,
  from: null,
  to: null,
  date: new Date().toISOString().slice(0, 10),
  candidates: null,

  async init() {
    myFlight.init();
    tracker.onChange(() => {
      myFlight.draw(tracker.flight, tracker.state, tracker.trace);
      if ($('#flightSheet')?.classList.contains('up')) this.render();
    });
    // 지난번에 추적하던 편이 있으면 복구한다 (앱을 껐다 켜도 이어진다)
    try {
      const saved = JSON.parse(localStorage.getItem(LS) || 'null');
      if (saved?.hex && Date.now() - saved.at < 24 * 3600e3) {
        this.from = saved.from; this.to = saved.to;
        await tracker.start(saved);
      }
    } catch (_) { /* 저장값이 깨졌으면 무시 */ }
    i18n.onChange(() => { if ($('#flightSheet')?.classList.contains('up')) this.render(); });
    return this;
  },

  async open() {
    $('#flightSheet').classList.add('up');
    this.render();
    if (!this.list) {
      try { this.list = await airports(); }
      catch (e) { console.warn('[airports]', e.message); }
      this.render();
    }
  },
  close() { $('#flightSheet').classList.remove('up'); },

  render() {
    const ko = i18n.lang === 'ko';
    const body = $('#flightBody');
    if (!body) return;
    body.innerHTML = '';
    $('#flightTitle').textContent = ko ? '항공편' : 'Flights';

    if (tracker.flight) { body.appendChild(this.trackingBlock(ko)); return; }

    body.appendChild(this.pickerBlock(ko));
    if (this.from && this.to) {
      body.appendChild(this.routeBlock(ko));
      body.appendChild(this.bookBlock(ko));
      body.appendChild(this.findBlock(ko));
    }
  },

  /* ── 공항 선택 ─────────────────────────────────────────────── */
  pickerBlock(ko) {
    const wrap = el('section', 'sky-sec');
    wrap.appendChild(el('h4', null, ko ? '어디에서 어디로' : 'Route'));
    if (!this.list) {
      wrap.appendChild(el('p', 'sky-dim', ko ? '공항 목록 불러오는 중…' : 'Loading airports…'));
      return wrap;
    }

    [['from', ko ? '출발' : 'From'], ['to', ko ? '도착' : 'To']].forEach(([key, label]) => {
      const row = el('div', 'ap-row');
      row.appendChild(el('label', 'ap-lab', label));

      const cur = this[key];
      if (cur) {
        const chip = el('button', 'ap-chip',
          `<b>${cur.iata}</b> ${cur.city || cur.name} <span>×</span>`);
        chip.onclick = () => { this[key] = null; this.candidates = null; this.render(); };
        row.appendChild(chip);
      } else {
        const inp = el('input', 'ap-input');
        inp.placeholder = ko ? '도시 또는 공항 코드 (예: 인천, ICN)' : 'City or airport code (e.g. ICN)';
        const res = el('div', 'ap-results');
        inp.oninput = () => {
          res.innerHTML = '';
          search(this.list, inp.value).forEach(a => {
            const b = el('button', 'ap-opt',
              `<b>${a.iata}</b><span>${a.city || '—'} · ${a.name}</span><em>${a.cc}</em>`);
            b.onclick = () => { this[key] = a; this.candidates = null; this.render(); };
            res.appendChild(b);
          });
        };
        row.append(inp, res);
      }
      wrap.appendChild(row);
    });
    return wrap;
  },

  /* ── 예상 항로 ─────────────────────────────────────────────── */
  routeBlock(ko) {
    const wrap = el('section', 'sky-sec');
    const km = distanceKm(this.from, this.to);
    const d = roughDuration(km);

    wrap.appendChild(el('h4', null, ko ? '예상 항로' : 'Expected route'));
    const dl = el('dl', 'sky-rows');
    const add = (k, v) => { dl.appendChild(el('dt', null, k)); dl.appendChild(el('dd', null, v)); };
    add(ko ? '구간' : 'Route', `${this.from.iata} → ${this.to.iata}`);
    add(ko ? '대권 거리' : 'Great-circle distance', `${Math.round(km).toLocaleString()} km`);
    add(ko ? '예상 소요' : 'Rough duration',
      ko ? `약 ${d.hours}시간 ${d.minutes}분` : `about ${d.hours}h ${d.minutes}m`);
    wrap.appendChild(dl);

    const btn = el('button', 'btn-secondary', ko ? '지구본에 항로 그리기' : 'Draw route on globe');
    btn.onclick = () => {
      myFlight.draw({ from: this.from, to: this.to }, null);
      const mid = greatCircle(this.from, this.to, 2)[1];
      flyTo(mid.lon, mid.lat, Math.max(3_000_000, km * 900));
      this.close();
    };
    wrap.appendChild(btn);

    wrap.appendChild(el('p', 'sky-note', ko
      ? '표시 경로 · 대권항로 · 소요시간 계산: 순항 860km/h+이착륙 여유 · 실제 운항: 제트기류·영공·항로점 반영'
      : 'Display · great-circle path · duration: 860 km/h cruise plus ground time · operations reflect jet streams, airspace and waypoints'));
    return wrap;
  },

  /* ── 예약 ──────────────────────────────────────────────────── */
  bookBlock(ko) {
    const wrap = el('section', 'sky-sec');
    wrap.appendChild(el('h4', null, ko ? '예약' : 'Booking'));

    const dwrap = el('div', 'ap-row');
    dwrap.appendChild(el('label', 'ap-lab', ko ? '탑승일' : 'Date'));
    const di = el('input', 'ap-input');
    di.type = 'date'; di.value = this.date;
    di.onchange = () => { this.date = di.value; this.render(); };
    dwrap.appendChild(di);
    wrap.appendChild(dwrap);

    const links = bookingLinks(this.from, this.to, this.date);
    links.forEach(l => {
      const a = el('a', 'book-link', `<b>${l.name}</b><span>${l.note}</span>`
        + (l.affiliate ? `<i class="aff">${ko ? '제휴' : 'ad'}</i>` : '') + `<em>↗</em>`);
      a.href = l.url; a.target = '_blank';
      // 제휴 링크에도 noopener — 새 탭이 우리 창을 조작하지 못하게 한다
      a.rel = l.affiliate ? 'noopener sponsored' : 'noopener';
      wrap.appendChild(a);
    });

    /* ⚠️ 두 가지를 다 밝힌다. 하나라도 빠지면 문제가 된다.
         · 우리가 판매자가 아니라는 것 (안 쓰면 환불 요구가 우리에게 온다)
         · 수수료를 받는다는 것 (표시광고법·FTC 가 요구한다. '제휴' 배지 + 문구) */
    const affiliated = links.some(l => l.affiliate);
    wrap.appendChild(el('p', 'sky-note', ko
      ? '연결 방식 · 외부 판매처 · 예약·결제·환불은 판매처와 항공사 약관 적용'
        + (affiliated
          ? ' 제휴 수수료 · 「제휴」 링크 예약 성사 시 수령 · 정렬 기준과 분리'
          : '')
      : 'Link type · external seller · booking, payment and refunds follow seller and airline terms.'
        + (affiliated
          ? ' Affiliate fee · earned on completed bookings through “ad” links · separate from sort order.'
          : '')));
    return wrap;
  },

  /* ── 내 비행기 찾기 ────────────────────────────────────────── */
  findBlock(ko) {
    const wrap = el('section', 'sky-sec');
    wrap.appendChild(el('h4', null, ko ? '탑승했다면 — 내 비행기 추적' : 'Boarded? Track your flight'));
    wrap.appendChild(el('p', 'sky-dim', ko
      ? '무료입니다. 편명을 넣으면 찾아드립니다 (예: KE081 또는 관제 호출부호 KAL081).'
      : 'Free. Enter your flight number (e.g. KE081, or the ATC callsign KAL081).'));

    const row = el('div', 'ap-row');
    row.appendChild(el('label', 'ap-lab', ko ? '편명' : 'Flight'));
    const inp = el('input', 'ap-input');
    inp.placeholder = ko ? '예: KE081 또는 081' : 'e.g. KE081 or 081';
    inp.id = 'flNum';
    row.appendChild(inp);
    wrap.appendChild(row);

    const btn = el('button', 'btn-primary', ko ? '내 비행기 찾기' : 'Find my aircraft');
    btn.onclick = () => this.find(inp.value);
    wrap.appendChild(btn);

    if (this.candidates) {
      if (!this.candidates.length) {
        wrap.appendChild(el('p', 'sky-dim', ko
          ? '검색 결과 0건 · 미출발·수신 범위·호출부호 확인'
          : 'Search result 0 · check departure, receiver coverage and callsign'));
      } else {
        wrap.appendChild(el('p', 'sky-dim', ko
          ? '아래에서 내 비행기를 고르세요. 고른 뒤에는 그 기체만 추적합니다.'
          : 'Pick yours. After that we track only that aircraft.'));
        this.candidates.forEach(c => {
          const card = el('button', 'cand');
          const alt = c.alt != null ? `${Math.round(c.alt).toLocaleString()} m` : '—';
          const spd = c.vel != null ? `${Math.round(c.vel * 3.6)} km/h` : '—';
          card.innerHTML = `<b>${c.callsign || c.hex}</b>`
            + `<span>${c.type || '—'}${c.reg ? ' · ' + c.reg : ''} · ${ko ? '고도' : 'alt'} ${alt} · ${spd}</span>`
            + `<em>${c.lat.toFixed(1)},${c.lon.toFixed(1)}</em>`;
          card.onclick = () => this.choose(c);
          wrap.appendChild(card);
        });
      }
    }

    wrap.appendChild(el('p', 'sky-note', ko
      ? '출처 · adsb.lol 자원봉사 ADS-B 수신망(ODbL 1.0) · 대양·극지 수신 공백 · 마지막 수신 위치·경과시간 표시 · 30초 갱신'
      : 'Source · adsb.lol volunteer ADS-B network (ODbL 1.0) · ocean/polar coverage gaps · last reception and age shown · 30 s refresh'));
    return wrap;
  },

  async find(raw) {
    const ko = i18n.lang === 'ko';
    const q = String(raw || '').trim().toUpperCase();
    if (!q) { toast(ko ? '편명을 입력하세요' : 'Enter the flight number'); return; }
    this.candidates = null; this.render();
    try {
      /* 항로 중간 지점을 함께 넘긴다.
         KE081 처럼 IATA 편명을 넣은 경우 그 주변에서 숫자가 같은 것을 찾는다. */
      const mid = this.from && this.to
        ? { lat: (this.from.lat + this.to.lat) / 2, lon: (this.from.lon + this.to.lon) / 2 }
        : null;
      this.candidates = await tracker.find(q, mid);
      // 하나만 나오면 바로 확정한다 — 고를 게 없는데 고르라고 할 이유가 없다
      if (this.candidates.length === 1) { this.choose(this.candidates[0]); return; }
    } catch (e) {
      this.candidates = [];
      if (e.message === 'THROTTLED') {
        toast(ko ? 'adsb.lol 조회가 일시적으로 제한되었습니다' : 'adsb.lol is throttling requests');
      } else if (e.message === 'FLIGHT_PROXY_NOT_CONFIGURED') {
        toast(ko ? '추적 서버가 아직 연결되지 않았습니다' : 'Tracking server not connected');
      } else {
        toast((ko ? '조회 실패: ' : 'Lookup failed: ') + e.message);
      }
    }
    this.render();
  },

  async choose(c) {
    const f = {
      from: this.from, to: this.to,
      num: $('#flNum')?.value || c.callsign,
      callsign: c.callsign, hex: c.hex,
      reg: c.reg, type: c.type,
      at: Date.now(),
    };
    localStorage.setItem(LS, JSON.stringify(f));
    tracker.state = c;
    await tracker.start(f);
    myFlight.draw(f, c, tracker.trace);
    flyTo(c.lon, c.lat, 2_600_000);
    this.candidates = null;
    this.render();
  },

  /* ── 추적 중 ───────────────────────────────────────────────── */
  trackingBlock(ko) {
    const wrap = el('section', 'sky-sec');
    const f = tracker.flight, s = tracker.state;
    wrap.appendChild(el('h4', null, ko ? '추적 중' : 'Tracking'));

    const head = el('div', 'tr-head');
    head.innerHTML = `<b>${f.callsign || f.num}</b>`
      + `<span>${f.from.iata} → ${f.to.iata}</span>`;
    wrap.appendChild(head);

    if (s) {
      const prog = progressAlong(f.from, f.to, s);
      const left = distanceKm(s, f.to);
      const bar = el('div', 'dm-progress');
      bar.innerHTML = `<div class="dm-bar"><i style="width:${Math.round(prog * 100)}%"></i></div>`
        + `<div class="dm-num">${Math.round(prog * 100)}% · ${ko ? '남은 거리' : 'remaining'} ${Math.round(left).toLocaleString()} km</div>`;
      wrap.appendChild(bar);

      const dl = el('dl', 'sky-rows');
      const add = (k, v) => { dl.appendChild(el('dt', null, k)); dl.appendChild(el('dd', null, v)); };
      add(ko ? '현재 위치' : 'Position', `${s.lat.toFixed(3)}, ${s.lon.toFixed(3)}`);
      add(ko ? '고도' : 'Altitude', s.alt != null ? `${Math.round(s.alt).toLocaleString()} m` : '—');
      add(ko ? '대지속도' : 'Ground speed', s.vel != null ? `${Math.round(s.vel * 3.6)} km/h` : '—');
      if (s.track != null) add(ko ? '진행 방향' : 'Heading', `${Math.round(s.track)}°`);
      if (s.vrate != null && Math.abs(s.vrate) > 0.5) {
        add(ko ? '상승/하강' : 'Vertical', `${s.vrate > 0 ? '▲' : '▼'} ${Math.abs(Math.round(s.vrate * 60))} m/min`);
      }
      if (s.onGround) add(ko ? '상태' : 'State', ko ? '지상' : 'On ground');
      const age = tracker.ageMin();
      if (age != null) {
        add(ko ? '마지막 수신' : 'Last seen',
          age < 1 ? (ko ? '방금' : 'just now') : (ko ? `${age}분 전` : `${age} min ago`));
      }
      if (s.reg) add(ko ? '등록번호' : 'Registration', s.reg);
      if (s.type) add(ko ? '기종' : 'Aircraft type', s.desc || s.type);
      if (s.squawk) add(ko ? '스쿼크' : 'Squawk', s.squawk);
      /* ⚠️ 비상 코드는 절대 가공하지 않고 그대로 보여준다.
         7700 일반비상 / 7600 통신두절 / 7500 납치 (§4-11) */
      if (s.emergency) {
        add(ko ? ' 비상 신호' : ' Emergency', s.emergency);
      }
      add(ko ? '기체 주소' : 'ICAO address', (s.hex || '').toUpperCase());
      wrap.appendChild(dl);
    } else {
      wrap.appendChild(el('p', 'sky-dim', ko ? '위치를 기다리는 중…' : 'Waiting for a position…'));
    }

    /* 신호 없음은 오류가 아니다. 그렇게 설명한다. */
    if (tracker.error === 'NO_SIGNAL') {
      wrap.appendChild(el('div', 'tr-warn', ko
        ? '지금은 신호가 잡히지 않습니다. 대양·극지 상공이거나 착륙 후일 수 있습니다. 위에 보이는 위치는 마지막으로 수신된 지점입니다.'
        : 'No signal right now — likely over ocean/polar airspace, or already landed. The position above is the last one received.'));
    } else if (tracker.error === 'CREDITS_EXHAUSTED') {
      wrap.appendChild(el('div', 'tr-warn', ko
        ? '오늘 조회 한도를 다 썼습니다. 위치 갱신이 내일까지 멈춥니다.'
        : 'Daily query limit reached — position updates pause until tomorrow.'));
    } else if (tracker.error) {
      wrap.appendChild(el('div', 'tr-warn', (ko ? '갱신 실패: ' : 'Update failed: ') + tracker.error));
    }

    /* 고도 색 범례 — 항적 색이 무슨 뜻인지 알려준다 */
    if (tracker.trace?.length) {
      const lg = el('div', 'alt-legend');
      lg.innerHTML = `<div class="al-t">${ko ? '항적 색 = 고도' : 'Trail colour = altitude'}</div>`
        + `<div class="al-bar">${myFlight.legend().map(x =>
            `<i style="background:${x.color}"></i>`).join('')}</div>`
        + `<div class="al-nums"><span>0</span><span>6km</span><span>12km+</span></div>`;
      wrap.appendChild(lg);
      wrap.appendChild(el('p', 'sky-note', ko
        ? `실제 항적 ${tracker.trace.length}점을 그렸습니다 (원본 ${tracker.traceMeta?.raw ?? '—'}점에서 추림). 고도는 눈에 보이도록 ${myFlight.altExaggeration}배 과장해 띄웠습니다 — 순항 11km 는 지구 반지름의 0.17% 라 실제 비율로는 지표에 붙어 보입니다. 수신이 끊긴 구간은 선을 잇지 않습니다.`
        : `Drawing ${tracker.trace.length} real trail points (thinned from ${tracker.traceMeta?.raw ?? '—'}). Altitude is exaggerated ${myFlight.altExaggeration}× to be visible — 11 km cruise is 0.17% of Earth's radius. Gaps in reception are left unjoined.`));
    }
    if (tracker.attribution) {
      wrap.appendChild(el('p', 'sky-note attrib', tracker.attribution));
    }

    const fly = el('button', 'btn-secondary', ko ? '비행기로 이동' : 'Go to aircraft');
    fly.onclick = () => { if (s) { flyTo(s.lon, s.lat, 2_200_000); this.close(); } };
    wrap.appendChild(fly);

    const stop = el('button', 'btn-secondary danger', ko ? '추적 끝내기' : 'Stop tracking');
    stop.onclick = () => {
      localStorage.removeItem(LS);
      tracker.clear();
      myFlight.clear();
      this.candidates = null;
      this.render();
    };
    wrap.appendChild(stop);
    return wrap;
  },
};
