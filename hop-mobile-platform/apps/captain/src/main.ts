import "@prototype/style.css";
import "@shared/design/standalone.css";
import "@shared/prototypes/prototypes.css";
import "@shared/maps/map.css";
import { mountMobileApp } from "@shared/design/mountPrototype";

if (new URLSearchParams(location.search).get("map") !== "reference") {
  await import("@shared/design/animations.css");
}

await mountMobileApp("captain");
