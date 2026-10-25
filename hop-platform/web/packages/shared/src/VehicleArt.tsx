// Illustrated side-view vehicles for the ride picker (right-facing, 120x64 viewBox).
function Wheel({ x, y = 50, r = 9.5 }: { x: number; y?: number; r?: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill="#1f2937" />
      <circle cx={x} cy={y} r={r * 0.62} fill="#d1d5db" />
      <circle cx={x} cy={y} r={r * 0.62} fill="none" stroke="#9ca3af" strokeWidth="1" />
      <circle cx={x} cy={y} r={r * 0.2} fill="#6b7280" />
      {[0, 60, 120, 180, 240, 300].map((a) => (
        <line key={a} x1={x} y1={y} x2={x + Math.cos((a * Math.PI) / 180) * r * 0.55} y2={y + Math.sin((a * Math.PI) / 180) * r * 0.55} stroke="#9ca3af" strokeWidth="1" />
      ))}
    </g>
  );
}

function Defs({ id, a, b }: { id: string; a: string; b: string }) {
  return (
    <defs>
      <linearGradient id={`${id}-body`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={a} />
        <stop offset="1" stopColor={b} />
      </linearGradient>
      <linearGradient id={`${id}-glass`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#e0f2fe" />
        <stop offset="1" stopColor="#7dd3fc" />
      </linearGradient>
    </defs>
  );
}

const Shadow = () => <ellipse cx="60" cy="59.5" rx="46" ry="3.2" fill="#0f172a" opacity=".16" />;

function Auto() {
  return (
    <>
      <Defs id="auto" a="#fcd34d" b="#f59e0b" />
      <Shadow />
      {/* rounded canopy and open passenger cabin */}
      <path d="M12 31 Q9 11 30 8.5 H62 Q70 8.5 73 14 L79 31 Z" fill="#14532d" />
      <path d="M16 29 Q14 14 31 12 H60 Q66 12 68 16 L72 29 Z" fill="#0f172a" opacity=".82" />
      <rect x="22" y="19" width="40" height="10" rx="3" fill="#92400e" opacity=".85" />
      <rect x="20" y="14" width="3" height="16" fill="#14532d" />
      <rect x="62" y="12" width="3" height="18" fill="#14532d" />
      {/* windscreen */}
      <path d="M72 14 L80 31 H74 L69 17 Z" fill="url(#auto-glass)" />
      {/* body */}
      <path d="M12 31 H76 L84 31 Q95 38 97 47 V53 H12 Z" fill="url(#auto-body)" />
      <path d="M12 31 H76" stroke="#14532d" strokeWidth="3" />
      <path d="M13 43 H72" stroke="#b45309" strokeWidth="1.2" opacity=".55" />
      <rect x="20" y="36" width="22" height="4.5" rx="1.5" fill="#14532d" />
      <text x="31" y="39.8" fontSize="3.6" fill="#facc15" textAnchor="middle" fontWeight="700">AUTO</text>
      {/* front cowl: headlight, indicator, plate */}
      <path d="M78 33 Q90 38 93 46" stroke="#b45309" strokeWidth="1.2" fill="none" />
      <circle cx="93.5" cy="43" r="3.4" fill="#fef9c3" stroke="#f59e0b" />
      <rect x="82" y="47" width="10" height="5" rx="1" fill="#fff" stroke="#0f172a" strokeWidth=".6" />
      {/* wheel arches + wheels */}
      <path d="M17 53 a11 11 0 0 1 26 0 Z" fill="#78350f" opacity=".55" />
      <path d="M72 53 a11 11 0 0 1 22 0 Z" fill="#78350f" opacity=".55" />
      <Wheel x={30} y={52} r={8.5} />
      <Wheel x={83} y={52} r={8.5} />
    </>
  );
}

function Bike() {
  return (
    <>
      <Defs id="bike" a="#f87171" b="#b91c1c" />
      <Shadow />
      <Wheel x={26} y={48} r={11} />
      <Wheel x={94} y={48} r={11} />
      {/* frame, tank, seat */}
      <path d="M26 48 L44 30 H62 L72 40 L94 48" stroke="#374151" strokeWidth="3" fill="none" strokeLinejoin="round" />
      <path d="M52 29 Q60 20 74 27 L72 36 Q60 34 52 36 Z" fill="url(#bike-body)" />
      <path d="M32 29 H54 Q58 29 56 33 H34 Q30 33 32 29 Z" fill="#111827" />
      {/* engine */}
      <rect x="48" y="38" width="20" height="11" rx="3" fill="#6b7280" />
      <rect x="52" y="41" width="12" height="3" rx="1" fill="#9ca3af" />
      <path d="M40 46 H30 L24 50" stroke="#9ca3af" strokeWidth="3" strokeLinecap="round" fill="none" />
      {/* fork, handlebar, headlight */}
      <path d="M94 48 L84 22" stroke="#374151" strokeWidth="3" strokeLinecap="round" />
      <path d="M80 20 H90" stroke="#111827" strokeWidth="3" strokeLinecap="round" />
      <path d="M88 25 Q95 23 97 29 L89 31 Z" fill="#fef9c3" stroke="#f59e0b" strokeWidth="1" />
      <path d="M12 38 L30 31" stroke="#111827" strokeWidth="3" strokeLinecap="round" />
    </>
  );
}

function Car({ id, a, b, kind }: { id: string; a: string; b: string; kind: "mini" | "sedan" | "suv" }) {
  const body =
    kind === "mini"
      ? "M12 46 V40 Q12 36 17 35 L31 33 Q39 22 52 21 H72 Q80 21 86 31 L100 35 Q108 37 108 43 V46 Z"
      : kind === "sedan"
        ? "M8 46 V40 Q8 36 14 35 L30 33 Q38 21 54 20 H74 Q82 20 88 31 L106 35 Q113 37 113 43 V46 Z"
        : "M8 46 V36 Q8 32 13 31 L20 29 L26 15 H84 Q90 15 94 26 L105 31 Q112 33 112 41 V46 Z";
  const cabin =
    kind === "mini"
      ? ["M35 33 Q42 24 53 24 H60 V33 Z", "M64 24 H72 Q78 24 83 32 H64 Z"]
      : kind === "sedan"
        ? ["M34 33 Q41 23 55 23 H62 V33 Z", "M66 23 H74 Q80 23 85 32 H66 Z"]
        : ["M29 29 L32 18 H58 V29 Z", "M62 18 H82 Q86 18 90 28 H62 Z"];
  return (
    <>
      <Defs id={id} a={a} b={b} />
      <Shadow />
      <path d={body} fill={`url(#${id}-body)`} />
      <path d={body} fill="none" stroke="#000" strokeOpacity=".15" />
      {cabin.map((d, i) => (
        <path key={i} d={d} fill={`url(#${id}-glass)`} />
      ))}
      <path d="M60 24 V46" stroke="#000" strokeOpacity=".2" />
      <rect x="14" y="40" width={kind === "mini" ? 92 : 98} height="2" fill="#000" opacity=".12" />
      {kind === "suv" && (<><path d="M28 12 H84" stroke="#94a3b8" strokeWidth="2.4" strokeLinecap="round" /><path d="M32 12 V15 M80 12 V15" stroke="#94a3b8" strokeWidth="2" /></>)}
      <rect x="64" y="35" width="9" height="2" rx="1" fill="#000" opacity=".25" />
      {/* lights */}
      <path d={`M${kind === "mini" ? 104 : 109} 37 q4 0 4 4 h-5 z`} fill="#fef9c3" />
      <rect x="9" y="37" width="4" height="4" rx="1" fill="#ef4444" />
      <Wheel x={kind === "mini" ? 32 : 30} y={46} r={9.5} />
      <Wheel x={kind === "mini" ? 88 : 90} y={46} r={9.5} />
    </>
  );
}

export default function VehicleArt({ category, width = 96 }: { category: string; width?: number }) {
  return (
    <svg viewBox="0 0 120 64" width={width} height={(width * 64) / 120} role="img" aria-label={category} className="vehicle-art">
      {category === "auto" ? (
        <Auto />
      ) : category === "bike" ? (
        <Bike />
      ) : category === "suv" ? (
        <Car id="suv" a="#475569" b="#0f172a" kind="suv" />
      ) : category === "sedan" ? (
        <Car id="sedan" a="#f8fafc" b="#94a3b8" kind="sedan" />
      ) : (
        <Car id="mini" a="#5eead4" b="#0d9488" kind="mini" />
      )}
    </svg>
  );
}
