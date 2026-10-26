const paths: Record<string, string> = {
  ride: "M5 17h14M6 17l1.5-6h9L18 17M8 11l1-3h6l1 3M7.5 17v2M16.5 17v2",
  driver: "M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM4 21a8 8 0 0 1 16 0",
  history: "M12 7v5l3 2M3 12a9 9 0 1 0 3-6.7M3 4v4h4",
  support: "M4 13v-1a8 8 0 0 1 16 0v1M4 13h3v5H5a1 1 0 0 1-1-1v-4ZM20 13h-3v5h2a1 1 0 0 0 1-1v-4ZM17 18v1a2 2 0 0 1-2 2h-3",
  profile: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 20c0-3.3 3.1-6 7-6s7 2.7 7 6",
  more: "M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.3 6.8 19.1l1-5.8L3.5 9.2l5.9-.9L12 3Z",
  operator: "M12 3l8 3v6c0 4.5-3.2 7.9-8 9-4.8-1.1-8-4.5-8-9V6l8-3ZM9 12l2 2 4-4",
  bike: "M6 18a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM18 18a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 15l4-7h5l3 7M10 8H8M13 8l-2 7",
  auto: "M3 16V9l3-3h8l3 4h3v6M3 16h18M7 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM17 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z",
  mini: "M4 15l1.5-5A2 2 0 0 1 7.4 8.6h9.2a2 2 0 0 1 1.9 1.4L20 15v3H4v-3ZM7 18v2M17 18v2M7 13h.01M17 13h.01",
  sedan: "M3 15l2-4.5a2 2 0 0 1 1.8-1.2h10.4a2 2 0 0 1 1.8 1.2L21 15v3H3v-3ZM3 15h18M7 18v2M17 18v2",
  suv: "M3 16V11l2-3h11l4 4v4H3ZM3 16h18M9 8v4M7 19a1.5 1.5 0 1 0 0-3M17 19a1.5 1.5 0 1 0 0-3",
  shield: "M12 3l8 3v6c0 4.5-3.2 7.9-8 9-4.8-1.1-8-4.5-8-9V6l8-3Z",
  pin: "M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21ZM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  wallet: "M4 7a2 2 0 0 1 2-2h12v3M4 7v10a2 2 0 0 0 2 2h14V8H6a2 2 0 0 1-2-2ZM16 13.5h.01",
  earnings: "M4 7a2 2 0 0 1 2-2h12v3M4 7v10a2 2 0 0 0 2 2h14V8H6a2 2 0 0 1-2-2ZM16 13.5h.01",
  vehicle: "M3 15l2-4.5a2 2 0 0 1 1.8-1.2h10.4a2 2 0 0 1 1.8 1.2L21 15v3H3v-3ZM3 15h18M7 18v2M17 18v2",
  tag: "M3 12V4h8l10 10-8 8L3 12ZM7.5 8.5h.01",
  logout: "M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15 8l4 4-4 4M19 12H9",
};

export default function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name] ?? paths.ride} />
    </svg>
  );
}
