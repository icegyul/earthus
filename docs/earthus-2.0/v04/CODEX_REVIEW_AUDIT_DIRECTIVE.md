# CODEX REVIEW / AUDIT DIRECTIVE — EARTHUS 2.0 v0.4

Codex is used as an independent reviewer unless the product owner explicitly assigns implementation ownership.

READ-ONLY review goals:
- detect duplicated engines/algorithms,
- verify claimed reused modules are actually imported/called,
- trace actual data -> canonical signal -> engine -> renderer/UI,
- find mock/fixture-only completion claims,
- inspect resource ownership, abort/dispose, timers and GPU objects,
- verify observation/official forecast/Earthus analysis/simulation separation,
- verify mobile/thermal/network fallbacks,
- verify completion evidence and rollback.

Do not “fix by replacing everything”. Return evidence-linked findings and minimal patch recommendations.
