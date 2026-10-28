import { escape } from "../helpers";
export class PaymentPrototype {
  private method = "upi";
  private state = "choose";
  private balance = 128;
  constructor(
    private app: HTMLElement,
    private role: "rider" | "captain",
  ) {
    app.addEventListener("click", this.click);
    this.render();
  }
  private click = (event: Event) => {
    const button = (event.target as Element).closest<HTMLElement>(
      "[data-pay-method],[data-pay-state]",
    );
    if (!button) return;
    if (button.dataset.payMethod) {
      this.method = button.dataset.payMethod;
      this.state = "choose";
    }
    if (button.dataset.payState) {
      this.state = button.dataset.payState;
      if (this.state === "topup-done") {
        this.balance = 268;
        this.state = "choose";
      }
    }
    this.render();
  };
  private button(label: string, state: string, secondary = false) {
    return `<button class="${secondary ? "secondary" : "primary"}" data-pay-state="${state}">${label}<span aria-hidden="true">→</span></button>`;
  }
  private render() {
    this.app.className = `app ${this.role} payment-prototype`;
    let title = "A clear finish.",
      copy =
        this.role === "rider"
          ? "Choose how you’d like to pay for your ride."
          : "One place to check payment and finish the trip.";
    let content = "",
      actions = "";
    const summary = `<div class="payment-amount"><span>${this.role === "rider" ? "YOUR RIDE TOTAL" : "TRIP FARE"}</span><strong>₹268<span>.00</span></strong><small>Adyar → Chennai Airport · sample ride</small></div>`;
    if (this.state === "choose") {
      content = `${summary}<div class="payment-section-label">${this.role === "rider" ? "PAY YOUR WAY" : "PAYMENT METHOD"}</div><div class="payment-methods">${[
        ["upi", "↗", "UPI", "Pay with your preferred UPI app"],
        ["wallet", "▣", "Hop Wallet", `Available balance ₹${this.balance}`],
        ["cash", "₹", "Cash", "Pay your Captain at the end of the ride"],
      ]
        .map(
          ([id, symbol, name, detail]) =>
            `<button class="payment-method ${this.method === id ? "selected" : ""}" data-pay-method="${id}" role="radio" aria-checked="${this.method === id}"><span class="payment-method-symbol">${symbol}</span><span><strong>${name}</strong><small>${detail}</small></span><i class="radio-dot"></i></button>`,
        )
        .join(
          "",
        )}</div>${this.method === "wallet" && this.balance < 268 ? '<div class="payment-hint">Your wallet needs ₹140 more. Add money or choose another method.</div>' : ""}<details class="payment-breakdown"><summary>Fare breakdown <strong>₹268</strong></summary><p><span>Base fare</span><span>₹40</span></p><p><span>Distance & time</span><span>₹228</span></p><p><span>Platform fee</span><span>₹0</span></p></details><div class="payment-secure">◇ Payment status is confirmed by the backend in the final app.</div>`;
      actions = this.button(
        this.role === "captain"
          ? this.method === "cash"
            ? "Record cash received"
            : "Check payment status"
          : this.method === "cash"
            ? "Choose cash"
            : this.method === "wallet" && this.balance < 268
              ? "Add ₹140 to wallet"
              : "Continue with " + (this.method === "upi" ? "UPI" : "Wallet"),
        this.method === "cash"
          ? "cash"
          : this.method === "wallet" && this.balance < 268
            ? "topup"
            : "processing",
      );
    } else if (this.state === "topup") {
      title = "A little top-up.";
      copy = "Cover this ride without changing your payment method.";
      content = `<div class="payment-state-symbol">＋</div><div class="payment-amount"><span>AMOUNT TO ADD</span><strong>₹140<span>.00</span></strong><small>Wallet after top-up: ₹268</small></div><div class="payment-hint">Prototype only. No money is added and no gateway is opened.</div>`;
      actions =
        this.button("Preview top-up complete", "topup-done") +
        this.button("Choose another method", "choose", true);
    } else if (this.state === "processing" || this.state === "pending") {
      title = "We’re checking.";
      copy =
        "You can leave this screen. Payment verification continues on the server in the final app.";
      content = `<div class="payment-state-symbol checking">↻</div>${summary}<div class="payment-status-label">${this.state === "processing" ? "PAYMENT STARTED" : "WAITING FOR VERIFICATION"}</div><div class="payment-hint">Don’t pay again while verification is pending. A debit alone doesn’t confirm a successful ride payment.</div><div class="payment-demo-controls"><span>EXPLORE A RESULT</span>${this.button("Simulate verified success", "success", true)}${this.button("Simulate pending status", "pending", true)}${this.button("Simulate failed payment", "failed", true)}</div>`;
      actions = this.button("Back to payment methods", "choose", true);
    } else if (this.state === "cash") {
      title =
        this.role === "captain" ? "Record the handover." : "Pay your Captain.";
      copy =
        "Cash is paid directly. This is separate from an online gateway confirmation.";
      content = `<div class="payment-state-symbol">₹</div>${summary}<div class="payment-hint">${this.role === "captain" ? "Only record receipt after collecting cash from the rider." : "Please pay the exact fare when the trip ends."}</div>`;
      actions =
        this.button(
          this.role === "captain"
            ? "Preview cash receipt recorded"
            : "Preview Captain confirms receipt",
          "cash-recorded",
        ) + this.button("Change method", "choose", true);
    } else if (this.state === "cash-recorded") {
      title = "Cash handover recorded.";
      copy =
        "Recorded by the Captain. This is not a bank or gateway verification.";
      content = `<div class="payment-state-symbol success">✓</div>${summary}<div class="payment-receipt"><span>Payment method</span><strong>Cash</strong><span>Status</span><strong>Captain reported received</strong><span>Reference</span><strong>DEMO-CASH-268</strong></div>`;
      actions = this.button("Back to prototype", "choose");
    } else if (this.state === "success") {
      title = "All settled.";
      copy = "A calmer finish to your journey.";
      content = `<div class="payment-state-symbol success">✓</div>${summary}<div class="payment-receipt"><span>Payment method</span><strong>${this.method === "upi" ? "UPI" : "Wallet"}</strong><span>Verification</span><strong>Simulated backend confirmation</strong><span>Reference</span><strong>DEMO-HOP-268</strong></div><div class="payment-hint">Design preview · this is not a real payment receipt.</div>`;
      actions =
        this.button("Preview refund status", "refund", true) +
        this.button("Done · restart prototype", "choose");
    } else if (this.state === "failed") {
      title = "Let’s try another way.";
      copy = "Payment could not be confirmed. Your trip details are safe.";
      content = `<div class="payment-state-symbol failure">!</div>${summary}<div class="payment-hint">Check the payment status before retrying if money was debited. Refund timing depends on the provider.</div>`;
      actions =
        this.button("Retry verification", "pending") +
        this.button("Change payment method", "choose", true);
    } else {
      title = "Your refund, in view.";
      copy = "A simple view of what happens after a refund is approved.";
      content = `<div class="payment-state-symbol">↶</div>${summary}<ol class="payment-timeline"><li>Refund requested <small>Request recorded by support</small></li><li>Processing <small>Waiting for the provider’s response</small></li><li class="pending">Returned to original payment method <small>No guaranteed date is shown</small></li></ol>`;
      actions = this.button("Back to prototype", "choose");
    }
    this.app.innerHTML = `<div class="status-bar"><span>9:41</span><span aria-hidden="true">▂▅▇</span></div><header class="app-head"><div class="brand">hop<span class="role-tag">${this.role.toUpperCase()}</span></div><span class="badge neutral">Payment prototype</span></header><div class="screen-body"><section class="payment-intro"><span>THE LAST LITTLE STEP</span><h1>${escape(title)}</h1><p>${escape(copy)}</p></section><div class="payment-content">${content}</div></div><footer class="action-bar payment-actions">${actions}<p class="fineprint">Design preview · sample ₹268 · no payment or API calls</p></footer>`;
  }
}
