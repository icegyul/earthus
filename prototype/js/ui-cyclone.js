// 태풍 정보창 보강 — 도움 화면 · 원리 설명 · 관련 소식 · 공식 링크
//
// 받은 지시: "태풍을 누르면 정보창 하나 띄어주자. 태풍이 어떻게 발생했고,
//   방향이 왜 기상청마다 다른 이유, 기압배치를 더 디테일하게. 로딩바.
//   고기압 끝을 타고 이동한다는 이야기. 그 밑으로 각국 뉴스, 유튜브(NHK)."
//   + "도움되는 메뉴도 안에 넣어줘 — 기압배치와 그외 필요한거"
//
// ⚠️ 여기 설명은 **일반 기상 원리**다. 이 태풍에 대한 예보가 아니고,
//    그렇게 읽히지 않도록 각 절 머리에 못 박는다. 우리는 예보하지 않는다.
// ⚠️ CCTV 는 넣지 않았다 — 믿을 수 있는 공개 출처와 이용조건을 확인한 뒤에
//    넣는다. 확인 없이 링크만 걸면 죽은 화면이나 무단 송출로 이어진다.

import { store } from './store.js';
import { i18n } from './i18n.js';
import { API } from './config.js';
import { toast } from './ui.js';
import { drawThumb } from './layerbar.js';

const esc = (t) => String(t ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

function div(cls, html) {
  const n = document.createElement('div');
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}

/* ── 도움되는 화면 — 시트 안에서 바로 켠다 ──────────────────────────
   ⚠️ toggle 이 아니라 켜기/끄기를 버튼 상태로 보여준다.
      태풍을 읽는 데 실제로 쓰이는 레이어만 — 장식용 나열이 아니다.
        기압배치: 고기압 가장자리(태풍이 타는 길)가 보인다
        바람:     조향류가 보인다
        구름:     히마와리 — 태풍 본체가 보인다
        낙뢰:     최전선 대류가 보인다
   받은 요청: "지구 스타일 메뉴의 동그란 걸로 같은 걸로" —
   layerbar 의 drawThumb/그림을 그대로 써서 같은 동그라미로 그린다. */
const HELPERS = [
  { id: 'pressure',  ko: '기압배치', en: 'Pressure',  paint: 'pressure' },
  { id: 'wind',      ko: '바람',     en: 'Wind',      paint: 'wind' },
  { id: 'himawari',  ko: '히마와리', en: 'Himawari',  img: 'img/sat-himawari.png', flag: '🇯🇵' },
  { id: 'lightning', ko: '낙뢰',     en: 'Lightning', paint: 'quake' },
];

function helperBar(ko) {
  const bar = div('tc-chips');
  bar.appendChild(div('tc-chips-t', ko ? '같이 보면 좋은 화면' : 'Helpful layers'));
  const row = div('tc-lys');
  HELPERS.forEach(h => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ly' + (store.isOn?.(h.id) || store.layers?.[h.id] ? ' on' : '');
    if (h.img) {
      const im = document.createElement('img');
      im.className = 'ly-sat'; im.src = h.img; im.alt = ''; im.loading = 'lazy';
      b.appendChild(im);
    } else {
      const cv = document.createElement('canvas');
      drawThumb(cv, h.paint);
      b.appendChild(cv);
    }
    const n = div('ly-name');
    if (h.flag) {
      const fl = document.createElement('span');
      fl.className = 'ly-flag'; fl.textContent = h.flag;
      fl.setAttribute('aria-hidden', 'true');
      n.appendChild(fl);
    }
    n.appendChild(document.createTextNode(ko ? h.ko : h.en));
    b.appendChild(n);
    b.onclick = () => {
      const now = !(b.classList.contains('on'));
      store.setLayer(h.id, now);
      b.classList.toggle('on', now);
    };
    row.appendChild(b);
  });
  bar.appendChild(row);
  return bar;
}

