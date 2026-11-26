# Godot button & HUD controls visual redesign

Date: 26 Nov 2026. Status: Proposed. Scope: `godot-chennai/src/ui/` (`UiTheme`, `UiIcons`, `TouchButton`, `HoldButton`, `ControlsLayout`, `TouchControls`, `DrivingControls`, `TitleMenu`, `PauseMenu`).

## 1. Summary
The underlying control logic and layout math (`ControlsLayout`, `ActionContext`, `ControlSettings`) work well, but the **visual presentation of the buttons** feels flat and prototype-like. Every button is a thin 1.5 px wireframe circle with raw uppercase text inside, minimal contrast against bright daytime streets, and no press animation.

## 2. Evidence (Current Weak Spots in Code)
- **Flat wireframe circles (`src/ui/ui_theme.gd`, `src/ui/touch_controls/touch_button.gd`):** `GLASS_FILL` (`alpha 0.42`) + `GLASS_OUTLINE` (`1 px` / `1.5 px` white) has no drop shadow, inner highlight, or gradient, so buttons blend into bright asphalt, sand, or white walls.
- **Missing icons (`src/ui/ui_icons.gd`):** Only 3 icons exist (`pause`, `exit`, `jump`). Everything else (`ACTION`, `GET IN`, `TALK`, `PICK UP`, `GAS`, `BRAKE`, `HORN`, `SIREN`, `RUN`) relies on cramped uppercase text inside circles.
- **Monotonous shapes (`src/ui/touch_controls/controls_layout.gd`, `src/ui/driving_controls/driving_controls.gd`):** Gas, Brake, Horn, Exit, Action, Jump, and Run are all identical circles. In driving mode, `brake_hint` ("hold to reverse") hangs underneath `BRAKE` as tiny 11 px floating text.
- **No tactile press feedback:** Pressing a `TouchButton` or `HoldButton` snaps the fill color to amber with no scale-down tween (`0.92×`), ring pulse, or haptic-feeling springiness.

## 3. Recommended Redesign Directions

### Option A — Tactile Neo-Glass (Clean Evolution)
- Keep the dark translucent glass + `#ffb703` amber accent palette, but add **depth and legibility**:
  - Soft outer drop shadow (`shadow_size = 6`, `rgba(0,0,0,0.45)`) + subtle `1 px` inner top highlight so buttons pop cleanly over both bright noon roads and dark night streets.
  - **Vector icon-first buttons** in `UiIcons` (car door for `GET IN`, speech bubble for `TALK`, hand/crate for `PICK UP`, megaphone/horn for `HORN`, siren beacon for `SIREN`, pedal/throttle for `GAS`/`BRAKE`, running figure for `RUN`). Keep text only as a tiny secondary sub-label or omit it when the icon is obvious.
  - **Springy press feedback:** Tween `scale` to `0.92` over `60 ms` on press and `1.0` over `100 ms` on release, with a soft amber outer glow ring while held.

### Option B — Shaped Open-World Controls (Recommended for Gameplay Feel)
- **Driving (`DrivingControls`):** Replace the two circular pedals with **shaped vertical/angled pedal capsules** — a tall rounded-rectangle **Gas** pedal on the outer right and a wider, slightly shorter **Brake / Reverse** pedal to its left (integrating a subtle `R` badge inside the button when stopped instead of the floating `"hold to reverse"` text). Keep **Horn** as a compact pill/circle above Brake and **Exit** as a clean door-exit icon top-right.
- **On Foot (`TouchControls`):** Keep the large primary **Action** button on the right thumb arc, but hide or minimize it to a subtle 20%-alpha ring when `dim == true` (nothing nearby) and animate it into view with a contextual icon when an interaction enters range. Place **Jump** as a smaller satellite icon button along the upper-right thumb arc.

### Option C — Chennai High-Contrast Graphic (Bold Arcade)
- Use rounded **squarcles** (`corner_radius = 16–18`) with thicker `2 px` strokes, dark charcoal fills (`alpha 0.72`), and semantic color accents:
  - **Amber (`#ffb703`):** Primary Action / Gas
  - **Coral Red (`#ff6b5a`):** Brake / Reverse / Exit
  - **Crisp White (`#f4f1ea`):** Jump / Horn / Pause / Map

## 4. Compatibility & Rollout
- All layout & hit-area tests (`test_touch_layout.gd`, `test_driving_controls_layout.gd`, `test_controls_layout.gd`, `test_ui_layout.gd`) validate `Rect2` bounds (`>= 48 dp` target size, safe area, non-overlap).
- By keeping the hit rects in `ControlsLayout` intact and upgrading only the drawing/styling inside `UiTheme`, `UiIcons`, `TouchButton`, `HoldButton`, `DrivingControls`, and `TouchControls`, the entire button redesign can be swapped in without breaking input routing or existing layout tests.

## 5. Open Questions for the Owner
1. Which visual style do you prefer: **A (Tactile Neo-Glass)**, **B (Shaped Pedals + Contextual Action)**, **C (Bold Squarcles)**, or a combination (e.g., **A + B**)?
2. Should the **Action** button on foot stay faintly visible when nothing is nearby, or auto-hide until you walk near a car/NPC/mission?
3. Do you want **Menu / Pause / Title buttons** refreshed in the same pass?
