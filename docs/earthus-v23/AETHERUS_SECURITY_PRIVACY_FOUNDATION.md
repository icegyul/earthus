# Aetherus Rights · Security · Privacy · Moderation Foundation

## 상태

`LOCAL_POLICY_COMPLETE / IDENTITY_SCANNER_OPERATIONS_EXTERNAL`. Sheet 250, 252–256, 260–262의
권리 판정, session/token reference, signed URL plan, private ACL/RBAC, 신고 queue, abuse limit,
malware quarantine, takedown/incident workflow를 합성 fixture로 검증했다.

## 보호 계약

- press-use는 인간 검토 전 공개하지 않고 embed-only는 저장하지 않는다.
- raw access/refresh token은 계약 입력과 산출물에서 거절하고 opaque reference만 사용한다.
- signed URL은 owner 확인을 요구하는 plan만 만들며 public ACL과 실제 URL은 만들지 않는다.
- ADMIN/EDITOR/MODERATOR/USER 권한은 명시 matrix와 owner scope로 fail-closed한다.
- 신고는 queue에만 넣고 자동 판정·자동 외부 조치를 하지 않는다.
- scanner PASS여도 운영 scanner 증거와 승인 policy가 없으면 quarantine을 해제하지 않는다.
- takedown/incident 상태 변경은 actor/time/evidence audit 없이는 진행되지 않는다.

## 닫힌 gate

현재 policy는 `DRAFT + productionEnabled=false`다. OAuth provider/session store, token rotation,
KMS signed URL, bucket ACL/RLS, 실제 관리자 계정, malware scanner, moderation staffing,
법적 takedown·보안 사고 연락망은 미연결이다. JSON 수치는 합성 테스트 policy다.
