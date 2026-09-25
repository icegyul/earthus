# EARTHUS V36 UI Adapter Contract

Purpose: connect the existing V35 app integration engine to actual EARTHUS UI components without duplicating safety/data logic.

Rules:
- Dock UI calls `openDock()` only; it never implements domain rules.
- Panel is single-open. Re-tap closes the panel.
- Map state and selected POI persist across Dock changes.
- POI selection delegates to V35 Place Card/Context and injected live repository.
- Driving restrictions are enforced by V33 SafetyGate through V35.
- UI visibility is not the security boundary; action execution must call `action()`.
- PHONE renderer may map panel to Bottom Sheet; WIDE/Pleos renderer maps panel to Floating Panel.
- No static POI/admin/map interaction should require network.
