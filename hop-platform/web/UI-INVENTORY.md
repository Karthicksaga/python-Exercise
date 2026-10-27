# Frontend source inventory

69 TSX source modules (includes entry points, composite screens, and reusable components; not a count of rendered React instances).

## Rider destinations

Landing/sign-in, OTP request and verify; ride (location gate, where, choose ride, confirm, matching and live trip); history; support; profile; wallet; more; public share token view.

## Captain destinations

Landing/sign-in, OTP; driver (onboarding/application review, duty/requests, active trip); earnings; vehicle/preferences; history; support; profile.

## Admin destinations

Restricted sign-in; live-map; rides; verification; analytics; sos; lost-found; pricing; areas; drivers; incidents; audit; payments; promos; surge; safety. There are 15 Admin navigation destinations, 6 Rider tabs and 6 Captain tabs (27 total primary authenticated destinations).

## Source module checklist

### `apps/admin/src/AdminApp.tsx`

Static class names: `ad-brand`, `ad-card`, `ad-content`, `ad-dot`, `ad-head`, `ad-hero`, `ad-land`, `ad-mobile-navigation`, `ad-mobile-toolbar`, `ad-out`, `ad-panel`, `ad-shell`, `ad-side`, `ad-spark`, `ad-stats`, `ad-tag`

### `apps/admin/src/AdminConsole.tsx`

Static class names: `captain-portrait`

### `apps/admin/src/OperatorAnalytics.tsx`

Static class names: (dynamic or Mantine styles)

### `apps/admin/src/OperatorFinance.tsx`

Static class names: `badge`, `check`, `danger`, `day-pick`, `earnings-card`, `earnings-grid`, `form-grid`, `inline-form`, `muted`, `op-finance`, `plain-list`, `plain-list ledger`, `promo-code`, `secondary`

### `apps/admin/src/OperatorLiveMap.tsx`

Static class names: `dispatch-grid`, `dispatch-map`, `live-map-container`

### `apps/admin/src/OperatorLostFound.tsx`

Static class names: (dynamic or Mantine styles)

### `apps/admin/src/OperatorPanel.tsx`

Static class names: `actions`, `area-row`, `audit-row`, `check`, `empty`, `form-grid`, `inset`, `muted`, `operations`, `operator-grid`, `panel`, `pill`, `pricing-grid`, `ride-grid`, `secondary`, `text-button`, `tip`

### `apps/admin/src/OperatorRides.tsx`

Static class names: (dynamic or Mantine styles)

### `apps/admin/src/OperatorSafety.tsx`

Static class names: (dynamic or Mantine styles)

### `apps/admin/src/TripPricingForm.tsx`

Static class names: `muted`, `panel`

### `apps/admin/src/admin-main.tsx`

Static class names: (dynamic or Mantine styles)

### `apps/captain/src/CaptainApp.tsx`

Static class names: `alert`, `alerts-btn`, `alerts-label`, `avatar`, `avatar-btn`, `dev-banner`, `emoji-keep`, `empty`, `eyebrow`, `header-right`, `inset`, `logo`, `logo-mark`, `logo-sub`, `muted`, `notice`, `page-title`, `panel`, `pill`, `ride-grid`, `safety-note`, `stat-strip`, `support-actions`, `support-card`, `support-card danger`, `support-page`, `text-button`, `theme-toggle`, `topbar-center`, `verified`

### `apps/captain/src/CaptainLanding.tsx`

Static class names: `button full`, `cl`, `cl-card`, `cl-copy`, `cl-fleet`, `cl-hero`, `cl-perks`, `cl-steps`, `cl-tag`, `cl-tag dark`, `lp-fine`, `lp-or`

### `apps/captain/src/CaptainOnboarding.tsx`

Static class names: `actions`, `captain-portrait`, `check`, `eyebrow`, `grid-2`, `inset`, `kv`, `muted`, `onboarding-steps`, `panel`, `panel onboarding-flow`, `secondary`, `text-button`, `trust-block`

### `apps/captain/src/DriverInsights.tsx`

Static class names: `insights`

### `apps/captain/src/DriverMap.tsx`

Static class names: `hot-zone`, `hz-go`, `map-pin destination-pin`, `map-pin pickup-pin`, `me-dot`, `me-pulse`, `pin-tag drop-tag`, `pin-tag pickup-tag`, `recenter`

