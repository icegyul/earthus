# CLAUDE CODE — VS-00 FIRST PAGE

Read AGENTS.md, Luna skill, latest HANDOVER, viewer.js, power.js, render-quality.js and Engine Foundation v0.5 before editing.

Claude Code owns implementation. Codex reviews; it must not independently rewrite the slice.

1. Verify canonical repo state and preserve unrelated work.
2. Reuse `globalThis.__earthusViewer`; if reuse is unsafe, STOP and report the gap.
3. Adapt the v0.5 first-page modules to existing DOM/store conventions instead of creating a parallel app.
4. Isolate `/v2`. Do not replace root `/`.
5. Run desktop/mobile browser checks and 30-cycle mount/unmount resource checks.
6. Report USED_ENGINE_IDS, USED_ALGORITHM_IDS, REUSED_FILES, NEW_FILES, ACTUAL_RUNTIME_EVIDENCE, SCREENSHOTS, TEST_RESULTS, PERFORMANCE, DISPOSE, REGRESSION, ROLLBACK.

Do not emit the DONE token without real runtime evidence.
