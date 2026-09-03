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
    # 자체 광역(all-vs-all) 스크리닝은 정기 실행하지 않기로 결정했다 (2026-09-03).
    # 여기 값을 바꿔도 스케줄이 켜지지는 않는다 — 애초에 스케줄러가 없고, 없는 것이
    # 결정이지 누락이 아니다. 온디맨드 실행(POST /api/v1/conjunctions/screen-runs),
    # 테스트, 증거 생성이 이 설정을 쓴다.
    #
    # 켜기 전에 읽을 것: docs/decisions/2026-09-03-conjunction-screening-cadence.md
    # 요지 — 비용은 (쌍 수 x 덮는 시간축 길이)이므로 주기를 늘려도 줄지 않고, 전
    # 카탈로그 연속 커버리지는 54 CPU-시간/일로 실시간의 2.25배다. 7일 앞 예상은
    # SOCRATES 가 이미 무료로 준다.
    # 24.0 이었다. 아무도 그 조합을 돌려 본 적이 없었고, 브라우저 테스트가 그것을
    # 건드리자 서버가 CPU 500초를 태우며 /ui/ 를 35초 무응답으로 만들었다. 2.0 은
    # 실측된 값이다 — 2,000객체에 429~490초.
    screening_window_hours: float = 2.0

    # 한 실행이 시작될 수 있는 최대 작업량. objects x window_hours 로 센다.
    # 실제로 완주한 설정은 전부 통과해야 하므로 측정된 최대(1,998 x 6h = 11,988
    # 객체시간, 실측 47분) 바로 위에 둔다. 폭주한 조합(2,000 x 24h = 48,000,
    # 최악 5.5시간)은 거부한다. 근거는 backend/conjunction/budget.py 참조.
    screening_max_object_hours: float = 12000.0
    screening_coarse_step_seconds: int = 30
    screening_refine_step_seconds: int = 5
    screening_threshold_m: float = 25000.0
    screening_shell_margin_km: float = 50.0
    # 2000 이었다. 쌍이 제곱으로 늘기 때문에 500 은 작업량이 1/16 이다 —
    # 스레드를 줄이는 것과 달리 총 CPU 자체가 줄고, 그래서 발열도 줄어든다.
    # 예약 실행을 하지 않기로 했으므로(2026-09-03 결정) 남은 용도는 데모·검증·
    # 증거 생성이고 거기에 2,000 은 필요하지 않다. 더 필요한 호출자는
    # max_objects 를 명시하면 되고, 부족분은 population_truncated 로 표시된다.
    screening_max_objects: int = 500

    # 레벨1 스캔의 병렬 스레드 상한. 8 이었고 28코어 장비에서 29% 를 점유했다.
    # 총 작업량은 같고 순간 점유만 낮아지므로 벽시계 시간은 그만큼 늘어난다 —
    # 상시 실행이 아닌 지금은 그 교환이 맞다. AETHERUS_SCREENING_WORKERS 로
    # 필요할 때 올릴 수 있다.
    screening_workers: int = 3
    # Which objects an UNSCOPED screening takes when the catalogue exceeds the
    # bound. EPOCH_DESC: freshest non-simulation solutions first — stale
    # elements produce fictional conjunctions, and probe fixtures must never
    # crowd out real objects. CATALOG_ID_ASC: the pre-2026-09-02 behaviour,
    # kept for reproducing historical runs only.
    screening_selection_policy: str = "EPOCH_DESC"
    screening_hbr_m: float = 5.0
    conjunctions_page_limit: int = 200

    # P5 intervention benefit engine (IDEALIZED_REMOVAL counterfactuals only)
    # 24.0 이었다. P5 패널의 브라우저 클릭 하나가 이 기본값으로 베이스라인을 다시
    # 지으면서 API 를 막았다. 스크리닝 창과 같은 근거로 2.0 으로 내린다.
    benefit_horizon_hours: float = 2.0
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