### `apps/captain/src/DriverMoney.tsx`

Static class names: `bar-chart`, `bar-col`, `bar-val`, `eyebrow`, `muted`, `panel driver-money`, `payout-box`, `plain-list ledger`, `section-heading`, `wallet-balance`

### `apps/captain/src/DriverPanel.tsx`

Static class names: `alert`, `captain-quick-ribbon`, `captain-subview`, `check`, `chip-head`, `chip-sub`, `chip-value`, `driver-chat`, `duty-knob`, `duty-label`, `duty-ripple`, `earnings-card`, `earnings-grid`, `empty`, `eyebrow`, `gps-line denied`, `inset dev-tools`, `muted`, `muted duty-status`, `panel driver-earnings`, `panel driver-heading`, `panel narrow`, `panel vehicle-card`, `panel vehicle-change`, `pill`, `plate`, `quick-chip`, `ride-grid`, `row`, `secondary`, `section-heading`, `tip`, `vehicle-badge`

### `apps/captain/src/DriverTools.tsx`

Static class names: `goal`, `goal-bar`, `goal-edit`, `goal-head`, `muted`, `muted online-for`, `panel driver-tools`, `secondary`, `secondary chip-btn`

### `apps/captain/src/captain-main.tsx`

Static class names: (dynamic or Mantine styles)

### `apps/rider/src/BookingExtras.tsx`

Static class names: `check`, `muted`

### `apps/rider/src/BookingMoney.tsx`

Static class names: `chip`, `ghost`, `money-box`, `opt-title-row`, `pay-at-end-reassurance`, `pay-options expanded-options`, `payment-summary-pill`, `pill-desc`, `pill-icon`, `pill-left`, `pill-text`, `pill-title`, `promo-chips`, `promo-err`, `promo-ok`, `promo-row`, `secondary`, `text-button change-pay-toggle`

### `apps/rider/src/CompanionPanel.tsx`

Static class names: `check`, `danger sos`, `eyebrow`, `more-grid`, `muted`, `panel`, `panel narrow`, `plain`, `row`, `text-button`

### `apps/rider/src/Landing.tsx`

Static class names: `button full`, `chip`, `intro-copy`, `lp`, `lp-card`, `lp-card-head`, `lp-copy`, `lp-eyebrow`, `lp-fine`, `lp-hero`, `lp-ico`, `lp-num`, `lp-or`, `lp-perk`, `lp-perks`, `lp-ride`, `lp-rides`, `lp-section`, `lp-section lp-how`, `lp-trust`

### `apps/rider/src/LocationGate.tsx`

Static class names: `chip`, `chips`, `eyebrow`, `gate`, `gate-icon`, `muted`, `radar`

### `apps/rider/src/MapPicker.tsx`

Static class names: `actions`, `confirm-bar`, `map-pin destination-pin`, `map-pin pending-pin`, `map-pin pickup-pin`, `pin-fab`, `pin-tag drop-tag`, `pin-tag pickup-tag`, `recenter`, `secondary`

### `apps/rider/src/NearbyCar.tsx`

Static class names: `nearby-car-realistic`

### `apps/rider/src/PinPicker.tsx`

Static class names: `cp-bubble`, `cp-head`, `cp-shadow`, `cp-stick`, `pin-card`

### `apps/rider/src/PlaceInput.tsx`

Static class names: `place-field`, `place-row`, `places-list desktop-dropdown`

### `apps/rider/src/QuickPlaces.tsx`

Static class names: `chip`, `chips quick-places`

### `apps/rider/src/RideOptions.tsx`

Static class names: `ride-fare`, `ride-main`, `ride-options`, `tag`, `tag fast`, `tag surge`, `trip-meta`

### `apps/rider/src/RiderApp.tsx`

