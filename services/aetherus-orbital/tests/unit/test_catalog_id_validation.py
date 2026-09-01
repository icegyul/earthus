"""Catalog ID contract tests for provider-neutral P1 ingestion."""

import pytest

from backend.ingestion.errors import InsufficientDataError
from backend.ingestion.providers.base import ObjectSelector, validate_catalog_id


@pytest.mark.parametrize("value", ["1", "25544", "100000", "123456789"])
def test_catalog_id_retains_each_supplied_decimal_digit(value: str) -> None:
    """A provider selector must not trim, coerce, or truncate a valid catalog identifier."""
    assert validate_catalog_id(value) == value
    assert ObjectSelector(catalog_id=value).catalog_id == value


@pytest.mark.parametrize("value", ["", "12A", "1234567890", " 12 ", 25544])
def test_catalog_id_rejects_values_outside_the_one_to_nine_digit_contract(value: object) -> None:
    """Whitespace, non-decimal, oversized, and coerced integer IDs must never reach a provider."""
    with pytest.raises(InsufficientDataError, match="1-9 digit decimal string"):
        validate_catalog_id(value)
