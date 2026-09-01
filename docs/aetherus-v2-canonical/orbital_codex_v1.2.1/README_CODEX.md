# Aetherus Orbital Environment — Codex Execution Contract

**Canonical implementation spec:** `MASTER_DEVELOPMENT_SPEC.md`  
**Human reference:** `docs/Aetherus_Orbital_Environment_개발지침서_v1.1_초상세본.docx`  
**First file to read:** `START_HERE_CODEX.md`

## Non-negotiable DONE chain
`real fixture/source input -> parser/validation -> scientific calculation -> persistence -> API contract -> UI -> automated tests -> evidence manifest`

Forbidden shortcuts:
1. No hardcoded scientific counts/positions/risk/Pc/TCA/re-entry/confidence/benefit values in production UI.
2. Missing provider data becomes explicit `UNAVAILABLE`, `INSUFFICIENT_DATA`, `VALIDATION_PENDING`, or `RESEARCH_ONLY`, never a plausible invented number.
3. Routes/components alone never satisfy a phase gate.
4. `TODO`, `pass`, constant-return or mock-only implementations cannot satisfy production completion.
5. Preserve metric type/method; MaxProbability is not operational CDM Pc.
6. Preserve source snapshot, model version, algorithm/method and input hash.
7. Follow `IMPLEMENTATION_ORDER.md` without skipping gates.

Every phase writes `artifacts/evidence/<phase>.json` with commit hash, test commands/results, input/source IDs, API evidence, benchmark when required, and known limitations.
