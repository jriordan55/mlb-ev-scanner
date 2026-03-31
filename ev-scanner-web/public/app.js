const FAVICON = {
  draftkings: "draftkings.com",
  fanduel: "fanduel.com",
  pinnacle: "pinnacle.com",
  circa: "circasports.com",
  espnbet: "thescore.com",
  betmgm: "betmgm.com",
  betonline: "betonline.ag",
  bet365: "bet365.com",
  betvictor: "betvictor.com",
  novig: "novig.com",
  caesars: "caesars.com",
  bovada: "bovada.lv",
  sharp_book_price: "sportsbookreview.com",
  bookmaker: "bookmaker.eu",
  bally_bet: "ballybet.com",
  betrivers: "betrivers.com",
  kalshi: "kalshi.com",
  sin_book: "si.com",
  ballpark_pal: "ballparkpal.com",
};

/** Sportsbook keys for fair-from source (no model-only pseudo-book). */
const DEVIG_BOOK_KEYS = [
  "draftkings",
  "fanduel",
  "pinnacle",
  "circa",
  "espnbet",
  "betmgm",
  "betonline",
  "bet365",
  "betvictor",
  "novig",
  "caesars",
  "bovada",
  "sharp_book_price",
  "bookmaker",
  "bally_bet",
  "betrivers",
  "kalshi",
  "sin_book",
];

/** Weights + two-way list: sportsbooks plus Ballpark Pal model. */
const DEVIG_WEIGHT_KEYS = [...DEVIG_BOOK_KEYS, "ballpark_pal"];

const DEVIG_LABEL = {
  draftkings: "DraftKings",
  fanduel: "FanDuel",
  pinnacle: "Pinnacle",
  circa: "Circa",
  espnbet: "theScore",
  betmgm: "BetMGM",
  betonline: "BetOnline",
  bet365: "Bet365",
  betvictor: "BetVictor",
  novig: "Novig",
  caesars: "Caesars",
  bovada: "Bovada",
  sharp_book_price: "Sharp Book Price",
  bookmaker: "BookMaker",
  bally_bet: "Bally Bet",
  betrivers: "Bet Rivers",
  kalshi: "Kalshi",
  sin_book: "SI Sportsbook",
  ballpark_pal: "Ballpark Pal (model)",
};

const BOOK_TILE_ABBR = {
  draftkings: "DK",
  fanduel: "FD",
  pinnacle: "PN",
  circa: "CIR",
  espnbet: "TS",
  betmgm: "MGM",
  betonline: "BOL",
  bet365: "B365",
  betvictor: "BV",
  novig: "NVG",
  caesars: "CZR",
  bovada: "BOV",
  sharp_book_price: "SBP",
  bookmaker: "BKM",
  bally_bet: "BLY",
  betrivers: "RIV",
  kalshi: "KAL",
  sin_book: "SIN",
  ballpark_pal: "BP",
};

const LS_DEVIG_W = "ev_devig_weights";
const LS_DEVIG_BOOKS = "ev_devig_books";
const LS_DEVIG_SOURCE = "ev_devig_source";
const LS_DEVIG_METHOD = "ev_devig_method";

const MLB_LOGO_ABBR = { ATH: "oak", WSH: "wsh", SFG: "sf", TBR: "tb", KCR: "kc" };

