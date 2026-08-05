/* 한국 재난 상세의 다음 행동.
 *
 * ⚠️ 행동요령을 우리가 요약해 지어내지 않고 행정안전부 공식 페이지로 보낸다.
 * ⚠️ 119·112는 한국 번호다. 전 세계 재난을 다루는 앱이므로 버튼과 안내에
 *    반드시 '한국'을 적어 해외 긴급번호로 오해하지 않게 한다.
 */

import { i18n } from './i18n.js';

export const SAFETY_GUIDE_URL =
  'https://nmepv.safekorea.go.kr/safekorea-kor/acts/nacts/nationalActionTips.do?menuSn=2003';

export function safetyActions() {
  const ko = i18n.lang === 'ko';
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
  actions.appendChild(link(SAFETY_GUIDE_URL,
    ko ? '행정안전부 국민행동요령 ↗' : 'Korea official safety guide ↗', 'guide'));
  actions.appendChild(link('tel:119', ko ? '한국 119 긴급구조' : 'Korea 119 rescue', 'emergency'));
  actions.appendChild(link('tel:112', ko ? '한국 112 경찰신고' : 'Korea 112 police', 'police'));
  section.appendChild(actions);

  const note = document.createElement('p');
  note.textContent = ko
    ? '전화 버튼은 한국 번호입니다. 해외에서는 현지 긴급번호와 당국 발표를 따르세요.'
    : 'These call buttons use Korean numbers. Outside Korea, use the local emergency number and follow local authorities.';
  section.appendChild(note);
  return section;
}
