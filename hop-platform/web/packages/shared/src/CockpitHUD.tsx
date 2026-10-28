import React from "react";

export interface CockpitHUDProps {
  speedKmH?: number;
  speedLimit?: number;
  turnManeuver?: string;
  turnStreet?: string;
  turnDistance?: string;
  activeLaneIndex?: number;
  heading?: string;
  onExit: () => void;
  onPrimaryAction?: () => void;
  primaryActionLabel?: string;
  destinationLabel?: string;
}

export const CockpitHUD: React.FC<CockpitHUDProps> = ({
  speedKmH = 38,
  speedLimit = 52,
  turnManeuver = "↰ Turn left",
  turnStreet = "OMR Service Rd, Tharamani",
  turnDistance = "In 200 m",
  activeLaneIndex = 1,
  heading = "South-East · 142°",
  onExit,
  onPrimaryAction,
  primaryActionLabel = "I’ve arrived",
  destinationLabel = "Chennai Airport",
}) => {
  return (
    <div className="cockpit-hud" role="region" aria-label="Fullscreen Cockpit Navigation">
      <div className="cockpit-top-bar">
        <div className="cockpit-speed-badge">
          <span className="speed-num">{speedKmH}</span>
          <span className="speed-unit">km/h</span>
          <span style={{ fontSize: "11px", color: "#94a3b8", marginLeft: "6px" }}>
            Limit: {speedLimit}
          </span>
        </div>
        <button
          type="button"
          className="secondary small"
          style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "none" }}
          onClick={onExit}
        >
          Exit Cockpit HUD
        </button>
      </div>

      <div className="cockpit-turn-card">
        <span className="cockpit-turn-icon" aria-hidden="true">
          {turnManeuver.includes("↰") ? "↰" : turnManeuver.includes("↱") ? "↱" : "↑"}
        </span>
        <div>
          <div className="cockpit-turn-dist">{turnDistance}</div>
          <div className="cockpit-turn-street">{turnStreet}</div>
        </div>
      </div>

      <div className="cockpit-lanes" aria-label="Lane guidance">
        <div className={`cockpit-lane-box ${activeLaneIndex === 0 ? "active" : ""}`}>[ ↑ ]</div>
        <div className={`cockpit-lane-box ${activeLaneIndex === 1 ? "active" : ""}`}>[ ↰ ]</div>
        <div className={`cockpit-lane-box ${activeLaneIndex === 2 ? "active" : ""}`}>[ ↱ ]</div>
      </div>

      <div style={{ margin: "4px 0 10px", fontSize: "11px", color: "#64748b" }}>
        Compass: <strong>{heading}</strong>
      </div>

      <div className="cockpit-bottom-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <small style={{ color: "#94a3b8", display: "block" }}>DESTINATION</small>
            <strong style={{ fontSize: "14px", color: "#fff" }}>{destinationLabel}</strong>
          </div>
          <span className="badge" style={{ background: "#234832", color: "#52b788" }}>
            Live GPS
          </span>
        </div>

        {onPrimaryAction && (
          <button
            type="button"
            className="primary"
            style={{ width: "100%", padding: "12px", fontSize: "15px", fontWeight: "bold" }}
            onClick={onPrimaryAction}
          >
            {primaryActionLabel}
          </button>
        )}
      </div>
    </div>
  );
};

export default CockpitHUD;
