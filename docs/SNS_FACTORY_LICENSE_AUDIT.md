# SNS FACTORY — 라이선스 감사 (원문 대조, 2026-09-10)

- 방법: 각 clone의 LICENSE 파일 1~3행 직접 Read. 추측 없음.
- `D:\SNS_FACTORY_REFERENCE\` 기준 실측.

## 1. 판정표

| 후보 | LICENSE 원문 1행 | 분류 | EARTHUS 취급 |
|---|---|---|---|
| BrightBean | `GNU AFFERO GENERAL PUBLIC LICENSE / Version 3` | RED | 직접 복사 금지. FEATURE/ARCHITECTURE REFERENCE. DIRECT INTEGRATION=LEGAL REVIEW REQUIRED |
| Mixpost | `The MIT License (MIT) / Copyright (c) 2022-present, Dima Botezatu, Inovector` | GREEN | 저작권·라이선스 고지 유지 조건으로 채택 가능 |
| Postiz | `GNU AFFERO GENERAL PUBLIC LICENSE / Version 3` (`package.json`도 `AGPL-3.0`) | RED | 직접 복사 금지. REFERENCE. DIRECT INTEGRATION=LEGAL REVIEW REQUIRED |
| TryPost | `GNU AFFERO GENERAL PUBLIC LICENSE / Version 3` | RED | 직접 복사 금지. REFERENCE. DIRECT INTEGRATION=LEGAL REVIEW REQUIRED |
| Post4U | `MIT License / Copyright (c) 2026 ShadowSlayer03` | GREEN | 채택 가능(고지 유지) |
| threads.js | `MIT License / Copyright (c) 2023 threads.js` | GREEN | 채택 가능(고지 유지) |
| threads-cli | LICENSE 파일 없음 + `package.json` license 필드 없음 | YELLOW | 권리불명. 채택 금지. 패턴참고도 PIL(깨끗한 재구현) 원칙. 저작권자 명시 없는 복붙 금지 |
| sm-scheduler | `MIT License / Copyright (c) 2026 HillzKillzIt` | GREEN | 채택 가능(고지 유지) |
| threads-publisher | `MIT License / Copyright (c) 2026 Thales Gomes` | GREEN | 채택 가능(고지 유지) |
| threads_api | `Copyright (c) Meta Platforms, Inc. and affiliates. All rights reserved.` | YELLOW | Meta 샘플 라이선스. 공식 API 사용법 참고용. 복붙 금지 |

## 2. AGPL 취급 규칙 (본 감사 적용)

- AGPL 3종(BrightBean·Postiz·TryPost): 아키텍처·동작·파라미터(재시도간격·폴주기·스냅샷감쇠 등)는 참고 가능하나, 소스 복붙·번역이식·의존성 추가 모두 LEGAL REVIEW REQUIRED.
- 본 결정문은 AGPL 코드의 EARTHUS 유입을 0으로 둔다(아래 ADOPTION_DECISION).
- MIT 5종도 고지문(`LICENSE`+저작권자) 유지가 조건. 고지 없는 발췌 금지.

## 3. 잔여 모호성

- Critical license ambiguity: 0. (YELLOW 2종은 채택제외로 해소. threads-cli는 어떤 경우도 복사하지 않는다.)
