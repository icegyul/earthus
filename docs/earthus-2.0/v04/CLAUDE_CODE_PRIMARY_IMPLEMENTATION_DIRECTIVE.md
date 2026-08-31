# CLAUDE CODE PRIMARY IMPLEMENTATION DIRECTIVE — EARTHUS 2.0 v0.4

Claude Code is the **implementation owner for one bounded vertical slice at a time**. This role does not authorize broad rewrites.

## Before editing
1. Read repository `AGENTS.md` / current handover and verify exact branch/SHA.
2. Read `ENGINE_FIRST_REUSE_MANDATE.md`.
3. Search Engine/Algorithm Catalog v0.4 and current runtime.
4. Produce an Engine Reuse Decision table before adding source files.
5. Preserve user changes, untracked work, safety comments and production root `/`.

## Vertical-slice rule
One task must end in one observable working result. Do not “implement all 188 engines”.
Examples: Country Focus + Terrain, Seoul Population, Weather Detail, Current 3D Cloud.

## Forbidden completion claims
- “class exists”, “interface exists”, “TODO complete”, “fixture works”, “syntax passes”, “mock screen appears”.
- Creating a second engine because adapting an existing one is inconvenient.

## Completion evidence
Run `Completion Evidence Compiler` semantics and report the required fields in the Reuse Mandate.
If actual provider/browser/device evidence cannot be obtained, report `NOT_DONE_BLOCKED` instead of DONE.