function mlbLogoUrl(abbr) {
  const a = String(abbr ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  if (!a) return "";
  const slug = String(MLB_LOGO_ABBR[a] ?? a).toLowerCase();
  return `https://a.espncdn.com/i/teamlogos/mlb/500/${slug}.png`;
}

/** Table cell: American odds, or blank if missing / placeholder dash. */
function cellAmerican(x) {
  const n = Math.round(Number(x));
  if (!Number.isFinite(n)) return "";
  return n > 0 ? `+${n}` : String(n);
}

function cellDashBlank(s) {
  const t = String(s ?? "").trim();
  if (!t || t === "—" || t === "-" || t === "–") return "";
  return t;
}

function favUrl(domain) {
  return domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : "";
}

function evClass(v) {
  if (typeof v !== "number" || !Number.isFinite(v)) return "ev-mid";
  if (v < -0.01) return "ev-neg";
  if (v >= 2) return "ev-pos";
  return "ev-mid";
}

function bppClass(s) {
  const n = parseFloat(String(s).replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(n) || s === "—") return "";
  if (n > 0) return "bpp-pos";
  if (n < 0) return "bpp-neg";
  return "";
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Matches server kelly_bet_dollars (fractional Kelly + 5% cap). */
function kellyBetDollars(fairProb, priceAmerican, bankroll, kellyFrac = 0.25) {
  if (!Number.isFinite(bankroll) || bankroll <= 0) return NaN;
  const pr = priceAmerican;
  const dec = pr > 0 ? 1 + pr / 100 : 1 + 100 / Math.abs(pr);
  const b = dec - 1;
  const num = fairProb * dec - 1;
  if (b <= 1e-12 || !Number.isFinite(num) || !Number.isFinite(fairProb)) return NaN;
  const k = num / b;
  if (k <= 0) return 0;
  let kEff = k * kellyFrac;
  kEff = Math.min(kEff, 0.05);
  return bankroll * kEff;
}

function formatKelly(fp, price, bankroll) {
  const kb = kellyBetDollars(fp, price, bankroll);
  if (!Number.isFinite(kb) || bankroll <= 0) return "—";
  if (kb <= 0) return "$0";
  return `$${kb.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

function formatAm(x) {
  const n = Math.round(Number(x));
  if (!Number.isFinite(n)) return "—";
  return n > 0 ? `+${n}` : String(n);
}

function toProbAmerican(american) {
  const a = Number(american);
  if (!Number.isFinite(a)) return NaN;
  return a > 0 ? 100 / (a + 100) : Math.abs(a) / (Math.abs(a) + 100);
}

function calcEvPct(fairProb, priceAmerican) {
  const fp = fairProb;
  const pr = priceAmerican;
  if (!Number.isFinite(fp) || !Number.isFinite(pr)) return NaN;
  const dec = pr > 0 ? 1 + pr / 100 : 1 + 100 / Math.abs(pr);
  const ev = (fp * (dec - 1) - (1 - fp)) * 100;
  if (!Number.isFinite(ev)) return NaN;
  return Math.abs(ev) < 0.005 ? 0 : ev;
}

function americanToDecimal(american) {
  const a = Number(american);
  if (!Number.isFinite(a)) return NaN;
  return a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a);
}

function decimalToAmerican(dec) {
  let d = Number(dec);
  if (!Number.isFinite(d)) return NaN;
  d = Math.max(d, 1.000001);
  return d >= 2 ? Math.round((d - 1) * 100) : Math.round(-(100 / (d - 1)));
}

function applyProfitBoostAmerican(american, profitBoostPct) {
  if (!Number.isFinite(profitBoostPct) || profitBoostPct <= 0) return american;
  const a = Number(american);
  if (!Number.isFinite(a)) return american;
  const dec = americanToDecimal(a);
  if (!Number.isFinite(dec)) return american;
  const profit = dec - 1;
  const newDec = 1 + profit * (1 + profitBoostPct / 100);
  return decimalToAmerican(newDec);
}

function resolveBoostProfitPct(mode, customPct) {
  const m = String(mode ?? "none");
  if (!m || m === "none") return 0;
  if (m === "no_sweat") return 25;
  if (m === "custom") {
    const x = Number.parseFloat(customPct);
    return Number.isFinite(x) ? Math.max(0, Math.min(300, x)) : 0;
  }
  const n = Number.parseFloat(m);
  return Number.isFinite(n) ? Math.max(0, Math.min(300, n)) : 0;
}

let lastData = null;
/** Ignore stale /api/scan responses when devig controls fire another load quickly. */
let loadSeq = 0;
let scanAbort = null;

/** Client-side column sort (thead); stable tie-break by original index. */
let sortState = { key: "ev", dir: "desc" };

/** Proves the module executed; index.html uses this to detect script 404 / parse errors. */
document.getElementById("status")?.setAttribute("data-ev-scan", "booted");

/** Client wait for /api/scan (server can take minutes: 2× huge BPP HTML + Odds Screen). */
const SCAN_FETCH_TIMEOUT_MS = 240_000;

/** API lives on the Node server; opening index.html via file:// breaks relative /api/scan. */
function apiOrigin() {
  const meta = document.querySelector('meta[name="api-origin"]')?.getAttribute("content")?.trim();
  if (meta && meta !== "__API_ORIGIN__") return meta.replace(/\/$/, "");
  if (window.location.protocol === "file:") return "http://127.0.0.1:3847";
  return "";
}

function getSavedDevigWeights() {
  try {
    const s = localStorage.getItem(LS_DEVIG_W);
    if (!s) return null;
    const o = JSON.parse(s);
    if (!o || typeof o !== "object" || Array.isArray(o)) return null;
    const allowed = new Set(DEVIG_WEIGHT_KEYS);
    const out = {};
    for (const [k, v] of Object.entries(o)) {
      let key = String(k).trim();
      if (key === "__bp_model__") key = "ballpark_pal";
      if (!allowed.has(key)) continue;
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) continue;
      out[key] = n;
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

function fillDevigBookSelect(selId) {
  const sel = document.getElementById(selId);
  if (!sel) return;
  const keys = selId === "devigSource" ? DEVIG_BOOK_KEYS : DEVIG_WEIGHT_KEYS;
  const prev = sel.value;
  sel.innerHTML = "";
  const all = document.createElement("option");
  all.value = "ALL";
  all.textContent = "All books";
  sel.appendChild(all);
  for (const k of keys) {
    const o = document.createElement("option");
    o.value = k;
    o.textContent = DEVIG_LABEL[k] || k;
    sel.appendChild(o);
  }
  const ok = [...sel.options].some((o) => o.value === prev);
  sel.value = ok ? prev : "ALL";
}

function restoreDevigUiFromStorage() {
  try {
    fillDevigBookSelect("devigBooks");
    fillDevigBookSelect("devigSource");
    const db = localStorage.getItem(LS_DEVIG_BOOKS);
    const ds = localStorage.getItem(LS_DEVIG_SOURCE);
    const dm = localStorage.getItem(LS_DEVIG_METHOD);
    const eb = document.getElementById("devigBooks");
    const es = document.getElementById("devigSource");
    const em = document.getElementById("devigMethod");
    if (db && eb && [...eb.options].some((o) => o.value === db)) eb.value = db;
    if (ds && es && [...es.options].some((o) => o.value === ds)) es.value = ds;
    if (dm && em && [...em.options].some((o) => o.value === dm)) em.value = dm;
  } catch {
    /* ignore */
  }
}

/** Last devig root mode for search re-filter inside modal: market | custom | book:key */
let devigRootMemory = "market";

function inferDevigRootFromSaved() {
  const s = getSavedDevigWeights();
  if (!s || !Object.keys(s).length) return "market";
  const keys = Object.keys(s);
  if (keys.length === 1) return `book:${keys[0]}`;
  return "custom";
}

function applyDevigRootSelection(val) {
  const el = [...document.querySelectorAll('input[name="devigRoot"]')].find((r) => r.value === val);
  if (el) {
    el.checked = true;
    devigRootMemory = val;
    return;
  }
  const s = getSavedDevigWeights();
  const cc = document.getElementById("devigRootCustom");
  if (cc && s && Object.keys(s).length > 1) {
    cc.checked = true;
    devigRootMemory = "custom";
    return;
  }
  const one = s && Object.keys(s).length === 1 ? `book:${Object.keys(s)[0]}` : null;
  const el2 = one ? [...document.querySelectorAll('input[name="devigRoot"]')].find((r) => r.value === one) : null;
  if (el2) {
    el2.checked = true;
    devigRootMemory = one;
    return;
  }
  const m = document.getElementById("devigRootMarket");
  if (m) m.checked = true;
  devigRootMemory = "market";
}

function scanUrl(opts = {}) {
  const p = new URLSearchParams();
  if (window.location.search.includes("skipPf=1")) p.set("skipPf", "1");
  if (opts.nocache) p.set("nocache", "1");
  p.set("devigMethod", document.getElementById("devigMethod")?.value || "multiplicative");
  p.set("devigBooks", document.getElementById("devigBooks")?.value || "ALL");
  const wMap = getSavedDevigWeights();
  if (wMap && Object.keys(wMap).length) {
    p.set("devigWeights", JSON.stringify(wMap));
  }
  p.set("devigSource", document.getElementById("devigSource")?.value || "ALL");
  const mk = document.getElementById("market")?.value || "All";
  p.set("market", mk);
  const qs = p.toString();
  const path = `/api/scan${qs ? `?${qs}` : ""}`;
  const o = apiOrigin();
  return o ? `${o}${path}` : path;
}

function getAmericanOddsFilterBounds() {
  const minEl = document.getElementById("oddsAmMin");
  const maxEl = document.getElementById("oddsAmMax");
  const rawMin = String(minEl?.value ?? "").trim();
  const rawMax = String(maxEl?.value ?? "").trim();
  let lo = rawMin === "" ? NaN : Number.parseFloat(rawMin);
  let hi = rawMax === "" ? NaN : Number.parseFloat(rawMax);
  if (!Number.isFinite(lo)) lo = NaN;
  if (!Number.isFinite(hi)) hi = NaN;
  if (Number.isFinite(lo) && Number.isFinite(hi) && lo > hi) {
    const t = lo;
    lo = hi;
    hi = t;
  }
  return { lo, hi };
}

function applyFilters(rows) {
  if (!rows?.length) return [];
  const g = (id) => document.getElementById(id);
  let out = rows;
  const market = g("market")?.value;
  if (market && market !== "All") out = out.filter((r) => r.market === market);
  const game = g("game")?.value;
  if (game && game !== "All Games") out = out.filter((r) => r.game === game);
  const ou = g("ou")?.value;
  if (ou === "Overs") out = out.filter((r) => r.side === "over");
  else if (ou === "Unders") out = out.filter((r) => r.side === "under");
  const bb = g("bestBook")?.value;
  if (bb && bb !== "All") out = out.filter((r) => r.best_book_key === bb);

  const boostPct = resolveBoostProfitPct(g("boostMode")?.value, g("boostCustomPct")?.value);
  const { lo, hi } = getAmericanOddsFilterBounds();
  if (Number.isFinite(lo) || Number.isFinite(hi)) {
    out = out.filter((r) => {
      const eff =
        boostPct > 0 ? applyProfitBoostAmerican(r.best_price, boostPct) : r.best_price;
      const am = Math.round(Number(eff));
      if (!Number.isFinite(am)) return false;
      if (Number.isFinite(lo) && am < lo) return false;
      if (Number.isFinite(hi) && am > hi) return false;
      return true;
    });
  }
  return out;
}

function sortKindNum(n) {
  return { kind: "num", n };
}

function sortKindStr(s) {
  return { kind: "str", s: s == null ? "" : String(s) };
}

function compareSortVals(va, vb) {
  if (va.kind === "num" && vb.kind === "num") {
    const na = va.n;
    const nb = vb.n;
    if (!Number.isFinite(na) && !Number.isFinite(nb)) return 0;
    if (!Number.isFinite(na)) return 1;
    if (!Number.isFinite(nb)) return -1;
    return na < nb ? -1 : na > nb ? 1 : 0;
  }
  return String(va.s ?? "").localeCompare(String(vb.s ?? ""), undefined, { numeric: true, sensitivity: "base" });
}

function bppSortVal(raw) {
  const n = parseFloat(String(raw ?? "").replace(/[^0-9.-]/g, ""));
  return sortKindNum(Number.isFinite(n) ? n : NaN);
}

function sortExtract(r, sortKey, ctx) {
  const boostPct = ctx.boostPct;
  const bankroll = ctx.bankroll;
  const effBest =
    boostPct > 0 ? applyProfitBoostAmerican(r.best_price, boostPct) : r.best_price;

  switch (sortKey) {
    case "ev":
      return sortKindNum(calcEvPct(r.fair_prob, effBest));
    case "kelly":
      return sortKindNum(kellyBetDollars(r.fair_prob, effBest, bankroll));
    case "best":
      return sortKindStr(r.best_book_key ?? "");
    case "player":
      return sortKindStr(r.player ?? "");
    case "line":
      return sortKindStr(r.line ?? "");
    case "fair":
      return sortKindNum(Number(r.fair_odds));
    case "cs":
      return sortKindNum(r.cs_star == null ? NaN : Number(r.cs_star));
    case "implied":
      return sortKindNum(toProbAmerican(effBest) * 100);
    case "delta":
      return sortKindNum(
        r.delta_prob_consensus_vig == null ? NaN : Number(r.delta_prob_consensus_vig),
      );
    case "market":
      return sortKindStr(r.market_label ?? "");
    case "side": {
      const s = String(r.side ?? "").toLowerCase();
      const o = s === "over" ? 0 : s === "under" ? 1 : 2;
      return sortKindNum(o);
    }
    case "matchup":
      return sortKindStr(r.game ?? "");
    case "bpp_hr":
      return bppSortVal(r.bpp_hr);
    case "bpp_2b3b":
      return bppSortVal(r.bpp_2b3b);
    case "bpp_1b":
      return bppSortVal(r.bpp_1b);
    case "bpp_runs":
      return bppSortVal(r.bpp_runs);
    default:
      return sortKindStr("");
  }
}

function sortRows(rows, sortKey, dir, ctx) {
  if (!rows?.length || !sortKey) return rows ?? [];
  const ix = rows.map((r, i) => ({ r, i }));
  ix.sort((A, B) => {
    const va = sortExtract(A.r, sortKey, ctx);
    const vb = sortExtract(B.r, sortKey, ctx);
    let c = compareSortVals(va, vb);
    if (c !== 0) return dir === "asc" ? c : -c;
    return A.i - B.i;
  });
  return ix.map((x) => x.r);
}

function syncSortHeaderClasses() {
  document.querySelectorAll("#grid thead th[data-sort]").forEach((th) => {
    th.classList.remove("sort-asc", "sort-desc", "sort-active");
    if (th.dataset.sort === sortState.key) {
      th.classList.add("sort-active", sortState.dir === "asc" ? "sort-asc" : "sort-desc");
    }
  });
}

function defaultSortDirForKey(key) {
  if (key.startsWith("book:")) return "desc";
  const descDefaults = new Set([
    "ev",
    "kelly",
    "fair",
    "cs",
    "implied",
    "delta",
    "bp_model",
    "bpp_hr",
    "bpp_2b3b",
    "bpp_1b",
    "bpp_runs",
  ]);
  return descDefaults.has(key) ? "desc" : "asc";
}

function getBankroll() {
  const n = Number.parseFloat(document.getElementById("bankroll")?.value ?? "");
  return Number.isFinite(n) ? n : 1000;
}

async function load(opts = {}) {
  const status = document.getElementById("status");
  if (!status) return;
  const seq = ++loadSeq;
  scanAbort?.abort();
  scanAbort = new AbortController();
  const { signal } = scanAbort;

  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    scanAbort.abort();
  }, SCAN_FETCH_TIMEOUT_MS);

  const t0 = Date.now();
  const tick = setInterval(() => {
    if (seq !== loadSeq) return;
    const sec = Math.round((Date.now() - t0) / 1000);
    status.textContent = `Loading… ${sec}s`;
  }, 2000);

  if (window.location.protocol === "file:") {
    status.textContent = `Loading via API ${apiOrigin() || "(same host)"}… If this fails, open http://127.0.0.1:3847 after npm start (recommended). First load 30–120s.`;
  } else {
    status.textContent = "Loading odds… (Ballpark Pal pages are large; first load can take 30–120s)";
  }

  const tbErr = document.getElementById("tbody");
  try {
    const r = await fetch(scanUrl(opts), { cache: "no-store", signal });
    const raw = await r.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(
        r.ok ? "Invalid JSON from server" : `HTTP ${r.status} — ${raw.slice(0, 120).replace(/</g, "&lt;")}`,
      );
    }
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    if (!data.ok) throw new Error(data.error || "scan failed");
    if (seq !== loadSeq) return;

    lastData = data;
    fillFilters(data);
    redraw();
    status.textContent = new Date(data.fetchedAt).toLocaleString();
  } catch (e) {
    if (seq !== loadSeq) return;
    if (e?.name === "AbortError") {
      if (timedOut) {
        status.textContent = `Timed out after ${SCAN_FETCH_TIMEOUT_MS / 1000}s waiting for /api/scan. The server may still be working (see host logs). Try: refresh, add ?skipPf=1, or set MLB_SCANNER_BPP_FETCH_DAYS=1 on the server for a faster scan.`;
        if (tbErr) tbErr.innerHTML = "";
      }
      return;
    }
    const netHint =
      e?.message === "Failed to fetch"
        ? " Often: host proxy timeout (~100s on Render), server crash, or wrong API URL (set meta api-origin if UI is on another domain)."
        : "";
    status.textContent = `Error: ${e.message}${netHint} — Try ${apiOrigin() || window.location.origin || ""}/api/health`;
    if (tbErr) tbErr.innerHTML = "";
  } finally {
    clearInterval(tick);
    clearTimeout(timeoutId);
  }
}

