import React, { useRef } from "react";
import Icon from "./Icons";

export interface OtpPinInputProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  helperCode?: string;
  onAutofill?: () => void;
  disabled?: boolean;
}

export const OtpPinInput: React.FC<OtpPinInputProps> = ({
  value,
  onChange,
  error = "",
  helperCode = "431602",
  onAutofill,
  disabled = false,
}) => {
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  const handleDigitChange = (index: number, char: string) => {
    const clean = char.replace(/\D/g, "").slice(-1);
    const chars = value.padEnd(6, " ").split("");
    chars[index] = clean || " ";
    const nextVal = chars.join("").trimEnd();
    onChange(nextVal);

    if (clean && index < 5) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !value[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  const handleAutofillClick = () => {
    if (onAutofill) {
      onAutofill();
    } else {
      onChange(helperCode);
    }
  };

  return (
    <div>
      <div className="pin-entry" role="group" aria-label="6-digit pickup code">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <input
            key={i}
            id={`pin-${i}`}
            ref={(el) => {
              inputsRef.current[i] = el;
            }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            aria-label={`Code digit ${i + 1}`}
            value={value[i] || ""}
            disabled={disabled}
            onChange={(e) => handleDigitChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
          />
        ))}
      </div>

      {helperCode && (
        <div className="otp-actions-row">
          <button
            type="button"
            className="secondary small auto-otp-btn"
            onClick={handleAutofillClick}
            disabled={disabled}
          >
            <Icon name="lock" /> Autofill Rider OTP ({helperCode})
          </button>
        </div>
      )}

      {error ? (
        <p className="message-error" id="pin-error" role="alert" style={{ textAlign: "center", marginTop: 8, color: "#e54d36" }}>
          {error}
        </p>
      ) : (
        <p className="fineprint" style={{ textAlign: "center", marginTop: 8 }}>
          Prototype code: <strong>{helperCode}</strong>.
        </p>
      )}
    </div>
  );
};

export default OtpPinInput;
