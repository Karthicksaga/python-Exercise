import VehicleArt from "./VehicleArt";
import { money, type Nearby, type VehiclePricing } from "./types";

const blurb: Record<string, string> = {
  bike: "Fastest in traffic",
  auto: "Everyday city hops",
  mini: "Compact AC cab",
  sedan: "Comfort for 4",
  suv: "Room for 6",
};

// Visual vehicle picker with the starting fare for each product.
export default function VehicleCards({ vehicles, value, onChange, nearby }: { vehicles: VehiclePricing[]; value: string; onChange: (c: string) => void; nearby?: Nearby[] | null }) {
  return (
    <div className="vehicles" role="radiogroup" aria-label="Choose your ride">
      {vehicles.map((v) => (
        <button
          key={v.category}
          type="button"
          role="radio"
          aria-checked={value === v.category}
          className={"vehicle" + (value === v.category ? " selected" : "")}
          onClick={() => onChange(v.category)}
        >
          <VehicleArt category={v.category} width={96} />
          <strong>{v.name}</strong>
          <small>{blurb[v.category] ?? ""}</small>
          <em>from {money(v.minimum_paise)}</em>
          {nearby && (
            <span className={"eta-chip" + (nearby.some((n) => n.category === v.category) ? "" : " none")}>
              {(() => {
                const n = nearby.find((item) => item.category === v.category);
                return n ? `${n.eta_minutes} min away` : "No drivers nearby";
              })()}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
