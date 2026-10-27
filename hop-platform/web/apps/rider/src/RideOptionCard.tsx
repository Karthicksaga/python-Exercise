import VehicleArt from "@hop/shared/VehicleArt";

export default function RideOptionCard({ category, name, selected, loading, availability, fare, description, unavailable, tags, onSelect }: {
  category: string; name: string; selected: boolean; loading: boolean;
  availability: string; fare: string; description?: string; unavailable?: boolean; tags?: React.ReactNode; onSelect: () => void;
}) {
  return <button type="button" role="radio" aria-checked={selected} className="booking-ride-option" data-selected={selected} data-unavailable={unavailable} aria-busy={loading} onClick={onSelect}>
    <VehicleArt category={category} width={64} />
    <span className="booking-ride-description"><strong>{name}</strong>{description && <small>{description}</small>}<small className="booking-availability">{availability}</small><span className="booking-ride-tags">{tags}</span></span>
    <span className="booking-ride-price"><strong>{loading ? "Calculating…" : fare}</strong><span aria-hidden="true" className="booking-radio-dot" /></span>
  </button>;
}
