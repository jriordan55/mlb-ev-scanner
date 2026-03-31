/**
 * MLB +EV scanner — static UI + JSON API (Node 18+).
 * Run: npm start  →  http://127.0.0.1:3847
 *
 * Env (optional): MLB_SCANNER_BPP_TIMEOUT_SEC (default 90), MLB_SCANNER_BPP_FETCH_DAYS=1|2,
 *   MLB_SCANNER_BPP_PARALLEL=1 (both days at once; default is sequential),
 *   MLB_SCANNER_MAX_ODDS_ROWS, MLB_SCANNER_MAX_TABLE_ROWS, MLB_SCANNER_PORT,
 *   MLB_SCANNER_SKIP_PARK_FACTORS=1
 *   MLB_SCANNER_ODDS_SCREEN=1 — also merge Odds-Screen.php (slow; default off — Positive-EV.php only, BetMarket=0 all markets).
 *   MLB_SCANNER_OS_TIMEOUT_SEC (default 45), MLB_SCANNER_OS_DELAY_MS, MLB_SCANNER_OS_PARALLEL=1
 * GET /api/health — quick up-check. GET /api/scan?nocache=1 — bypass server cache.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  fetchBallparkPalOddsFlat,
  buildEvTableBpp,
  fetchParkFactors,
  attachParkFactors,
  canonicalBookKey,
} from "./lib/bpp.mjs";
import { mergeOddsScreenPrices, applyOddsScreenToEvRows } from "./lib/odds-screen.mjs";
import {
  TARGET_BOOKS,
  BOOK_DISPLAY,
  BOOK_ABBR_UPPER,
  MARKET_LABELS,
  BPP_MARKET_KEY_TO_BET_ID,
  EXCLUDED_BPP_MARKET_KEYS,
} from "./lib/constants.mjs";

/** Merge server book metadata with any extra `r.books` columns (e.g. after Odds-Screen overlay). */
function mergeBooksPayload(evRows, baseBooks) {
  const byAbbr = new Map((baseBooks ?? []).map((b) => [b.abbr, { ...b }]));
  for (const r of evRows ?? []) {
    for (const ab of Object.keys(r.books || {})) {
      if (!byAbbr.has(ab)) {
        byAbbr.set(ab, { key: String(ab).toLowerCase(), label: ab, abbr: ab });
      }
    }
  }
  const primary = (baseBooks ?? []).map((b) => b.abbr).filter((a) => byAbbr.has(a));
  const rest = [...byAbbr.keys()].filter((a) => !primary.includes(a)).sort();
  return [...primary.map((a) => byAbbr.get(a)), ...rest.map((a) => byAbbr.get(a))].filter(Boolean);
}

const ALLOW_DEVIG_METHOD = new Set([
  "multiplicative",
  "additive",
  "probit",
  "shin",
  "power",
  "worst_case",
  "average",
]);

function normalizeDevigBooksQuery(db) {
  const t = String(db ?? "").trim();
  if (!t || t.toUpperCase() === "ALL") return "ALL";
  const parts = t
    .split(",")
    .map((x) => canonicalBookKey(x.trim()))
    .filter(Boolean);
  const ok = [...new Set(parts.filter((p) => TARGET_BOOKS.includes(p)))];
  return ok.length ? ok.join(",") : "ALL";
}

function parseDevigWeightsQuery(raw) {
  if (raw == null || raw === "") return null;
  try {
    const o = JSON.parse(String(raw));
    if (!o || typeof o !== "object" || Array.isArray(o)) return null;
    const out = {};
    for (const [k, v] of Object.entries(o)) {
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) continue;
      const rawK = String(k).trim();
      const ck = canonicalBookKey(rawK);
      if (rawK === "ballpark_pal" || ck === "ballpark_pal" || rawK === "__bp_model__" || ck === "__bp_model__") {
        out.__bp_model__ = (out.__bp_model__ ?? 0) + n;
        continue;
      }
      if (!TARGET_BOOKS.includes(ck)) continue;
      out[ck] = (out[ck] ?? 0) + n;
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

/** Positive weights → shares summing to 1 (for UI headers). */
function normalizeDevigWeightsForDisplay(w) {
  if (!w || typeof w !== "object") return null;
  let s = 0;
  const n = {};
  for (const [k, v] of Object.entries(w)) {
    const x = Number(v);
    if (!Number.isFinite(x) || x <= 0) continue;
    n[k] = x;
    s += x;
  }
  if (s <= 0) return null;
  for (const k of Object.keys(n)) n[k] /= s;
  return n;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, "public");
// Render / Railway / Fly set PORT; local dev can use MLB_SCANNER_PORT or default 3847.
const PORT =
  Number.parseInt(process.env.PORT ?? process.env.MLB_SCANNER_PORT ?? "3847", 10) || 3847;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
    ...corsHeaders(),
  });
  res.end(body);
}

