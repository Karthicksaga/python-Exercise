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
      "[data-live-method],[data-live-pay]",
    );
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (this.busy) return;
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
        await api.action(this.ride.id, this.ride.version, "payment_received");
        await this.refresh();
      });
      return;
    }
    if (action === "dispute") {
      void this.run(async () => {
        await api.action(this.ride.id, this.ride.version, "payment_disputed");
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
        "Development wallet credit recorded by the backend. No real money was charged.";
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
    if (this.ride.payment_status && this.ride.payment_status !== "unconfirmed")
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
        "Only the backend’s development payment stub is configured. Choose Cash or Wallet; no checkout or payment was attempted.",
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
    ]);
    if (signature === this.lastRendered) return;
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
        ? "Payment confirmed by Hop’s backend."
        : "Reported by the Captain. This is separate from gateway verification.";
      content = `<div class="payment-state-symbol success">✓</div>${summary}<div class="payment-receipt"><span>Payment method</span><strong>${escape(verified ? (this.ride.payment_method === "wallet" ? "Wallet" : "Online payment") : this.ride.payment_method.toUpperCase())}</strong><span>Status</span><strong>${verified ? "Backend confirmed" : "Captain reported received"}</strong><span>Ride reference</span><strong>${escape(this.ride.id.slice(0, 12))}</strong></div>`;
      actions = this.button("Done", "close");
      if (!verified && this.role === "rider")
        actions += this.button("Report a payment issue", "dispute", true);
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
        '<div class="payment-hint">We’re waiting for your Captain to record receipt. An online payment is not being requested.</div>';
      actions =
        this.button("Check payment status", "refresh") +
        this.button("Change method", "change", true) +
        this.button("Back to rides", "close", true);
    } else if (this.role === "captain") {
      title = "Record the handover.";
      copy = "Check the status before recording payment from the rider.";
      content =
        summary +
        `<div class="payment-receipt"><span>Method</span><strong>${escape(this.ride.payment_method.toUpperCase())}</strong><span>Status</span><strong>Awaiting confirmation</strong></div><div class="payment-hint">Only record receipt after receiving the cash or direct UPI payment. Online payments are verified by the backend.</div>`;
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
      }
      actions += this.button("Back to rides", "close", true);
    } else {
      content =
        summary +
        paymentMethods(this.selected, this.balance) +
        `<div class="payment-hint">${this.selected === "cash" ? "Cash is handed directly to your Captain. Wait for their receipt confirmation." : this.selected === "wallet" ? "Wallet payment is settled by the backend. Your balance is never changed locally." : "Your online payment is verified by the backend after secure provider checkout."}</div>`;
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
    this.app.innerHTML = `<div class="status-bar"><span>9:41</span><span aria-hidden="true">▂▅▇</span></div><header class="app-head"><div class="brand">hop<span class="role-tag">${this.role.toUpperCase()}</span></div><span class="badge neutral">Ride payment</span></header><div class="screen-body"><section class="payment-intro"><span>THE LAST LITTLE STEP</span><h1>${escape(title)}</h1><p>${escape(copy)}</p></section><div class="payment-content">${this.error ? `<div class="payment-hint payment-error" role="alert">${escape(this.error)}</div>` : ""}${content}</div></div><footer class="action-bar payment-actions">${actions}<p class="fineprint">Status comes from your Hop account · ${this.busy ? "Updating…" : "Secure payment handling"}</p></footer>`;
  }
  destroy() {
    this.disposed = true;
    clearTimeout(this.timer);
    this.app.removeEventListener("click", this.click, true);
    delete this.app.dataset.livePayment;
  }
}
