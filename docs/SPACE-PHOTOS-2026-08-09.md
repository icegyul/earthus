# 우주 사진 B1·B2 1차 배포 기록 — 2026-08-09

## 이번 배포에서 된 것

- 공식 출처가 확인된 우주 사진 2건을 `space-photos.json` 카탈로그로 분리했다.
  - 허블 울트라 딥 필드 — NASA
  - 남쪽고리 성운 — ESA/Webb
- 허블·제임스웹 레이어를 각각 켜고 끌 수 있다.
- 사진의 RA/Dec를 ICRF에서 지구고정 좌표로 바꿔 300,000km 천구에 표시한다.
- 카메라 고도 45,000km 아래에서는 지구 화면을 가리지 않는다.
- 마커 상세 시트에 큰 이미지, 망원경, 공개일, 하늘 좌표, 이용 조건, 전체 크레딧과 공식 원본 링크를 표시한다.
- 썸네일은 외부 기관 서버를 핫링크하지 않고 earthus 정적 파일로 제공한다.
- `tools/validate_catalogs.py`가 날짜 종류와 이용 조건 누락도 실패 처리한다.

## 출처와 이용 조건

| 항목 | 공식 원본 | 화면 크레딧 | 이용 조건 |
|---|---|---|---|
| 허블 울트라 딥 필드 | `https://science.nasa.gov/asset/hubble/hubble-ultra-deep-field/` | NASA, ESA, S. Beckwith and the HUDF Team (STScI), and B. Mobasher (STScI) | NASA Media Usage Guidelines |
| 남쪽고리 성운 | `https://esawebb.org/images/weic2207c/` | NASA, ESA, CSA, STScI, and the Webb ERO Production Team | CC BY 4.0 · ESA/Webb |

## 검증

- `python3 tools/validate_catalogs.py` 통과: 우주 사진 2건, 위성 별칭 8건.
- 변경 JavaScript 전부 `node --check` 통과.
- 로컬 브라우저 `?skyphotos=hst`, `?skyphotos=jwst`에서 다음을 확인했다.
  - 데이터소스 on, 해당 망원경 마커 on.
  - 카메라 중심 거리 61,371km, 사진 천구 반지름 300,000km, 카메라-마커 거리 238,629km.
  - 마커 썸네일과 이름표 표시.
  - 상세 시트의 전체 크레딧, 공개일, RA/Dec, 이용 조건, 공식 링크 표시.

## 아직 안 된 것

- 개발 사양의 첫 카탈로그 목표는 50장이다. 이번 배포는 경로·표시·출처 규율을 먼저 검증한 2장짜리 최소 단위이며 B1·B2 전체 완료로 세지 않는다.
- 영문 이름은 데이터에 들어 있지만 현재 상세 시트는 앱의 기존 언어 상태 연결을 더 확인해야 한다.
- 운영 배포 뒤 같은 진단 쿼리로 다시 검증한다.

## 이번에 막은 사고

진단 쿼리는 실제 손가락 입력이 없어서 첫 화면 줌 연출이 계속 돌았다. 그 상태에서 우주 사진 카메라 이동을 두 번 겹치자 Cesium 카메라 위치가 비정상적으로 커졌다. 진단 시작 전에 첫 화면 연출을 멈추고, `setLayer`가 호출하는 이동 한 번만 남겼다.

## 운영 배포

- CloudFront 무효화: `I7ARUQ2LWBM20R77CIJVBE40IP`
- 배포한 JavaScript 5개, CSS, JSON, JPEG 2개를 운영 URL에서 다시 내려받아 로컬 원본과 바이트 단위로 대조했다.
- 운영 응답 Content-Type을 확인했다: JavaScript `text/javascript`, JSON `application/json`, 썸네일 `image/jpeg`.
- 운영 `?skyphotos=jwst`에서 영문 이름·크레딧·공식 링크·공개일·RA/Dec·이용 조건과 썸네일 마커를 확인했다.
- CloudFront 배포 계정에는 `GetInvalidation` 권한이 없어 waiter 조회는 거부됐지만, 모든 운영 파일이 새 바이트로 응답해 실제 반영을 확인했다.

## 두 번째 카탈로그 묶음

- ESA/Webb 공식 이미지 10건을 추가해 전체 12건으로 늘렸다.
- 추가 대상: 창조의 기둥, 타란툴라 성운, 뱀자리 성운, 솜브레로 은하, 허빅-아로 49/50, 고양이 발 성운, 나비 성운 NGC 6302, 나선 성운, M51의 별 탄생 영역, 시가 은하 M82.
- `tools/extract_esawebb_metadata.py`는 저장한 공식 페이지에서 제목·RA·Dec·공개일·전체 크레딧을 읽고 도 단위 좌표의 후보 JSON을 출력한다. 필드가 없으면 추정하지 않고 실패하며 정본 JSON을 자동으로 덮어쓰지 않는다.
- 검수자가 한국어 이름과 대상을 확인한 뒤 카탈로그에 옮겼고, 썸네일은 ESA/Webb CDN 원본을 earthus에 캐시했다.
- 검증기는 이제 JSON 경로만 보지 않고 실제 로컬 썸네일 파일 존재와 HTTPS 원본 링크도 검사한다.
- 브라우저가 첫 2장 JSON을 `force-cache`로 계속 재사용하는 문제를 로컬에서 재현했다. 작은 카탈로그는 레이어를 켤 때 조건부 재검증하고, 큰 썸네일은 정적 캐시를 유지하도록 분리했다.
- 로컬 진단 화면에서 `catalog 12`, 카메라 61,371km, 천구 300,000km, 마커 on을 다시 확인했다.
- 두 번째 CloudFront 무효화: `I1C7GDS1FHNC4I78NZCE6D6FNT`. 운영 JSON·JavaScript·새 JPEG 10개를 다시 내려받아 로컬과 바이트 단위로 대조했고, JSON은 `Cache-Control: no-cache`로 응답했다.
- 운영 영문 화면에서도 `catalog 12`, 마커 on, 카메라·천구 거리를 확인했다.
- 세 번째 묶음으로 FS 타우, 레오 P, 용골자리 성운 제트, 유령 은하 중심부, 거미줄 원시은하단, MACS J1423, 린즈 483, 피스미스 24, Sh2-284, 궁수자리 B2, 테르잔 5, 센타우루스 A를 추가했다.
- 세 번째 묶음 12건도 공식 페이지의 좌표·공개일·전체 크레딧을 추출한 뒤 사람이 한국어 이름과 대상을 확인했고, 로컬 검증 화면에서 `catalog 24`와 정상 카메라·마커 상태를 확인했다.
- 세 번째 CloudFront 무효화: `IDRNPPVIIM8FQNK3ECY5Q3IH2T`. 운영 JSON과 새 JPEG 12개를 로컬과 바이트 단위로 대조했고, 운영 화면에서도 `catalog 24`를 확인했다.
- 네 번째 묶음은 공식 사진 13건을 더했다. 같은 좌표의 M82와 허블 울트라 딥 필드 중복 후보 2건은 숫자를 채우기 위해 넣지 않았다.
- 가까운 은하·원시행성계 원반·먼 은하장·왜소은하·왜성·행성상 성운을 보강했고, 로컬에서 `catalog 37`과 정상 마커 상태를 확인했다.
- 네 번째 CloudFront 무효화: `IBRG0LU35SH8V3UAIOQQOQNLEG`. 운영 JSON과 JPEG 13개가 로컬과 일치했고 운영 화면도 `catalog 37`을 표시했다.
- 50장 목표까지 13장이 남았으므로 여전히 B1·B2 전체 완료로 세지 않는다.
