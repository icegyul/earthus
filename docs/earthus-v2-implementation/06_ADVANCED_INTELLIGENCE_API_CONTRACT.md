# Internal API contract

All advanced endpoints are Earthus Internal API only. No browser direct call to KTO/KMA/AirKorea/NGO provider is introduced by this package.

- `GET /api/v2/pulse`
- `GET /api/v2/events/:id`
- `GET /api/v2/events/:id/evidence`
- `GET /api/v2/travel/discovery`
- `GET /api/v2/travel/place/:id/why-now`
- `GET /api/v2/travel/place/:id/best-window`
- `GET /api/v2/travel/place/:id/related`
- `GET /api/v2/environment/pollution`
- `GET /api/v2/environment/pollution/:id`
- `GET /api/v2/environment/pollution/:id/transport`
- `GET /api/v2/actions`
- `GET /api/v2/memory/analogs`
- `GET /api/v2/for-me`
- `GET /api/v2/ops/intelligence-health`

Every response must carry `releaseState`, source/provenance, time semantics and explicit unavailable/reason state when required evidence is missing.
