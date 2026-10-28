export type Order = {
  order_id: string;
  amount_paise: number;
  currency: string;
  key_id: string;
  test_mode?: boolean;
};
export type Verification = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};
type Checkout = {
  open(): void;
  on(name: string, handler: (event: unknown) => void): void;
};
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => Checkout;
  }
}
let loader: Promise<void> | undefined;
async function load() {
  if (window.Razorpay) return;
  if (loader) return loader;
  loader = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            "Payment checkout timed out. Check payment status before trying again.",
          ),
        ),
      12000,
    );
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => {
      clearTimeout(timer);
      window.Razorpay
        ? resolve()
        : reject(new Error("Payment checkout is unavailable."));
    };
    script.onerror = () => {
      clearTimeout(timer);
      reject(new Error("Unable to load payment checkout."));
    };
    document.head.append(script);
  });
  loader=loader.catch(error=>{loader=undefined;throw error;});
  return loader;
}
/** Provider callback is not proof of payment; the caller must verify it server-side. */
export async function checkout(order: Order): Promise<Verification> {
  if (!order.key_id || order.key_id === "rzp_test_mock")
    throw new Error(
      "Only a development payment stub is configured. No payment was attempted. Configure the provider’s test key to test checkout.",
    );
  await load();
  return new Promise((resolve, reject) => {
    let finished = false;
    const fail = (message: string) => {
      if (!finished) {
        finished = true;
        reject(new Error(message));
      }
    };
    const instance = new window.Razorpay!({
      key: order.key_id,
      order_id: order.order_id,
      amount: order.amount_paise,
      currency: order.currency,
      name: "Hop",
      description: "Hop ride payment",
      theme: { color: "#e54d36" },
      handler: (verification: Verification) => {
        if (!finished) {
          finished = true;
          resolve(verification);
        }
      },
      modal: {
        ondismiss: () =>
          fail(
            "Checkout closed. Check payment status before starting another payment.",
          ),
      },
    });
    instance.on("payment.failed", () =>
      fail(
        "Payment was not confirmed by the provider. Check its status before retrying.",
      ),
    );
    instance.open();
  });
}
