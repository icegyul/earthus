"""UTC-only time handling; naive timestamps are rejected, never assumed."""

from datetime import UTC, datetime
from typing import Any

from backend.orbit.errors import EphemerisValidationError

_JULIAN_EPOCH_UNIX_DAYS = 2440587.5
_SGP4_EPOCH_JULIAN_DATE = 2433281.5


def require_utc_datetime(value: Any, field_name: str) -> datetime:
    """Parse one client-supplied timestamp and normalize it to timezone-aware UTC."""
    if not isinstance(value, str) or not value.strip():
        raise EphemerisValidationError(f"{field_name} is required and must be an ISO-8601 string")
    text_value = value.strip()
    try:
        parsed = datetime.fromisoformat(text_value.replace("Z", "+00:00"))
    except ValueError as error:
        raise EphemerisValidationError(
            f"{field_name} is not a valid ISO-8601 timestamp",
            {"received": text_value},
        ) from error
    if parsed.tzinfo is None or parsed.tzinfo.utcoffset(parsed) is None:
        raise EphemerisValidationError(
            f"{field_name} must carry an explicit UTC offset; naive datetimes are rejected",
            {"received": text_value},
        )
    return parsed.astimezone(UTC)


def julian_date(moment: datetime) -> float:
    """Return the astronomical Julian Date for one timezone-aware instant."""
    return moment.timestamp() / 86400.0 + _JULIAN_EPOCH_UNIX_DAYS


def days_since_sgp4_epoch(epoch: datetime) -> float:
    """Express one UTC epoch as days since 1949 December 31 00:00 UT for SGP4 init."""
    return julian_date(epoch.astimezone(UTC)) - _SGP4_EPOCH_JULIAN_DATE


def utc_now() -> datetime:
    """Return the current aware UTC instant."""
    return datetime.now(UTC)
