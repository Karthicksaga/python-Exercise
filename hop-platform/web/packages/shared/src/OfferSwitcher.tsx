import React from "react";

export interface OfferItem {
  id: string;
  title: string;
  subtitle: string;
  fareFormatted: string;
}

export interface OfferSwitcherProps {
  offers: OfferItem[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

export const OfferSwitcher: React.FC<OfferSwitcherProps> = ({
  offers,
  selectedIndex,
  onSelect,
}) => {
  if (!offers || offers.length <= 1) return null;

  return (
    <div
      className="offer-switcher"
      role="tablist"
      aria-label="Incoming ride offers"
    >
      {offers.map((offer, index) => {
        const active = index === selectedIndex;
        return (
          <button
            key={offer.id || index}
            type="button"
            role="tab"
            aria-selected={active}
            className={`offer-tab-btn ${active ? "active" : ""}`}
            onClick={() => onSelect(index)}
          >
            <span>
              <strong>{offer.title}</strong> · {offer.subtitle}
            </span>
            <span>{offer.fareFormatted}</span>
          </button>
        );
      })}
    </div>
  );
};

export default OfferSwitcher;
