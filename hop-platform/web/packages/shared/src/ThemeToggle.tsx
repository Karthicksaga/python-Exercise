export interface ThemeToggleProps {
  dark?: boolean;
  onToggle?: () => void;
  className?: string;
}

export default function ThemeToggle({
  dark = false,
  onToggle,
  className = "",
}: ThemeToggleProps) {
  if (!onToggle) return null;

  return (
    <button
      type="button"
      className={`theme-toggle theme-toggle-btn ${className}`}
      onClick={onToggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
    >
      <span className="emoji-keep" aria-hidden="true">
        {dark ? "☀️" : "🌙"}
      </span>
    </button>
  );
}
