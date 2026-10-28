/** Explicit design-only login review. Never invokes auth APIs or sends SMS. */
export class LoginPrototype {
  private step = 0;
  constructor(private app: HTMLElement) {
    app.addEventListener("click", this.click, true);
    this.render();
  }
  private click = (event: Event) => {
    const target = (event.target as Element).closest<HTMLElement>(
      '[data-action="demo-login"],[data-login-preview]',
    );
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (target.dataset.loginPreview === "reset") {
      this.step = 0;
      this.render();
      return;
    }
    if (target.dataset.loginPreview === "error") {
      const feedback = this.app.querySelector(".login-feedback")!;
      feedback.textContent =
        "That code doesn’t look right. Try again or request a new one.";
      feedback.setAttribute("role", "alert");
      return;
    }
    this.step = (this.step + 1) % 3;
    this.render();
  };
  private render() {
    const action = this.app.querySelector<HTMLElement>(
      '[data-action="demo-login"]',
    );
    if (action?.firstChild)
      action.firstChild.textContent =
        this.step === 0
          ? "Send sign-in code"
          : this.step === 1
            ? "Verify & continue"
            : "Restart login preview";
    this.app.querySelector("#preview-code-block")?.remove();
    if (this.step === 1) {
      const block = document.createElement("div");
      block.id = "preview-code-block";
      block.innerHTML =
        '<label class="field-label" for="preview-login-code">Six-digit SMS code</label><input id="preview-login-code" class="text-input" inputmode="numeric" maxlength="6" placeholder="0 0 0 0 0 0" autocomplete="one-time-code"/>';
      this.app.querySelector(".login-phone")?.after(block);
    }
    const feedback = this.app.querySelector(".login-feedback");
    if (feedback) {
      feedback.removeAttribute("role");
      feedback.textContent =
        this.step === 0
          ? "Design preview · no SMS will be sent."
          : this.step === 1
            ? "Preview code: 123456 · no real verification occurs."
            : "You’re ready to go. This is a simulated success state.";
    }
    if (!this.app.querySelector('[data-login-preview="reset"]')) {
      const row = document.createElement("div");
      row.className = "login-preview-tools";
      row.innerHTML =
        '<button class="text-button" data-login-preview="reset">Restart preview</button><button class="text-button" data-login-preview="error">Preview code error</button>';
      this.app.querySelector(".login-assurance")?.after(row);
    }
    const badge = this.app.querySelector(".app-head > .badge");
    if (badge) badge.textContent = "Design preview";
  }
}