function redraw() {
  if (!lastData) return;
  const filtered = applyFilters(lastData.rows);
  const br = getBankroll();
  const boostPct = resolveBoostProfitPct(
    document.getElementById("boostMode")?.value,
    document.getElementById("boostCustomPct")?.value,
  );
  const bookKeyToAbbr = Object.fromEntries((lastData.books || []).map((b) => [b.key, b.abbr]));
  const sorted = sortRows(filtered, sortState.key, sortState.dir, {
    boostPct,
    bankroll: br,
    bookKeyToAbbr,
  });
  render(sorted, br, lastData.books || []);
  syncSortHeaderClasses();
}

function fillFilters(data) {
  const mk = document.getElementById("market");
  if (mk) {
    const curM = mk.value;
    const pool =
      data.marketKeys?.length ? data.marketKeys : data.markets?.length ? data.markets : [];
    mk.innerHTML = "";
    const mo = document.createElement("option");
    mo.value = "All";
    mo.textContent = "All";
    mk.appendChild(mo);
    for (const m of pool) {
      const o = document.createElement("option");
      o.value = m;
      o.textContent = data.marketLabels?.[m] || m;
      mk.appendChild(o);
    }
    const prefer = data.betMarket && [...mk.options].some((o) => o.value === data.betMarket) ? data.betMarket : curM;
    if ([...mk.options].some((o) => o.value === prefer)) mk.value = prefer;
    else if ([...mk.options].some((o) => o.value === curM)) mk.value = curM;
  }

  const gm = document.getElementById("game");
  if (gm) {
    const curG = gm.value;
    gm.innerHTML = "";
    const go = document.createElement("option");
    go.value = "All Games";
    go.textContent = "All Games";
    gm.appendChild(go);
    for (const g of data.games || []) {
      const o = document.createElement("option");
      o.value = g;
      o.textContent = g;
      gm.appendChild(o);
    }
    if ([...gm.options].some((o) => o.value === curG)) gm.value = curG;
  }

  const bb = document.getElementById("bestBook");
  if (bb) {
    const curB = bb.value;
    bb.innerHTML = "";
    const bo = document.createElement("option");
    bo.value = "All";
    bo.textContent = "All rows";
    bb.appendChild(bo);
    for (const b of data.books || []) {
      const o = document.createElement("option");
      o.value = b.key;
      o.textContent = b.label;
      bb.appendChild(o);
    }
    if ([...bb.options].some((o) => o.value === curB)) bb.value = curB;
  }

}

