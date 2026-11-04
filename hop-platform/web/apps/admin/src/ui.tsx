// Small UI pieces for the operations console. Styles live in admin.css.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { RIDE_STATUS, type Tone } from "./lib";

const P: Record<string, string> = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z"/><path d="M9 4v14M15 6v14"/>',
  route: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H16a3 3 0 0 0 0-6H8a3 3 0 0 1 0-6h7.5"/>',
  id: '<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="9" cy="11" r="2.2"/><path d="M5.8 16c.6-1.6 1.8-2.4 3.2-2.4s2.6.8 3.2 2.4M14.5 10H18M14.5 13.5H17"/>',
  gauge: '<path d="M4.5 17a8.5 8.5 0 1 1 15 0"/><path d="m12 13 3.5-4"/><circle cx="12" cy="13" r="1.4"/>',
  alert: '<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 10v4.5M12 17.2v.1"/>',
  box: '<path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5v-9Z"/><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9"/>',
  zone: '<rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 3"/><circle cx="12" cy="11" r="2.5"/><path d="M12 13.5V17"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8L3 12Z"/><circle cx="7.5" cy="8.5" r="1.4"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>',
  wallet: '<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 10h18M16 15h2"/><path d="M6 6V5a2 2 0 0 1 2-2h9"/>',
  ticket: '<path d="M3 10a2 2 0 0 0 0 4v4h18v-4a2 2 0 0 1 0-4V6H3v4Z"/><path d="M14 8v12" stroke-dasharray="2 2.5"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  circle: '<circle cx="12" cy="12" r="8"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  rotate: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  phone: '<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2Z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.1"/>',
  shield: '<path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6l-8-3Z"/>',
  city: '<path d="M4 21V9l5-3v15M9 21V4l6 3v14M15 21v-9l5 2v7M2 21h20"/>',
  expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.3-5.7"/><path d="M4 4v5h5"/>',
  out: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 8l-4 4 4 4M6 12h10"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  doc: '<path d="M6 3h8l4 4v14H6V3Z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.7L20 8"/><path d="M20 3v5h-5"/>',
};
export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg className="ic" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: P[name] ?? "" }} />
  );
}

export const Badge = ({ tone = "", children }: { tone?: Tone; children: ReactNode }) => <span className={`badge ${tone}`}>{children}</span>;
export function RideBadge({ status }: { status: string }) {
  const [label, tone] = RIDE_STATUS[status] ?? [status, ""];
  return <Badge tone={tone}>{label}</Badge>;
}

export function Note({ tone = "", icon = "info", children }: { tone?: Tone; icon?: string; children: ReactNode }) {
  return <div className={`note ${tone}`}><Icon name={icon} /><span>{children}</span></div>;
}

export function Empty({ title, children, icon = "check" }: { title: string; children?: ReactNode; icon?: string }) {
  return <div className="empty"><Icon name={icon} size={28} /><strong>{title}</strong>{children && <span>{children}</span>}</div>;
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: [T, string, number?, boolean?][] }) {
  return (
    <div className="tabs" role="tablist">
      {items.map(([k, label, n, danger]) => (
        <button key={k} type="button" className="tab" role="tab" aria-selected={value === k} onClick={() => onChange(k)}>
          {label}{n ? <em style={danger ? { background: "var(--danger)", color: "#fff" } : undefined}>{n}</em> : null}
        </button>
      ))}
    </div>
  );
}

export function Chips<T extends string>({ value, onChange, items, label }: { value: T; onChange: (v: T) => void; items: [T, string, number?][]; label: string }) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {items.map(([k, l, n]) => (
        <button key={k} type="button" className="chip" aria-pressed={value === k} onClick={() => onChange(k)}>
          {l}{n != null && <em>{n}</em>}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, error, children, className = "" }: { label: ReactNode; hint?: ReactNode; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`field ${error ? "invalid" : ""} ${className}`}>
      <span>{label}</span>
      {children}
      {error ? <span className="err" role="alert">{error}</span> : hint ? <small>{hint}</small> : null}
    </label>
  );
}

export function Rupees(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <span className="affix"><b>₹</b><input type="number" min={0} step={0.5} inputMode="decimal" {...props} /></span>;
}

// A number box that keeps what the person is typing ("9." or "") and reports each valid value.
// Outside changes (a map drag, a button) replace the text unless the box is being edited.
export function NumberInput({ value, onValue, scale = 1, rupees, ...rest }: { value: number | null; onValue: (n: number) => void; scale?: number; rupees?: boolean } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const show = (v: number | null) => (v == null || Number.isNaN(v) ? "" : String(Math.round((v / scale) * 1e6) / 1e6));
  const [text, setText] = useState(show(value));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(show(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const input = (
    <input type="number" inputMode="decimal" {...rest} value={text}
      onFocus={() => { focused.current = true; }}
      onBlur={() => { focused.current = false; setText(show(value)); }}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value.trim() !== "" && Number.isFinite(n)) onValue(Math.round(n * scale * 1e6) / 1e6);
      }} />
  );
  return rupees ? <span className="affix"><b>₹</b>{input}</span> : input;
}

export function Switch({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode; disabled?: boolean }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.currentTarget.checked)} />
      <span>{label}{hint && <small>{hint}</small>}</span>
    </label>
  );
}

// Dialog shell shared by the side panel and the centred modal: Escape closes, focus moves inside.
function useDialog(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>("input:not([disabled]),select,textarea,button:not(.dialog-close)");
    (first ?? ref.current?.querySelector<HTMLElement>("button"))?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") close.current(); };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); before?.focus?.(); };
  }, []);
  return ref;
}
export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useDialog(onClose);
  return (
    <div className="overlay center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head"><h2>{title}</h2><button type="button" className="icon-btn dialog-close" onClick={onClose} aria-label="Close"><Icon name="x" /></button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
export function Drawer({ title, subtitle, onClose, children, footer, narrow }: { title: ReactNode; subtitle?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; narrow?: boolean }) {
  const ref = useDialog(onClose);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside ref={ref} className={`drawer ${narrow ? "narrow" : ""}`} role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : "Details"}>
        <div className="drawer-head"><div className="li-main"><strong>{title}</strong>{subtitle && <small>{subtitle}</small>}</div><button type="button" className="icon-btn dialog-close" onClick={onClose} aria-label="Close"><Icon name="x" /></button></div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </aside>
    </div>
  );
}

// notify(message) shows a toast. Screens receive it through context.
export const NotifyContext = createContext<(msg: string) => void>(() => undefined);
export const useNotify = () => useContext(NotifyContext);

export function Skeleton({ rows = 4 }: { rows?: number }) {
  return <div className="stack" aria-busy="true" aria-label="Loading">{Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton" style={{ height: 44 }} />)}</div>;
}
