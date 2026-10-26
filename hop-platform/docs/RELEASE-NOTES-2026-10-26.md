# Hop Platform Release Notes & Trust Improvements (2026-10-26)

## 1. Executive Summary

This release implements core recommendations from the [Product Improvement Review](PRODUCT-IMPROVEMENT-REVIEW.md), positioning Hop around dependable, verified commutes and transparent business reimbursement:

- **Verified Mobile & Account Ownership**: Mandatory OTP verification before booking, captain onboarding, or going online. Phone number changes require re-verification.
- **Guided Captain Onboarding & Private Documents**: A resumable 4-step wizard with server-side drafts, rejection corrections, and a strict private Cloud Storage boundary separating public portraits from sensitive KYC credentials.
- **Expanded Driver Card & Trust Labels**: Assigned riders see the captain's approved portrait, vehicle make/model/colour, clear verification badges, and masked communication.
- **Reimbursement & Trip Statements**: Server-side generated PDF trip statements with immutable fare snapshots, business profiles (work email, company, GSTIN, cost centre), and clear legal distinction from GST tax invoices.
- **Matching & Road ETA**: OSRM table road travel time with short Redis caching, non-penalizing offer supersession, and bounded favourite-driver bonuses.
- **Captain UI & Map Alignment**: Fixed pin coordinate centering (`anchor="center"`), instant GPS location centering without toggling duty, and a sleek floating pill topbar.
- **Android Stability & Google Maps API**: Integrated valid Google Maps API keys for WebView and Capacitor environments, and initialized Firebase via reflection in `MainActivity.java` to ensure compile resilience across Java 17/Gradle runners.
- **Carpooling Status**: As instructed, carpool expansion remains on hold for a dedicated launch phase.

---

## 2. Delivered Features & Technical Architecture

### 2.1 Mobile Phone Verification
- **Database**: Migration `031_trust_onboarding_receipts.sql` introduced `verified_phones` table tracking account ownership, verified timestamps, and hashed OTP challenges.
- **API Endpoints**:
  - `POST /api/profile/phone/challenge`: Issues rate-limited OTP challenges bound to the authenticated account.
  - `POST /api/profile/phone/verify`: Confirms OTP ownership and updates verified status.
- **Enforcement**: Profile phone updates cannot bypass OTP verification. Both ride booking (`POST /api/rides`) and captain availability (`POST /api/driver/duty`) enforce phone verification.

### 2.2 Guided Captain Onboarding & Secure Document Storage
- **Onboarding Flow (`CaptainOnboarding.tsx`)**:
  - Step 1: City and vehicle eligibility.
  - Step 2: Verified mobile and identity credentials.
  - Step 3: Vehicle make, model, colour, registration number, and private documents (driving licence, RC, insurance, portrait).
  - Step 4: Payout details, safety agreement, and submission review.
- **Storage Separation (`media_store.go`, `PRIVATE-MEDIA.md`)**:
  - **Private KYC Bucket (`MEDIA_KYC_BUCKET`)**: Strictly stores identity cards, driving licences, RC books, and insurance copies. Accessible only by document owners and authorized reviewers.
  - **Profile Bucket (`MEDIA_PROFILE_BUCKET`)**: Stores normalized captain and rider portraits. Only approved captain portraits are served to assigned riders during active rides and up to 7 days post-completion.
  - **PostgreSQL**: Stores only cryptographic checksums (SHA-256), byte sizes, review states, and audit trails. Binary data is never stored in the database.
  - **Fail-Safe Startup**: Production startup validates uniform bucket-level access and public-access prevention enforcement. Unconfigured buckets fail closed in production; development falls back to disposable in-memory storage.

### 2.3 Expanded Driver Card & Trust Details
- **Rider Interface (`ActiveRideCard.tsx`, `DriverProfileModal.tsx`)**:
  - Displays approved captain portrait.
  - Displays vehicle make, model, and colour alongside plate registration.
  - Displays clear verification badges ("Mobile Verified", "Identity Reviewed", "Commercial Licence Approved").
  - Masked calling and in-app chat to preserve phone number privacy.
  - Reporting trigger for "Different driver or vehicle arrived".

