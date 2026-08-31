# Scoped `/v2` preview deployment contract

Use `aws/deploy-v2-preview.sh`, not the broad 1.0 app sync, for early 2.0 preview work. It uploads only:
- `app/v2/**`
- `app/js/earthus2/**`

It never overwrites `app/index.html`, existing 1.0 JS, the Service Worker, Supabase, or data objects. CloudFront invalidation is only requested when a real distribution id is provided in `EARTHUS_CLOUDFRONT_DISTRIBUTION_ID`; the script does not invent one.

A successful upload is not deployment completion. Run:
```bash
node tools/earthus2-v2/verify_v2_live.mjs
```
The verifier compares local/live bytes + MIME and then, when Playwright/Chrome are available, runs desktop/mobile browser stress and screenshots.
