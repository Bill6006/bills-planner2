/* ==========================================================================
   STORE
   Saved data, migration from Bills Planner 4, persistence, undo, what-if.
   ========================================================================== */
// The key avoids "bap", "planner" and "bills": v4's Reset deletes every key matching those.
const STORAGE_KEY = "bp5.state";
const LEGACY_KEY = "bap_state_clean_template_v1";
const DATA_KEYS = ["settings", "selectedMonth", "bills", "extras", "debts", "extraSpendEntries", "extraSpendTransfers", "events", "extrasByMonth"];

function makeDefaultState(){
  const mk = E.currentMonthKey();
  return {
    schema: 2,
    ui: {
      theme: "system",
      tab: "overview",
      planTab: "income",
      showOldNames: true,
      collapseEmpty: false,
      daysBeforeAfter: 3,
      ledgerView: "table",
      pocketShiftBackOne: true,
      statsShown: E.STAT_KEYS.slice(),
      statsOpen: false,
      activePaySource: 1,
      billsSortMode: "custom",
      billCustomOrder: [],
      extraCustomOrder: [],
      extraSpendSummaryMode: "pay",
      extraSpendDraftType: "spend",
      extraSpendDraftExtraId: "",
      extraSpendGraphRange: "month",
      extraSpendGraphCustomSource: "month",
      extraSpendGraphHiddenIds: [],
      extraSpendGraphAvgExpanded: false,
      extraSpendGraphDetailMode: "logs",
      extraSpendGraphOpenId: "",
      extraSpendHistoryOpen: {},
      debtStrategy: "avalanche",
      eventsFilter: "ALL",
      autoMonthLast: mk,
      rollPromptDismissed: ""
    },
    settings: {
      baseMonth: mk,
      baseMonthAutoSync: false,
      baseBillsBalance: 0,
      baseSavingsBalance: 0,
      trueSavingsMonth: mk,
      cushion: 0,
      pocket: { minimumSurvival: 0, thresholdMode: "net" },
      pay: {
        frequency: "semimonthly",
        paycheckCap: 0,
        anchorNextPayday: E.todayIso(),
        semimonthlyDom1: 15,
        semimonthlyDom2: 31,
        monthlyDom: 15,
        customDates: []
      },
      pay2: null,
      otherIncomes: [],
      transferSplit: { pay2BillsPct: 0, pay2SavingsPct: 0, otherBillsPct: 0, otherSavingsPct: 0 },
      savings: { monthlyGoal: 0, timelineMonths: 6 },
      dashboardMinimalCards: Object.fromEntries(E.STAT_KEYS.map(k => [k, true]))
    },
    selectedMonth: mk,
    bills: [],
    extras: [],
    debts: [],
    extraSpendEntries: [],
    extraSpendTransfers: [],
    events: [],
    extrasByMonth: {},
    whatIf: null
  };
}

function looksLikeState(o){
  return !!(o && typeof o === "object" && o.settings && (Array.isArray(o.bills) || Array.isArray(o.paydays) || Array.isArray(o.extras) || Array.isArray(o.events)));
}

function deepAssign(dst, src){
  for(const [k, v] of Object.entries(src)){
    if(v && typeof v === "object" && !Array.isArray(v)){
      if(!dst[k] || typeof dst[k] !== "object" || Array.isArray(dst[k])) dst[k] = {};
      deepAssign(dst[k], v);
    }else{
      dst[k] = v;
    }
  }
  return dst;
}

