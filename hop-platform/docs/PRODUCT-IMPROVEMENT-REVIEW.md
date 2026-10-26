# Hop product improvement review

Reviewed 26 October 2026. Scope: local Hop implementation and public primary sources. This is a product recommendation, not a production certification. No live ride data, user interviews, device testing or city-specific legal opinion was available. Priorities and targets below are proposals, not measured results. Application code was not changed.

## Recommended direction

Build the most dependable commute experience in a small set of office corridors: verified participants, accurate pickup estimates, clear fares, useful support and reimbursement documents. Add private-vehicle carpooling as a distinct, controlled product after the core experience is reliable and the operating model is reviewed for the launch state.

Do not compete nationally on discounts or number of features. A small platform needs concentrated supply and repeat demand. An office corridor with two peak periods is a more testable starting point than an entire city with every vehicle category.

## 1. What exists and what actually needs improvement

Source inspection matters because FEATURES.md and ARCHITECTURE.md contain older statements that conflict with newer Android implementation.

- **Mobile:** OTP login exists in `backend/internal/app/otp.go`. Booking and captain application/acceptance use `hasMobile` in `shared.go`, but that helper accepts any saved phone number. It checks presence rather than ownership. `profile.go` lets a user edit that number without OTP confirmation. The profile badge uses account issuer (`phone_login`), rather than verification of the currently displayed number. This can show misleading verification after a phone-login account changes its profile number.
- **Photos:** `ProfilePanel.tsx` uses initials and avatar colours. There is no real profile photo flow in the reviewed profile code. The captain application asks for operator-supplied licence and insurance references; it is not an in-app document-upload journey.
- **Captain onboarding:** `DriverPanel.tsx` provides one application form. The admin checklist and approval machinery exist, so improve the collection, review, correction and activation journey around them.
- **Driver details:** `TripHero.tsx` already displays driver name, rating/count, trip count and registration. Improve this card with verified photo, make/model/colour, meaningful verification states and working contact actions; do not rebuild information already shown.
- **Matching:** `dispatch.go` has Redis candidate lookup, eligibility checks, staged radii of 1.5/3/6/20 km, 15-second stage intervals and transactional acceptance. Its score uses straight-line distance with a constant road multiplier, rating, recent acceptance, idle time and a large favourite bonus. This is a useful foundation, but not a road ETA optimizer.
- **Shared rides:** `shared.go` already pairs two commercial ride requests: pickups within 500 m, drops within 1 km, requests within five minutes. It uses a three-minute wait, a 25% discount and nearest-first stop ordering. This is shared taxi dispatch, not a person publishing seats in a personal commute.
- **Receipts:** payment/trip notifications say a receipt is available, and ride history contains fare information. A dedicated downloadable reimbursement PDF, invoice lifecycle and business-expense workflow were not found in the inspected routes/UI. A history entry is not equivalent to these deliverables.
- **Android:** `docs/ANDROID.md` and native sources include Capacitor apps, a captain foreground location service and configurable FCM. Configuration and on-device reliability must be verified; describing native tracking/push as entirely absent would be inaccurate.

## 2. Rider identity, phone and profile

Make verified mobile ownership mandatory before the first booking and before a captain submits an application or goes online. Permit browsing/estimating before verification. Keep rider photos optional initially; require an approved captain photo before activation.

Suggested rider flow: language → mobile → OTP → name → location explanation → pickup confirmation → first booking. Ask for emergency contacts after the first booking or through a contextual safety prompt. Business email, accessibility preferences and payment preferences should be progressive steps rather than barriers to trying the app.

Model phone verification explicitly: normalized E.164 number, verification timestamp, challenge purpose and pending number. Editing a number must start a new verification challenge. Keep the old verified number active until the replacement is verified. The badge must describe that exact number. Handle duplicate numbers through authenticated account linking/recovery; never merge identities merely because someone typed the same number. Protect phone changes with recent authentication, throttling and an alert to the old contact where possible. OTP proves current control, not permanent identity or freedom from SIM-swap risk.

Use SMS autofill mechanisms with manual fallback; avoid SMS inbox/contact permissions. Show resend timing, delivery failure, wrong-number correction and recovery clearly. Test real provider delivery across networks and languages.

For photos: camera/gallery, crop, compression, upload progress, retry, preview and removal. Strip EXIF/location metadata; validate decoded content and dimensions server-side, not just extensions. Store private object keys and serve controlled derivatives. Keep captain public portraits separate from private KYC originals. Restrict access by purpose, audit document views and define retention/deletion. Re-review changed captain photos; use vendor-assisted selfie checks only with an appropriate privacy design, accessibility fallback and human appeal. A work-email badge or phone badge must never imply a background check.