function matchupCell(game) {
  const raw = String(game ?? "").trim();
  const m = raw.match(/^\s*([A-Za-z]{2,4})\s*@\s*([A-Za-z]{2,4})\s*$/);
  if (!m) return `<td class="td-matchup">${esc(raw)}</td>`;
  const a = m[1].toUpperCase();
  const h = m[2].toUpperCase();
  const ua = esc(mlbLogoUrl(a));
  const ub = esc(mlbLogoUrl(h));
  return `<td class="td-matchup"><span class="matchup-logos"><img src="${ua}" alt="" width="22" height="22" loading="lazy" decoding="async"/><span class="at">@</span><img src="${ub}" alt="" width="22" height="22" loading="lazy" decoding="async"/></span></td>`;
}

function render(rows, bankroll) {
  const tb = document.getElementById("tbody");
  const boostPct = resolveBoostProfitPct(
    document.getElementById("boostMode")?.value,
    document.getElementById("boostCustomPct")?.value,
  );
  if (!rows?.length) {
    tb.innerHTML = "";
    return;
  }
  const frag = document.createDocumentFragment();
  for (const r of rows) {
    const tr = document.createElement("tr");
    const effBest =
      boostPct > 0 ? applyProfitBoostAmerican(r.best_price, boostPct) : r.best_price;
    const evNum = calcEvPct(r.fair_prob, effBest);
    const evc = evClass(evNum);
    let cs = "";
    if (r.cs_star != null && Number.isFinite(Number(r.cs_star))) {
      const n = Math.round(Number(r.cs_star));
      cs = n > 0 ? `+${n}` : String(n);
    }
    const kellyRaw = formatKelly(r.fair_prob, effBest, bankroll);
    const kelly = cellDashBlank(kellyRaw);
    const dom = FAVICON[r.best_book_key] || "";

    const tp = toProbAmerican(effBest);
    const impliedFmt = Number.isFinite(tp) ? `${(tp * 100).toFixed(1)}%` : "";
    const bestPriceStr = cellAmerican(effBest);
    const evStr = Number.isFinite(evNum) ? `${evNum.toFixed(2)}%` : "";
    const fairDisp = cellDashBlank(r.fair_fmt);
    const bestImg = dom
      ? `<img class="best-book-logo" src="${esc(favUrl(dom))}" alt="" width="20" height="20" onerror="this.style.display='none'"/>`
      : "";
    const oddsPart = bestPriceStr ? `<span class="best-odds-txt">${esc(bestPriceStr)}</span>` : "";
    const bestBookInner =
      oddsPart || bestImg
        ? `<div class="td-best-inner">${oddsPart}${bestImg ? `<span class="best-logo-wrap">${bestImg}</span>` : ""}</div>`
        : "";
    const dVig =
      r.delta_vig_fmt != null && r.delta_vig_fmt !== "—"
        ? esc(r.delta_vig_fmt)
        : r.delta_prob_consensus_vig != null && Number.isFinite(Number(r.delta_prob_consensus_vig))
          ? `${(Number(r.delta_prob_consensus_vig) * 100).toFixed(1)}%`
          : "";

    const staticCells = [
      `<td class="col-pin col-pin-1 ${evc}">${esc(evStr)}</td>`,
      `<td class="col-pin col-pin-2">${esc(kelly)}</td>`,
      `<td class="col-pin col-pin-3 td-best-book">${bestBookInner}</td>`,
      `<td class="col-pin col-pin-4 td-player">${esc(r.player)}</td>`,
      `<td>${esc(r.line)}</td>`,
      `<td>${fairDisp ? esc(fairDisp) : ""}</td>`,
      `<td>${cs ? esc(cs) : ""}</td>`,
      `<td>${impliedFmt ? esc(impliedFmt) : ""}</td>`,
      `<td class="td-delta">${dVig ? esc(dVig) : ""}</td>`,
      `<td>${esc(r.market_label)}</td>`,
      `<td>${esc(r.side)}</td>`,
      matchupCell(r.game),
      `<td class="${bppClass(r.bpp_hr)}">${(() => {
        const x = cellDashBlank(r.bpp_hr);
        return x ? esc(x) : "";
      })()}</td>`,
      `<td class="${bppClass(r.bpp_2b3b)}">${(() => {
        const x = cellDashBlank(r.bpp_2b3b);
        return x ? esc(x) : "";
      })()}</td>`,
      `<td class="${bppClass(r.bpp_1b)}">${(() => {
        const x = cellDashBlank(r.bpp_1b);
        return x ? esc(x) : "";
      })()}</td>`,
      `<td class="${bppClass(r.bpp_runs)}">${(() => {
        const x = cellDashBlank(r.bpp_runs);
        return x ? esc(x) : "";
      })()}</td>`,
    ];
    tr.innerHTML = staticCells.join("");
    frag.appendChild(tr);
  }
  tb.innerHTML = "";
  tb.appendChild(frag);
}

