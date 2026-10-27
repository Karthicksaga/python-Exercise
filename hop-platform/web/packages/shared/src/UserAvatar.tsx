export interface UserAvatarProps {
  name?: string;
  initial?: string;
  color?: string;
  size?: number;
  onClick?: () => void;
  title?: string;
  className?: string;
}

export default function UserAvatar({
  name = "",
  initial,
  color = "#4f46e5",
  size = 36,
  onClick,
  title,
  className = "",
}: UserAvatarProps) {
  const displayInitial = (initial || name?.[0] || "?").toUpperCase();
  const displayTitle = title || (name ? `${name} · View Profile` : "Profile");
  const Component = onClick ? "button" : "div";

  return (
    <Component
      type={onClick ? "button" : undefined}
      className={`user-avatar-wrap ${onClick ? "is-clickable" : ""} ${className}`}
      onClick={onClick}
      title={displayTitle}
      aria-label={displayTitle}
    >
      <span
        className="user-avatar-circle"
        style={{
          backgroundColor: color,
          width: size,
          height: size,
        }}
        aria-hidden="true"
      >
        {displayInitial}
      </span>
    </Component>
  );
}