## 3. Captain onboarding as a resumable workflow

Replace the long form with these stages:

1. **Eligibility:** operating city, vehicle class, minimum age/licence rules and a clear explanation of fees/payouts.
2. **Identity:** verified mobile, legal name, approved portrait and identity evidence through a suitable verification provider/private review process. Do not assume Aadhaar must be the only method.
3. **Driver credentials:** licence category/expiry and required checks for the jurisdiction.
4. **Vehicle:** registration, owner authorization if relevant, make/model/colour, seat capacity, RC, insurance and permits/fitness/PUC where applicable.
5. **Payout:** beneficiary verification and payment preference. Keep payout details inaccessible to riders.
6. **Training and readiness:** safety, fare/payment disputes, pickup PIN, cancellation rules, accessibility and a short comprehension check.
7. **Review and activation:** visible status, expected review window, document-specific rejection reasons, resubmit only failed items, support escalation and a device readiness check before going online.

Persist drafts after each stage. Allow interrupted upload recovery and local-language instructions. OCR can prefill; users confirm extracted data and reviewers resolve mismatches. Separate identity, document, vehicle and payout states rather than one broad verified flag.

Use draft → submitted → under review → action required → approved → active, with suspended/expired states. Enforce server-side activation gates and recheck eligibility when accepting rides. Expiry reminders should precede expiry; expired credentials block new assignments. Define how an in-progress trip is safely handled rather than abruptly terminating it.

Track funnel conversion per step, time to first eligible trip, rejection reasons, reviewer queue age and support contacts. Introduce assisted onboarding only where funnel evidence shows a need. Reviewer permissions, evidence retention and change history are part of this feature, not later extras.

## 4. Driver information and mutual trust

After assignment, show approved captain photo and name, vehicle registration/make/model/colour, rating with sample size, completed-trip count, pickup ETA, contact buttons, share trip and a clearly separated start PIN. Include an explicit report option for a different driver/vehicle. Repeated mismatch reports should reach human safety review.

Before assignment, expose only aggregated availability. Show raw phone numbers only when required by the applicable service rules; default product design should use a real masked-calling provider and in-app chat. The existing production masked-call integration still needs provider completion according to feature documentation. Define contact availability and expiry around the trip.

For captains, show rider first name, pickup landmark, relevant accessibility request and payment method without unnecessarily exposing personal details. Give both parties blocking/reporting, trip-specific support and a clear cancellation reason flow. Safety controls need an incident response process and accountable staff. An SOS button alone is not an emergency response service.

## 5. Matching improvements with highest expected value

### Correctness and measurement first

Record offer created, push accepted by provider, device acknowledged, displayed, explicitly declined, expired, accepted and superseded. Provider acceptance does not prove device delivery. Currently `settleOffers` labels nonwinning offers as missed, and the score uses accepted outcomes divided by settled outcomes. Drivers can be penalized because someone else accepted first. Exclude superseded/unseen offers from response-quality denominators and distinguish technical failures from explicit choices.

Log dispatch version and reason codes; measure request-to-assignment time, request-to-pickup time, ETA error, completion, cancellation reason, deadhead km and captain earnings per online hour. Break these down by corridor, time, vehicle class, new/existing captain and device/network conditions. Do not infer that a new algorithm is better from average assignment time alone.

### Road-aware ranking

Keep Redis GEO for a broad shortlist; use a road travel-time matrix to rank the best eligible candidates. A nearby captain across a divided highway may be slower than a farther captain on the correct carriageway. Include heading, pickup access and GPS age/accuracy. Plain OSRM gives road routing, not live traffic unless a separate traffic-capable setup is supplied. Cache briefly and keep routing outside long-held assignment transactions; revalidate availability and quote/offer state during atomic acceptance.

Use a bounded score in interpretable units: pickup minutes + estimated cancellation/reassignment cost + deadhead cost + location uncertainty − capped idle-time credit − small capped repeat-driver preference. These are proposed terms, not calibrated weights. The existing favourite bonus is five score units, while the distance component is minute-like; cap the permitted extra pickup delay instead of allowing loyalty to dominate reliability. Ratings should have sample-size smoothing and a neutral new-captain prior.

Replace a fixed 20-km expansion with zone/category-specific maximum pickup time and distance, visible to riders. Adapt offer batch size and wait windows to supply and actual delivery latency. Acknowledge cancellation/supersession promptly on other captain devices. Preserve first-accept transaction safety. Microbatch assignment across multiple simultaneous requests can come later, after instrumentation and road ETA improvements.

### Evaluation

