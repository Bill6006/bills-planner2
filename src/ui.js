/* ==========================================================================
   UI
   Screens are functions that return HTML. One delegated listener per event
   type dispatches to ACTIONS / CHANGES / INPUTS by data attribute.
   ========================================================================== */
const BUILD = "2026.09.28";

/* ---------- small helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
class Html{ constructor(s){ this.s = s; } toString(){ return this.s; } }
const raw = s => new Html(String(s ?? ""));
// Booleans print as "true"/"false" so aria-checked="${on}" works; use ternaries for optional markup.
const toHtml = v => v == null ? "" : v instanceof Html ? v.s : Array.isArray(v) ? v.map(toHtml).join("") : esc(v);
function html(strings, ...vals){
  let out = strings[0];
  for(let i = 0; i < vals.length; i++) out += toHtml(vals[i]) + strings[i + 1];
  return new Html(out);
}
const attr = (name, on) => on ? raw(` ${name}`) : "";
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const MINUS = "−";
const money = n => E.fmtMoney(n).replace("-", MINUS);
function signed(n){
  const v = E.round2(n);
  if(v > 0) return "+" + money(v);
  if(v < 0) return MINUS + money(-v);
  return money(0);
}
const out$ = n => MINUS + money(Math.abs(n));
function fmtDay(ms){ const d = E.toDateObj(ms); return `${E.monthAbbr(d.m)} ${d.d}`; }
function fmtDayDow(ms){ const d = E.toDateObj(ms); return `${E.dowName(d.dow)}, ${E.monthAbbr(d.m)} ${d.d}`; }
function fmtRange(a, b){
  const A = E.toDateObj(a), B = E.toDateObj(b);
  return A.m === B.m ? `${E.monthAbbr(A.m)} ${A.d} – ${B.d}` : `${fmtDay(a)} – ${fmtDay(b)}`;
}
function monthLabel(mk){ const { y, m } = E.parseMonthKey(mk); return `${E.monthName(m)} ${y}`; }
function monthShortLabel(mk){ const { y, m } = E.parseMonthKey(mk); return `${E.monthAbbr(m)} ${y}`; }
function monthOnly(mk){ return E.monthName(E.parseMonthKey(mk).m); }
function dayLabel(ms, todayMs){
  const diff = Math.round((ms - todayMs) / E.DAY_MS);
  if(diff === 0) return "Today";
  if(diff === 1) return "Tomorrow";
  const d = E.toDateObj(ms);
  return `${E.dowName(d.dow)} ${E.monthAbbr(d.m)} ${d.d}`;
}
// The Bills Planner 4 name next to a renamed item, while "Show old names" is on.
const was = old => S.ui.showOldNames ? html`<span class="was" title="Called this in Bills Planner 4">${old}</span>` : "";
const stripDebt = n => String(n || "").replace(/^Debt: /, "");
const stripEvent = n => String(n || "").replace(/^Event: /, "");

/* ---------- icons (inline sprite, works offline) ---------- */
const ICONS = {
  home: '<path d="M3.5 11.5 12 4.5l8.5 7"/><path d="M5.5 10v9.5h13V10"/><path d="M10 19.5v-5h4v5"/>',
  ledger: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.6" cy="6.5" r="1.1"/><circle cx="4.6" cy="12" r="1.1"/><circle cx="4.6" cy="17.5" r="1.1"/>',
  receipt: '<path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2z"/><path d="M9 8.5h6M9 12h6M9 15.5h3.5"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  savings: '<ellipse cx="12" cy="6.5" rx="7" ry="2.8"/><path d="M5 6.5v5c0 1.6 3.1 2.8 7 2.8s7-1.2 7-2.8v-5"/><path d="M5 11.5v5c0 1.6 3.1 2.8 7 2.8s7-1.2 7-2.8v-5"/>',
  settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevL: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
  chevR: '<path d="M9.5 5.5 16 12l-6.5 6.5"/>',
  chevD: '<path d="M6 9.5l6 6 6-6"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  alert: '<path d="M12 4.5 2.8 19.5h18.4z"/><path d="M12 10.2v4.3M12 17.1v.2"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.2M12 7.9v.2"/>',
  flask: '<path d="M9.5 3.5h5M10.5 3.5v6L5 18.2a1.7 1.7 0 0 0 1.5 2.3h11a1.7 1.7 0 0 0 1.5-2.3L13.5 9.5v-6"/><path d="M7.6 14.5h8.8"/>',
  today: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3"/>',
  download: '<path d="M12 4.5v10.5M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>',
  upload: '<path d="M12 19.5V9M7.5 13.5 12 9l4.5 4.5M5 4.5h14"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
  wallet: '<path d="M4.5 8V7a2.5 2.5 0 0 1 2.5-2.5h10V8"/><rect x="3.5" y="8" width="17" height="12" rx="2.5"/><path d="M16 14h.01"/>',
  bank: '<path d="M3.5 9.5 12 4.5l8.5 5"/><path d="M5.5 10v8M9.8 10v8M14.2 10v8M18.5 10v8M3.5 20h17"/>',
  card: '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3 10h18M7 15h3.5"/>',
  chart: '<path d="M4.5 19.5h15"/><path d="M7.5 16v-5M12 16V7.5M16.5 16v-8"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>'
};
const iconSprite = () => `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${
  Object.entries(ICONS).map(([k, v]) => `<symbol id="i-${k}" viewBox="0 0 24 24">${v}</symbol>`).join("")
}</defs></svg>`;
const icon = (name, cls = "") => raw(`<svg class="i ${cls}" aria-hidden="true" focusable="false"><use href="#i-${name}"></use></svg>`);

/* ---------- model: everything derived from the saved data ---------- */
let rev = 0;
let modelCache = null;
function model(){
  const today = E.todayIso();
  if(modelCache && modelCache.rev === rev && modelCache.today === today) return modelCache;
  const D = S;
  const view = D.selectedMonth || E.currentMonthKey();
  const base = String(D.settings.baseMonth || view).trim();
  const horizon = Math.max(12, Number(D.settings?.savings?.timelineMonths || 6) + 2);
  const bi = E.monthIndex(base), vi = E.monthIndex(view);
  const rangeStart = bi <= vi ? base : view;
  const rangeEnd = bi <= vi ? view : base;
  const ctx = E.buildPlanRange(D, rangeStart, E.addMonthsKey(rangeEnd, horizon));
  const plan = ctx.plans.get(view) || E.placeholderPlan(D, view);
  const cache = new Map();
  modelCache = {
    rev, today, D, view, base, ctx, plan,
    todayMs: E.parseISOToMs(today),
    curMonth: today.slice(0,7),
    isCurrentMonth: view === today.slice(0,7),
    get(key, fn){ if(!cache.has(key)) cache.set(key, fn()); return cache.get(key); }
  };
  return modelCache;
}
function planFor(m, mk){
  return m.ctx.plans.get(mk) || m.get("plan|" + mk, () => E.buildPlanRange(m.D, mk, mk).plans.get(mk));
}
const payWindow = (m, shift) => m.get("pw|" + shift, () => E.pocketWindow(m.D, m.view, shift));
// The pay period the Overview leads with: the one holding today, or the one
// holding the 1st when you're looking at another month.
function heroPeriod(m){
  return m.get("hero", () => {
    const w = payWindow(m, true);
    const target = m.isCurrentMonth ? m.todayMs : E.monthStartMs(m.view);
    const p = w.periods.find(x => target >= x.start && target <= x.end)
      || w.periods.find(x => x.start >= E.monthStartMs(m.view));
    if(!p) return null;
    return {
      ...p,
      ctx: w.ctx,
      snap: E.extraSpendSnapshotForRange(m.D, p.start, p.end),
      containsToday: m.todayMs >= p.start && m.todayMs <= p.end,
      isFuture: p.start > m.todayMs,
      daysLeft: Math.round((p.end - m.todayMs) / E.DAY_MS) + 1
    };
  });
}
function ledgerDays(m, collapse){
  return m.get("ld|" + collapse, () => {
    const prev = E.addMonthsKey(m.view, -1);
    const extra = m.ctx.plans.get(prev) ? null : m.get("prevctx", () => E.buildPlanRange(m.D, prev, prev));
    return E.ledgerDays(m.D, m.ctx, m.view, S.ui.daysBeforeAfter ?? 3, collapse, extra);
  });
}
// Dated Bills-account and savings items in a window (for "Coming up").
function upcomingItems(m, days = 14, limit = 7){
  const start = m.isCurrentMonth ? m.todayMs : E.monthStartMs(m.view);
  const end = E.addDaysMs(start, days - 1);
  const items = [];
  for(let ms = start; ms <= end; ms = E.addDaysMs(ms, 1)){
    const row = planFor(m, E.isoDate(ms).slice(0,7))?.rows.find(r => r.ms === ms);
    if(!row) continue;
    if(row.isPayday) items.push({ ms, name: "Payday", sub: row.savingsIn > 0 ? `${money(row.savingsIn)} to savings` : "To the Bills account", amount: row.transferIn });
    for(const b of row.billItems) items.push({ ms, name: stripDebt(b.name), sub: b.debtId ? "Debt payment" : "", amount: -b.amount });
    for(const ev of row.eventItems) items.push({ ms, name: stripEvent(ev.name), sub: "From savings", amount: -ev.amount });
  }
  return { items: items.slice(0, limit), more: Math.max(0, items.length - limit), start, end };
}

