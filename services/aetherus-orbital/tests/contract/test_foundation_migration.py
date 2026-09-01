from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]

def test_foundation_migration_contains_required_truth_tables_and_append_only_guards():
    sql=(ROOT/'db/migrations/0002_foundation_truth_core.sql').read_text()
    for table in ['quarantine_record','identity_conflict','provenance_bundle','provenance_link','time_context_manifest','timeline_bookmark','frame_transform_manifest','snapshot_manifest','state_version','object_relation','archive_index','collection_manifest']:
        assert f'CREATE TABLE IF NOT EXISTS {table}' in sql
    for guarded in ['raw_artifact','evidence','digital_state','snapshot_manifest','event_revision']:
        assert f'{guarded}_immutable' in sql
