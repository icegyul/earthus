// 라이브 영상 임베드 — 인수인계 §5-4
//
// 지침
//   로켓 발사  → LL2 가 준 공식 스트림 URL 을 유튜브 iframe 으로 임베드.
//                임베드는 유튜브가 공식 제공하는 기능이라 저작권 문제가 없다.
//   자연재난   → 통합 API 가 없다. 기관 채널을 화이트리스트로 두고 그 채널의
//                라이브를 임베드한다.
//   분쟁 뉴스  → ❌ 단일 임베드 금지. 특정 매체를 앱이 골라 틀면 "공식 중계"로 오인된다.
//
// ⚠️ 유튜브 URL 형태가 여러 가지다. 하나만 처리하면 임베드가 조용히 실패한다.
//    watch?v= / youtu.be/ / live/ / embed/ / @채널 라이브 — 전부 다르게 다뤄야 한다.
//
// ⚠️ 채널 라이브(@handle/live)는 방송 중이 아니면 빈 화면이 된다.
//    그래서 "지금 방송 중"을 보장할 수 없는 경우엔 임베드 대신 링크로 둔다.
//    빈 플레이어를 라이브라고 보여주면 앱을 못 믿게 된다.

import { i18n } from './i18n.js';

/** 유튜브 URL → 임베드 주소. 임베드할 수 없으면 null. */
export function youtubeEmbed(url) {
  if (!url) return null;
  let m;
  // https://www.youtube.com/watch?v=ID
  if ((m = url.match(/[?&]v=([\w-]{6,})/))) return embedFor(m[1]);
  // https://youtu.be/ID
  if ((m = url.match(/youtu\.be\/([\w-]{6,})/))) return embedFor(m[1]);
  // https://www.youtube.com/live/ID
  if ((m = url.match(/youtube\.com\/live\/([\w-]{6,})/))) return embedFor(m[1]);
  // 이미 embed 형태
  if ((m = url.match(/youtube\.com\/embed\/([\w-]{6,})/))) return embedFor(m[1]);
  return null;   // 채널 주소 등 — 특정 영상이 아니면 임베드하지 않는다
}

function embedFor(id) {
  // youtube-nocookie: 재생 전까지 추적 쿠키를 심지 않는다 (개인정보처리방침과도 맞다)
  return `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1`;
}

/** 다른 플랫폼도 알아두면 좋다 — 지금은 유튜브만 임베드한다 */
export function platformOf(url) {
  if (!url) return null;
  if (/youtube\.com|youtu\.be/.test(url)) return 'youtube';
  if (/twitch\.tv/.test(url)) return 'twitch';
  if (/nasa\.gov/.test(url)) return 'nasa';
  return 'other';
}

/**
 * 시트에 넣을 라이브 블록을 만든다.
 * @param url    스트림 URL
 * @param label  제목 (예: "발사 생중계")
 * @returns HTMLElement | null
 */
export function makeLiveBlock(url, label) {
  const ko = i18n.lang === 'ko';
  const embed = youtubeEmbed(url);
  const box = document.createElement('div');
  box.className = 'live';

  if (embed) {
    box.innerHTML = `
      <div class="lv-t"><span class="lv-dot"></span>${label || (ko ? '공식 생중계' : 'Official live')}</div>
      <div class="lv-frame">
        <iframe src="${embed}" title="${label || 'live'}" loading="lazy"
          allow="accelerometer; encrypted-media; picture-in-picture; web-share"
          allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
      </div>
      <a class="lv-open" href="${url}" target="_blank" rel="noopener">
        ${ko ? '유튜브에서 열기 ↗' : 'Open on YouTube ↗'}</a>`;
    return box;
  }

  // 임베드 불가 — 링크로 둔다. 빈 플레이어를 보여주지 않는다.
  if (url) {
    box.innerHTML = `
      <div class="lv-t"><span class="lv-dot"></span>${label || (ko ? '공식 생중계' : 'Official live')}</div>
      <a class="lv-open block" href="${url}" target="_blank" rel="noopener">
        ${ko ? '공식 채널에서 보기 ↗' : 'Watch on the official channel ↗'}</a>
      <div class="lv-note">${ko
        ? '이 주소는 채널 페이지라 앱 안에서 바로 재생할 수 없습니다. 방송 중이면 채널에서 바로 보입니다.'
        : 'This is a channel page, so it cannot play inline. If a stream is live it appears there.'}</div>`;
    return box;
  }
  return null;
}
