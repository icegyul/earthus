# CLAUDE CODE PRIMARY DIRECTIVE — EARTHUS v0.7 BACKEND FIRST

ROLE: Primary implementer for bounded backend vertical slices. Do not redesign the whole repository.

MANDATORY ORDER
1. Read AGENTS.md + current HANDOVER + v0.7 Engine/Algorithm Catalog.
2. Search current repository for existing provider/parser/storage/job code.
3. Record REUSE_AS_IS / REUSE_WITH_ADAPTER / HARDEN / REFACTOR / NEW.
4. NEW is forbidden without Gap Evidence.
5. Pick ONE provider/operation as vertical slice.
6. Attach v0.7 primitives around the existing parser; do not replace it.
7. Execute real smoke where credentials/rights permit.
8. Produce Evidence Pack.

FIRST RECOMMENDED SLICE
KTO or Seoul Population, because existing real collectors, S3 output and schedule evidence already exist. Add run-ledger/raw-receipt/schema/watermark/idempotency/quarantine/atomic-publish around one operation. Do not broaden to every provider until the first slice passes.

DONE REPORT MUST CONTAIN
USED_ENGINE_IDS
USED_ALGORITHM_IDS
REUSED_FILES
CHANGED_FILES
NEW_FILES + GAP_EVIDENCE
RAW_ARTIFACT_EVIDENCE
SCHEMA_EVIDENCE
WATERMARK_REVISION_EVIDENCE
PUBLISH_LAST_GOOD_EVIDENCE
TRACE_ID
TEST_RESULTS
LIVE_SMOKE_RESULTS
ROLLBACK_PATH

A file/class/interface alone is NOT DONE.