// Brings any saved or imported state (v4 or v5) up to the current shape.
// The v4 steps are ported from its migrateState so old data loads the same way.
function migrate(raw){
  if(!raw || typeof raw !== "object") return null;
  const fromV5 = raw.schema === 2;
  const out = deepAssign(makeDefaultState(), raw);
  const s = out.settings;

  if(!Array.isArray(out.extras)) out.extras = [];
  if(!Array.isArray(out.debts)) out.debts = [];
  out.debts = out.debts.map((d, idx) => {
    const x = (d && typeof d === "object") ? d : {};
    if(!x.id) x.id = `d${Date.now()}${idx}`;
    if(!x.name) x.name = "Debt";
    x.balance = Math.max(0, E.round2(Number(x.balance || 0)));
    x.originalBalance = Math.max(x.balance, E.round2(Number(x.originalBalance || x.balance || 0)));
    x.apr = Math.max(0, E.round2(Number(x.apr || 0)));
    x.minPayment = Math.max(0, E.round2(Number(x.minPayment || 0)));
    x.extraPayment = Math.max(0, E.round2(Number(x.extraPayment || 0)));
    x.dueDay = E.clampInt(x.dueDay || 1, 1, 31);
    x.priority = E.clampInt(x.priority || (idx + 1), 1, 999);
    return x;
  });

  // Very old exports kept budgets per month; fold them into the global list.
  const seenExtras = new Set(out.extras.map(x => x && x.id).filter(Boolean));
  if(out.extrasByMonth && typeof out.extrasByMonth === "object"){
    for(const [mk, arr] of Object.entries(out.extrasByMonth)){
      if(!Array.isArray(arr)) continue;
      for(const x of arr){
        if(!x || typeof x !== "object") continue;
        if(x._extraMonth == null) x._extraMonth = mk;
        if(!x.id) x.id = `${mk}-x${Math.random().toString(16).slice(2)}`;
        if(seenExtras.has(x.id)) continue;
        seenExtras.add(x.id);
        out.extras.push(x);
      }
    }
  }
  out.extrasByMonth = {};

  if(!s.pay || typeof s.pay !== "object") s.pay = makeDefaultState().settings.pay;
  s.baseMonthAutoSync = false;
  delete s.baseMonthLocked;
  if(!s.baseMonth || !String(s.baseMonth).trim()) s.baseMonth = out.selectedMonth || E.currentMonthKey();
  if(s.pay?.pay_frequency && !s.pay.frequency){ s.pay.frequency = s.pay.pay_frequency; delete s.pay.pay_frequency; }
  if(s.pay?.amount && !s.pay.paycheckCap) s.pay.paycheckCap = Number(s.pay.amount || 0);
  if(!s.dashboardMinimalCards) s.dashboardMinimalCards = Object.fromEntries(E.STAT_KEYS.map(k => [k, true]));
  if(!s.pocket || typeof s.pocket !== "object") s.pocket = { minimumSurvival: 0, thresholdMode: "net" };
  s.pocket.minimumSurvival = Math.max(0, E.round2(Number(s.pocket.minimumSurvival || 0)));
  s.pocket.thresholdMode = s.pocket.thresholdMode === "base" ? "base" : "net";
  s.pay.semimonthlyDom1 = E.clampInt(s.pay.semimonthlyDom1 ?? 15, 1, 31);
  s.pay.semimonthlyDom2 = E.clampInt(s.pay.semimonthlyDom2 ?? 31, 1, 31);
  s.pay.monthlyDom = E.clampInt(s.pay.monthlyDom ?? 15, 1, 31);
  if(!Array.isArray(s.pay.customDates)) s.pay.customDates = [];
  if(!s.trueSavingsMonth) s.trueSavingsMonth = s.baseMonth || out.selectedMonth || "";
  if(s.pay2 && typeof s.pay2 !== "object") s.pay2 = null;
  if(s.pay2){
    if(!s.pay2.frequency) s.pay2.frequency = s.pay.frequency || "semimonthly";
    if(!Array.isArray(s.pay2.customDates)) s.pay2.customDates = [];
    s.pay2.semimonthlyDom1 = E.clampInt(s.pay2.semimonthlyDom1 ?? 15, 1, 31);
    s.pay2.semimonthlyDom2 = E.clampInt(s.pay2.semimonthlyDom2 ?? 31, 1, 31);
    s.pay2.monthlyDom = E.clampInt(s.pay2.monthlyDom ?? 15, 1, 31);
  }
  if(!Array.isArray(s.otherIncomes)) s.otherIncomes = [];
  s.transferSplit = E.normalizeTransferSplit(s.transferSplit);
  if(!s.savings || typeof s.savings !== "object") s.savings = { monthlyGoal: 0, timelineMonths: 6 };

  const ui = out.ui;
  if(ui.activePaySource !== 1 && ui.activePaySource !== 2) ui.activePaySource = 1;
  if(!Array.isArray(ui.extraSpendGraphHiddenIds)) ui.extraSpendGraphHiddenIds = [];
  if(!["month","last7","custom"].includes(ui.extraSpendGraphRange)) ui.extraSpendGraphRange = "month";
  if(!["month","last7"].includes(ui.extraSpendGraphCustomSource)) ui.extraSpendGraphCustomSource = "month";
  if(ui.extraSpendGraphRange === "custom" && !ui.extraSpendGraphHiddenIds.length) ui.extraSpendGraphRange = ui.extraSpendGraphCustomSource || "month";
  if(!["logs","categories"].includes(ui.extraSpendGraphDetailMode)) ui.extraSpendGraphDetailMode = "logs";
  if(ui.extraSpendSummaryMode !== "month" && ui.extraSpendSummaryMode !== "pay") ui.extraSpendSummaryMode = "pay";
  if(typeof ui.pocketShiftBackOne !== "boolean") ui.pocketShiftBackOne = true;
  if(!["avalanche","snowball","custom"].includes(ui.debtStrategy)) ui.debtStrategy = "avalanche";
  if(ui.ledgerView !== "cards") ui.ledgerView = "table";

  if(!fromV5){
    // First run after Bills Planner 4: land on the new home screen and keep the look.
    ui.theme = ({ dark: "dark", light: "light", neon: "neon", aurora: "neon" })[raw?.ui?.theme] || "dark";
    ui.tab = "overview";
    ui.showOldNames = true;
    ui.statsShown = raw?.ui?.dashboardMode === "minimal"
      ? E.STAT_KEYS.filter(k => !!s.dashboardMinimalCards?.[k])
      : E.STAT_KEYS.slice();
    delete ui.proj;
    delete ui.savingsGoalSnapshot;
    delete ui.savingsProjected;
    out.whatIf = null;
  }
  if(!["system","light","dark","neon"].includes(ui.theme)) ui.theme = "dark";
  if(!Array.isArray(ui.statsShown)) ui.statsShown = E.STAT_KEYS.slice();

  normalizeAll(out);

  // v4 build 117 split old debt payments into interest and principal once.
  if(ui.debtInterestVersion !== 117){
    for(const d of out.debts){
      const needsSplit = (d.payments || []).some(p => p && Number(p.amount || 0) > 0 && !(Number(p.principal || 0) > 0 || Number(p.interest || 0) > 0));
      if(needsSplit) E.recalcDebtFromPayments(d);
    }
    ui.debtInterestVersion = 117;
  }
  out.schema = 2;
  return out;
}

