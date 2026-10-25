export type RealisticVehicleProps = {
  category?: string;
  heading?: number;
  size?: number;
  showShadow?: boolean;
  className?: string;
};

/**
 * Top-down realistic vector vehicles (Auto Rickshaw, Car/Cab, Bike/Scooter)
 * Designed to face North (0 deg / Up) and rotate smoothly with map navigation heading.
 */
export default function RealisticVehicleMarker({
  category = "auto",
  heading = 0,
  size = 46,
  showShadow = true,
  className = "",
}: RealisticVehicleProps) {
  const cat = (category || "auto").toLowerCase();

  return (
    <div
      className={`realistic-vehicle-wrapper ${className}`}
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
      <div
        className="vehicle-rotation-container"
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transform: `rotate(${heading}deg)`,
          transition: "transform 0.25s linear",
          transformOrigin: "center center",
        }}
      >
        {cat === "bike" ? (
          <TopDownBike showShadow={showShadow} />
        ) : cat === "auto" ? (
          <TopDownAuto showShadow={showShadow} />
        ) : (
          <TopDownCar showShadow={showShadow} kind={cat} />
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// 🛺 REALISTIC TOP-DOWN AUTO RICKSHAW
// Iconic Indian 3-wheeler: yellow canopy roof, green body, front single wheel, side mirrors
// ----------------------------------------------------------------------------
function TopDownAuto({ showShadow }: { showShadow: boolean }) {
  return (
    <svg viewBox="0 0 46 76" width="100%" height="100%" fill="none" style={{ overflow: "visible" }}>
      <defs>
        {/* Shadow */}
        <filter id="auto-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="3" stdDeviation="3.5" floodColor="#0f172a" floodOpacity="0.38" />
        </filter>
        {/* Yellow Canopy Gradient */}
        <linearGradient id="auto-canopy" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#eab308" />
          <stop offset="25%" stopColor="#fde047" />
          <stop offset="50%" stopColor="#facc15" />
          <stop offset="75%" stopColor="#fde047" />
          <stop offset="100%" stopColor="#ca8a04" />
        </linearGradient>
        {/* Green Body Gradient */}
        <linearGradient id="auto-green" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#14532d" />
          <stop offset="50%" stopColor="#16a34a" />
          <stop offset="100%" stopColor="#14532d" />
        </linearGradient>
        {/* Glass Gradient */}
        <linearGradient id="auto-windshield" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#bae6fd" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.75" />
        </linearGradient>
      </defs>

      <g filter={showShadow ? "url(#auto-shadow)" : undefined}>
        {/* Rear Wheels */}
        <rect x="3" y="48" width="5.5" height="15" rx="2.5" fill="#1e293b" />
        <rect x="37.5" y="48" width="5.5" height="15" rx="2.5" fill="#1e293b" />
        {/* Front Wheel */}
        <rect x="20.5" y="4" width="5" height="13" rx="2" fill="#1e293b" />

        {/* Chassis & Green Lower Body */}
        <path
          d="M 12 18 L 23 9 L 34 18 L 38 62 Q 38 68 34 68 L 12 68 Q 8 68 8 62 Z"
          fill="url(#auto-green)"
        />

        {/* Front Cowl / Mudguard */}
        <path d="M 19 12 L 23 8 L 27 12 L 26 22 L 20 22 Z" fill="#ca8a04" />

        {/* Front Windshield with curved glass */}
        <path
          d="M 13 22 Q 23 18 33 22 L 34 27 Q 23 23 12 27 Z"
          fill="url(#auto-windshield)"
          stroke="#0f172a"
          strokeWidth="0.8"
        />

        {/* Canopy / Top Roof (Iconic ribbed Auto Canvas Roof) */}
        <path
          d="M 10 27 Q 23 24 36 27 L 37.5 63 Q 37.5 66 34 66 L 12 66 Q 8.5 66 8.5 63 Z"
          fill="url(#auto-canopy)"
          stroke="#a16207"
          strokeWidth="0.8"
        />

        {/* Roof Stitched Seams / Ribs */}
        <path d="M 10 35 Q 23 33 36 35" stroke="#a16207" strokeWidth="0.75" strokeDasharray="2,1" />
        <path d="M 9.5 44 Q 23 42 36.5 44" stroke="#a16207" strokeWidth="0.75" strokeDasharray="2,1" />
        <path d="M 9 53 Q 23 51 37 53" stroke="#a16207" strokeWidth="0.75" strokeDasharray="2,1" />

        {/* Side Mirrors */}
        <circle cx="8" cy="20" r="2.2" fill="#334155" stroke="#f8fafc" strokeWidth="0.5" />
        <line x1="8" y1="20" x2="13" y2="23" stroke="#334155" strokeWidth="1.2" />
        <circle cx="38" cy="20" r="2.2" fill="#334155" stroke="#f8fafc" strokeWidth="0.5" />
        <line x1="38" y1="20" x2="33" y2="23" stroke="#334155" strokeWidth="1.2" />

        {/* Front Headlight (Bright yellow beam emitter) */}
        <circle cx="23" cy="9" r="2.8" fill="#fef08a" stroke="#eab308" strokeWidth="0.8" />

        {/* Rear Red Tail Lights */}
        <rect x="9.5" y="66" width="5.5" height="1.8" rx="0.8" fill="#ef4444" />
        <rect x="31" y="66" width="5.5" height="1.8" rx="0.8" fill="#ef4444" />
        {/* Rear Number Plate */}
        <rect x="18" y="66.2" width="10" height="2" rx="0.5" fill="#f8fafc" stroke="#475569" strokeWidth="0.4" />
      </g>
    </svg>
  );
}

// ----------------------------------------------------------------------------
// 🚗 REALISTIC TOP-DOWN CAR / CAB
// Aerodynamic sedan/cab: hood lines, panoramic windshield, tinted sunroof, wheels, side mirrors
// ----------------------------------------------------------------------------
function TopDownCar({ showShadow, kind }: { showShadow: boolean; kind?: string }) {
  const isYellowCab = kind === "mini";
  const bodyColorA = isYellowCab ? "#facc15" : "#f8fafc";
  const bodyColorB = isYellowCab ? "#eab308" : "#cbd5e1";
  const roofColor = isYellowCab ? "#1e293b" : "#0f172a";

  return (
    <svg viewBox="0 0 46 84" width="100%" height="100%" fill="none" style={{ overflow: "visible" }}>
      <defs>
        <filter id="car-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="3.5" stdDeviation="4" floodColor="#0f172a" floodOpacity="0.42" />
        </filter>
        {/* Body Paint Gradient */}
        <linearGradient id="car-body" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={bodyColorB} />
          <stop offset="15%" stopColor={bodyColorA} />
          <stop offset="50%" stopColor="#ffffff" />
          <stop offset="85%" stopColor={bodyColorA} />
          <stop offset="100%" stopColor={bodyColorB} />
        </linearGradient>
        {/* Glass Windshield Gradient */}
        <linearGradient id="car-windshield" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0284c7" stopOpacity="0.85" />
          <stop offset="50%" stopColor="#0369a1" stopOpacity="0.92" />
          <stop offset="100%" stopColor="#0f172a" stopOpacity="0.95" />
        </linearGradient>
      </defs>

      <g filter={showShadow ? "url(#car-shadow)" : undefined}>
        {/* 4 Wheels (Tires) with treads */}
        <rect x="2" y="14" width="5.5" height="15" rx="2.5" fill="#0f172a" />
        <rect x="38.5" y="14" width="5.5" height="15" rx="2.5" fill="#0f172a" />
        <rect x="2" y="55" width="5.5" height="15" rx="2.5" fill="#0f172a" />
        <rect x="38.5" y="55" width="5.5" height="15" rx="2.5" fill="#0f172a" />

        {/* Car Outer Chassis / Body */}
        <path
          d="M 14 6 C 18 4, 28 4, 32 6 C 36 9, 39 16, 39 26 L 39 62 C 39 72, 36 78, 32 80 C 28 81, 18 81, 14 80 C 10 78, 7 72, 7 62 L 7 26 C 7 16, 10 9, 14 6 Z"
          fill="url(#car-body)"
          stroke="#94a3b8"
          strokeWidth="0.8"
        />

        {/* Front Hood Contours */}
        <path d="M 14 9 L 16 23" stroke="#cbd5e1" strokeWidth="0.75" />
        <path d="M 32 9 L 30 23" stroke="#cbd5e1" strokeWidth="0.75" />

        {/* Front Windshield (curved aerodynamic glass) */}
        <path
          d="M 12 24 C 18 22, 28 22, 34 24 L 35 34 C 28 32, 18 32, 11 34 Z"
          fill="url(#car-windshield)"
          stroke="#0f172a"
          strokeWidth="0.6"
        />
        {/* Windshield Wiper line */}
        <line x1="16" y1="32" x2="23" y2="28" stroke="#64748b" strokeWidth="0.6" />
        <line x1="26" y1="32" x2="33" y2="28" stroke="#64748b" strokeWidth="0.6" />

        {/* Glass Sunroof / Dark Roof Cabin */}
        <rect x="12" y="35" width="22" height="19" rx="2" fill={roofColor} opacity="0.9" />
        {/* Roof Highlight */}
        <path d="M 14 37 L 32 37" stroke="#38bdf8" strokeWidth="0.5" opacity="0.6" />

        {/* Rear Windshield */}
        <path
          d="M 12 55 C 18 57, 28 57, 34 55 L 34.5 63 C 28 65, 18 65, 11.5 63 Z"
          fill="url(#car-windshield)"
          stroke="#0f172a"
          strokeWidth="0.6"
        />

        {/* Trunk Contour */}
        <path d="M 14 74 C 20 76, 26 76, 32 74" stroke="#94a3b8" strokeWidth="0.8" />

        {/* Aerodynamic Side Mirrors */}
        <path d="M 6 25 Q 4 23 6 21 L 9 22 Z" fill="url(#car-body)" stroke="#475569" strokeWidth="0.5" />
        <path d="M 40 25 Q 42 23 40 21 L 37 22 Z" fill="url(#car-body)" stroke="#475569" strokeWidth="0.5" />

        {/* Front LED Headlights */}
        <path d="M 10 9 C 12 7, 15 7, 16 9 L 15 12 L 10 12 Z" fill="#fef08a" opacity="0.9" />
        <path d="M 36 9 C 34 7, 31 7, 30 9 L 31 12 L 36 12 Z" fill="#fef08a" opacity="0.9" />

        {/* Rear Red LED Tail Lights */}
        <rect x="8" y="77" width="7" height="2.2" rx="1" fill="#ef4444" />
        <rect x="31" y="77" width="7" height="2.2" rx="1" fill="#ef4444" />
      </g>
    </svg>
  );
}

// ----------------------------------------------------------------------------
// 🏍️ REALISTIC TOP-DOWN MOTORCYCLE / SCOOTER
// Narrow silhouette: front wheel, handlebars with grips, fuel tank, leather seat, rear light
// ----------------------------------------------------------------------------
function TopDownBike({ showShadow }: { showShadow: boolean }) {
  return (
    <svg viewBox="0 0 36 74" width="100%" height="100%" fill="none" style={{ overflow: "visible" }}>
      <defs>
        <filter id="bike-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="2.5" stdDeviation="3" floodColor="#0f172a" floodOpacity="0.4" />
        </filter>
        <linearGradient id="bike-tank" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#b91c1c" />
          <stop offset="35%" stopColor="#ef4444" />
          <stop offset="50%" stopColor="#f87171" />
          <stop offset="80%" stopColor="#ef4444" />
          <stop offset="100%" stopColor="#991b1b" />
        </linearGradient>
      </defs>

      <g filter={showShadow ? "url(#bike-shadow)" : undefined}>
        {/* Front Tire */}
        <rect x="16" y="2" width="4" height="15" rx="2" fill="#0f172a" />
        {/* Front Mudguard */}
        <rect x="15.5" y="6" width="5" height="9" rx="1.5" fill="#ef4444" />

        {/* Handlebars with Grips & Side Mirrors */}
        <path d="M 6 18 Q 18 16 30 18" stroke="#334155" strokeWidth="2" strokeLinecap="round" />
        {/* Left & Right Rubber Grips */}
        <rect x="4" y="16.5" width="4" height="3" rx="1" fill="#0f172a" />
        <rect x="28" y="16.5" width="4" height="3" rx="1" fill="#0f172a" />
        {/* Side Mirrors */}
        <circle cx="5" cy="14" r="2" fill="#0f172a" stroke="#94a3b8" strokeWidth="0.5" />
        <circle cx="31" cy="14" r="2" fill="#0f172a" stroke="#94a3b8" strokeWidth="0.5" />

        {/* Front Headlight */}
        <ellipse cx="18" cy="13" rx="3.5" ry="2" fill="#fef08a" stroke="#eab308" strokeWidth="0.6" />

        {/* Fuel Tank (Metallic Red with aerodynamic shape) */}
        <path
          d="M 14 21 Q 18 18 22 21 L 23.5 35 Q 18 36 12.5 35 Z"
          fill="url(#bike-tank)"
          stroke="#7f1d1d"
          strokeWidth="0.6"
        />

        {/* Rider + Pillion Leather Seat */}
        <path
          d="M 13 36 C 13 34, 23 34, 23 36 L 22.5 56 C 22.5 59, 13.5 59, 13.5 56 Z"
          fill="#1e293b"
          stroke="#0f172a"
          strokeWidth="0.8"
        />
        {/* Seat Stitch Line */}
        <line x1="14" y1="45" x2="22" y2="45" stroke="#475569" strokeWidth="0.8" strokeDasharray="1.5,1" />

        {/* Rear Cowl & Mudguard */}
        <path d="M 14 56 L 18 64 L 22 56 Z" fill="#ef4444" />

        {/* Rear Tire */}
        <rect x="15.5" y="58" width="5" height="14" rx="2" fill="#0f172a" />

        {/* Rear Red LED Tail Light */}
        <rect x="15.5" y="65" width="5" height="2" rx="0.8" fill="#ef4444" />
      </g>
    </svg>
  );
}
