# Private photos and verification documents

## Storage boundary

Production file bytes belong in two distinct private Google Cloud Storage buckets:

- `MEDIA_PROFILE_BUCKET`: normalized profile portraits.
- `MEDIA_KYC_BUCKET`: normalized identity, driving licence, RC and insurance images.

PostgreSQL stores opaque object references, SHA-256 checksums, byte counts, review state and access audit events. It does not store image bytes or base64 images. Names, phone numbers and document numbers are never used as object names. Credentials never enter browser/Android bundles.

Cloud Run uses its attached runtime service account through Application Default Credentials. Do not create or commit a service-account JSON key for this integration. With no buckets configured, production uploads and retrieval fail closed. If buckets are configured, API startup checks both buckets for uniform bucket-level access and **enforced** public-access prevention; a misconfigured bucket prevents startup. In development without buckets, images use process memory only and disappear on restart; use synthetic evidence, not real identity documents.

The backend authenticates and authorizes each read. There are no public object URLs or signed bearer download URLs. Responses use the API's `Cache-Control: no-store`. The JSON/base64 transport is deliberately compatible with the existing Android native cookie store; its transfer overhead is approximately 33%, so stored-size estimates are not bandwidth estimates.

## Who can see what

- Users can view their own portrait and documents.
- Authorized operators can view evidence through the review console. Each document view is recorded before file disclosure; do not give ordinary support staff operator privileges.
- An assigned rider can retrieve only the captain's approved portrait during the trip and for seven days after completion. Riders cannot retrieve captain KYC documents.
- Captains cannot retrieve rider portraits or rider business details through the statement endpoint. Business data remains on the rider's own statement.
- An unauthenticated or unrelated account cannot retrieve private files, even if it knows an account UUID.

Operator MFA remains an identity-provider/deployment requirement. Bucket administrators and backup administrators are privileged infrastructure roles; API authorization cannot protect against a compromised infrastructure administrator. Restrict and audit those roles separately.

## Upload controls and cost limits

The browser previews, crops portraits and compresses images before uploading. The API independently decodes and re-encodes JPEG/PNG images, strips original metadata, rejects SVG/HTML/PDF/other formats, limits dimensions and caps portrait files at 512 KiB and each KYC image at 2 MiB. There are four current KYC slots and one current portrait per account. Uploads are rate-limited. Store only evidence needed for the verification purpose; prefer masked identity evidence when the review process permits it.

Changing an approved captain's photo or document pauses new captain assignments and requires operator review. Changing evidence during an active captain trip is rejected. The application cannot be submitted until the required media and verified mobile exist. Existing version-0 captains retain their prior document-review path during migration; this exception does not waive the verified-mobile requirement.

## Retention and deletion

The hourly worker performs bounded, retryable cleanup:

- Failed/replaced uploads become eligible for physical object deletion when unreferenced and more than 24 hours old.
- Unsubmitted KYC documents expire after 30 days without recent draft activity, provided the account has never submitted a driver application.
- Referenced evidence for submitted/pending/approved/suspended drivers is not blindly deleted by age. The operator must approve and implement the appropriate retention schedule for its launch jurisdiction and contracts before collecting real evidence.
- Removing a rider portrait revokes API access immediately. Object cleanup follows the unreferenced-file schedule.

Cloud Storage soft delete, versioning, retention policies, legal holds and backups may retain data after the app deletes it and continue to incur charges. Explicitly configure and document these settings. Do not promise instantaneous erasure. The existing whole-account deletion workflow still requires operator processing; this change does not claim to automate deletion of all account, audit and trip records.

Do not configure blanket age-based deletion on live KYC/portrait prefixes: it could remove evidence still referenced by active accounts. Do not lock a bucket retention policy without an approved legal requirement. Application inventory cleanup handles references; any disaster-recovery copies need their own bounded schedule.

## Provisioning checklist

No buckets are created by this code change and no cloud resources have been provisioned automatically.

1. Create separate environment-specific portrait and KYC buckets in an approved region, normally close to the API/database. The current GCP deployment defaults to `asia-south1`; confirm residency, provider processing locations and operational requirements rather than assuming region alone establishes compliance.
2. Enable uniform bucket-level access and enforce public-access prevention on each bucket. Remove `allUsers`/`allAuthenticatedUsers` grants. Restrict runtime access to these buckets only.
3. Give the API runtime identity only `storage.buckets.get` for security preflight and `storage.objects.create/get/delete` for the two buckets (a custom role/bucket bindings can implement this). It does not need bucket administration or public-access management. Do not grant web/build identities access to KYC.
4. Use provider encryption at rest, TLS, private Cloud SQL access and encrypted backups. Customer-managed keys are an optional operating-policy decision with additional cost and key-management responsibilities, not an implemented claim here.
5. Configure Data Access audit logging and a bounded audit-log retention policy; keep image content, OTPs, credentials and identity numbers out of application logs.
6. Put the two bucket names in `api_env` as `MEDIA_PROFILE_BUCKET` and `MEDIA_KYC_BUCKET` in the GCP deployment config. `deploy.py` accepts only complete, distinct valid names. The actual bucket privacy check happens at API startup.
7. Apply migration 031, deploy backend and web/Android assets together, then test real bucket uploads, reviewer reads and deletion with synthetic documents before real onboarding.
8. Configure billing budgets/alerts and monitor bytes, object count, reads, deletes, egress and logging costs. Budget alerts notify; they do not cap spending.

## Cost model

Capacity = retained portraits + retained KYC + replaced/failed objects awaiting cleanup + soft-deleted/versioned/backup copies. Billing also includes operations, network transfer, application compute, audit logs and optional key-management services. Keeping binaries out of PostgreSQL avoids expanding database storage and every database backup with those binaries.

Planning illustration, **not a current regional quote**: 10,000 captains at an average 2 MB total each use about 18.6 GiB. At an assumed USD 0.03/GiB-month, primary at-rest storage is about USD 0.56/month. Four full-size 2 MiB documents plus a 512 KiB portrait per captain would instead use about 83 GiB for 10,000 captains, or USD 2.49/month under that same assumption. Neither figure includes requests, transfer, retained copies, tax, database or compute. Repeated portrait downloads can cost more than at-rest storage. Validate region-specific SKUs before setting a real budget; there is no asserted INR conversion here.

Primary references checked 26 October 2026: [Cloud Storage pricing](https://cloud.google.com/storage/pricing), [public access prevention](https://docs.cloud.google.com/storage/docs/public-access-prevention), [uniform access](https://docs.cloud.google.com/storage/docs/uniform-bucket-level-access), [access control](https://docs.cloud.google.com/storage/docs/access-control).
