// Hop operations console — design concept 03 (preview only).
// Every action changes local sample data; nothing is sent to a server.
(() => {
'use strict';
const D = structuredClone(window.HOP_DATA);
const app = document.getElementById('app');

/* ---------- helpers ---------- */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rupee = (p) => '₹' + (p / 100).toLocaleString('en-IN', { minimumFractionDigits: p % 100 ? 2 : 0, maximumFractionDigits: 2 });
const rupeeShort = (p) => { const r = p / 100; if (r >= 1e7) return '₹' + (r / 1e7).toFixed(2) + ' Cr'; if (r >= 1e5) return '₹' + (r / 1e5).toFixed(2) + ' L'; return rupee(p); };
const num = (n) => Number(n).toLocaleString('en-IN');
const mins = (iso) => Math.round((D.now - Date.parse(iso)) / 60000);
const ago = (iso) => { const m = mins(iso); if (m < 1) return 'just now'; if (m < 60) return `${m} min ago`; if (m < 1440) return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''} ago`; return `${Math.floor(m / 1440)} d ago`; };
const waited = (iso) => { const m = mins(iso); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };
const when = (iso) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const clock = (iso) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
const daysLeft = (iso) => Math.ceil((Date.parse(iso) - D.now) / 86400000);
const initials = (n) => n.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const areaName = (id) => D.areas.find((a) => a.id === id)?.name ?? id;
const CATS = { bike: 'Bike', auto: 'Auto', mini: 'Mini', sedan: 'Sedan', suv: 'SUV' };
const DOC = { identity: 'ID · front', identity_back: 'ID · back', license: 'Driving licence · front', license_back: 'Driving licence · back', rc: 'RC · front', rc_back: 'RC · back', insurance: 'Insurance', police: 'Police clearance' };
const REASONS = { blurry: 'Blurry or unreadable', cropped: 'Part of it is cut off', mismatch: "Details don't match", expired: 'Expired', wrong_type: 'Wrong document', glare: 'Glare hides details' };
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const RIDE_STATUS = { requested: ['Finding captain', 'info'], accepted: ['Captain on the way', 'info'], arrived: ['Captain arrived', 'info'], in_progress: ['On trip', 'info'], completed: ['Completed', 'ok'], cancelled: ['Cancelled', 'plain'] };
const ACTIVE = ['requested', 'accepted', 'arrived', 'in_progress'];

const P = {
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
  ticket: '<path d="M3 8a2 2 0 0 0 0 4v4h18v-4a2 2 0 0 1 0-4V4H3v4Z" transform="translate(0 2)"/><path d="M14 6v12" stroke-dasharray="2 2.5"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  circle: '<circle cx="12" cy="12" r="8"/>',
  dot: '<circle cx="12" cy="12" r="3.5" fill="currentColor"/>',
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
};
const ic = (name, size = 18, extra = '') => `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${P[name] ?? ''}</svg>`;
const badge = (text, tone = '') => `<span class="badge ${tone}">${esc(text)}</span>`;
const rideBadge = (s) => { const [t, tone] = RIDE_STATUS[s] ?? [s, '']; return badge(t, tone); };

/* ---------- state ---------- */
const params = new URLSearchParams(location.search);
const S = {
  view: location.hash.slice(1) || params.get('view') || 'overview',
  theme: params.get('theme') === 'dark' ? 'dark' : 'light',
  navOpen: false, overlay: null, errors: {},
  rides: { status: 'all', q: '' },
  dispatch: { cat: 'all', onlineOnly: true, sel: null },
  reviews: { tab: 'pending', sel: 'c1', q: '', area: 'all', note: '', police: '', genderOk: false, pink: false, tried: false },
  safety: { tab: 'sos' },
  lost: { tab: 'all' },
  scores: { filter: 'all' },
  zones: { sel: 'madurai', draft: null, vp: null, picking: false, district: '' },
  fares: { area: 'madurai', trip: 'auto' },
  audit: { filter: 'all', q: '' },
  peakDays: [1, 2, 3, 4, 5],
  promoKind: 'percent',
};
document.documentElement.dataset.theme = S.theme;

const toast = (msg) => {
  const host = document.getElementById('toasts');
  const el = document.createElement('div'); el.className = 'toast'; el.innerHTML = `${ic('check', 16)}<span>${esc(msg)}</span>`;
  host.append(el); setTimeout(() => el.remove(), 3800);
};
const audit = (action, detail) => D.events.unshift({ id: Date.now(), action, detail, actor: 'Karthick T.', created_at: new Date(D.now).toISOString() });

/* ---------- counts used by nav and overview ---------- */
const C = {
  sos: () => D.sos_events.filter((s) => s.incident_status !== 'closed').length,
  incidents: () => D.incidents.filter((i) => i.status !== 'closed').length,
  pending: () => D.applicants.filter((a) => a.status === 'pending').length,
  changes: () => D.vehicle_changes.length + D.area_changes.length,
  expiring7: () => D.expiring.filter((e) => daysLeft(e.expires) <= 7).length,
  payouts: () => D.finance.payouts.filter((p) => p.status === 'requested'),
  lost: () => D.lost_items.filter((l) => l.status === 'open').length,
  activeRides: () => D.rides.filter((r) => ACTIVE.includes(r.status)),
};
const categoriesFor = (areaId) => {
  const rows = D.pricing.filter((p) => p.area_id === areaId);
  const on = ['bike', ...['auto', 'mini', 'sedan', 'suv'].filter((c) => rows.find((r) => r.category === c && r.enabled))];
  return on;
};

const NAV = [
  [null, [['overview', 'Overview', 'grid']]],
  ['Operations', [['dispatch', 'Live dispatch', 'map', () => C.activeRides().length], ['rides', 'Rides', 'route']]],
  ['Captains', [['reviews', 'Captain reviews', 'id', () => C.pending() + C.changes()], ['scores', 'Safety scores', 'gauge']]],
  ['Safety & care', [['safety', 'SOS & incidents', 'alert', () => C.sos() + C.incidents(), () => C.sos() > 0], ['lost', 'Lost & found', 'box', C.lost]]],
  ['Network', [['zones', 'Service areas', 'zone'], ['fares', 'Fares', 'tag'], ['surge', 'Surge & peak', 'bolt']]],
  ['Money', [['payouts', 'Payouts & refunds', 'wallet', () => C.payouts().length], ['promos', 'Promo codes', 'ticket']]],
  ['Records', [['audit', 'Audit log', 'list']]],
];
const SUB = {
  overview: 'Today across all service areas', dispatch: 'Captains and active rides, refreshed every 6 seconds', rides: 'Search, inspect, cancel and refund rides',
  reviews: 'Applications, document expiry and change requests', scores: 'Built from cancellations, incidents and ratings', safety: 'Emergencies first, then rider and captain reports',
  lost: 'Items riders left behind', zones: 'Where riders can book and captains can work', fares: 'Prices per area and vehicle', surge: 'Demand multipliers, overrides and peak hours',
  payouts: 'Captain payouts, refunds and balances', promos: 'Discount codes for riders', audit: 'Every operator action, written by the server',
};
const navLabel = (v) => NAV.flatMap(([, items]) => items).find(([id]) => id === v)?.[1] ?? 'Overview';

/* ---------- shell ---------- */
function shell() {
  const sos = C.sos();
  const nav = NAV.map(([group, items]) => `<nav class="nav-group" aria-label="${esc(group ?? 'Home')}">${group ? `<small>${group}</small>` : ''}${items.map(([id, label, icon, count, danger]) => {
    const n = count ? count() : 0;
    return `<button class="nav-item" data-act="go" data-arg="${id}" ${S.view === id ? 'aria-current="page"' : ''}>${ic(icon)}<span>${label}</span>${n ? `<span class="count ${danger && danger() ? 'danger' : ''}" aria-label="${n} waiting">${n}</span>` : ''}</button>`;
  }).join('')}</nav>`).join('');
  return `<div class="shell ${S.navOpen ? 'nav-open' : ''}">
  <aside class="side" aria-label="Main navigation">
    <a class="brand" href="#overview" data-act="go" data-arg="overview">hop<i>.</i><small>Operations</small></a>
    ${nav}
    <div class="side-foot"><span class="avatar">KT</span><span><strong>Karthick T.</strong><small>Operator · all areas</small></span><button class="icon-btn" data-act="signout" aria-label="Sign out" style="margin-left:auto">${ic('out')}</button></div>
  </aside>
  <div class="scrim" data-act="nav" aria-hidden="true"></div>
  <div class="main">
    <header class="topbar" id="topbar">
      <button class="icon-btn menu-btn" data-act="nav" aria-label="Open menu" aria-expanded="${S.navOpen}">${ic('menu')}</button>
      <div class="title"><h1>${navLabel(S.view)}</h1><small>${SUB[S.view] ?? ''}</small></div>
      <label class="search"><span class="sr">Search rides</span>${ic('search', 16)}<input id="global-q" type="search" placeholder="Ride ID, rider or captain" autocomplete="off"><kbd>/</kbd></label>
      <div class="row tb-actions" style="flex-wrap:nowrap">
        ${sos ? `<button class="sos-pill" data-act="go" data-arg="safety"><span class="dot"></span>${ic('alert', 16)}<span class="label">${sos} active SOS</span></button>` : '<span class="live-pill">Network live</span>'}
        <button class="icon-btn" data-act="theme" aria-label="Switch to ${S.theme === 'dark' ? 'light' : 'dark'} theme">${ic(S.theme === 'dark' ? 'sun' : 'moon')}</button>
      </div>
    </header>
    <main class="content" id="content">${(VIEWS[S.view] ?? VIEWS.overview)()}</main>
  </div>
</div>${S.overlay ? OVERLAYS[S.overlay.type]() : ''}`;
}

/* ---------- maps (drawn preview) ---------- */
function viewport(b, W, H, pad = 0.18) {
  const latC = (b.min_lat + b.max_lat) / 2, lngC = (b.min_lng + b.max_lng) / 2, k = Math.cos(latC * Math.PI / 180);
  let latS = (b.max_lat - b.min_lat) * (1 + 2 * pad), lngS = (b.max_lng - b.min_lng) * (1 + 2 * pad);
  if ((lngS * k) / latS < W / H) lngS = (latS * W) / H / k; else latS = (lngS * k * H) / W;
  return { minLat: latC - latS / 2, maxLat: latC + latS / 2, minLng: lngC - lngS / 2, maxLng: lngC + lngS / 2, W, H };
}
const px = (v, lat, lng) => [((lng - v.minLng) / (v.maxLng - v.minLng)) * v.W, ((v.maxLat - lat) / (v.maxLat - v.minLat)) * v.H];
const rectPx = (v, b) => { const [x1, y1] = px(v, b.max_lat, b.min_lng), [x2, y2] = px(v, b.min_lat, b.max_lng); return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }; };
function baseMap(W, H, seed, labels = []) {
  let s = seed; const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  let out = `<rect class="m-land" width="${W}" height="${H}"/>`;
  const step = 70;
  for (let x = 0; x < W; x += step) for (let y = 0; y < H; y += step) {
    if (r() < 0.18) continue;
    out += `<rect class="${r() < 0.07 ? 'm-park' : 'm-block'}" x="${x + 8 + r() * 6}" y="${y + 8 + r() * 6}" width="${step - 22 - r() * 10}" height="${step - 22 - r() * 10}" rx="6"/>`;
  }
  const rv = H * (0.25 + r() * 0.5);
  out += `<path class="m-water" d="M-20 ${rv} C ${W * 0.25} ${rv - 60}, ${W * 0.45} ${rv + 70}, ${W * 0.7} ${rv - 10} S ${W + 40} ${rv + 30}, ${W + 40} ${rv + 30} L ${W + 40} ${rv + 52} C ${W * 0.7} ${rv + 18}, ${W * 0.45} ${rv + 92}, ${W * 0.25} ${rv - 38} S -20 ${rv + 22} -20 ${rv + 22} Z"/>`;
  for (let i = 0; i < 4; i++) {
    const y0 = r() * H, y1 = r() * H, x0 = r() * W, x1 = r() * W;
    out += `<path class="m-edge" stroke-width="12" d="M -10 ${y0} Q ${W / 2} ${(y0 + y1) / 2 + (r() - 0.5) * 160} ${W + 10} ${y1}"/><path class="m-road" stroke-width="8" d="M -10 ${y0} Q ${W / 2} ${(y0 + y1) / 2 + (r() - 0.5) * 160} ${W + 10} ${y1}"/>`;
    if (i < 3) out += `<path class="m-edge" stroke-width="10" d="M ${x0} -10 Q ${(x0 + x1) / 2 + (r() - 0.5) * 140} ${H / 2} ${x1} ${H + 10}"/><path class="m-road" stroke-width="6" d="M ${x0} -10 Q ${(x0 + x1) / 2 + (r() - 0.5) * 140} ${H / 2} ${x1} ${H + 10}"/>`;
  }
  out += labels.map(([t, x, y]) => `<text class="m-label" x="${x}" y="${y}" text-anchor="middle">${esc(t)}</text>`).join('');
  return out;
}

/* ---------- charts ---------- */
function barChart(rows) {
  const max = Math.ceil(Math.max(...rows.map((r) => r.completed)) / 500) * 500, ticks = [];
  for (let t = 0; t <= max; t += 500) ticks.push(t);
  const last = rows.length - 1;
  return `<div class="chart vchart" role="img" aria-label="Completed rides per day for the last 7 days: ${rows.map((r) => `${r.day} ${r.completed}`).join(', ')}">
    <div class="vplot">${ticks.map((t) => `<span class="vtick" style="bottom:${(t / max) * 100}%"><b>${num(t)}</b></span>`).join('')}
    ${rows.map((r, i) => { const h = (r.completed / max) * 100, c = r.count - r.completed;
      return `<div class="vcol" data-tip="<b>${r.day}${i === last ? ' · today' : ''}</b>${num(r.completed)} completed<br>${num(c)} cancelled (${((c / r.count) * 100).toFixed(1)}%)" data-y="${100 - h}">${i === last ? `<em style="bottom:calc(${h}% + 4px)">${num(r.completed)}</em>` : ''}<i style="height:${h}%"></i></div>`; }).join('')}</div>
    <div class="vaxis">${rows.map((r) => `<span>${r.day}</span>`).join('')}</div></div>`;
}
function hbars(rows) {
  const max = Math.max(...rows.map((r) => r.total_paise)), total = rows.reduce((s, r) => s + r.total_paise, 0);
  return rows.map((r) => `<div class="hbar" data-tip-host><span>${r.payment_method === 'upi' ? 'UPI' : cap(r.payment_method)}</span><span class="track"><span class="fill" style="display:block;width:${(r.total_paise / max) * 100}%"></span></span><span>${rupeeShort(r.total_paise)}<small>${Math.round((r.total_paise / total) * 100)}% · ${num(r.count)} rides</small></span></div>`).join('');
}

/* ---------- views ---------- */
const VIEWS = {};

VIEWS.overview = () => {
  const a = D.analytics, y = a.volume.at(-2), t = a.volume.at(-1), delta = Math.round(((t.completed - y.completed) / y.completed) * 100);
  const cancelRate = ((a.cancelled_rides / a.total_rides) * 100).toFixed(1);
  const pay = C.payouts(), oldest = D.applicants.filter((x) => x.status === 'pending').sort((p, q) => Date.parse(p.submitted_at) - Date.parse(q.submitted_at))[0];
  const attention = [];
  for (const s of D.sos_events.filter((s) => s.incident_status !== 'closed')) attention.push(['bad', 'alert', `SOS from ${s.rider_name}`, `${s.pickup_label} → ${s.dropoff_label} · captain ${s.driver_name} · ${ago(s.created_at)}`, 'safety', 'Respond']);
  if (C.incidents()) attention.push(['warn', 'shield', `${C.incidents()} open incident report${C.incidents() > 1 ? 's' : ''}`, 'Riders are waiting for a response', 'safety:incidents', 'Review']);
  if (C.pending()) attention.push(['info', 'id', `${C.pending()} captain applications`, `Oldest waiting ${waited(oldest.submitted_at)}`, 'reviews', 'Review']);
  if (pay.length) attention.push(['info', 'wallet', `${pay.length} payout requests`, `${rupee(pay.reduce((s, p) => s + p.amount_paise, 0))} to pay out by UPI`, 'payouts', 'Pay']);
  if (C.expiring7()) attention.push(['warn', 'clock', `${C.expiring7()} documents expire within 7 days`, 'Captains are reminded automatically at 30, 7 and 1 days', 'reviews:expiring', 'View']);
  for (const ar of D.areas.filter((x) => x.active)) { const c = categoriesFor(ar.id); if (c.length < 5) attention.push(['warn', 'tag', `${ar.name} offers only ${c.map((k) => CATS[k]).join(', ')}`, `Set fares for ${5 - c.length} more vehicle type${5 - c.length > 1 ? 's' : ''} so riders can book them`, `fares:${ar.id}`, 'Set fares']); }
  if (C.lost()) attention.push(['', 'box', `${C.lost()} lost item claim${C.lost() > 1 ? 's' : ''} not started`, 'Contact the captain to arrange a return', 'lost', 'Open']);
  return `
  <section class="grid g-kpi" aria-label="Today">
    <div class="card kpi"><span class="eyebrow">Gross bookings today</span><strong>${rupeeShort(a.gmv_today_paise)}</strong><small>Commission to date ${rupeeShort(a.commission_all_time_paise)}</small></div>
    <div class="card kpi"><span class="eyebrow">Completed rides</span><strong>${num(a.completed_rides)}</strong><small><span class="delta ${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '+' : ''}${delta}%</span> vs yesterday · ${cancelRate}% cancelled</small></div>
    <div class="card kpi"><span class="eyebrow">Captains online</span><strong>${num(a.active_drivers)}</strong><small>of ${num(a.total_drivers)} approved captains</small></div>
    <div class="card kpi"><span class="eyebrow">Active rides now</span><strong>${C.activeRides().length}</strong><small>${num(a.total_riders)} riders registered</small></div>
  </section>
  <section class="grid g-main">
    <div class="card">
      <div class="card-head"><h2>Needs attention</h2>${badge(`${attention.length} items`, 'plain')}<p>Most urgent first. Select an item to open it.</p></div>
      ${attention.length ? `<div class="list">${attention.map(([tone, icon, title, sub, go, cta]) => `<button class="li attn" data-act="go" data-arg="${go}"><span class="li-icon ${tone}">${ic(icon)}</span><span class="li-main"><strong>${esc(title)}</strong><small>${esc(sub)}</small></span><span class="btn sm ${tone === 'bad' ? 'danger' : 'secondary'}">${cta}</span></button>`).join('')}</div>` : `<div class="empty">${ic('check', 28)}<strong>All clear</strong><span>Nothing is waiting on an operator.</span></div>`}
    </div>
    <div class="stack" style="gap:18px">
      <div class="card"><div class="card-head"><h3>Completed rides, last 7 days</h3></div>${barChart(a.volume)}</div>
      <div class="card"><div class="card-head"><h3>Today by payment method</h3></div>${hbars(a.payments)}</div>
    </div>
  </section>
  <section class="card">
    <div class="card-head"><h2>Service areas</h2><button class="btn sm secondary" data-act="go" data-arg="zones">Manage areas</button></div>
    <div class="table-wrap"><table class="tbl responsive"><thead><tr><th>Area</th><th>Status</th><th>Vehicle types</th><th>Surge</th><th class="num">Captains online</th></tr></thead><tbody>
    ${D.areas.map((ar) => { const c = categoriesFor(ar.id), live = D.drivers.filter((d) => d.online && ar.id === 'chennai').length; const s = D.finance.surges.find((x) => x.area === ar.id);
      return `<tr class="clickable" data-act="go" data-arg="zones:${ar.id}"><td class="lead"><strong>${esc(ar.name)}</strong><small>${esc(ar.state)}</small></td><td data-label="Status">${ar.active ? badge('Bookings open', 'ok') : badge('Inactive', 'plain')}</td><td data-label="Vehicle types">${c.map((k) => CATS[k]).join(', ')}</td><td data-label="Surge">${s ? badge(`${s.multiplier}× · ${s.reason}`, 'warn') : '<span class="muted">None</span>'}</td><td data-label="Captains online" class="num">${ar.active ? (ar.id === 'chennai' ? live : 9) : '—'}</td></tr>`; }).join('')}
    </tbody></table></div>
  </section>`;
};

VIEWS.dispatch = () => {
  const st = S.dispatch, area = D.areas.find((a) => a.id === 'chennai');
  const vp = viewport(area, 1000, 640, 0.02);
  const drivers = D.drivers.filter((d) => (st.cat === 'all' || d.vehicle_category === st.cat) && (!st.onlineOnly || d.online));
  const active = C.activeRides().filter((r) => st.cat === 'all' || r.vehicle_category === st.cat);
  const counts = Object.fromEntries(Object.keys(CATS).map((c) => [c, D.drivers.filter((d) => d.vehicle_category === c && (!st.onlineOnly || d.online)).length]));
  const sos = D.sos_events.filter((s) => s.incident_status !== 'closed');
  let layer = '';
  for (const r of active) {
    const [x1, y1] = px(vp, r.pickup_lat, r.pickup_lng), [x2, y2] = px(vp, r.dropoff_lat, r.dropoff_lng), mx = (x1 + x2) / 2 + (y2 - y1) * 0.15, my = (y1 + y2) / 2 - (x2 - x1) * 0.15;
    const sel = st.sel === 'ride:' + r.id;
    layer += `<g data-act="dsel" data-arg="ride:${r.id}" style="cursor:pointer" opacity="${st.sel && !sel ? 0.45 : 1}"><path class="m-case" d="M${x1} ${y1} Q${mx} ${my} ${x2} ${y2}"/><path class="m-route" d="M${x1} ${y1} Q${mx} ${my} ${x2} ${y2}"/><circle class="m-pick" cx="${x1}" cy="${y1}" r="8"/><rect class="m-drop" x="${x2 - 7}" y="${y2 - 7}" width="14" height="14" rx="3"/></g>`;
  }
  for (const d of drivers) { const [x, y] = px(vp, d.lat, d.lng); layer += `<circle class="m-cap ${d.status} ${st.sel === 'cap:' + d.user_id ? 'sel' : ''}" cx="${x}" cy="${y}" r="9" data-act="dsel" data-arg="cap:${d.user_id}"><title>${esc(d.name)} · ${CATS[d.vehicle_category]} · ${d.status.replace('_', ' ')}</title></circle>`; }
  for (const s of sos) { const [x, y] = px(vp, s.lat, s.lng); layer += `<g data-act="go" data-arg="safety" style="cursor:pointer"><circle class="m-sos-ring" cx="${x}" cy="${y}" r="16"/><circle class="m-sos" cx="${x}" cy="${y}" r="11"/><text x="${x}" y="${y + 4}" text-anchor="middle" fill="#fff" font-size="11" font-weight="800">!</text></g>`; }
  let card = '';
  if (st.sel?.startsWith('ride:')) {
    const r = D.rides.find((x) => x.id === st.sel.slice(5));
    card = `<div class="map-card"><div class="spread"><strong>${esc(r.rider)} → ${esc(r.dropoff_label)}</strong><button class="icon-btn" style="width:34px;height:34px" data-act="dsel" data-arg="" aria-label="Close">${ic('x', 16)}</button></div>${rideBadge(r.status)}<dl class="kv"><dt>Captain</dt><dd>${esc(r.driver || 'Not assigned yet')}</dd><dt>Vehicle</dt><dd>${CATS[r.vehicle_category]}</dd><dt>Fare</dt><dd>${rupee(r.fare_paise)} · ${r.payment_method.toUpperCase()}</dd><dt>Requested</dt><dd>${ago(r.created_at)}</dd></dl><button class="btn sm secondary" data-act="ride" data-arg="${r.id}">Open ride</button></div>`;
  } else if (st.sel?.startsWith('cap:')) {
    const d = D.drivers.find((x) => x.user_id === st.sel.slice(4));
    card = `<div class="map-card"><div class="spread"><strong>${esc(d.name)}</strong><button class="icon-btn" style="width:34px;height:34px" data-act="dsel" data-arg="" aria-label="Close">${ic('x', 16)}</button></div>${badge(d.status === 'on_trip' ? 'On a trip' : d.status === 'available' ? 'Available' : 'Offline', d.status === 'available' ? 'ok' : d.status === 'on_trip' ? 'info' : 'plain')}<dl class="kv"><dt>Vehicle</dt><dd>${CATS[d.vehicle_category]} · ${esc(d.vehicle_number)}</dd><dt>Location</dt><dd>${d.lat.toFixed(4)}, ${d.lng.toFixed(4)}</dd><dt>Last ping</dt><dd>${ago(d.location_at)}</dd></dl></div>`;
  }
  return `
  <div class="spread" style="flex-wrap:wrap">
    <div class="chips" role="group" aria-label="Vehicle type"><button class="chip" data-act="dcat" data-arg="all" aria-pressed="${st.cat === 'all'}">All</button>${Object.entries(CATS).map(([k, v]) => `<button class="chip" data-act="dcat" data-arg="${k}" aria-pressed="${st.cat === k}">${v} <em>${counts[k]}</em></button>`).join('')}</div>
    <label class="switch"><input type="checkbox" data-act="donline" ${st.onlineOnly ? 'checked' : ''}><span>Online captains only</span></label>
  </div>
  <section class="grid g-main">
    <div class="card flush">
      <div class="map-box dispatch-map" style="border:0;border-radius:0">
        <svg class="map" viewBox="0 0 1000 640" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Chennai dispatch map: ${drivers.length} captains and ${active.length} active rides">${baseMap(1000, 640, 11, [['Anna Nagar', 330, 190], ['T. Nagar', 520, 380], ['Adyar', 700, 520], ['Egmore', 690, 170]])}${layer}</svg>
        ${card}
        <div class="map-legend"><span><i style="background:var(--success)"></i>Available</span><span><i style="background:var(--primary)"></i>On trip</span>${st.onlineOnly ? '' : '<span><i style="background:var(--muted)"></i>Offline</span>'}<span><i style="background:var(--danger)"></i>SOS</span></div>
      </div>
    </div>
    <div class="card">
      <div class="card-head"><h3>Active rides</h3><span class="live-pill">Updated 4 s ago</span></div>
      ${active.length ? `<div class="list">${active.map((r) => `<button class="li attn" data-act="dsel" data-arg="ride:${r.id}" ${st.sel === 'ride:' + r.id ? 'style="background:var(--primary-soft)"' : ''}><span class="li-main"><strong>${esc(r.pickup_label)} → ${esc(r.dropoff_label)}</strong><small>${esc(r.rider)} · ${r.driver ? 'captain ' + esc(r.driver) : 'no captain yet'} · ${CATS[r.vehicle_category]}</small></span>${rideBadge(r.status)}</button>`).join('')}</div>` : '<div class="empty">No active rides for this vehicle type.</div>'}
    </div>
  </section>`;
};

const rideMatches = (r, q) => !q || [r.id, r.rider, r.driver, r.pickup_label, r.dropoff_label, r.status].some((x) => String(x).toLowerCase().includes(q.toLowerCase()));
VIEWS.rides = () => {
  const st = S.rides;
  const rows = D.rides.filter((r) => (st.status === 'all' || (st.status === 'active' ? ACTIVE.includes(r.status) : r.status === st.status)) && rideMatches(r, st.q));
  const c = (k) => D.rides.filter((r) => (k === 'active' ? ACTIVE.includes(r.status) : r.status === k)).length;
  return `
  <div class="spread" style="flex-wrap:wrap">
    <div class="chips" role="group" aria-label="Status">${[['all', 'All', D.rides.length], ['active', 'Active', c('active')], ['completed', 'Completed', c('completed')], ['cancelled', 'Cancelled', c('cancelled')]].map(([k, l, n]) => `<button class="chip" data-act="rstatus" data-arg="${k}" aria-pressed="${st.status === k}">${l} <em>${n}</em></button>`).join('')}</div>
    <label class="field" style="min-width:min(320px,100%)"><span class="sr">Filter rides</span><input id="rides-q" data-model="rides.q" data-live type="search" placeholder="Filter by ride ID, name or place" value="${esc(st.q)}"></label>
  </div>
  <section class="card flush">
    ${rows.length ? `<div class="table-wrap"><table class="tbl responsive"><thead><tr><th>Ride</th><th>Rider → Captain</th><th>Route</th><th>Status</th><th>Payment</th><th class="num">Fare</th></tr></thead><tbody>
    ${rows.map((r) => `<tr class="clickable" data-act="ride" data-arg="${r.id}" tabindex="0"><td class="lead"><span class="mono">${r.id.slice(0, 10)}</span><small>${when(r.created_at)}</small></td><td data-label="People">${esc(r.rider)} → ${esc(r.driver || '—')}</td><td data-label="Route">${esc(r.pickup_label)} → ${esc(r.dropoff_label)}</td><td data-label="Status">${rideBadge(r.status)}</td><td data-label="Payment">${r.payment_method.toUpperCase()} · ${r.payment_status}</td><td data-label="Fare" class="num"><strong>${rupee(r.payable_paise)}</strong>${r.refunded_paise ? `<small>refunded ${rupee(r.refunded_paise)}</small>` : ''}</td></tr>`).join('')}
    </tbody></table></div>` : `<div class="empty">No rides match “${esc(st.q)}”.</div>`}
  </section>`;
};

/* --- Captain reviews --- */
const REQ = D.REQUIRED;
function blockersFor(a) {
  const st = S.reviews, docs = a.documents;
  const acc = REQ.filter((k) => docs.find((d) => d.kind === k)?.status === 'accepted').length;
  return [
    [acc === REQ.length, `All 7 required documents accepted (${acc} of 7)`],
    [a.photo, a.photo ? 'Profile photo uploaded' : 'Profile photo missing — ask the captain to add one'],
    [Boolean(a.area_id), 'Service area chosen'],
    ...(st.pink ? [[st.genderOk, 'Gender checked before turning on Pink rides']] : []),
    [st.note.trim().length >= 5, 'Review note written (shown to the captain)'],
  ];
}
function docThumb(kind, big = false) {
  const card = kind.startsWith('identity') || kind.startsWith('license');
  const back = kind.endsWith('_back');
  return `<svg viewBox="0 0 320 200" aria-hidden="true"><rect x="16" y="16" width="288" height="168" rx="14" fill="var(--surface)" stroke="var(--line-strong)"/>
    <rect x="16" y="16" width="288" height="34" rx="14" fill="var(--primary-soft)"/><rect x="16" y="36" width="288" height="14" fill="var(--primary-soft)"/>
    <text x="32" y="39" font-size="13" font-weight="700" fill="var(--primary-ink)">${esc(DOC[kind].toUpperCase())}</text>
    ${card && !back ? '<rect x="32" y="66" width="70" height="88" rx="8" fill="var(--surface-3)"/><circle cx="67" cy="98" r="16" fill="var(--line-strong)"/><path d="M42 146c4-16 46-16 50 0" fill="var(--line-strong)"/>' : ''}
    ${[0, 1, 2, 3, 4].map((i) => `<rect x="${card && !back ? 118 : 32}" y="${70 + i * 18}" width="${(card && !back ? 150 : 250) - i * 22}" height="8" rx="4" fill="var(--surface-3)"/>`).join('')}
    ${big ? '<text x="160" y="176" text-anchor="middle" font-size="10" fill="var(--muted)">Sample image · the live console loads the encrypted upload</text>' : ''}</svg>`;
}
function reviewDetail(a) {
  const st = S.reviews, readOnly = Boolean(a.claimed_by);
  const acc = REQ.filter((k) => a.documents.find((d) => d.kind === k)?.status === 'accepted').length;
  const rejected = a.documents.filter((d) => d.status === 'rejected');
  const blockers = blockersFor(a), canApprove = blockers.every(([ok]) => ok) && !readOnly;
  const noteErr = st.tried && st.note.trim().length < 5;
  return `<div class="card stack" style="gap:16px">
    <div class="row" style="align-items:flex-start;flex-wrap:nowrap"><span class="initials" style="width:52px;height:52px;font-size:16px">${initials(a.name)}</span>
      <div class="li-main"><h2>${esc(a.name)}</h2><small>${esc(a.phone)} · ${CATS[a.vehicle_category]} · <span class="mono">${esc(a.vehicle_number)}</span></small><small>Submitted ${ago(a.submitted_at)} · ${a.gender === 'female' ? 'Woman' : 'Man'}${a.pink_requested ? ' · asked for Pink rides' : ''}</small></div>
      <label class="field" style="width:170px;flex:none"><span>Service area</span><select data-act="rarea" ${readOnly ? 'disabled' : ''}>${D.areas.map((x) => `<option value="${x.id}" ${x.id === a.area_id ? 'selected' : ''}>${esc(x.name)}${x.active ? '' : ' (inactive)'}</option>`).join('')}</select></label>
    </div>
    ${readOnly ? `<div class="note warn">${ic('user')}<span><b>${esc(a.claimed_by)} is reviewing this captain.</b> You can look, but decisions are locked until they finish or their claim expires after 15 minutes.</span></div>` : `<div class="note info">${ic('info')}<span>You're reviewing this captain. Others see it as taken while it's open.</span></div>`}
    <div><div class="spread" style="margin-bottom:8px"><strong>Documents</strong><span class="small muted">${acc} of 7 required accepted${rejected.length ? ` · ${rejected.length} rejected` : ''}</span></div><div class="progress"><i style="width:${(acc / 7) * 100}%"></i></div></div>
    <div class="doc-grid">
      ${a.documents.map((d) => {
        const optional = d.kind === 'police';
        if (d.status === 'missing') return `<div class="doc missing"><div class="doc-thumb">${ic('doc', 26)}<span>Not uploaded</span></div><div class="doc-body"><strong class="small">${DOC[d.kind]}</strong><span class="small muted">Optional · use the police reference below instead</span></div></div>`;
        return `<div class="doc ${d.status}"><button class="doc-thumb" data-act="viewer" data-arg="${d.kind}" aria-label="Open ${DOC[d.kind]}">${docThumb(d.kind)}${d.versions > 1 ? `<span class="ver">v${d.versions}</span>` : ''}</button>
        <div class="doc-body"><div class="spread"><strong class="small">${DOC[d.kind]}</strong>${optional ? badge('Optional', 'plain') : ''}</div>
          <div class="doc-actions"><button class="btn secondary ok" data-act="doc" data-arg="${d.kind}:accepted" aria-pressed="${d.status === 'accepted'}" ${readOnly ? 'disabled' : ''}>Accept</button><button class="btn secondary bad" data-act="doc" data-arg="${d.kind}:rejected" aria-pressed="${d.status === 'rejected'}" ${readOnly ? 'disabled' : ''}>Reject</button></div>
          ${d.status === 'rejected' ? `<label><span class="sr">Reason for ${DOC[d.kind]}</span><select data-act="docreason" data-arg="${d.kind}" ${readOnly ? 'disabled' : ''}><option value="">Choose a reason…</option>${Object.entries(REASONS).map(([k, v]) => `<option value="${k}" ${d.reason === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>` : ''}
        </div></div>`;
      }).join('')}
      <div class="doc ${a.photo ? 'accepted' : 'missing'}">${a.photo ? `<div class="doc-thumb" style="display:grid;place-items:center"><span class="initials" style="width:72px;height:72px;font-size:22px">${initials(a.name)}</span></div>` : `<div class="doc-thumb">${ic('user', 26)}<span>No profile photo</span></div>`}<div class="doc-body"><strong class="small">Profile photo</strong><span class="small muted">${a.photo ? 'Shown to riders when they book' : 'Required before approval'}</span></div></div>
    </div>
    <div class="grid g-2" style="gap:14px">
      <label class="field"><span>Police verification reference</span><input id="rv-police" data-model="reviews.police" value="${esc(st.police)}" placeholder="Certificate or portal reference" ${readOnly ? 'disabled' : ''}><small>Optional. Use it when no certificate was uploaded.</small></label>
      <div class="stack" style="gap:4px">
        <label class="check"><input type="checkbox" data-act="rgender" ${st.genderOk ? 'checked' : ''} ${readOnly ? 'disabled' : ''}><span>Gender checked against the ID document</span></label>
        <label class="switch"><input type="checkbox" data-act="rpink" ${st.pink ? 'checked' : ''} ${readOnly || a.gender !== 'female' ? 'disabled' : ''}><span>Pink rides<small>${a.gender === 'female' ? 'Women riders only. Needs the gender check.' : 'Only for women captains'}</small></span></label>
      </div>
    </div>
    <label class="field ${noteErr ? 'invalid' : ''}"><span>Review note</span><textarea id="rv-note" data-model="reviews.note" data-live placeholder="e.g. All documents clear. Welcome to Hop!" ${readOnly ? 'disabled' : ''}>${esc(st.note)}</textarea>${noteErr ? '<span class="err">Write at least 5 characters. The captain sees this note.</span>' : '<small>Shown to the captain. Required for every decision.</small>'}</label>
    <div class="card" style="background:var(--surface-2);box-shadow:none;padding:14px 16px"><strong class="small">Before you can approve</strong><ul class="blockers" style="margin-top:8px">${blockers.map(([ok, t]) => `<li class="${ok ? 'done' : 'todo'}">${ic(ok ? 'check' : 'circle', 16)}<span>${esc(t)}</span></li>`).join('')}</ul></div>
    <div class="row" style="justify-content:flex-end">
      <button class="btn danger-soft" data-act="rdecide" data-arg="suspended" ${readOnly ? 'disabled' : ''}>Disable</button>
      <button class="btn secondary" data-act="rdecide" data-arg="sendback" ${readOnly || !rejected.length ? 'disabled' : ''} title="${rejected.length ? '' : 'Reject at least one document to send it back'}">Send back for fixes${rejected.length ? ` (${rejected.length})` : ''}</button>
      <button class="btn primary" data-act="rdecide" data-arg="approved" ${canApprove ? '' : 'aria-disabled="true"'}>${ic('check', 16)}Approve captain</button>
    </div>
  </div>`;
}
VIEWS.reviews = () => {
  const st = S.reviews;
  const tabs = [['pending', 'Applications', C.pending()], ['expiring', 'Expiring documents', D.expiring.length], ['vehicle', 'Vehicle changes', D.vehicle_changes.length], ['area', 'Area changes', D.area_changes.length], ['enabled', 'Enabled', 0], ['disabled', 'Disabled', 0]];
  const head = `<div class="tabs" role="tablist">${tabs.map(([k, l, n]) => `<button class="tab" role="tab" data-act="rtab" data-arg="${k}" aria-selected="${st.tab === k}">${l}${n ? `<em>${n}</em>` : ''}</button>`).join('')}</div>`;
  if (st.tab === 'pending') {
    const queue = D.applicants.filter((a) => a.status === 'pending' && (st.area === 'all' || a.area_id === st.area) && (!st.q || `${a.name} ${a.phone} ${a.vehicle_number}`.toLowerCase().includes(st.q.toLowerCase()))).sort((p, q) => Date.parse(p.submitted_at) - Date.parse(q.submitted_at));
    const sel = queue.find((a) => a.id === st.sel) ?? queue[0];
    if (sel && sel.id !== st.sel) Object.assign(st, { sel: sel.id, note: '', police: '', genderOk: false, pink: false, tried: false });
    return `${head}<section class="grid g-split">
      <div class="card stack">
        <div class="grid" style="grid-template-columns:minmax(0,1fr) 130px;gap:8px"><label class="field"><span class="sr">Search applications</span><input id="rv-q" type="search" data-model="reviews.q" data-live value="${esc(st.q)}" placeholder="Name, phone or vehicle"></label><label class="field"><span class="sr">Area</span><select data-act="rfilter"><option value="all">All areas</option>${D.areas.map((x) => `<option value="${x.id}" ${st.area === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label></div>
        <span class="small muted">Oldest first. Applications waiting more than 2 hours are red.</span>
        ${queue.length ? `<div class="queue">${queue.map((a) => { const m = mins(a.submitted_at), acc = REQ.filter((k) => a.documents.find((d) => d.kind === k)?.status === 'accepted').length;
          return `<button class="q-item" data-act="rsel" data-arg="${a.id}" aria-current="${sel?.id === a.id}"><span class="initials">${initials(a.name)}</span><span class="li-main"><strong>${esc(a.name)}</strong><small>${CATS[a.vehicle_category]} · ${esc(areaName(a.area_id))} · ${acc}/7 docs${a.claimed_by ? ` · ${esc(a.claimed_by)} reviewing` : ''}</small></span><span class="wait ${m > 120 ? 'late' : m > 60 ? 'mid' : 'ok'}">${waited(a.submitted_at)}</span></button>`; }).join('')}</div>` : `<div class="empty">${ic('check', 28)}<strong>Queue is empty</strong><span>No applications match.</span></div>`}
      </div>
      ${sel ? reviewDetail(sel) : '<div class="card empty">Select an application to review it.</div>'}
    </section>`;
  }
  if (st.tab === 'expiring') return `${head}<div class="note info">${ic('info')}<span>Captains get reminders automatically 30, 7 and 1 days before expiry. On the expiry date they are taken offline until a new document is accepted.</span></div>
    <section class="card flush"><div class="table-wrap"><table class="tbl responsive"><thead><tr><th>Captain</th><th>Document</th><th>Area</th><th>Expires</th><th class="actions"></th></tr></thead><tbody>${D.expiring.map((e) => { const d = daysLeft(e.expires); return `<tr><td class="lead"><strong>${esc(e.name)}</strong><small class="mono">${esc(e.vehicle_number)}</small></td><td data-label="Document">${e.document === 'license' ? 'Driving licence' : 'Insurance'}</td><td data-label="Area">${esc(e.area)}</td><td data-label="Expires">${badge(d <= 1 ? 'Tomorrow' : `In ${d} days`, d <= 1 ? 'bad' : d <= 7 ? 'warn' : 'plain')}</td><td class="actions"><button class="btn sm secondary" data-act="toast" data-arg="Opens ${esc(e.name)}'s documents in the live console.">Open documents</button></td></tr>`; }).join('')}</tbody></table></div></section>`;
  if (st.tab === 'vehicle' || st.tab === 'area') {
    const list = st.tab === 'vehicle' ? D.vehicle_changes : D.area_changes;
    if (!list.length) return `${head}<div class="card empty">${ic('check', 28)}<strong>No pending ${st.tab} changes</strong></div>`;
    return `${head}<section class="grid g-2">${list.map((c) => `<div class="card stack"><div class="row"><span class="initials">${initials(c.name)}</span><div class="li-main"><strong>${esc(c.name)}</strong><small>Requested ${ago(c.created_at)}</small></div></div>
      <div class="row" style="flex-wrap:nowrap"><div class="note" style="flex:1"><span><small class="muted">Now</small><br><b>${st.tab === 'vehicle' ? `${CATS[c.current_category]} · ${esc(c.current_number)}` : esc(c.current_area_name)}</b></span></div>${ic('chevron', 20)}<div class="note info" style="flex:1"><span><small>Requested</small><br><b>${st.tab === 'vehicle' ? `${CATS[c.vehicle_category]} · ${esc(c.vehicle_number)}` : esc(c.requested_area_name)}</b></span></div></div>
      ${st.tab === 'vehicle' ? '<span class="small muted">Check the new RC and insurance before approving.</span>' : ''}
      <label class="field ${S.errors['chg-' + c.id] ? 'invalid' : ''}"><span>Note to captain</span><textarea id="chg-${c.id}" placeholder="${st.tab === 'vehicle' ? 'e.g. RC verified for the new vehicle' : 'e.g. Approved for Madurai'}"></textarea>${S.errors['chg-' + c.id] ? '<span class="err">Write at least 5 characters.</span>' : ''}</label>
      <div class="row" style="justify-content:flex-end"><button class="btn secondary" data-act="change" data-arg="${st.tab}:${c.id}:rejected">Reject</button><button class="btn primary" data-act="change" data-arg="${st.tab}:${c.id}:approved">Approve</button></div></div>`).join('')}</section>`;
  }
  const done = D.applicants.filter((a) => a.status === (st.tab === 'enabled' ? 'approved' : 'suspended'));
  return `${head}<section class="card flush">${done.length ? `<div class="table-wrap"><table class="tbl responsive"><thead><tr><th>Captain</th><th>Vehicle</th><th>Area</th><th>Decided</th></tr></thead><tbody>${done.map((a) => `<tr><td class="lead"><strong>${esc(a.name)}</strong><small>${esc(a.phone)}</small></td><td data-label="Vehicle">${CATS[a.vehicle_category]} · ${esc(a.vehicle_number)}</td><td data-label="Area">${esc(areaName(a.area_id))}</td><td data-label="Decided">just now</td></tr>`).join('')}</tbody></table></div>` : `<div class="empty">The live console lists all ${st.tab} captains here, with search and paging. Decide on an application to see it appear.</div>`}</section>`;
};

VIEWS.scores = () => {
  const f = S.scores.filter, tone = (l) => ({ Excellent: 'ok', Good: 'ok', Watch: 'warn', 'At risk': 'bad' }[l] ?? '');
  const rows = D.driver_safety.filter((d) => f === 'all' || ['Watch', 'At risk'].includes(d.label)).sort((a, b) => a.score - b.score);
  return `<div class="chips"><button class="chip" data-act="sfilter" data-arg="all" aria-pressed="${f === 'all'}">All captains</button><button class="chip" data-act="sfilter" data-arg="risk" aria-pressed="${f === 'risk'}">Watch & at risk <em>${D.driver_safety.filter((d) => ['Watch', 'At risk'].includes(d.label)).length}</em></button></div>
  <section class="card flush"><div class="table-wrap"><table class="tbl responsive"><thead><tr><th>Captain</th><th>Score</th><th class="num">Trips</th><th class="num">Rating</th><th class="num">Cancellations</th><th class="num">Incidents</th></tr></thead><tbody>
  ${rows.map((d) => `<tr><td class="lead"><strong>${esc(d.name)}</strong></td><td data-label="Score"><span class="row" style="gap:8px;flex-wrap:nowrap"><strong>${d.score}</strong>${badge(d.label, tone(d.label))}</span></td><td data-label="Trips" class="num">${num(d.completed_trips)}</td><td data-label="Rating" class="num">${d.rating_avg.toFixed(1)} ★</td><td data-label="Cancellations" class="num">${d.cancellations}</td><td data-label="Incidents" class="num">${d.incidents}</td></tr>`).join('')}
  </tbody></table></div></section>
  <div class="note">${ic('info')}<span>Lowest scores first. A score under 60 means a captain should be contacted before more trips are dispatched to them.</span></div>`;
};

VIEWS.safety = () => {
  const tab = S.safety.tab, open = D.sos_events.filter((s) => s.incident_status !== 'closed'), closed = D.sos_events.filter((s) => s.incident_status === 'closed');
  const head = `<div class="tabs" role="tablist"><button class="tab" role="tab" data-act="stab" data-arg="sos" aria-selected="${tab === 'sos'}">SOS alerts${open.length ? `<em style="background:var(--danger);color:#fff">${open.length}</em>` : ''}</button><button class="tab" role="tab" data-act="stab" data-arg="incidents" aria-selected="${tab === 'incidents'}">Incident reports${C.incidents() ? `<em>${C.incidents()}</em>` : ''}</button></div>`;
  if (tab === 'sos') {
    const sosCard = (s) => { const vp = viewport({ min_lat: s.lat - 0.012, max_lat: s.lat + 0.012, min_lng: s.lng - 0.02, max_lng: s.lng + 0.02 }, 600, 260, 0); const [x, y] = px(vp, s.lat, s.lng);
      return `<div class="card stack" style="border-color:var(--danger);box-shadow:0 0 0 3px var(--danger-soft)">
      <div class="row"><span class="li-icon bad">${ic('alert')}</span><div class="li-main"><h2>SOS from ${esc(s.rider_name)}</h2><small>Raised ${ago(s.created_at)} at ${clock(s.created_at)} · ride ${rideBadge(s.ride_status)}</small></div><button class="btn danger" data-act="resolve" data-arg="${s.id}">Resolve</button></div>
      <div class="grid g-2" style="gap:14px;align-items:start">
        <div class="map-box" style="height:200px"><svg class="map" viewBox="0 0 600 260" preserveAspectRatio="xMidYMid slice" aria-label="SOS location">${baseMap(600, 260, 5)}<circle class="m-sos-ring" cx="${x}" cy="${y}" r="20"/><circle class="m-sos" cx="${x}" cy="${y}" r="12"/></svg></div>
        <dl class="kv"><dt>Rider</dt><dd>${esc(s.rider_name)} · ${esc(s.rider_email)}</dd><dt>Captain</dt><dd>${esc(s.driver_name)} · <span class="mono">${esc(s.vehicle_number)}</span></dd><dt>Trip</dt><dd>${esc(s.pickup_label)} → ${esc(s.dropoff_label)}</dd><dt>Location</dt><dd class="mono">${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}</dd><dt>Ride</dt><dd><button class="btn sm ghost" style="padding:0" data-act="ride" data-arg="${s.ride_id}">${s.ride_id} ${ic('chevron', 14)}</button></dd></dl>
      </div>
      <div class="note bad">${ic('phone')}<span><b>Call the rider first,</b> then the captain. If you can't reach the rider, call 112 with the location above and note what you did when you resolve.</span></div></div>`; };
    return `${head}${open.length ? open.map(sosCard).join('') : `<div class="card empty">${ic('check', 28)}<strong>No active SOS alerts</strong></div>`}
    <section class="card"><div class="card-head"><h3>Resolved</h3></div><div class="list">${closed.map((s) => `<div class="li"><span class="li-icon ok">${ic('check')}</span><span class="li-main"><strong>${esc(s.rider_name)} · ${esc(s.pickup_label)} → ${esc(s.dropoff_label)}</strong><small>${when(s.created_at)} · ${esc(s.resolution)}</small></span></div>`).join('') || '<p class="muted">None yet.</p>'}</div></section>`;
  }
  return `${head}<section class="grid g-2">${D.incidents.map((i) => `<div class="card stack"><div class="spread">${badge(cap(i.status), i.status === 'open' ? 'warn' : i.status === 'reviewing' ? 'info' : 'ok')}<span class="small muted">${ago(i.created_at)}</span></div>
    <p style="font-size:15px;font-weight:600">“${esc(i.message)}”</p><span class="small muted">Reported by ${esc(i.reporter)} · <button class="btn sm ghost" style="padding:0;min-height:32px" data-act="ride" data-arg="${i.ride_id}">ride ${i.ride_id}</button></span>
    <label class="field"><span>Status</span><select id="inc-st-${i.id}"><option value="reviewing" ${i.status !== 'closed' ? 'selected' : ''}>Reviewing</option><option value="closed" ${i.status === 'closed' ? 'selected' : ''}>Closed</option></select></label>
    <label class="field ${S.errors['inc-' + i.id] ? 'invalid' : ''}"><span>Response to the reporter</span><textarea id="inc-${i.id}" placeholder="What you found and what happens next">${esc(i.resolution)}</textarea>${S.errors['inc-' + i.id] ? '<span class="err">Write at least 5 characters.</span>' : ''}</label>
    <div class="row" style="justify-content:flex-end"><button class="btn primary" data-act="incident" data-arg="${i.id}">Save response</button></div></div>`).join('')}</section>`;
};

VIEWS.lost = () => {
  const tab = S.lost.tab, label = { open: 'Not started', driver_contacted: 'Captain contacted', returned: 'Returned', closed: 'Closed' }, tone = { open: 'warn', driver_contacted: 'info', returned: 'ok', closed: 'plain' };
  const rows = D.lost_items.filter((l) => tab === 'all' || l.status === tab);
  return `<div class="tabs" role="tablist">${[['all', 'All'], ...Object.entries(label)].map(([k, l]) => `<button class="tab" role="tab" data-act="ltab" data-arg="${k}" aria-selected="${tab === k}">${l}${k !== 'all' && D.lost_items.filter((x) => x.status === k).length ? `<em>${D.lost_items.filter((x) => x.status === k).length}</em>` : ''}</button>`).join('')}</div>
  <section class="card flush">${rows.length ? `<div class="table-wrap"><table class="tbl responsive"><thead><tr><th>Item</th><th>Rider</th><th>Captain</th><th>Status</th><th class="actions"></th></tr></thead><tbody>${rows.map((l) => `<tr><td class="lead"><strong>${esc(l.description)}</strong><small>Ride on ${when(l.ride_date)}</small></td><td data-label="Rider">${esc(l.rider_name)}</td><td data-label="Captain">${esc(l.driver_name)} · <span class="mono">${esc(l.vehicle_number)}</span></td><td data-label="Status">${badge(label[l.status], tone[l.status])}</td><td class="actions"><button class="btn sm secondary" data-act="lost" data-arg="${l.id}">Update</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No items in this list.</div>'}</section>`;
};

/* --- Service areas with the map zone editor --- */
const ZW = 640, ZH = 384;
const rnd4 = (n) => Math.round(n * 10000) / 10000;
const overlapOf = (a, b) => { const r = { min_lat: Math.max(a.min_lat, b.min_lat), max_lat: Math.min(a.max_lat, b.max_lat), min_lng: Math.max(a.min_lng, b.min_lng), max_lng: Math.min(a.max_lng, b.max_lng) }; return r.min_lat < r.max_lat && r.min_lng < r.max_lng ? r : null; };
const sizeKm = (b) => [((b.max_lng - b.min_lng) * 111.32 * Math.cos(((b.min_lat + b.max_lat) / 2) * Math.PI / 180)), (b.max_lat - b.min_lat) * 110.57];
function selectZone(id) {
  const z = S.zones; z.sel = id; z.picking = false;
  if (id === 'new') return;
  const a = D.areas.find((x) => x.id === id); z.draft = structuredClone(a); z.dirty = false; fitZoneView();
}
function fitZoneView() {
  // Large zones show the whole district around them; city-sized zones are shown up close.
  const z = S.zones, d = z.draft, reg = D.regions.find((r) => r.id === d.catalog_id);
  const big = reg && (d.max_lat - d.min_lat) * (d.max_lng - d.min_lng) > 0.3 * (reg.max_lat - reg.min_lat) * (reg.max_lng - reg.min_lng);
  z.vp = big ? viewport({ min_lat: Math.min(d.min_lat, reg.min_lat), max_lat: Math.max(d.max_lat, reg.max_lat), min_lng: Math.min(d.min_lng, reg.min_lng), max_lng: Math.max(d.max_lng, reg.max_lng) }, ZW, ZH, 0.14) : viewport(d, ZW, ZH, 0.45);
}
function zoneChecks(d) {
  const others = D.areas.filter((a) => a.id !== d.id);
  const overlaps = others.map((o) => [o, overlapOf(d, o)]).filter(([, r]) => r);
  const valid = d.min_lat < d.max_lat && d.min_lng < d.max_lng && d.max_lat - d.min_lat >= 0.01 && d.max_lng - d.min_lng >= 0.01;
  const hitsActive = overlaps.filter(([o]) => o.active);
  const fares = d.base_paise >= 0 && d.per_km_paise > 0 && d.minimum_paise > 0;
  const cats = d.id ? categoriesFor(d.id) : ['bike'];
  return {
    overlaps, list: [
      [valid ? 'done' : 'bad', 'Boundary is a valid rectangle', valid ? `${sizeKm(d).map((n) => n.toFixed(1)).join(' × ')} km` : 'North must be above south and east right of west, at least 1 km each way'],
      [hitsActive.length ? 'bad' : overlaps.length ? 'todo' : 'done', hitsActive.length ? `Overlaps ${hitsActive.map(([o]) => o.name).join(', ')}, which is taking bookings` : overlaps.length ? `Overlaps ${overlaps.map(([o]) => o.name).join(', ')} (inactive)` : 'No overlap with other zones', overlaps.length ? 'Riders inside the red area would match two zones. Shrink the box or use the city limits.' : ''],
      [d.approval_reference.trim() ? 'done' : d.active ? 'bad' : 'todo', 'Operational approval reference', d.approval_reference.trim() ? d.approval_reference : 'Needed before bookings can open'],
      [fares ? 'done' : 'bad', 'Bike fares set', fares ? `${rupee(d.base_paise)} base · ${rupee(d.per_km_paise)}/km · ${rupee(d.minimum_paise)} minimum` : 'Enter all three'],
      [cats.length > 1 ? 'done' : 'todo', cats.length > 1 ? `${cats.length} vehicle types priced` : 'Only Bike is priced', cats.length > 1 ? cats.map((c) => CATS[c]).join(', ') : 'Set Auto, Mini, Sedan and SUV fares on the Fares page'],
    ], valid, hitsActive, fares,
  };
}
function zoneSvg() {
  const z = S.zones, d = z.draft, vp = z.vp, reg = D.regions.find((r) => r.id === d.catalog_id);
  let s = baseMap(ZW, ZH, 3 + (d.name.length * 7) % 40);
  for (const o of D.areas.filter((a) => a.id !== d.id)) {
    const r = rectPx(vp, o); s += `<rect class="m-zone-other ${o.active ? 'active' : ''}" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}"/><text class="m-tag" x="${r.x + 10}" y="${r.y + 18}">${esc(o.name)}${o.active ? '' : ' (inactive)'}</text>`;
  }
  if (reg) {
    const r = rectPx(vp, reg); s += `<rect class="m-district" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}"/><text class="m-label" x="${r.x + r.w / 2}" y="${r.y + r.h - 12}" text-anchor="middle">${esc(reg.district)} district</text>`;
    const [a, b, c, e] = reg.city, cr = rectPx(vp, { min_lat: a, max_lat: b, min_lng: c, max_lng: e }); s += `<rect class="m-city" x="${cr.x}" y="${cr.y}" width="${cr.w}" height="${cr.h}" rx="4"/>`;
  }
  s += '<g id="overlaps">' + zoneOverlaps() + '</g>';
  const r = rectPx(vp, d);
  s += `<rect id="zone-rect" class="m-zone" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" data-drag="move" tabindex="0" role="slider" aria-label="Zone boundary. Drag to move, or use the arrow keys. Drag a corner to resize."/>`;
  for (const k of ['nw', 'ne', 'sw', 'se']) { const [x, y] = [k[1] === 'w' ? r.x : r.x + r.w, k[0] === 'n' ? r.y : r.y + r.h]; s += `<g data-h="${k}"><circle class="m-handle-hit ${k}" cx="${x}" cy="${y}" r="18" data-drag="${k}"/><circle class="m-handle" cx="${x}" cy="${y}" r="7.5" pointer-events="none"/></g>`; }
  const [w, h] = sizeKm(d);
  s += `<g id="zone-size" pointer-events="none"><rect class="m-tag-bg" x="${r.x + r.w / 2 - 60}" y="${Math.max(4, r.y - 30)}" width="120" height="24" rx="12"/><text class="m-tag" x="${r.x + r.w / 2}" y="${Math.max(4, r.y - 30) + 16}" text-anchor="middle">${w.toFixed(1)} × ${h.toFixed(1)} km</text></g>`;
  return s;
}
function zoneOverlaps() {
  const d = S.zones.draft; return D.areas.filter((a) => a.id !== d.id).map((o) => overlapOf(d, o)).filter(Boolean).map((b) => { const r = rectPx(S.zones.vp, b); return `<rect class="m-zone-overlap" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}"/>`; }).join('');
}
VIEWS.zones = () => {
  const z = S.zones;
  if (!z.draft && z.sel !== 'new') selectZone(z.sel);
  const covered = (id) => D.areas.find((a) => a.catalog_id === id);
  const list = `<div class="card stack zone-list">
    <div class="spread"><h3>Zones</h3><button class="btn sm soft" data-act="znew">${ic('plus', 14)}New zone</button></div>
    <div class="queue">${D.areas.map((a) => `<button class="q-item" data-act="zsel" data-arg="${a.id}" aria-current="${z.sel === a.id}"><span class="li-icon ${a.active ? 'ok' : ''}">${ic('zone')}</span><span class="li-main"><strong>${esc(a.name)}</strong><small>${a.active ? 'Bookings open' : 'Inactive'} · ${categoriesFor(a.id).length} vehicle type${categoriesFor(a.id).length > 1 ? 's' : ''}</small></span>${a.active ? badge('Live', 'ok') : badge('Off', 'plain')}</button>`).join('')}</div>
    ${z.sel === 'new' ? `<div class="card stack" style="background:var(--surface-2);box-shadow:none"><strong>Start from a district</strong>
      <label class="field"><span>State</span><select disabled><option>Tamil Nadu</option></select><small>Add a state with fetch_districts.py.</small></label>
      <label class="field"><span>District</span><select data-act="zdistrict"><option value="">Choose a district…</option>${D.regions.map((r) => { const c = covered(r.id); return `<option value="${r.id}" ${c ? 'disabled' : ''}>${esc(r.district)}${c ? ` — already a zone (${esc(c.name)})` : ''}</option>`; }).join('')}</select></label>
      <span class="small muted">${D.regions.filter((r) => covered(r.id)).length} of ${D.regions.length} districts have a zone. New zones start inactive.</span></div>` : ''}
  </div>`;
  if (z.sel === 'new' || !z.draft) return `<section class="grid g-split">${list}<div class="card empty">${ic('zone', 32)}<strong>Choose a district</strong><span>The zone starts at the city limits, so you rarely need to type coordinates.</span></div></section>`;
  const d = z.draft, chk = zoneChecks(d), reg = D.regions.find((r) => r.id === d.catalog_id);
  const activateBlocked = d.active && (!d.approval_reference.trim() || !chk.valid || chk.hitsActive.length || !chk.fares);
  const err = S.errors.zone;
  return `<section class="grid g-split">${list}
  <div class="card stack" style="gap:16px">
    <div class="row" style="align-items:flex-end">
      <label class="field" style="flex:1;min-width:160px"><span>Zone name</span><input id="z-name" data-model="zones.draft.name" value="${esc(d.name)}" maxlength="100"></label>
      <label class="field" style="flex:1;min-width:160px"><span>State</span><input id="z-state" data-model="zones.draft.state" value="${esc(d.state)}" maxlength="100"></label>
      ${d.id ? (D.areas.find((a) => a.id === d.id).active ? badge('Bookings open', 'ok') : badge('Inactive', 'plain')) : badge('New zone', 'info')}
    </div>
    <div class="row">${reg ? `<button class="btn sm secondary" data-act="zcity">${ic('city', 16)}City limits</button><button class="btn sm secondary" data-act="zdistrictfit">${ic('expand', 16)}Whole district</button>` : ''}
        ${z.dirty ? `<button class="btn sm secondary" data-act="zreset">${ic('reset', 16)}Undo changes</button>` : ''}</div>
    <div class="map-box zone-map">
      <svg class="map" id="zone-map" viewBox="0 0 ${ZW} ${ZH}" preserveAspectRatio="xMidYMid meet">${zoneSvg()}</svg>
      <div class="map-legend"><span><i class="sq" style="background:var(--primary);opacity:.6"></i>This zone</span>${reg ? '<span><i class="sq" style="border:1.5px dashed var(--primary)"></i>City limits</span><span><i class="sq" style="border:1.5px dotted var(--ink-2)"></i>District</span>' : ''}<span><i class="sq" style="background:var(--danger);opacity:.5"></i>Overlap</span></div>
    </div>
    <span class="small muted">Drag the box to move it, drag a corner to resize, or type exact values. Arrow keys move it when the box is focused.</span>
    <div class="coord-grid">${[['max_lat', 'North latitude'], ['min_lat', 'South latitude'], ['min_lng', 'West longitude'], ['max_lng', 'East longitude']].map(([k, l]) => `<label class="field"><span>${l}</span><input id="z-${k}" type="number" step="0.0001" data-coord="${k}" value="${rnd4(d[k])}" inputmode="decimal"></label>`).join('')}</div>
    ${chk.overlaps.length ? `<div class="note ${chk.hitsActive.length ? 'bad' : 'warn'}">${ic('alert')}<span><b>Overlaps ${chk.overlaps.map(([o]) => esc(o.name)).join(', ')}.</b> A rider in the red area would match two zones. ${reg ? 'Use <b>City limits</b> to fix it in one click.' : 'Shrink the box.'}</span></div>` : ''}
    <div class="grid g-2" style="gap:16px;align-items:start">
      <div class="stack">
        <strong>Bike fares</strong>
        <div class="form-grid" style="grid-template-columns:repeat(3,minmax(0,1fr))">${[['base_paise', 'Base'], ['per_km_paise', 'Per km'], ['minimum_paise', 'Minimum']].map(([k, l]) => `<label class="field"><span>${l}</span><span class="affix"><b>₹</b><input id="z-${k}" type="number" min="0" step="0.5" data-rupee="zones.draft.${k}" value="${d[k] / 100}"></span></label>`).join('')}</div>
        <label class="field ${err === 'ref' ? 'invalid' : ''}"><span>Operational approval reference</span><input id="z-ref" data-model="zones.draft.approval_reference" data-live value="${esc(d.approval_reference)}" placeholder="e.g. TN-TPT/2026/0977" maxlength="500">${err === 'ref' ? '<span class="err">Add the approval reference to open bookings. You can still save the zone as inactive.</span>' : '<small>Permit or approval number. Required to open bookings.</small>'}</label>
        <label class="switch"><input type="checkbox" data-act="zactive" ${d.active ? 'checked' : ''}><span>Open bookings in this zone<small>Existing quotes keep their price until they expire.</small></span></label>
      </div>
      <div class="card" style="background:var(--surface-2);box-shadow:none;padding:14px 16px"><strong class="small">Ready to open bookings?</strong><ul class="checklist" style="margin-top:10px">${chk.list.map(([s, t, sub]) => `<li class="${s}">${ic(s === 'done' ? 'check' : s === 'bad' ? 'x' : 'circle', 16)}<span>${esc(t)}${sub ? `<small>${esc(sub)}</small>` : ''}</span></li>`).join('')}</ul></div>
    </div>
    <div class="row" style="justify-content:flex-end">
      ${activateBlocked ? `<span class="small" style="color:var(--danger);font-weight:600;margin-right:auto">${!d.approval_reference.trim() ? 'Add the approval reference, or turn off “Open bookings” to save as inactive.' : chk.hitsActive.length ? 'Fix the overlap with a live zone before opening bookings.' : 'Fix the items marked ✕ before opening bookings.'}</span>` : ''}
      <button class="btn secondary" data-act="zsel" data-arg="${d.id || 'new'}">Discard</button>
      <button class="btn primary" data-act="zsave" ${activateBlocked ? 'aria-disabled="true"' : ''}>${d.active ? 'Save and open bookings' : 'Save zone'}</button>
    </div>
  </div></section>`;
};

/* --- Fares --- */
const fareAt = (p, km) => Math.max(p.minimum_paise, p.base_paise + p.per_km_paise * km);
VIEWS.fares = () => {
  const st = S.fares, area = D.areas.find((a) => a.id === st.area);
  const cats = ['bike', 'auto', 'mini', 'sedan', 'suv'].map((c) => {
    if (c === 'bike') return { category: 'bike', base_paise: area.base_paise, per_km_paise: area.per_km_paise, minimum_paise: area.minimum_paise, enabled: true, fromArea: true };
    return D.pricing.find((p) => p.area_id === area.id && p.category === c) ?? { category: c, base_paise: 0, per_km_paise: 0, minimum_paise: 0, enabled: false, missing: true };
  });
  const tv = D.vehicles.find((v) => v.category === st.trip);
  return `<div class="spread" style="flex-wrap:wrap"><div class="chips" role="group" aria-label="Service area">${D.areas.map((a) => `<button class="chip" data-act="farea" data-arg="${a.id}" aria-pressed="${st.area === a.id}">${esc(a.name)}${a.active ? '' : ' <em>inactive</em>'}</button>`).join('')}</div><span class="small muted">Prices in rupees. Saved quotes keep their price until they expire.</span></div>
  <section class="grid g-3">${cats.map((p) => { const set = p.base_paise + p.per_km_paise + p.minimum_paise > 0, id = `f-${p.category}`;
    return `<div class="card fare-card ${p.enabled ? '' : 'off'}"><header><img src="assets/${p.category}.png" alt=""><div class="li-main"><h3>${CATS[p.category]}</h3><small>${p.fromArea ? 'Uses the zone’s bike fares' : `Pricing v${p.pricing_version ?? 1}`}</small></div>${p.enabled ? badge('Offered', 'ok') : set ? badge('Off', 'plain') : badge('Needs fares', 'warn')}</header>
    <div class="form-grid" style="grid-template-columns:repeat(3,minmax(0,1fr))">${[['base_paise', 'Base'], ['per_km_paise', 'Per km'], ['minimum_paise', 'Minimum']].map(([k, l]) => `<label class="field"><span>${l}</span><span class="affix"><b>₹</b><input id="${id}-${k}" type="number" min="0" step="0.5" value="${p[k] / 100}" data-fare="${p.category}:${k}"></span></label>`).join('')}</div>
    <div class="preview" aria-label="Example fares">${set ? [3, 8, 15].map((km) => `<span>${km} km <b>${rupee(fareAt(p, km))}</b></span>`).join('') : '<span class="muted">Enter fares to see example prices</span>'}</div>
    ${p.fromArea ? '<span class="small muted">Same values as the bike fares on the Service areas page.</span>' : `<label class="switch"><input type="checkbox" data-act="fenable" data-arg="${p.category}" ${p.enabled ? 'checked' : ''}><span>Offer ${CATS[p.category]} in ${esc(area.name)}</span></label>`}
    <button class="btn ${p.enabled ? 'primary' : 'secondary'} block" data-act="fsave" data-arg="${p.category}">Save ${CATS[p.category]} fares</button></div>`; }).join('')}
    <div class="card stack"><h3>Trip options</h3><p class="small muted">Stops, rentals and outstation trips for each vehicle in ${esc(area.name)}. Leave a rate empty to turn that option off.</p>
      <div class="chips">${D.vehicles.map((v) => `<button class="chip" data-act="ftrip" data-arg="${v.category}" aria-pressed="${st.trip === v.category}">${CATS[v.category]}</button>`).join('')}</div>
      <div class="form-grid" style="grid-template-columns:repeat(2,minmax(0,1fr))">${[['stop_fee_paise', 'Per extra stop', true], ['hourly_paise', 'Rental per hour', true], ['included_km_per_hour', 'Km included per hour', false], ['extra_km_paise', 'Rental extra km', true], ['outstation_per_km_paise', 'Outstation per km', true], ['outstation_allowance_paise', 'Captain allowance / day', true]].map(([k, l, money]) => `<label class="field"><span>${l}</span>${money ? `<span class="affix"><b>₹</b><input type="number" min="0" step="0.5" value="${tv[k] ? tv[k] / 100 : ''}" placeholder="Off"></span>` : `<input type="number" min="1" max="100" value="${tv[k]}">`}</label>`).join('')}</div>
      <button class="btn secondary block" data-act="toast" data-arg="${CATS[st.trip]} trip options saved for ${esc(area.name)}.">Save trip options</button></div>
  </section>`;
};

VIEWS.surge = () => {
  const f = D.finance;
  return `<section class="grid g-2">
    <div class="card stack"><div class="card-head" style="margin:0"><h3>Live overrides</h3>${f.surges.length ? badge(`${f.surges.length} running`, 'warn') : ''}</div>
      ${f.surges.length ? `<div class="list">${f.surges.map((s) => `<div class="li"><span class="li-icon warn">${ic('bolt')}</span><span class="li-main"><strong>${esc(areaName(s.area))} · ${s.multiplier}×${s.category ? ' · ' + CATS[s.category] : ' · all vehicles'}</strong><small>${esc(s.reason)} · ends ${clock(s.ends_at)}</small></span><button class="btn sm secondary" data-act="endsurge" data-arg="${s.id}">End now</button></div>`).join('')}</div>` : '<p class="muted">No overrides running.</p>'}
      <hr style="border:0;border-top:1px solid var(--line);margin:4px 0">
      <strong>Start an override</strong>
      <div class="form-grid" style="grid-template-columns:repeat(2,minmax(0,1fr))">
        <label class="field"><span>Area</span><select id="sg-area">${D.areas.filter((a) => a.active).map((a) => `<option value="${a.id}">${esc(a.name)} (cap ${a.surge_cap}×)</option>`).join('')}</select></label>
        <label class="field"><span>Multiplier</span><input id="sg-mult" type="number" min="1" max="3" step="0.05" value="1.5"></label>
        <label class="field"><span>Duration</span><select id="sg-mins"><option value="30">30 minutes</option><option value="60" selected>1 hour</option><option value="120">2 hours</option><option value="240">4 hours</option></select></label>
        <label class="field ${S.errors.surge ? 'invalid' : ''}"><span>Reason</span><input id="sg-reason" placeholder="e.g. Heavy rain">${S.errors.surge ? `<span class="err">${esc(S.errors.surge)}</span>` : ''}</label>
      </div>
      <button class="btn primary" data-act="startsurge">Start override</button>
    </div>
    <div class="card stack"><h3>Area limits</h3><p class="small muted">The cap is the highest multiplier riders can ever see. Demand surge raises prices automatically when captains are short.</p>
      <div class="list">${D.areas.map((a) => `<div class="li" style="flex-wrap:wrap"><span class="li-main"><strong>${esc(a.name)}</strong><small>${a.active ? 'Bookings open' : 'Inactive'}</small></span>
        <label class="field" style="width:96px"><span class="sr">Surge cap for ${esc(a.name)}</span><span class="affix"><input type="number" min="1" max="3" step="0.1" value="${a.surge_cap}" style="padding-left:12px"></span></label>
        <label class="switch"><input type="checkbox" data-act="sauto" data-arg="${a.id}" ${a.surge_auto ? 'checked' : ''}><span>Demand surge</span></label></div>`).join('')}</div>
      <button class="btn secondary" data-act="toast" data-arg="Area surge limits saved.">Save limits</button>
    </div>
  </section>
  <section class="card stack"><div class="card-head" style="margin:0"><h3>Peak hours</h3><p>Planned multipliers that repeat every week.</p></div>
    <div class="list">${f.peak_windows.map((p) => `<div class="li"><span class="li-icon info">${ic('clock')}</span><span class="li-main"><strong>${esc(p.label)} · ${p.multiplier}×</strong><small>${esc(areaName(p.area))} · ${p.days.map((d) => DAYS[d - 1]).join(', ')} · ${p.start_time}–${p.end_time}</small></span><button class="btn sm ghost" data-act="delpeak" data-arg="${p.id}">Remove</button></div>`).join('')}</div>
    <div class="form-grid">
      <label class="field"><span>Area</span><select id="pk-area">${D.areas.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select></label>
      <label class="field ${S.errors.peak ? 'invalid' : ''}"><span>Label</span><input id="pk-label" placeholder="e.g. School run">${S.errors.peak ? `<span class="err">${esc(S.errors.peak)}</span>` : ''}</label>
      <label class="field"><span>Starts</span><input id="pk-start" type="time" value="08:00"></label>
      <label class="field"><span>Ends</span><input id="pk-end" type="time" value="10:30"></label>
      <label class="field"><span>Multiplier</span><input id="pk-mult" type="number" min="1.05" max="3" step="0.05" value="1.3"></label>
    </div>
    <div class="spread" style="flex-wrap:wrap"><div class="chips" role="group" aria-label="Days">${DAYS.map((n, i) => `<button class="chip" data-act="pday" data-arg="${i + 1}" aria-pressed="${S.peakDays.includes(i + 1)}">${n}</button>`).join('')}</div><button class="btn primary" data-act="addpeak">Add peak hours</button></div>
  </section>`;
};

VIEWS.payouts = () => {
  const f = D.finance, t = f.totals, req = C.payouts();
  return `<section class="grid g-kpi">${[['Owed to captains', t.driver_liability_paise, 'Earned but not paid out'], ['Rider wallets', t.wallet_held_paise, 'Balance held for riders'], ['Promos funded', t.promo_funded_paise, 'Paid by Hop, this month'], ['Refunded', t.refunded_paise, 'To rider wallets, this month']].map(([l, v, s]) => `<div class="card kpi"><span class="eyebrow">${l}</span><strong>${rupeeShort(v)}</strong><small>${s}</small></div>`).join('')}</section>
  <section class="card flush"><div class="card-head" style="padding:18px 20px 0"><h2>Payout requests</h2>${req.length ? badge(`${req.length} waiting · ${rupee(req.reduce((s, p) => s + p.amount_paise, 0))}`, 'info') : ''}<p>Pay by UPI first, then record the UPI reference here.</p></div>
    <div class="table-wrap"><table class="tbl responsive"><thead><tr><th>Captain</th><th>UPI ID</th><th>Requested</th><th>Status</th><th class="num">Amount</th><th class="actions"></th></tr></thead><tbody>
    ${f.payouts.map((p) => `<tr><td class="lead"><strong>${esc(p.name)}</strong></td><td data-label="UPI ID" class="mono">${esc(p.upi_id)}</td><td data-label="Requested">${ago(p.requested_at)}</td><td data-label="Status">${p.status === 'requested' ? badge('Waiting', 'warn') : p.status === 'paid' ? badge('Paid', 'ok') : badge('Rejected', 'bad')}${p.reference ? `<small class="mono">${esc(p.reference)}</small>` : ''}</td><td data-label="Amount" class="num"><strong>${rupee(p.amount_paise)}</strong></td><td class="actions">${p.status === 'requested' ? `<button class="btn sm ghost" data-act="payout" data-arg="${p.id}:reject">Reject</button> <button class="btn sm primary" data-act="payout" data-arg="${p.id}:paid">Mark paid</button>` : ''}</td></tr>`).join('')}
    </tbody></table></div></section>
  <section class="card stack"><div class="card-head" style="margin:0"><h2>Refund a ride</h2><p>Find a completed ride, then refund all or part of it to the rider's wallet.</p></div>
    <label class="field"><span class="sr">Find a ride</span><input id="rf-q" type="search" data-model="rides.q" data-live value="${esc(S.rides.q)}" placeholder="Ride ID, rider or captain"></label>
    ${S.rides.q ? `<div class="list">${D.rides.filter((r) => r.status === 'completed' && rideMatches(r, S.rides.q)).map((r) => `<div class="li"><span class="li-main"><strong>${esc(r.rider)} · ${esc(r.pickup_label)} → ${esc(r.dropoff_label)}</strong><small><span class="mono">${r.id}</span> · paid ${rupee(r.payable_paise)}${r.refunded_paise ? ` · refunded ${rupee(r.refunded_paise)}` : ''}</small></span>${r.payable_paise > r.refunded_paise ? `<button class="btn sm secondary" data-act="refund" data-arg="${r.id}">Refund</button>` : badge('Fully refunded', 'plain')}</div>`).join('') || '<p class="muted">No completed rides match.</p>'}</div>` : ''}
    <span class="small muted">Recent: ${f.refunds.slice(0, 3).map((r) => `${esc(r.rider)} ${rupee(r.amount_paise)} (${esc(r.reason)})`).join(' · ')}</span>
  </section>`;
};

VIEWS.promos = () => {
  const f = D.finance;
  return `<section class="card flush"><div class="table-wrap"><table class="tbl responsive"><thead><tr><th>Code</th><th>Discount</th><th>Used</th><th>Valid until</th><th>Status</th><th class="actions"></th></tr></thead><tbody>
  ${f.promos.map((p) => `<tr><td class="lead"><strong class="mono" style="font-size:13px">${esc(p.code)}</strong><small>${esc(p.description)}</small></td><td data-label="Discount">${p.kind === 'percent' ? `${p.value}%` : rupee(p.value) + ' off'}</td><td data-label="Used">${num(p.redemptions)}${p.max_uses ? ` / ${num(p.max_uses)}` : ''}</td><td data-label="Valid until">${new Date(p.valid_to).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td><td data-label="Status">${p.active && daysLeft(p.valid_to) >= 0 ? badge('Active', 'ok') : badge(daysLeft(p.valid_to) < 0 ? 'Expired' : 'Off', 'plain')}</td><td class="actions">${p.active ? `<button class="btn sm ghost" data-act="promooff" data-arg="${p.code}">Turn off</button>` : ''}</td></tr>`).join('')}
  </tbody></table></div></section>
  <section class="card stack"><h3>New promo code</h3>
    <div class="form-grid">
      <label class="field ${S.errors.promo ? 'invalid' : ''}"><span>Code</span><input id="pr-code" placeholder="e.g. MONSOON20" maxlength="20" style="text-transform:uppercase">${S.errors.promo ? `<span class="err">${esc(S.errors.promo)}</span>` : '<small>3–20 letters or digits</small>'}</label>
      <label class="field"><span>Description</span><input id="pr-desc" maxlength="200" placeholder="Shown to riders"></label>
      <div class="field"><span>Type</span><div class="tabs" style="width:100%"><button class="tab" style="flex:1" data-act="pkind" data-arg="percent" aria-selected="${S.promoKind === 'percent'}">Percent</button><button class="tab" style="flex:1" data-act="pkind" data-arg="flat" aria-selected="${S.promoKind === 'flat'}">Flat ₹</button></div></div>
      <label class="field"><span>${S.promoKind === 'percent' ? 'Percent off' : 'Rupees off'}</span><input id="pr-value" type="number" min="1" ${S.promoKind === 'percent' ? 'max="100"' : ''} value="${S.promoKind === 'percent' ? 20 : 30}"></label>
      ${S.promoKind === 'percent' ? '<label class="field"><span>Max discount</span><span class="affix"><b>₹</b><input type="number" min="0" value="75"></span></label>' : ''}
      <label class="field"><span>Minimum fare</span><span class="affix"><b>₹</b><input type="number" min="0" value="0"></span></label>
      <label class="field"><span>Area</span><select><option value="">All areas</option>${D.areas.map((a) => `<option>${esc(a.name)}</option>`).join('')}</select></label>
      <label class="field"><span>Uses per rider</span><input type="number" min="1" value="1"></label>
      <label class="field"><span>Total uses</span><input type="number" min="0" placeholder="No limit"></label>
      <label class="field"><span>Valid for (days)</span><input type="number" min="1" max="730" value="30"></label>
    </div>
    <div class="spread" style="flex-wrap:wrap"><label class="check"><input type="checkbox" checked><span>List it on the rider's offers screen</span></label><button class="btn primary" data-act="addpromo">Create promo</button></div>
  </section>`;
};

VIEWS.audit = () => {
  const st = S.audit, groups = { all: 'All', driver: 'Captains', ride: 'Rides', money: 'Money', area: 'Areas & fares', sos: 'Safety' };
  const inGroup = (a) => st.filter === 'all' || (st.filter === 'money' ? /^(refund|payout|promo)/.test(a) : st.filter === 'area' ? /^(area|pricing|surge)/.test(a) : a.startsWith(st.filter));
  const rows = D.events.filter((e) => inGroup(e.action) && (!st.q || `${e.action} ${e.detail} ${e.actor}`.toLowerCase().includes(st.q.toLowerCase())));
  return `<div class="spread" style="flex-wrap:wrap"><div class="chips">${Object.entries(groups).map(([k, l]) => `<button class="chip" data-act="afilter" data-arg="${k}" aria-pressed="${st.filter === k}">${l}</button>`).join('')}</div><label class="field" style="min-width:min(280px,100%)"><span class="sr">Search the audit log</span><input id="au-q" type="search" data-model="audit.q" data-live value="${esc(st.q)}" placeholder="Search actions, people or IDs"></label></div>
  <section class="card flush"><div class="table-wrap"><table class="tbl responsive"><thead><tr><th>Action</th><th>Details</th><th>By</th><th>When</th></tr></thead><tbody>
  ${rows.map((e) => `<tr><td class="lead"><span class="mono">${esc(e.action)}</span></td><td data-label="Details">${esc(e.detail)}</td><td data-label="By">${esc(e.actor)}</td><td data-label="When">${when(e.created_at)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No matching events.</td></tr>'}
  </tbody></table></div></section>
  <div class="note">${ic('shield')}<span>The server writes these records inside the same transaction as each change. They can't be edited or deleted from the console.</span></div>`;
};

function signin() {
  return `<div class="signin"><section class="signin-art"><span class="glow" style="width:420px;height:420px;background:#4b3fd1;left:-80px;top:-60px"></span><span class="glow" style="width:360px;height:360px;background:#7a3fd1;right:-100px;bottom:-80px"></span>
    <a class="brand" href="?">hop<i>.</i><small>Operations</small></a>
    <div><h1>Keep every ride safe, fair and moving.</h1><p>Review captains, watch live trips, respond to SOS alerts and manage zones and fares from one place.</p></div>
    <ul><li>Live dispatch</li><li>Captain reviews</li><li>SOS response</li><li>Every action audited</li></ul></section>
  <section class="signin-form"><div class="card"><h2>Operator sign in</h2><p class="muted">Only for authorised Hop operators. Sign-in uses your phone number and a one-time code.</p><a class="btn primary block" href="#overview" data-act="signin">Continue to sign in</a><span class="small muted">Signed in without operator access? You'll see a message here and can sign out.</span></div></section></div>`;
}

/* ---------- overlays ---------- */
const OVERLAYS = {};
OVERLAYS.ride = () => {
  const r = D.rides.find((x) => x.id === S.overlay.id), steps = ['requested', 'accepted', 'arrived', 'in_progress', 'completed'], at = steps.indexOf(r.status);
  const remaining = r.payable_paise - r.refunded_paise;
  return `<div class="overlay" data-act="close"><aside class="drawer narrow" role="dialog" aria-modal="true" aria-label="Ride ${r.id}" data-stop>
    <div class="drawer-head"><div class="li-main"><strong>${esc(r.pickup_label)} → ${esc(r.dropoff_label)}</strong><small class="mono">${r.id} · ${when(r.created_at)}</small></div><button class="icon-btn" data-act="close" aria-label="Close">${ic('x')}</button></div>
    <div class="drawer-body">
      <div class="row">${rideBadge(r.status)}${badge(`${r.payment_method.toUpperCase()} · ${r.payment_status}`, r.payment_status === 'paid' ? 'ok' : 'plain')}</div>
      <div class="card"><ul class="blockers">${r.status === 'cancelled' ? `<li class="todo">${ic('x', 16)}<span>Cancelled before completion</span></li>` : steps.map((s, i) => `<li class="${i <= at ? 'done' : 'todo'}">${ic(i <= at ? 'check' : 'circle', 16)}<span>${RIDE_STATUS[s][0]}</span></li>`).join('')}</ul></div>
      <div class="card"><dl class="kv"><dt>Rider</dt><dd>${esc(r.rider)}</dd><dt>Captain</dt><dd>${esc(r.driver || 'Not assigned')}</dd><dt>Vehicle</dt><dd>${CATS[r.vehicle_category]}</dd><dt>Fare</dt><dd>${rupee(r.fare_paise)}</dd><dt>Discount</dt><dd>${rupee(r.discount_paise)}</dd><dt>Rider paid</dt><dd>${rupee(r.payable_paise)}</dd>${r.refunded_paise ? `<dt>Refunded</dt><dd>${rupee(r.refunded_paise)}</dd>` : ''}</dl></div>
    </div>
    <div class="drawer-foot">${ACTIVE.includes(r.status) ? `<button class="btn danger-soft" data-act="cancelride" data-arg="${r.id}">Cancel ride</button>` : ''}${r.status === 'completed' && remaining > 0 ? `<button class="btn secondary" data-act="refund" data-arg="${r.id}">Refund</button>` : ''}<span class="grow"></span><button class="btn ghost" data-act="close">Close</button></div>
  </aside></div>`;
};
const modal = (title, body, foot, wide = false) => `<div class="overlay center" data-act="close"><div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}" data-stop><div class="modal-head"><h2>${esc(title)}</h2><button class="icon-btn" data-act="close" aria-label="Close">${ic('x')}</button></div><div class="modal-body">${body}</div><div class="modal-foot">${foot}</div></div></div>`;
const errFor = (k) => S.errors[k] ? `<span class="err">${esc(S.errors[k])}</span>` : '';
OVERLAYS.cancel = () => { const r = D.rides.find((x) => x.id === S.overlay.id);
  return modal('Cancel this ride?', `<p class="muted">${esc(r.rider)} and ${esc(r.driver || 'the captain')} are told straight away. Use this only when the ride can't continue.</p><label class="field ${S.errors.m ? 'invalid' : ''}"><span>Reason</span><select id="m-reason"><option value="">Choose a reason…</option><option>Rider asked support to cancel</option><option>Captain can't reach pickup</option><option>Safety concern</option><option>Duplicate booking</option></select>${errFor('m')}</label>`, `<button class="btn ghost" data-act="close">Keep ride</button><button class="btn danger" data-act="confirmcancel">Cancel ride</button>`); };
OVERLAYS.refund = () => { const r = D.rides.find((x) => x.id === S.overlay.id), max = (r.payable_paise - r.refunded_paise) / 100;
  return modal('Refund to rider wallet', `<p class="muted">${esc(r.rider)} paid ${rupee(r.payable_paise)}${r.refunded_paise ? `, ${rupee(r.refunded_paise)} already refunded` : ''}. Up to ₹${max} can be refunded.</p>
  <label class="field ${S.errors.amt ? 'invalid' : ''}"><span>Amount</span><span class="affix"><b>₹</b><input id="m-amt" type="number" min="1" max="${max}" step="0.5" value="${max}"></span>${errFor('amt')}</label>
  <label class="field ${S.errors.m ? 'invalid' : ''}"><span>Reason</span><input id="m-reason" placeholder="e.g. Charged for a longer route">${errFor('m')}</label>
  <label class="check"><input id="m-claw" type="checkbox"><span>Recover this amount from the captain's earnings<small class="muted" style="display:block;font-weight:500">Only when the captain caused the problem.</small></span></label>`, `<button class="btn ghost" data-act="close">Cancel</button><button class="btn primary" data-act="confirmrefund">Refund</button>`); };
OVERLAYS.resolve = () => modal('Resolve SOS', `<p class="muted">Record what happened and what you did. This closes the alert for everyone.</p><label class="field ${S.errors.m ? 'invalid' : ''}"><span>Action taken</span><textarea id="m-reason" placeholder="e.g. Called rider at 10:31, confirmed safe. Captain stopped for fuel."></textarea>${errFor('m')}</label>`, `<button class="btn ghost" data-act="close">Not yet</button><button class="btn danger" data-act="confirmresolve">Resolve SOS</button>`);
OVERLAYS.payout = () => { const p = D.finance.payouts.find((x) => x.id === S.overlay.id), paid = S.overlay.mode === 'paid';
  return modal(paid ? `Mark ${rupee(p.amount_paise)} as paid` : 'Reject payout', paid ? `<p class="muted">Send ${rupee(p.amount_paise)} to <span class="mono">${esc(p.upi_id)}</span> in your UPI app first, then enter its reference.</p><label class="field ${S.errors.m ? 'invalid' : ''}"><span>UPI reference</span><input id="m-reason" class="mono" placeholder="12-digit UTR">${errFor('m')}</label>` : `<p class="muted">The amount goes back to ${esc(p.name)}'s balance and they can request again.</p><label class="field ${S.errors.m ? 'invalid' : ''}"><span>Reason shown to the captain</span><input id="m-reason" placeholder="e.g. UPI ID doesn't match the account name">${errFor('m')}</label>`, `<button class="btn ghost" data-act="close">Cancel</button><button class="btn ${paid ? 'success' : 'danger'}" data-act="confirmpayout">${paid ? 'Mark paid' : 'Reject payout'}</button>`); };
OVERLAYS.lost = () => { const l = D.lost_items.find((x) => x.id === S.overlay.id);
  return modal('Update lost item', `<p><strong>${esc(l.description)}</strong><br><span class="muted">${esc(l.rider_name)} · captain ${esc(l.driver_name)}</span></p><label class="field"><span>Status</span><select id="m-st">${[['open', 'Not started'], ['driver_contacted', 'Captain contacted'], ['returned', 'Returned'], ['closed', 'Closed']].map(([k, v]) => `<option value="${k}" ${l.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label><label class="field"><span>Note to the rider</span><textarea id="m-reason" placeholder="e.g. Captain has the bag and will drop it at 6 pm"></textarea></label>`, `<button class="btn ghost" data-act="close">Cancel</button><button class="btn primary" data-act="confirmlost">Save and notify</button>`); };
OVERLAYS.viewer = () => { const a = D.applicants.find((x) => x.id === S.reviews.sel), d = a.documents.find((x) => x.kind === S.overlay.kind), v = S.overlay;
  return modal(DOC[d.kind], `<div class="row"><button class="btn sm secondary" data-act="vrot">${ic('rotate', 16)}Rotate</button><button class="btn sm secondary" data-act="vzoom" data-arg="0.25">${ic('plus', 16)}Zoom in</button><button class="btn sm secondary" data-act="vzoom" data-arg="-0.25">${ic('minus', 16)}Zoom out</button><span class="small muted" style="margin-left:auto">${Math.round(v.zoom * 100)}%</span></div>
  <div class="viewer"><div style="transform:rotate(${v.rot}deg) scale(${v.zoom});transition:transform .2s;width:min(92%,640px)">${docThumb(d.kind, true)}</div></div>
  <div><strong class="small">Upload history</strong><ul class="blockers" style="margin-top:6px">${Array.from({ length: d.versions }, (_, i) => d.versions - i).map((n, i) => `<li class="${i ? 'todo' : 'done'}">${ic(i ? 'x' : 'doc', 16)}<span>Version ${n}${i ? ` · rejected: ${REASONS.blurry.toLowerCase()} · replaced ${ago(a.submitted_at)}` : ` · current · uploaded ${ago(a.submitted_at)}`}</span></li>`).join('')}</ul></div>`,
  `<button class="btn secondary bad" data-act="doc" data-arg="${d.kind}:rejected">Reject</button><button class="btn success" data-act="doc" data-arg="${d.kind}:accepted">Accept</button>`, true); };

/* ---------- actions ---------- */
const val = (id) => document.getElementById(id)?.value.trim() ?? '';
const open = (type, extra = {}) => { S.errors = {}; S.overlay = { type, ...extra }; render(); setTimeout(() => document.querySelector('.modal input, .modal select, .modal textarea, .drawer .icon-btn')?.focus(), 0); };
const close = () => { S.overlay = null; S.errors = {}; render(); };
const A = {
  go(arg) { const [v, sub] = arg.split(':'); S.view = v; S.navOpen = false; S.overlay = null; S.errors = {};
    if (v === 'safety' && sub) S.safety.tab = sub; if (v === 'safety' && !sub) S.safety.tab = 'sos';
    if (v === 'reviews' && sub) S.reviews.tab = sub; if (v === 'fares' && sub) S.fares.area = sub; if (v === 'zones' && sub) selectZone(sub);
    history.replaceState(null, '', '#' + v); render(); scrollTo(0, 0); },
  nav() { S.navOpen = !S.navOpen; render(); },
  theme() { S.theme = S.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = S.theme; render(); },
  signout() { S.view = 'signin'; render(); }, signin(_, e) { e.preventDefault(); A.go('overview'); },
  toast(arg) { toast(arg); }, close,
  dcat(a) { S.dispatch.cat = a; S.dispatch.sel = null; render(); }, donline(_, e) { S.dispatch.onlineOnly = e.target.checked; render(); }, dsel(a) { S.dispatch.sel = a || null; render(); },
  rstatus(a) { S.rides.status = a; render(); }, ride(a) { open('ride', { id: a }); },
  cancelride(a) { open('cancel', { id: a }); }, refund(a) { open('refund', { id: a }); },
  confirmcancel() { const reason = val('m-reason'); if (!reason) { S.errors = { m: 'Choose a reason. Both people see it.' }; return render(); }
    const r = D.rides.find((x) => x.id === S.overlay.id); r.status = 'cancelled'; r.payment_status = 'void'; audit('ride.cancelled_by_operator', `${r.id} · ${reason}`); close(); toast('Ride cancelled. Rider and captain were notified.'); },
  confirmrefund() { const r = D.rides.find((x) => x.id === S.overlay.id), max = r.payable_paise - r.refunded_paise, amt = Math.round(Number(val('m-amt')) * 100), reason = val('m-reason'), e = {};
    if (!(amt > 0) || amt > max) e.amt = `Enter between ₹1 and ${rupee(max)}.`; if (reason.length < 3) e.m = 'Give a short reason. The rider sees it.';
    if (Object.keys(e).length) { S.errors = e; return render(); }
    r.refunded_paise += amt; D.finance.refunds.unshift({ id: 'f' + Date.now(), rider: r.rider, amount_paise: amt, reason, created_at: new Date(D.now).toISOString() }); D.finance.totals.refunded_paise += amt;
    audit('refund.created', `${rupee(amt)} · ${r.rider}`); close(); toast(`${rupee(amt)} refunded to ${r.rider}'s wallet.`); },
  // reviews
  rtab(a) { S.reviews.tab = a; S.errors = {}; render(); }, rfilter(_, e) { S.reviews.area = e.target.value; render(); },
  rsel(a) { Object.assign(S.reviews, { sel: a, note: '', police: '', genderOk: false, pink: false, tried: false }); render(); },
  rarea(_, e) { D.applicants.find((x) => x.id === S.reviews.sel).area_id = e.target.value; render(); },
  rgender(_, e) { S.reviews.genderOk = e.target.checked; if (!e.target.checked) S.reviews.pink = false; render(); },
  rpink(_, e) { S.reviews.pink = e.target.checked; render(); },
  doc(arg) { const [kind, status] = arg.split(':'), a = D.applicants.find((x) => x.id === S.reviews.sel); if (a.claimed_by) return; const d = a.documents.find((x) => x.kind === kind);
    d.status = d.status === status && !S.overlay ? 'pending' : status; if (d.status !== 'rejected') d.reason = ''; if (S.overlay) S.overlay = null; render(); },
  docreason(arg, e) { D.applicants.find((x) => x.id === S.reviews.sel).documents.find((x) => x.kind === arg).reason = e.target.value; render(); },
  viewer(a) { open('viewer', { kind: a, zoom: 1, rot: 0 }); }, vrot() { S.overlay.rot = (S.overlay.rot + 90) % 360; render(); }, vzoom(a) { S.overlay.zoom = Math.min(3, Math.max(0.5, S.overlay.zoom + Number(a))); render(); },
  rdecide(kind) { const st = S.reviews, a = D.applicants.find((x) => x.id === st.sel); st.tried = true;
    if (kind === 'approved' && !blockersFor(a).every(([ok]) => ok)) { render(); return toast('Finish the items in “Before you can approve” first.'); }
    if (st.note.trim().length < 5) return render();
    const rej = a.documents.filter((d) => d.status === 'rejected');
    if (kind === 'sendback' && rej.some((d) => !d.reason)) { render(); return toast('Choose a reason for each rejected document.'); }
    a.status = kind === 'sendback' ? 'returned' : kind; audit(`driver.${kind === 'sendback' ? 'sent_back' : kind}`, `${a.name}${kind === 'sendback' ? ' · ' + rej.map((d) => DOC[d.kind]).join(', ') : ''}`);
    const next = D.applicants.filter((x) => x.status === 'pending').sort((p, q) => Date.parse(p.submitted_at) - Date.parse(q.submitted_at))[0];
    Object.assign(st, { sel: next?.id, note: '', police: '', genderOk: false, pink: false, tried: false }); render();
    toast(kind === 'approved' ? `${a.name} is approved and can go online.` : kind === 'sendback' ? `Sent back to ${a.name} with ${rej.length} fix${rej.length > 1 ? 'es' : ''}.` : `${a.name} is disabled.`); },
  change(arg) { const [tab, id, decision] = arg.split(':'), note = val('chg-' + id); if (note.length < 5) { S.errors = { ['chg-' + id]: true }; return render(); }
    const list = tab === 'vehicle' ? D.vehicle_changes : D.area_changes, i = list.findIndex((x) => x.id === id), c = list[i]; list.splice(i, 1); S.errors = {};
    audit(`driver.${tab}_change_${decision}`, c.name); render(); toast(`${cap(tab)} change ${decision} for ${c.name}.`); },
  sfilter(a) { S.scores.filter = a; render(); },
  stab(a) { S.safety.tab = a; render(); }, resolve(a) { open('resolve', { id: a }); },
  confirmresolve() { const note = val('m-reason'); if (note.length < 5) { S.errors = { m: 'Write at least 5 characters about what you did.' }; return render(); }
    const s = D.sos_events.find((x) => x.id === S.overlay.id); s.incident_status = 'closed'; s.resolution = note; audit('sos.resolved', s.rider_name); close(); toast('SOS resolved and recorded.'); },
  incident(id) { const note = val('inc-' + id); if (note.length < 5) { S.errors = { ['inc-' + id]: true }; return render(); }
    const i = D.incidents.find((x) => x.id === id); i.status = val('inc-st-' + id); i.resolution = note; S.errors = {}; audit('incident.updated', `${i.ride_id} · ${i.status}`); render(); toast('Response sent to the reporter.'); },
  ltab(a) { S.lost.tab = a; render(); }, lost(a) { open('lost', { id: a }); },
  confirmlost() { const l = D.lost_items.find((x) => x.id === S.overlay.id); l.status = val('m-st'); audit('lost_item.updated', `${l.description} · ${l.status}`); close(); toast('Saved. The rider was notified.'); },
  // zones
  zsel(a) { S.errors = {}; selectZone(a); if (a === 'new') S.zones.draft = null; render(); },
  znew() { S.zones.sel = 'new'; S.zones.draft = null; render(); },
  zdistrict(_, e) { const r = D.regions.find((x) => x.id === e.target.value); if (!r) return; const [a, b, c, d] = r.city;
    S.zones.draft = { id: '', catalog_id: r.id, name: r.district, state: r.state, min_lat: a, max_lat: b, min_lng: c, max_lng: d, base_paise: 2000, per_km_paise: 1000, minimum_paise: 2500, active: false, approval_reference: '', surge_cap: 1.5, surge_auto: false };
    S.zones.sel = 'draft'; S.zones.dirty = true; fitZoneView(); render(); },
  zcity() { const d = S.zones.draft, r = D.regions.find((x) => x.id === d.catalog_id); [d.min_lat, d.max_lat, d.min_lng, d.max_lng] = r.city; S.zones.dirty = true; fitZoneView(); render(); toast(`Zone set to ${r.district} city limits.`); },
  zdistrictfit() { const d = S.zones.draft, r = D.regions.find((x) => x.id === d.catalog_id); Object.assign(d, { min_lat: r.min_lat, max_lat: r.max_lat, min_lng: r.min_lng, max_lng: r.max_lng }); S.zones.dirty = true; fitZoneView(); render(); },
  zreset() { const id = S.zones.draft.id; if (id) selectZone(id); else A.znew(); render(); },
  zactive(_, e) { S.zones.draft.active = e.target.checked; S.errors = {}; render(); },
  zsave() { const d = S.zones.draft, chk = zoneChecks(d);
    if (d.active && !d.approval_reference.trim()) { S.errors = { zone: 'ref' }; render(); return document.getElementById('z-ref')?.focus(); }
    if (d.active && (chk.hitsActive.length || !chk.valid || !chk.fares)) return toast('Fix the items marked ✕ before opening bookings.');
    if (!d.name.trim() || !chk.valid) return toast('Give the zone a name and a valid boundary.');
    if (!d.id) { d.id = d.name.toLowerCase().replace(/\W+/g, '-'); D.areas.push(structuredClone(d)); } else Object.assign(D.areas.find((a) => a.id === d.id), structuredClone(d));
    audit('area.updated', `${d.name}${d.active ? ' · bookings open' : ' · inactive'}`); S.errors = {}; selectZone(d.id); render(); toast(`${d.name} saved. Existing quotes keep their price until they expire.`); },
  // fares
  farea(a) { S.fares.area = a; render(); }, ftrip(a) { S.fares.trip = a; render(); },
  fenable(cat, e) { const p = ensurePricing(cat); p.enabled = e.target.checked; render(); },
  fsave(cat) { if (cat === 'bike') { audit('area.updated', `${areaName(S.fares.area)} · bike fares`); return toast(`Bike fares saved for ${areaName(S.fares.area)}.`); } const p = ensurePricing(cat); if (p.enabled && !(p.per_km_paise > 0 && p.minimum_paise > 0)) return toast('Enter a per-km rate and a minimum fare before offering this vehicle.');
    p.pricing_version = (p.pricing_version ?? 0) + 1; audit('pricing.updated', `${areaName(S.fares.area)} · ${cat} · v${p.pricing_version}`); render(); toast(`${CATS[cat]} fares saved for ${areaName(S.fares.area)}.`); },
  // surge
  endsurge(id) { D.finance.surges = D.finance.surges.filter((s) => s.id !== id); audit('surge.ended', id); render(); toast('Override ended. Prices are back to normal.'); },
  startsurge() { const area = D.areas.find((a) => a.id === val('sg-area')), m = Number(val('sg-mult')), reason = val('sg-reason');
    if (reason.length < 3) { S.errors = { surge: 'Give a reason (3+ characters).' }; return render(); }
    if (!(m >= 1 && m <= area.surge_cap)) { S.errors = { surge: `Multiplier must be between 1 and ${area.name}'s cap of ${area.surge_cap}×.` }; return render(); }
    D.finance.surges.push({ id: 'u' + Date.now(), area: area.id, category: null, multiplier: m, reason, ends_at: new Date(D.now + Number(val('sg-mins')) * 60000).toISOString() }); S.errors = {}; audit('surge.started', `${area.name} · ${m}×`); render(); toast(`${m}× override running in ${area.name}.`); },
  sauto(id, e) { D.areas.find((a) => a.id === id).surge_auto = e.target.checked; },
  pday(a) { const n = Number(a); S.peakDays = S.peakDays.includes(n) ? S.peakDays.filter((x) => x !== n) : [...S.peakDays, n].sort(); render(); },
  delpeak(id) { D.finance.peak_windows = D.finance.peak_windows.filter((p) => p.id !== id); render(); toast('Peak hours removed.'); },
  addpeak() { const label = val('pk-label'); if (!label) { S.errors = { peak: 'Add a label.' }; return render(); } if (!S.peakDays.length) return toast('Pick at least one day.');
    D.finance.peak_windows.push({ id: 'w' + Date.now(), area: val('pk-area'), label, days: [...S.peakDays], start_time: val('pk-start'), end_time: val('pk-end'), multiplier: Number(val('pk-mult')) }); S.errors = {}; render(); toast('Peak hours added.'); },
  // money
  payout(arg) { const [id, mode] = arg.split(':'); open('payout', { id, mode }); },
  confirmpayout() { const p = D.finance.payouts.find((x) => x.id === S.overlay.id), ref = val('m-reason'), paid = S.overlay.mode === 'paid';
    if (paid && ref.length < 4) { S.errors = { m: 'Enter the UPI reference (at least 4 characters).' }; return render(); }
    if (!paid && ref.length < 3) { S.errors = { m: 'Give a reason the captain can act on.' }; return render(); }
    p.status = paid ? 'paid' : 'rejected'; p.reference = paid ? 'UPI ' + ref : ''; audit(`payout.${p.status}`, `${p.name} · ${rupee(p.amount_paise)}`); close(); toast(paid ? `${rupee(p.amount_paise)} to ${p.name} recorded as paid.` : `Payout rejected. ${p.name} was told why.`); },
  promooff(code) { D.finance.promos.find((p) => p.code === code).active = false; audit('promo.updated', `${code} · off`); render(); toast(`${code} turned off.`); },
  pkind(a) { S.promoKind = a; render(); },
  addpromo() { const code = val('pr-code').toUpperCase(), v = Number(val('pr-value'));
    if (!/^[A-Z0-9]{3,20}$/.test(code)) { S.errors = { promo: 'Use 3–20 letters or digits, no spaces.' }; return render(); }
    if (D.finance.promos.some((p) => p.code === code)) { S.errors = { promo: 'That code already exists.' }; return render(); }
    D.finance.promos.unshift({ code, description: val('pr-desc') || code, kind: S.promoKind, value: S.promoKind === 'flat' ? v * 100 : v, active: true, valid_to: new Date(D.now + 30 * 86400000).toISOString(), redemptions: 0, max_uses: null });
    S.errors = {}; audit('promo.created', code); render(); toast(`${code} is live.`); },
  afilter(a) { S.audit.filter = a; render(); },
};
function ensurePricing(cat) {
  let p = D.pricing.find((x) => x.area_id === S.fares.area && x.category === cat);
  if (!p) { p = { area_id: S.fares.area, category: cat, base_paise: 0, per_km_paise: 0, minimum_paise: 0, enabled: false, pricing_version: 0 }; D.pricing.push(p); }
  return p;
}

/* ---------- rendering + events ---------- */
function render() {
  const f = document.activeElement, id = f?.id, sel = id && 'selectionStart' in f ? [f.selectionStart, f.selectionEnd] : null;
  app.innerHTML = S.view === 'signin' ? signin() : shell();
  if (id) { const el = document.getElementById(id); if (el) { el.focus({ preventScroll: true }); if (sel) try { el.setSelectionRange(...sel); } catch { /* number inputs */ } } }
  if (S.view === 'zones' && S.zones.draft) bindZone();
  document.getElementById('topbar')?.classList.toggle('scrolled', scrollY > 4);
}
const setPath = (path, v) => { const keys = path.split('.'); let o = S; for (const k of keys.slice(0, -1)) o = o[k]; o[keys.at(-1)] = v; };

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act]'); if (!t) return;
  if (t.matches('.overlay') && e.target.closest('[data-stop]')) return; // clicks inside a dialog
  if (t.tagName === 'SELECT' || (t.tagName === 'INPUT' && t.type !== 'checkbox')) return;
  if (t.tagName === 'INPUT' && t.type === 'checkbox') return; // handled on change
  if (t.getAttribute('aria-disabled') === 'true' && t.dataset.act !== 'rdecide' && t.dataset.act !== 'zsave') return;
  const fn = A[t.dataset.act]; if (!fn) return;
  if (t.tagName === 'A') e.preventDefault();
  fn(t.dataset.arg ?? '', e);
});
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.act && A[t.dataset.act] && (t.tagName === 'SELECT' || t.type === 'checkbox')) return A[t.dataset.act](t.dataset.arg ?? '', e);
});
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.model) { setPath(t.dataset.model, t.value); if (t.dataset.live !== undefined) render(); return; }
  if (t.dataset.rupee) { if (t.value === '') return; const v = Math.round(Number(t.value) * 100); if (Number.isFinite(v) && v >= 0) { setPath(t.dataset.rupee, v); render(); } return; }
  if (t.dataset.fare) { if (t.value === '') return; const [cat, k] = t.dataset.fare.split(':'), v = Math.round(Number(t.value) * 100); if (Number.isFinite(v) && v >= 0) { (cat === 'bike' ? D.areas.find((a) => a.id === S.fares.area) : ensurePricing(cat))[k] = v; render(); } return; }
  if (t.dataset.coord) { const v = Number(t.value); if (t.value !== '' && Number.isFinite(v)) { S.zones.draft[t.dataset.coord] = v; S.zones.dirty = true; render(); } }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { if (S.overlay) close(); else if (S.navOpen) A.nav(); }
  if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); document.getElementById('global-q')?.focus(); }
  if (e.key === 'Enter' && document.activeElement.id === 'global-q') { S.rides.q = document.activeElement.value; S.rides.status = 'all'; A.go('rides'); document.getElementById('rides-q')?.focus(); }
  if (e.key === 'Enter' && document.activeElement.matches('tr.clickable')) document.activeElement.click();
  if (document.activeElement.id === 'zone-rect' && e.key.startsWith('Arrow')) {
    e.preventDefault(); const d = S.zones.draft, step = e.shiftKey ? 0.02 : 0.005;
    const [dl, dg] = { ArrowUp: [step, 0], ArrowDown: [-step, 0], ArrowLeft: [0, -step], ArrowRight: [0, step] }[e.key];
    d.min_lat += dl; d.max_lat += dl; d.min_lng += dg; d.max_lng += dg; S.zones.dirty = true; render();
  }
});
addEventListener('scroll', () => document.getElementById('topbar')?.classList.toggle('scrolled', scrollY > 4), { passive: true });
addEventListener('hashchange', () => { const v = location.hash.slice(1); if (v && v !== S.view && (VIEWS[v] || v === 'signin')) { S.view = v; S.overlay = null; render(); } });

// Chart tooltips
document.addEventListener('pointerover', (e) => {
  const g = e.target.closest('[data-tip]'); document.querySelectorAll('.tip').forEach((t) => t.remove()); if (!g) return;
  const tip = document.createElement('div'); tip.className = 'tip'; tip.innerHTML = g.dataset.tip; tip.style.left = '50%'; tip.style.top = g.dataset.y + '%'; g.append(tip);
});

// Zone editor dragging: moves the box live, then re-renders checks on release.
function bindZone() {
  const svg = document.getElementById('zone-map'); if (!svg) return;
  svg.addEventListener('pointerdown', (e) => {
    const mode = e.target.dataset.drag; if (!mode) return;
    e.preventDefault(); svg.setPointerCapture(e.pointerId);
    const vp = S.zones.vp, d = S.zones.draft, start = { ...d }, m = svg.getScreenCTM().inverse();
    const pt = (ev) => { const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m); return [p.x, p.y]; };
    const [sx, sy] = pt(e), latPer = (vp.maxLat - vp.minLat) / vp.H, lngPer = (vp.maxLng - vp.minLng) / vp.W, MIN = 0.01;
    const move = (ev) => {
      const [x, y] = pt(ev), dLat = -(y - sy) * latPer, dLng = (x - sx) * lngPer;
      if (mode === 'move') { d.min_lat = start.min_lat + dLat; d.max_lat = start.max_lat + dLat; d.min_lng = start.min_lng + dLng; d.max_lng = start.max_lng + dLng; }
      else {
        if (mode[0] === 'n') d.max_lat = Math.max(start.max_lat + dLat, d.min_lat + MIN); else d.min_lat = Math.min(start.min_lat + dLat, d.max_lat - MIN);
        if (mode[1] === 'e') d.max_lng = Math.max(start.max_lng + dLng, d.min_lng + MIN); else d.min_lng = Math.min(start.min_lng + dLng, d.max_lng - MIN);
      }
      for (const k of ['min_lat', 'max_lat', 'min_lng', 'max_lng']) d[k] = rnd4(d[k]);
      paintZone();
    };
    const up = () => { svg.removeEventListener('pointermove', move); svg.removeEventListener('pointerup', up); svg.removeEventListener('pointercancel', up); S.zones.dirty = true; render(); document.getElementById('zone-rect')?.focus({ preventScroll: true }); };
    svg.addEventListener('pointermove', move); svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
  });
}
function paintZone() {
  const d = S.zones.draft, r = rectPx(S.zones.vp, d), rect = document.getElementById('zone-rect');
  rect.setAttribute('x', r.x); rect.setAttribute('y', r.y); rect.setAttribute('width', r.w); rect.setAttribute('height', r.h);
  for (const g of document.querySelectorAll('[data-h]')) { const k = g.dataset.h, x = k[1] === 'w' ? r.x : r.x + r.w, y = k[0] === 'n' ? r.y : r.y + r.h; for (const c of g.children) { c.setAttribute('cx', x); c.setAttribute('cy', y); } }
  const [w, h] = sizeKm(d), size = document.getElementById('zone-size'); const ty = Math.max(4, r.y - 30); size.children[0].setAttribute('x', r.x + r.w / 2 - 60); size.children[0].setAttribute('y', ty); size.children[1].setAttribute('x', r.x + r.w / 2); size.children[1].setAttribute('y', ty + 16); size.children[1].textContent = `${w.toFixed(1)} × ${h.toFixed(1)} km`;
  document.getElementById('overlaps').innerHTML = zoneOverlaps();
  for (const k of ['min_lat', 'max_lat', 'min_lng', 'max_lng']) { const el = document.getElementById('z-' + k); if (el) el.value = d[k]; }
}

// Hooks for the validator.
window.hopAdmin = { views: Object.keys(VIEWS), go: (v) => A.go(v), state: S, data: D };
render();
})();
