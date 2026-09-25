# EARTHUS V1 V35 — Actual App Integration Handoff

## Goal
Connect the previously built V20-V34 engines into the real EARTHUS application without replacing the existing renderer.

## Runtime chain
App Shell -> SafetyGate -> Local Data Engine -> Map/POI Renderer -> Context/Place Card -> Live Repository -> UI Action Gate -> Pleos Renderer.

## Non-negotiables
1. Static admin/POI/spatial data never blocks on network.
2. POI selection and map state survive Dock changes.
3. UNKNOWN driving state fails safe.
4. SafetyGate is checked at action execution, not only when rendering buttons.
5. Disaster safety override suppresses leisure/commercial actions.
6. Network errors never masquerade as empty/safe data.
7. Every live value carries source/time/freshness.
8. No secrets in the client bundle.

## Integration order
1. Replace app's POI query implementation with V28 local query adapter.
2. Mount V33 SafetyGate at the action dispatcher.
3. Mount V29 Place Card after POI selection.
4. Inject live environment from the existing repository.
5. Preserve selectedPoiId/map viewport when Dock/Panel changes.
6. Add Network Audit hooks.
7. Run V35 tests before packaging.

## Explicitly not included
This package does not claim to contain a complete nationwide POI corpus or full raw nationwide polygon corpus. It integrates whatever verified bundle is physically present.
