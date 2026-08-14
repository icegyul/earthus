# Ocean Marine Life Foundation — O3 shadow

## 상태

`LOCAL_SHADOW_COMPLETE / STORAGE_AND_MODERATION_EXTERNAL`. 사진 visibility saga, taxonomy,
민감종 좌표와 moderation 계약을 메모리 repository에서 검증했다. 운영 object storage,
image worker, taxonomy provider, moderator principal, CDN에는 연결하지 않았다.

## 보호 계약

- 원본 object key는 항상 `private/{owner}/...`, public URL은 영구적으로 null이다.
- 파생본은 정확히 320/640/1280/2048px이며 각자 checksum·recipe revision·private key를 가진다.
- 파생본 EXIF GPS가 남으면 전체 세트를 거부한다.
- owner 외 principal은 private record를 읽지 못한다.
- AI/HUMAN suggestion은 `SUGGESTED`; 사람 reviewer·taxonomy version·canonical source가 있어야
  `VERIFIED`가 된다. `AI_VERIFIED`는 거부한다.
- 사람의 명시적 공개 요청 뒤에도 moderation은 공개가 아니라 `PENDING` request만 만든다.
- moderation ACCEPTED 뒤 4개 checksum·public URL·immutable cache 영수증이 맞아야 PUBLIC이다.
- 민감종 PUBLIC location은 exact/blurred가 아니라 region-only다.
- PUBLIC→PRIVATE는 4개 삭제 영수증, 모든 path의 CDN invalidation 생성, 익명 404 확인이
  전부 있어야 `PRIVATE_PURGED`가 된다.

## 검증

- OT-005 성격: private original, anonymous public read null, owner B denial.
- OT-006 성격: 4개 파생본 completeness·digest·EXIF GPS.
- OT-007 성격: PRIVATE→PUBLIC→PRIVATE와 누락 삭제 영수증 fail-closed.
- OT-008 성격: sensitive species coordinate region 일반화.
- OT-015 성격: AI suggestion의 verified 승격 거부와 human taxonomy evidence 요구.

## 닫힌 gate

1. 운영 private bucket·RLS·signed upload·worker identity.
2. 실제 이미지 변환의 픽셀·색공간·EXIF 제거·checksum 검증.
3. taxonomy 정본·version pin·민감종 목록과 일반화 정책 승인.
4. moderator principal 분리와 abuse/appeal SLA.
5. 실제 CDN purge와 독립 anonymous verification.