function debounce(fn, ms) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

document.getElementById("btnRefresh")?.addEventListener("click", () => load({ nocache: true }));
document.getElementById("btnHelp")?.addEventListener("click", () => document.getElementById("helpDlg")?.showModal());

function ensureDevigSplitPresets() {
  const el = document.getElementById("devigSplitPresets");
  if (!el || el.dataset.inited === "1") return;
  el.dataset.inited = "1";
  el.innerHTML = `<button type="button" class="devig-split-btn" data-devig-preset="market">Market avg</button><button type="button" class="devig-split-btn" data-devig-preset="fd-dk-50">FD / DK 50% · Equal</button>`;
}

function buildDevigSingleGrid() {
  const grid = document.getElementById("devigSingleGrid");
  if (!grid) return;
  const q = (document.getElementById("devigSearch")?.value || "").toLowerCase().trim();
  grid.innerHTML = "";
  for (const key of DEVIG_WEIGHT_KEYS) {
    const label = DEVIG_LABEL[key] || key;
    const abbr = BOOK_TILE_ABBR[key] || key.slice(0, 4).toUpperCase();
    if (q && !label.toLowerCase().includes(q) && !key.includes(q) && !String(abbr).toLowerCase().includes(q)) continue;
    const dom = FAVICON[key];
    const src = dom ? favUrl(dom) : "";
    const lab = document.createElement("label");
    lab.className = "devig-tile";
    const imgPart = src
      ? `<img class="devig-tile-img" src="${esc(src)}" alt="" width="28" height="28" loading="lazy" />`
      : `<span class="devig-tile-fallback">${esc(abbr)}</span>`;
    lab.innerHTML = `<input type="radio" name="devigRoot" value="book:${key}" class="devig-root-book" /><span class="devig-tile-inner">${imgPart}<span class="devig-tile-abbr">${esc(abbr)}</span></span>`;
    grid.appendChild(lab);
  }
}

