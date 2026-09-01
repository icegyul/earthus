from __future__ import annotations
import csv
from pathlib import Path
import pytest
from .cases import run_acceptance_case

ROOT=Path(__file__).resolve().parents[2]
ROWS=list(csv.DictReader((ROOT/'config'/'AETHERUS_V2_ACCEPTANCE_MATRIX.csv').open(encoding='utf-8')))
# E01-E07 canonical 30 are already covered by dedicated Foundation tests and were PASS in v0.2.
CASES=[r for r in ROWS if r['gate']=='REQUIRED' and r['module_id'] not in {f'E{i:02d}' for i in range(1,8)}]

@pytest.mark.parametrize('row',CASES,ids=[r['test_id'] for r in CASES])
def test_master_acceptance(row):
    run_acceptance_case(row['module_id'],row['case'])
