# Aetherus Media Rendition Foundation — Sheets 137–140, 239–240, 281

## 상태

`LOCAL_SHADOW_COMPLETE / PIXEL_WORKER_AND_STORAGE_EXTERNAL`. immutable private RAW metadata에서
512 thumbnail, 1920 preview, 3840 4K, AVIF→WebP→JPEG fallback, Deep Zoom pyramid, queue
backpressure, explicit retry, dead-letter와 completion receipt를 계획·검증하는 순수 계약을 추가했다.

## 보호 계약

- source는 private+immutable, SHA-256, dimensions, byte length를 가져야 한다.
- 작은 원본을 확대하지 않는다. 모든 파생은 source digest·recipe revision·계산 provenance를 가진다.
- AVIF/WebP 지원 여부는 worker capability로 결정하고 JPEG fallback은 policy에서 제거할 수 없다.
- 모든 output과 Deep Zoom tile은 EXIF GPS false, 위치·device 식별 metadata 제거 정책을 가진다.
- Deep Zoom threshold/tile size/overlap/format은 policy 값이며 코드가 임의로 정하지 않는다.
- queue는 byte/concurrency limit에서 BACKPRESSURE로 거부한다.
- 실패는 자동 재시도하지 않는다. 명시적 operator action만 FAILED→QUEUED를 허용하고,
  max attempts 뒤 DEAD_LETTER다.
- SUCCEEDED는 3개 rendition과 필요한 Deep Zoom receipt의 checksum·byte length·EXIF 상태가
  모두 있어야 한다.

## 닫힌 gate

현재 운영 policy는 `DRAFT + productionEnabled=false`다. 실제 decoder/resize/color profile,
AVIF/WebP encoder revision, 픽셀 golden, object storage, signed worker identity, malware scan,
queue/DLQ infrastructure, CDN와 비용·부하 증거는 미연결이다. 이 계약의 성공은 실제 이미지가
변환됐다는 뜻이 아니다.
