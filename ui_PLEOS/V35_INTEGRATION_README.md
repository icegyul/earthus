# EARTHUS V1 V35 — Actual App Integration
V30-V34 engines are connected through a single runtime integration facade:
SafetyGate -> local POI renderer -> Place Card -> live repository -> action gate.

V35 is adapter-based so it can be mounted into the existing EARTHUS app without forcing a rewrite of the current UI renderer.

Verification: PASS. Static POI query, Place Card selection, repository injection, state persistence, and safety action gate are covered.

Important: this package integrates the data physically present in the verified bundle; it does not claim a complete nationwide raw POI/polygon corpus.
