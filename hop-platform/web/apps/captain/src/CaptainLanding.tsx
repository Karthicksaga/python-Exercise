import AppLanding from "@hop/shared/AppLanding";

/**
 * Hop Captain landing and sign-in page.
 * Uses the shared AppLanding component matching Rider's responsive, mobile-first design system.
 */
export default function CaptainLanding({ phoneLogin }: { phoneLogin: boolean }) {
  return <AppLanding mode="captain" phoneLogin={phoneLogin} />;
}
