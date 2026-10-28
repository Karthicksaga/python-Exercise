import "@shared/style.css";
import { CaptainApp } from "./features/prototype/CaptainApp";

document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("app");
  if (!container) return;

  const app = new CaptainApp(container);

  // Handle Capacitor native hardware back button
  try {
    const capacitorApp = (window as any).Capacitor?.Plugins?.App;
    if (capacitorApp) {
      capacitorApp.addListener("backButton", () => {
        app.back();
      });
    }
  } catch (err) {
    console.debug("Capacitor App plugin not available:", err);
  }
});
