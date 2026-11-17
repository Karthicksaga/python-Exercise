/**
 * On-screen controls: a floating joystick on the left half, camera drag on the right half, and
 * buttons that change with what the player is doing (jump on foot; accelerate, brake and a
 * P / R / D gear selector when driving; a context button to get in or out of a vehicle). Uses Pointer Events, so several
 * fingers work at once and a mouse works too.
 *
 * The controls only record intent; the game reads `state` once per frame.
 */

export interface ControlState {
  /** Stick position, each axis in [-1, 1]; y is forward. */
  moveX: number;
  moveY: number;
  /** Camera drag since the last `consumeLook()`, in CSS pixels. */
  lookDX: number;
  lookDY: number;
  /** Set when jump is pressed; cleared by `consumeJump()`. */
  jump: boolean;
  /** Held while the accelerator or brake button is down (driving). */
  gas: boolean;
  brake: boolean;
  /** Set when the context button is pressed; cleared by `consumeAction()`. */
  action: boolean;
  /** Held while the fire button is down (on foot). */
  fire: boolean;
  /** Set when the punch button is pressed; cleared by `consumePunch()`. */
  punch: boolean;
  /** Set when the horn is pressed (driving); cleared by `consumeHorn()`. */
  horn: boolean;
  /** Gear asked for on the selector (driving); cleared by `consumeGear()`. */
  gear: GearButton | null;
  /** Set when the weapon button is pressed (on foot); cleared by `consumeWeaponSwitch()`. */
  weaponSwitch: boolean;
}

/** The gear selector's positions: park, reverse, drive. */
export type GearButton = "P" | "R" | "D";
const GEAR_NAMES: Readonly<Record<GearButton, string>> = { P: "Park", R: "Reverse", D: "Drive" };

export type ControlMode = "foot" | "drive";

const STICK_RADIUS = 56; // px the knob can travel from its base

const STYLE = `
.cow-controls{position:absolute;inset:0;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
.cow-zone{position:absolute;top:0;bottom:0}
.cow-zone.move{left:0;width:45%}
.cow-zone.look{right:0;width:55%}
.cow-stick{position:absolute;width:${STICK_RADIUS * 2}px;height:${STICK_RADIUS * 2}px;margin:-${STICK_RADIUS}px 0 0 -${STICK_RADIUS}px;border-radius:50%;
  background:rgba(255,255,255,.12);border:2px solid rgba(255,255,255,.45);pointer-events:none;transition:opacity .15s}
.cow-stick.idle{opacity:.55}
.cow-knob{position:absolute;left:50%;top:50%;width:52px;height:52px;margin:-26px 0 0 -26px;border-radius:50%;
  background:rgba(255,255,255,.85);box-shadow:0 2px 8px rgba(0,0,0,.35)}
.cow-button{position:absolute;right:calc(28px + env(safe-area-inset-right));bottom:calc(36px + env(safe-area-inset-bottom));width:76px;height:76px;border-radius:50%;
  border:2px solid rgba(255,255,255,.6);background:rgba(20,24,40,.45);color:#fff;font:600 13px system-ui,sans-serif;letter-spacing:.5px;touch-action:none}
.cow-button.down{background:rgba(255,255,255,.35)}
.cow-button.gas{width:88px;height:88px;background:rgba(30,120,60,.55)}
.cow-button.brake{right:calc(132px + env(safe-area-inset-right));bottom:calc(30px + env(safe-area-inset-bottom));background:rgba(150,35,35,.55)}
.cow-button.action{right:calc(34px + env(safe-area-inset-right));bottom:calc(138px + env(safe-area-inset-bottom));width:64px;height:64px;background:rgba(255,183,3,.85);color:#1a1a1a;border-color:#fff;font-size:12px}
.cow-button.fire{right:calc(124px + env(safe-area-inset-right));bottom:calc(92px + env(safe-area-inset-bottom));width:68px;height:68px;background:rgba(170,40,40,.6)}
.cow-button.fire small{display:block;font:600 10px ui-monospace,monospace;opacity:.9}
.cow-button.hit{right:calc(122px + env(safe-area-inset-right));bottom:calc(16px + env(safe-area-inset-bottom));width:64px;height:64px;background:rgba(60,70,110,.6)}
.cow-button.weapon{right:calc(208px + env(safe-area-inset-right));bottom:calc(40px + env(safe-area-inset-bottom));width:78px;height:50px;border-radius:14px;
  background:rgba(25,28,40,.6);font:700 11px system-ui,sans-serif;letter-spacing:.3px;line-height:1.15}
.cow-button.weapon small{display:block;font:600 10px ui-monospace,monospace;opacity:.85}
.cow-button.horn{right:calc(144px + env(safe-area-inset-right));bottom:calc(124px + env(safe-area-inset-bottom));width:52px;height:52px;font-size:10px}
.cow-gears{position:absolute;right:calc(222px + env(safe-area-inset-right));bottom:calc(22px + env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:4px;
  padding:5px;border-radius:14px;background:rgba(15,18,30,.45);border:1px solid rgba(255,255,255,.35)}
.cow-gears button{width:42px;height:34px;border-radius:9px;border:0;background:transparent;color:rgba(255,255,255,.75);font:800 16px system-ui,sans-serif;touch-action:none}
.cow-gears button.on{background:#ffd166;color:#1a1a1a}
.cow-gears button.wait{box-shadow:inset 0 0 0 2px #ffd166;color:#ffd166;animation:cow-gear-wait .6s steps(2) infinite}
@keyframes cow-gear-wait{50%{box-shadow:none}}
.cow-controls [hidden]{display:none}
`;

