/* ==========================================================================
   ENGINE
   All of the planning math, ported from Bills Planner 4 so the numbers match.
   Functions take the saved data (D) explicitly instead of reading a global.
   ========================================================================== */
const E = (() => {
  "use strict";

  const DAY_MS = 86400000;
  const APP_TZ = "America/New_York";
  const MISC_ID = "__misc__";
  const MISC_NAME = "Misc";
  const RULE_TYPES = ["monthly_dom", "weekly_dow", "annual_md", "one_time", "biweekly", "perpay"];

  // debtPayoffCutoff: stop scheduling a debt in the ledger after its estimated payoff
  // month. v4 intended this but never applied it; the parity check turns it off.
  const opts = { debtPayoffCutoff: true };
  let todayOverride = null;

  /* ---------- memo, reset whenever the data changes ---------- */
  let caches = new WeakMap();
  function resetCache(){ caches = new WeakMap(); }
  function memo(D, key, fn){
    let m = caches.get(D);
    if(!m){ m = new Map(); caches.set(D, m); }
    if(m.has(key)) return m.get(key);
    const v = fn();
    m.set(key, v);
    return v;
  }

  /* ---------- dates (UTC day math, Eastern "today") ---------- */
  function tzParts(date, tz){
    try{
      const fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: tz, hourCycle: "h23",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit"
      });
      const out = {};
      for(const p of fmt.formatToParts(date)) if(p.type !== "literal") out[p.type] = p.value;
      return out;
    }catch(e){
      const d = date;
      return {
        year: String(d.getFullYear()), month: String(d.getMonth()+1).padStart(2,"0"), day: String(d.getDate()).padStart(2,"0"),
        hour: String(d.getHours()).padStart(2,"0"), minute: String(d.getMinutes()).padStart(2,"0"), second: String(d.getSeconds()).padStart(2,"0")
      };
    }
  }
  function todayIso(){
    if(todayOverride) return todayOverride;
    const p = tzParts(new Date(), APP_TZ);
    return `${p.year}-${p.month}-${p.day}`;
  }
  function currentMonthKey(){ return todayIso().slice(0,7); }
  function tzOffsetToUTC(date){
    const p = tzParts(date, APP_TZ);
    const asUTC = Date.UTC(+p.year, +p.month-1, +p.day, +p.hour, +p.minute, +p.second);
    return date.getTime() - asUTC;
  }
  function msUntilNextMidnight(){
    const now = new Date();
    const p = tzParts(now, APP_TZ);
    const tomorrowNoon = new Date(Date.UTC(+p.year, +p.month-1, +p.day, 12) + DAY_MS);
    const y2 = tomorrowNoon.getUTCFullYear(), m2 = tomorrowNoon.getUTCMonth()+1, d2 = tomorrowNoon.getUTCDate();
    const offset = tzOffsetToUTC(new Date(Date.UTC(y2, m2-1, d2, 12)));
    const next = Date.UTC(y2, m2-1, d2, 0, 0, 0) + offset + 5000;
    return Math.max(1000, next - now.getTime());
  }

  const msUTC = (y, m, d) => Date.UTC(y, m-1, d);
  function toDateObj(ms){
    const dt = new Date(ms);
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth()+1, d: dt.getUTCDate(), dow: dt.getUTCDay() };
  }
  function isoDate(ms){
    const {y,m,d} = toDateObj(ms);
    return `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
  }
  function fmtMD(ms){
    const {m,d} = toDateObj(ms);
    return `${String(m).padStart(2,"0")}/${String(d).padStart(2,"0")}`;
  }
  function normalizeISODateLoose(v){
    const s = String(v || "").trim();
    if(!s) return "";
    if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if(m) return `${String(Number(m[3]||0)).padStart(4,"0")}-${String(Number(m[1]||0)).padStart(2,"0")}-${String(Number(m[2]||0)).padStart(2,"0")}`;
    m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
    if(m) return `${String(Number(m[1]||0)).padStart(4,"0")}-${String(Number(m[2]||0)).padStart(2,"0")}-${String(Number(m[3]||0)).padStart(2,"0")}`;
    return "";
  }
  function monthKeyFromISODateLoose(v){
    const iso = normalizeISODateLoose(v);
    return (iso && iso.length >= 7) ? iso.slice(0,7) : "";
  }
  function round2(n){ return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }
  function ceil2(n){ const v = Number(n); if(!Number.isFinite(v)) return 0; return Math.ceil((v - 1e-9) * 100) / 100; }
  function parseMonthKey(s){ const [Y,M] = String(s).split("-").map(Number); return { y: Y, m: M }; }
  function monthKeyFrom(y, m){ return `${y}-${String(m).padStart(2,"0")}`; }
  function addMonthsKey(key, delta){
    const {y,m} = parseMonthKey(key);
    const mm = (y*12 + (m-1)) + delta;
    return monthKeyFrom(Math.floor(mm/12), (mm%12)+1);
  }
  function monthStartMs(key){ const {y,m} = parseMonthKey(key); return msUTC(y,m,1); }
  function daysInMonth(y, m){
    const next = (m === 12) ? msUTC(y+1,1,1) : msUTC(y,m+1,1);
    return Math.round((next - msUTC(y,m,1)) / DAY_MS);
  }
  function monthEndMs(key){ const {y,m} = parseMonthKey(key); return msUTC(y, m, daysInMonth(y,m)); }
  const addDaysMs = (ms, days) => ms + days*DAY_MS;
  const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const DOW_LONG = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const MONTHS_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const dowName = dow => DOW[dow];
  const monthName = m => MONTHS[m-1];
  const monthAbbr = m => MONTHS_ABBR[m-1];
  function monthIndex(key){ const {y,m} = parseMonthKey(key); return y*12 + (m-1); }
  function monthKeyFromIndex(i){ return monthKeyFrom(Math.floor(i/12), (i%12)+1); }
  function parseISOToMs(iso){ const [Y,M,D] = String(iso).split("-").map(Number); return msUTC(Y,M,D); }
  function clampInt(n, lo, hi){ const v = Math.floor(Number(n) || 0); return Math.max(lo, Math.min(hi, v)); }
  function clampPct(v){
    v = Number(v);
    if(!Number.isFinite(v)) return 0;
    return Math.max(0, Math.min(100, Math.round(v)));
  }

  /* ---------- money ---------- */
  const moneyFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  function fmtMoney(n){
    const v = Math.round((Number(n) + Number.EPSILON) * 100) / 100;
    return moneyFmt.format(Object.is(v, -0) ? 0 : v);
  }
  function fmtMoneyCompact(n){
    const v = Number(n) || 0;
    const abs = Math.abs(v);
    const sign = v < 0 ? "-" : "";
    const trim = s => String(s).replace(/\.0+$/,"").replace(/(\.\d*[1-9])0+$/,"$1");
    if(abs >= 1000000) return `${sign}$${trim(abs >= 10000000 ? (abs/1000000).toFixed(0) : (abs/1000000).toFixed(1))}m`;
    if(abs >= 1000) return `${sign}$${trim(abs >= 10000 ? (abs/1000).toFixed(0) : (abs/1000).toFixed(1))}k`;
    if(abs >= 100) return `${sign}$${Math.round(abs).toLocaleString("en-US")}`;
    if(Number.isInteger(abs)) return `${sign}$${abs.toLocaleString("en-US")}`;
    return `${sign}$${trim(abs.toFixed(abs >= 10 ? 1 : 2))}`;
  }

  /* ---------- transfer split (Income 2 + additional income) ---------- */
  function normalizeTransferSplit(ts){
    const o = (ts && typeof ts === "object") ? ts : {};
    const out = Object.assign({ pay2BillsPct:0, pay2SavingsPct:0, otherBillsPct:0, otherSavingsPct:0 }, o);
    out.pay2BillsPct = clampPct(out.pay2BillsPct);
    out.otherBillsPct = clampPct(out.otherBillsPct);
    out.pay2SavingsPct = clampPct(out.pay2SavingsPct);
    out.otherSavingsPct = clampPct(out.otherSavingsPct);
    if(out.pay2BillsPct + out.otherBillsPct > 100) out.otherBillsPct = Math.max(0, 100 - out.pay2BillsPct);
    if(out.pay2SavingsPct + out.otherSavingsPct > 100) out.otherSavingsPct = Math.max(0, 100 - out.pay2SavingsPct);
    return out;
  }
  function splitTransferAmount(total, pctPay2, pctOther){
    const totalC = Math.round(Number(total || 0) * 100);
    if(!Number.isFinite(totalC) || totalC <= 0) return { source1: 0, pay2: 0, other: 0 };
    let p2C = Math.round(totalC * (Number(pctPay2 || 0) / 100));
    let oC = Math.round(totalC * (Number(pctOther || 0) / 100));
    if(!Number.isFinite(p2C) || p2C < 0) p2C = 0;
    if(!Number.isFinite(oC) || oC < 0) oC = 0;
    if(p2C + oC > totalC) oC = Math.max(0, totalC - p2C);
    return { source1: (totalC - p2C - oC)/100, pay2: p2C/100, other: oC/100 };
  }

  /* ---------- pay schedule ---------- */
  function getPaydaysForPay(monthKey, pay){
    const start = monthStartMs(monthKey);
    const end = monthEndMs(monthKey);
    const p = (pay && typeof pay === "object") ? pay : {};
    const freq = String(p.frequency || "semimonthly");

    if(freq === "semimonthly"){
      const {y,m} = parseMonthKey(monthKey);
      const dim = daysInMonth(y,m);
      const dom1 = clampInt(p.semimonthlyDom1 ?? 15, 1, dim);
      const dom2 = Math.max(1, Math.min(dim, clampInt(p.semimonthlyDom2 ?? dim, 1, 31)));
      return [msUTC(y,m,dom1), msUTC(y,m,dom2)].sort((a,b)=>a-b).filter((v,i,a)=> i === 0 || v !== a[i-1]);
    }
    if(freq === "monthly"){
      const {y,m} = parseMonthKey(monthKey);
      const dim = daysInMonth(y,m);
      let dom = Number(p.monthlyDom || 0);
      if(!dom){ try{ dom = Number(String(p.anchorNextPayday).split("-")[2] || 1); }catch{ dom = 1; } }
      return [msUTC(y, m, clampInt(dom, 1, dim))];
    }
    if(freq === "custom"){
      const out = [];
      for(const iso of (Array.isArray(p.customDates) ? p.customDates : [])){
        if(String(iso).slice(0,7) === monthKey){
          const ms = parseISOToMs(iso);
          if(ms >= start && ms <= end) out.push(ms);
        }
      }
      out.sort((a,b)=>a-b);
      return out.filter((v,i,a)=> i === 0 || v !== a[i-1]);
    }
    const step = (freq === "weekly") ? 7 : 14;
    let first = parseISOToMs(p.anchorNextPayday);
    while(first > start) first = addDaysMs(first, -step);
    const out = [];
    let cur = first;
    while(cur < start) cur = addDaysMs(cur, step);
    while(cur <= end){ out.push(cur); cur = addDaysMs(cur, step); }
    return out;
  }
  function getPaydaysForMonth(monthKey, settings){
    const s = (settings && typeof settings === "object") ? settings : {};
    const p1 = getPaydaysForPay(monthKey, s.pay || {});
    const p2 = s.pay2 ? getPaydaysForPay(monthKey, s.pay2) : [];
    return p1.concat(p2).sort((a,b)=>a-b).filter((v,i,a)=> i === 0 || v !== a[i-1]);
  }
  function getPayCapInfoForMonth(monthKey, settings, paydays){
    const s = (settings && typeof settings === "object") ? settings : {};
    const days = (Array.isArray(paydays) ? paydays : getPaydaysForMonth(monthKey, s)).slice().sort((a,b)=>a-b);
    const p1 = s.pay || {};
    const p2 = s.pay2 || null;
    const p1days = getPaydaysForPay(monthKey, p1);
    const p2days = p2 ? getPaydaysForPay(monthKey, p2) : [];
    const baseCaps = new Map(), cap1Caps = new Map(), cap2Caps = new Map();
    for(const d of days){ baseCaps.set(d, 0); cap1Caps.set(d, 0); cap2Caps.set(d, 0); }
    const cap1 = Number(p1.paycheckCap || 0);
    for(const d of p1days){
      if(baseCaps.has(d)){ baseCaps.set(d, baseCaps.get(d) + cap1); cap1Caps.set(d, cap1Caps.get(d) + cap1); }
    }
    const cap2 = p2 ? Number(p2.paycheckCap || 0) : 0;
    for(const d of p2days){
      if(baseCaps.has(d)){ baseCaps.set(d, baseCaps.get(d) + cap2); cap2Caps.set(d, cap2Caps.get(d) + cap2); }
    }
    // Additional income is credited to the pay period containing its date.
    const occ = billOccurrencesForMonth(monthKey, Array.isArray(s.otherIncomes) ? s.otherIncomes : [], s);
    const alloc = new Array(days.length).fill(0);
    let total = 0;
    const findPayIndexForDate = ms => {
      if(!days.length) return null;
      let lo = 0, hi = days.length - 1, ans = -1;
      while(lo <= hi){
        const mid = (lo + hi) >> 1;
        if(days[mid] <= ms){ ans = mid; lo = mid + 1; } else { hi = mid - 1; }
      }
      return ans >= 0 ? ans : 0;
    };
    for(const [ms, list] of occ.entries()){
      for(const it of list){
        const amt = Number(it.amount || 0);
        if(!amt) continue;
        total += amt;
        const idx = findPayIndexForDate(ms);
        if(idx != null) alloc[idx] = round2(Number(alloc[idx] || 0) + amt);
      }
    }
    const payCaps = days.map((d,i)=> round2(Number(baseCaps.get(d) || 0) + Number(alloc[i] || 0)));
    return {
      paydays: days,
      payCaps,
      pay1Caps: days.map(d=> round2(Number(cap1Caps.get(d) || 0))),
      pay2Caps: days.map(d=> round2(Number(cap2Caps.get(d) || 0))),
      minCap: payCaps.length ? Math.min(...payCaps) : 0,
      otherIncomeTotal: round2(total),
      otherIncomePerPayday: days.length ? round2(total / days.length) : 0,
      otherIncomeAlloc: alloc
    };
  }
  function nextPaydayAfterMs(ms, settings){
    let mk = isoDate(ms).slice(0,7);
    for(let guard = 0; guard < 36; guard++){
      for(const p of getPaydaysForMonth(mk, settings)) if(p > ms) return p;
      mk = addMonthsKey(mk, 1);
    }
    return null;
  }

  /* ---------- schedule rules (bills, budgets, income, withdrawals) ---------- */
  function parseAnchorIso(rule){
    const iso = String(rule.anchor || rule.iso || rule.date || rule.ymd || "");
    return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
  }
  function billOccurrencesForMonth(monthKey, bills, settings){
    const start = monthStartMs(monthKey);
    const end = monthEndMs(monthKey);
    const {y,m} = parseMonthKey(monthKey);
    const dim = daysInMonth(y,m);
    const occ = new Map();
    const addOcc = (ms, item) => {
      if(!Number.isFinite(ms) || ms < start || ms > end) return;
      if(!occ.has(ms)) occ.set(ms, []);
      occ.get(ms).push(item);
    };
    for(const b of (bills || [])){
      const rule = (b && b.rule) ? b.rule : {};
      const type = String(rule.type || "monthly_dom");
      const item = { id: b.id, name: b.name, amount: Number(b.amount) };
      if(type === "monthly_dom"){ addOcc(msUTC(y, m, clampInt(rule.dom ?? 1, 1, dim)), item); continue; }
      if(type === "weekly_dow"){
        const targetDow = clampInt(rule.dow ?? 1, 0, 6);
        for(let d = 1; d <= dim; d++){ const ms = msUTC(y,m,d); if(toDateObj(ms).dow === targetDow) addOcc(ms, item); }
        continue;
      }
      if(type === "annual_md"){
        const iso = parseAnchorIso(rule);
        if(!iso) continue;
        const mm = clampInt(Number(iso.slice(5,7)), 1, 12);
        const dd = clampInt(Number(iso.slice(8,10)), 1, 31);
        if(mm !== m) continue;
        addOcc(msUTC(y, m, clampInt(dd, 1, dim)), item);
        continue;
      }
      if(type === "one_time"){
        const iso = parseAnchorIso(rule);
        if(!iso || iso.slice(0,7) !== monthKey) continue;
        addOcc(parseISOToMs(iso), item);
        continue;
      }
      if(type === "biweekly"){
        const iso = parseAnchorIso(rule);
        if(!iso) continue;
        let first = parseISOToMs(iso);
        while(first > start) first = addDaysMs(first, -14);
        let cur = first;
        while(cur < start) cur = addDaysMs(cur, 14);
        while(cur <= end){ addOcc(cur, item); cur = addDaysMs(cur, 14); }
        continue;
      }
      if(type === "perpay"){
        // Budgets created in a month never apply to months before it.
        if(b && b._extraMonth && String(b._extraMonth).length === 7 && monthKey < String(b._extraMonth)) continue;
        for(const p of getPaydaysForMonth(monthKey, settings)) addOcc(p, item);
        continue;
      }
    }
    return occ;
  }
  function billOccurrencesForRange(startMs, endMs, bills, settings){
    if(!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return new Map();
    let mk = isoDate(startMs).slice(0,7);
    const mkEnd = isoDate(endMs).slice(0,7);
    const out = new Map();
    for(let guard = 0; guard < 36; guard++){
      for(const [dms, items] of billOccurrencesForMonth(mk, bills, settings).entries()){
        if(dms < startMs || dms > endMs) continue;
        if(!out.has(dms)) out.set(dms, []);
        out.get(dms).push(...items);
      }
      if(mk === mkEnd) break;
      mk = addMonthsKey(mk, 1);
    }
    return out;
  }

  /* ---------- debts scheduled into the Bills ledger ---------- */
  function debtPaymentAmountForSchedule(d){
    return round2(Math.max(0, Number(d?.minPayment || 0) + Number(d?.extraPayment || 0)));
  }
  function debtScheduledBillsForMonth(D, monthKey){
    const list = Array.isArray(D.debts) ? D.debts : [];
    const monthOffset = monthIndex(monthKey) - monthIndex(todayIso().slice(0,7));
    const out = [];
    for(const d of list){
      if(!d || typeof d !== "object") continue;
      const amount = debtPaymentAmountForSchedule(d);
      if(amount <= 0 || Number(d.balance || 0) <= 0) continue;
      if(opts.debtPayoffCutoff){
        const months = Number(debtPayoffCalc(d).months);
        if(Number.isFinite(months) && monthOffset >= Math.ceil(months)) continue;
      }
      const nm = String(d.name || "Debt").trim() || "Debt";
      out.push({
        id: `debt-${d.id || nm}`,
        name: `Debt: ${nm}`,
        amount,
        rule: { type: "monthly_dom", dom: clampInt(Number(d.dueDay || 1), 1, 31) },
        _debtId: d.id || ""
      });
    }
    return out;
  }
  function billsWithScheduledDebtsForMonth(D, monthKey, bills, settings){
    return (Array.isArray(bills) ? bills : []).concat(debtScheduledBillsForMonth(D, monthKey));
  }

  function paydaysInRange(startMs, endMs, ctx, settings){
    const out = [];
    if(!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return out;
    let mk = isoDate(startMs).slice(0,7);
    const mkEnd = isoDate(endMs).slice(0,7);
    for(let guard = 0; guard < 36; guard++){
      const plan = (ctx && ctx.plans) ? ctx.plans.get(mk) : null;
      const list = (plan && Array.isArray(plan.paydays)) ? plan.paydays : getPaydaysForMonth(mk, settings);
      for(const p of (list || [])) if(p >= startMs && p <= endMs) out.push(p);
      if(mk === mkEnd) break;
      mk = addMonthsKey(mk, 1);
    }
    return out.sort((a,b)=>a-b);
  }

  // Planned (budget) spending and the list of budget names hit in a range.
  function extrasSpentAndNamesForRange(startMs, endMs, ctx, extras, settings){
    if(!Array.isArray(extras) || !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return { spent: 0, names: [] };
    const names = [];
    const seen = new Set();
    let spent = 0;
    const addHit = (nm, amt, count = 1) => {
      if(!Number.isFinite(amt) || amt === 0 || count <= 0) return;
      spent += amt * count;
      if(nm && !seen.has(nm)){ seen.add(nm); names.push(nm); }
    };
    for(const b of extras){
      if(!b || typeof b !== "object") continue;
      const amt = Number(b.amount || 0);
      if(!Number.isFinite(amt) || amt === 0) continue;
      const nm = String(b.name || "Extra cost").trim() || "Extra cost";
      const rule = (b.rule && typeof b.rule === "object") ? b.rule : {};
      const type = String(rule.type || "monthly_dom");
      let rs = startMs;
      if(b._extraMonth && String(b._extraMonth).length === 7){
        const created = monthStartMs(String(b._extraMonth));
        if(Number.isFinite(created)){
          if(endMs < created) continue;
          rs = Math.max(rs, created);
        }
      }
      if(type === "perpay"){ addHit(nm, amt, paydaysInRange(rs, endMs, ctx, settings).length); continue; }
      if(type === "one_time"){
        const ms = parseISOToMs(String(rule.anchor || rule.iso || rule.date || rule.ymd || ""));
        if(Number.isFinite(ms) && ms >= rs && ms <= endMs) addHit(nm, amt, 1);
        continue;
      }
      if(type === "annual_md"){
        const iso = String(rule.anchor || rule.iso || rule.date || rule.ymd || "");
        if(!iso || iso.length < 10) continue;
        const mm = clampInt(Number(iso.slice(5,7)), 1, 12);
        const dd = clampInt(Number(iso.slice(8,10)), 1, 31);
        for(let yy = toDateObj(rs).y; yy <= toDateObj(endMs).y; yy++){
          const ms = msUTC(yy, mm, clampInt(dd, 1, daysInMonth(yy, mm)));
          if(ms >= rs && ms <= endMs) addHit(nm, amt, 1);
        }
        continue;
      }
      if(type === "biweekly"){
        const anchor = parseISOToMs(String(rule.anchor || rule.iso || rule.date || rule.ymd || ""));
        if(!Number.isFinite(anchor)) continue;
        let cur = anchor, count = 0;
        while(cur < rs) cur = addDaysMs(cur, 14);
        while(cur <= endMs){ if(cur >= rs) count += 1; cur = addDaysMs(cur, 14); }
        addHit(nm, amt, count);
        continue;
      }
      if(type === "monthly_dom"){
        const dom = clampInt(rule.dom ?? 1, 1, 31);
        let mk = isoDate(rs).slice(0,7);
        const mkEnd = isoDate(endMs).slice(0,7);
        let count = 0;
        for(let guard = 0; guard < 36; guard++){
          const {y,m} = parseMonthKey(mk);
          const ms = msUTC(y, m, clampInt(dom, 1, daysInMonth(y,m)));
          if(ms >= rs && ms <= endMs) count += 1;
          if(mk === mkEnd) break;
          mk = addMonthsKey(mk, 1);
        }
        addHit(nm, amt, count);
        continue;
      }
      if(type === "weekly_dow"){
        const targetDow = clampInt(rule.dow ?? 1, 0, 6);
        const ro = toDateObj(rs);
        let cur = msUTC(ro.y, ro.m, ro.d);
        while(cur <= endMs && toDateObj(cur).dow !== targetDow) cur = addDaysMs(cur, 1);
        let count = 0;
        while(cur <= endMs){ if(cur >= rs) count += 1; cur = addDaysMs(cur, 7); }
        addHit(nm, amt, count);
        continue;
      }
    }
    return { spent: round2(spent), names };
  }

  /* ---------- normalizers (run on load and after every change) ---------- */
  function normalizeExtras(D){
    if(!Array.isArray(D.extras)) D.extras = [];
    const seen = new Set();
    D.extras = D.extras.filter(x => x && typeof x === "object").filter(x => {
      if(!x.id) x.id = `global-x${Math.random().toString(16).slice(2)}`;
      if(seen.has(x.id)) return false;
      seen.add(x.id);
      return true;
    });
    for(const x of D.extras){
      if((x.iso || x.memo) && !x.rule){
        const iso = String(x.iso || `${(x._extraMonth || D.selectedMonth || currentMonthKey())}-01`);
        x.name = String(x.name || x.memo || "Extra cost");
        x.amount = Number(x.amount || 0);
        x.rule = { type: "one_time", anchor: iso };
        delete x.iso; delete x.memo;
      }else if(!x.name && x.memo){
        x.name = String(x.memo);
      }
    }
    return D.extras;
  }
  function normalizeSpendEntries(D){
    if(!Array.isArray(D.extraSpendEntries)) D.extraSpendEntries = [];
    for(const x of D.extraSpendEntries){
      if(!x || typeof x !== "object") continue;
      if(!x.id) x.id = `xs${Math.random().toString(16).slice(2)}`;
      x.extraId = String(x.extraId || "");
      if(isMiscExtraId(x.extraId) && !x.extraName && !x.name) x.extraName = MISC_NAME;
      x.extraName = String(x.extraName || x.name || (isMiscExtraId(x.extraId) ? MISC_NAME : "Extra cost"));
      x.note = String(x.note || x.memo || "");
      const iso = normalizeISODateLoose(x.date || x.iso || x.anchor || "");
      x.date = iso || `${(D.selectedMonth || currentMonthKey())}-01`;
      const amt = round2(Number(x.amount || 0));
      const type = (String(x.entryType || "").trim() === "refund" || amt < 0) ? "refund" : "spend";
      x.entryType = type;
      x.amount = type === "refund" ? -Math.abs(amt) : Math.abs(amt);
    }
    return D.extraSpendEntries;
  }
  function normalizeSpendTransfers(D){
    if(!Array.isArray(D.extraSpendTransfers)) D.extraSpendTransfers = [];
    for(const x of D.extraSpendTransfers){
      if(!x || typeof x !== "object") continue;
      if(!x.id) x.id = `xst${Math.random().toString(16).slice(2)}`;
      x.fromExtraId = String(x.fromExtraId || x.fromId || "");
      x.toExtraId = String(x.toExtraId || x.toId || "");
      x.fromExtraName = String(x.fromExtraName || x.fromName || "Extra cost");
      x.toExtraName = String(x.toExtraName || x.toName || "Extra cost");
      x.note = String(x.note || x.memo || "");
      const iso = normalizeISODateLoose(x.date || x.iso || x.anchor || "");
      x.date = iso || `${(D.selectedMonth || currentMonthKey())}-01`;
      x.amount = Math.max(0, round2(Number(x.amount || 0)));
    }
    return D.extraSpendTransfers;
  }
  function validTransfers(D){
    return (Array.isArray(D.extraSpendTransfers) ? D.extraSpendTransfers : [])
      .filter(x => x && x.fromExtraId && x.toExtraId && x.fromExtraId !== x.toExtraId && Number(x.amount || 0) > 0);
  }
  function normalizeEvents(D){
    if(!Array.isArray(D.events)) D.events = [];
    for(const x of D.events){
      if(!x || typeof x !== "object") continue;
      const iso = normalizeISODateLoose(x?.rule?.anchor || x?.date || x?.iso || "");
      if(!x.rule){
        if(iso) x.rule = { type: "one_time", anchor: iso };
      }else{
        if(x.rule.anchor) x.rule.anchor = normalizeISODateLoose(x.rule.anchor) || x.rule.anchor;
        if(!x.rule.type) x.rule.type = "one_time";
      }
      if(!x.event && x.name) x.event = String(x.name);
      x.event = String(x.event || "Event");
      x.item = String(x.item || "");
      x.amount = Number(x.amount || 0);
      x.name = `Event: ${x.event}${x.item ? " - " + x.item : ""}`;
      if(!x.id){
        const mk = monthKeyFromISODateLoose(iso) || (D.selectedMonth || currentMonthKey());
        x.id = `${mk}-e${Math.random().toString(16).slice(2)}`;
      }
    }
    return D.events;
  }
  const allExtrasList = D => (Array.isArray(D.extras) ? D.extras : []).filter(x => x && typeof x === "object");
  const allEventsList = D => (Array.isArray(D.events) ? D.events : []);
  const allSpendEntries = D => (Array.isArray(D.extraSpendEntries) ? D.extraSpendEntries : []);

  /* ---------- budget categories ---------- */
  function isMiscExtraId(id){ return String(id || "") === MISC_ID; }
  function compareExtraCategoryNames(a, b){
    const aId = String((a && typeof a === "object") ? (a.id || "") : "");
    const bId = String((b && typeof b === "object") ? (b.id || "") : "");
    const aName = String((a && typeof a === "object") ? (a.name || "") : (a || ""));
    const bName = String((b && typeof b === "object") ? (b.name || "") : (b || ""));
    const aMisc = isMiscExtraId(aId) || aName.trim().toLowerCase() === MISC_NAME.toLowerCase();
    const bMisc = isMiscExtraId(bId) || bName.trim().toLowerCase() === MISC_NAME.toLowerCase();
    if(aMisc !== bMisc) return aMisc ? 1 : -1;
    return aName.localeCompare(bName, undefined, { sensitivity: "base", numeric: true });
  }
  function extraSpendCategoryOptions(D){
    const out = [];
    const seen = new Set();
    const add = (id, name) => {
      const sid = String(id || "");
      if(!sid || seen.has(sid)) return;
      seen.add(sid);
      out.push({ id: sid, name: String(name || (isMiscExtraId(sid) ? MISC_NAME : "Extra cost")) });
    };
    for(const x of allExtrasList(D)) add(String(x?.id || ""), String(x?.name || "Extra cost"));
    add(MISC_ID, MISC_NAME);
    for(const it of allSpendEntries(D)) add(String(it?.extraId || ""), String(it?.extraName || (isMiscExtraId(it?.extraId) ? MISC_NAME : "Extra cost")));
    return out.sort(compareExtraCategoryNames);
  }

  function pocketPlanForPeriod(D, startMs, monthHint){
    const hint = String(monthHint || D.selectedMonth || isoDate(startMs).slice(0,7) || "").trim() || isoDate(startMs).slice(0,7);
    const ctx = memo(D, "ppctx|" + hint, () => buildPlanRange(D, addMonthsKey(hint, -1), addMonthsKey(hint, 1)));
    let plan = ctx.plans.get(hint) || null;
    if(plan && Array.isArray(plan.paydays) && plan.paydays.length){
      const sorted = plan.paydays.slice().sort((a,b)=>a-b);
      if(Number(startMs) < sorted[0]){
        const prev = ctx.plans.get(addMonthsKey(hint, -1));
        if(prev && Array.isArray(prev.paydays) && prev.paydays.length) plan = prev;
      }
    }
    if(!plan || !Array.isArray(plan.paydays) || !plan.paydays.length){
      plan = ctx.plans.get(isoDate(startMs).slice(0,7)) || plan;
    }
    return { ctx, plan };
  }
  // Misc gets whatever spending money isn't already budgeted to a category.
  function miscBudgetForRange(D, startMs, endMs, projectedBudgetTotal, monthHint){
    startMs = Number(startMs); endMs = Number(endMs);
    if(!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 0;
    if(endMs < startMs){ const t = startMs; startMs = endMs; endMs = t; }
    const plan = pocketPlanForPeriod(D, startMs, monthHint).plan;
    if(!plan || !Array.isArray(plan.paydays) || !plan.paydays.length) return 0;
    const payIndex = payIndexForDate(plan, startMs);
    if(payIndex == null || payIndex < 0) return 0;
    const miscBudget = round2(Math.max(0, round2(pocketBasePerPaycheck(D, plan, payIndex)) - round2(Number(projectedBudgetTotal || 0))));
    return miscBudget > 0.009 ? miscBudget : 0;
  }
  function extraSpendSnapshotForRange(D, startMs, endMs, extrasList, spendEntries, transferEntries){
    const extras = Array.isArray(extrasList) ? extrasList : allExtrasList(D);
    const logs = Array.isArray(spendEntries) ? spendEntries : allSpendEntries(D);
    const transfers = Array.isArray(transferEntries) ? transferEntries : validTransfers(D);
    const extraById = new Map(extras.map(x=>[String(x?.id || ""), x]).filter(([id])=>!!id));
    const map = new Map();
    const ensure = (id, fallbackName = "Extra cost") => {
      const sid = String(id || "");
      if(!sid) return null;
      if(!map.has(sid)){
        const ex = extraById.get(sid);
        map.set(sid, { id: sid, name: String(ex?.name || fallbackName || "Extra cost"), budget: 0, spent: 0, remaining: 0, entryCount: 0, transferIn: 0, transferOut: 0, transferNet: 0 });
      }else{
        const row = map.get(sid);
        const ex = extraById.get(sid);
        if(ex?.name) row.name = String(ex.name);
        else if((!row.name || row.name === "Extra cost") && fallbackName) row.name = String(fallbackName);
      }
      return map.get(sid);
    };
    for(const x of extras) if(x?.id) ensure(x.id, x.name || "Extra cost");
    for(const arr of billOccurrencesForRange(startMs, endMs, extras, D.settings).values()){
      for(const it of (arr || [])){
        if(!it?.id) continue;
        const row = ensure(it.id, it.name || "Extra cost");
        if(row) row.budget = round2(row.budget + Number(it.amount || 0));
      }
    }
    for(const it of logs){
      if(!it || typeof it !== "object") continue;
      const ms = parseISOToMs(normalizeISODateLoose(it.date || ""));
      if(!Number.isFinite(ms) || ms < startMs || ms > endMs) continue;
      const row = ensure(it.extraId, it.extraName || "Extra cost");
      if(!row) continue;
      row.spent = round2(row.spent + Number(it.amount || 0));
      row.entryCount += 1;
    }
    for(const it of transfers){
      if(!it || typeof it !== "object") continue;
      const ms = parseISOToMs(normalizeISODateLoose(it.date || ""));
      if(!Number.isFinite(ms) || ms < startMs || ms > endMs) continue;
      const amt = Math.max(0, Number(it.amount || 0));
      if(!(amt > 0)) continue;
      const fromRow = ensure(it.fromExtraId, it.fromExtraName || "Extra cost");
      const toRow = ensure(it.toExtraId, it.toExtraName || "Extra cost");
      if(fromRow){ fromRow.budget = round2(fromRow.budget - amt); fromRow.transferOut = round2(fromRow.transferOut + amt); }
      if(toRow){ toRow.budget = round2(toRow.budget + amt); toRow.transferIn = round2(toRow.transferIn + amt); }
    }
    const miscRow = ensure(MISC_ID, MISC_NAME);
    if(miscRow){
      const projectedBudgetTotal = Array.from(map.values()).filter(r => !isMiscExtraId(r?.id)).reduce((s, r)=> s + Number(r?.budget || 0), 0);
      miscRow.name = MISC_NAME;
      miscRow.budget = miscBudgetForRange(D, startMs, endMs, projectedBudgetTotal, isoDate(endMs).slice(0,7));
    }
    const items = Array.from(map.values())
      .map(x => ({ ...x, transferNet: round2(Number(x.transferIn || 0) - Number(x.transferOut || 0)), remaining: round2(Number(x.budget || 0) - Number(x.spent || 0)) }))
      .filter(x => x.budget !== 0 || x.spent > 0 || x.entryCount > 0 || x.transferIn > 0 || x.transferOut > 0);
    items.sort(compareExtraCategoryNames);
    return {
      items,
      totals: {
        budget: round2(items.reduce((s, x)=> s + Number(x.budget || 0), 0)),
        spent: round2(items.reduce((s, x)=> s + Number(x.spent || 0), 0)),
        remaining: round2(items.reduce((s, x)=> s + Number(x.remaining || 0), 0))
      }
    };
  }
  function extraSpendSnapshotForMonth(D, mk){
    return extraSpendSnapshotForRange(D, monthStartMs(mk), monthEndMs(mk));
  }

  /* ---------- savings projection ---------- */
  function getTrueSavingsMonth(settings, fallbackMonth){
    const t = (settings && settings.trueSavingsMonth != null) ? String(settings.trueSavingsMonth).trim() : "";
    return t || (fallbackMonth || "");
  }
  function projectedSavingsAtMonthStart(D, targetMonth, settings, goalOverride){
    settings = settings || D.settings;
    const mk = String(targetMonth || "").trim();
    if(!mk) return 0;
    const goal = Number((goalOverride != null && Number.isFinite(Number(goalOverride))) ? goalOverride : (settings?.savings?.monthlyGoal || 0));
    const trueMonth = getTrueSavingsMonth(settings, mk);
    const trueBal = Number(settings?.baseSavingsBalance || 0);
    const a = monthIndex(mk), b = monthIndex(trueMonth);
    if(!Number.isFinite(a) || !Number.isFinite(b)) return round2(trueBal);
    let base = round2(trueBal + ((a - b) * goal));
    // Planned withdrawals between the savings month and the target month come off.
    let evSum = 0;
    for(const x of allEventsList(D)){
      if(!x) continue;
      const iso = normalizeISODateLoose(x?.rule?.anchor || x?.date || x?.iso || "");
      if(!iso) continue;
      const ix = monthIndex(iso.slice(0,7));
      if(!Number.isFinite(ix) || ix < b || ix >= a) continue;
      evSum += Number(x.amount || 0);
    }
    if(evSum) base = round2(base - evSum);
    return round2(base);
  }

  /* ---------- the Bills-account plan ---------- */
  function computeAS2ForMonth(monthKey, settings, bills){
    const paydays = getPaydaysForMonth(monthKey, settings);
    const occ = billOccurrencesForMonth(monthKey, bills, settings);
    const start = monthStartMs(monthKey), end = monthEndMs(monthKey);
    const P1 = paydays.length > 0 ? paydays[0] : addDaysMs(end, 1);
    let pre = 0;
    for(let ms = start; ms <= end; ms = addDaysMs(ms, 1)){
      if(ms < P1) for(const it of (occ.get(ms) || [])) pre += Number(it.amount);
    }
    return { as2: round2(pre + Number(settings.cushion || 0)), prePaycheckTotal: round2(pre), P1, paydays };
  }

  // Builds month plans from baseMonth through toMonthInclusive (the month after is
  // computed too, for its carry target). A range may start before the starting
  // month; the starting month still resets to the real starting balance.
  function buildPlanRange(D, baseMonth, toMonthInclusive, settings, bills){
    settings = settings || D.settings;
    bills = bills || D.bills || [];
    const months = [];
    const baseIndex = monthIndex(baseMonth);
    const toIndex = monthIndex(toMonthInclusive) + 1;
    for(let i = baseIndex; i <= toIndex; i++) months.push(monthKeyFromIndex(i));

    const as2Map = new Map(), paydaysMap = new Map(), occMap = new Map(), extraOccMap = new Map(), eventOccMap = new Map(), tb1Map = new Map();
    const allExtras = allExtrasList(D);
    const allEvents = allEventsList(D);

    for(const mk of months){
      const ledgerBills = billsWithScheduledDebtsForMonth(D, mk, bills, settings);
      const occ = billOccurrencesForMonth(mk, ledgerBills, settings);
      occMap.set(mk, occ);
      extraOccMap.set(mk, billOccurrencesForMonth(mk, allExtras, D.settings));
      eventOccMap.set(mk, billOccurrencesForMonth(mk, allEvents, D.settings));
      let tb1 = 0;
      for(const arr of occ.values()) for(const it of arr) tb1 += Number(it.amount);
      tb1Map.set(mk, round2(tb1));
      const { as2, paydays } = computeAS2ForMonth(mk, settings, ledgerBills);
      as2Map.set(mk, as2);
      paydaysMap.set(mk, paydays);
    }

    const plans = new Map();
    const seedMonth = String(baseMonth || "").trim();
    const anchorMonth = String((settings && settings.baseMonth) ? settings.baseMonth : seedMonth).trim() || seedMonth;
    let billsStart = (seedMonth && anchorMonth && seedMonth === anchorMonth)
      ? Number(settings.baseBillsBalance || 0)
      : Number(as2Map.get(seedMonth) || 0);
    let savingsStart = Number(projectedSavingsAtMonthStart(D, seedMonth, settings) || 0);

    for(let idx = 0; idx < months.length - 1; idx++){
      const mk = months[idx];
      const nextMk = months[idx+1];
      if(anchorMonth && mk === anchorMonth && mk !== seedMonth) billsStart = Number(settings.baseBillsBalance || 0);

      const monthStart = monthStartMs(mk);
      const monthEnd = monthEndMs(mk);
      const startBills = billsStart;
      const startSavings = savingsStart;
      const AS2 = as2Map.get(mk);
      const TargetCarry = as2Map.get(nextMk);
      const TB1 = tb1Map.get(mk);
      const payCapInfo = getPayCapInfoForMonth(mk, settings, paydaysMap.get(mk));
      const paydays = payCapInfo.paydays;
      const sortedPaydays = paydays.slice().sort((a,b)=>a-b);
      const lastPayday = sortedPaydays.length ? sortedPaydays[sortedPaydays.length-1] : null;
      const nextPaydayAfterLast = (lastPayday != null) ? nextPaydayAfterMs(lastPayday, settings) : null;
      const occ = occMap.get(mk);
      const xocc = extraOccMap.get(mk);
      const eocc = eventOccMap.get(mk);

      // Work in "working" terms: the balance is expected to touch the cushion at least
      // once; cash above the planned seed is kept but left out of the working balance.
      const cushion = Number(settings.cushion || 0);
      const seedForPlanning = round2(AS2);
      const b0 = round2(seedForPlanning - cushion);
      const N = paydays.length;
      const savingsGoal = Number(settings.savings.monthlyGoal || 0);
      const savingsPerPaycheck = N > 0 ? round2(savingsGoal / N) : 0;
      const cap = Number(payCapInfo.minCap || 0);
      const maxBillsPerPaycheck = Math.max(0, round2(cap - savingsPerPaycheck));

      // Transfer that lands next month exactly at its carry target...
      const nominalBillsPerPaycheck = N > 0 ? ceil2(Math.max(0, TargetCarry + TB1 - seedForPlanning) / N) : 0;
      // ...and the smallest transfer that never dips below the cushion.
      let minBillsPerPaycheckForCushion = 0;
      if(N > 0){
        let Dp = 0, W = 0, maxReq = 0;
        for(let t = monthStart; t <= monthEnd; t = addDaysMs(t, 1)){
          if(paydays.includes(t)) Dp += 1;
          for(const it of (occ.get(t) || [])) W += Number(it.amount);
          if(Dp > 0){ const req = (W - b0) / Dp; if(req > maxReq) maxReq = req; }
        }
        minBillsPerPaycheckForCushion = ceil2(Math.max(0, maxReq));
      }
      const desiredBillsPerPaycheck = Math.max(nominalBillsPerPaycheck, minBillsPerPaycheckForCushion);
      const billsPerPaycheck = Math.min(desiredBillsPerPaycheck, maxBillsPerPaycheck);

      // If the paycheck can't cover it, find the extra needed at month start.
      let extraFunding = 0;
      if(N > 0){
        let Dp = 0, W = 0, maxNeed = 0;
        for(let t = monthStart; t <= monthEnd; t = addDaysMs(t, 1)){
          if(paydays.includes(t)) Dp += 1;
          for(const it of (occ.get(t) || [])) W += Number(it.amount);
          const need = W - (b0 + (billsPerPaycheck * Dp));
          if(need > maxNeed) maxNeed = need;
        }
        const endWithoutExtra = round2(seedForPlanning + (billsPerPaycheck * N) - TB1);
        extraFunding = ceil2(Math.max(Math.max(0, maxNeed), Math.max(0, TargetCarry - endWithoutExtra)));
      }else{
        extraFunding = ceil2(Math.max(0, TargetCarry - round2(seedForPlanning - TB1)));
      }

      const seedWanted = round2(seedForPlanning + extraFunding);
      const billsStartSurplus = round2(Math.max(0, billsStart - seedWanted));
      const topup = round2(Math.max(0, seedWanted - billsStart));
      const startAfterTopup = round2(billsStart + topup);

      const rows = [];
      let billsBal = startAfterTopup;
      let savingsBal = savingsStart;
      let lowestBillsBal = Infinity;
      let lowestBillsBalDate = null;
      for(let ms = monthStart; ms <= monthEnd; ms = addDaysMs(ms, 1)){
        const isPayday = paydays.includes(ms);
        let transferIn = 0, savingsIn = 0, billsOut = 0, pocketOut = 0, savingsOut = 0;
        const notes = [];
        if(isPayday){ transferIn += billsPerPaycheck; savingsIn += savingsPerPaycheck; notes.push("Payday transfer"); }
        const dayBills = occ.get(ms) || [];
        if(dayBills.length){
          for(const it of dayBills) billsOut += Number(it.amount);
          notes.push(dayBills.map(x=>x.name).join(", "));
        }
        for(const it of (xocc.get(ms) || [])) pocketOut += Number(it.amount);
        for(const it of ((eocc && eocc.get(ms)) || [])) savingsOut += Number(it.amount || 0);
        billsBal = round2(billsBal + transferIn - billsOut);
        savingsBal = round2(savingsBal + savingsIn - savingsOut);
        const billsBalDisplay = round2(billsBal - billsStartSurplus);
        if(billsBalDisplay < lowestBillsBal){ lowestBillsBal = billsBalDisplay; lowestBillsBalDate = ms; }
        rows.push({
          ms,
          transferIn: round2(transferIn),
          billsOut: round2(billsOut),
          savingsIn: round2(savingsIn),
          savingsOut: round2(savingsOut),
          pocketOut: round2(pocketOut),
          billsBalance: billsBal,
          billsBalanceWorking: billsBalDisplay,
          savingsBalance: savingsBal,
          notes: notes.length ? notes.join(" • ") : "—",
          isPayday,
          billItems: dayBills.map(it => ({ id: it.id, name: String(it?.name || "").trim(), amount: Number(it?.amount || 0), debtId: it._debtId || "" })),
          eventItems: ((eocc && eocc.get(ms)) || []).map(it => ({ id: it.id, name: String(it?.name || ""), amount: Number(it?.amount || 0) }))
        });
      }

      // Planned budget spending per pay period; the last period runs into next month.
      const spentByPayIndex = new Array(Math.max(0, sortedPaydays.length)).fill(0);
      if(sortedPaydays.length){
        for(const r of rows){
          if(r.pocketOut <= 0) continue;
          let pi = -1;
          for(let i = 0; i < sortedPaydays.length; i++){ if(sortedPaydays[i] <= r.ms) pi = i; else break; }
          if(pi >= 0) spentByPayIndex[pi] = round2(spentByPayIndex[pi] + r.pocketOut);
        }
        if(nextPaydayAfterLast){
          const lastIdx = sortedPaydays.length - 1;
          const addStart = addDaysMs(monthEnd, 1);
          const addEnd = addDaysMs(nextPaydayAfterLast, -1);
          if(addStart <= addEnd){
            for(const items of billOccurrencesForRange(addStart, addEnd, allExtras, settings).values()){
              for(const it of items) spentByPayIndex[lastIdx] = round2(spentByPayIndex[lastIdx] + Number(it.amount || 0));
            }
          }
        }
      }

      billsStart = billsBal;
      savingsStart = savingsBal;
      plans.set(mk, {
        mk, monthStart, monthEnd, AS2, TargetCarry, TB1,
        paydays, payCaps: payCapInfo.payCaps, minPayCap: cap,
        otherIncomeTotal: payCapInfo.otherIncomeTotal, otherIncomePerPayday: payCapInfo.otherIncomePerPayday, otherIncomeAlloc: payCapInfo.otherIncomeAlloc,
        nextPaydayAfterLast, billsPerPaycheck, desiredBillsPerPaycheck, nominalBillsPerPaycheck, minBillsPerPaycheckForCushion, maxBillsPerPaycheck,
        extraFunding, savingsPerPaycheck, savingsGoal, topup, sweepOut: 0, startAfterTopup,
        TB2_at_start: round2(startBills), rows,
        startBills: round2(startBills), startSavings: round2(startSavings), billsStartSurplus: round2(billsStartSurplus),
        endBills: billsBal, endSavings: savingsBal,
        lowestBillsBal: round2(lowestBillsBal), lowestBillsBalDate,
        pocketSpentByPayIndex: spentByPayIndex
      });
    }
    return { plans };
  }

  // Stand-in plan when the viewed month can't be planned (keeps screens from blanking).
  function placeholderPlan(D, mk){
    const { as2, paydays } = computeAS2ForMonth(mk, D.settings, billsWithScheduledDebtsForMonth(D, mk, D.bills, D.settings));
    const savingsGoal = Number(D.settings.savings?.monthlyGoal || 0);
    return {
      mk, monthKey: mk, monthStart: monthStartMs(mk), monthEnd: monthEndMs(mk), paydays: paydays || [], payCaps: [], AS2: as2,
      billsPerPaycheck: 0, nominalBillsPerPaycheck: 0,
      savingsPerPaycheck: (paydays && paydays.length) ? round2(savingsGoal / paydays.length) : 0, savingsGoal,
      topup: 0, sweepOut: 0, startAfterTopup: 0, TB2_at_start: 0, rows: [], startBills: 0,
      startSavings: round2(Number(projectedSavingsAtMonthStart(D, mk, D.settings) || 0)),
      endBills: 0, endSavings: 0, lowestBillsBal: 0, lowestBillsBalDate: null, pocketSpentByPayIndex: [], __invalid: true
    };
  }

  /* ---------- spending money per pay period ("pocket") ---------- */
  function capForPayIndex(D, plan, payIndex){
    const capFromPlan = (plan && Array.isArray(plan.payCaps)) ? Number(plan.payCaps[payIndex]) : NaN;
    const fallbackCap = Number(D.settings.pay?.paycheckCap || 0) + (D.settings.pay2 ? Number(D.settings.pay2.paycheckCap || 0) : 0);
    return (Number.isFinite(capFromPlan) && capFromPlan > 0) ? capFromPlan : fallbackCap;
  }
  function pocketBasePerPaycheck(D, plan, payIndex){
    return round2(capForPayIndex(D, plan, payIndex) - plan.billsPerPaycheck - plan.savingsPerPaycheck);
  }
  function pocketNetForPayIndex(D, plan, payIndex){
    return round2(pocketBasePerPaycheck(D, plan, payIndex) - Number(plan.pocketSpentByPayIndex?.[payIndex] || 0));
  }
  function pocketHealth(D, plan){
    if(!plan || !Array.isArray(plan.paydays) || plan.paydays.length === 0) return null;
    const N = plan.paydays.length;
    let minBase = Infinity, maxBase = -Infinity, minNet = Infinity, maxNet = -Infinity, spentSum = 0, baseSum = 0, capMin = Infinity, capMax = -Infinity;
    for(let i = 0; i < N; i++){
      const cap = capForPayIndex(D, plan, i);
      if(Number.isFinite(cap)){ capMin = Math.min(capMin, cap); capMax = Math.max(capMax, cap); }
      const base = pocketBasePerPaycheck(D, plan, i);
      const spent = Number(plan.pocketSpentByPayIndex?.[i] || 0);
      const net = round2(base - spent);
      minBase = Math.min(minBase, base); maxBase = Math.max(maxBase, base);
      minNet = Math.min(minNet, net); maxNet = Math.max(maxNet, net);
      baseSum += base; spentSum += spent;
    }
    return {
      N,
      capMin: Number.isFinite(capMin) ? round2(capMin) : 0,
      capMax: Number.isFinite(capMax) ? round2(capMax) : 0,
      savingsPerPaycheck: round2(Number(plan.savingsPerPaycheck || 0)),
      billsPerPaycheck: round2(Number(plan.billsPerPaycheck || 0)),
      required: round2(Number(plan.savingsPerPaycheck || 0) + Number(plan.billsPerPaycheck || 0)),
      minBase: round2(minBase), maxBase: round2(maxBase), minNet: round2(minNet), maxNet: round2(maxNet),
      spentSum: round2(spentSum), baseAvg: round2(baseSum / N)
    };
  }
  const pocketSurvivalMinimum = D => Math.max(0, round2(Number(D?.settings?.pocket?.minimumSurvival || 0)));
  const pocketThresholdMode = D => D?.settings?.pocket?.thresholdMode === "base" ? "base" : "net";
  function pocketMinimumInfo(D, plan, payIndex, netOverride, spentOverride){
    const minimum = pocketSurvivalMinimum(D);
    if(!(minimum > 0.009) || !plan || payIndex == null || payIndex < 0) return null;
    const mode = pocketThresholdMode(D);
    const base = round2(pocketBasePerPaycheck(D, plan, payIndex));
    const spentNum = Number(spentOverride);
    const spent = round2(Number.isFinite(spentNum) ? spentNum : Number(plan.pocketSpentByPayIndex?.[payIndex] || 0));
    const netNum = Number(netOverride);
    const net = round2(Number.isFinite(netNum) ? netNum : (base - spent));
    const metricValue = round2(mode === "base" ? base : net);
    if(metricValue >= (minimum - 0.009)) return null;
    const billsPer = round2(Number(plan.billsPerPaycheck || 0));
    const savPer = round2(Number(plan.savingsPerPaycheck || 0));
    return {
      mode, metricValue, minimum, base, spent, net,
      shortBy: round2(minimum - metricValue),
      cap: round2(capForPayIndex(D, plan, payIndex)),
      billsPer, savPer, required: round2(billsPer + savPer)
    };
  }
  function pocketPayPeriods(D, plan){
    const paydays = (plan.paydays || []).slice().sort((a,b)=>a-b);
    const periods = [];
    for(let i = 0; i < paydays.length; i++){
      const start = paydays[i];
      let next = (i < paydays.length - 1) ? paydays[i+1] : (plan.nextPaydayAfterLast || null);
      if(!next || next <= start) next = addDaysMs(plan.monthEnd, 1);
      const base = pocketBasePerPaycheck(D, plan, i);
      const spent = Number(plan.pocketSpentByPayIndex?.[i] || 0);
      periods.push({ payIndex: i, start, end: addDaysMs(next, -1), pocketBase: base, pocketSpent: round2(spent), pocketNet: round2(base - spent) });
    }
    return periods;
  }
  function payIndexForDate(plan, ms){
    if(!plan || !Array.isArray(plan.paydays) || plan.paydays.length === 0) return null;
    const sorted = plan.paydays.slice().sort((a,b)=>a-b);
    let idx = -1;
    for(let i = 0; i < sorted.length; i++){ if(sorted[i] <= ms) idx = i; else break; }
    return Math.max(0, idx);
  }

  // Pay periods shown in the "spending money" list for a month: every period starting
  // in this month or the next; "include last period" slides the window back by one.
  function pocketWindow(D, mk, shiftedBackOne){
    const mkStart = monthStartMs(mk);
    const twoMonthsOut = addMonthsKey(mk, 2);
    const twoMonthsOutStart = monthStartMs(twoMonthsOut);
    const pctx = memo(D, "pwctx|" + mk, () => buildPlanRange(D, addMonthsKey(mk, -1), addMonthsKey(twoMonthsOut, 1)));
    const allExtras = allExtrasList(D);
    const allPeriods = [];
    const seenStarts = new Set();
    for(const plan of pctx.plans.values()){
      if(!plan) continue;
      for(const pp of pocketPayPeriods(D, plan)){
        if(seenStarts.has(pp.start)) continue;
        seenStarts.add(pp.start);
        pp.cap = capForPayIndex(D, plan, pp.payIndex);
        pp.savings = Number(plan.savingsPerPaycheck || 0);
        pp.bills = Number(plan.billsPerPaycheck || 0);
        allPeriods.push(pp);
      }
    }
    allPeriods.sort((a,b)=>a.start-b.start);
    const normalPeriods = allPeriods.filter(pp => pp.start >= mkStart && pp.start < twoMonthsOutStart);
    const desiredCount = Math.max(1, normalPeriods.length || 0);
    let firstNormalIdx = normalPeriods.length
      ? allPeriods.findIndex(pp => pp.start === normalPeriods[0].start)
      : allPeriods.findIndex(pp => pp.start >= mkStart);
    if(firstNormalIdx < 0) firstNormalIdx = 0;
    const startIdx = shiftedBackOne ? Math.max(0, firstNormalIdx - 1) : Math.max(0, firstNormalIdx);
    const windowPeriods = allPeriods.slice(startIdx, startIdx + desiredCount);

    let warn = null;
    if(windowPeriods.length){
      const maxBase = Math.max(...windowPeriods.map(p=>Number(p.pocketBase || 0)));
      const minBase = Math.min(...windowPeriods.map(p=>Number(p.pocketBase || 0)));
      const p0 = windowPeriods[0];
      const cap0 = Number(p0.cap || 0), sav0 = round2(Number(p0.savings || 0)), bil0 = round2(Number(p0.bills || 0)), req0 = round2(sav0 + bil0);
      if(Math.abs(maxBase) < 0.01 && req0 >= (cap0 - 0.01)) warn = { kind: "consumed", maxBase, cap: cap0, savings: sav0, bills: bil0, required: req0 };
      else if(minBase < 0) warn = { kind: "negative", minBase };
    }

    const periods = windowPeriods.map(pp => {
      const secMk = isoDate(pp.start).slice(0,7);
      const plan = pctx.plans.get(secMk);
      const ex = extrasSpentAndNamesForRange(pp.start, pp.end, pctx, allExtras, D.settings);
      const snap = extraSpendSnapshotForRange(D, pp.start, pp.end);
      const planned = round2(ex.spent || 0);
      const loggedSpent = round2(snap?.totals?.spent || 0);
      const freeAfterBudgets = round2(pp.pocketBase - planned);
      return {
        mk: secMk, key: `${secMk}|${pp.start}|${pp.end}`, payIndex: pp.payIndex, start: pp.start, end: pp.end,
        base: pp.pocketBase, planned, names: ex.names.slice(), loggedSpent,
        freeAfterBudgets, available: round2(pp.pocketBase - loggedSpent),
        spentOver: loggedSpent > (round2(pp.pocketBase) + 0.005),
        threshold: pocketMinimumInfo(D, plan, pp.payIndex, freeAfterBudgets, planned)
      };
    });
    return { periods, warn, ctx: pctx };
  }

  // The full "how is this pay period's spending money built" breakdown.
  function pocketBreakdown(D, ctx, mk, startMs, endMs){
    startMs = Number(startMs); endMs = Number(endMs);
    if(endMs < startMs){ const t = startMs; startMs = endMs; endMs = t; }
    mk = String(mk || "").trim() || isoDate(startMs).slice(0,7);
    const plan = ctx?.plans?.get(mk);
    if(!plan) return null;
    const payIndex = payIndexForDate(plan, startMs);
    const cap = round2(capForPayIndex(D, plan, payIndex));
    const billsPer = round2(Number(plan.billsPerPaycheck || 0));
    const savPer = round2(Number(plan.savingsPerPaycheck || 0));
    const base = round2(pocketBasePerPaycheck(D, plan, payIndex));
    const capInfo = getPayCapInfoForMonth(mk, D.settings, plan.paydays);
    const cap1 = round2(Number(capInfo.pay1Caps?.[payIndex] || 0));
    const cap2 = round2(Number(capInfo.pay2Caps?.[payIndex] || 0));
    const capOther = round2(Number(capInfo.otherIncomeAlloc?.[payIndex] || 0));
    const multiCap = cap2 > 0.009 || capOther > 0.009;
    const split = normalizeTransferSplit(D.settings.transferSplit);
    const p2BillsPct = cap2 > 0.009 ? split.pay2BillsPct : 0;
    const otherBillsPct = capOther > 0.009 ? split.otherBillsPct : 0;
    const p2SavPct = cap2 > 0.009 ? split.pay2SavingsPct : 0;
    const otherSavPct = capOther > 0.009 ? split.otherSavingsPct : 0;

    const occ = billOccurrencesForRange(startMs, endMs, allExtrasList(D), D.settings);
    let planned = 0;
    for(const arr of occ.values()) for(const it of arr){ const a = round2(Number(it?.amount || 0)); if(Number.isFinite(a) && a !== 0) planned = round2(planned + a); }
    const snap = extraSpendSnapshotForRange(D, startMs, endMs);
    const actualSpent = round2(snap?.totals?.spent || 0);
    const freeAfterBudgets = round2(base - planned);
    const available = round2(base - actualSpent);

    // Planned vs actual by category name (Misc gets the unbudgeted remainder).
    const byName = new Map();
    for(const it of snap.items){
      const nm = String(it.name || "").trim() || "Uncategorized";
      if(!byName.has(nm)) byName.set(nm, { name: nm, planned: 0, actual: 0 });
      const r = byName.get(nm);
      r.planned = round2(r.planned + Number(it.budget || 0));
      r.actual = round2(r.actual + Number(it.spent || 0));
    }
    const categories = Array.from(byName.values())
      .filter(r => Math.abs(r.planned) > 0.0001 || Math.abs(r.actual) > 0.0001)
      .sort(compareExtraCategoryNames)
      .map(r => ({ ...r, planned: Math.abs(r.planned), actual: Math.abs(r.actual), over: Math.abs(r.actual) > Math.abs(r.planned) + 0.0001 }));

    return {
      mk, startMs, endMs, payIndex, cap, cap1, cap2, capOther, multiCap,
      billsPer, savPer, base,
      billsSplit: splitTransferAmount(billsPer, p2BillsPct, otherBillsPct), p2BillsPct, otherBillsPct,
      savSplit: splitTransferAmount(savPer, p2SavPct, otherSavPct), p2SavPct, otherSavPct,
      planned, plannedDisplay: round2(planned + Math.max(0, base - planned)),
      actualSpent, freeAfterBudgets, available,
      threshold: pocketMinimumInfo(D, plan, payIndex, freeAfterBudgets, actualSpent),
      categories
    };
  }

  /* ---------- ledger days ---------- */
  // The viewed month plus a few days either side. Days from a month the main plan
  // doesn't cover come from `extraCtx` (v4 simply dropped them).
  function ledgerDays(D, ctx, mk, beforeAfter, collapseEmpty, extraCtx){
    const plan = ctx.plans.get(mk);
    if(!plan) return [];
    const ba = Number.isFinite(Number(beforeAfter)) ? clampInt(beforeAfter, 0, 31) : 3;
    const out = [];
    for(let ms = addDaysMs(plan.monthStart, -ba); ms <= addDaysMs(plan.monthEnd, ba); ms = addDaysMs(ms, 1)){
      const dayMonth = isoDate(ms).slice(0,7);
      const dayPlan = ctx.plans.get(dayMonth) || extraCtx?.plans?.get(dayMonth);
      if(!dayPlan) continue;
      const row = dayPlan.rows.find(r => r.ms === ms);
      if(!row) continue;
      const isPrev = monthIndex(dayMonth) < monthIndex(mk);
      const isNext = monthIndex(dayMonth) > monthIndex(mk);
      const isPayday = dayPlan.paydays.includes(ms);
      // Bills-account or savings movement. Budget-only days don't count: budgets
      // come out of spending money, not these accounts.
      const movement = Math.abs(row.transferIn) > 0.0001 || Math.abs(row.billsOut) > 0.0001
        || Math.abs(row.savingsIn) > 0.0001 || Math.abs(row.savingsOut) > 0.0001;
      const keepBoundary = ms === plan.monthStart || ms === plan.monthEnd;
      if(collapseEmpty && !movement && !keepBoundary && !((isPrev || isNext) && isPayday)) continue;
      out.push({ ms, row, isPrev, isNext, isPayday, dayMonth, movement, beforeStart: !ctx.plans.get(dayMonth) });
    }
    return out;
  }

  /* ---------- month stats (the ten dashboard numbers) ---------- */
  const STAT_KEYS = ["startBalance","fixedTransfer","targetCarry","monthBillsTotal","monthBillsPlusPocket","lowestBillsBalance","as2","tb2","eomBills","pocketMonth"];
  function monthStats(D, plan){
    const rows = plan.rows || [];
    const billsTotal = round2(rows.reduce((a,r)=> a + Number(r.billsOut || 0), 0));
    const pocketTotal = round2(rows.reduce((a,r)=> a + Number(r.pocketOut || 0), 0));
    const N = (plan.paydays || []).length;
    const payIncome = round2((plan.payCaps || []).reduce((a,v)=> a + Number(v || 0), 0) || (N * Number(D.settings.pay?.paycheckCap || 0)));
    const taken = round2(N * (plan.billsPerPaycheck + plan.savingsPerPaycheck));
    const spent = round2((plan.pocketSpentByPayIndex || []).reduce((a,b)=> a + Number(b || 0), 0));
    return {
      startBalance: plan.startAfterTopup,
      fixedTransfer: plan.billsPerPaycheck,
      targetCarry: plan.TargetCarry,
      monthBillsTotal: billsTotal,
      monthBillsPlusPocket: round2(billsTotal + pocketTotal),
      lowestBillsBalance: plan.lowestBillsBal,
      as2: plan.AS2,
      tb2: plan.TB2_at_start,
      eomBills: plan.endBills,
      pocketMonth: round2(payIncome - taken - spent),
      _paydayCount: N,
      _lowestDate: plan.lowestBillsBalDate
    };
  }

  /* ---------- Track spending: pay periods, summaries, graphs ---------- */
  // The pay period (payday to day before next payday) that contains a date.
  function spendPeriodInfo(D, iso){
    const norm = normalizeISODateLoose(iso || "");
    if(!norm) return { key: `nodate|${String(iso || "")}`, startIso: "", endIso: "" };
    const ms = parseISOToMs(norm);
    const mkForDate = norm.slice(0,7);
    let paydays = [];
    for(let i = -2; i <= 4; i++) paydays = paydays.concat(getPaydaysForMonth(addMonthsKey(mkForDate, i), D.settings || {}));
    paydays = paydays.sort((a,b)=>a-b).filter((v,i,a)=> i === 0 || v !== a[i-1]);
    let start = null, next = null;
    for(const p of paydays){ if(p <= ms) start = p; else { next = p; break; } }
    if(start == null) start = monthStartMs(mkForDate);
    if(next == null || next <= start) next = addDaysMs(monthEndMs(mkForDate), 1);
    const startIso = isoDate(start), endIso = isoDate(addDaysMs(next, -1));
    return { key: `${mkForDate}|${startIso}|${endIso}`, startIso, endIso };
  }
  // The pay period Track spending treats as active: the one holding the date box,
  // today if it's in the viewed month, otherwise the 1st of the viewed month.
  function spendActivePeriod(D, mk, preferredIso){
    let anchorIso = normalizeISODateLoose(preferredIso || "");
    if(!anchorIso || anchorIso.slice(0,7) !== mk){
      const t = todayIso();
      anchorIso = (t.slice(0,7) === mk) ? t : `${mk}-01`;
    }
    const period = spendPeriodInfo(D, anchorIso);
    const startMs = parseISOToMs(period.startIso), endMs = parseISOToMs(period.endIso);
    const snapshot = (Number.isFinite(startMs) && Number.isFinite(endMs))
      ? extraSpendSnapshotForRange(D, startMs, endMs)
      : { items: [], totals: { budget: 0, spent: 0, remaining: 0 } };
    return { ...period, anchorIso, startMs, endMs, snapshot };
  }
  function periodStartsAround(D, monthKey, fromOffset, toOffset){
    const starts = [];
    for(let off = fromOffset; off <= toOffset; off++){
      starts.push(...getPaydaysForMonth(addMonthsKey(monthKey, off), D.settings || {}));
    }
    return starts.filter((v,i,a)=> Number.isFinite(v) && a.indexOf(v) === i).sort((a,b)=>a-b);
  }
  // Month totals = the pay periods that END in the month, added up by category.
  function spendMonthSummary(D, monthKey){
    const monthStart = monthStartMs(monthKey), monthEnd = monthEndMs(monthKey);
    const periodStarts = periodStartsAround(D, monthKey, -1, 1);
    if(!periodStarts.length) return extraSpendSnapshotForMonth(D, monthKey);
    const itemsMap = new Map();
    for(const ps of periodStarts){
      const nextPayday = nextPaydayAfterMs(ps, D.settings || {});
      if(!Number.isFinite(nextPayday)) continue;
      const pe = addDaysMs(nextPayday, -1);
      if(!Number.isFinite(pe) || pe < ps) continue;
      if(!(pe >= monthStart && ps <= monthEnd) || isoDate(pe).slice(0,7) !== monthKey) continue;
      for(const row of extraSpendSnapshotForRange(D, ps, pe).items){
        const sid = String(row?.id || "");
        if(!sid) continue;
        if(!itemsMap.has(sid)) itemsMap.set(sid, { id: sid, name: String(row?.name || "Extra cost"), budget: 0, spent: 0, remaining: 0, entryCount: 0, transferIn: 0, transferOut: 0, transferNet: 0 });
        const t = itemsMap.get(sid);
        if(row?.name) t.name = String(row.name);
        t.budget = round2(t.budget + Number(row?.budget || 0));
        t.spent = round2(t.spent + Number(row?.spent || 0));
        t.entryCount += Number(row?.entryCount || 0);
        t.transferIn = round2(t.transferIn + Number(row?.transferIn || 0));
        t.transferOut = round2(t.transferOut + Number(row?.transferOut || 0));
        t.transferNet = round2(t.transferNet + Number(row?.transferNet || 0));
      }
    }
    const items = Array.from(itemsMap.values()).map(r => ({ ...r, remaining: round2(Number(r.budget || 0) - Number(r.spent || 0)) })).sort(compareExtraCategoryNames);
    return {
      items,
      totals: {
        budget: round2(items.reduce((s,r)=> s + Number(r?.budget || 0), 0)),
        spent: round2(items.reduce((s,r)=> s + Number(r?.spent || 0), 0)),
        remaining: round2(items.reduce((s,r)=> s + Number(r?.remaining || 0), 0))
      }
    };
  }
  function graphRowFor(D, ps, pe, todayMs){
    const snap = extraSpendSnapshotForRange(D, ps, pe);
    return {
      id: `${isoDate(ps)}_${isoDate(pe)}`, startMs: ps, endMs: pe,
      budget: round2(Number(snap?.totals?.budget || 0)), spent: 0, entryCount: 0,
      isCurrentPeriod: Number.isFinite(todayMs) && todayMs >= ps && todayMs <= pe,
      isComplete: Number.isFinite(todayMs) ? pe < todayMs : true
    };
  }
  function graphAddLogs(D, rows){
    for(const it of allSpendEntries(D)){
      const ms = parseISOToMs(normalizeISODateLoose(it?.date || ""));
      if(!Number.isFinite(ms)) continue;
      const row = rows.find(r => ms >= r.startMs && ms <= r.endMs);
      if(!row) continue;
      row.spent = round2(Number(row.spent || 0) + Number(it?.amount || 0));
      row.entryCount = Number(row.entryCount || 0) + 1;
    }
  }
  function graphMeta(monthKey, rangeMode, rows, extra){
    const totalSpent = round2(rows.reduce((s,r)=> s + Number(r?.spent || 0), 0));
    const completed = rows.filter(r => r?.isComplete);
    const completedTotalSpent = round2(completed.reduce((s,r)=> s + Number(r?.spent || 0), 0));
    const averageSpent = completed.length ? round2(completedTotalSpent / completed.length) : 0;
    const maxSpent = Math.max(averageSpent, ...rows.map(r=> Number(r?.spent || 0)), ...rows.map(r=> Number(r?.budget || 0)), 0);
    return { ...(extra || {}), monthKey, rangeMode, rows, totalSpent, completedTotalSpent, averageSpent, maxSpent,
      count: rows.length, completedCount: completed.length, hasCurrentPeriod: rows.some(r => r?.isCurrentPeriod) };
  }
  // Pay periods ending in the month, with logs or the current one.
  function graphRowsForMonth(D, monthKey){
    const monthStart = monthStartMs(monthKey), monthEnd = monthEndMs(monthKey);
    const todayMs = parseISOToMs(todayIso());
    const rows = [];
    for(const ps of periodStartsAround(D, monthKey, -1, 1)){
      const next = nextPaydayAfterMs(ps, D.settings || {});
      if(!Number.isFinite(next)) continue;
      const pe = addDaysMs(next, -1);
      if(!Number.isFinite(pe) || pe < ps) continue;
      if(!(pe >= monthStart && ps <= monthEnd) || isoDate(pe).slice(0,7) !== monthKey) continue;
      rows.push(graphRowFor(D, ps, pe, todayMs));
    }
    graphAddLogs(D, rows);
    const active = rows.filter(r => Number(r?.entryCount || 0) > 0 || Number(r?.spent || 0) !== 0 || r?.isCurrentPeriod).sort((a,b)=> a.startMs - b.startMs);
    return graphMeta(monthKey, "month", active);
  }
  // The last N pay periods (ending by month end) that have logs or are current.
  function graphRowsLastN(D, monthKey, count){
    const monthEnd = monthEndMs(monthKey);
    const todayMs = parseISOToMs(todayIso());
    const rows = periodStartsAround(D, monthKey, -12, 1).map(ps => {
      const next = nextPaydayAfterMs(ps, D.settings || {});
      if(!Number.isFinite(next)) return null;
      const pe = addDaysMs(next, -1);
      if(!Number.isFinite(pe) || pe < ps || pe > monthEnd) return null;
      return graphRowFor(D, ps, pe, todayMs);
    }).filter(Boolean);
    graphAddLogs(D, rows);
    const active = rows.filter(r => Number(r?.entryCount || 0) > 0 || Number(r?.spent || 0) !== 0 || r?.isCurrentPeriod);
    return graphMeta(monthKey, "last7", active.slice(-Math.max(1, Number(count || 7))));
  }
  function graphData(D, monthKey, rangeMode, customSource, hiddenIds){
    const mode = rangeMode === "custom" ? "custom" : (rangeMode === "last7" ? "last7" : "month");
    if(mode !== "custom") return mode === "last7" ? graphRowsLastN(D, monthKey, 7) : graphRowsForMonth(D, monthKey);
    const source = customSource === "last7" ? "last7" : "month";
    const baseMeta = source === "last7" ? graphRowsLastN(D, monthKey, 7) : graphRowsForMonth(D, monthKey);
    const hidden = new Set((Array.isArray(hiddenIds) ? hiddenIds : []).map(String));
    const rows = baseMeta.rows.filter(r => !hidden.has(String(r?.id || "")));
    return graphMeta(monthKey, "custom", rows, { ...baseMeta, customSource: source, hiddenCount: Math.max(0, baseMeta.rows.length - rows.length) });
  }
  function graphAverageBreakdown(D, meta){
    const completed = (meta?.rows || []).filter(r => r?.isComplete);
    const n = completed.length;
    if(!n) return [];
    const cats = new Map();
    for(const row of completed){
      const periodKey = String(row?.id || `${row?.startMs || ""}_${row?.endMs || ""}`);
      const s = Number(row?.startMs), e = Number(row?.endMs);
      if(!Number.isFinite(s) || !Number.isFinite(e)) continue;
      for(const entry of allSpendEntries(D)){
        const ms = parseISOToMs(normalizeISODateLoose(entry?.date || ""));
        if(!Number.isFinite(ms) || ms < s || ms > e) continue;
        const key = String(entry?.extraId || entry?.extraName || "uncategorized");
        if(!cats.has(key)) cats.set(key, { id: key, name: String(entry?.extraName || "Uncategorized"), total: 0, entryCount: 0, periodsHit: new Set() });
        const c = cats.get(key);
        if(entry?.extraName) c.name = String(entry.extraName);
        c.total = round2(c.total + Number(entry?.amount || 0));
        c.entryCount += 1;
        c.periodsHit.add(periodKey);
      }
    }
    return Array.from(cats.values())
      .map(c => ({ id: c.id, name: c.name, total: round2(c.total), average: round2(c.total / n), entryCount: c.entryCount, periodsHit: c.periodsHit.size, completedCount: n }))
      .filter(c => c.entryCount > 0)
      .sort((a,b)=> (Math.abs(b.average) - Math.abs(a.average)) || String(a.name).localeCompare(String(b.name)));
  }
  // History grouped year → month → pay period, newest first.
  function spendHistoryTree(D){
    const entries = allSpendEntries(D)
      .filter(it => !!normalizeISODateLoose(it?.date || ""))
      .slice()
      .sort((a,b)=>{
        const ad = normalizeISODateLoose(a?.date || ""), bd = normalizeISODateLoose(b?.date || "");
        if(ad !== bd) return bd.localeCompare(ad);
        const ac = String(a?.createdAt || ""), bc = String(b?.createdAt || "");
        if(ac !== bc) return bc.localeCompare(ac);
        return String(a?.extraName || "").localeCompare(String(b?.extraName || ""), undefined, { sensitivity: "base", numeric: true });
      });
    const years = [];
    const yearMap = new Map();
    for(const it of entries){
      const iso = normalizeISODateLoose(it.date);
      const year = iso.slice(0,4), mk = iso.slice(0,7);
      const period = spendPeriodInfo(D, iso);
      let y = yearMap.get(year);
      if(!y){ y = { year, total: 0, count: 0, months: [], monthMap: new Map() }; yearMap.set(year, y); years.push(y); }
      y.total = round2(y.total + Number(it.amount || 0)); y.count += 1;
      let m = y.monthMap.get(mk);
      if(!m){ m = { mk, total: 0, count: 0, periods: [], periodMap: new Map() }; y.monthMap.set(mk, m); y.months.push(m); }
      m.total = round2(m.total + Number(it.amount || 0)); m.count += 1;
      let p = m.periodMap.get(period.key);
      if(!p){ p = { key: period.key, startIso: period.startIso, endIso: period.endIso, total: 0, count: 0, items: [] }; m.periodMap.set(period.key, p); m.periods.push(p); }
      p.total = round2(p.total + Number(it.amount || 0)); p.count += 1; p.items.push(it);
    }
    return years;
  }

  /* ---------- debts ---------- */
  function normalizeDebt(d, idx){
    if(!d || typeof d !== "object") d = {};
    if(!d.id) d.id = `d${Date.now()}${idx || 0}`;
    if(!d.name) d.name = "Debt";
    if(typeof d.collapsed !== "boolean") d.collapsed = false;
    if(!Array.isArray(d.payments)) d.payments = [];
    d.payments = d.payments.map((p, pi)=>({
      id: p && p.id ? p.id : `p${Date.now()}${idx || 0}${pi}`,
      date: String((p && p.date) || todayIso()),
      amount: Math.max(0, round2(Number((p && p.amount) || 0))),
      principal: Math.max(0, round2(Number((p && p.principal) || 0))),
      interest: Math.max(0, round2(Number((p && p.interest) || 0))),
      balanceBefore: Math.max(0, round2(Number((p && p.balanceBefore) || 0))),
      balanceAfter: Math.max(0, round2(Number((p && p.balanceAfter) || 0))),
      note: String((p && p.note) || ""),
      createdAt: String((p && p.createdAt) || ""),
      ...(p && Number.isFinite(Number(p.interestDays)) && p.interestDays !== null && p.interestDays !== "" ? { interestDays: Number(p.interestDays) } : {})
    })).filter(p => p.amount > 0);
    d.balance = Math.max(0, round2(Number(d.balance || 0)));
    d.originalBalance = Math.max(d.balance, round2(Number(d.originalBalance || d.balance || 0)));
    d.apr = Math.max(0, round2(Number(d.apr || 0)));
    d.minPayment = Math.max(0, round2(Number(d.minPayment || 0)));
    d.extraPayment = Math.max(0, round2(Number(d.extraPayment || 0)));
    d.interestStartDate = normalizeISODateLoose(d.interestStartDate || "") || "";
    d.dueDay = clampInt(d.dueDay || 1, 1, 31);
    d.priority = clampInt(d.priority || (idx + 1), 1, 999);
    return d;
  }
  function debtNextDueIsoAfter(fromIso, dueDay){
    const from = normalizeISODateLoose(fromIso || "") || todayIso();
    const fromMs = parseISOToMs(from);
    if(!Number.isFinite(fromMs)) return todayIso();
    const dt = new Date(fromMs);
    let y = dt.getUTCFullYear(), m = dt.getUTCMonth() + 1;
    const dom = clampInt(dueDay || 1, 1, 31);
    let candidate = msUTC(y, m, Math.min(dom, daysInMonth(y, m)));
    if(candidate <= fromMs){
      m += 1;
      if(m > 12){ m = 1; y += 1; }
      candidate = msUTC(y, m, Math.min(dom, daysInMonth(y, m)));
    }
    return Number.isFinite(candidate) ? new Date(candidate).toISOString().slice(0,10) : todayIso();
  }
  function debtPaymentSortAsc(a, b){
    const ad = String(a?.date || ""), bd = String(b?.date || "");
    if(ad !== bd) return ad.localeCompare(bd);
    const ac = String(a?.createdAt || ""), bc = String(b?.createdAt || "");
    if(ac !== bc) return ac.localeCompare(bc);
    return String(a?.id || "").localeCompare(String(b?.id || ""));
  }
  function debtLastPaymentDate(d){
    const list = Array.isArray(d?.payments) ? d.payments.filter(p => Number(p?.amount || 0) > 0) : [];
    if(!list.length) return "";
    return String([...list].sort(debtPaymentSortAsc).slice(-1)[0]?.date || "");
  }
  function debtDailyInterestDays(fromIso, toIso){
    const from = normalizeISODateLoose(fromIso || ""), to = normalizeISODateLoose(toIso || "");
    if(!from || !to) return null;
    const fromMs = parseISOToMs(from), toMs = parseISOToMs(to);
    if(!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return null;
    return Math.max(0, Math.round((toMs - fromMs) / DAY_MS));
  }
  // Months to payoff and interest, monthly compounding or daily if a start date is set.
  function debtPayoffCalc(d){
    const balance0 = Math.max(0, Number(d?.balance || 0));
    const apr = Math.max(0, Number(d?.apr || 0));
    const payment = Math.max(0, Number(d?.minPayment || 0) + Number(d?.extraPayment || 0));
    if(balance0 <= 0) return { months: 0, interest: 0, payment, stuck: false };
    if(payment <= 0) return { months: Infinity, interest: 0, payment, stuck: true };
    const startIso = normalizeISODateLoose(d?.interestStartDate || "") || "";
    if(startIso){
      let bal = balance0, interest = 0, months = 0;
      let fromIso = normalizeISODateLoose(debtLastPaymentDate(d) || startIso) || todayIso();
      for(let i = 0; i < 600 && bal > 0.009; i++){
        const dueIso = debtNextDueIsoAfter(fromIso, d?.dueDay || 1);
        const days = debtDailyInterestDays(fromIso, dueIso);
        const int = round2(bal * (apr / 100) / 365 * (Number.isFinite(days) ? days : 30));
        if(payment <= int && bal > payment) return { months: Infinity, interest: round2(interest + int), payment, stuck: true, daily: true };
        interest = round2(interest + int);
        bal = round2(Math.max(0, bal + int - payment));
        months++;
        fromIso = dueIso;
      }
      return { months: bal > 0.009 ? Infinity : months, interest, payment, stuck: bal > 0.009, daily: true };
    }
    const r = (apr / 100) / 12;
    let bal = balance0, interest = 0, months = 0;
    for(let i = 0; i < 600 && bal > 0.009; i++){
      const int = round2(bal * r);
      if(payment <= int && bal > payment) return { months: Infinity, interest: round2(interest + int), payment, stuck: true, daily: false };
      interest = round2(interest + int);
      bal = round2(Math.max(0, bal + int - payment));
      months++;
    }
    return { months: bal > 0.009 ? Infinity : months, interest, payment, stuck: bal > 0.009, daily: false };
  }
  function debtPaymentPrincipal(p){
    if(!p) return 0;
    const principal = Number(p.principal || 0);
    if(principal > 0) return round2(principal);
    const amount = Number(p.amount || 0), interest = Number(p.interest || 0);
    if(interest > 0) return round2(Math.max(0, amount - interest));
    return round2(Math.max(0, amount));
  }
  function debtPaymentInterest(p){
    if(!p) return 0;
    const interest = Number(p.interest || 0);
    if(interest > 0) return round2(interest);
    const amount = Number(p.amount || 0), principal = Number(p.principal || 0);
    if(principal > 0) return round2(Math.max(0, amount - principal));
    return 0;
  }
  const debtPrincipalPaidTotal = d => round2((Array.isArray(d?.payments) ? d.payments : []).reduce((s,p)=> s + debtPaymentPrincipal(p), 0));
  // Interest is paid first, the rest goes to principal.
  function debtPaymentSplit(d, amount, balanceOverride, paymentDate, interestFromDate){
    const balance = Math.max(0, round2(Number.isFinite(Number(balanceOverride)) ? Number(balanceOverride) : Number(d?.balance || 0)));
    const apr = Math.max(0, Number(d?.apr || 0));
    const requested = Math.max(0, round2(Number(amount || 0)));
    if(balance <= 0 || requested <= 0) return { amount: 0, interest: 0, principal: 0, balanceBefore: balance, balanceAfter: balance };
    const dailyMode = !!normalizeISODateLoose(d?.interestStartDate || "");
    const days = dailyMode ? debtDailyInterestDays(interestFromDate || d?.interestStartDate || "", paymentDate || todayIso()) : null;
    const interestDue = (dailyMode && Number.isFinite(days)) ? round2(balance * (apr / 100) / 365 * days) : round2(balance * ((apr / 100) / 12));
    const paid = round2(Math.min(requested, round2(balance + interestDue)));
    const interest = round2(Math.min(interestDue, paid));
    const principal = round2(Math.min(balance, Math.max(0, paid - interest)));
    return { amount: paid, interest, principal, balanceBefore: balance, balanceAfter: round2(Math.max(0, balance - principal)), interestDays: dailyMode ? (Number.isFinite(days) ? days : 0) : null };
  }
  // Replays every logged payment from the starting balance.
  function recalcDebtFromPayments(d, startBalance){
    if(!d) return;
    const payments = Array.isArray(d.payments) ? d.payments : [];
    const fallbackStart = round2(Math.max(Number(d.originalBalance || 0), Number(d.balance || 0) + payments.reduce((s,p)=> s + Math.max(debtPaymentPrincipal(p), Number(p?.amount || 0)), 0), Number(d.balance || 0)));
    let bal = Math.max(0, round2(Number.isFinite(Number(startBalance)) ? Number(startBalance) : fallbackStart));
    d.originalBalance = Math.max(Number(d.originalBalance || 0), bal);
    let interestFromDate = normalizeISODateLoose(d.interestStartDate || "") || "";
    [...payments].sort(debtPaymentSortAsc).forEach(p => {
      const payDate = normalizeISODateLoose(p.date || "") || todayIso();
      const split = debtPaymentSplit(d, Number(p.amount || 0), bal, payDate, interestFromDate);
      p.date = payDate;
      p.amount = split.amount;
      p.interest = split.interest;
      p.principal = split.principal;
      p.balanceBefore = split.balanceBefore;
      p.balanceAfter = split.balanceAfter;
      if(Number.isFinite(split.interestDays)) p.interestDays = split.interestDays;
      bal = split.balanceAfter;
      if(interestFromDate) interestFromDate = payDate;
    });
    d.balance = round2(bal);
  }
  function debtMonthsLabel(months){
    if(!Number.isFinite(months)) return "Payment too low";
    if(months <= 0) return "Paid off";
    const y = Math.floor(months / 12), m = months % 12;
    return `${y && m ? `${y}y ${m}m` : (y ? `${y}y` : `${m}m`)} left`;
  }
  // Payoff order: avalanche = highest APR first, snowball = smallest balance, custom = priority.
  function debtOrderedList(D, strategy, includeIds){
    const mode = strategy === "snowball" ? "snowball" : (strategy === "custom" ? "custom" : "avalanche");
    const keep = includeIds instanceof Set ? includeIds : new Set();
    const active = (Array.isArray(D.debts) ? D.debts : []).filter(d => d && (Number(d.balance || 0) > 0 || keep.has(d.id)));
    return [...active].sort((a,b)=>{
      if(mode === "snowball"){
        const av = Number(a.balance || 0), bv = Number(b.balance || 0);
        return av !== bv ? av - bv : Number(b.apr || 0) - Number(a.apr || 0);
      }
      if(mode === "custom"){
        const ap = Number(a.priority || 999), bp = Number(b.priority || 999);
        return ap !== bp ? ap - bp : String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base", numeric: true });
      }
      const ar = Number(a.apr || 0), br = Number(b.apr || 0);
      return ar !== br ? br - ar : Number(a.balance || 0) - Number(b.balance || 0);
    });
  }
  const debtPaymentTotal = d => round2((Array.isArray(d?.payments) ? d.payments : []).reduce((s,p)=> s + Number(p?.amount || 0), 0));
  function debtPaidSoFar(d){
    const original = Math.max(Number(d?.originalBalance || 0), Number(d?.balance || 0), 0);
    return Math.max(0, round2(original - Number(d?.balance || 0)));
  }
  function debtSummary(D){
    const debts = Array.isArray(D.debts) ? D.debts : [];
    const all = debts.filter(d => Number(d.originalBalance || 0) > 0 || Number(d.balance || 0) > 0);
    const active = debts.filter(d => Number(d.balance || 0) > 0);
    const calcs = active.map(d => debtPayoffCalc(d));
    const monthlyMin = round2(active.reduce((s,d)=> s + Number(d.minPayment || 0), 0));
    const monthlyExtra = round2(active.reduce((s,d)=> s + Number(d.extraPayment || 0), 0));
    return {
      active,
      totalBalance: round2(active.reduce((s,d)=> s + Number(d.balance || 0), 0)),
      totalOriginal: round2(all.reduce((s,d)=> s + Math.max(Number(d.originalBalance || 0), Number(d.balance || 0), 0), 0)),
      paidSoFar: round2(all.reduce((s,d)=> s + debtPaidSoFar(d), 0)),
      monthlyMin, monthlyExtra, monthlyTotal: round2(monthlyMin + monthlyExtra),
      longestMonths: calcs.reduce((max,c)=> Math.max(max, Number.isFinite(c.months) ? c.months : Infinity), 0),
      interest: round2(calcs.reduce((s,c)=> s + (Number.isFinite(c.interest) ? c.interest : 0), 0))
    };
  }
  function debtPaymentLogs(D){
    const rows = [];
    for(const d of (Array.isArray(D.debts) ? D.debts : [])){
      for(const p of (Array.isArray(d?.payments) ? d.payments : [])){
        if(p && Number(p.amount || 0) > 0) rows.push({ debt: d, payment: p });
      }
    }
    return rows.sort((a,b)=> String(b.payment.date || "").localeCompare(String(a.payment.date || "")) || String(b.payment.id || "").localeCompare(String(a.payment.id || "")));
  }
  function debtNextDueIso(d){ return debtNextDueIsoAfter(isoDate(addDaysMs(parseISOToMs(todayIso()), -1)), d?.dueDay || 1); }

  /* ---------- savings ---------- */
  // Savings month by month, starting at the starting month.
  function savingsTimeline(D, ctx, monthsToShow){
    let curMk = D.settings.baseMonth || D.selectedMonth || currentMonthKey();
    let running = projectedSavingsAtMonthStart(D, curMk, D.settings);
    const rows = [];
    for(let i = 0; i < monthsToShow; i++){
      const pplan = ctx?.plans?.get(curMk);
      const paydays = (pplan && Array.isArray(pplan.paydays)) ? pplan.paydays : getPaydaysForMonth(curMk, D.settings);
      const payCount = paydays.length;
      const per = (pplan && Number.isFinite(Number(pplan.savingsPerPaycheck)))
        ? Number(pplan.savingsPerPaycheck)
        : (payCount ? round2(Number(D.settings?.savings?.monthlyGoal || 0) / payCount) : 0);
      const added = round2(per * payCount);
      const eventItems = allEventsList(D).filter(x => {
        const iso = normalizeISODateLoose(x?.rule?.anchor || x?.date || x?.iso || "");
        return iso && iso.slice(0,7) === curMk;
      });
      const events = eventItems.reduce((s,x)=> s + Number(x?.amount || 0), 0);
      const end = round2(running + added - events);
      rows.push({ mk: curMk, start: running, added, events: round2(events), eventItems, end });
      running = end;
      curMk = addMonthsKey(curMk, 1);
    }
    return rows;
  }
  function paydaySavingsAdds(plan){
    const byMs = new Map((plan.rows || []).map(r => [r.ms, r]));
    return (plan.paydays || []).map(p => byMs.get(p)).filter(Boolean).map(r => ({ ms: r.ms, add: r.savingsIn, balance: r.savingsBalance }));
  }

  return {
    DAY_MS, APP_TZ, MISC_ID, MISC_NAME, RULE_TYPES, STAT_KEYS, opts,
    setToday(iso){ todayOverride = iso || null; resetCache(); },
    resetCache, todayIso, currentMonthKey, msUntilNextMidnight,
    msUTC, toDateObj, isoDate, fmtMD, normalizeISODateLoose, monthKeyFromISODateLoose,
    round2, ceil2, parseMonthKey, monthKeyFrom, addMonthsKey, monthStartMs, daysInMonth, monthEndMs, addDaysMs,
    dowName, monthName, monthAbbr, DOW_LONG, monthIndex, monthKeyFromIndex, parseISOToMs, clampInt, clampPct,
    fmtMoney, fmtMoneyCompact, normalizeTransferSplit, splitTransferAmount,
    getPaydaysForPay, getPaydaysForMonth, getPayCapInfoForMonth, nextPaydayAfterMs,
    billOccurrencesForMonth, billOccurrencesForRange, debtScheduledBillsForMonth, billsWithScheduledDebtsForMonth,
    paydaysInRange, extrasSpentAndNamesForRange,
    normalizeExtras, normalizeSpendEntries, normalizeSpendTransfers, validTransfers, normalizeEvents,
    allExtrasList, allEventsList, allSpendEntries,
    isMiscExtraId, compareExtraCategoryNames, extraSpendCategoryOptions,
    pocketPlanForPeriod, miscBudgetForRange, extraSpendSnapshotForRange, extraSpendSnapshotForMonth,
    getTrueSavingsMonth, projectedSavingsAtMonthStart, computeAS2ForMonth, buildPlanRange, placeholderPlan,
    capForPayIndex, pocketBasePerPaycheck, pocketNetForPayIndex, pocketHealth, pocketSurvivalMinimum, pocketThresholdMode,
    pocketMinimumInfo, pocketPayPeriods, payIndexForDate, pocketWindow, pocketBreakdown, ledgerDays, monthStats,
    spendPeriodInfo, spendActivePeriod, spendMonthSummary, graphRowsForMonth, graphRowsLastN, graphData, graphAverageBreakdown, spendHistoryTree,
    normalizeDebt, debtNextDueIsoAfter, debtPaymentSortAsc, debtLastPaymentDate, debtDailyInterestDays, debtPayoffCalc,
    debtPaymentPrincipal, debtPaymentInterest, debtPrincipalPaidTotal, debtPaymentSplit, recalcDebtFromPayments,
    debtMonthsLabel, debtOrderedList, debtPaymentTotal, debtPaidSoFar, debtSummary, debtPaymentLogs, debtNextDueIso,
    savingsTimeline, paydaySavingsAdds
  };
})();
