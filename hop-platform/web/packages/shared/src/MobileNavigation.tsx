import ResponsiveNav, { NavigationItem } from "./ResponsiveNav";

export type { NavigationItem };

export interface MobileNavigationProps {
  items: NavigationItem[];
  primary?: string[];
  value: string;
  onChange: (id: string) => void;
  onSignOut: () => void;
  className?: string;
}

export default function MobileNavigation({
  items,
  primary,
  value,
  onChange,
  onSignOut,
  className = "",
}: MobileNavigationProps) {
  // Default primary tabs to first 4 items if not specified
  const primaryIds = primary || items.slice(0, 4).map((i) => i.id);

  return (
    <div className={`mobile-navigation-wrap ${className}`}>
      <ResponsiveNav
        items={items}
        primary={primaryIds}
        value={value}
        onChange={onChange}
        onSignOut={onSignOut}
      />
    </div>
  );
}
