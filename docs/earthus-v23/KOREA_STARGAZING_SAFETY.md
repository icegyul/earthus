# Nationwide Korea Stargazing Safety — Shadow Contract

## Scope

This is a nationwide Korea, location-selected stargazing preflight. It has no
facility, campground, observatory, road, inventory, reservation or payment
concept. It may prepare evidence for calibration; it never issues a public
recommendation.

```text
selected Korean coordinates
  + KMA official-warning Safety result
  + cloud / visibility / humidity / precipitation / moon / darkness evidence
  → WITHHELD or EVIDENCE_READY_CALIBRATION_SHADOW
```

## Korea-first rules

- KMA Safety must be applicable, recognized and not block a positive result.
  `WARNING`, `DANGER`, `UNKNOWN`, stale, unmapped and missing KMA evidence are
  all `WITHHELD`.
- Each of the six sky/astronomy factors must provide value, unit, official source
  URL, observation time and revision. Missing, future or over-six-hour-old
  evidence is not filled or estimated.
- The input accepts only coordinates inside the Korea scope. Outside it returns
  `OUT_OF_KOREA_SCOPE`, not a safety conclusion.
- An evidence-ready result keeps `publicRecommendation=null`, `action=null` and
  `reservation=null`. It does not assert that a location is safe or observable.

## Japan and Taiwan minimum scope

`regional-warning-adapter.js` defines the shared fail-closed contract for KMA,
JMA and CWA supplied official snapshots. Japan and Taiwan presently receive only
this safety shape: official warning evidence may block a positive result;
missing, stale, unlicensed or unconnected evidence is `UNKNOWN`. No place,
reservation, weather-fit or recommendation functionality is included.

The existing JMA warning collector is documented as stale, so it cannot satisfy
the JMA branch until its live source and rights are revalidated. CWA has no
connected warning adapter yet. Neither is silently substituted with another
country's source.

## Gates before public Korean recommendation

1. Official KMA warning-boundary/hierarchy mapping, or another documented method
   that can establish a non-warning result without treating an approximate
   station mapping as safe.
2. Rights/freshness-approved nationwide sources for all six factors, with actual
   source/time/revision/n preservation.
3. Stargazing curve/domain review, real-device/accessibility validation, canary
   and rollback rehearsal, and explicit PD approval of the Decision flag.