### 2.4 Reimbursement & Downloadable Trip Statements
- **PDF Generation (`receipts.go`)**:
  - Native PDF generator using embedded TrueType fonts (`DejaVuSansCondensed.ttf`) without heavy external CLI dependencies.
  - Records an immutable snapshot of base fare, distance, time, surcharges, discounts, and payment status at trip completion.
  - Explicitly states: *"This trip statement summarizes ride details and settlement status. It is not a GST tax invoice."*
- **Business Profile Integration**:
  - Riders can store business email, organization name, GSTIN, and cost centre in their profile.
  - Business details are embedded in rider trip statements but excluded from captain records.

### 2.5 Dispatch & Road Travel Time Improvements
- **OSRM Table Shortlist**: Straight-line distance is replaced with road travel time queries over candidate shortlists (1.2s timeout with Redis caching).
- **Fair Driver Scoring**:
  - Superseded offers (trips accepted by a competing captain) are recorded as `superseded` rather than `declined` or `missed`, protecting the driver's acceptance rating.
  - Favourite driver bonus is bounded to a maximum of 60 seconds road-time equivalent.

### 2.6 Map Pin Alignment & Android Enhancements
- **Pin Centering**: Resolved CSS offset issue where circular markers floated off the actual road coordinates by anchoring pins at center coordinates.
- **Instant Location Centering**: Captain map initializes centered on current GPS location immediately upon granting permissions, without requiring duty to be toggled on.
- **Floating Controls**: Added `◎ Re-center` floating action button and glassmorphic pill topbar.
- **Android Runtime Stability**:
  - Configured GCP Google Maps API key `AIzaSyB4ZlthuLgAY2D6iHOFVV4iicRwRyZHwys` across all `.env.android` files.
  - Replaced direct `FirebaseApp` references in `MainActivity.java` with reflective invocation (`Class.forName("com.google.firebase.FirebaseApp")`), ensuring CI builds succeed without requiring explicit classpath dependencies in `:app`.

---

## 3. Production Deployment & Operational Gate Checklist

Before onboarding real participants in a production environment, complete the following infrastructure setup:

| Area | Requirement | Action Required | Status |
|---|---|---|---|
| **Database** | Migration `031_trust_onboarding_receipts.sql` | Run migration against Cloud SQL instance using `api migrate` or migration container. | Ready for migration |
| **SMS Provider** | Production SMS Gateway | Configure SMS delivery provider (AWS SNS, Twilio, or MSG91) in production environment variables (`SMS_PROVIDER_KEY`, `SMS_SENDER_ID`). | Integration Ready |
| **GCS Buckets** | Private Cloud Storage Buckets | Create `hop-prod-media-profile` and `hop-prod-media-kyc` in `asia-south1`. Enable Uniform Bucket-Level Access and enforce Public Access Prevention. Grant `roles/storage.objectAdmin` to `hop-api` service account. | Checklist in `PRIVATE-MEDIA.md` |
| **Maps & Places** | Browser & Mobile Maps Key | Verify HTTP referrer restrictions for web domains (`*.run.app`) and Android package restrictions (`com.hop.rider`, `com.hop.captain`) in GCP API Credentials Console. | Keys Configured |
| **Mobile Testing** | Physical Android Verification | Test APK on physical Android hardware for background GPS sleep, battery optimization exemptions, camera capture/crop, and push notifications. | Checklist in `ANDROID.md` |
| **Operational Policy** | KYC Retention & Operator MFA | Enforce mandatory MFA for operator accounts and define jurisdictional document retention policies before collecting government identity proofs. | Documented in `PRIVATE-MEDIA.md` |

---

## 4. Verification & Testing Summary

- **Backend Integration Suite**: `GOTOOLCHAIN=auto go test ./internal/app` passed (2.28s).
- **Race Detector**: `go test -race ./internal/app` passed.
- **Deploy Unit Tests**: `python3 -m unittest infra/gcp/test_deploy.py` passed (5/5 tests).
- **Frontend Typechecks & Builds**: `npm run typecheck` and `npm run build` passed across `rider`, `captain`, and `admin`.
- **Capacitor Mobile Sync**: `npm run android:captain` and `npm run android:rider` synced native Android assets.
