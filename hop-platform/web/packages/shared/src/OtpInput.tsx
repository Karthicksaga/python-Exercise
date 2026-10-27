import { useRef } from "react";

export default function OtpInput({ value, onChange, disabled, invalid, describedBy }: {
  value: string; onChange: (value: string) => void; disabled: boolean;
  invalid: boolean; describedBy?: string;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  function insert(index: number, text: string) {
    const digits = text.replace(/\D/g, "").slice(0, 6 - index);
    if (!digits) return;
    const next = value.padEnd(6, " ").split("");
    digits.split("").forEach((digit, offset) => { next[index + offset] = digit; });
    onChange(next.join(""));
    refs.current[Math.min(index + digits.length, 5)]?.focus();
  }
  return <div className="auth-otp" role="group" aria-label="6-digit verification code">
    {Array.from({ length: 6 }, (_, index) => <input
      key={index} ref={el => { refs.current[index] = el; }}
      aria-label={`Digit ${index + 1}`} aria-invalid={invalid} aria-describedby={describedBy}
      value={value[index]?.trim() || ""} type="text" inputMode="numeric" pattern="[0-9]*"
      autoComplete={index === 0 ? "one-time-code" : "off"} disabled={disabled} autoFocus={index === 0}
      onFocus={e => e.target.select()}
      onChange={e => {
        if (e.target.value) insert(index, e.target.value);
        else onChange(value.padEnd(6, " ").split("").map((v, i) => i === index ? " " : v).join(""));
      }}
      onPaste={e => { e.preventDefault(); insert(index, e.clipboardData.getData("text")); }}
      onKeyDown={e => {
        if (e.key === "Backspace") {
          e.preventDefault();
          const target = value[index]?.trim() ? index : Math.max(0, index - 1);
          onChange(value.padEnd(6, " ").split("").map((v, i) => i === target ? " " : v).join(""));
          refs.current[target]?.focus();
        }
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault(); refs.current[Math.max(0, Math.min(5, index + (e.key === "ArrowLeft" ? -1 : 1)))]?.focus();
        }
      }}
    />)}
  </div>;
}