/**
 * Keep receiving a pointer's events after it leaves the element. Touch pointers are captured
 * by the browser anyway, and capture can be refused (pointer already gone), so a failure here
 * must never stop the control from working.
 */
function capture(element: HTMLElement, pointerId: number): void {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // Not capturable: events still arrive while the pointer stays over the zone.
  }
}

export class TouchControls {
  readonly state: ControlState = { moveX: 0, moveY: 0, lookDX: 0, lookDY: 0, jump: false, gas: false, brake: false, action: false, fire: false, punch: false, horn: false, gear: null, weaponSwitch: false };
  private readonly weaponButton: HTMLButtonElement;
  private readonly weaponName: Text;
  private readonly weaponAmmo: HTMLElement;
  private readonly gearPanel: HTMLDivElement;
  private readonly gearButtons = new Map<GearButton, HTMLButtonElement>();
  private readonly fireButton: HTMLButtonElement;
  private readonly hitButton: HTMLButtonElement;
  private readonly hornButton: HTMLButtonElement;
  private readonly ammoLabel: HTMLElement;
  private readonly jumpButton: HTMLButtonElement;
  private readonly gasButton: HTMLButtonElement;
  private readonly brakeButton: HTMLButtonElement;
  private readonly actionButton: HTMLButtonElement;
  private readonly root: HTMLDivElement;
  private readonly stick: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private movePointer: number | null = null;
  private lookPointer: number | null = null;
  private baseX = 0;
  private baseY = 0;
  private lastLookX = 0;
  private lastLookY = 0;
  private readonly restX: number;
  private readonly restY: number;

