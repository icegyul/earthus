"""UTC-only time-scale handling tests."""

from datetime import UTC, datetime

import pytest

from backend.orbit.errors import EphemerisValidationError
from backend.orbit.time_scale import (
    days_since_sgp4_epoch,
    julian_date,
    require_utc_datetime,
)


def test_parses_zulu_suffix_to_utc():
    parsed = require_utc_datetime("2026-08-23T12:00:00Z", "start")
    assert parsed.tzinfo is not None
    assert parsed.utcoffset().total_seconds() == 0


def test_normalizes_explicit_offset_to_utc():
    parsed = require_utc_datetime("2026-08-23T15:00:00+03:00", "start")
    assert parsed == datetime(2026, 8, 23, 12, 0, 0, tzinfo=UTC)


def test_rejects_naive_datetime():
    with pytest.raises(EphemerisValidationError) as raised:
        require_utc_datetime("2026-08-23T12:00:00", "start")
    assert "naive" in raised.value.message


def test_rejects_non_string_and_garbage():
    for value in (None, 42, "not-a-time", ""):
        with pytest.raises(EphemerisValidationError):
            require_utc_datetime(value, "start")


def test_julian_date_known_value():
    jd = julian_date(datetime(2000, 1, 1, 12, 0, 0, tzinfo=UTC))
    assert abs(jd - 2451545.0) < 1e-6


def test_days_since_sgp4_epoch_known_value():
    days = days_since_sgp4_epoch(datetime(2000, 1, 1, 12, 0, 0, tzinfo=UTC))
    assert abs(days - (2451545.0 - 2433281.5)) < 1e-6
