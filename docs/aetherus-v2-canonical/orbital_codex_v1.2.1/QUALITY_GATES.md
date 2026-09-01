# Quality Gates

## Scientific gates
- No validated label without recorded validation dataset/version.
- Pc unavailable when covariance prerequisites fail.
- Source timestamp/age visible for risk results.
- Full vs affected-subgraph regression required after screening changes.
- Candidate maneuver comparison must detect both deleted and newly created conjunction edges.

## Product gates
- Empty state is explicit and informative; never filled with synthetic facts.
- API 4xx/5xx states have UI behavior.
- Every user-visible metric has a provenance drawer or research-mode detail.
- Explore mode may simplify wording, never semantics.

## Codex anti-shortcut audit
CI searches production source for TODO/pass/notImplemented/random metric generation and known placeholder strings. Any hit requires review.
