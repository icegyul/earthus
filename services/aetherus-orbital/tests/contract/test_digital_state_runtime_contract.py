from datetime import datetime, timezone
from uuid import uuid4
import json
from pathlib import Path
from jsonschema import Draft202012Validator
from aetherus_domain import DigitalState, DigitalStateKind, canonical_hash

ROOT=Path(__file__).resolve().parents[2]

def test_runtime_digital_state_matches_frozen_contract():
    evidence_id=uuid4()
    payload={'status':'LAUNCHED'}
    state=DigitalState(
        entity_id=str(uuid4()),
        state_time=datetime(1969,7,16,13,32,tzinfo=timezone.utc),
        state_kind=DigitalStateKind.ARCHIVED,
        representation='OFFICIAL_HISTORICAL_LAUNCH_STATE',
        source_evidence_ids=[evidence_id],
        state_hash=canonical_hash(payload),
        payload=payload,
    )
    schema=json.loads((ROOT/'contracts/schemas/DigitalState.schema.json').read_text())
    Draft202012Validator(schema).validate(state.model_dump(mode='json'))
