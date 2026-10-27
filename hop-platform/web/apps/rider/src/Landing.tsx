import AppLanding from "@hop/shared/AppLanding";

/**
 * Hop Rider landing and sign-in page.
 * Uses the shared AppLanding component for unified design and responsiveness.
 */
export default function Landing({ phoneLogin }: { phoneLogin: boolean }) {
  return <AppLanding mode="rider" phoneLogin={phoneLogin} />;
}
