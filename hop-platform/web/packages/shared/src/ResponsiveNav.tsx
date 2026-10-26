import { useState } from "react";
import { Drawer, Stack, UnstyledButton } from "@mantine/core";
import Icon from "./Icons";
import "./responsive.css";

export type NavigationItem = {
  id: string;
  label: string;
  shortLabel?: string;
  badge?: number;
};

// One navigation model, with a desktop sidebar and a phone dock plus an accessible sheet.
export default function ResponsiveNav({
  items,
  primary,
  value,
  onChange,
  onSignOut,
}: {
  items: NavigationItem[];
  primary: string[];
  value: string;
  onChange: (id: string) => void;
  onSignOut: () => void;
}) {
  const [opened, setOpened] = useState(false);
  const choose = (id: string) => {
    setOpened(false);
    onChange(id);
    window.scrollTo({ top: 0, behavior: "auto" });
  };
  const item = (entry: NavigationItem, compact = false) => (
    <UnstyledButton
      key={entry.id}
      type="button"
      className="app-nav-item"
      aria-label={entry.label}
      aria-current={value === entry.id ? "page" : undefined}
      onClick={() => choose(entry.id)}
    >
      <Icon name={entry.id} size={22} />
      <span>{compact ? entry.shortLabel || entry.label : entry.label}</span>
      {!!entry.badge && <span className="app-nav-badge">{entry.badge}</span>}
    </UnstyledButton>
  );
  return (
    <>
      <nav className="app-sidebar" aria-label="Main navigation">
        {items.map((entry) => item(entry))}
        <UnstyledButton
          className="app-nav-item app-signout"
          onClick={onSignOut}
        >
          <Icon name="logout" />
          <span>Sign out</span>
        </UnstyledButton>
      </nav>
      <nav className="app-dock" aria-label="Mobile navigation">
        {primary
          .map((id) => items.find((entry) => entry.id === id))
          .filter((entry): entry is NavigationItem => !!entry)
          .map((entry) => item(entry, true))}
        <UnstyledButton
          type="button"
          className="app-nav-item"
          aria-label="Open app menu"
          aria-expanded={opened}
          data-active={!primary.includes(value) || undefined}
          onClick={() => setOpened(true)}
        >
          <span className="app-menu-icon" aria-hidden="true">
            ☰
          </span>
          <span>Menu</span>
        </UnstyledButton>
      </nav>
      <Drawer
        opened={opened}
        onClose={() => setOpened(false)}
        title="Your app"
        position="bottom"
        size="auto"
        radius="lg"
        styles={{ content: { height: "auto", maxHeight: "85dvh" } }}
        classNames={{ content: "app-menu-sheet" }}
      >
        <Stack gap={6}>
          {items.map((entry) => item(entry))}
          <UnstyledButton
            className="app-nav-item"
            onClick={() => {
              setOpened(false);
              onSignOut();
            }}
          >
            <Icon name="logout" />
            <span>Sign out</span>
          </UnstyledButton>
        </Stack>
      </Drawer>
    </>
  );
}
