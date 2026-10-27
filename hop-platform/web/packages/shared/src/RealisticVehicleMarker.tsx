import autoImg from "./assets/vehicles/auto.png";
import bikeImg from "./assets/vehicles/bike.png";
import sedanImg from "./assets/vehicles/sedan.png";
import suvImg from "./assets/vehicles/suv.png";
import miniImg from "./assets/vehicles/mini.png";

export type RealisticVehicleProps = {
  category?: string;
  heading?: number;
  size?: number;
  showShadow?: boolean;
  className?: string;
};

type MarkerConfig = {
  src: string;
  widthRatio: number;
  heightRatio: number;
};

const markerConfigs: Record<string, MarkerConfig> = {
  auto: { src: autoImg, widthRatio: 0.92, heightRatio: 0.84 },
  bike: { src: bikeImg, widthRatio: 0.94, heightRatio: 0.8 },
  sedan: { src: sedanImg, widthRatio: 1.18, heightRatio: 0.65 },
  suv: { src: suvImg, widthRatio: 1.12, heightRatio: 0.72 },
  mini: { src: miniImg, widthRatio: 1.08, heightRatio: 0.68 },
};

/**
 * Realistic vehicle marker with high-definition vehicle photography across the map.
 * Dynamically sizes, shrinks and grows based on existing marker dimensions (size prop),
 * with a high-definition navigation bearing indicator and smooth heading rotation.
 */
export default function RealisticVehicleMarker({
  category = "auto",
  heading = 0,
  size = 46,
  showShadow = true,
  className = "",
}: RealisticVehicleProps) {
  const cat = (category || "auto").toLowerCase();
  const cfg =
    markerConfigs[cat] ??
    (cat === "car" ? markerConfigs.sedan : cat === "cab" ? markerConfigs.mini : markerConfigs.auto);

  // Normalize heading to [0, 360)
  const normHeading = ((heading % 360) + 360) % 360;
  // If moving westward (between 180 and 360 deg), flip image horizontally to face driving direction
  const isWest = normHeading > 180 && normHeading < 360;

  return (
    <div
      className={`realistic-vehicle-wrapper ${className}`.trim()}
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
        position: "relative",
      }}
    >
      {/* Dynamic Ground Shadow */}
      {showShadow && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            bottom: size * 0.08,
            width: size * 0.95,
            height: size * 0.35,
            borderRadius: "50%",
            background: "radial-gradient(ellipse at center, rgba(15,23,42,0.45) 0%, rgba(15,23,42,0) 75%)",
            filter: "blur(1.5px)",
            pointerEvents: "none",
            zIndex: 1,
          }}
        />
      )}

      {/* Rotation container for map heading and navigation pointer */}
      <div
        className="vehicle-rotation-container"
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          transform: `rotate(${heading}deg)`,
          transition: "transform 0.25s linear",
          transformOrigin: "center center",
          zIndex: 2,
        }}
      >
        {/* Navigation bearing pointer (direction of travel) */}
        {heading !== undefined && heading !== 0 && (
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              top: -size * 0.16,
              left: "50%",
              transform: "translateX(-50%)",
              width: 0,
              height: 0,
              borderLeft: `${Math.max(3.5, size * 0.08)}px solid transparent`,
              borderRight: `${Math.max(3.5, size * 0.08)}px solid transparent`,
              borderBottom: `${Math.max(6, size * 0.16)}px solid #2563eb`,
              filter: "drop-shadow(0 1px 2px rgba(15,23,42,0.4))",
            }}
          />
        )}

        {/* Counter-rotate the vehicle photo so it remains right-side up,
            while facing the travel direction (flipped when heading west) */}
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transform: `rotate(${-heading}deg)`,
            transition: "transform 0.25s linear",
          }}
        >
          <img
            src={cfg.src}
            alt={cat}
            style={{
              width: `${cfg.widthRatio * size}px`,
              height: `${cfg.heightRatio * size}px`,
              maxWidth: `${cfg.widthRatio * size}px`,
              maxHeight: `${cfg.heightRatio * size}px`,
              objectFit: "contain",
              transform: isWest ? "scaleX(-1)" : "scaleX(1)",
              transition: "transform 0.2s ease",
              filter: showShadow ? "drop-shadow(0 3px 5px rgba(15,23,42,0.38))" : undefined,
              userSelect: "none",
              pointerEvents: "none",
            }}
          />
        </div>
      </div>
    </div>
  );
}
