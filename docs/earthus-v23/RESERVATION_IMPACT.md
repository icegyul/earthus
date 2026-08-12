# PR-09 Reservation Impact — Shadow Contract

## Purpose and boundary

This slice compares two authorized provider evidence snapshots for an opaque
watch. It can propose that the user review a change. It cannot send a
notification, create/change/cancel a reservation, charge a payment, call a
provider, or infer a provider result.

```text
authorized provider snapshot A + snapshot B
                  ↓
        evidence diff + fingerprint
                  ↓
 PENDING_USER_CONFIRMATION or WITHHELD
                  ↓
 user REVIEWED / DISMISSED acknowledgement only
```

## Fail-closed rules

- Provider authorization, source URL, revision, observed time and outcome are
  required. Missing evidence becomes `UNKNOWN`, never available or sold out.
- An unauthorized, stale, mismatched-provider or missing prior snapshot is
  `WITHHELD` or `BASELINE_RECORDED`; it has no action.
- Identical evidence is `NO_CHANGE`. A repeated fingerprint is
  `DUPLICATE_WITHHELD`.
- A correction/new revision is a fresh proposal only; it does not alter any
  reservation. Every proposal has `notificationSent=false`, `providerAction=null`
  and `paymentAction=null`.
- User acknowledgement records only `REVIEWED` or `DISMISSED`; it never invokes
  a provider. The opaque subject reference is not a reservation identifier.

## Required production gates

1. Provider-specific written contract for availability, changes, cancellation,
   rate limit, permitted cache/history and user notification.
2. Authenticated provider adapter with source/time/revision/sample-count
   preservation, retry/backoff, correction replay and outage coverage.
3. Consent, delete/retention, RLS tenant A/B denial and notification delivery
   idempotency proof.
4. Provider sandbox hardware/API test, canary/rollback rehearsal, and PD
   approval before any notification or provider action route is added.

Until all gates pass, this module stays a pure static shadow contract with no
public UI consumer.
