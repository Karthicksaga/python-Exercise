# Button placement audit: Rider and Captain apps (6 Nov 2026)

Status: **Analysis only, nothing changed.** I measured every button on all 44 screens (390 × 844 phone, test data): position, width, height, corner radius, and whether it sits in the bottom bar.

## What's inconsistent

### 1. The main action lives in three different places
| Where it sits | Screens |
|---|---|
| Docked bottom bar, full width | Personal details, Preferences (both apps), Plan, Sign-in (both), Onboarding, Receipt, Collect, Choose, Review |
| Middle of the page, inside the content | Saved places "Save destination" (y 653, inside the form card), Vehicle & documents "View application…" (y 584, after the list), Family "Invite family member" (y 241), Ledger "Request payout" (inside the dark card), empty Activity/Trips "Book a ride" / "Back to driving" (y 217) |
| Full-screen navigation | "Complete trip" is a plain tap button in the content, so the slide-to-complete safety doesn't apply there |

### 2. The bottom bar has two shapes
- Rounded "floating" panel (24 px top corners, background showing in the corners): Personal, Preferences, Plan, Sign-in, Onboarding, Receipt, Collect, Chat. This is the "not fully covered" look.
- Flat, edge to edge (0 px): Choose, Review, Ride request.

### 3. Buttons have no single size
| | Values found |
|---|---|
| Primary height | 44 (all bottom bars), 48 (Save destination) |
| Corner radius | 12 (Retry), 14 (Sign out, Take a break), 16 (most primaries), 18 (Invite family member) |
| Width | 350 (bars, x 20), 318 (empty-state buttons, x 36), 322 (Save destination, x 34), 77–101 (error Retry) |
| Same job, different style | Earnings "Retry" is filled; Wallet "Try again" is outlined |

### 4. Crowded bars
- **Ride request:** slide, then "Decline", then "Make counter-offer": three stacked rows, a 190 px bar.
- **Full-screen navigation:** "Complete trip", then "Google Maps" + "Exit" below it.

## Proposed rules (one system for every screen)
1. **Sub-pages** (back arrow, no bottom nav): the screen's main action is docked at the bottom, full width.
   - This applies to Save details, Save preferences, Save destination, Invite family member, View application, Request payout, Continue and Done.
   - Never in the middle of the page.
2. **Tab pages** (Ride, Activity, Wallet, Account, Drive, Earnings, Trips): no docked bar, since the bottom nav is there.
   - Actions sit with the content they act on: an empty state's button, a card's buttons.
3. **One bar shape everywhere:** flat, edge to edge, a 1 px top line, the safe area below, no rounded floating corners. The same on map and non-map screens.
4. **One button scale:**
   - Primary: filled, 52 px, radius 14.
   - Secondary: outlined, 48 px, radius 14.
   - Text button: 44 px tap area.
   - Error "try again" is always secondary.
   - Every full-width button uses the same 16 px side margins.
5. **At most two rows in a bar:** the main action, then one row of up to two text actions.
   - Ride request: slide, then [Decline · Counter-offer].
   - Full-screen navigation: slide to complete, then [Google Maps · Exit].
6. **Item actions stay in their card** (Add, Edit, Copy code, Book again) as secondary or text buttons, never filled primary.
7. **Low-priority account actions** (Sign out, Take a break) are the last row of the page's list, styled as a list row, not a floating button.

## Screen-by-screen changes
| Screen | Change |
|---|---|
| Saved places | Move "Save destination" from inside the form card to the bottom bar. |
| Vehicle & documents | Move "View application & private documents" to the bottom bar. |
| Your people | "Invite family member" becomes the docked primary. |
| Ledger & payouts | "Request payout" goes to the bottom bar, shown only with a balance. |
| Empty Activity/Trips | Same 16 px margins as everything else (now 36 px). |
| Earnings / Wallet errors | One secondary "Try again" style. |
| Ride request | Slide plus one row [Decline · Counter-offer]. |
| Full-screen navigation | "Complete trip" becomes the same slide as the trip sheet. |
| All sub-pages with a bar | Flat edge-to-edge bar instead of a rounded floating panel. |
| All primaries | 52 px, radius 14. |
| Tools / Privacy | "Take a break" and "Sign out" become the last list rows. |

How to check: `tests/design-audit.spec.mjs` can assert these rules on every screen: a sub-page's primary is in `.action-bar`, the bar is flush and square, and primaries share one height and radius.

## End-to-end prototype
All 57 screens of both apps with these rules applied, clickable end to end: https://claude.ai/artifact/SSuyWApGcrtBFFugtqA1r1