function buildDevigModalGrid() {
  const grid = document.getElementById("devigBookGrid");
  if (!grid) return;
  const saved = getSavedDevigWeights() || {};
  const q = (document.getElementById("devigSearch")?.value || "").toLowerCase().trim();
  grid.innerHTML = "";
  for (const key of DEVIG_WEIGHT_KEYS) {
    const label = DEVIG_LABEL[key] || key;
    const abbr = BOOK_TILE_ABBR[key] || key;
    if (q && !label.toLowerCase().includes(q) && !key.includes(q) && !String(abbr).toLowerCase().includes(q)) continue;
    const row = document.createElement("label");
    row.className = "devig-row devig-row-custom";
    const w0 = saved[key] != null ? String(saved[key]) : "";
    const dom = FAVICON[key];
    const src = dom ? favUrl(dom) : "";
    const logo = src
      ? `<img class="devig-row-logo" src="${esc(src)}" alt="" width="22" height="22" loading="lazy" />`
      : `<span class="devig-row-abbr">${esc(abbr)}</span>`;
    row.innerHTML = `${logo}<input type="checkbox" data-book="${esc(key)}" ${saved[key] != null ? "checked" : ""} /><span class="devig-name">${esc(label)}</span><input type="number" class="devig-w" min="0" step="1" placeholder="%" value="${esc(w0)}" />`;
    grid.appendChild(row);
  }
}