  constructor(parent: HTMLElement) {
    if (!document.getElementById("cow-controls-style")) {
      const style = document.createElement("style");
      style.id = "cow-controls-style";
      style.textContent = STYLE;
      document.head.append(style);
    }
    this.root = document.createElement("div");
    this.root.className = "cow-controls";

    const moveZone = document.createElement("div");
    moveZone.className = "cow-zone move";
    moveZone.dataset.testid = "move-zone";
    const lookZone = document.createElement("div");
    lookZone.className = "cow-zone look";
    lookZone.dataset.testid = "look-zone";

    this.stick = document.createElement("div");
    this.stick.className = "cow-stick idle";
    this.knob = document.createElement("div");
    this.knob.className = "cow-knob";
    this.stick.append(this.knob);

    const button = (className: string, text: string, label: string) => {
      const element = document.createElement("button");
      element.className = `cow-button ${className}`;
      element.type = "button";
      element.textContent = text;
      element.setAttribute("aria-label", label);
      return element;
    };
    const jump = (this.jumpButton = button("", "JUMP", "Jump"));
    this.gasButton = button("gas", "GAS", "Accelerate");
    this.brakeButton = button("brake", "BRAKE", "Brake");
    this.actionButton = button("action", "", "Action");
    this.fireButton = button("fire", "FIRE", "Fire");
    this.ammoLabel = document.createElement("small");
    this.fireButton.append(this.ammoLabel);
    this.hitButton = button("hit", "HIT", "Punch");
    this.hornButton = button("horn", "HORN", "Horn");
    // Weapon switch, left of FIRE and HIT: the gun in hand and its rounds; a tap takes the next gun.
    this.weaponButton = button("weapon", "", "Switch weapon");
    this.weaponButton.dataset.testid = "weapon-switch";
    this.weaponName = document.createTextNode("PISTOL");
    this.weaponAmmo = document.createElement("small");
    this.weaponButton.append(this.weaponName, this.weaponAmmo);
    this.gasButton.hidden = this.brakeButton.hidden = this.actionButton.hidden = this.hornButton.hidden = true;
    // Gear selector beside the brake, in a real lever's order: P at the top, then R, then D.
    this.gearPanel = document.createElement("div");
    this.gearPanel.className = "cow-gears";
    this.gearPanel.dataset.testid = "gear-selector";
    this.gearPanel.hidden = true;
    for (const gear of ["P", "R", "D"] as const) {
      const element = document.createElement("button");
      element.type = "button";
      element.textContent = gear;
      element.setAttribute("aria-label", GEAR_NAMES[gear]);
      element.setAttribute("aria-pressed", "false");
      element.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        this.state.gear = gear;
      });
      this.gearButtons.set(gear, element);
      this.gearPanel.append(element);
    }

    this.root.append(moveZone, lookZone, this.stick, jump, this.gasButton, this.brakeButton, this.gearPanel, this.actionButton, this.fireButton, this.hitButton, this.hornButton, this.weaponButton);
    parent.append(this.root);

    // Where the stick rests when no finger is down.
    this.restX = 110;
    this.restY = 120; // from the bottom
    this.placeStick(this.restX, this.root.clientHeight - this.restY);
    window.addEventListener("resize", () => {
      if (this.movePointer === null) this.placeStick(this.restX, this.root.clientHeight - this.restY);
    });

    moveZone.addEventListener("pointerdown", (e) => {
      if (this.movePointer !== null) return;
      this.movePointer = e.pointerId;
      capture(moveZone, e.pointerId);
      this.baseX = e.clientX;
      this.baseY = e.clientY;
      this.placeStick(e.clientX, e.clientY);
      this.stick.classList.remove("idle");
      this.setStick(0, 0);
    });
    moveZone.addEventListener("pointermove", (e) => {
      if (e.pointerId !== this.movePointer) return;
      this.setStick(e.clientX - this.baseX, e.clientY - this.baseY);
    });
    const endMove = (e: PointerEvent) => {
      if (e.pointerId !== this.movePointer) return;
      this.movePointer = null;
      this.setStick(0, 0);
      this.stick.classList.add("idle");
      this.placeStick(this.restX, this.root.clientHeight - this.restY);
    };
    moveZone.addEventListener("pointerup", endMove);
    moveZone.addEventListener("pointercancel", endMove);

    lookZone.addEventListener("pointerdown", (e) => {
      if (this.lookPointer !== null) return;
      this.lookPointer = e.pointerId;
      capture(lookZone, e.pointerId);
      this.lastLookX = e.clientX;
      this.lastLookY = e.clientY;
    });
    lookZone.addEventListener("pointermove", (e) => {
      if (e.pointerId !== this.lookPointer) return;
      this.state.lookDX += e.clientX - this.lastLookX;
      this.state.lookDY += e.clientY - this.lastLookY;
      this.lastLookX = e.clientX;
      this.lastLookY = e.clientY;
    });
    const endLook = (e: PointerEvent) => {
      if (e.pointerId === this.lookPointer) this.lookPointer = null;
    };
    lookZone.addEventListener("pointerup", endLook);
    lookZone.addEventListener("pointercancel", endLook);

    jump.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.state.jump = true;
      jump.classList.add("down");
    });
    for (const type of ["pointerup", "pointercancel", "pointerleave"] as const) {
      jump.addEventListener(type, () => jump.classList.remove("down"));
    }
    // Accelerator and brake are held, not tapped.
    const hold = (element: HTMLButtonElement, key: "gas" | "brake" | "fire") => {
      element.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        capture(element, e.pointerId);
        this.state[key] = true;
        element.classList.add("down");
      });
      for (const type of ["pointerup", "pointercancel", "lostpointercapture"] as const) {
        element.addEventListener(type, () => {
          this.state[key] = false;
          element.classList.remove("down");
        });
      }
    };
    hold(this.gasButton, "gas");
    hold(this.brakeButton, "brake");
    hold(this.fireButton, "fire");
    const press = (element: HTMLButtonElement, key: "punch" | "horn") => {
      element.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        this.state[key] = true;
        element.classList.add("down");
      });
      for (const type of ["pointerup", "pointercancel", "pointerleave"] as const) {
        element.addEventListener(type, () => element.classList.remove("down"));
      }
    };
    press(this.hitButton, "punch");
    press(this.hornButton, "horn");
    this.weaponButton.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.state.weaponSwitch = true;
    });
    this.actionButton.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.state.action = true;
    });
    // Long-press must not open the browser's context menu over the game.
    this.root.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  /** Read and clear the camera drag accumulated since the last call. */
  consumeLook(): { dx: number; dy: number } {
    const out = { dx: this.state.lookDX, dy: this.state.lookDY };
    this.state.lookDX = 0;
    this.state.lookDY = 0;
    return out;
  }

  /** Read and clear a pending jump press. */
  consumeJump(): boolean {
    const pressed = this.state.jump;
    this.state.jump = false;
    return pressed;
  }

  /** Read and clear a pending press of the context button. */
  consumeAction(): boolean {
    const pressed = this.state.action;
    this.state.action = false;
    return pressed;
  }

  consumePunch(): boolean {
    const pressed = this.state.punch;
    this.state.punch = false;
    return pressed;
  }

  /** Read and clear a pending press of the weapon button. */
  consumeWeaponSwitch(): boolean {
    const pressed = this.state.weaponSwitch;
    this.state.weaponSwitch = false;
    return pressed;
  }

  /** The weapon button's label: the gun in hand and its rounds. */
  setWeapon(name: string, rounds: number): void {
    const label = name.toUpperCase();
    if (this.weaponName.data !== label) this.weaponName.data = label;
    const text = String(rounds);
    if (this.weaponAmmo.textContent !== text) this.weaponAmmo.textContent = text;
  }

  consumeHorn(): boolean {
    const pressed = this.state.horn;
    this.state.horn = false;
    return pressed;
  }

  /** Read and clear the gear last asked for on the selector. */
  consumeGear(): GearButton | null {
    const gear = this.state.gear;
    this.state.gear = null;
    return gear;
  }

  /** Light the engaged gear on the selector, and make a gear waiting for the vehicle to stop blink. */
  setGear(engaged: GearButton, waiting: GearButton | null): void {
    for (const [gear, element] of this.gearButtons) {
      const on = gear === engaged && waiting === null;
      element.classList.toggle("on", on);
      element.classList.toggle("wait", gear === waiting);
      const pressed = String(on);
      if (element.getAttribute("aria-pressed") !== pressed) element.setAttribute("aria-pressed", pressed);
    }
  }

  /** Swap the button set: jump, punch and fire on foot; accelerator, brake, gears and horn when driving. */
  setMode(mode: ControlMode): void {
    this.jumpButton.hidden = this.fireButton.hidden = this.hitButton.hidden = this.weaponButton.hidden = mode !== "foot";
    this.gasButton.hidden = this.brakeButton.hidden = this.hornButton.hidden = this.gearPanel.hidden = mode !== "drive";
    this.state.gas = this.state.brake = this.state.fire = false;
    this.state.gear = null;
    this.state.weaponSwitch = false;
  }

  /** Label of the horn button: "HORN", or "SIREN" in an ambulance. */
  setHornLabel(label: string): void {
    if (this.hornButton.textContent === label) return;
    this.hornButton.textContent = label;
    this.hornButton.setAttribute("aria-label", label === "SIREN" ? "Siren" : "Horn");
  }

  /** Rounds left, shown on the fire button. */
  setAmmo(rounds: number): void {
    const text = String(rounds);
    if (this.ammoLabel.textContent !== text) this.ammoLabel.textContent = text;
    this.fireButton.style.opacity = rounds > 0 ? "1" : "0.45";
  }

  /**
   * Show the context button with this label ("ENTER", "EXIT"), or hide it with null.
   * @param spoken accessible name; "Get in" / "Get out" for vehicles when omitted ("Go inside" for a place)
   */
  setAction(label: string | null, spoken?: string): void {
    this.actionButton.hidden = label === null;
    if (label === null) return;
    const names: Record<string, string> = { EXIT: "Get out", BOARD: "Board the train", "STEP OFF": "Step off the train" };
    const name = spoken ?? names[label] ?? "Get in";
    if (this.actionButton.textContent !== label) this.actionButton.textContent = label;
    if (this.actionButton.getAttribute("aria-label") !== name) this.actionButton.setAttribute("aria-label", name);
  }

  setVisible(visible: boolean): void {
    this.root.style.display = visible ? "" : "none";
  }

  private placeStick(x: number, y: number): void {
    this.stick.style.left = `${x}px`;
    this.stick.style.top = `${y}px`;
  }

  private setStick(dx: number, dy: number): void {
    const length = Math.hypot(dx, dy);
    const scale = length > STICK_RADIUS ? STICK_RADIUS / length : 1;
    const x = dx * scale;
    const y = dy * scale;
    this.knob.style.transform = `translate(${x}px, ${y}px)`;
    this.state.moveX = x / STICK_RADIUS;
    this.state.moveY = -y / STICK_RADIUS; // screen up = forward
  }
}
