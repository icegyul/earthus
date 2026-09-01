-- P2 Orbit / time / frames: model registry seed and idempotent ephemeris persistence.

INSERT INTO model_registry (id, version, category, source_commit, config_schema, validation_state)
VALUES (
    'sgp4-vallado',
    '2.23',
    'orbit_propagation',
    'pypi-sgp4-2.23',
    CAST('{
        "gravity_model": "WGS72",
        "operation_mode": "i",
        "input": "OMM mean elements via sgp4init; no TLE line construction",
        "output_frame": "TEME",
        "gmst_model": "IAU-1982",
        "ut1_utc_offset_seconds_assumed": 0.0,
        "polar_motion_applied": false,
        "validation_datasets": [
            "sgp4-vallado-tcppver-reference-corpus",
            "golden:real-P1-celestrak-GP-snapshot"
        ]
    }' AS jsonb),
    'VALIDATED'
)
ON CONFLICT (id, version) DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS uq_propagation_snapshot_sample
    ON propagation_snapshot(object_id, orbit_solution_id, model_version, sample_time);
