# V35 Repository Contract

Static data MUST be resolved locally from the bundled POI/admin/spatial packages.

Live repository methods may access network only for:
- current weather / forecast
- air quality
- ocean
- satellite/radar
- disaster alerts
- explicit data update
- transaction/deep-link handoff

Required behaviors:
- deduplicate identical active requests
- latest-request-wins for changing viewport/selection
- cancellation/abort support
- stale != unavailable != error
- 429 bounded retry; no infinite retry
- 5xx/offline safe failure
- source + timestamp + freshness preserved
- reservation availability is never inferred from stale cache