Static class names: `actions`, `alert`, `alerts-btn`, `alerts-label`, `arrow`, `avatar`, `avatar-btn`, `dev-banner`, `discount-row`, `emoji-keep`, `empty`, `error`, `eyebrow`, `fare`, `fare-breakdown`, `form-grid`, `full`, `ghost`, `grow`, `header-right`, `info-card`, `inset`, `logo`, `logo-mark`, `manage-places-wrapper`, `map-target-strip`, `muted`, `page-title`, `panel`, `pill`, `quote`, `quote-top`, `ride-grid`, `safety-note`, `saved-location`, `saved-location-form`, `segmented`, `sheet`, `side-info`, `stage`, `stage-map`, `stat-strip`, `step-actions`, `step-footer`, `steps`, `support-actions`, `support-card`, `support-card danger`, `support-page`, `surge-row`, `text-button`, `text-button back`, `theme-toggle`, `topbar floating-pill-bar`, `topbar-center`, `verified`

### `apps/rider/src/RightRail.tsx`

Static class names: `place-row`, `right-rail`

### `apps/rider/src/RouteChoice.tsx`

Static class names: `route-choice`

### `apps/rider/src/ShareView.tsx`

Static class names: `eyebrow`, `live-chip`, `map-frame share-map`, `map-pin destination-pin`, `map-pin pickup-pin`, `muted`, `panel narrow`, `pin-tag drop-tag`, `pin-tag pickup-tag`, `share-vehicle`

### `apps/rider/src/TripHero.tsx`

Static class names: `avatar`, `button`, `captain-portrait`, `danger`, `driver-card`, `driver-info`, `eyebrow`, `hero-eta`, `hero-top`, `muted`, `muted hero-fare`, `pin-box`, `plate`, `quick-actions`

### `apps/rider/src/TripOptions.tsx`

Static class names: `check`, `row`, `text-button`

### `apps/rider/src/VoiceBooking.tsx`

Static class names: `muted`, `row`

### `apps/rider/src/WalletPanel.tsx`

Static class names: `chip-row`, `eyebrow`, `muted`, `panel`, `panel wallet-card`, `panel wide`, `plain-list`, `plain-list ledger`, `promo-code`, `wallet-balance`, `wallet-grid`

### `apps/rider/src/main.tsx`

Static class names: (dynamic or Mantine styles)

### `packages/shared/src/Icons.tsx`

Static class names: (dynamic or Mantine styles)

### `packages/shared/src/LiveNavMap.tsx`

Static class names: `button`, `live-chip`, `live-nav`, `live-nav-map`, `nav-arrow`, `nav-banner`, `nav-car-realistic`, `nav-foot`, `nav-tools`, `nav-wait`, `pin-tag drop-tag`, `recenter`, `secondary`, `speedo`

### `packages/shared/src/MapBoundary.tsx`

Static class names: `ghost`, `map-fallback`, `muted`

### `packages/shared/src/MapControls.tsx`

Static class names: `lowdata-switch`, `map-controls`, `map-layers-desktop`, `map-layers-mobile`

### `packages/shared/src/MapExtras.tsx`

Static class names: `heat-count`, `map-hint`, `map-hint bad`, `map-legend`, `map-search`, `map-search-row`, `map-sheet`, `map-tools`, `me-dot-sm`, `muted`, `poi`, `ruler-dot`, `ruler-label`, `traffic-chip`

### `packages/shared/src/MaskedCall.tsx`

Static class names: `call-link`, `masked-call`, `secondary call-btn`

### `packages/shared/src/NoticeCard.tsx`

Static class names: `notice-icon`

### `packages/shared/src/OnlinePay.tsx`

Static class names: (dynamic or Mantine styles)

### `packages/shared/src/PageLoader.tsx`

Static class names: `pl-logo`

### `packages/shared/src/PaymentSettlementSheet.tsx`

Static class names: `assistant-title`, `big-cash-emoji`, `cash-icon-row`, `cash-settlement-card`, `change-assistant`, `change-chip`, `change-chips`, `copy-upi-btn`, `danger-text`, `driver-payment-instruction`, `driver-settlement-view`, `fallback-buttons`, `method-label`, `method-pills`, `method-switcher-bar`, `muted`, `no-upi-fallback`, `online-pay-subcard`, `or-divider`, `paid-waiting-banner`, `payment-settlement-sheet`, `payment-status-pill danger`, `payment-status-pill pending`, `payment-status-pill success`, `primary`, `primary button`, `primary button upi-deeplink-btn`, `primary large-btn confirm-received-btn`, `qr-caption`, `rider-settlement-content`, `secondary`, `secondary notify-paid-btn`, `settlement-amount`, `settlement-badge`, `settlement-confirmed-banner`, `settlement-fare-note`, `settlement-footer`, `settlement-header`, `settlement-title-row`, `status-dot green`, `status-dot red`, `status-dot yellow`, `success-icon`, `text-button dispute-link`, `upi-actions`, `upi-id-box`, `upi-id-text`, `upi-prompt`, `upi-qr-img`, `upi-qr-wrapper`, `upi-settlement-card`, `wallet-settlement-card`, `wallet-shortfall`, `wallet-sufficient`