function buildDevigModalGrids() {
  ensureDevigSplitPresets();
  buildDevigSingleGrid();
  buildDevigModalGrid();
  applyDevigRootSelection(devigRootMemory);
}

function rememberDevigRootFromDom() {
  const c = document.querySelector('input[name="devigRoot"]:checked');
  if (c) devigRootMemory = c.value;
}

document.getElementById("devigDlg")?.addEventListener("click", (e) => {
  const btn = e.target.closest?.("[data-devig-preset]");
  if (!btn) return;
  const p = btn.getAttribute("data-devig-preset");
  rememberDevigRootFromDom();
  if (p === "market") {
    localStorage.removeItem(LS_DEVIG_W);
    devigRootMemory = "market";
    buildDevigSingleGrid();
    buildDevigModalGrid();
    applyDevigRootSelection("market");
  } else if (p === "fd-dk-50") {
    localStorage.setItem(LS_DEVIG_W, JSON.stringify({ fanduel: 50, draftkings: 50 }));
    devigRootMemory = "custom";
    buildDevigSingleGrid();
    buildDevigModalGrid();
    applyDevigRootSelection("custom");
  }
});

document.getElementById("btnDevig")?.addEventListener("click", () => {
  devigRootMemory = inferDevigRootFromSaved();
  buildDevigModalGrids();
  document.getElementById("devigDlg")?.showModal();
});

