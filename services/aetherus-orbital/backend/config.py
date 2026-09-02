"""Configuration management."""

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Database
    database_url: str = (
        "postgresql+asyncpg://aetherus:aetherus_dev_password@localhost:5432/aetherus"
    )

    # Redis
    redis_url: str = "redis://localhost:6379/0"
    redis_lock_ttl_seconds: int = 30

    # Environment
    environment: str = "development"
    log_level: str = "INFO"

    # API
    api_prefix: str = "/api"
    # v2-three 실지구(dev 정적 서버)가 과학 API를 직접 소비한다 — '하나의 우주' 연결.
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://localhost:8777",
        "http://127.0.0.1:8777",
    ]

    # Scientific
    default_data_age_warning_hours: int = 24
    max_catalog_id_digits: int = 9
    ephemeris_max_samples: int = 1000
    ephemeris_default_step_seconds: int = 60
    ut1_utc_offset_seconds: float = 0.0

    # P3 explore catalog
    catalog_max_objects: int = 500
    global_density_min_objects: int = 500
    frontend_dir: str = "frontend"

    # P4 conjunction assessment
    screening_window_hours: float = 24.0
    screening_coarse_step_seconds: int = 30
    screening_refine_step_seconds: int = 5
    screening_threshold_m: float = 25000.0
    screening_shell_margin_km: float = 50.0
    screening_max_objects: int = 2000
    # Which objects an UNSCOPED screening takes when the catalogue exceeds the
    # bound. EPOCH_DESC: freshest non-simulation solutions first — stale
    # elements produce fictional conjunctions, and probe fixtures must never
    # crowd out real objects. CATALOG_ID_ASC: the pre-2026-09-02 behaviour,
    # kept for reproducing historical runs only.
    screening_selection_policy: str = "EPOCH_DESC"
    screening_hbr_m: float = 5.0
    # How many screening runs may compute at once. Each run is handed to a
    # worker thread so it cannot block the event loop (backend/offload.py), and
    # each full-catalogue run holds ~9 GB while already saturating the cores,
    # so runs queue by default rather than overlapping.
    screening_max_concurrent_runs: int = 1
    conjunctions_page_limit: int = 200

    # P5 intervention benefit engine (IDEALIZED_REMOVAL counterfactuals only)
    benefit_horizon_hours: float = 24.0
    benefit_max_objects: int = 2000
    benefit_shell_margin_km: float = 50.0
    # Per-metric beneficiary thresholds; a beneficiary must exceed the value
    # strictly. Channels stay separate and are never merged into one score.
    benefit_thresholds: dict[str, float] = {
        "PC": 0.0,
        "MAX_PC": 0.0,
        "CONJUNCTION_EXPOSURE": 0.0,
    }
    benefit_equivalence_tolerance_abs: float = 1e-12
    benefit_baselines_page_limit: int = 50

    # Provider and internal-route credentials remain local ignored settings.
    spacetrack_identity: SecretStr | None = None
    spacetrack_password: SecretStr | None = None
    internal_admin_token: SecretStr | None = None

    # Evidence
    evidence_dir: str = "artifacts/evidence"
    raw_artifact_dir: str = "artifacts/raw"


settings = Settings()
