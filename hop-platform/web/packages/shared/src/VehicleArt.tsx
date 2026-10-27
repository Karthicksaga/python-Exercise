import autoImg from "./assets/vehicles/auto.png";
import bikeImg from "./assets/vehicles/bike.png";
import sedanImg from "./assets/vehicles/sedan.png";
import suvImg from "./assets/vehicles/suv.png";
import miniImg from "./assets/vehicles/mini.png";

export const VEHICLE_IMAGES: Record<string, string> = {
  auto: autoImg,
  bike: bikeImg,
  sedan: sedanImg,
  suv: suvImg,
  mini: miniImg,
  car: sedanImg,
  cab: miniImg,
};

type VehicleConfig = {
  src: string;
  x: number;
  y: number;
  w: number;
  h: number;
  shadowRx: number;
  shadowRy: number;
  shadowOpacity: number;
};

// Calibrated bounding boxes and shadows inside the 120x64 viewBox so that
// vehicles with different natural aspect ratios (e.g. tall auto vs wide sedan)
// are properly scaled, shrink/grown to fit, and grounded on y = 56.
const vehicleConfigs: Record<string, VehicleConfig> = {
  auto: {
    src: autoImg,
    x: 31.5,
    y: 5.5,
    w: 57,
    h: 50,
    shadowRx: 28,
    shadowRy: 3.2,
    shadowOpacity: 0.22,
  },
  bike: {
    src: bikeImg,
    x: 28.5,
    y: 8,
    w: 63,
    h: 47,
    shadowRx: 30,
    shadowRy: 3,
    shadowOpacity: 0.2,
  },
  sedan: {
    src: sedanImg,
    x: 8,
    y: 17.6,
    w: 104,
    h: 37.4,
    shadowRx: 48,
    shadowRy: 3.5,
    shadowOpacity: 0.24,
  },
  suv: {
    src: suvImg,
    x: 10,
    y: 11.8,
    w: 100,
    h: 43.2,
    shadowRx: 46,
    shadowRy: 3.5,
    shadowOpacity: 0.24,
  },
  mini: {
    src: miniImg,
    x: 12,
    y: 13.4,
    w: 96,
    h: 41.6,
    shadowRx: 44,
    shadowRy: 3.5,
    shadowOpacity: 0.22,
  },
};

export default function VehicleArt({
  category,
  width = 96,
  className = "",
}: {
  category: string;
  width?: number;
  className?: string;
}) {
  const cat = (category || "auto").toLowerCase();
  const cfg =
    vehicleConfigs[cat] ??
    (cat === "car" ? vehicleConfigs.sedan : cat === "cab" ? vehicleConfigs.mini : vehicleConfigs.mini);

  return (
    <svg
      viewBox="0 0 120 64"
      width={width}
      height={(width * 64) / 120}
      role="img"
      aria-label={category}
      className={`vehicle-art ${className}`.trim()}
      style={{ overflow: "visible" }}
    >
      {/* Ground contact shadow */}
      <ellipse
        cx="60"
        cy="56.5"
        rx={cfg.shadowRx}
        ry={cfg.shadowRy}
        fill="#0f172a"
        opacity={cfg.shadowOpacity}
      />
      {/* High-res vehicle image */}
      <image
        href={cfg.src}
        xlinkHref={cfg.src}
        x={cfg.x}
        y={cfg.y}
        width={cfg.w}
        height={cfg.h}
        preserveAspectRatio="xMidYMid meet"
      />
    </svg>
  );
}
