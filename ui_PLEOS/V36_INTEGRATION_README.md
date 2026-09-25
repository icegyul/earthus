# EARTHUS V1 — V36 Actual UI Adapter Integration

V36 connects the existing V35 execution engine to the UI layer through a thin adapter. It does not duplicate domain/safety logic.

## Connected journey
Dock → Panel → Map → Local POI → Place Card → live repository injection → Dock switch → Pleos Driving Safety.

## Renderer mapping
- WIDE / Pleos: Floating Panel
- PHONE: Bottom Sheet
- Fold open: WIDE; folded: PHONE

## Safety
V33 remains the execution authority. UI hiding is not considered a safety boundary. Every driving-sensitive action is rechecked through the V35/V33 path.

## Data
Static POI query remains local. Live environment is injected through the repository. No static POI/admin interaction is allowed to create a network dependency.