document.getElementById("devigSearch")?.addEventListener(
  "input",
  debounce(() => {
    rememberDevigRootFromDom();
    buildDevigModalGrids();
  }, 200),
);

document.getElementById("devigForm")?.addEventListener("change", (e) => {
  const t = e.target;
  if (t?.matches?.('input[name="devigRoot"]')) devigRootMemory = t.value;
  if (t?.matches?.('input[type="checkbox"][data-book]')) {
    devigRootMemory = "custom";
    applyDevigRootSelection("custom");
  }
});

document.getElementById("devigForm")?.addEventListener("submit", (e) => {
  e.preventDefault();
  rememberDevigRootFromDom();
  const root = document.querySelector('input[name="devigRoot"]:checked')?.value || "market";
  const grid = document.getElementById("devigBookGrid");
  if (root === "market") {
    localStorage.removeItem(LS_DEVIG_W);
  } else if (root.startsWith("book:")) {
    const k = root.slice(5);
    if (DEVIG_WEIGHT_KEYS.includes(k)) localStorage.setItem(LS_DEVIG_W, JSON.stringify({ [k]: 100 }));
  } else {
    const weights = {};
    if (grid) {
      for (const lab of grid.querySelectorAll("label.devig-row-custom")) {
        const cb = lab.querySelector('input[type="checkbox"]');
        const inp = lab.querySelector("input.devig-w");
        if (!cb?.checked || !inp) continue;
        const k = cb.getAttribute("data-book");
        const n = Number.parseFloat(inp.value);
        if (!k || !Number.isFinite(n) || n <= 0) continue;
        weights[k] = n;
      }
    }
    if (Object.keys(weights).length) {
      localStorage.setItem(LS_DEVIG_W, JSON.stringify(weights));
    } else {
      localStorage.removeItem(LS_DEVIG_W);
    }
  }
  try {
    localStorage.setItem(LS_DEVIG_BOOKS, document.getElementById("devigBooks")?.value || "ALL");
    localStorage.setItem(LS_DEVIG_SOURCE, document.getElementById("devigSource")?.value || "ALL");
    localStorage.setItem(LS_DEVIG_METHOD, document.getElementById("devigMethod")?.value || "multiplicative");
  } catch {
    /* ignore */
  }
  devigRootMemory = inferDevigRootFromSaved();
  document.getElementById("devigDlg")?.close();
  load({ nocache: true });
});

document.getElementById("devigClear")?.addEventListener("click", () => {
  localStorage.removeItem(LS_DEVIG_W);
  devigRootMemory = "market";
  buildDevigModalGrids();
  applyDevigRootSelection("market");
  load({ nocache: true });
});

document.getElementById("devigClose")?.addEventListener("click", () => {
  document.getElementById("devigDlg")?.close();
});

document.getElementById("devigCloseX")?.addEventListener("click", () => {
  document.getElementById("devigDlg")?.close();
});

document.getElementById("devigAddCustom")?.addEventListener("click", () => {
  devigRootMemory = "custom";
  applyDevigRootSelection("custom");
  document.getElementById("devigCustomWrap")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
});

document.getElementById("devigPreloads")?.addEventListener("click", () => {
  document.getElementById("devigSplitPresets")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
});

const reloadScan = debounce(() => load(), 350);
["devigMethod", "devigBooks", "devigSource"].forEach((id) => {
  document.getElementById(id)?.addEventListener("change", () => reloadScan());
});

["game", "ou", "bestBook"].forEach((id) => {
  document.getElementById(id)?.addEventListener("change", () => redraw());
});
document.getElementById("market")?.addEventListener("change", () => redraw());

document.getElementById("bankroll")?.addEventListener("input", debounce(() => redraw(), 200));

document.getElementById("boostMode")?.addEventListener("change", () => {
  const custom = document.getElementById("boostMode")?.value === "custom";
  const w = document.getElementById("boostCustomWrap");
  if (w) w.hidden = !custom;
  redraw();
});

document.getElementById("boostCustomPct")?.addEventListener("input", debounce(() => redraw(), 200));

document.getElementById("oddsAmMin")?.addEventListener("input", debounce(() => redraw(), 200));
document.getElementById("oddsAmMax")?.addEventListener("input", debounce(() => redraw(), 200));

restoreDevigUiFromStorage();

document.querySelector("#grid thead")?.addEventListener("click", (e) => {
  if (e.target.closest("button")) return;
  const th = e.target.closest("th[data-sort]");
  if (!th) return;
  const key = th.dataset.sort;
  if (!key) return;
  if (sortState.key === key) {
    sortState.dir = sortState.dir === "asc" ? "desc" : "asc";
  } else {
    sortState.key = key;
    sortState.dir = defaultSortDirForKey(key);
  }
  redraw();
});

load();
