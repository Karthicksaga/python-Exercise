# Godot controls redesign: touch and gamepad

Date: 24 Nov 2026. Status: proposed (owner reviews the interactive prototype, then it is built).
Owner's complaint: "the current controls are not good". Scope: `godot-chennai/` only.

## 1. What the controls are today (read from the code, G-66 and G-78)

**On foot** (`src/ui/touch_controls/`)
- A floating stick on the left 45% of the screen; camera drag on the rest.
- RUN is a **toggle button** (tap to run, it switches itself off); JUMP is a button. Both sit bottom-right.
- No contextual action button. GET IN is a separate control from the driving set.

**Driving** (`src/ui/driving_controls/`)
- A steering pad (250 x 128) bottom-left; GAS (100 x 124) and BRAKE (100 x 100) bottom-right; a P / R / D
  selector above GAS; HORN above BRAKE; EXIT top-right; speed and gear readout bottom-centre.

**Missing altogether:** gamepad (no joypad code anywhere in `src`), tilt steering, a left-handed layout,
sensitivity and opacity settings, haptics, remappable actions.

## 2. Weak spots

| # | Problem | Why it hurts on a phone |
|---|---|---|
| C1 | RUN is a separate toggle | The left thumb is on the stick and the right thumb is on the camera; reaching RUN means lifting one of them |
| C2 | Reverse needs the P / R / D selector | Parking in a Chennai lane (three-point turns) is constant; tapping a gear chip between every move is slow |
| C3 | Steering is a bounded slider next to separate pedals | One thumb steers, the other must hold GAS and move to BRAKE; no room for the horn without lifting |
| C4 | JUMP is as big as the things you do all the time | It is the least used action on a street map; the most used (GET IN, talk, hand over, pick up) has no button |
| C5 | No gamepad | Many phones are used with a clip-on or Bluetooth pad; also needed for testing on desktop |
| C6 | No settings | Thumbs differ: sensitivity, size, left-handed, haptics, tilt are standard on phone games |
| C7 | Controls hard-coded | Rebinding and a controls page need named actions (`input-systems`) |

## 3. Proposal

**On foot**
1. Keep the floating stick (left half, appears where the thumb lands).
2. **Auto-run:** push past 85 % to run, back under 70 % to walk (hysteresis). The RUN button goes; an optional
   "toggle run" stays in settings for people who prefer it.
3. Camera drag on the right half with inertia, a sensitivity setting and invert-Y.
4. One big **ACTION** button (right thumb, the biggest control on foot) that changes label with what is
   near: GET IN, TALK, PICK UP, HAND OVER, ENTER. It hides when there is nothing to do.
5. JUMP becomes a smaller button above ACTION, buffered 100 ms before landing and with 80 ms coyote time.

**Driving: three schemes, chosen in Settings (default A)**
- **A, Wheel:** left thumb steers with a *relative* drag (no need to touch the centre; auto-centres on
  release; response curve is progressive and speed-sensitive: less steering at 80 km/h). Right thumb:
  GAS (large) and BRAKE (below it). **Hold BRAKE when stopped for 0.4 s and the vehicle reverses**: P / R / D
  chips go; the gear shows as a readout only. HORN is a small button beside BRAKE. EXIT stays top-right.
- **B, Tilt:** the phone's tilt steers (calibrated on tap), GAS and BRAKE as in A.
- **C, Buttons:** LEFT and RIGHT buttons for precision and accessibility.
- All schemes: soft steering assist (auto-straighten, lane centring is not added), haptic tick on
  kerbs, speed breakers and collisions, mirror for left-handed players.

**Gamepad** (all through named `InputMap` actions, added at run time like the keyboard ones today)
| Action | Pad |
|---|---|
| Move / run | Left stick (run past the same 85 % threshold) |
| Look | Right stick |
| ACTION (context) | A / Cross |
| Jump | X / Square |
| Gas / Brake and reverse | RT / LT (analogue) |
| Steer | Left stick |
| Horn | Y / Triangle |
| Exit vehicle | B / Circle |
| Menu / Pause | Start |
| D-pad | Menu navigation (already works for focus) |
Vibration on crashes. Glyphs follow the last device used (touch, pad, keyboard).

**Settings page** (also shown under CONTROLS on the title): scheme, left-handed, sensitivity, invert-Y,
button size and opacity, haptics, run toggle.

## 4. Tests and acceptance
- Pure `ControlState` logic (dead zones, run hysteresis, reverse hold, response curve, buffered jump) with unit
  tests with numbers, waiting in game time; no wall clock.
- Layout tests at 915x412 and 1830x824: every button at least 48 dp, nothing under the thumbs' resting areas
  overlaps, left-handed mirror is an exact mirror.
- Gamepad: synthetic `InputEventJoypadMotion` / `Button` events drive the same code path as touch.
- Existing player, driving and touch tests keep passing unweakened; vehicle handling parity within 10 %.
- Screenshots of every scheme; real-phone check by the owner on the POCO M6 Pro 5G.

## 5. Open decision for the owner
Which driving scheme should be the default (A recommended), and whether tilt (B) is worth building now.