/* ── 원리 설명 3절 — 접어 둔다. 펼치는 사람에게만 길다 ─────────────── */
function explainBlocks(ko) {
  const S = ko ? [
    ['태풍은 어떻게 생기나',
     '약 <b>26~27°C보다 따뜻한 바다</b>에서 증발한 수증기가 하늘에서 물방울로 돌아갈 때 ' +
     '큰 열을 내놓습니다. 그 열이 상승기류를 더 키우고, <b>지구 자전이 그 흐름에 회전</b>을 ' +
     '겁니다(북반구는 반시계). 적도 바로 근처(±5°)에서는 이 회전력이 0이라 태풍이 아예 ' +
     '생기지 않습니다.'],
    ['어디로 움직이나 — 고기압 가장자리를 탄다',
     '여름 서태평양에는 <b>북태평양 고기압</b>이 벽처럼 자리 잡습니다. 태풍은 그 벽을 뚫지 ' +
     '못하고 <b>가장자리를 따라 돕니다</b> — 남쪽 가장자리에서는 서~북서쪽으로, 서쪽 ' +
     '가장자리를 돌면서 북쪽으로, 그러다 중위도의 편서풍을 만나면 북동쪽으로 방향을 ' +
     '틉니다. 위의 「기압배치」를 켜면 이 벽이 화면에 보입니다.'],
    ['왜 기관마다 진로가 다른가',
     '태풍이 며칠 뒤 어디로 갈지는 <b>그때의 고기압·저기압 배치</b>에 달려 있습니다. ' +
     '각 예보센터의 수치모델이 이 배치를 조금씩 다르게 계산하기 때문에, 고기압 ' +
     '가장자리의 위치가 달라지고 진로가 갈립니다. 그래서 이 화면은 여러 기관의 선을 ' +
     '<b>그대로 겹쳐</b> 보여줍니다 — 평균 내지 않습니다. 선이 벌어져 있을수록 ' +
     '불확실하다는 뜻입니다.'],
  ] : [
    ['How a typhoon forms',
     'Water evaporating from sea warmer than about <b>26–27°C</b> releases heat as it ' +
     'condenses aloft, strengthening the updraft, and <b>Earth’s rotation spins the flow</b> ' +
     '(counter-clockwise in the north). Within ~5° of the equator that spin is zero, so ' +
     'typhoons never form there.'],
    ['Where it goes — riding the edge of a high',
     'In summer the <b>North Pacific High</b> sits like a wall. A typhoon cannot cross it; ' +
     'it <b>rides the edge</b> — west to north-west along the southern rim, turning north ' +
     'around the western rim, then north-east once it meets the mid-latitude westerlies. ' +
     'Turn on “Pressure” above to see the wall.'],
    ['Why agencies disagree',
     'Where the storm goes depends on <b>where the highs and lows will be</b> in a few ' +
     'days. Each centre’s model computes that layout slightly differently, so the edge — ' +
     'and the track — shifts. We overlay every agency’s line <b>as is</b> and never ' +
     'average them; the wider they spread, the less certain the track.'],
  ];
  const wrap = div('tc-exp');
  wrap.appendChild(div('sheet-note',
    ko ? '⚠️ 아래는 일반 원리 설명입니다. 이 태풍에 대한 예보가 아닙니다 — 실제 대응은 기상청 발표를 따르세요.'
       : '⚠️ General principles, not a forecast for this storm — follow official warnings.'));
  S.forEach(([t, body]) => {
    const d = document.createElement('details');
    d.className = 'tc-fold';
    d.innerHTML = `<summary>${t}</summary><p>${body}</p>`;
    wrap.appendChild(d);
  });
  return wrap;
}

/* ── 이 태풍 소식 — 이미 모아 둔 각국 헤드라인에서 이름으로 찾는다 ──
   ⚠️ 라이선스: 수집분 자체가 헤드라인·링크만이다. 본문을 옮기지 않는다.
   ⚠️ 이름이 제목에 없으면 없다고 적는다 — 다른 태풍 기사를 채워 넣지 않는다.
      (일본 매체는 "台風9号"처럼 번호로 부르는 일이 많아 이름 검색이 못 잡는다.
       그건 우리 검색의 한계라서, 한계를 그대로 적는다.) */
function newsBlock(s, ko) {
  const wrap = div('tc-news');
  wrap.appendChild(div('tc-chips-t', ko ? `「${s.name}」 소식` : `News on “${s.name}”`));
  const body = div('tc-news-b', `<p class="sheet-note">${ko ? '찾는 중…' : 'Searching…'}</p>`);
  wrap.appendChild(body);
  // ⚠️ 자리는 지금 잡고 내용은 나중에 채운다 — 뉴스 때문에 시트가 늦게 뜨면 안 된다
  (async () => {
    try {
      const r = await fetch(`${API.EVENTS}/regional-news.json`, { cache: 'no-cache' });
      const d = await r.json();
      const items = (d.items || []).filter(a =>
        (a.title || '').toUpperCase().includes(String(s.name || '').toUpperCase()));
      if (!items.length) {
        body.innerHTML = `<p class="sheet-note">${ko
          ? '수집한 헤드라인 중 이 태풍의 이름이 제목에 든 기사가 아직 없습니다. ' +
            '(일본 매체는 태풍을 번호로 불러 이름 검색에 안 잡히기도 합니다)'
          : 'No collected headline mentions this storm’s name yet. ' +
            '(Japanese media often number typhoons, which name search misses.)'}</p>`;
        return;
      }
      body.innerHTML = items.slice(0, 5).map(a =>
        `<a class="tc-news-i" href="${esc(a.link)}" target="_blank" rel="noopener">
           <span>${esc(a.source)} · ${esc(a.region || '')}</span>${esc(a.title)}</a>`).join('');
    } catch (_) {
      body.innerHTML = `<p class="sheet-note">${ko ? '소식을 불러오지 못했습니다.' : 'Could not load news.'}</p>`;
    }
  })();
  return wrap;
}