Replay historical requests when sufficient consented data exists, then shadow-score without affecting dispatch. Shadow/replay estimates cannot prove causal improvement because historical supply and acceptances change under a new policy. Use a staged live experiment, preferably corridor/time switchbacks with controls for marketplace interference. Keep assignment conflicts, safety, fairness and earnings as guardrails. Do not use sensitive traits as general quality proxies or punish captains for all declines. Publish understandable driver-facing rules and an appeal process.

## 6. Carpool: yes, as a separate commute product

Position it as **Hop Commute: share a trip you were already taking**. A ride giver publishes an existing route, departure window, seats and recurring weekdays. A ride taker requests a seat and agrees on pickup/drop meeting points and contribution. Keep commercial captain approval separate from commuter verification, while sharing identity, notifications, maps, support and payments infrastructure where appropriate.

Minimum pilot: recurring schedules with holiday/leave exceptions; verified phone and optional work/community affiliation; verified driver/vehicle evidence; safe meeting points; per-person seat reservations and start confirmation; explicit pickup windows; no-show policy; blocked-user exclusion; trip sharing; individual payment/contribution records; and priced backup commercial booking when a match fails. Reconfirm each occurrence rather than assuming a recurring template guarantees a seat. Avoid exposing exact home addresses in discovery.

Carpool matching must examine route direction, road overlap, departure/arrival windows, maximum walking distance, driver detour, existing passengers' added delay, legal seat capacity, blocked relationships and contribution rules. Enumerate valid pickup/drop insertions, with each pickup preceding its own drop; reject infeasible plans before ranking. A spatial corridor and time-bucket index can shortlist before road-route evaluation. Atomically reserve seats with expiring holds and idempotent retries to prevent overselling.

Illustrative pilot limits, subject to user research: departure tolerance ±10 minutes, maximum driver detour five minutes or 10% of baseline trip time (whichever is stricter), and maximum walking distance 300–500 m where safe and accessible. These are starting hypotheses, not universal requirements. Measure actual passenger-added delay too. Do not equate straight-line pickup/drop proximity with a feasible shared route.

Introduce distinct domain entities: commute template, dated occurrence, vehicle/seat capacity, seat reservation, stop plan/version, contribution record and cancellation/no-show event. Existing paired rides can supply some trip/safety primitives, but are not sufficient as the full carpool model.

**Existing shared-taxi economics need attention:** unmatched riders keep the 25% discount after waiting. Example: a ₹200 undiscounted fare becomes ₹150. If ₹200 captain compensation is promised, the platform must fund ₹50; if the captain receives ₹150, the rider discount reduces captain gross by ₹50. The current mechanism alone does not establish which promise is commercially sustainable. Introduce a disclosed subsidy budget, minimum captain net contribution and explicit wait/solo alternatives. For matched trips, compare extra fuel/time with combined revenue; the existing combined-fare threshold is not a full profitability test.

Private carpool contributions need a documented eligible-cost methodology and caps appropriate to the approved operating model. Do not reuse commercial surge, negotiation or guaranteed profit claims automatically. The Ministry's July 2025 parliamentary answer distinguishes noncommercial sharing from commercial ride sharing; it is not permission for every app model in every state. Before enabling a city, confirm current state rules, relevant authorizations, insurance/occupant coverage, platform fees, taxation and the treatment of employer reimbursements. No launch state was specified here. [Government parliamentary answer](https://sansad.in/getFile/loksabhaquestions/annex/185/AS172_dxhqeR.pdf?source=pqals), [2025 aggregator guidelines](https://parivahan.gov.in/sites/default/files/NOTIFICATION%26ADVISORY/MV-Aggregators-Guidelines-2025%20-%20English%20and%20Hindi.pdf).

## 7. Bills, reimbursement and business travel

User flow: trip completed → fare breakdown → payment status → receipt download/share → optional business details → expense submission. Also expose History → trip → receipt, and a monthly business export. Email should be verified and optional for ordinary riders. A business profile stores legal business name, GSTIN where applicable, work email, employee/project/cost-centre and trip purpose.

The document should include immutable document ID/version, ride ID, issue date, trip timestamps/time zone, pickup/drop, trip distance/duration with their measurement basis, rider/customer details where required, captain name, vehicle registration, actual supplier/issuer, itemized base/distance/time/wait/toll/parking, discount, applicable taxes, total and payment state/reference. Distinguish estimated and final fare. Retain a snapshot of issuer, tax rule, business details and fare calculation at issuance; later profile edits must not silently rewrite old documents.

