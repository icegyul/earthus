"""Production code must never return to legacy five-digit catalog assumptions."""

from quality.check_no_tle_width import check_paths


def test_width_gate_rejects_legacy_five_digit_pattern(tmp_path) -> None:
    candidate = tmp_path / "bad.py"
    candidate.write_text("value = r'\\d{5}'\n", encoding="utf-8")

    assert check_paths([candidate]) is False


def test_width_gate_accepts_one_to_nine_digit_contract(tmp_path) -> None:
    candidate = tmp_path / "good.py"
    candidate.write_text("value = r'^[0-9]{1,9}$'\n", encoding="utf-8")

    assert check_paths([candidate]) is True
