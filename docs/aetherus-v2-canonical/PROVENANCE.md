# AETHERUS 개발지시서 정본 보관소 — 출처 기록

> 이 폴더가 AETHERUS 개발지시서의 **저장소 내 정본**이다. 세션 임시폴더·외부 폴더에 흩어진 사본 대신 여기를 참조한다.
> 고정일: 2026-09-01

## 구성

| 폴더 | 내용 | 권위 |
| --- | --- | --- |
| `claude_handoff_v1.1/` | AETHERUS V2 전제품 개발 핸드오프 (docs 00~19, 엔진 E01~E44, 페이즈 P0~P15, 기계가독 계약) | **전제품 권위** |
| `orbital_codex_v1.2.1/` | Aetherus Orbital Environment 모듈 구현 계약 (IMPLEMENTATION_ORDER, MASTER_DEVELOPMENT_SPEC, 스키마·검증 픽스처) | **ORBIT 모듈 시퀀싱 권위 (최신)** |

## 원본 및 무결성

원본 zip 보관 위치: `D:\## APP\Earthus v2_DOC\Aetherus v2\`

| 원본 zip | SHA256 |
| --- | --- |
| `AETHERUS_V2_CLAUDE_CODE_MASTER_DEVELOPMENT_HANDOFF_v1.1_2026-08-30.zip` | `23e9a1f80c5a51470938248688c86adae290454def942263f2ac2e6753f69332` |
| `Aetherus_Orbital_Environment_Codex_Implementation_Package_v1.2.1_누락보완본.zip` | `734c047f0ecce742053579ce140d71aeb0aec06612c5feea20019c434f4d4aab` |

- `claude_handoff_v1.1/SHA256SUMS.txt` 검증: **35/35 OK** (2026-09-01)
- `orbital_codex_v1.2.1/MANIFEST.json` (package_version 1.2.1 corrective): `IMPLEMENTATION_ORDER.md` sha256 `3f5a3096b97106f871f877160671d52b58141180af660001cdf191c0a687c5af` 일치 확인 (2026-09-01)

## DOCX 취급 규칙

저장소 로드맵 규칙("DOCX 원본은 드라이브에 보존, 정본 문서만 docs/로 관리")에 따라 `.docx` 파일은 **커밋하지 않는다** (로컬 작업 사본은 유지될 수 있음). 원본은 위 zip 안에 SHA와 함께 보존된다. 구현 의미론의 정본은 어차피 Markdown이다:

- `orbital_codex_v1.2.1/MASTER_DEVELOPMENT_SPEC.md` — 개발지침서 v1.1 docx의 기계가독 정본 (문서 자체가 "구현 의미론은 이 파일" 선언)
- `claude_handoff_v1.1/docs/00~19_*.md` — V2 핸드오프 정본

## 좌표 체계 결정 (2026-09-01, PD 위임 채택)

- 제품 페이즈 좌표는 **V2 P0~P15 단일 정본**. Orbital P0~P12는 ORBIT 모듈 내부 서브게이트로 편입 (V2-P6에 ORB-P0~P3, V2-P8에 ORB-P4~P6, V2-P7에 ORB-P7~P9, V2-P14에 ORB-P10~P11, V2-P15에 ORB-P12).
- 증거 파일은 `artifacts/evidence/p{N}.json` (V2 좌표), 내부 필드에 orbital_phase 병기.
- 근거: 제품 목적이 전제품(SPACE/CONTROL/ORBIT 통합)이므로 전제품 권위(V2 핸드오프)의 좌표를 따르고, 모듈 게이트의 엄격성은 서브게이트로 보존한다. 상세는 `docs/audit/CANONICAL_REPOSITORY_DECISION.md`.