/* ---------- state changes ---------- */
function dataChanged(){
  E.resetCache();
  rev++;
  saveState();
  if(saveFailed) toast("Couldn't save on this device. Export a backup from Settings.");
  requestRender();
}
function commit(mutate, opts = {}){
  const before = opts.undo ? dataSnapshot() : null;
  mutate(S);
  normalizeAll(S);
  dataChanged();
  if(opts.undo){
    toast(opts.undo, { action: "Undo", ms: 8000, onAction: () => { restoreData(before); normalizeAll(S); dataChanged(); } });
  }else if(opts.toast){
    toast(opts.toast);
  }
}
function setUI(patch){
  Object.assign(S.ui, patch);
  rev++;
  saveState();
  requestRender();
}
function setMonth(mk){
  if(!/^\d{4}-\d{2}$/.test(String(mk)) || mk === S.selectedMonth) return;
  S.selectedMonth = mk;
  rev++;
  saveState();
  requestRender();
}
function setPath(obj, path, value){
  const keys = path.split(".");
  let o = obj;
  for(let i = 0; i < keys.length - 1; i++){
    if(!o[keys[i]] || typeof o[keys[i]] !== "object") o[keys[i]] = {};
    o = o[keys[i]];
  }
  o[keys[keys.length - 1]] = value;
}

/* ---------- rendering ---------- */
const $app = document.getElementById("app");
const mqPhone = window.matchMedia("(max-width: 767.98px)");
const mqLight = window.matchMedia("(prefers-color-scheme: light)");
const THEME_COLORS = { light: "#f3f4f8", dark: "#0b1020", neon: "#06011a" };
let renderQueued = false;
// Next frame, with a timer fallback for when a browser pauses animation frames.
function requestRender(){
  if(renderQueued) return;
  renderQueued = true;
  const run = () => { if(!renderQueued) return; renderQueued = false; renderNow(); };
  requestAnimationFrame(run);
  setTimeout(run, 60);
}
function renderNow(){
  applyTheme();
  const focus = captureFocus();
  $app.innerHTML = layout(model()).s;
  restoreFocus(focus);
}
function captureFocus(){
  const el = document.activeElement;
  if(!el || el === document.body || !$app.contains(el)) return null;
  const key = el.id || el.dataset.focus;
  if(!key) return null;
  let sel = null;
  try{ sel = [el.selectionStart, el.selectionEnd]; }catch(_){}
  return { key, byId: !!el.id, sel };
}
function restoreFocus(f){
  if(!f) return;
  const el = f.byId ? document.getElementById(f.key) : $app.querySelector(`[data-focus="${CSS.escape(f.key)}"]`);
  if(!el) return;
  el.focus({ preventScroll: true });
  if(f.sel && f.sel[0] != null){ try{ el.setSelectionRange(f.sel[0], f.sel[1]); }catch(_){} }
}
function resolvedTheme(){
  const t = S.ui.theme;
  return t === "system" ? (mqLight.matches ? "light" : "dark") : (THEME_COLORS[t] ? t : "dark");
}
function applyTheme(){
  const t = resolvedTheme();
  const root = document.documentElement;
  if(root.dataset.theme !== t) root.dataset.theme = t;
  const meta = document.querySelector('meta[name="theme-color"]');
  if(meta) meta.content = THEME_COLORS[t];
}

