import React from "react";

export interface RadarSonarProps {
  active?: boolean;
  left?: string;
  top?: string;
}

export const RadarSonar: React.FC<RadarSonarProps> = ({
  active = true,
  left = "22%",
  top = "18%",
}) => {
  if (!active) return null;

  return (
    <div
      className="radar-pulse-wrap"
      style={{ left, top }}
      aria-label="Searching for nearby captains"
      role="status"
    >
      <span className="radar-wave" />
      <span className="radar-wave delay-1" />
      <span className="radar-wave delay-2" />
    </div>
  );
};

export default RadarSonar;
