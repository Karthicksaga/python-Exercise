# Hop map experience: research and proposal

Research date: 27 October 2026. Scope: local source review and public documentation from Google Maps Platform, W3C, Uber, Lyft, and Grab. No live road tests, paid Maps API experiments, competitor account testing, or patent clearance were performed. Public documentation does not establish whether an undocumented feature exists in an app.

## Recommendation

Build **Hop MeetSync**, a proposed meeting-point agreement for Rider and Captain. Its distinctive hypothesis is a combination of explicit walking limits, evidence freshness, independently checked pedestrian and vehicle access, and a meeting point whose identity cannot change silently.

The competitive opportunity is execution of this combination in Hop's service areas. Do not advertise it as the world's first, absent from every app, patented, or a guarantee of safe pickup. Suggested pickup points, gate guidance, location uncertainty, and coordinated pickup are established ideas.

## Fix the foundation first

These observations are from the reviewed source, not production telemetry.

1. **Replace the pin-card ETA heuristic.** `web/apps/rider/src/PinPicker.tsx`, lines 39–41, estimates time using approximate straight-line kilometres and an assumed speed of 22 km/h. It cannot account for a divider, closed gate, service road, or actual vehicle approach. Prefer the existing backend's road ETA when available; otherwise show approximate distance with an explicit label and no arrival-time claim. Do not independently invent another ETA formula.
2. **Make traffic provenance visible.** `web/packages/shared/src/MapExtras.tsx`, lines 18–24, assigns congestion categories from hour/day rules. `MapPicker.tsx`, line 127, uses this colour for a route. This is separate from the genuine Google TrafficLayer in `mapkit.tsx`. Remove the heuristic from live-looking route presentation or identify it as a typical pattern. Route-level traffic colouring needs traffic interval data from its routing provider. Google documents interval-based traffic polylines. [Google documentation](https://developers.google.com/maps/documentation/routes/traffic_on_polylines).
3. **Keep accuracy and freshness with a location.** `useLivePickup.ts`, lines 30–39, reads accuracy, rejects readings above 150 metres, then passes coordinates and a label onward. Preserve the device accuracy, acquisition timestamp, source, and user-confirmation status. A reading below that threshold can still be ambiguous between entrances. W3C exposes accuracy and timestamp; the accuracy value is not evidence of road-level accessibility. [W3C Geolocation](https://www.w3.org/TR/geolocation/).
4. **Prevent older address results winning a race.** `MapPicker.tsx` protects the pending-click path, but its `drag()` path awaits reverse geocoding before calling `onSelect` without the equivalent request-version guard. `useLivePickup.ts` also awaits reverse geocoding without checking which sample is newest afterward. Add sequence identifiers and tests with deliberately out-of-order responses.
5. **Make camera behaviour respect the user.** `MapFit` depends on an `extra` key; `MapPicker` builds that key partly from route length. A different geometry with the same vertex count may not update its bounds. Use a route revision and panel-aware padding. Fit once for a changed trip, preserve manual exploration, and provide a deliberate recenter action. Test the actual map bounds under the mobile sheet, not just whether the container exists.
6. **Separate map rendering from routing capability.** Hop can render Google or OSM, while `backend/internal/app/quotes.go`, line 144, calls an OSRM-style driving endpoint. A Google basemap does not mean Google traffic, walking routes, or two-wheeler routing are in use. Introduce provider capability flags and provenance before exposing those promises. Retain the server's pricing authority.

## What already exists elsewhere

- **Uber:** documents suggested pickup locations and dedicated pickup experiences. This rules out claiming a recommended curb pin as novel. [Uber pickup help](https://help.uber.com/en-GB/riders/article/what-are-suggested-pickup-location?nodeId=9edf05bf-ac3a-4cf8-b08e-76e9ca767f7f).
- **Lyft:** its April 2026 engineering article describes choosing inside/outside a gated community and routing through entrances. “Smart gate pickup” alone is not a distinct invention. [Lyft Engineering](https://eng.lyft.com/how-we-built-a-smarter-pickup-experience-for-gated-communities-47416e9df029).
- **Grab:** publishes venue pickup directions with text and images. Landmark or entrance guidance alone is already established. [Grab Engineering](https://engineering.grab.com/poi-entrances-venues-door-to-door).
- **Uber engineering:** has published work on sensor fusion and GPS uncertainty. Better GPS alone is not an unoccupied opportunity. [Uber location engineering](https://www.uber.com/br/en/blog/beacon-improving-pickups-with-better-location-accuracy/).

Targeted searches for versioned pickup agreements and rider movement budgets did not establish a complete matching product implementation. That is limited evidence, not proof of novelty; terminology varies, and private implementations are not searchable.

## Hop MeetSync: the proposed experience

### 1. Ask for one relevant constraint

Offer “Stay where I am” and “I can walk a little.” Let the rider specify a maximum walking distance and whether stairs or road crossings are acceptable. Make the choice optional. Existing accessibility settings should inform suggestions without exposing a disability label to the Captain.

A walking limit is a user constraint, not a preference that can be traded away for a shorter ETA. Unknown accessibility must remain unknown. A suggested point must not be labelled step-free merely because a destination has an accessible entrance.

### 2. Compare meeting points, not just coordinates

Separate three objects: the rider's observed location, a place entrance, and the vehicle's stopping point. A building centroid or reverse-geocoded address is insufficient proof that a vehicle can reach it. Google recommends place IDs for routing context and documents entrance/navigation-point data, but availability must be tested at Hop's pilot venues. Some navigation-point functionality is preview-stage. [Place Details](https://developers.google.com/maps/documentation/places/web-service/place-details), [location options](https://developers.google.com/maps/documentation/routes/specify_location).

Begin with a small set of operator-reviewed meeting points at two or three real venues. Candidate generation can later combine licensed provider data and Hop's own observations. Do not launch a citywide, AI-generated curb catalogue without verification.

### 3. Show one understandable proposal

Illustrative copy, not measured operational data:

> Meet at West Gate, beside the security booth. Your selected walking limit is respected. Captain approaches from the service road. Gate access: not yet confirmed.

If walking time, approach direction, step-free access, or road crossings cannot be substantiated, omit the claim or display its uncertainty. Do not generate plausible-sounding landmarks with a language model. Multilingual descriptions can be rendered from a common structured place identity.

### 4. Make both apps agree on the same version

After a Captain is assigned, both apps display the same meeting-point ID, revision, side/level where verified, and description. The rider confirms the point. The Captain acknowledges reachability only when stopped or through an appropriate voice interaction; do not add mandatory moving-driver taps.

A simple proposed coordination state machine is:

`PROPOSED → RIDER_CONFIRMED → BOTH_ACKNOWLEDGED → MEETING`

An obstruction or a material change moves the proposal to `NEEDS_REVIEW`. This is a new coordination layer, not a substitute for ride acceptance, arrival status, or the existing pickup PIN. Those remain authoritative for their current purposes.

### 5. Stop the moving-pin problem

Once confirmed, GPS drift changes the observed-location dot, not the agreed meeting point. If the rider or Captain requests another point, create a new revision and invalidate old acknowledgements. A stale client cannot silently restore the previous plan.

A blocked gate must not start a cycle of suggestions that makes a rider repeatedly walk toward different points. Maintain a cumulative walking budget for the pickup session. When the remaining budget cannot accommodate a verified alternative, stop suggesting movement and offer existing communication/help options.

This explicit limit on repeated relocation, combined with a shared revision and evidence freshness, is the most promising differentiating mechanism in this proposal. It still needs competitor validation and user testing.

### 6. Keep a fallback without pretending it is live

During connectivity loss, retain the last agreed meeting point, its revision, and the last update time. Label the view as stale. New confirmations must not appear successful until acknowledged by the server. Offer the existing call/help controls. Do not infer that people have met from GPS proximity, and do not begin, charge, or cancel a ride from this coordination state alone.

## Engineering design

### Shared domain, separate application views

Create one server-owned meeting-point model consumed by Rider and Captain. Suggested fields: `meeting_point_id`, `revision`, `status`, `entrance_id`, `vehicle_stop_point`, `pedestrian_endpoint`, `rider_confirmed_revision`, `captain_confirmed_revision`, `evidence_source`, `observed_at`, `expires_at`, and `walking_budget_remaining_m`.

Keep vendor place references and provider-issued tokens separate from Hop-owned data. Treat navigation tokens as opaque. For each candidate, retain its constraints and provenance. Do not call a confidence score a probability until it has been calibrated against field observations.

### Ranking

First reject candidates that violate known access rules, walking limits, or user restrictions. Do not offset a hard constraint with a good ETA. Candidates with insufficient evidence should be excluded from strong recommendations or explicitly require review.

Among feasible candidates, compare estimated total rendezvous time, rider effort, access uncertainty, and unnecessary vehicle loops. Prefer a short, auditable rule set initially. Learn weights only after Hop has labelled pickup outcomes. Do not insert a predicted monetary saving without a corresponding server quote.

### Location handling

Retain sample accuracy and timestamp. Reject stale, out-of-order, or implausibly jumping samples; smooth visual movement separately from dispatch decisions. Never snap a person onto a road merely to make their marker look tidy. Under flyovers and inside large buildings, ask for an entrance/level confirmation rather than pretending that ordinary GPS identifies the level.

### Route semantics

Pedestrian routing and vehicle approach are different requests. Google supports side-of-road or heading modifiers in appropriate modes, but these are route preferences, not certification that stopping is permitted; the two modifiers cannot be combined for the same location. [Google location modifiers](https://developers.google.com/maps/documentation/routes/location_modifiers).

For Chennai and other Indian markets, consider narrow-road and flyover information for Captain guidance where returned. Those features have India-specific coverage and experimental constraints. They do not prove that an auto or SUV fits a lane, and vehicle accessibility cannot be deduced from a generic driving route. [Google India routing features](https://developers.google.com/maps/documentation/routes/flyover-narrow?hl=en).

### Architecture boundary

Implement this behind a feature flag. It requires new server coordination state and additive APIs; it is more than a React styling change. Changing pickup coordinates before booking must invalidate the old quote and obtain a new authoritative quote. Post-booking pickup changes must follow an explicitly designed backend policy; the current product must not silently acquire new pricing, cancellation, or waiting-fee behaviour.

Existing route geometry remains the source for fare display until a deliberate provider migration. Do not replace the routing backend simply because Google APIs offer a useful enrichment field.

### Data, privacy and provider boundaries

Share the confirmed meeting point, not continuous raw rider tracking by default. Limit exact live-location sharing to an assigned trip and user consent. Do not put gate codes or personal notes in a public pickup catalogue. Expire temporary obstruction reports, retain their evidence source, and prevent an untrusted single report from redirecting others automatically.

Google Places has attribution, storage and display restrictions. In particular, do not automatically carry Google-derived Places content onto Hop's OSM fallback or put it into an unrestricted permanent learning database. Make data ownership and provider handling explicit. [Current Places policy](https://developers.google.com/maps/documentation/places/web-service/policies).

## Testing and evaluation

### Automated tests

- Old reverse-geocode response arrives after a newer drag; newest selection wins.
- Two routes have equal vertex counts but different geometry; bounds update correctly.
- GPS moves across a divided road; confirmed meeting point stays fixed.
- Rider confirms revision 3 while Captain has revision 2; no false agreement is displayed.
- Acknowledgement is delivered twice or after reconnect; transitions remain idempotent.
- Closed gate report expires; the stale report is not treated as current.
- Walking limit is zero, step-free data is unknown, or crossing avoidance cannot be verified; the system never asserts unsupported access.
- Provider changes or Maps quota fails; provenance and attribution stay correct and manual pickup remains available.
- No network, weak GPS, inaccurate heading, background/resume, and permission revocation produce clear states.
- Screen-reader and keyboard users can select/confirm a meeting point through a textual alternative.
- Booking, OTP/PIN, fare calculation and cancellation rules remain unchanged unless separately specified.

### Field pilot

Recruit consenting Rider/Captain pairs at two or three reviewed venues. Include low-end Android devices, divided roads, gates, multiple levels, night conditions, and riders with differing mobility requirements. Do not rely on a simulator to certify curb accessibility or pedestrian crossings.

Primary outcome: elapsed time from the Captain's approach/arrival event to verified trip start, with a precise event definition. Track median and p90, pickup-related call/message rate, cancellations before pickup, requested versus actual walking, revision changes, stale agreements, and provider cost per completed pickup. Segment venue and accessibility contexts; an average improvement must not hide a worse experience for constrained riders.

Before a controlled experiment, establish a baseline and a power calculation. Suggested product ambition, not a forecast: reduce pickup-related contact and p90 pickup delay while never exceeding the rider's agreed movement limit. Set numeric launch gates only after baseline measurement. Audit manually whether a call was avoided because pickup improved or because contacting support became harder.

## Delivery order

1. Correct misleading traffic/ETA presentation, geocode races, freshness handling, and camera framing. Add telemetry and replay tests. These improvements do not need a new matching system.
2. Pilot static, reviewed meeting-point cards with text alternatives and manual confirmation.
3. Add server-owned revisions and bilateral acknowledgement behind a flag, without changing ride lifecycle or fees.
4. Add bounded alternative suggestions and learned ranking only after field validation and sufficient reliable observations.

Do not prioritise AR arrows, automatic floor detection, a proprietary citywide map, or “AI safety scores” before these foundations. The most credible product advantage is fewer failed meetings, supported by measurements and an understandable explanation of what Hop knows and does not know.