/** req.url includes ?query — only the path segment can be used for disk lookup. */
function urlPathname(u) {
  const s = String(u ?? "/").split("?")[0] || "/";
  return s.split("#")[0] || "/";
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath);
  const type = MIME[ext] ?? "application/octet-stream";
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": type, "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=86400" });
    res.end(data);
  });
}

/** In-memory short TTL cache for repeat loads (hosting-friendly). Never cache failed/empty fetches. */
let scanCache = { at: 0, ttlMs: 45_000, payload: null, key: "" };

async function runScan(skipPf, bypassCache, scanOpts = {}) {
  const now = Date.now();
  const dmk = scanOpts.devigMethod ?? "multiplicative";
  const dbk = scanOpts.devigBooks ?? "ALL";
  const dsk = scanOpts.devigSource ?? "ALL";
  const dwJson = scanOpts.devigWeights ? JSON.stringify(scanOpts.devigWeights) : "";
  const osOn = process.env.MLB_SCANNER_ODDS_SCREEN === "1" ? "1" : "0";
  const cacheKey = `${skipPf}|${dmk}|${dbk}|${dsk}|${dwJson}|allmkt|os${osOn}`;
  if (
    !bypassCache &&
    scanCache.payload &&
    now - scanCache.at < scanCache.ttlMs &&
    scanCache.key === cacheKey
  ) {
    return scanCache.payload;
  }

  console.error("[mlb-ev] fetching Ballpark Pal… BetMarket=0 (all markets; client filters Market dropdown)");
  let { flat, stats } = await fetchBallparkPalOddsFlat({ betMarketId: 0 });
  stats.flat_odds_rows = flat.length;
  stats.bet_market_id = 0;
  console.error("[mlb-ev] flat odds rows:", flat.length, "http:", stats.http_status, "html bytes:", stats.raw_html_bytes);

  const buildOpts = {
    bankroll: 1000,
    devigMethod: dmk,
    devigBooks: dbk,
    devigSource: dsk,
    devigWeights: scanOpts.devigWeights ?? null,
  };

  let ev;
  let booksPayload = [];
  if (process.env.MLB_SCANNER_ODDS_SCREEN === "1") {
    const os = await mergeOddsScreenPrices(flat, buildOpts);
    flat = os.flat;
    if (os.stats && Object.keys(os.stats).length) Object.assign(stats, os.stats);
    if (stats.odds_screen_fetches != null) {
      console.error(
        "[mlb-ev] odds screen: fetches",
        stats.odds_screen_fetches,
        "bytes",
        stats.odds_screen_html_bytes ?? 0,
        "merged cells",
        stats.odds_screen_merged_cells ?? 0,
        "injected rows",
        stats.odds_screen_injected_rows ?? 0,
      );
    }
    const evBundle = buildEvTableBpp(flat, buildOpts);
    ev = evBundle.rows;
    booksPayload = evBundle.booksForUi ?? [];
    if (os.priceMap?.size) ev = applyOddsScreenToEvRows(ev, os.priceMap);
  } else {
    const evBundle = buildEvTableBpp(flat, buildOpts);
    ev = evBundle.rows;
    booksPayload = evBundle.booksForUi ?? [];
  }
  stats.ev_table_rows = ev.length;
  console.error("[mlb-ev] ev table rows:", ev.length);
  if (ev.length === 0 && flat.length > 0) {
    console.error(
      "[mlb-ev] hint: raw odds > 0 but EV table empty — try MLB_SCANNER_MIN_BOOKS_SAME_LINE=1 or check devig / Fair-from filters.",
    );
  }

  let pf = [];
  if (!skipPf && flat.length) {
    const today = new Date();
    const ds = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    try {
      pf = await fetchParkFactors(ds);
    } catch {
      pf = [];
    }
  }
  if (pf.length) ev = attachParkFactors(ev, pf);
  else {
    ev = ev.map((r) => ({ ...r, bpp_hr: "—", bpp_2b3b: "—", bpp_1b: "—", bpp_runs: "—" }));
  }

  /** UI no longer shows per-book price columns; keep payload small and ignore Odds-Screen cell fills here. */
  ev = ev.map((r) => ({ ...r, books: {} }));

  const games = [...new Set(ev.map((r) => r.game))].sort();
  const markets = [...new Set(ev.map((r) => r.market))].sort();

  if (!booksPayload.length) {
    booksPayload = TARGET_BOOKS.map((k) => ({ key: k, label: BOOK_DISPLAY[k] ?? k, abbr: BOOK_ABBR_UPPER[k] ?? k }));
  }
  const booksOut = mergeBooksPayload(ev, booksPayload);

  const uiMarketRaw = String(scanOpts.betMarket ?? "All").trim();
  const uiMarket =
    uiMarketRaw === "All" || !BPP_MARKET_KEY_TO_BET_ID[uiMarketRaw] || EXCLUDED_BPP_MARKET_KEYS.has(uiMarketRaw)
      ? "All"
      : uiMarketRaw;

  const marketKeys = Object.keys(BPP_MARKET_KEY_TO_BET_ID)
    .filter((k) => !EXCLUDED_BPP_MARKET_KEYS.has(k))
    .sort((a, b) => (MARKET_LABELS[a] ?? a).localeCompare(MARKET_LABELS[b] ?? b));

  const payload = {
    ok: true,
    fetchedAt: new Date().toISOString(),
    stats,
    games,
    markets,
    marketLabels: Object.fromEntries(markets.map((m) => [m, MARKET_LABELS[m] ?? m])),
    rows: ev,
    books: booksOut,
    devigWeights: normalizeDevigWeightsForDisplay(scanOpts.devigWeights) ?? null,
    betMarket: uiMarket,
    marketKeys,
  };
  payload.stats.devig_method = dmk;
  payload.stats.devig_books = dbk;
  payload.stats.devig_source = dsk;
  payload.stats.bet_market_id = 0;
  if (flat.length > 0) {
    scanCache = { at: now, ttlMs: 45_000, key: cacheKey, payload };
  } else {
    scanCache = { at: 0, ttlMs: 0, key: "", payload: null };
  }
  return payload;
}

