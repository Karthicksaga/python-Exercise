import React from "react";

export interface OfferTimerProps {
  seconds?: number;
  badgeLabel?: string;
  onExpire?: () => void;
}

export const OfferTimer: React.FC<OfferTimerProps> = ({
  seconds = 15,
  badgeLabel = "Auto-dispatch",
}) => {
  return (
    <div className="offer-timer-bar" role="timer" aria-live="polite">
      <div className="timer-top">
        <span className="timer-pulse" aria-hidden="true" />
        <span className="timer-text">
          Offer expires in <strong>{seconds}s</strong>
        </span>
        <span className="timer-badge">{badgeLabel}</span>
      </div>
      <div className="timer-track" aria-hidden="true">
        <i
          className="timer-fill"
          style={{ animationDuration: `${seconds}s` }}
        />
      </div>
    </div>
  );
};

export default OfferTimer;
