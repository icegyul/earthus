-- P4 Pc correction: v1 did not transform covariance into the two-axis
-- encounter plane. Preserve that immutable registry entry, mark it invalid,
-- and register the corrected fail-closed v2 method separately.

UPDATE model_registry
SET
  validation_state = 'INVALIDATED',
  config_schema = config_schema || CAST('{
    "invalidated_reason": "v1 used source-coordinate covariance blocks instead of B @ C @ B.T in the relative-velocity-normal encounter plane"
  }' AS jsonb)
WHERE id = 'foster-1992-pc'
  AND version = 'p4-encounter-plane-v1';

INSERT INTO model_registry (id, version, category, source_commit, config_schema, validation_state)
VALUES (
    'foster-1992-pc',
    'p4-encounter-plane-v2',
    'collision_probability',
    'codex/p4-conjunction-screening',
    CAST('{
        "method": "FOSTER-1992",
        "encounter_plane": "two tangent axes normal to relative velocity",
        "covariance_projection": "B @ C @ B.T",
        "integration": "deterministic Gauss-Legendre polar quadrature",
        "requires": [
            "combined_covariance_positive_definite",
            "explicit_common_teme_frame",
            "explicit_km2_covariance_units",
            "finite_relative_state",
            "finite_positive_combined_hbr_m"
        ],
        "validation_datasets": [
            "analytic-isotropic-gaussian-disk-v1",
            "rotation-invariance-anisotropic-covariance-v1",
            "tracss-spec-example-derived-cdm-fixtures-v2"
        ],
        "quality_flags": ["DILUTION_SUSPECTED"]
    }' AS jsonb),
    'VALIDATED'
)
ON CONFLICT (id, version) DO NOTHING;