const server = http.createServer(async (req, res) => {
  const u = req.url ?? "/";
  const pathOnly = urlPathname(u);
  if (req.method === "OPTIONS" && pathOnly.startsWith("/api/")) {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  if (pathOnly === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      service: "mlb-ev-scanner",
      node: process.version,
      abort_signal_timeout: typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function",
    });
    return;
  }

  if (u.startsWith("/api/scan")) {
    try {
      const qi = u.indexOf("?");
      const params = new URLSearchParams(qi >= 0 ? u.slice(qi + 1) : "");
      const skipPf = params.get("skipPf") === "1" || process.env.MLB_SCANNER_SKIP_PARK_FACTORS === "1";
      const nocache = params.get("nocache") === "1";
      let dm = params.get("devigMethod") || "multiplicative";
      if (!ALLOW_DEVIG_METHOD.has(dm)) dm = "multiplicative";
      let db = normalizeDevigBooksQuery(params.get("devigBooks") || "ALL");
      let ds = params.get("devigSource") || "ALL";
      if (ds !== "ALL" && (!TARGET_BOOKS.includes(ds) || ds === "ballpark_pal")) ds = "ALL";
      let bmk = params.get("market") || "All";
      if (bmk !== "All" && (!BPP_MARKET_KEY_TO_BET_ID[bmk] || EXCLUDED_BPP_MARKET_KEYS.has(bmk))) bmk = "All";
      const dw = parseDevigWeightsQuery(params.get("devigWeights"));
      const scanOpts = { devigMethod: dm, devigBooks: db, devigSource: ds, betMarket: bmk, devigWeights: dw };
      const base = await runScan(skipPf, nocache, scanOpts);
      sendJson(res, 200, base);
    } catch (e) {
      console.error("[mlb-ev] scan error:", e);
      sendJson(res, 500, { ok: false, error: String(e?.message ?? e) });
    }
    return;
  }

  if (pathOnly === "/" || pathOnly === "/index.html") {
    sendFile(res, path.join(PUBLIC, "index.html"));
    return;
  }
  if (pathOnly.startsWith("/")) {
    const safe = path.normalize(pathOnly).replace(/^(\.\.[\/\\])+/, "");
    const fp = path.join(PUBLIC, safe);
    if (fp.startsWith(PUBLIC) && fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      sendFile(res, fp);
      return;
    }
  }
  res.writeHead(404);
  res.end("Not found");
});

server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    console.error(`\nPort ${PORT} is already in use (another npm start / Node process?).\n`);
    console.error("Option A — use a different port:");
    console.error(`  $env:MLB_SCANNER_PORT="3848"; npm start`);
    console.error("\nOption B — stop what is using the port (PowerShell):");
    console.error(`  Get-NetTCPConnection -LocalPort ${PORT} | Select-Object LocalPort, OwningProcess`);
    console.error("  Stop-Process -Id <OwningProcess> -Force");
    console.error("\nOr CMD:  netstat -ano | findstr :" + PORT + "  then  taskkill /PID <pid> /F\n");
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, "0.0.0.0", () => {
  console.error(`MLB EV scanner web: http://127.0.0.1:${PORT}`);
});
