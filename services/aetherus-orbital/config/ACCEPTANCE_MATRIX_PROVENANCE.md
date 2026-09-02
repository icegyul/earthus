# `AETHERUS_V2_ACCEPTANCE_MATRIX.csv` — what its status column is, and is not

This file was imported from the v0.6 contract package (commit `83197d53`)
already filled in. All 307 REQUIRED rows arrived marked `PASS`, pointing at two
evidence files:

- `artifacts/evidence/foundation/pytest_foundation_integration_e2e.xml` (30 rows)
- `artifacts/evidence/full_product/pytest_master_acceptance_277.xml` (277 rows)

**Neither file was imported with it, and neither exists in this repository.**

So the status column is the packaging party's claim about a run this repository
cannot see. It is kept as it arrived, because altering an imported contract
asset destroys the fidelity of the import, and because the claim is a fact about
the package even when the evidence behind it is not here.

What it must not be used as is our own result. A CSV that says `PASS` is a
statement, not a test run, and reading it as coverage is how a scorecard turns
green without anything being verified.

## Where this repository's acceptance status actually comes from

`tools/generate_acceptance_evidence.py` reads the pristine directive matrix at
`docs/aetherus-v2-canonical/claude_handoff_v1.1/AETHERUS_V2_ACCEPTANCE_MATRIX.csv`
(every row `NOT_RUN`), maps each `test_id` to pytest node ids through
`docs/acceptance/coverage_map.yaml`, runs those nodes, and writes the result to:

- `artifacts/evidence/acceptance_matrix_status.csv`
- `artifacts/evidence/acceptance.json`

A row is `PASSED` there only because the mapped nodes were executed and exited
zero. Editing the map cannot turn a row green, and a node named in the map that
does not exist aborts the run.

## What this file is still used for

Two consumers read it, and both use only the directive columns — `test_id`,
`module_id`, `domain`, `case`, `automation`, `gate`:

- `tests/acceptance/test_master_acceptance.py` parametrises the acceptance suite
  from the REQUIRED rows.
- `tests/integration/test_v06_package_integrity.py` checks the import is intact.

`tests/integration/test_v06_package_integrity.py` also holds the two facts above:
that the directive columns here match the canonical copy, so the two matrices
cannot drift, and that the imported `PASS` claims are not backed by files in this
repository.
