import VehicleArt from "@hop/shared/VehicleArt";

export default function RideOptionCard({ category, name, selected, loading, availability, fare, tags, onSelect }: {
  category: string; name: string; selected: boolean; loading: boolean;
  availability: string; fare: string; tags?: React.ReactNode; onSelect: () => void;
}) {
  return <button type="button" role="radio" aria-checked={selected} className="booking-ride-option" data-selected={selected} aria-busy={loading} onClick={onSelect}>
    <VehicleArt category={category} width={64} />
    <span className="booking-ride-description"><strong>{name}</strong><small>{availability}</small><span className="booking-ride-tags">{tags}</span></span>
    <span className="booking-ride-price"><strong>{loading ? "Updating…" : fare}</strong><span aria-hidden="true" className="booking-radio-dot" /></span>
  </button>;
}