function normalizeAll(st){
  E.normalizeExtras(st);
  E.normalizeSpendEntries(st);
  E.normalizeSpendTransfers(st);
  E.normalizeEvents(st);
  if(!Array.isArray(st.bills)) st.bills = [];
  st.bills = st.bills.filter(b => b && typeof b === "object");
  for(const b of st.bills) if(!b.id) b.id = `b${Date.now()}${Math.random().toString(16).slice(2,6)}`;
  if(!Array.isArray(st.debts)) st.debts = [];
  st.debts.forEach((d, i) => E.normalizeDebt(d, i));
  st.settings.transferSplit = E.normalizeTransferSplit(st.settings.transferSplit);
  if(!Array.isArray(st.settings.otherIncomes)) st.settings.otherIncomes = [];
  for(const x of st.settings.otherIncomes) if(x && !x.id) x.id = `oi${Date.now()}${Math.random().toString(16).slice(2,6)}`;
}

/* ---------- live state ---------- */
let S = makeDefaultState();
let loadedFrom = null;      // "v5" | "v4" | null
let saveFailed = false;

function loadState(){
  let raw = null, from = null;
  try{
    const v5 = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if(looksLikeState(v5)){ raw = v5; from = "v5"; }
  }catch(_){}
  if(!raw){
    // Read-only look at Bills Planner 4's saved data; it's left in place so v4 still works.
    try{
      const v4 = JSON.parse(localStorage.getItem(LEGACY_KEY) || "null");
      if(looksLikeState(v4)){ raw = v4; from = "v4"; }
    }catch(_){}
  }
  const st = raw ? migrate(raw) : null;
  S = st || makeDefaultState();
  loadedFrom = st ? from : null;
  E.resetCache();
  return loadedFrom;
}

function saveState(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(S));
    saveFailed = false;
  }catch(_){
    saveFailed = true;
  }
}

function dataSnapshot(from){
  const src = from || S;
  const out = {};
  for(const k of DATA_KEYS) out[k] = structuredClone(src[k]);
  return out;
}
function restoreData(snap){
  for(const k of DATA_KEYS) if(k in snap) S[k] = structuredClone(snap[k]);
}

/* ---------- what-if: try changes without keeping them ---------- */
function whatIfActive(){ return !!(S.whatIf && S.whatIf.active); }
function startWhatIf(){
  if(whatIfActive()) return;
  S.whatIf = { active: true, fromMonth: S.selectedMonth, startedAt: new Date().toISOString(), saved: dataSnapshot() };
}
function keepWhatIf(){ S.whatIf = null; }
function discardWhatIf(){
  if(!whatIfActive()) return;
  const viewing = S.selectedMonth;
  restoreData(S.whatIf.saved);
  S.selectedMonth = viewing;
  S.whatIf = null;
}

/* ---------- export / import ---------- */
function exportPayload(){
  const base = whatIfActive() ? { ...S, ...structuredClone(S.whatIf.saved) } : S;
  const out = structuredClone({ ...base, whatIf: null });
  out.app = "Bills Planner 5";
  out.exportedAt = new Date().toISOString();
  return out;
}

window.BP = Object.assign(window.BP || {}, {
  E,
  migrate,
  makeDefaultState,
  test: {
    load(raw){ S = migrate(structuredClone(raw)); E.resetCache(); return S; },
    state(){ return S; }
  }
});
