import { escape } from "../helpers";
import { icon } from "../icons";
export const inr = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(amount / 100);
export function paymentMethods(
  selected: string,
  balance: number | undefined,
  attribute = "data-live-method",
) {
  return `<div class="payment-methods" role="radiogroup" aria-label="Payment method">${[
    ["upi", "card", "UPI / online", "Pay through the secure checkout"],
    [
      "wallet",
      "wallet",
      "Hop Wallet",
      balance === undefined
        ? "Balance unavailable"
        : `Available balance ${inr(balance)}`,
    ],
    ["cash", "briefcase", "Cash", "Pay your Captain at the end of the ride"],
  ]
    .map(
      ([id, image, label, detail]) =>
        `<button class="payment-method ${selected.toLowerCase() === id ? "selected" : ""}" ${attribute}="${attribute === "data-payment" ? (id === "upi" ? "UPI" : id === "cash" ? "Cash" : "Wallet") : id}" role="radio" aria-checked="${selected.toLowerCase() === id}"><span class="payment-method-symbol">${icon(image)}</span><span><strong>${label}</strong><small>${escape(detail)}</small></span><i class="radio-dot" aria-hidden="true"></i></button>`,
    )
    .join("")}</div>`;
}