/* ── 공식 링크 — 밖으로 나가는 문은 공식 기관과 공식 방송만 ────────── */
function linksBlock(ko) {
  const L = [
    [ko ? '한국 기상청 태풍정보' : 'KMA typhoon page', 'https://www.weather.go.kr/w/typhoon/typ-fcst.do'],
    [ko ? '일본 기상청 태풍정보' : 'JMA typhoon page', 'https://www.jma.go.jp/bosai/map.html#contents=typhoon'],
    [ko ? 'NHK World 실시간 방송' : 'NHK World live', 'https://www3.nhk.or.jp/nhkworld/en/live/'],
  ];
  const wrap = div('tc-links');
  wrap.appendChild(div('tc-chips-t', ko ? '공식 창구' : 'Official links'));
  wrap.appendChild(div('tc-links-b', L.map(([t, u]) =>
    `<a href="${u}" target="_blank" rel="noopener">${t} ↗</a>`).join('')));
  return wrap;
}

/* ── 공유 링크 ────────────────────────────────────────────────────
   받은 지시: "공유버튼 누르면 복붙해서 다른 사람이 그걸 보고 태풍정보 볼 수 있게"
   주소는 ?tc=이름 — 이름은 통보문마다 같아서 링크가 며칠 살아 있다.
   ⚠️ 태풍이 끝나 목록에서 빠지면 링크는 그냥 지구만 연다. 죽은 링크에
      "태풍이 있다"고 말하지 않는 것이 맞다. */
function shareRow(s, ko) {
  const wrap = div('tc-share');
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'tc-chip tc-share-b';
  b.textContent = ko ? '🔗 이 태풍 공유 링크 복사' : '🔗 Copy share link';
  b.onclick = async () => {
    const url = `${location.origin}${location.pathname}?tc=${encodeURIComponent(s.name)}`;
    // 폰이면 공유창, 아니면 복사 — 흐름을 끊지 않는 쪽으로
    if (navigator.share) {
      try { await navigator.share({ title: `태풍 ${s.name} — earthus`, url }); return; }
      catch (_) { /* 사용자가 닫음 → 복사로 이어간다 */ }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast(ko ? '링크를 복사했습니다. 붙여넣어 공유하세요.' : 'Link copied.');
    } catch (_) {
      // 클립보드 권한이 없으면 주소를 그대로 보여 준다 — 조용히 실패하지 않는다
      toast(url);
    }
  };
  wrap.appendChild(b);
  return wrap;
}

/** ?tc=이름 으로 들어온 사람을 그 태풍 앞에 세운다 (boot 에서 부른다) */
export async function openSharedCyclone() {
  const name = new URLSearchParams(location.search).get('tc');
  if (!name) return;
  store.setLayer('cyclone', true);
  const { cyclones } = await import('./layers/cyclone.js');
  // 목록은 비동기로 온다 — 최대 20초 기다린다
  const t0 = Date.now();
  while (Date.now() - t0 < 20_000) {
    const s = (cyclones.list || []).find(x =>
      (x.name || '').toUpperCase() === name.toUpperCase());
    if (s) {
      const { viewer } = await import('./viewer.js');
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(s.lon, s.lat + 1, 2_800_000),
        duration: 2.2,
      });
      store.select({ id: `tc-${s.id}`, kind: 'cyclone', name: s.name,
                     lat: s.lat, lon: s.lon, _tc: s });
      return;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  const ko = i18n.lang === 'ko';
  toast(ko ? `태풍 「${name}」 은 지금 관측 목록에 없습니다.`
           : `Storm “${name}” is not in the current list.`);
}

/** 태풍 상세 시트 아래쪽에 전부 붙인다.
 *  순서는 받은 지시대로 — 공유 → 도움 화면 → 설명 → 뉴스 → 방송·링크. */
export function renderCycloneExtras(host, s) {
  const ko = i18n.lang === 'ko';
  host.appendChild(shareRow(s, ko));
  host.appendChild(helperBar(ko));
  host.appendChild(explainBlocks(ko));
  host.appendChild(newsBlock(s, ko));
  host.appendChild(linksBlock(ko));
}
