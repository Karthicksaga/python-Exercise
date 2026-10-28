export const recoveryStates = {
  location: {
    symbol: "⌖",
    title: "A little help finding you.",
    copy: "Location access is unavailable. You can still enter your pickup address or choose a point on the map.",
    action: "Enter pickup manually",
  },
  offline: {
    symbol: "⌁",
    title: "A pause in the connection.",
    copy: "We couldn’t confirm the latest status. Check your existing request before sending another.",
    action: "Check request status",
  },
  expired: {
    symbol: "◷",
    title: "Let’s refresh your fare.",
    copy: "This quote is no longer valid. Review the updated fare before requesting a ride.",
    action: "Refresh fare",
  },
  drivers: {
    symbol: "↗",
    title: "A busy moment nearby.",
    copy: "No eligible Captain accepted this request before it expired. You can review another vehicle or try again.",
    action: "Review ride options",
  },
  taken: {
    symbol: "↪",
    title: "That request moved on.",
    copy: "This offer is no longer available. Your next eligible request will appear when it arrives.",
    action: "Return to Drive",
  },
  cancelled: {
    symbol: "✓",
    title: "Your request is cancelled.",
    copy: "Hop confirmed the cancellation. No new ride has been created.",
    action: "Back to rides",
  },
  alerts: {
    symbol: "♧",
    title: "Stay in the loop.",
    copy: "Device notifications aren’t enabled. In-app trip updates remain available while the app is open.",
    action: "View notifications",
  },
};
export type RecoveryState = keyof typeof recoveryStates;
