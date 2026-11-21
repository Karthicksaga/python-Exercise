/**
 * The wanted level on the HUD: five stars under the money and stage line, lit for each star of
 * the level and flashing red and blue while the police can see the player. Hidden while the
 * player is not wanted. Kept out of `Hud` so the police feature stays in its own module; it
 * finds the money line through the HUD's own class names.
 */

const STYLE = `
.cow-wanted{display:flex;gap:2px;margin-top:3px;font-size:15px;line-height:1;letter-spacing:0}
.cow-wanted i{font-style:normal;color:rgba(255,255,255,.28);text-shadow:0 1px 2px rgba(0,0,0,.6)}
.cow-wanted i.on{color:#ffd166}
.cow-wanted.seen i.on{animation:cow-wanted-flash .5s steps(1) infinite}
@keyframes cow-wanted-flash{0%{color:#ff5050}50%{color:#5b8cff}}
`;

export class WantedStars {
  private readonly row: HTMLDivElement;
  private readonly stars: HTMLElement[] = [];
  private shown = -1;
  private flashing = false;

  /** @param hudRoot `Hud.root`; the stars go under its money and stage line */
  constructor(hudRoot: HTMLElement) {
    if (!document.getElementById("cow-wanted-style")) {
      const style = document.createElement("style");
      style.id = "cow-wanted-style";
      style.textContent = STYLE;
      document.head.append(style);
    }
    this.row = document.createElement("div");
    this.row.className = "cow-wanted";
    this.row.dataset.testid = "wanted";
    this.row.setAttribute("role", "img");
    for (let i = 0; i < 5; i++) {
      const star = document.createElement("i");
      star.textContent = "★";
      this.row.append(star);
      this.stars.push(star);
    }
    this.row.hidden = true;
    const stats = hudRoot.querySelector(".cow-stats");
    if (stats) stats.after(this.row);
    else hudRoot.append(this.row);
  }

  /**
   * @param stars wanted level, 0 to 5 (0 hides the row)
   * @param seen the police can see the player now: the lit stars flash
   */
  set(stars: number, seen: boolean): void {
    if (stars !== this.shown) {
      this.shown = stars;
      this.row.hidden = stars <= 0;
      this.stars.forEach((star, i) => star.classList.toggle("on", i < stars));
      this.row.setAttribute("aria-label", `Wanted level ${stars} of 5`);
      this.row.dataset.stars = String(stars);
    }
    const flashing = seen && stars > 0;
    if (flashing !== this.flashing) {
      this.flashing = flashing;
      this.row.classList.toggle("seen", flashing);
    }
  }
}
