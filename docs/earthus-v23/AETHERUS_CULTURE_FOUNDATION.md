# Aetherus Culture Layer Foundation — Sheets 151–163

## 상태

`LOCAL_SHADOW_COMPLETE / REAL_CULTURE_CATALOG_EXTERNAL`. CultureReference, 7 work type,
5 relation, 권리 gate, 공식 링크/embed, 자체작성 설명, source verification, 검색, 천체별 timeline,
provider 실패 fallback을 합성 fixture로 검증했다. 실제 작품·미디어·인용문은 추가하지 않았다.

## 보호 계약

- work type: 문학·영화·드라마·신화·게임·음악·미술.
- relation: direct mention·setting·motif·inspired_by·namesake.
- 모든 설명은 `EARTHUS_EDITORIAL`; v1 record는 verbatim quotation을 허용하지 않는다.
- source/provider, provider object ID, UTC created/updated, source reference와 verified UTC를 보존한다.
- direct mention/namesake는 OFFICIAL 또는 PRIMARY source가 하나 이상 있어야 한다.
- rights `UNKNOWN/RESTRICTED`는 public read와 자동게시를 차단한다.
- `EMBED_ONLY`는 공식 HTTPS 링크/embed만 반환하고 cached URL을 거부한다.
- `METADATA_ONLY`는 public view에서 미디어를 숨긴다.
- `PUBLIC_DOMAIN/LICENSED/CC_BY`는 credit·rights source·verified time과 각 상태별 license 증거를
  요구한다.
- 권리가 통과해도 `automaticPublishAllowed`는 항상 false다.
- rights 변경은 cache invalidation, search re-index, rights-changed audit event를 명시한다.
- provider 실패 때 cache policy가 APPROVED이고 last-good이 허용 시간 안일 때만 STALE이다.

## 검증과 한계

`tools/test_aetherus_culture.mjs`가 Sheet 151–163의 모델·관계·URL·권리·검색·timeline·fallback을
한 번에 검사한다. fixture의 제목·창작자·URL은 모두 합성이며 LIVE 사실이 아니다.

실제 공개 전에는 작품별 관계 사실 검증, 저작권/초상권/상표 검토, 공식 trailer/still URL,
credit 문구, license scope, 권리 변경 owner, moderation·takedown, 운영 DB/API/search/CDN을 별도
승인해야 한다. 이 gate 전에는 Culture 메뉴나 공개 API를 연결하지 않는다.
