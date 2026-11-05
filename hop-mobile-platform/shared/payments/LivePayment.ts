import { api } from "../services/client";
import type { Ride, State } from "../services/contracts";
import { escape } from "../helpers";
import { inr, paymentMethods } from "./components";
import { checkout, type Order, type Verification } from "./checkout";
/** Approved payment layout with server-owned amounts and settlement states. */
export class LivePayment {
  private lastRendered = "";
  private qr = "";
  private directUpi = false;
  private ride: Ride;
  private selected: string;
  private busy = false;
  private confirmReceipt = false;
  private cashChosen = false;
  private confirmUnpaid = false;
  private rating = 0;
  private error = "";
  private balance?: number;
  private timer?: ReturnType<typeof setTimeout>;
  private disposed = false;
  private verification?: Verification;
  private pending = false;
  private providerUnavailable = false;
  constructor(
    private app: HTMLElement,
    ride: Ride,
    private role: "rider" | "captain",
    private close: () => void,
  ) {
    this.ride = ride;
    this.selected = ride.payment_method;
    this.pending = !!sessionStorage.getItem(this.key());
    app.addEventListener("click", this.click, true);
    this.render();
    void this.refresh().catch((error) => {
      this.error = (error as Error).message;
      this.render();
    });
    this.schedule();
  }
  private key() {
    return `hop.payment.pending:${this.ride.id}`;
  }
  /** Puts the payment page back if the app's renderer drew another screen over it. */
  ensureShown() {
    if (!this.disposed && !this.app.querySelector(".payment-intro")) this.render();
  }
  update(ride: Ride) {
    if (this.disposed) return;
    this.ride = ride;
    if (
      ride.payment_status === "paid_online" ||
      ride.payment_status === "driver_reported_received"
    ) {
      this.pending = false;
      sessionStorage.removeItem(this.key());
    }
    this.render();
  }
  private schedule() {
    if (!this.disposed)
      this.timer = setTimeout(() => {
        void this.refresh()
          .catch((error) => {
            this.error = (error as Error).message;
            this.render();
          })
          .finally(() => this.schedule());
      }, 4000);
  }
  private async refresh() {
    const state = await api.state();
    const ride = state.rides?.find((r) => r.id === this.ride.id);
    if (ride) this.update(ride);
    if (this.role === "rider") {
      try {
        const wallet = await api.request<{ balance_paise: number }>(
          "/api/wallet",
        );
        this.balance = wallet.balance_paise;
        this.render();
      } catch {}
    }
  }
  /**
   * Sends a payment action with the ride's latest version. The other person may have just changed
   * the ride (the rider reporting cash, say), and a stale version would be refused.
   */
  private async act(name: string) {
    await this.refresh();
    await api.action(this.ride.id, this.ride.version, name);
  }
  private async run(work: () => Promise<void>) {
    if (this.busy) return;
    this.busy = true;
    this.error = "";
    this.render();
    try {
      await api.session();
      await work();
    } catch (error) {
      this.error =
        error instanceof Error
          ? error.message
          : "Payment status is unavailable.";
    } finally {
      this.busy = false;
      this.render();
    }
  }
  private click = (event: Event) => {
    const button = (event.target as Element).closest<HTMLElement>(
      "[data-live-method],[data-live-pay],[data-live-rate]",
    );
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (this.busy) return;
    if (button.dataset.liveRate) {
      this.rating = Number(button.dataset.liveRate);
      this.render();
      return;
    }
    if (button.dataset.liveMethod) {
      this.selected = button.dataset.liveMethod;
      this.render();
      return;
    }
    const action = button.dataset.livePay;
    if (action === "close") {
      this.destroy();
      this.close();
      return;
    }
    if (action === "refresh") {
      void this.run(async () => {
        if (this.verification)
          await api.request(
            `/api/rides/${this.ride.id}/pay/verify`,
            this.verification,
          );
        await this.refresh();
      });
      return;
    }
    if (action === "direct-upi") {
      const vpa = this.ride.driver_upi;
      if (!vpa || !/^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$/.test(vpa)) return;
      void this.run(async () => {
        const { toDataURL } = await import("qrcode");
        const parameters = new URLSearchParams({
          pa: vpa,
          pn: this.ride.driver_name || "Hop Captain",
          am: ((this.ride.payable_paise ?? this.ride.fare_paise) / 100).toFixed(
            2,
          ),
          cu: "INR",
          tn: `Hop ride ${this.ride.id.slice(0, 8)}`,
        });
        this.qr = await toDataURL(`upi://pay?${parameters}`, {
          width: 210,
          margin: 2,
        });
        this.directUpi = true;
      });
      return;
    }
    if (action === "cash-confirm") {
      this.confirmReceipt = true;
      this.render();
      return;
    }
    if (action === "not-yet") {
      this.confirmReceipt = false;
      this.confirmUnpaid = false;
      this.render();
      return;
    }
    if (action === "change") {
      this.cashChosen = false;
      this.render();
      return;
    }
    if (action === "cash") {
      void this.run(async () => {
        await this.act("payment_received");
        await this.refresh();
      });
      return;
    }
    if (action === "cash-paid") {
      void this.run(async () => {
        await this.act("cash_paid");
        await this.refresh();
      });
      return;
    }
    if (action === "unpaid-confirm") {
      this.confirmUnpaid = true;
      this.confirmReceipt = false;
      this.render();
      return;
    }
    if (action === "unpaid") {
      void this.run(async () => {
        await this.act("payment_not_received");
        this.confirmUnpaid = false;
        await this.refresh();
      });
      return;
    }
    if (action === "rate") {
      if (this.rating < 1) return;
      void this.run(async () => {
        await api.request(`/api/rides/${this.ride.id}/rating`, { score: this.rating });
        this.ride = { ...this.ride, my_rating: this.rating };
        await this.refresh();
      });
      return;
    }
    if (action === "dispute") {
      void this.run(async () => {
        await this.act("payment_disputed");
        await this.refresh();
      });
      return;
    }
    if (action === "topup") {
      void this.run(() => this.topup());
      return;
    }
    if (action === "pay") {
      void this.run(() => this.pay());
      return;
    }
  };
  private async topup() {
    if (this.role !== "rider") return;
    const amount = Math.max(
      1000,
      (this.ride.payable_paise ?? this.ride.fare_paise) - (this.balance || 0),
    );
    const key = `hop.wallet.pending:${this.ride.id}`;
    const cached = sessionStorage.getItem(key);
    let result: Order | { balance_paise: number };
    if (cached) {
      try {
        result = JSON.parse(cached);
      } catch {
        throw new Error(
          "A wallet top-up may already be pending. Check your wallet or contact support before trying again.",
        );
      }
    } else {
      sessionStorage.setItem(key, "creating");
      result = await api.request("/api/wallet/topup", { amount_paise: amount });
    }
    if ("balance_paise" in result) {
      sessionStorage.removeItem(key);
      await this.refresh();
      this.error =
        "Test wallet credit added. No real money was charged.";
      return;
    }
    sessionStorage.setItem(key, JSON.stringify(result));
    const verification = await checkout(result);
    await api.request("/api/wallet/verify", verification);
    sessionStorage.removeItem(key);
    await this.refresh();
  }
  private async pay() {
    if (this.ride.status !== "completed" && this.ride.status !== "in_progress")
      throw new Error("Payment is available after your trip starts.");
    await this.refresh();
    if (
      this.ride.payment_status &&
      this.ride.payment_status !== "unconfirmed" &&
      this.ride.payment_status !== "driver_reported_unpaid"
    )
      return;
    if (this.selected === "cash" || this.selected === "wallet") {
      if (
        this.selected === "wallet" &&
        this.balance !== undefined &&
        this.balance < (this.ride.payable_paise ?? this.ride.fare_paise)
      )
        throw new Error(
          "Your wallet needs more money. Add money before switching, or choose another method.",
        );
      if (this.selected !== this.ride.payment_method)
        await api.action(
          this.ride.id,
          this.ride.version,
          "change_payment_method",
          { payment_method: this.selected },
        );
      else if (this.selected === "wallet" && this.ride.status === "completed")
        await api.action(
          this.ride.id,
          this.ride.version,
          "change_payment_method",
          { payment_method: "wallet" },
        );
      await this.refresh();
      if (this.selected === "cash") this.cashChosen = true;
      return;
    }
    // Reuse a known pending order; never create another order after an uncertain response.
    if (this.providerUnavailable)
      throw new Error(
        "Online checkout is not configured. Choose Cash or Wallet instead.",
      );
    const cached = sessionStorage.getItem(this.key());
    let order: Order;
    if (cached) {
      try {
        order = JSON.parse(cached) as Order;
      } catch {
        throw new Error(
          "A payment order may already exist. Check payment status or contact support before trying again.",
        );
      }
    } else {
      sessionStorage.setItem(this.key(), "creating");
      this.pending = true;
      this.render();
      order = await api.request<Order>(`/api/rides/${this.ride.id}/pay`, {});
      sessionStorage.setItem(this.key(), JSON.stringify(order));
    }
    if (!order.order_id)
      throw new Error(
        "An existing payment needs a status check before another attempt.",
      );
    if (order.key_id === "rzp_test_mock") {
      this.providerUnavailable = true;
      this.pending = false;
      sessionStorage.removeItem(this.key());
      throw new Error(
        "Online payment isn’t available yet. Choose Cash or Wallet; nothing was charged.",
      );
    }
    this.pending = true;
    this.render();
    this.verification = await checkout(order);
    await api.request(
      `/api/rides/${this.ride.id}/pay/verify`,
      this.verification,
    );
    this.verification = undefined;
    await this.refresh();
  }
  /** One rating per trip; the server rejects a second one. */
  private ratingCard() {
    if (this.ride.status !== "completed" || !(this.role === "captain" || this.ride.driver_name)) return "";
    const other = this.role === "rider" ? "your Captain" : "your rider";
    if (this.ride.my_rating)
      return `<div class="section-card payment-rating" data-rated="${this.ride.my_rating}"><p>You rated ${other} ${"★".repeat(this.ride.my_rating)}</p></div>`;
    return `<div class="section-card payment-rating"><p>How was ${other}?</p><div class="stars" aria-label="Rate ${other}">${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="${n <= this.rating ? "active" : ""}" data-live-rate="${n}" aria-label="${n} star${n > 1 ? "s" : ""}" aria-pressed="${n === this.rating}">★</button>`).join("")}</div></div>`;
  }
  private ratingAction() {
    if (this.ride.status !== "completed" || !(this.role === "captain" || this.ride.driver_name) || this.ride.my_rating || this.rating < 1) return "";
    return this.button(`Send ${this.rating}-star rating`, "rate");
  }
  private button(label: string, action: string, secondary = false) {
    return `<button class="${secondary ? "secondary" : "primary"}" data-live-pay="${action}" ${this.busy ? "disabled" : ""}>${label}</button>`;
  }
  private render() {
    if (this.disposed) return;
    const signature = JSON.stringify([
      this.ride,
      this.selected,
      this.busy,
      this.error,
      this.balance,
      this.pending,
      this.directUpi,
      this.qr,
      this.confirmReceipt,
      this.cashChosen,
      this.confirmUnpaid,
      this.rating,
    ]);
    // Re-draw when nothing changed only if the app's renderer has drawn over this page.
    if (signature === this.lastRendered && this.app.dataset.livePayment === this.ride.id && this.app.querySelector(".payment-intro")) return;
    this.lastRendered = signature;
    const status = this.ride.payment_status || "unconfirmed",
      amount = this.ride.payable_paise ?? this.ride.fare_paise;
    let title = "A clear finish.",
      copy = "Choose how you’d like to pay for your ride.",
      content = "",
      actions = "";
    const summary = `<div class="payment-amount"><span>${this.role === "rider" ? "YOUR RIDE TOTAL" : "TRIP FARE"}</span><strong>${inr(amount)}</strong><small>${escape(this.ride.pickup_label)} → ${escape(this.ride.dropoff_label)}</small></div>`;
    if (status === "paid_online" || status === "driver_reported_received") {
      const verified = status === "paid_online";
      title = verified ? "All settled." : "Payment handover recorded.";
      copy = verified
        ? "Payment confirmed by Hop."
        : "Reported by the Captain. This is separate from gateway verification.";
      content = `<div class="payment-state-symbol success">✓</div>${summary}<div class="payment-receipt"><span>Payment method</span><strong>${escape(verified ? (this.ride.payment_method === "wallet" ? "Wallet" : "Online payment") : this.ride.payment_method.toUpperCase())}</strong><span>Status</span><strong>${verified ? "Confirmed by Hop" : "Captain reported received"}</strong><span>Ride reference</span><strong>${escape(this.ride.id.slice(0, 12))}</strong></div>${this.ratingCard()}`;
      actions = this.ratingAction() + this.button("Done", "close", !!this.ratingAction());
      if (!verified && this.role === "rider")
        actions += this.button("Report a payment issue", "dispute", true);
    } else if (status === "rider_reported_paid" && this.role === "rider") {
      title = "Thanks, payment noted.";
      copy = "You told us you paid your Captain. You can book your next ride.";
      content = `<div class="payment-state-symbol success">✓</div>${summary}<div class="payment-receipt"><span>Payment method</span><strong>${escape(this.ride.payment_method.toUpperCase())}</strong><span>Status</span><strong>You reported paying</strong><span>Ride reference</span><strong>${escape(this.ride.id.slice(0, 12))}</strong></div>${this.ratingCard()}`;
      actions = this.ratingAction() + this.button("Done", "close", !!this.ratingAction());
    } else if (status === "driver_reported_unpaid" && this.role === "rider" && !this.pending && !this.directUpi) {
      title = "Your Captain didn’t receive payment.";
      copy = "Pay with Wallet or online now, or report an issue if you already paid.";
      const choice = this.selected === "cash" ? "wallet" : this.selected;
      content =
        summary +
        paymentMethods(choice, this.balance).replace(/<button[^>]*data-live-method="cash"[\s\S]*?<\/button>/, "") +
        '<div class="payment-hint">You can’t book another ride until this payment is settled.</div>';
      actions =
        (choice === "wallet" && this.balance !== undefined && this.balance < amount
          ? this.button(`Add ${inr(Math.max(1000, amount - this.balance))} to Wallet`, "topup")
          : "") +
        this.button(choice === "wallet" ? "Pay with Wallet" : "Pay online", "pay") +
        this.button("I already paid · report an issue", "dispute", true) +
        this.button("Back to rides", "close", true);
    } else if (status === "rider_disputed") {
      title = "Your payment is under review.";
      copy = "Support needs to review this payment before another settlement.";
      content =
        summary +
        '<div class="payment-hint">No additional payment is requested here. Check back for the backend’s updated status.</div>';
      actions =
        this.button("Check status", "refresh") +
        this.button("Back to rides", "close", true);
    } else if (this.directUpi) {
      title = "Pay your Captain directly.";
      copy =
        "Scan with your UPI app. Hop does not treat opening the app as payment confirmation.";
      const parameters = new URLSearchParams({
        pa: this.ride.driver_upi || "",
        pn: this.ride.driver_name || "Hop Captain",
        am: (amount / 100).toFixed(2),
        cu: "INR",
        tn: `Hop ride ${this.ride.id.slice(0, 8)}`,
      });
      content =
        summary +
        `<div style="text-align:center"><img src="${this.qr}" width="210" height="210" alt="UPI payment QR for the assigned Captain"/><p class="small">${escape(this.ride.driver_upi || "")}</p></div><div class="payment-hint">Your Captain must confirm receiving a direct UPI payment. A QR scan alone does not settle the ride.</div>`;
      actions =
        `<a class="primary" href="upi://pay?${escape(parameters.toString())}">Open UPI app</a>` +
        this.button("Check payment status", "refresh") +
        this.button("Back to rides", "close", true);
    } else if (this.pending) {
      title = "We’re checking.";
      copy =
        "An online payment was started. Check its status before trying again.";
      content = `<div class="payment-state-symbol checking">↻</div>${summary}<div class="payment-hint">A debit or checkout callback alone is not payment confirmation. We’re waiting for Hop’s verification.</div>`;
      actions = this.button("Check payment status", "refresh");
      const cached = sessionStorage.getItem(this.key());
      if (cached && cached !== "creating")
        actions += this.button("Reopen existing checkout", "pay", true);
      actions += this.button("Back to rides", "close", true);
    } else if (
      this.role === "rider" &&
      this.cashChosen &&
      this.ride.payment_method === "cash"
    ) {
      title = "Pay your Captain.";
      copy = "Cash is paid directly at the end of the ride.";
      content =
        summary +
        '<div class="payment-hint">Hand the cash to your Captain, then tap “I’ve paid my Captain”. Your Captain can still confirm it or report a problem.</div>';
      actions =
        (status === "unconfirmed" && this.ride.status === "completed"
          ? this.button("I’ve paid my Captain", "cash-paid")
          : "") +
        this.button("Check payment status", "refresh", status === "unconfirmed") +
        this.button("Change method", "change", true) +
        this.button("Back to rides", "close", true);
    } else if (this.role === "captain") {
      const riderPaid = status === "rider_reported_paid",
        unpaid = status === "driver_reported_unpaid";
      title = riderPaid ? "Rider says they paid." : unpaid ? "Reported as not received." : "Record the handover.";
      copy = riderPaid
        ? "Confirm the handover, or report it if you didn’t get the money."
        : unpaid
          ? "The rider has been asked to pay. Record it if you receive the payment later."
          : "Check the status before recording payment from the rider.";
      content =
        summary +
        `<div class="payment-receipt"><span>Method</span><strong>${escape(this.ride.payment_method.toUpperCase())}</strong><span>Status</span><strong>${riderPaid ? "Rider reported paying" : unpaid ? "You reported not received" : "Awaiting confirmation"}</strong></div><div class="payment-hint">Only record receipt after receiving the cash or direct UPI payment. Hop confirms online payments for you.</div>${this.ratingCard()}`;
      actions =
        this.ride.status === "completed" &&
        this.ride.payment_method !== "wallet"
          ? this.button(
              this.confirmReceipt
                ? "Yes, payment received"
                : "Record payment received",
              this.confirmReceipt ? "cash" : "cash-confirm",
            )
          : this.button("Check payment status", "refresh");
      if (this.confirmReceipt) {
        title = "Confirm the handover.";
        copy =
          "Confirm only after you have received the cash or direct UPI payment.";
        actions += this.button("Not yet", "not-yet", true);
      } else if (this.confirmUnpaid) {
        title = "Report payment not received?";
        copy = "The rider will be asked to pay before booking again.";
        actions =
          this.button("Yes, I didn’t receive it", "unpaid") +
          this.button("Not yet", "not-yet", true);
      } else if (
        this.ride.status === "completed" &&
        !unpaid &&
        (this.ride.payment_method === "cash" || this.ride.payment_method === "upi")
      )
        actions += this.button("Cash not received", "unpaid-confirm", true);
      if (!this.confirmReceipt && !this.confirmUnpaid) actions = this.ratingAction() + actions;
      actions += this.button("Back to rides", "close", true);
    } else {
      content =
        summary +
        paymentMethods(this.selected, this.balance) +
        `<div class="payment-hint">${this.selected === "cash" ? "Cash is handed directly to your Captain. Wait for their receipt confirmation." : this.selected === "wallet" ? "Hop takes the fare from your wallet balance and confirms it here." : "Hop confirms your online payment after secure checkout."}</div>`;
      actions =
        (this.selected === "wallet" &&
        this.balance !== undefined &&
        this.balance < amount
          ? this.button(
              `Add ${inr(Math.max(1000, amount - this.balance))} to Wallet`,
              "topup",
            )
          : "") +
        this.button(
          this.selected === "cash"
            ? "Use cash"
            : this.selected === "wallet"
              ? "Pay with Wallet"
              : "Pay online",
          "pay",
        ) +
        this.button("Check payment status", "refresh", true) +
        this.button("Back to rides", "close", true);
    }
    if (
      this.role === "rider" &&
      !this.pending &&
      !this.directUpi &&
      status === "unconfirmed" &&
      this.ride.driver_upi
    )
      actions += this.button("Direct UPI QR", "direct-upi", true);
    this.app.className = `app ${this.role} payment-prototype`;
    this.app.dataset.livePayment = this.ride.id;
    this.app.innerHTML = `<header class="app-head"><div class="brand">hop<span class="role-tag">${this.role.toUpperCase()}</span></div><span class="badge neutral" data-keep>Ride payment</span></header><div class="screen-body"><section class="payment-intro"><span>THE LAST LITTLE STEP</span><h1>${escape(title)}</h1><p>${escape(copy)}</p></section><div class="payment-content">${this.error ? `<div class="payment-hint payment-error" role="alert">${escape(this.error)}</div>` : ""}${content}</div></div><footer class="action-bar payment-actions">${actions}<p class="fineprint">Status comes from your Hop account · ${this.busy ? "Updating…" : "Secure payment handling"}</p></footer>`;
  }
  destroy() {
    this.disposed = true;
    clearTimeout(this.timer);
    this.app.removeEventListener("click", this.click, true);
    delete this.app.dataset.livePayment;
  }
}