Keep **trip completion**, **fare due**, **payment confirmation**, **tax invoice** and **employer claim approval** as separate facts. Generate a trip statement after completion; issue the appropriate payment receipt when settlement evidence is available. Direct cash/UPI needs a truthful status such as captain-confirmed or rider-reported, rather than gateway-verified. A screenshot/UPI intent return is not a verified settlement. Never label a quotation or unpaid statement Paid.

Build server-side PDF rendering, private document storage, authorized downloads, retryable delivery and an idempotent issue job. Corrections/refunds must reference original documents with a versioned amendment or credit note as applicable, rather than editing history. Avoid public receipt URLs or exposing phone numbers in the PDF. Start with PDF plus monthly CSV; add employer policy/approvals and expense-system integration only after demand is validated.

Tax invoice issuance depends on actual supplier, service, jurisdiction and commercial/payment model. Have a qualified tax reviewer define these rules; do not hardcode a single GST rate or assume a receipt grants input tax credit. A carpool contribution statement may support an employer claim if its policy permits it, but must not be disguised as a commercial taxi tax invoice. Reimbursement eligibility is ultimately the employer's decision. [CBIC invoice rules](https://taxinformation.cbic.gov.in/content-page/explore-rules/1000136/1000001), [CBIC passenger-transport invoice provisions](https://cbic-gst.gov.in/pdf/03042020-CGST-Rules-2017-Part-A-Rules.pdf).

## 8. Android priorities

Improve the existing Capacitor/native architecture before assuming a full rewrite is required.

- Test captain screen-off tracking, notification denial, precise/approximate location, battery saver, network changes, app update, process death, force-stop and common OEM battery restrictions on physical devices. A forced-stopped app cannot be treated as available indefinitely. Mark stale locations unavailable and explain recovery to the captain.
- Measure push provider acceptance → device acknowledgement → offer display → accept API success. FCM is a wake-up/delivery channel, not the source of assignment truth. Reconcile state on resume and deduplicate late notifications. Respect Android policy for notification priority and foreground services.
- Add a readiness screen for location accuracy, service running, network, notifications and battery guidance. Request permissions at the moment they provide value. Do not ask riders for captain-level tracking permissions.
- Adapt location frequency by online/idle/en-route state, motion and battery, with server freshness rules. Show last-updated tracking when data is delayed rather than a falsely live marker.
- Restore active trips after crashes. Queue only actions with explicit safe retry/idempotency semantics; never show an offline acceptance as confirmed until the server confirms it. Provide clear retry and stale-offer handling.
- Verify TalkBack, text scaling, contrast, one-handed controls, translated errors and low-memory performance. Measure crash-free sessions, ANRs, battery drain per online hour, data use per trip and cold-start time.
- Add Android-native secure photo/document capture, verified app links and Play release integrity checks as needed. Keep server authorization independent of device trust signals.

Android's official guidance ties background continuity to the correct location/foreground-service design and recommends balancing frequency/accuracy with battery use. [Location codelab](https://codelabs.developers.google.com/codelabs/while-in-use-location), [battery guidance](https://developer.android.com/develop/sensors-and-location/location/battery).

## 9. How to compete

The opportunity is an operational promise: **a dependable commute, a clear price, known verification evidence and a usable expense record**. These components are not individually unique; their consistent delivery in a focused market can be valuable.

