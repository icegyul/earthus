# AETHERUS / EARTHUS Final Closeout — 2026-08-12

## Final statement

This repository's implementable, non-authoritative Aetherus/Earthus work is
closed through PR-10. Each completed slice is either an already-verified static
Earthus surface or a pure shadow contract. No completed shadow contract is a
public recommendation, provider integration, reservation action, payment action,
or autonomous AI capability.

## Completed and evidenced

| Range | Closed result | Evidence |
|---|---|---|
| PR-03 to PR-06 | Earth state, readability, safety and continuous layers | `RELEASE-2026-08-12-PR00A-03.md` through `PR06.md` |
| PR-07 | deterministic decision core, calibration shadow | `RELEASE-2026-08-12-PR07.md` |
| PR-08 | private bounded personalization and safety-first five-axis UI, flag off | `PERSONALIZATION_UI.md`, `RELEASE-2026-08-12-PR08.md` |
| PR-09 | provider-evidence diff/dedup/user acknowledgement only | `RESERVATION_IMPACT.md`, `RELEASE-2026-08-12-PR09.md` |
| PR-10 | cited, read-only AI/decision fusion | `DECISION_FUSION.md`, `RELEASE-2026-08-12-PR10.md` |
| Aetherus core | astronomy, observation, media, mission, personal/community/science, AI, remote and plugin safety contracts | `AETHERUS-PR-13-FINAL-HARDENING-2026-08-12.md` |

The latest closed implementation commits are `da8892f` (PR-09) and `676c9ad`
(PR-10). Runtime assets were uploaded selectively, invalidated through
CloudFront, and compared byte-for-byte using cache-busting production responses.

## Verified final baseline

- Decision Core 31/31; Personalization/UI 30/30; Safety 23/23.
- Reservation impact and grounded decision-fusion contracts.
- Eight safety modules: no browser network/device bypass and no owned infinite
  render loop.
- Aetherus catalogue, astronomy, session, media, mission, personal, community,
  citizen-science, AI, remote-observatory and plugin contract regressions.
- Catalog credit validation and JPL ephemeris verification.

## Explicitly still closed

The following require external authority or real evidence. They are not defects
to work around and must not be represented as delivered:

1. Source/provider contracts, rights/freshness approval and authenticated live
   adapters.
2. Supabase schema, consent/deletion/retention and authenticated tenant A/B RLS
   proof.
3. Notification dispatch, reservation mutation/cancellation, payment or any
   entitlement action.
4. External-model credentials, cost approval, real evaluation set, tool
   allowlists and red-team review.
5. Physical observatory hardware-in-loop and emergency-stop proof.
6. Public flag enablement, actual Safari/older iPhone/screen-reader validation,
   canary/rollback rehearsal and explicit PD approval.

## Re-entry rule

Resume from the applicable gate rather than enabling a flag. Confirm the named
authority, run the relevant provider/RLS/device/real-browser test, record the
evidence and rollback condition, then make the smallest scoped release. Keep
`DECISION_CORE_READY` disabled until its PR-08 gate is fully satisfied.
