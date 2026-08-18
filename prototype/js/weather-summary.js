// 내 위치 날씨의 첫 문장을 만드는 순수 함수.
//
// ⚠️ 여기는 "재미있는 문장"을 만드는 곳이 아니라 공식 예보를 사람이 빨리 읽게
//    줄이는 곳이다. 원인·영향을 추측하지 않고 SKY·PTY·POP·PCP와 시각만 옮긴다.

import { condText } from './kma-fcst.js';

const dayKey = tm => String(tm || '').slice(0, 8);
const hourOf = tm => Number(String(tm || '').slice(8, 10));

function kstDayKey(at = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(at));
  const get = type => parts.find(p => p.type === type)?.value || '';
  return `${get('year')}${get('month')}${get('day')}`;
}

function addDays(key, amount) {
  if (!/^\d{8}$/.test(key)) return '';
  const d = new Date(`${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}T00:00:00+09:00`);
  d.setUTCDate(d.getUTCDate() + amount);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d).replaceAll('-', '');
}

function dateLabel(key, ko) {
  if (!/^\d{8}$/.test(key)) return ko ? '예보일' : 'Forecast';
  return ko ? `${Number(key.slice(4, 6))}월 ${Number(key.slice(6, 8))}일`
    : `${key.slice(4, 6)}/${key.slice(6, 8)}`;
}

/** 기상청 SKY·PTY 아이콘. PTY가 있으면 하늘 상태보다 먼저 보인다. */
export function kmaWeatherSymbol(sky, pty) {
  if ([2, 6].includes(Number(pty))) return '🌨️';
  if ([3, 7].includes(Number(pty))) return '❄️';
  if ([1, 4, 5].includes(Number(pty))) return '🌧️';
  if (Number(sky) === 1) return '☀️';
  if (Number(sky) === 3) return '🌤️';
  return '☁️';
}

/** WMO weather code 아이콘 — 기상청을 못 받는 지역의 폴백용. */
export function wmoWeatherSymbol(code) {
  const c = Number(code);
  if (c === 0) return '☀️';
  if ([1, 2].includes(c)) return '🌤️';
  if (c === 3 || [45, 48].includes(c)) return '☁️';
  if ((c >= 71 && c <= 77) || [85, 86].includes(c)) return '❄️';
  if (c >= 95) return '⛈️';
  if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) return '🌧️';
  return '☁️';
}

function wetKind(hours) {
  const values = hours.map(h => Number(h.pty || 0)).filter(Boolean);
  if (!values.length) return 0;
  if (values.some(v => v === 2 || v === 6)) return 2;
  if (values.some(v => v === 3 || v === 7)) return 3;
  if (values.some(v => v === 4)) return 4;
  if (values.some(v => v === 1)) return 1;
  return values[0];
}

function dominantSky(hours) {
  const counts = new Map();
  hours.forEach(h => {
    const sky = Number(h.sky || 0);
    if (sky) counts.set(sky, (counts.get(sky) || 0) + 1);
  });
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] || Number(hours[0]?.sky || 0);
}

function wetWindowGroups(hours) {
  const wet = hours.filter(h => Number(h.pty || 0) > 0).map(h => hourOf(h.tm));
  if (!wet.length) return [];
  const groups = [];
  wet.forEach(hour => {
    const last = groups[groups.length - 1];
    if (last && hour === last[1] + 1) last[1] = hour;
    else groups.push([hour, hour]);
  });
  return groups;
}

function wetWindows(groups) {
  return groups.map(([start, end]) => start === end
    ? `${String(start).padStart(2, '0')}시`
    : `${String(start).padStart(2, '0')}~${String(end).padStart(2, '0')}시`);
}

function koHour(hour) {
  if (hour === 0) return '자정';
  if (hour < 6) return `새벽 ${hour}시`;
  if (hour < 12) return `오전 ${hour}시`;
  if (hour === 12) return '정오';
  if (hour < 18) return `오후 ${hour - 12}시`;
  if (hour < 21) return `저녁 ${hour - 12}시`;
  return `밤 ${hour - 12}시`;
}

