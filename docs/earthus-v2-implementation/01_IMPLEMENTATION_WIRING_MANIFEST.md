# Implementation Wiring Manifest

## Runtime chain
`TOP MENU → SceneIntent → Compatibility Registry → Scene Transaction → Feature Selection → Legacy Preview Bridge / Backend v1 adapter → Existing Visual Engine → Cesium singleton → Evidence`.

The legacy bridge is intentionally a preview/integration bridge. The final 2.0 production data path remains `Provider → Backend v1.0 → Internal API/Read Model → Frontend`.

| Menu | Initial state | Primary examples | Allowed context | Exit requirement |
|---|---|---|---|---|
| EARTH | Quiet | none | Safety only | all v2-owned dynamic layers OFF |
| WEATHER | no feature until chosen | temp, rain, wind, PM2.5 | official safety overlay | old feature disposed before new commit |
| OCEAN | no feature until chosen | SST, wave, swell, scalar surface speed | WEATHER context only through approved recipe | all ocean-owned resources disposed |
| HAZARD | no feature until chosen | cyclone, quake, tsunami, wildfire, lightning | WEATHER or OCEAN, one context max | Safety remains independent |
| HUMAN | no feature until chosen | tourism, POI | WEATHER context | tourism generation/abort ownership preserved |
| SPACE | exclusive | aurora, orbit integration | none | Earth dynamic owners stopped before entry |
| PULSE | orchestrator | news/actions/events | selected domain via event recipe | no mass news pins; clustered/event-scoped |

### Important current-source truth
- Existing `current` is scalar surface-speed data in current evidence, so it is mapped to FIELD, not directional FLOW.
- Current tourism preview may reuse the operating `tourism` layer, but final Travel Discovery must consume Backend v1.0 contracts.
- PULSE news currently has an existing regional-news object route family; the adapter refuses to invent coordinates when the source has none.
