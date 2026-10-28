import React from "react";
import { Modal } from "@mantine/core";

export interface RideTakenModalProps {
  opened: boolean;
  onClose: () => void;
  onViewNext?: () => void;
  hasNextOffer?: boolean;
  winningCaptain?: string;
  distanceAway?: string;
}

export const RideTakenModal: React.FC<RideTakenModalProps> = ({
  opened,
  onClose,
  onViewNext,
  hasNextOffer = false,
  winningCaptain = "Captain Arun K.",
  distanceAway = "0.4 km away",
}) => {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Ride claimed by another captain"
      centered
      radius="md"
    >
      <div className="empty-state" style={{ padding: "14px 10px", textAlign: "center" }}>
        <span className="taken-badge">⚡ First Accept Wins</span>
        <h2 style={{ fontSize: "20px", margin: "8px 0" }}>Another captain was faster!</h2>
        <p style={{ color: "var(--muted)", fontSize: "13px" }}>
          {winningCaptain} ({distanceAway}) accepted this ride request. Dispatch assigned the booking to the nearest available driver.
        </p>
      </div>

      <div
        className="notice-box"
        style={{
          marginTop: 12,
          padding: 12,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          fontSize: "12px",
        }}
      >
        <strong style={{ display: "block", marginBottom: 4 }}>Hop Fair Dispatch Guarantee:</strong>
        Under Hop dispatch rules, broadcast offers claimed by faster captains never lower your acceptance score or search priority.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
        {hasNextOffer && onViewNext && (
          <button
            type="button"
            className="primary"
            style={{ width: "100%", padding: "10px" }}
            onClick={onViewNext}
          >
            View Next Available Request →
          </button>
        )}
        <button
          type="button"
          className="secondary"
          style={{ width: "100%", padding: "10px" }}
          onClick={onClose}
        >
          Return to active radar
        </button>
      </div>
    </Modal>
  );
};

export default RideTakenModal;
