"""P5 model/config unit tests."""

import pytest

from backend.benefit.models import (
    METRIC_CHANNELS,
    BaselineConfig,
    ScenarioConfig,
    build_baseline_config_hash,
    build_scenario_config_hash,
    is_simulation_source_grade,
)


def test_baseline_config_hash_deterministic():
    config = BaselineConfig(horizon_hours=24.0, shell_margin_km=50.0, max_objects=100)
    assert build_baseline_config_hash(config) == build_baseline_config_hash(config)
    other = BaselineConfig(horizon_hours=25.0, shell_margin_km=50.0, max_objects=100)
    assert build_baseline_config_hash(config) != build_baseline_config_hash(other)


def test_scenario_config_hash_covers_thresholds():
    base = ScenarioConfig(metric_types=("PC",), thresholds={"PC": 0.0})
    stricter = ScenarioConfig(metric_types=("PC",), thresholds={"PC": 1e-6})
    assert build_scenario_config_hash(base) != build_scenario_config_hash(stricter)


def test_metric_channels_exclude_miss_distance():
    assert "MISS_DISTANCE" not in METRIC_CHANNELS
    assert set(METRIC_CHANNELS) == {"PC", "MAX_PC", "CONJUNCTION_EXPOSURE"}


@pytest.mark.parametrize(
    "grade,expected",
    [
        ("PROBE", True),
        ("EVIDENCE_PROBE", True),
        ("SIMULATION_ONLY", True),
        ("PUBLIC_GP", False),
        (None, False),
        ("OPERATIONAL_CDM", False),
    ],
)
def test_simulation_source_grades(grade, expected):
    assert is_simulation_source_grade(grade) is expected
