# External gates that code cannot create for you

- AWS account/IAM roles
- S3 buckets and CloudFront distribution
- Supabase project and production database credentials
- Cesium ion or approved self-hosted terrain/bathymetry endpoints
- KMA/AirKorea/KTO and other provider credentials
- commercial data licenses/quotas
- Apple/Google push credentials if notifications are enabled
- DNS/TLS/domain ownership

Keep secrets outside repository and use a server-side secret manager.