/* ---------- routing (hash, so the phone's Back button works) ---------- */
const TABS = [
  { id: "overview", label: "Overview", icon: "home" },
  { id: "ledger", label: "Ledger", icon: "ledger" },
  { id: "spending", label: "Spending", icon: "receipt" },
  { id: "plan", label: "Plan", icon: "calendar" },
  { id: "savings", label: "Savings", icon: "savings" }
];
const TAB_TITLES = { overview: "Overview", ledger: "Ledger", spending: "Spending", plan: "Plan", savings: "Savings", settings: "Settings" };
function parseHash(){
  const [tab, sub] = location.hash.replace(/^#\/?/, "").split("/");
  return { tab: TAB_TITLES[tab] ? tab : null, sub: sub || null };
}
function syncFromHash(){
  const { tab, sub } = parseHash();
  if(!tab) return;
  const changed = tab !== S.ui.tab || (tab === "plan" && sub && sub !== S.ui.planTab);
  if(!changed) return;
  S.ui.tab = tab;
  if(tab === "plan" && sub) S.ui.planTab = sub;
  rev++;
  saveState();
  renderNow();
  window.scrollTo(0, 0);
}
function navTo(tab, sub){
  const h = "#" + tab + (sub ? "/" + sub : "");
  if(location.hash === h) return window.scrollTo({ top: 0, behavior: "smooth" });
  location.hash = h;
}

/* ---------- overlays: bottom sheets on phones, dialogs on wider screens ---------- */
let overlay = null;
function openSheet({ title, body, foot, onMount, onClose }){
  closeOverlay(true);
  const wrap = document.createElement("div");
  wrap.className = "overlay";
  wrap.innerHTML = `<div class="scrim" data-action="close-overlay"></div>
    <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" tabindex="-1">
      <div class="grab" aria-hidden="true"></div>
      <div class="sheet-h"><h2 class="sheet-t" id="sheet-title">${esc(title)}</h2>
        <button type="button" class="icon-btn" data-action="close-overlay" aria-label="Close">${icon("x")}</button></div>
      <div class="sheet-body">${toHtml(body)}</div>
      ${foot ? `<div class="sheet-foot">${toHtml(foot)}</div>` : ""}
    </section>`;
  document.getElementById("overlay-root").appendChild(wrap);
  document.body.classList.add("no-scroll");
  overlay = { el: wrap, onClose, prevFocus: document.activeElement };
  if(!(history.state && history.state.bpOverlay)) history.pushState({ bpOverlay: true }, "");
  const sheet = wrap.querySelector(".sheet");
  onMount?.(sheet);
  const first = sheet.querySelector("[autofocus]");
  (first || sheet).focus({ preventScroll: true });
  return sheet;
}
function dismissOverlay(){
  if(!overlay) return;
  const o = overlay;
  overlay = null;
  o.el.remove();
  document.body.classList.remove("no-scroll");
  o.onClose?.();
  try{ if(o.prevFocus && document.contains(o.prevFocus)) o.prevFocus.focus({ preventScroll: true }); }catch(_){}
}
// `then` runs after the Back step settles, so a follow-up navigation can't be undone by it.
function closeOverlay(silent, then){
  if(!overlay){ then?.(); return; }
  dismissOverlay();
  if(!silent && history.state && history.state.bpOverlay){
    if(then){
      const once = () => { window.removeEventListener("popstate", once); then(); };
      window.addEventListener("popstate", once);
    }
    history.back();
  }else{
    then?.();
  }
}
window.addEventListener("popstate", () => { if(overlay) dismissOverlay(); });
function trapFocus(e){
  const sheet = overlay?.el.querySelector(".sheet");
  if(!sheet) return;
  const f = [...sheet.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(x => !x.disabled && x.offsetParent !== null);
  if(!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if(e.shiftKey && (document.activeElement === first || document.activeElement === sheet)){ e.preventDefault(); last.focus(); }
  else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
}

/* ---------- toasts ---------- */
function toast(msg, { action, onAction, ms = 5000 } = {}){
  const root = document.getElementById("toast-root");
  const el = document.createElement("div");
  el.className = "toast";
  el.setAttribute("role", "status");
  el.innerHTML = `<span class="grow">${esc(msg)}</span>${action ? `<button type="button">${esc(action)}</button>` : ""}`;
  root.appendChild(el);
  const timer = setTimeout(() => el.remove(), ms);
  if(action){
    el.querySelector("button").addEventListener("click", () => { clearTimeout(timer); el.remove(); onAction?.(); });
  }
  while(root.children.length > 2) root.firstElementChild.remove();
}

/* ==========================================================================
   Layout
   ========================================================================== */
function layout(m){
  const tab = S.ui.tab || "overview";
  const current = id => attr('aria-current="page"', id === tab);
  return html`
  <div class="shell">
    <nav class="sidebar" aria-label="Main">
      <div class="brand"><span class="brand-mark">${icon("wallet")}</span>Bills Planner</div>
      ${TABS.map(t => html`<button type="button" class="nav-item" data-action="nav" data-tab="${t.id}"${current(t.id)}>${icon(t.icon)}${t.label}</button>`)}
      <div class="grow"></div>
      <button type="button" class="nav-item" data-action="nav" data-tab="settings"${current("settings")}>${icon("settings")}Settings</button>
      <div class="side-foot">Saved on this device</div>
    </nav>
    <div class="main">
      ${topbar(m, tab)}
      <div class="banner-area">${banners()}</div>
      <main class="page" id="page">${pageFor(m, tab)}</main>
    </div>
    <nav class="tabbar" aria-label="Main">
      ${TABS.map(t => html`<button type="button" class="tab" data-action="nav" data-tab="${t.id}"${current(t.id)}>${icon(t.icon)}<span>${t.label}</span></button>`)}
    </nav>
    ${tab !== "settings" ? html`<button type="button" class="fab" data-action="log-spend">${icon("plus")}<span>Log spending</span></button>` : ""}
  </div>`;
}
function topbar(m, tab){
  return html`<header class="topbar">
    <h1 class="page-title">${TAB_TITLES[tab]}</h1>
    <div class="month-switch${m.isCurrentMonth ? "" : " compact"}">
      <button type="button" class="icon-btn" data-action="month-step" data-step="-1" aria-label="Previous month">${icon("chevL")}</button>
      <label class="month-label"><span class="ml-long">${monthLabel(m.view)}</span><span class="ml-short">${monthShortLabel(m.view)}</span>${icon("chevD", "sm")}<input type="month" id="month-input" value="${m.view}" data-change="month-pick" data-action="month-open" aria-label="Choose a month"></label>
      <button type="button" class="icon-btn" data-action="month-step" data-step="1" aria-label="Next month">${icon("chevR")}</button>
    </div>
    ${m.isCurrentMonth ? "" : html`<button type="button" class="icon-btn" data-action="month-today" aria-label="Back to this month" title="Back to this month">${icon("today")}</button>`}
    <div class="spacer"></div>
    <button type="button" class="icon-btn desk-only" data-action="whatif-toggle" aria-pressed="${whatIfActive()}" aria-label="What-if mode" title="What-if mode">${icon("flask")}</button>
    <button type="button" class="btn primary desk-only" data-action="log-spend">${icon("plus")}Log spending</button>
    <button type="button" class="icon-btn phone-only" data-action="nav" data-tab="settings" aria-label="Settings"${attr('aria-current="page"', tab === "settings")}>${icon("settings")}</button>
  </header>`;
}
function banners(){
  const out = [];
  if(whatIfActive()){
    out.push(html`<div class="banner warn" role="status">${icon("flask")}<div class="grow"><b>What-if mode.</b> Changes aren't saved until you keep them.
      <div class="actions"><button type="button" class="btn small primary" data-action="whatif-keep">Keep changes</button><button type="button" class="btn small" data-action="whatif-discard">Discard</button></div></div></div>`);
  }
  if(saveFailed){
    out.push(html`<div class="banner danger">${icon("alert")}<div class="grow">Your latest changes couldn't be saved on this device. Export a backup from Settings.</div></div>`);
  }
  return out;
}
function pageFor(m, tab){
  switch(tab){
    case "ledger": return viewLedger(m);
    case "spending": case "plan": case "savings": return viewSoon(tab);
    case "settings": return viewSettings(m);
    default: return viewOverview(m);
  }
}

/* ==========================================================================
   Overview
   ========================================================================== */
function viewOverview(m){
  return html`
    ${rollPrompt(m)}
    <div class="ov">
      <div class="ov-col">${heroCard(m)}${budgetsCard(m)}${upcomingCard(m)}</div>
      <div class="ov-col">${acctCard(m)}${periodsCard(m, "ov")}${snapCard(m)}</div>
    </div>
    <div style="margin-top:14px">${statsCard(m)}</div>`;
}
function rollPrompt(m){
  const base = String(m.D.settings.baseMonth || "");
  if(!base || E.monthIndex(m.curMonth) <= E.monthIndex(base) || S.ui.rollPromptDismissed === m.curMonth) return "";
  return html`<div class="banner" style="margin-bottom:14px">${icon("calendar")}<div class="grow"><b>It's ${monthOnly(m.curMonth)}.</b> Your plan still starts in ${monthLabel(base)}. Move the starting point to ${monthOnly(m.curMonth)} so balances start from this month.
    <div class="actions"><button type="button" class="btn small primary" data-action="roll-open" data-month="${m.curMonth}">Update starting point</button><button type="button" class="btn small" data-action="roll-dismiss">Not now</button></div></div></div>`;
}
function heroCard(m){
  const p = heroPeriod(m);
  if(!p){
    return html`<section class="card hero"><div class="eyebrow">Spending money</div>
      <div class="empty" style="margin-top:8px"><p>Add your pay schedule to see how much you can spend each pay period.</p>
      <button type="button" class="btn primary" data-action="nav" data-tab="plan" data-sub="income">Set up pay</button></div></section>`;
  }
  const eyebrow = p.containsToday ? "This pay period" : p.isFuture ? "Upcoming pay period" : "Pay period";
  const spentPct = p.base > 0 ? clamp(p.loggedSpent / p.base * 100, 0, 100) : (p.loggedSpent > 0 ? 100 : 0);
  const plannedPct = p.base > 0 ? clamp(p.planned / p.base * 100, 0, 100) : 0;
  const t = p.threshold;
  return html`<section class="card hero" aria-labelledby="hero-t">
    <div class="hero-top"><span class="eyebrow" id="hero-t">${eyebrow}</span>
      <span class="hero-range">${fmtRange(p.start, p.end)}${p.containsToday ? ` · ${p.daysLeft} ${p.daysLeft === 1 ? "day" : "days"} left` : ""}</span></div>
    <div class="hero-nums">
      <div><div class="hero-lbl">${p.containsToday ? "Available now" : "Available"}</div><div class="big${p.available < 0 ? " neg" : ""}">${money(p.available)}</div></div>
      <div><div class="hero-lbl">Free after budgets</div><div class="big ${p.freeAfterBudgets < 0 ? "neg" : "pos"}">${money(p.freeAfterBudgets)}</div></div>
    </div>
    <div class="meter" role="img" aria-label="${money(p.loggedSpent)} spent of ${money(p.base)}">
      <span class="${p.spentOver ? "over" : ""}" style="width:${spentPct.toFixed(1)}%"></span>
      ${plannedPct > 0 ? html`<i class="mark" style="left:${plannedPct.toFixed(1)}%" title="Budgeted"></i>` : ""}
    </div>
    <div class="hero-meta">${money(p.loggedSpent)} spent of ${money(p.base)} spending money${was("Pocket base")}</div>
    ${t ? html`<button type="button" class="hero-warn" data-action="open-breakdown" data-key="${p.key}">${icon("alert", "sm")}<span class="grow">${t.mode === "base" ? "Spending money" : "Free after budgets"} is ${money(t.shortBy)} under your ${money(t.minimum)} minimum</span><span>Why</span></button>` : ""}
    <div class="hero-actions">
      <button type="button" class="btn primary" data-action="log-spend">${icon("plus")}Log spending</button>
      <button type="button" class="btn" data-action="open-breakdown" data-key="${p.key}">Breakdown</button>
    </div>
  </section>`;
}
function budgetRow(it){
  const misc = E.isMiscExtraId(it.id);
  const budget = Math.max(0, Number(it.budget || 0));
  const spent = Number(it.spent || 0);
  const pct = budget > 0 ? clamp(spent / budget * 100, 0, 100) : (spent > 0 ? 100 : 0);
  const over = it.remaining < -0.004;
  const near = !over && budget > 0 && spent >= budget * 0.9;
  return html`<div class="bud">
    <div class="bud-top"><span class="bud-name">${it.name}${misc ? html`<span class="muted" style="font-weight:500"> · unbudgeted</span>` : ""}</span><span class="bud-amt">${money(spent)} / ${money(budget)}</span></div>
    <div class="bar${over ? " over" : near ? " near" : ""}"><span style="width:${pct.toFixed(1)}%"></span></div>
    <div class="bud-left${over ? " neg" : ""}">${over ? `${money(-it.remaining)} over` : `${money(it.remaining)} left`}${it.transferNet ? ` · ${signed(it.transferNet)} moved` : ""}</div>
  </div>`;
}
function budgetsCard(m){
  const p = heroPeriod(m);
  const items = p ? p.snap.items : [];
  let body;
  if(!p) body = html`<p class="card-sub">Budgets show up once your pay schedule is set.</p>`;
  else if(!items.length) body = html`<div class="empty"><p>Plan your spending money with budgets like groceries or gas.</p><button type="button" class="btn small" data-action="nav" data-tab="plan" data-sub="budgets">Add budgets</button></div>`;
  else body = items.map(budgetRow);
  return html`<section class="card budgets">
    <div class="card-h"><div><h2 class="card-t">${icon("wallet")}Budgets${was("Extra costs")}</h2>${p ? html`<div class="card-sub">${fmtRange(p.start, p.end)}</div>` : ""}</div>
      <button type="button" class="link-btn" data-action="nav" data-tab="spending">Spending${icon("chevR", "sm")}</button></div>
    ${body}
  </section>`;
}
function upcomingCard(m){
  const u = upcomingItems(m);
  const title = m.isCurrentMonth ? "Coming up" : `Start of ${monthOnly(m.view)}`;
  return html`<section class="card upcoming">
    <div class="card-h"><h2 class="card-t">${icon("calendar")}${title}</h2><button type="button" class="link-btn" data-action="nav" data-tab="ledger">Ledger${icon("chevR", "sm")}</button></div>
    ${u.items.length ? html`<ul class="up-list">${u.items.map(it => html`<li class="up">
        <span class="up-date">${dayLabel(it.ms, m.todayMs)}</span>
        <span class="up-name">${it.name}${it.sub ? html`<span class="up-sub">${it.sub}</span>` : ""}</span>
        <span class="up-amt${it.amount > 0 ? " pos" : ""}">${signed(it.amount)}</span></li>`)}</ul>
        ${u.more ? html`<p class="card-sub" style="margin-top:8px">${u.more} more in the next two weeks. See the ledger for all of them.</p>` : ""}`
      : html`<p class="card-sub">Nothing due in the next two weeks.</p>`}
  </section>`;
}
function acctCard(m){
  const p = m.plan;
  const head = html`<div class="card-h"><h2 class="card-t">${icon("bank")}Bills account</h2><button type="button" class="link-btn" data-action="nav" data-tab="ledger">Ledger${icon("chevR", "sm")}</button></div>`;
  if(p.__invalid || !p.paydays.length){
    return html`<section class="card acct">${head}<div class="empty"><p>Add your pay schedule and bills to plan the Bills account.</p><button type="button" class="btn small" data-action="nav" data-tab="plan" data-sub="income">Set up pay</button></div></section>`;
  }
  const cushion = Number(m.D.settings.cushion || 0);
  const dips = p.lowestBillsBal < cushion - 0.005;
  const next = monthOnly(E.addMonthsKey(m.view, 1));
  return html`<section class="card acct">${head}
    <div class="kv"><span class="k">Transfer each payday${was("Fixed transfer")}</span><span class="v">${money(p.billsPerPaycheck)}</span>
      <span class="s">On ${p.paydays.length} ${p.paydays.length === 1 ? "payday" : "paydays"} in ${monthOnly(m.view)}</span></div>
    <div class="kv"><span class="k">Lowest balance</span><span class="v${dips ? " neg" : ""}">${money(p.lowestBillsBal)}</span>
      <span class="s">${p.lowestBillsBalDate ? fmtDayDow(p.lowestBillsBalDate) : ""} · cushion ${money(cushion)}${dips ? " · dips below your cushion" : ""}</span></div>
    <div class="kv"><span class="k">Month end</span><span class="v">${money(p.endBills)}</span>
      <span class="s">${next} needs ${money(p.TargetCarry)} before its first payday${was("Target carry")}</span></div>
    ${p.topup > 0.004 ? html`<div class="banner warn" style="margin-top:12px">${icon("info")}<div class="grow">Add <b>${money(p.topup)}</b> to the Bills account at the start of ${monthOnly(m.view)} to stay on plan.</div></div>` : ""}
  </section>`;
}
function payWarn(w){
  if(!w.warn) return "";
  const text = w.warn.kind === "consumed"
    ? `Spending money is ${money(w.warn.maxBase)} because transfers use the whole paycheck (${money(w.warn.cap)}): savings ${money(w.warn.savings)} + bills ${money(w.warn.bills)} = ${money(w.warn.required)}. Budgets will push free money below zero.`
    : `Spending money goes below zero in at least one pay period (as low as ${money(w.warn.minBase)}). Transfers are bigger than the paycheck there.`;
  return html`<div class="banner warn" style="margin-bottom:10px">${icon("alert")}<div class="grow">${text}</div></div>`;
}
function ppRow(m, p){
  const now = m.todayMs >= p.start && m.todayMs <= p.end;
  const low = !!p.threshold;
  return html`<button type="button" class="pp${now ? " now" : ""}${low ? " low" : ""}" data-action="open-breakdown" data-key="${p.key}" data-focus="pp-${p.key}">
    <span class="pp-dates">${fmtRange(p.start, p.end)}${now ? html`<span class="badge now">Now</span>` : ""}${low ? html`<span class="badge low">Below minimum</span>` : ""}</span>
    <span class="pp-money"><b class="${p.freeAfterBudgets < 0 ? "neg" : ""}">${money(p.freeAfterBudgets)}</b> <span class="muted">/ ${money(p.base)}</span></span>
    <span class="pp-names">${p.names.length ? p.names.join(" · ") : "No budgets"}</span>
    <span class="pp-spent${p.spentOver ? " neg" : ""}">spent ${money(p.loggedSpent)}</span>
  </button>`;
}
function periodsCard(m, where){
  const shift = S.ui.pocketShiftBackOne !== false;
  const w = payWindow(m, shift);
  return html`<section class="card periods">
    <div class="card-h"><h2 class="card-t">${icon("wallet")}Pay periods${was("Pocket leftover")}</h2></div>
    <div class="pp-tools">
      <span class="toggle-row"><button type="button" class="switch" role="switch" aria-checked="${shift}" data-action="toggle-shift" aria-labelledby="lbl-shift-${where}" data-focus="shift-${where}"></button><span id="lbl-shift-${where}">Include last pay period</span></span>
    </div>
    ${payWarn(w)}
    ${w.periods.length
      ? html`<div class="pp-legend"><span>Free after budgets</span><span>/</span><span>Spending money</span></div>${w.periods.map(p => ppRow(m, p))}`
      : html`<p class="card-sub">No paydays yet. Add your pay schedule to see each pay period.</p>`}
  </section>`;
}
function snapCard(m){
  const s = m.D.settings;
  const goal = Number(s.savings?.monthlyGoal || 0);
  const startSav = m.plan.__invalid ? E.projectedSavingsAtMonthStart(m.D, m.view) : m.plan.startSavings;
  const upcomingEv = E.allEventsList(m.D)
    .map(x => ({ x, iso: E.normalizeISODateLoose(x?.rule?.anchor || x?.date || "") }))
    .filter(o => o.iso && o.iso >= m.today)
    .sort((a, b) => a.iso.localeCompare(b.iso))[0];
  const debt = E.debtSummary(m.D);
  const nextDebt = debt.active
    .map(d => ({ d, iso: E.debtNextDueIso(d) }))
    .sort((a, b) => a.iso.localeCompare(b.iso))[0];
  return html`<section class="card snap">
    <div class="card-h"><h2 class="card-t">${icon("savings")}Savings</h2><button type="button" class="link-btn" data-action="nav" data-tab="savings">Savings${icon("chevR", "sm")}</button></div>
    <div class="kv"><span class="k">At the start of ${monthOnly(m.view)}</span><span class="v">${money(startSav)}</span>
      <span class="s">${goal > 0 ? `Adding ${money(goal)} a month (${money(m.plan.savingsPerPaycheck || 0)} per payday)` : "No monthly savings goal yet"}</span></div>
    ${upcomingEv ? html`<div class="kv"><span class="k">Next withdrawal</span><span class="v">${out$(upcomingEv.x.amount)}</span>
      <span class="s">${fmtDayDow(E.parseISOToMs(upcomingEv.iso))} · ${stripEvent(upcomingEv.x.name)}</span></div>` : ""}
    <div class="card-h" style="margin:16px 0 10px"><h2 class="card-t">${icon("card")}Debt</h2><button type="button" class="link-btn" data-action="nav" data-tab="plan" data-sub="debts">Debts${icon("chevR", "sm")}</button></div>
    ${debt.active.length ? html`
      <div class="kv"><span class="k">Left to pay</span><span class="v">${money(debt.totalBalance)}</span>
        <span class="s">${money(debt.monthlyTotal)} a month · ${E.debtMonthsLabel(debt.longestMonths)}</span></div>
      ${nextDebt ? html`<div class="kv"><span class="k">Next payment</span><span class="v">${money(E.debtPayoffCalc(nextDebt.d).payment)}</span>
        <span class="s">${fmtDayDow(E.parseISOToMs(nextDebt.iso))} · ${nextDebt.d.name}</span></div>` : ""}`
      : html`<p class="card-sub">No debts tracked.</p>`}
  </section>`;
}

const STAT_DEFS = {
  startBalance: { label: "Bills balance at month start", old: "Start balance", help: "What the Bills account starts the month with, including any top-up.",
    sub: (st, p) => `Carried in ${money(p.TB2_at_start)}${p.topup > 0.004 ? ` + ${money(p.topup)} top-up` : ""}` },
  fixedTransfer: { label: "Transfer to Bills per payday", old: "Fixed transfer", help: "Moved from each paycheck into the Bills account.",
    sub: st => `On ${st._paydayCount} ${st._paydayCount === 1 ? "payday" : "paydays"}` },
  targetCarry: { label: "Carry into next month", old: "Target carry (AS2)", help: "What next month needs before its first payday.",
    sub: (st, p, m) => `For ${monthOnly(E.addMonthsKey(m.view, 1))}'s early bills` },
  monthBillsTotal: { label: "Bills this month", old: "Bills total", help: "Every scheduled bill, debt payments included.", sub: () => "Debt payments included" },
  monthBillsPlusPocket: { label: "Bills and budgets", old: "Bills + pocket costs", help: "Bills plus planned budget spending.", sub: () => "Bills plus planned budgets" },
  lowestBillsBalance: { label: "Lowest Bills balance", old: "Lowest projected", help: "The lowest the Bills account gets this month.",
    sub: st => st._lowestDate ? fmtDayDow(st._lowestDate) : "—" },
  as2: { label: "Needed before first payday", old: "AS2", help: "Cushion plus bills due before the month's first payday.", sub: () => "Cushion + early bills" },
  tb2: { label: "Starting Bills balance", old: "TB2", help: "Carried over from last month's end.", sub: () => "From last month's end" },
  eomBills: { label: "Bills balance at month end", old: "End-of-month Bills", help: "Becomes next month's starting balance.", sub: () => "Becomes next month's start" },
  pocketMonth: { label: "Spending money left", old: "Pocket leftover", help: "Paychecks minus transfers and planned budgets, for the month.", sub: () => "After transfers and budgets" }
};
function statsCard(m){
  const st = E.monthStats(m.D, m.plan);
  const keys = (S.ui.statsShown || []).filter(k => STAT_DEFS[k]);
  return html`<details class="card stats" data-toggle="statsOpen"${attr("open", !!S.ui.statsOpen)}>
    <summary><span class="card-t">${icon("chart")}Month details</span><span class="chev">${icon("chevD")}</span></summary>
    ${keys.length ? html`<div class="stats-grid">${keys.map(k => html`<div class="stat"><div class="k">${STAT_DEFS[k].label}${was(STAT_DEFS[k].old)}</div>
        <div class="v">${money(st[k])}</div><div class="s">${STAT_DEFS[k].sub(st, m.plan, m)}</div></div>`)}</div>`
      : html`<p class="card-sub" style="margin-top:10px">No numbers chosen.</p>`}
    <div style="margin-top:12px"><button type="button" class="btn small" data-action="choose-stats">Choose what shows</button></div>
  </details>`;
}

/* ==========================================================================
   Ledger
   ========================================================================== */
function dayParts(r){
  const parts = [];
  if(r.isPayday) parts.push({ text: "Payday transfer" });
  for(const b of r.billItems) parts.push({ text: stripDebt(b.name), amt: -b.amount });
  for(const ev of r.eventItems) parts.push({ text: `${stripEvent(ev.name)} (from savings)`, amt: -ev.amount });
  return parts;
}
function viewLedger(m){
  const p = m.plan;
  const collapse = !!S.ui.collapseEmpty;
  const days = ledgerDays(m, collapse);
  const list = mqPhone.matches || S.ui.ledgerView === "cards";
  const cushion = Number(m.D.settings.cushion || 0);
  const todayShown = days.length && m.todayMs >= days[0].ms && m.todayMs <= days[days.length - 1].ms;
  const head = html`<section class="card">
    <div class="mini-stats">
      <div class="ms"><span class="k">Per payday</span><span class="v">${money(p.billsPerPaycheck)}</span></div>
      <div class="ms${p.lowestBillsBal < cushion - 0.005 ? " warn" : ""}"><span class="k">Lowest${p.lowestBillsBalDate ? ` · ${fmtDay(p.lowestBillsBalDate)}` : ""}</span><span class="v">${money(p.lowestBillsBal)}</span></div>
      <div class="ms"><span class="k">Month end</span><span class="v">${money(p.endBills)}</span></div>
      <div class="ms"><span class="k">Cushion</span><span class="v">${money(cushion)}</span></div>
    </div>
    <div class="ledger-bar">
      <span class="toggle-row"><button type="button" class="switch" role="switch" aria-checked="${collapse}" data-action="toggle-ui" data-key="collapseEmpty" aria-labelledby="lbl-collapse" id="sw-collapse"></button><span id="lbl-collapse">Activity only</span></span>
      <span class="spacer"></span>
      ${mqPhone.matches ? "" : html`<div class="seg" role="group" aria-label="Ledger layout">
        <button type="button" data-action="set-ledger-view" data-view="table" aria-pressed="${!list}">Table</button>
        <button type="button" data-action="set-ledger-view" data-view="cards" aria-pressed="${list}">List</button></div>`}
      ${todayShown ? html`<button type="button" class="btn small" data-action="jump-today">${icon("today", "sm")}Today</button>` : ""}
    </div>
  </section>`;
  if(p.__invalid || !days.length){
    return html`${head}<section class="card" style="margin-top:14px"><div class="empty"><p>Add your pay schedule and bills to see the Bills account day by day.</p>
      <button type="button" class="btn primary" data-action="nav" data-tab="plan" data-sub="income">Set up pay</button></div></section>`;
  }
  return html`${head}<div class="ledger-layout" style="margin-top:14px">
    <div>${list ? ledgerList(m, days) : ledgerTable(m, days)}</div>
    <aside class="ledger-aside">${periodsCard(m, "ledger")}</aside>
  </div>`;
}
// Month labels between groups, and a "Today" line where hidden days would be.
function ledgerGroups(m, days, rowFn, sepFn, todayFn){
  const multi = days.some(d => d.isPrev || d.isNext);
  const out = [];
  let lastMonth = null, prevMs = null;
  for(const d of days){
    if(multi && d.dayMonth !== lastMonth) out.push(sepFn(monthLabel(d.dayMonth) + (d.beforeStart ? " · before your plan starts" : "")));
    if(prevMs != null && prevMs < m.todayMs && d.ms > m.todayMs) out.push(todayFn());
    out.push(rowFn(d));
    lastMonth = d.dayMonth;
    prevMs = d.ms;
  }
  return out;
}
function ledgerTable(m, days){
  const lowDate = m.plan.lowestBillsBalDate;
  const row = d => {
    const r = d.row;
    const bal = r.billsBalanceWorking ?? r.billsBalance;
    const d0 = E.toDateObj(d.ms);
    const parts = dayParts(r);
    const cls = [d.ms === m.todayMs ? "today" : "", (d.isPrev || d.isNext) ? "other" : ""].filter(Boolean).join(" ");
    return html`<tr id="d-${E.isoDate(d.ms)}"${cls ? raw(` class="${cls}"`) : ""}>
      <td class="d-date"><b>${E.dowName(d0.dow)}</b>${E.monthAbbr(d0.m)} ${d0.d}${d.isPayday ? html` <span class="badge pay">Payday</span>` : ""}</td>
      <td>${parts.length ? html`<div class="act">${parts.map(x => html`<span>${x.text}${x.amt ? html` <span class="amt">${signed(x.amt)}</span>` : ""}</span>`)}</div>` : html`<span class="muted">—</span>`}</td>
      <td class="num">${r.transferIn > 0 ? html`<span class="pos">${signed(r.transferIn)}</span>` : ""}${r.billsOut > 0 ? html`<span class="sub">${out$(r.billsOut)}</span>` : ""}${!(r.transferIn > 0) && !(r.billsOut > 0) ? html`<span class="muted">—</span>` : ""}</td>
      <td class="num">${money(bal)}${r.transferIn > 0 && r.billsOut > 0 ? html`<span class="sub">before bills ${money(bal + r.billsOut)}</span>` : ""}${lowDate === d.ms && !d.isPrev && !d.isNext ? html`<span class="sub lowest-tag">Lowest</span>` : ""}</td>
      <td class="num">${money(r.savingsBalance)}${r.savingsIn > 0 ? html`<span class="sub pos">${signed(r.savingsIn)}</span>` : ""}${r.savingsOut > 0 ? html`<span class="sub">${out$(r.savingsOut)}</span>` : ""}</td>
    </tr>`;
  };
  const rows = ledgerGroups(m, days, row,
    label => html`<tr class="sep"><td colspan="5">${label}</td></tr>`,
    () => html`<tr class="todaysep" id="today-line"><td colspan="5"><div class="today-line">Today · ${fmtDayDow(m.todayMs)}</div></td></tr>`);
  return html`<section class="card ltable-card"><table class="ltable">
    <thead><tr><th scope="col">Date</th><th scope="col">Activity</th><th scope="col" class="num">In / out</th><th scope="col" class="num">Bills balance</th><th scope="col" class="num">Savings</th></tr></thead>
    <tbody>${rows}</tbody></table></section>`;
}
const openDays = new Set();
function ledgerList(m, days){
  const lowDate = m.plan.lowestBillsBalDate;
  const row = d => {
    const r = d.row;
    const iso = E.isoDate(d.ms);
    const d0 = E.toDateObj(d.ms);
    const bal = r.billsBalanceWorking ?? r.billsBalance;
    const net = E.round2(r.transferIn - r.billsOut);
    const parts = dayParts(r);
    const subs = [];
    if(r.savingsIn > 0) subs.push(`${signed(r.savingsIn)} to savings`);
    if(r.savingsOut > 0) subs.push(`${out$(r.savingsOut)} from savings`);
    if(lowDate === d.ms && !d.isPrev && !d.isNext) subs.push("Lowest balance");
    const open = openDays.has(iso);
    const cls = ["lr", d.ms === m.todayMs ? "today" : "", (d.isPrev || d.isNext) ? "other" : ""].filter(Boolean).join(" ");
    return html`<li class="${cls}" id="d-${iso}">
      <button type="button" class="lr-btn" data-action="toggle-day" data-day="${iso}" data-focus="day-${iso}" aria-expanded="${open}">
        <span class="lr-date"><span class="dow">${E.dowName(d0.dow)}</span><span class="dom">${d0.d}</span></span>
        <span style="min-width:0"><span class="lr-title${parts.length ? "" : " muted"}">${parts.length ? parts.map(x => x.text).join(" · ") : "No activity"}</span>${subs.length ? html`<span class="lr-sub">${subs.join(" · ")}</span>` : ""}</span>
        <span class="lr-amt"><span class="chg ${net > 0 ? "pos" : ""}">${Math.abs(net) > 0.004 ? signed(net) : raw('<span class="muted">—</span>')}</span><span class="bal">${money(bal)}</span></span>
      </button>
      ${open ? html`<div class="lr-detail">
        ${d.isPayday ? html`<div class="kv"><span class="k">Into Bills (payday)</span><span class="v pos">${signed(r.transferIn)}</span></div>` : ""}
        ${r.billItems.map(b => html`<div class="kv"><span class="k">${stripDebt(b.name)}${b.debtId ? html` <span class="badge quiet">Debt</span>` : ""}</span><span class="v">${out$(b.amount)}</span></div>`)}
        <div class="kv"><span class="k">Bills balance</span><span class="v">${money(bal)}</span>${r.transferIn > 0 && r.billsOut > 0 ? html`<span class="s">${money(bal + r.billsOut)} before bills were paid</span>` : ""}</div>
        ${r.savingsIn > 0 ? html`<div class="kv"><span class="k">To savings</span><span class="v pos">${signed(r.savingsIn)}</span></div>` : ""}
        ${r.eventItems.map(ev => html`<div class="kv"><span class="k">${stripEvent(ev.name)}</span><span class="v">${out$(ev.amount)}</span><span class="s">Planned withdrawal from savings</span></div>`)}
        <div class="kv"><span class="k">Savings balance</span><span class="v">${money(r.savingsBalance)}</span></div>
      </div>` : ""}
    </li>`;
  };
  const items = ledgerGroups(m, days, row,
    label => html`<li class="lr-sep">${label}</li>`,
    () => html`<li class="lr-today" id="today-line"><div class="today-line">Today · ${fmtDayDow(m.todayMs)}</div></li>`);
  return html`<section class="card" style="padding:0;overflow:hidden"><ol class="lrows">${items}</ol></section>`;
}

/* ==========================================================================
   Not-yet-rebuilt screens
   ========================================================================== */
function viewSoon(tab){
  const info = {
    spending: { title: "Spending", icon: "receipt", items: [
      "Log, edit and delete purchases and refunds (Log spending already works)",
      "Budget cards for the pay period, with moving budget between categories",
      "History by year, month and pay period",
      "Graphs per pay period with averages"] },
    plan: { title: "Plan", icon: "calendar", items: [
      "Income: pay schedule, a second income, extra income, transfer split",
      "Bills with every schedule type, sorting and reordering",
      "Budgets (the old extra costs)",
      "Debts: payoff order, logging payments, payment history"] },
    savings: { title: "Savings", icon: "savings", items: [
      "Monthly goal, per-payday amount and the savings timeline",
      "Planned withdrawals (the old Events)",
      "Payday savings adds"] }
  }[tab];
  return html`<section class="card soon"><h2 class="card-t">${icon(info.icon)}${info.title} is being rebuilt</h2>
    <p class="card-sub">This screen comes in the next step. Your data for it is already here and safe. It will have:</p>
    <ul>${info.items.map(i => html`<li>${i}</li>`)}</ul></section>`;
}

/* ==========================================================================
   Settings
   ========================================================================== */
function numInput(path, value, { money: isMoney = true, step = "0.01", min = 0, max, id } = {}){
  const input = html`<input class="input" type="number" inputmode="${isMoney ? "decimal" : "numeric"}" step="${step}" min="${min}"${max != null ? raw(` max="${max}"`) : ""} value="${value}" data-change="set-num" data-path="${path}" id="${id}">`;
  return isMoney ? html`<div class="money-in">${input}</div>` : input;
}
function viewSettings(m){
  const s = m.D.settings;
  const mode = E.pocketThresholdMode(m.D);
  const listView = S.ui.ledgerView === "cards";
  const wi = whatIfActive();
  return html`<div class="page-grid two">
    <section class="card"><h2 class="card-t" style="margin-bottom:6px">Appearance</h2><div class="set-list">
      <div class="set-row stackable"><div><div class="k">Theme</div><div class="s">Auto follows your phone or computer.</div></div>
        <div class="ctl"><div class="seg" role="group" aria-label="Theme">${[["system", "Auto"], ["light", "Light"], ["dark", "Dark"], ["neon", "Neon"]].map(([v, l]) =>
          html`<button type="button" data-action="set-theme" data-theme="${v}" aria-pressed="${S.ui.theme === v}">${l}</button>`)}</div></div></div>
      <div class="set-row"><div><div class="k" id="lbl-oldnames">Show old names</div><div class="s">Adds the Bills Planner 4 name next to renamed items.</div></div>
        <div class="ctl"><button type="button" class="switch" role="switch" aria-checked="${!!S.ui.showOldNames}" data-action="toggle-ui" data-key="showOldNames" aria-labelledby="lbl-oldnames" id="sw-oldnames"></button></div></div>
    </div></section>

    <section class="card"><h2 class="card-t" style="margin-bottom:6px">Warnings and cushion</h2><div class="set-list">
      <div class="set-row"><div><label class="k" for="in-cushion">Cushion${was("Cushion (F)")}</label><div class="s">The Bills account never plans to go below this.</div></div>
        <div class="ctl">${numInput("settings.cushion", E.round2(s.cushion || 0).toFixed(2), { id: "in-cushion" })}</div></div>
      <div class="set-row"><div><label class="k" for="in-minfree">Minimum free to spend</label><div class="s">Pay periods under this are flagged.</div></div>
        <div class="ctl">${numInput("settings.pocket.minimumSurvival", E.round2(s.pocket?.minimumSurvival || 0).toFixed(2), { id: "in-minfree" })}</div></div>
      <div class="set-row stackable"><div><div class="k">Flag when this is under the minimum</div></div>
        <div class="ctl"><div class="seg" role="group" aria-label="Warning uses">
          <button type="button" data-action="set-warn" data-mode="net" aria-pressed="${mode === "net"}">Free after budgets</button>
          <button type="button" data-action="set-warn" data-mode="base" aria-pressed="${mode === "base"}">Spending money</button></div></div></div>
    </div></section>

    <section class="card"><h2 class="card-t" style="margin-bottom:6px">Ledger</h2><div class="set-list">
      <div class="set-row"><div><label class="k" for="in-days">Days shown around the month</label><div class="s">From the month before and after.</div></div>
        <div class="ctl">${numInput("ui.daysBeforeAfter", S.ui.daysBeforeAfter ?? 3, { money: false, step: "1", min: 0, max: 31, id: "in-days" })}</div></div>
      <div class="set-row stackable"><div><div class="k">On larger screens, show</div><div class="s">Phones always use the list.</div></div>
        <div class="ctl"><div class="seg" role="group" aria-label="Ledger layout">
          <button type="button" data-action="set-ledger-view" data-view="table" aria-pressed="${!listView}">Table</button>
          <button type="button" data-action="set-ledger-view" data-view="cards" aria-pressed="${listView}">List</button></div></div></div>
    </div></section>

    <section class="card"><h2 class="card-t" style="margin-bottom:10px">Starting point</h2>
      <div class="kv"><span class="k">Starting month${was("Base month")}</span><span class="v">${monthLabel(s.baseMonth || m.view)}</span></div>
      <div class="kv"><span class="k">Starting Bills balance${was("TB2")}</span><span class="v">${money(s.baseBillsBalance || 0)}</span><span class="s">Calculated when you move the starting point</span></div>
      <div class="kv"><span class="k">Savings balance</span><span class="v">${money(s.baseSavingsBalance || 0)}</span><span class="s">As of the start of ${monthLabel(s.trueSavingsMonth || s.baseMonth || m.view)}</span></div>
      <div class="btn-row" style="margin-top:14px"><button type="button" class="btn" data-action="roll-open" data-month="${m.view}">Start the plan in ${monthLabel(m.view)}</button></div>
    </section>

    <section class="card"><h2 class="card-t" style="margin-bottom:6px">What-if</h2>
      <p class="card-sub" style="margin-bottom:12px">Try changes, like a raise, a new bill or a bigger savings goal, without saving them. Keep them or throw them away when you're done.</p>
      ${wi ? html`<div class="btn-row"><button type="button" class="btn primary" data-action="whatif-keep">Keep changes</button><button type="button" class="btn" data-action="whatif-discard">Discard</button></div>`
        : html`<button type="button" class="btn" data-action="whatif-toggle">${icon("flask")}Start what-if</button>`}
    </section>

    <section class="card"><h2 class="card-t" style="margin-bottom:6px">Overview</h2>
      <p class="card-sub" style="margin-bottom:12px">Pick which numbers show under Month details.${was("Dashboard minimal mode")}</p>
      <button type="button" class="btn" data-action="choose-stats">Choose month details</button>
    </section>

    <section class="card"><h2 class="card-t" style="margin-bottom:6px">Your data</h2>
      <p class="card-sub" style="margin-bottom:12px">Saved only in this browser on this device. Export a backup to move it to another device or keep it safe.</p>
      <div class="btn-row">
        <button type="button" class="btn" data-action="export">${icon("download")}Export backup</button>
        <button type="button" class="btn" data-action="import-open">${icon("upload")}Import backup</button>
      </div>
      <input type="file" id="import-file" accept="application/json,.json" data-change="import-file" hidden>
      <div style="margin-top:16px"><button type="button" class="btn danger" data-action="reset-open">${icon("trash")}Reset everything</button></div>
    </section>

    <section class="card"><h2 class="card-t" style="margin-bottom:6px">About</h2>
      <p class="card-sub">Bills Planner 5 · build ${BUILD}${loadedFrom === "v4" ? " · data brought over from Bills Planner 4" : ""}</p>
    </section>
  </div>`;
}

/* ==========================================================================
   Sheets
   ========================================================================== */
function openLogSpend(){
  const m = model();
  const opts = E.extraSpendCategoryOptions(m.D);
  let cat = S.ui.extraSpendDraftExtraId;
  if(!opts.some(o => o.id === cat)) cat = opts[0]?.id || E.MISC_ID;
  const type = S.ui.extraSpendDraftType === "refund" ? "refund" : "spend";
  const date = m.isCurrentMonth ? m.today : `${m.view}-01`;
  openSheet({
    title: "Log spending",
    body: html`
      <div class="field"><label for="ls-amt">Amount</label>
        <div class="money-in"><input class="input ls-amt" id="ls-amt" type="number" inputmode="decimal" step="0.01" min="0" placeholder="0.00" data-input="ls-impact" autofocus></div>
        <span class="field-err" id="ls-err" role="alert"></span></div>
      <div class="field"><span class="lbl" id="ls-cat-lbl">Category</span>
        <div class="picks" role="radiogroup" aria-labelledby="ls-cat-lbl">${opts.map(o => html`<button type="button" class="pick" role="radio" aria-checked="${o.id === cat}" data-action="ls-cat" data-id="${o.id}">${o.name}</button>`)}</div></div>
      <div class="seg full" role="group" aria-label="Spend or refund">
        <button type="button" data-action="ls-type" data-type="spend" aria-pressed="${type === "spend"}">Spend</button>
        <button type="button" data-action="ls-type" data-type="refund" aria-pressed="${type === "refund"}">Refund</button></div>
      <div class="grid-2">
        <div class="field"><label for="ls-date">Date</label><input class="input" id="ls-date" type="date" value="${date}" data-input="ls-impact"></div>
        <div class="field"><label for="ls-note">Note</label><input class="input" id="ls-note" placeholder="Store or note" autocomplete="off" maxlength="120"></div>
      </div>
      <p class="impact" id="ls-impact" aria-live="polite"></p>`,
    foot: html`<button type="button" class="btn" data-action="close-overlay">Cancel</button><button type="button" class="btn primary" data-action="ls-save" id="ls-save">${type === "refund" ? "Log refund" : "Log spend"}</button>`,
    onMount: sheet => { sheet.dataset.cat = cat; sheet.dataset.type = type; updateLogImpact(sheet); }
  });
}
// Shows what the category has left in that pay period, before and after this entry.
function updateLogImpact(sheet){
  const out = sheet.querySelector("#ls-impact");
  if(!out) return;
  const iso = E.normalizeISODateLoose(sheet.querySelector("#ls-date")?.value || "");
  const amt = Math.abs(E.round2(Number(sheet.querySelector("#ls-amt")?.value || 0)));
  const cat = sheet.dataset.cat;
  if(!iso || !cat){ out.textContent = ""; return; }
  const period = E.spendPeriodInfo(S, iso);
  const snap = E.extraSpendSnapshotForRange(S, E.parseISOToMs(period.startIso), E.parseISOToMs(period.endIso));
  const row = snap.items.find(x => String(x.id) === String(cat));
  const name = row?.name || E.extraSpendCategoryOptions(S).find(o => o.id === cat)?.name || "This category";
  const left = row ? row.remaining : 0;
  const after = E.round2(left + (sheet.dataset.type === "refund" ? amt : -amt));
  const range = fmtRange(E.parseISOToMs(period.startIso), E.parseISOToMs(period.endIso));
  out.innerHTML = amt > 0
    ? `${esc(name)} for ${esc(range)}: <b>${esc(money(left))}</b> left now, <b class="${after < 0 ? "neg" : ""}">${esc(money(after))}</b> after this.`
    : `${esc(name)} has <b>${esc(money(left))}</b> left for ${esc(range)}.`;
}
function saveLogSpend(sheet){
  const amtEl = sheet.querySelector("#ls-amt");
  const amt = Math.abs(E.round2(Number(amtEl.value || 0)));
  const err = sheet.querySelector("#ls-err");
  if(!(amt > 0)){
    err.textContent = "Enter an amount";
    amtEl.focus();
    return;
  }
  const cat = sheet.dataset.cat;
  const type = sheet.dataset.type === "refund" ? "refund" : "spend";
  const name = E.extraSpendCategoryOptions(S).find(o => o.id === cat)?.name || E.MISC_NAME;
  const date = E.normalizeISODateLoose(sheet.querySelector("#ls-date").value) || E.todayIso();
  const note = String(sheet.querySelector("#ls-note").value || "").trim();
  closeOverlay();
  commit(st => {
    st.extraSpendEntries.push({
      id: `xs${Date.now()}${Math.random().toString(16).slice(2, 6)}`,
      extraId: cat, extraName: name,
      amount: type === "refund" ? -amt : amt,
      entryType: type, date, note, createdAt: new Date().toISOString()
    });
    st.ui.extraSpendDraftExtraId = cat;
    st.ui.extraSpendDraftType = type;
  }, { undo: `${type === "refund" ? "Refund" : "Spend"} of ${money(amt)} logged in ${name}` });
}

function breakdownCtx(m, mk){
  const w = payWindow(m, true);
  if(w.ctx.plans.get(mk)) return w.ctx;
  return m.get("bdctx|" + mk, () => E.buildPlanRange(m.D, E.addMonthsKey(mk, -1), E.addMonthsKey(mk, 1)));
}
function openBreakdown(key){
  const m = model();
  const [mk, s, e] = String(key || "").split("|");
  const b = E.pocketBreakdown(m.D, breakdownCtx(m, mk), mk, Number(s), Number(e));
  if(!b){ toast("No plan for that pay period yet."); return; }
  const t = b.threshold;
  const splitRows = (split, p2Pct, otherPct) => (b.multiCap && ((b.cap2 > 0.009 && p2Pct > 0) || (b.capOther > 0.009 && otherPct > 0)))
    ? html`${b.cap2 > 0.009 && p2Pct > 0 ? html`<div class="calc-row sub"><span>From income 2 (${p2Pct}%)</span><span class="v">${out$(split.pay2)}</span></div>` : ""}
      ${b.capOther > 0.009 && otherPct > 0 ? html`<div class="calc-row sub"><span>From extra income (${otherPct}%)</span><span class="v">${out$(split.other)}</span></div>` : ""}
      <div class="calc-row sub"><span>From income 1</span><span class="v">${out$(split.source1)}</span></div>`
    : "";
  openSheet({
    title: `Pay period · ${fmtRange(b.startMs, b.endMs)}`,
    body: html`
      ${t ? html`<div class="banner danger">${icon("alert")}<div class="grow"><b>Why this is flagged</b><ul class="why">
        <li>${t.mode === "base" ? "Spending money" : "Free after budgets"} (${money(t.metricValue)}) is ${money(t.shortBy)} under your minimum of ${money(t.minimum)}.</li>
        ${t.spent > t.base + 0.005 ? html`<li>Planned spending of ${money(t.spent)} is ${money(t.spent - t.base)} more than the spending money (${money(t.base)}).</li>` : ""}
      </ul></div></div>` : ""}
      <div class="bd-grid">
        <div class="bd-stat"><div class="k">Free after budgets</div><div class="v ${b.freeAfterBudgets < 0 ? "neg" : "pos"}">${money(b.freeAfterBudgets)}</div></div>
        <div class="bd-stat"><div class="k">Available now</div><div class="v${b.available < 0 ? " neg" : ""}">${money(b.available)}</div></div>
        <div class="bd-stat"><div class="k">Spending money${was("Pocket base")}</div><div class="v">${money(b.base)}</div></div>
        <div class="bd-stat"><div class="k">Spent</div><div class="v">${money(b.actualSpent)}</div></div>
      </div>
      <div><h3 class="eyebrow" style="margin-bottom:6px">How the spending money is built</h3><div class="calc">
        <div class="calc-row"><span>Paycheck</span><span class="v">${money(b.cap)}</span></div>
        ${b.multiCap ? html`${b.cap1 ? html`<div class="calc-row sub"><span>Income 1</span><span class="v">${money(b.cap1)}</span></div>` : ""}
          ${b.cap2 ? html`<div class="calc-row sub"><span>Income 2</span><span class="v">${money(b.cap2)}</span></div>` : ""}
          ${b.capOther ? html`<div class="calc-row sub"><span>Extra income</span><span class="v">${money(b.capOther)}</span></div>` : ""}` : ""}
        <div class="calc-row"><span>Transfer to Bills</span><span class="v">${out$(b.billsPer)}</span></div>
        ${splitRows(b.billsSplit, b.p2BillsPct, b.otherBillsPct)}
        <div class="calc-row"><span>To savings</span><span class="v">${out$(b.savPer)}</span></div>
        ${splitRows(b.savSplit, b.p2SavPct, b.otherSavPct)}
        <div class="calc-row total"><span>Spending money</span><span class="v">${money(b.base)}</span></div>
      </div></div>
      <div class="grid-2">
        <div><h3 class="eyebrow" style="margin-bottom:6px">If you stick to budgets</h3><div class="calc">
          <div class="calc-row"><span>Spending money</span><span class="v">${money(b.base)}</span></div>
          <div class="calc-row"><span>Budgets</span><span class="v">${out$(b.planned)}</span></div>
          <div class="calc-row total"><span>Free after budgets</span><span class="v${b.freeAfterBudgets < 0 ? " neg" : ""}">${money(b.freeAfterBudgets)}</span></div></div></div>
        <div><h3 class="eyebrow" style="margin-bottom:6px">So far</h3><div class="calc">
          <div class="calc-row"><span>Spending money</span><span class="v">${money(b.base)}</span></div>
          <div class="calc-row"><span>Spent</span><span class="v">${out$(b.actualSpent)}</span></div>
          <div class="calc-row total"><span>Available now</span><span class="v${b.available < 0 ? " neg" : ""}">${money(b.available)}</span></div></div></div>
      </div>
      <div><h3 class="eyebrow" style="margin-bottom:6px">By category</h3>
        ${b.categories.length ? html`<table class="mini-table"><thead><tr><th scope="col">Category</th><th scope="col" class="num">Budgeted</th><th scope="col" class="num">Spent</th></tr></thead>
          <tbody>${b.categories.map(c => html`<tr><td>${c.name}</td><td class="num">${money(c.planned)}</td><td class="num${c.over ? " neg" : ""}">${money(c.actual)}</td></tr>`)}</tbody></table>`
          : html`<p class="card-sub">No budgets or spending in this pay period.</p>`}
      </div>`,
    foot: html`<button type="button" class="btn primary" data-action="close-overlay">Done</button>`
  });
}

function openStatsPicker(){
  const shown = new Set(S.ui.statsShown || []);
  openSheet({
    title: "Month details",
    body: html`<p class="card-sub">Choose which numbers show on the Overview.</p>
      <div class="check-list">${E.STAT_KEYS.map(k => html`<label class="check"><input type="checkbox" value="${k}" data-change="stat-pick"${attr("checked", shown.has(k))}>
        <span><span class="k">${STAT_DEFS[k].label}</span>${was(STAT_DEFS[k].old)}<span class="s" style="display:block">${STAT_DEFS[k].help}</span></span></label>`)}</div>`,
    foot: html`<button type="button" class="btn primary" data-action="close-overlay">Done</button>`
  });
}

function openRollSheet(target){
  const m = model();
  const plan = planFor(m, target);
  const bills = E.round2(plan ? plan.startBills : 0);
  const sav = E.round2(plan ? plan.startSavings : E.projectedSavingsAtMonthStart(m.D, target));
  openSheet({
    title: `Start the plan in ${monthLabel(target)}`,
    body: html`<p class="card-sub">Balances carry forward from ${monthLabel(m.base)} as planned. If you know the real savings balance, enter it.</p>
      <div class="kv"><span class="k">Starting Bills balance${was("TB2")}</span><span class="v">${money(bills)}</span><span class="s">Calculated from your plan</span></div>
      <div class="field"><label for="roll-sav">Savings balance at the start of ${monthOnly(target)}</label>
        <div class="money-in"><input class="input" id="roll-sav" type="number" inputmode="decimal" step="0.01" value="${sav.toFixed(2)}"></div></div>`,
    foot: html`<button type="button" class="btn" data-action="close-overlay">Cancel</button><button type="button" class="btn primary" data-action="roll-apply" data-month="${target}" data-bills="${bills}">Start in ${monthOnly(target)}</button>`
  });
}

function openConfirm({ title, message, confirmLabel, danger, onConfirm }){
  openSheet({
    title,
    body: html`<p style="color:var(--text-2)">${message}</p>`,
    foot: html`<button type="button" class="btn" data-action="close-overlay">Cancel</button><button type="button" class="btn ${danger ? "danger solid" : "primary"}" data-action="confirm-ok">${confirmLabel}</button>`,
    onMount: sheet => { sheet._onConfirm = onConfirm; }
  });
}

/* ==========================================================================
   Data: export, import, reset
   ========================================================================== */
function exportData(){
  const blob = new Blob([JSON.stringify(exportPayload(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bills-planner-${E.todayIso()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  toast(whatIfActive() ? "Backup exported (what-if changes not included)" : "Backup exported");
}
function importFile(file){
  const reader = new FileReader();
  reader.onload = () => {
    let parsed;
    try{ parsed = JSON.parse(String(reader.result || "")); }catch(_){ parsed = null; }
    if(!looksLikeState(parsed)){ toast("That file isn't a Bills Planner backup."); return; }
    const prev = structuredClone(S);
    const next = migrate(parsed);
    // Theme and screen are per device, so they stay as they are here.
    next.ui.theme = prev.ui.theme;
    next.ui.tab = prev.ui.tab;
    S = next;
    E.resetCache();
    rev++;
    saveState();
    renderNow();
    toast("Backup imported", { action: "Undo", ms: 10000, onAction: () => { S = prev; E.resetCache(); rev++; saveState(); renderNow(); } });
  };
  reader.onerror = () => toast("Couldn't read that file.");
  reader.readAsText(file);
}
function resetEverything(){
  const theme = S.ui.theme;
  S = makeDefaultState();
  S.ui.theme = theme;
  E.resetCache();
  rev++;
  // Saving the fresh state right away keeps Bills Planner 4's data from being pulled in again.
  saveState();
  navTo("overview");
  renderNow();
  toast("Everything was reset");
}

/* ==========================================================================
   Event handling
   ========================================================================== */
const NUM_FIELDS = {
  "settings.cushion": { min: 0, round: true, data: true },
  "settings.pocket.minimumSurvival": { min: 0, round: true, data: true },
  "ui.daysBeforeAfter": { min: 0, max: 31, int: true }
};
const ACTIONS = {
  "nav": el => navTo(el.dataset.tab, el.dataset.sub),
  "month-step": el => setMonth(E.addMonthsKey(S.selectedMonth, Number(el.dataset.step))),
  "month-today": () => setMonth(E.currentMonthKey()),
  "month-open": el => { try{ el.showPicker?.(); }catch(_){} },
  "close-overlay": () => closeOverlay(),
  "log-spend": () => openLogSpend(),
  "ls-cat": el => {
    const sheet = el.closest(".sheet");
    sheet.dataset.cat = el.dataset.id;
    sheet.querySelectorAll(".pick").forEach(p => p.setAttribute("aria-checked", String(p === el)));
    updateLogImpact(sheet);
  },
  "ls-type": el => {
    const sheet = el.closest(".sheet");
    sheet.dataset.type = el.dataset.type;
    sheet.querySelectorAll('[data-action="ls-type"]').forEach(b => b.setAttribute("aria-pressed", String(b === el)));
    sheet.querySelector("#ls-save").textContent = el.dataset.type === "refund" ? "Log refund" : "Log spend";
    updateLogImpact(sheet);
  },
  "ls-save": el => saveLogSpend(el.closest(".sheet")),
  "open-breakdown": el => openBreakdown(el.dataset.key),
  "toggle-shift": () => setUI({ pocketShiftBackOne: !(S.ui.pocketShiftBackOne !== false) }),
  "toggle-ui": el => setUI({ [el.dataset.key]: !S.ui[el.dataset.key] }),
  "toggle-day": el => { const d = el.dataset.day; openDays.has(d) ? openDays.delete(d) : openDays.add(d); requestRender(); },
  "jump-today": () => {
    const target = document.getElementById("d-" + E.todayIso()) || document.getElementById("today-line");
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  },
  "choose-stats": () => openStatsPicker(),
  "set-theme": el => setUI({ theme: el.dataset.theme }),
  "set-warn": el => commit(st => { st.settings.pocket.thresholdMode = el.dataset.mode === "base" ? "base" : "net"; }),
  "set-ledger-view": el => setUI({ ledgerView: el.dataset.view === "cards" ? "cards" : "table" }),
  "roll-open": el => openRollSheet(el.dataset.month),
  "roll-dismiss": () => setUI({ rollPromptDismissed: E.currentMonthKey() }),
  "roll-apply": el => {
    const target = el.dataset.month;
    const bills = Number(el.dataset.bills || 0);
    const sav = E.round2(Number(el.closest(".sheet").querySelector("#roll-sav")?.value || 0));
    closeOverlay();
    commit(st => {
      st.settings.baseMonth = target;
      st.settings.baseMonthAutoSync = false;
      st.settings.baseBillsBalance = bills;
      st.settings.trueSavingsMonth = target;
      st.settings.baseSavingsBalance = sav;
    }, { undo: `Your plan now starts in ${monthLabel(target)}` });
  },
  "whatif-toggle": () => {
    if(!whatIfActive()){
      startWhatIf();
      rev++;
      saveState();
      renderNow();
      toast("What-if mode is on. Changes aren't saved until you keep them.");
      return;
    }
    openConfirm({ title: "Keep your what-if changes?", message: "Keep them to make them part of your plan, or discard them to go back to how things were.",
      confirmLabel: "Keep changes", onConfirm: () => ACTIONS["whatif-keep"]() });
  },
  "whatif-keep": () => { closeOverlay(); keepWhatIf(); rev++; saveState(); renderNow(); toast("What-if changes kept"); },
  "whatif-discard": () => { closeOverlay(); discardWhatIf(); E.resetCache(); rev++; saveState(); renderNow(); toast("What-if changes discarded"); },
  "export": () => exportData(),
  "import-open": () => document.getElementById("import-file")?.click(),
  "reset-open": () => openConfirm({
    title: "Reset everything?",
    message: "This deletes your bills, pay, budgets, debts, spending history and settings in Bills Planner 5 on this device. Export a backup first if you might want it back. Bills Planner 4 isn't affected.",
    confirmLabel: "Reset everything", danger: true, onConfirm: resetEverything
  }),
  "confirm-ok": el => { const fn = el.closest(".sheet")?._onConfirm; closeOverlay(false, fn); }
};
const CHANGES = {
  "month-pick": el => setMonth(el.value),
  "set-num": el => {
    const path = el.dataset.path;
    const cfg = NUM_FIELDS[path];
    if(!cfg) return;
    let v = Number(el.value);
    if(!Number.isFinite(v)) v = 0;
    if(cfg.int) v = Math.round(v);
    if(cfg.min != null) v = Math.max(cfg.min, v);
    if(cfg.max != null) v = Math.min(cfg.max, v);
    if(cfg.round) v = E.round2(v);
    if(cfg.data) commit(st => setPath(st, path, v));
    else setUI({ [path.split(".")[1]]: v });
  },
  "stat-pick": el => {
    const set = new Set(S.ui.statsShown || []);
    el.checked ? set.add(el.value) : set.delete(el.value);
    setUI({ statsShown: E.STAT_KEYS.filter(k => set.has(k)) });
  },
  "import-file": el => { const f = el.files?.[0]; if(f) importFile(f); el.value = ""; }
};
const INPUTS = {
  "ls-impact": el => {
    const sheet = el.closest(".sheet");
    if(!sheet) return;
    const err = sheet.querySelector("#ls-err");
    if(err) err.textContent = "";
    updateLogImpact(sheet);
  }
};

function bindEvents(){
  document.addEventListener("click", e => {
    const el = e.target.closest("[data-action]");
    if(!el) return;
    const fn = ACTIONS[el.dataset.action];
    if(fn) fn(el, e);
  });
  document.addEventListener("change", e => {
    const el = e.target.closest("[data-change]");
    if(el && CHANGES[el.dataset.change]) CHANGES[el.dataset.change](el, e);
  });
  document.addEventListener("input", e => {
    const el = e.target.closest("[data-input]");
    if(el && INPUTS[el.dataset.input]) INPUTS[el.dataset.input](el, e);
  });
  // <details> toggle doesn't bubble, so listen in the capture phase.
  document.addEventListener("toggle", e => {
    const el = e.target;
    if(el.matches?.("details[data-toggle]")){ S.ui[el.dataset.toggle] = el.open; saveState(); }
  }, true);
  document.addEventListener("keydown", e => {
    if(!overlay) return;
    if(e.key === "Escape"){ e.preventDefault(); closeOverlay(); }
    else if(e.key === "Tab") trapFocus(e);
    else if(e.key === "Enter" && e.target.id === "ls-amt"){ e.preventDefault(); saveLogSpend(e.target.closest(".sheet")); }
  });
  window.addEventListener("hashchange", syncFromHash);
  mqPhone.addEventListener?.("change", requestRender);
  mqLight.addEventListener?.("change", () => { if(S.ui.theme === "system") applyTheme(); });
}

/* ---------- the calendar moves on ---------- */
function onDayChange(){
  const cur = E.currentMonthKey();
  // Follow the calendar only if you were looking at the current month.
  if(S.ui.autoMonthLast && S.selectedMonth === S.ui.autoMonthLast && S.selectedMonth !== cur) S.selectedMonth = cur;
  S.ui.autoMonthLast = cur;
  E.resetCache();
  rev++;
  saveState();
  requestRender();
}
let lastDay = null;
function watchCalendar(){
  lastDay = E.todayIso();
  const schedule = () => setTimeout(() => { lastDay = E.todayIso(); onDayChange(); schedule(); }, E.msUntilNextMidnight());
  schedule();
  // Phones pause timers in the background, so check again when the app comes back.
  document.addEventListener("visibilitychange", () => {
    if(document.hidden) return;
    const t = E.todayIso();
    if(t !== lastDay){ lastDay = t; onDayChange(); }
  });
}

/* ---------- start ---------- */
function boot(){
  document.body.insertAdjacentHTML("afterbegin", iconSprite());
  const from = loadState();
  const cur = E.currentMonthKey();
  if(!S.ui.autoMonthLast) S.ui.autoMonthLast = S.selectedMonth || cur;
  if(S.selectedMonth === S.ui.autoMonthLast && S.selectedMonth !== cur){
    S.selectedMonth = cur;
    S.ui.autoMonthLast = cur;
  }
  bindEvents();
  if(parseHash().tab) syncFromHash();
  else history.replaceState(history.state, "", "#" + (S.ui.tab || "overview"));
  saveState();
  renderNow();
  if(from === "v4" && !S.ui.migratedNoticeShown){
    S.ui.migratedNoticeShown = true;
    saveState();
    toast("Brought over your data from Bills Planner 4. It's still there in the old app too.", { ms: 8000 });
  }
  watchCalendar();
}

if(!/[?&]test=1\b/.test(location.search)) boot();