function koWindow([start, end]) {
  return start === end ? koHour(start) : `${koHour(start)}부터 ${koHour(end)}까지`;
}

function koSubject(word) {
  const last = String(word || '').slice(-1).charCodeAt(0);
  const batchim = last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0;
  return `${word}${batchim ? '이' : '가'}`;
}

function wetHeadline(label, condition, groups, ko) {
  if (!ko) return `${label}: ${condition} is forecast`;
  const lead = label === '오늘' || label === '내일' ? `${label}은` : `${label}에는`;
  const phrases = groups.map(koWindow);
  if (phrases.length === 1) return `${lead} ${phrases[0]} ${condition} 예보가 있습니다`;
  if (phrases.length === 2 && groups.every(([start, end]) => start === end)) {
    return `${lead} ${phrases[0]}와 ${phrases[1]}에 ${condition} 예보가 있습니다`;
  }
  return `${lead} ${phrases[0]} ${koSubject(condition)} 이어지고, `
    + `${phrases.slice(1).join(' · ')}에 다시 예보됩니다`;
}

function maxHourlyPcp(hours) {
  const measured = hours.map(h => {
    if (typeof h.pcp === 'number') return { value: h.pcp, text: `${h.pcp}mm` };
    const match = String(h.pcp || '').match(/([\d.]+)\s*mm/i);
    return match ? { value: Number(match[1]), text: String(h.pcp).replace(/\s+/g, '') } : null;
  }).filter(x => x && x.value > 0).sort((a, b) => b.value - a.value);
  return measured[0]?.text || '';
}

function summaryForDay(kma, key, label, ko) {
  const hours = (kma.hours || []).filter(h => dayKey(h.tm) === key);
  if (!hours.length) return null;
  const wet = wetKind(hours);
  const sky = dominantSky(hours);
  const condition = condText(sky, wet, ko);
  const maxPop = Math.max(...hours.map(h => Number(h.pop || 0)));
  const windowGroups = wetWindowGroups(hours);
  const windows = wetWindows(windowGroups);
  const pcp = maxHourlyPcp(hours.filter(h => Number(h.pty || 0) > 0));
  const dd = kma.days?.[key] || {};
  const headline = wet
    ? wetHeadline(label, condition, windowGroups, ko)
    : (ko ? `${label}은 ${condition}입니다` : `${label}: ${condition}`);
  const details = [];
  if (Number.isFinite(maxPop)) details.push(ko ? `강수확률 최고 ${maxPop}%` : `rain chance up to ${maxPop}%`);
  if (pcp) details.push(ko ? `한 시간 강수량 최대 ${pcp}` : `hourly precip up to ${pcp}`);
  return {
    key, label, headline, detail: details.join(ko ? ' · ' : ' · '),
    icon: kmaWeatherSymbol(sky, wet), condition, maxPop, windows,
    tmin: dd.tmin, tmax: dd.tmax, hours,
  };
}

/** 오늘·내일을 같은 규칙으로 요약한다. nowMs 주입은 회귀 테스트용이다. */
export function summarizeKma(kma, ko = true, nowMs = Date.now()) {
  const keys = [...new Set((kma?.hours || []).map(h => dayKey(h.tm)).filter(Boolean))].sort();
  if (!keys.length) return { today: null, tomorrow: null };
  const actualToday = kstDayKey(nowMs);
  const key = keys.includes(actualToday) ? actualToday : keys[0];
  const todayLabel = key === actualToday ? (ko ? '오늘' : 'Today') : dateLabel(key, ko);
  const expectedTomorrow = addDays(actualToday, 1);
  const nextKey = keys.find(k => k > key) || '';
  const nextLabel = nextKey === expectedTomorrow
    ? (ko ? '내일' : 'Tomorrow')
    : dateLabel(nextKey, ko);
  return {
    today: summaryForDay(kma, key, todayLabel, ko),
    tomorrow: nextKey ? summaryForDay(kma, nextKey, nextLabel, ko) : null,
  };
}
