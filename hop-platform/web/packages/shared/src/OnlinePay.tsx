import { useState } from "react";
import { api } from "./api";

type Order = { order_id: string; amount_paise: number; currency: string; key_id: string };
type Checkout = { open: () => void; on: (ev: string, cb: () => void) => void };
declare global {
  interface Window {
    Razorpay?: new (o: Record<string, unknown>) => Checkout;
  }
}

export function loadCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load the payment window"));
    document.head.appendChild(s);
  });
}

// Pays a trip through the online gateway; the server confirms by signature/webhook.
export default function OnlinePay({ rideId, refresh, notify }: { rideId: string; refresh: () => Promise<void>; notify: (s: string) => void }) {
  const [busy, setBusy] = useState(false);
  async function pay() {
    setBusy(true);
    try {
      const order = await api<Order>(`/api/rides/${rideId}/pay`, {});
      await loadCheckout();
      const Checkout = window.Razorpay;
      if (!Checkout) throw new Error("Payment window unavailable");
      const box = new Checkout({
        key: order.key_id,
        order_id: order.order_id,
        amount: order.amount_paise,
        currency: order.currency,
        name: "hop",
        handler: async (r: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          try {
            await api(`/api/rides/${rideId}/pay/verify`, r);
            await refresh();
            notify("Payment received. Thank you!");
          } catch (e) {
            notify((e as Error).message);
          }
        },
        modal: { ondismiss: () => setBusy(false) },
      });
      box.open();
    } catch (e) {
      notify((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <button disabled={busy} onClick={pay}>
      Pay online
    </button>
  );
}
