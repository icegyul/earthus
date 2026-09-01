"""Why a gate check is unmet — the distinction a single PARTIAL destroys.

A phase gate that reports only PASS or PARTIAL conflates three unrelated
situations: work nobody has done yet, work waiting on data we could go and get,
and work that cannot start until another organisation agrees to something. They
have completely different costs and completely different owners, and collapsing
them makes a roadmap unreadable — every phase looks equally stuck.

This vocabulary is deliberately about *cause*, not effort. A check is only
EXTERNAL_PARTNER_GATED when no amount of our own engineering can satisfy it. The
2026-09-02 CDM reality test is the cautionary case: operational Pc was recorded
as blocked on a TraCSS partnership, while five internal gates (JSON-only parser,
6x6 covariance type, TEME frame, km2 units, COMBINED_HBR semantics) rejected a
spec-shaped CDM before any partner data could have been read. It was
BUILDABLE_NOW wearing a partner's clothes, and the misclassification pointed
business development at a door that was locked from our side.

See docs/audit/METRIC_PROVENANCE_HARDENING_2026-09-02.md.
"""

from __future__ import annotations

from typing import Any

#: The check is met. Present so every check carries a class and none is silent.
NONE = "NONE"

#: Everything needed is already in the repository or on this machine. No
#: credential, no download, no agreement — only work.
BUILDABLE_NOW = "BUILDABLE_NOW"

#: Waiting on data we can obtain unilaterally: a free account, a public
#: download, a rate-limited feed. Cost is time and setup, not negotiation.
EXTERNAL_DATA_GATED = "EXTERNAL_DATA_GATED"

#: Cannot be satisfied by our own engineering at any effort: it needs another
#: organisation to grant access, sign something, or operate a spacecraft on our
#: behalf. Use this sparingly and only after proving the internal path is clear.
EXTERNAL_PARTNER_GATED = "EXTERNAL_PARTNER_GATED"

#: Blocked on a product decision, not on capability. Naming it stops a judgement
#: call from masquerading as an engineering constraint.
DECISION_PENDING = "DECISION_PENDING"

BLOCKER_CLASSES = frozenset(
    {NONE, BUILDABLE_NOW, EXTERNAL_DATA_GATED, EXTERNAL_PARTNER_GATED, DECISION_PENDING}
)


def classify(
    checks: dict[str, bool], declared: dict[str, tuple[str, str]]
) -> dict[str, Any]:
    """Attach a cause and a reason to every unmet check.

    ``declared`` maps a check name to ``(blocker_class, reason)``. Every failing
    check must appear there: an unclassified blocker is exactly the ambiguity
    this module exists to remove, so it raises rather than defaulting to a
    comfortable class.

    Returns the per-check classification plus counts by class, so a reader can
    see at a glance how much of a PARTIAL is our own work outstanding.
    """
    unknown = sorted(set(declared) - set(checks))
    if unknown:
        raise ValueError(f"blocker declared for checks that do not exist: {unknown}")

    invalid = sorted(
        name for name, (cls, _) in declared.items() if cls not in BLOCKER_CLASSES
    )
    if invalid:
        raise ValueError(f"unknown blocker class declared for: {invalid}")

    failed = [name for name, ok in checks.items() if not ok]
    unclassified = sorted(name for name in failed if name not in declared)
    if unclassified:
        raise ValueError(
            "every unmet check must declare why it is unmet; missing: "
            f"{unclassified}"
        )

    per_check: dict[str, dict[str, str]] = {}
    for name, ok in checks.items():
        if ok:
            per_check[name] = {"blocker_class": NONE, "reason": "check is met"}
            continue
        blocker_class, reason = declared[name]
        per_check[name] = {"blocker_class": blocker_class, "reason": reason}

    counts = {cls: 0 for cls in sorted(BLOCKER_CLASSES)}
    for entry in per_check.values():
        counts[entry["blocker_class"]] += 1

    return {
        "by_check": per_check,
        "counts": counts,
        "unmet_buildable_now": sorted(
            name for name in failed if declared[name][0] == BUILDABLE_NOW
        ),
        "unmet_requiring_others": sorted(
            name
            for name in failed
            if declared[name][0] in {EXTERNAL_DATA_GATED, EXTERNAL_PARTNER_GATED}
        ),
    }