- **Uber:** its business profiles already support expense workflows, and Uber Auto publicly describes a zero-trip-commission model. Therefore neither basic invoices nor zero commission alone is a defensible differentiator. Uber's Auto FAQ also distinguishes its suggested-fare receipt from a tax invoice, showing why billing promises must be product-specific. [Business profiles](https://www.uber.com/in/en/business/profiles/), [Auto model](https://www.uber.com/in/en/blog/uber-auto-now-on-saas-what-does-it-mean/), [subscription terms](https://www.uber.com/in/en/legal/subscription-model-terms-and-conditions/).
- **Rapido:** its published onboarding includes documents and captain photos. Hop needs a clearer, faster and reliably supported process, not just another upload screen. Fees depend on service/state/model; avoid blanket competitor pricing claims. [Captain onboarding](https://rapido.bike/become-a-captain), [captain terms](https://www.rapido.bike/CaptainTerms).
- **Ola:** published platform documentation supports post-trip invoice access; receipts are an expected capability rather than a novel feature. Actual offerings vary by product and city. No claim of nationwide current pricing or service quality is made here. [Ola ride tracking/invoice documentation](https://developers.olacabs.com/docs/auto-track-ride).
- **Quick Ride:** corporate verification and route matching already exist in the carpool market. Merely adding work-email verification does not differentiate Hop. Test whether an employer-backed backup ride, predictable meeting points and combined commute/expense support solve a gap customers will pay for. [Quick Ride matching and verification](https://quickride.in/help.php), [carpool terms](https://www.quickride.in/terms-and-conditions.php).

Start with one office park and a few nearby residential communities, with morning/evening windows and enough approved supply per corridor. Recruit employers and resident associations to aggregate demand; validate employer willingness to pay through interviews and a small paid pilot. Let a limited captain cohort opt into clear, adequately compensated commute offers. Add commercial fallback with disclosed availability/pricing; do not promise a guaranteed backup before supply and economics support it.

Revenue hypotheses: employer subscription for commute administration, support and expense reporting; transparent captain subscription only after sufficient ride volume; or disclosed booking/platform fees where the approved model permits. Separate private carpool and commercial taxi economics. Zero commission does not mean zero operating cost.

Contribution per completed trip = attributable platform revenue − payment/communications/maps costs − variable support and safety/insurance costs − incentives − refunds/fraud. Add allocated subscription revenue without double-counting it. Evaluate acquisition cost and retention separately, then include fixed costs to assess business viability. Never treat gross rider fare as platform revenue.

Illustration only: ₹15 platform revenue minus ₹3 communications/maps/payment, ₹4 variable support/risk and ₹10 incentives yields −₹2 contribution before fixed costs. At 10,000 trips/day that is −₹20,000/day before fixed costs. These are hypothetical inputs, not market benchmarks or Hop forecasts. Sustainable corridor density and retention matter more than cheap first rides.

## 10. Delivery sequence and validation

**Phase 1 — trust and billing foundation.** Verified phone gates and truthful badges; captain portrait/private uploads; resumable application and review queue; complete driver card; receipt PDF and accurate payment states; essential telemetry and incident operations. Dependencies: OTP/telephony/storage providers, review staff and tax/issuer decisions. Acceptance: unverified replacement numbers cannot satisfy the verified-phone gate; unapproved captains cannot go online; photo changes require review; download authorization works; refund history is preserved.

**Phase 2 — matching and Android reliability.** Correct offer outcomes; road matrix ranking; bounded repeat-driver preference; device readiness and lifecycle testing; dashboard and feature-flagged rollout. Acceptance: zero duplicate assignment in concurrency tests, correct handling of unseen/superseded offers and tested recovery from stale location/push/network failure.

**Phase 3 — closed commute pilot.** Employer/community verification, recurring occurrences, seat locks, route insertion constraints, no-shows and contribution statements. Dependencies: state/insurance review, community partner, sufficient route density and support coverage. Acceptance: no oversold seats; all promised delay/capacity limits enforced; per-person pickup/payment handling; cancellation releases seats and triggers the agreed recovery flow.

**Phase 4 — expand only from evidence.** Employer dashboards, approvals/expense integration, additional corridors and sophisticated assignment only if retention, reliability and economics justify them. Defer national expansion, broad loyalty subsidies, complex gamification, speculative AI and an app rewrite.

Indicative planning envelope: 2–4 weeks discovery/provider/operations preparation, 4–8 weeks foundation delivery, 3–6 weeks matching/reliability work and 4–6 weeks pilot observation, with overlap where safe. This assumes a small cross-functional team with backend, mobile/web, QA and operations capacity. Procurement and legal review can dominate elapsed time; these are not delivery commitments.

Suggested decision gates, to be agreed before the pilot: verified-mobile coverage 100% of active bookings/captains; approved-photo coverage 100% of active captains; automatic document issue success ≥99% of eligible trips; p90 pickup ETA absolute error ≤3 minutes; matched commute completion ≥95%; and nonnegative variable contribution excluding temporary acquisition subsidies, with subsidies also reported separately. These are proposed thresholds, not achieved performance. Track cancellation reason, repeat use and captain net earnings alongside them; safety incidents always require case review and cannot be judged from a small-sample rate alone.

Obtain a baseline first: step-level onboarding conversion, captain approval/activation time, p50/p90 request-to-pickup, offer delivery/display rates, trip completion/cancellation by cause, repeat usage, invoice delivery, support resolution and contribution. For carpool, add request match rate, seat utilization, walking/detour time, no-shows and weekly retained commuters. Define denominators and minimum observation windows before comparing cohorts.

## First implementation batch

1. Introduce verified-phone ownership and fix badge semantics.
2. Add captain photo/private document workflow and resumable review states.
3. Complete driver identity/vehicle card and contact-provider integration.
4. Deliver reimbursement PDFs with truthful settlement and issuer information.
5. Correct offer outcome instrumentation and pilot road ETA ranking.

This batch improves trust, conversion and repeat usage while creating the evidence needed to decide how much to invest in Hop Commute.
