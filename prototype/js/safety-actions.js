/* 한국 재난 상세의 다음 행동.
 *
 * ⚠️ 행동요령을 우리가 요약해 지어내지 않고 행정안전부 공식 페이지로 보낸다.
 * ⚠️ 119·112는 한국 번호다. 전 세계 재난을 다루는 앱이므로 버튼과 안내에
 *    반드시 '한국'을 적어 해외 긴급번호로 오해하지 않게 한다.
 */

import { i18n } from './i18n.js';

export const SAFETY_GUIDE_URL =
  'https://nmepv.safekorea.go.kr/safekorea-kor/acts/nacts/nationalActionTips.do?menuSn=2003';
export const JAPAN_SAFETY_GUIDE_URL = 'https://www.bousai.go.jp/kyoiku/gensai/index_en.html';

function regionOf({ country, lat, lon } = {}) {
  if (country === 'kr' || country === 'jp') return country;
  if (lat == null || lon == null) return 'other';
  /* 한국을 먼저 판정한다. 일본의 넓은 도서 범위(123~146E)가 제주·독도까지
     품으므로 순서를 바꾸면 한국 사건이 일본 번호로 나온다. */
  if (lat >= 32.5 && lat <= 39 && lon >= 124 && lon <= 132.5) return 'kr';
  if (lat >= 24 && lat <= 46 && lon >= 123 && lon <= 146) return 'jp';
  return 'other';
}

export function safetyActions(context = {}) {
  const ko = i18n.lang === 'ko';
  const region = regionOf(context);
  const section = document.createElement('section');
  section.className = 'safety-actions';
  section.setAttribute('aria-label', ko ? '재난 행동과 긴급전화' : 'Safety guidance and emergency calls');

  const title = document.createElement('strong');
  title.textContent = ko ? '필요한 다음 행동' : 'What to do next';
  section.appendChild(title);

  const actions = document.createElement('div');
  actions.className = 'safety-action-grid';
  const link = (href, label, cls = '') => {
    const a = document.createElement('a');
    a.className = `safety-action ${cls}`.trim();
    a.href = href;
    a.textContent = label;
    if (href.startsWith('http')) {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
    return a;
  };
  if (region === 'kr') {
    actions.appendChild(link(SAFETY_GUIDE_URL,
      ko ? '행정안전부 국민행동요령 ↗' : 'Korea official safety guide ↗', 'guide'));
    actions.appendChild(link('tel:119', ko ? '한국 119 긴급구조' : 'Korea 119 rescue', 'emergency'));
    actions.appendChild(link('tel:112', ko ? '한국 112 경찰신고' : 'Korea 112 police', 'police'));
  } else if (region === 'jp') {
    actions.appendChild(link(JAPAN_SAFETY_GUIDE_URL,
      ko ? '일본 내각부 다국어 방재 안내 ↗' : 'Japan Cabinet Office safety guide ↗', 'guide'));
    actions.appendChild(link('tel:119', ko ? '일본 119 화재·구급' : 'Japan 119 fire · ambulance', 'emergency'));
    actions.appendChild(link('tel:110', ko ? '일본 110 경찰' : 'Japan 110 police', 'police'));
  }
  if (actions.childElementCount) section.appendChild(actions);

  const note = document.createElement('p');
  note.textContent = region === 'kr'
    ? (ko ? '전화 버튼은 한국 번호입니다. 한국 밖에서는 현지 긴급번호와 당국 발표를 따르세요.'
          : 'These are Korean numbers. Outside Korea, use local emergency numbers and follow local authorities.')
    : region === 'jp'
      ? (ko ? '전화 버튼은 일본 번호입니다. 일본 밖에서는 현지 긴급번호와 당국 발표를 따르세요.'
            : 'These are Japanese numbers. Outside Japan, use local emergency numbers and follow local authorities.')
      : (ko ? '이 지역의 긴급번호를 임의로 표시하지 않습니다. 현지 당국 발표와 현지 긴급번호를 따르세요.'
            : 'No emergency number is guessed for this location. Follow local authorities and use the local emergency number.');
  section.appendChild(note);
  return section;
}