### `packages/shared/src/PhoneLogin.tsx`

Static class names: `inset`, `text-button`

### `packages/shared/src/ProfilePanel.tsx`

Static class names: `alert`, `avatar sm`, `avatar xl`, `badges`, `captain-portrait`, `danger-outline`, `eyebrow`, `grid-2`, `grid-3`, `link-rows`, `muted`, `panel`, `panel become-driver inset`, `panel become-driver inset approved`, `panel profile-hero`, `panel profile-trust`, `pill`, `place-ico`, `profile-col profile-col-main`, `profile-col profile-col-side`, `profile-columns`, `profile-grid`, `profile-id`, `profile-stat-box`, `profile-stats`, `rows`, `secondary`, `swatches`, `text-button`, `text-button danger`, `trust-block`

### `packages/shared/src/RealisticVehicleMarker.tsx`

Static class names: `vehicle-rotation-container`

### `packages/shared/src/ResponsiveNav.tsx`

Static class names: `app-dock`, `app-menu-icon`, `app-nav-badge`, `app-nav-item`, `app-nav-item app-signout`, `app-sidebar`

### `packages/shared/src/ResponsiveTable.tsx`

Static class names: `record-fields`, `records-desktop`, `records-mobile`

### `packages/shared/src/RideCard.tsx`

Static class names: `actions`, `captain-portrait`, `card-top`, `collect`, `danger`, `eta-banner`, `fare-adjusted`, `fare-ask`, `in-ride-pay-pill`, `in-ride-pay-switcher`, `inset`, `muted`, `navigation`, `pickup-code`, `pill`, `radar`, `ride-card`, `searching`, `secondary`, `secondary cancel-offer`, `stepper`, `stop-dot`, `stop-dot destination`, `stops`, `text-button`, `text-button in-ride-switch-btn`, `was`

### `packages/shared/src/RideChat.tsx`

Static class names: `chat`, `chat-log`, `chip`, `chips`, `muted`, `text-button`

### `packages/shared/src/RideMoment.tsx`

Static class names: `m-check`, `m-confetti`, `m-plate`, `m-road`, `moment`, `moment-card`

### `packages/shared/src/RideNegotiation.tsx`

Static class names: `inset`, `muted`, `plain`, `row`, `secondary`

### `packages/shared/src/RideRouteMap.tsx`

Static class names: `map-pin destination-pin`, `map-pin pickup-pin`, `pin-tag drop-tag`, `pin-tag pickup-tag`, `ride-route`, `ride-route-map`

### `packages/shared/src/SharedRide.tsx`

Static class names: `chip shared-chip`, `muted`, `secondary`, `share-actions`, `share-toggle`, `shared-ride`, `stop-list`

### `packages/shared/src/SwipeButton.tsx`

Static class names: `swipe-fill`, `swipe-knob`, `swipe-label`

### `packages/shared/src/TripReceipt.tsx`

Static class names: `muted`, `secondary`, `trust-block`

### `packages/shared/src/TrustProfile.tsx`

Static class names: `actions`, `muted`, `pill ok`, `secondary`, `trust-block`, `trust-upload`

### `packages/shared/src/VehicleArt.tsx`

Static class names: `vehicle-art`

### `packages/shared/src/VehicleCards.tsx`

Static class names: `vehicles`

### `packages/shared/src/lazy.tsx`

Static class names: (dynamic or Mantine styles)

### `packages/shared/src/mapkit.tsx`

Static class names: `booking-map`, `booking-map osm-map`, `map-blocked`

### `packages/shared/src/session.tsx`

Static class names: `toast-bar`, `toast-icon`, `toast-text`, `toast-x`
