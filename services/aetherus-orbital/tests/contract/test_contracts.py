from pathlib import Path
import json
from jsonschema import Draft202012Validator
ROOT=Path(__file__).resolve().parents[2]
def test_all_schemas_valid():
    files=list((ROOT/'contracts/schemas').glob('*.json')); assert len(files)>=10
    for p in files: Draft202012Validator.check_schema(json.loads(p.read_text()))
