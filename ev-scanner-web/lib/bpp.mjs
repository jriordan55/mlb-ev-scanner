import {
  BALLPARK_PAL_PF_URL,
  BALLPARK_PAL_POSITIVE_EV_URL,
  TARGET_BOOKS,
  SKIPPED_BOOK_KEYS,
  BOOK_DISPLAY,
  BOOK_ABBR_UPPER,
  MARKET_LABELS,
  BPP_BETMARKET_MAP,
  EXCLUDED_BPP_MARKET_KEYS,
  ballparkPairKey,
  normalizeBpMatchupString,
} from "./constants.mjs";
import { devigTwoWayAggregate } from "./devig.mjs";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function envInt(name, def) {
  const v = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(v) ? v : def;
}

function envNum(name, def) {
  const v = Number.parseFloat(process.env[name] ?? "");
  return Number.isFinite(v) ? v : def;
}

/** Older Node (before v17.3) has no AbortSignal.timeout — without this, fetch throws and every scan returns 0 rows. */
function abortAfterMs(ms) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  t.unref?.();
  return c.signal;
}

function htmlText(html) {
  if (!html) return "";
  return String(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;?/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAmericanNum(x) {
  const n = Number.parseFloat(String(x ?? "").replace(/[^0-9.+-]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

export function toProb(american) {
  const a = Number(american);
  if (!Number.isFinite(a)) return NaN;
  return a > 0 ? 100 / (a + 100) : Math.abs(a) / (Math.abs(a) + 100);
}

function probToAmerican(p) {
  let x = Math.min(0.999, Math.max(0.001, p));
  return x < 0.5 ? Math.round((100 * (1 - x)) / x) : Math.round(-(100 * x) / (1 - x));
}

export function calcEvPct(fairProb, priceAmerican) {
  const fp = fairProb;
  const pr = priceAmerican;
  if (!Number.isFinite(fp) || !Number.isFinite(pr)) return NaN;
  const dec = pr > 0 ? 1 + pr / 100 : 1 + 100 / Math.abs(pr);
  const ev = (fp * (dec - 1) - (1 - fp)) * 100;
  if (!Number.isFinite(ev)) return NaN;
  return Math.abs(ev) < 0.005 ? 0 : ev;
}

function kellyBetDollars(fairProb, priceAmerican, bankroll, kellyFrac) {
  if (!Number.isFinite(bankroll) || bankroll <= 0) return NaN;
  const dec = priceAmerican > 0 ? 1 + priceAmerican / 100 : 1 + 100 / Math.abs(priceAmerican);
  const b = dec - 1;
  const num = fairProb * dec - 1;
  if (b <= 1e-12 || !Number.isFinite(num) || !Number.isFinite(fairProb)) return NaN;
  const k = num / b;
  if (k <= 0) return 0;
  let kEff = k * kellyFrac;
  kEff = Math.min(kEff, 0.05);
  return bankroll * kEff;
}

export function fmtAmerican(x) {
  if (!Number.isFinite(x)) return "";
  return x > 0 ? `+${Math.round(x)}` : String(Math.round(x));
}

export function canonicalBookKey(x) {
  const k = String(x ?? "")
    .toLowerCase()
    .trim();
  if (["williamhill_us", "williamhill", "caesars"].includes(k)) return "caesars";
  if (
    ["espnbet", "espn_bet", "thescore", "thescorebet", "the_score", "the_score_bet", "ts", "tsc", "score"].includes(
      k,
    )
  )
    return "espnbet";
  if (["betmgm", "mgm", "betmgmus", "betmgm_us", "betmgmnj", "betmgmpa", "betmgmmi", "betmgmaz"].includes(k))
    return "betmgm";
  if (["novig", "novig_us", "novig_exchange", "nvg", "nv", "nvig", "no_vig", "no-vig", "no vig"].includes(k))
    return "novig";
  if (k === "bet365") return "bet365";
  if (k === "ballpark_pal") return "ballpark_pal";
  if (k === "__bp_model__") return "__bp_model__";
  if (["pinnacle", "pinny", "pn", "pinn"].includes(k)) return "pinnacle";
  if (["betonline", "bol", "bog"].includes(k)) return "betonline";
  if (["betvictor", "bvd"].includes(k)) return "betvictor";
  if (["bovada"].includes(k)) return "bovada";
  if (["kalshi", "kal"].includes(k)) return "kalshi";
  if (["sharp_book_price", "sbp", "sharp"].includes(k)) return "sharp_book_price";
  if (["bookmaker", "bkm"].includes(k)) return "bookmaker";
  if (["bally_bet", "bly", "bally"].includes(k)) return "bally_bet";
  if (["betrivers", "riv", "bet_rivers"].includes(k)) return "betrivers";
  if (["sin_book", "sin"].includes(k)) return "sin_book";
  if (["circa", "cir"].includes(k)) return "circa";
  if (["polymarket", "poly"].includes(k)) return "polymarket";
  if (k === "bpp_score") return "espnbet";
  return k;
}

function bppPositiveEvBookAbbrToKey(abbr) {
  const norm = String(abbr ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
  const m = {
    DK: "draftkings",
    FD: "fanduel",
    MGM: "betmgm",
    BETMGM: "betmgm",
    CZR: "caesars",
    CAESARS: "caesars",
    CIR: "circa",
    TS: "espnbet",
    TSC: "espnbet",
    THESCORE: "espnbet",
    THESCOREBET: "espnbet",
    SCORE: "espnbet",
    SCOREBET: "espnbet",
    TSB: "espnbet",
    ESPN: "espnbet",
    ESPNBET: "espnbet",
    NV: "novig",
    NVG: "novig",
    NVIG: "novig",
    NOV: "novig",
    NOVIG: "novig",
    BVD: "betvictor",
    BETVICTOR: "betvictor",
    BV: "betvictor",
    KAL: "kalshi",
    KALSHI: "kalshi",
    BOV: "bovada",
    BOVADA: "bovada",
    SBP: "sharp_book_price",
    BKM: "bookmaker",
    BLY: "bally_bet",
    RIV: "betrivers",
    SIN: "sin_book",
    PRX: "__skip__",
    B365: "bet365",
    BET365: "bet365",
    PN: "pinnacle",
    PINNY: "pinnacle",
    PINNACLE: "pinnacle",
    BOL: "betonline",
    BETONLINE: "betonline",
    HR: "__skip__",
    HRK: "__skip__",
    HARDROCK: "__skip__",
    FLF: "__skip__",
    ONL: "__skip__",
    SH: "__skip__",
    POLY: "__skip__",
    POLYMARKET: "__skip__",
    PM: "__skip__",
  };
  if (m[norm] === "__skip__") return null;
  if (m[norm]) return m[norm];
  if (/^[A-Z]{2,6}$/.test(norm)) return `bpp_${norm.toLowerCase()}`;
  return null;
}

/** Grid column header: stable abbr per bookmaker_key (avoids collisions for bpp_* keys). */
function bookColAbbr(bk) {
  const ck = canonicalBookKey(bk);
  if (BOOK_ABBR_UPPER[ck]) return BOOK_ABBR_UPPER[ck];
  if (ck.startsWith("bpp_")) return ck.slice(4).toUpperCase();
  return String(ck).toUpperCase().slice(0, 6);
}

function bookLabelForKey(bk) {
  const ck = canonicalBookKey(bk);
  if (BOOK_DISPLAY[ck]) return BOOK_DISPLAY[ck];
  if (ck.startsWith("bpp_")) return ck.slice(4).toUpperCase();
  return ck;
}

function bppMarketTextToKey(t) {
  const raw = String(t ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  const x = raw.replace(/^batting\s+/, "").replace(/^pitcher\s+/, "");
  const map = {
    hits: "batter_hits",
    bases: "batter_total_bases",
    "home runs": "batter_home_runs",
    rbis: "batter_rbis",
    runs: "batter_runs_scored",
    singles: "batter_singles",
    doubles: "batter_doubles",
    triples: "batter_triples",
    walks: "batter_walks",
    "stolen bases": "batter_stolen_bases",
    "hits + runs + rbis": "batter_hits_runs_rbis",
    "h+r+rbi": "batter_hits_runs_rbis",
    strikeouts: "batter_strikeouts",
    "pitcher strikeouts": "pitcher_strikeouts",
    "pitcher walks": "pitcher_walks",
    "earned runs": "pitcher_earned_runs",
    outs: "pitcher_outs",
    "hits allowed": "pitcher_hits_allowed",
    "to record win": "pitcher_record_a_win",
    win: "pitcher_record_a_win",
  };
  return map[raw] ?? map[x] ?? null;
}

function matchAll(re, s) {
  const out = [];
  const r = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  let m;
  while ((m = r.exec(s)) !== null) {
    out.push(m);
    if (m[0].length === 0) r.lastIndex++;
  }
  return out;
}

function bppTdMatchAll(rowHtml) {
  const m = matchAll(/(<td[^>]*>[\s\S]*?<\/td>)/g, rowHtml);
  return m.map((x) => x[1]);
}

function parseBppWinPctFromTd(tdHtml) {
  const tx = htmlText(tdHtml);
  const mm = tx.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
  if (!mm) return NaN;
  return Number(mm[1]) / 100;
}

/** First Δ column after CS* in Positive-EV table (vig vs consensus), as fraction e.g. 0.078 for 7.8%. */
function parseDeltaVigFromTd(tdHtml) {
  const tx = htmlText(tdHtml);
  const mm = tx.match(/(-?[0-9]+(?:\.[0-9]+)?)\s*%/);
  if (!mm) return NaN;
  return Number(mm[1]) / 100;
}

function playerNameFromCell(htmlCell) {
  const nf = htmlCell.match(/<span[^>]*class="[^"]*name-full[^"]*"[^>]*>([^<]+)<\/span>/);
  if (nf?.[1]?.trim()) return nf[1].trim();
  const mb = htmlCell.match(/<a[^>]+Batter-Summary\.php[^>]*>([^<]+)<\/a>/);
  const mp = htmlCell.match(/<a[^>]+Pitcher-Summary\.php[^>]*>([^<]+)<\/a>/);
  let raw = mb?.[1] ? htmlText(mb[1]) : mp?.[1] ? htmlText(mp[1]) : htmlText(htmlCell);
  raw = String(raw).replace(/\s+/g, " ").trim();
  const m = raw.match(/^(.+?)\s+([A-Z][a-z]?\.\s+\S+)$/);
  if (m) {
    const full = m[1].trim();
    const shortTail = m[2].replace(/^[A-Z][a-z]?\.\s+/, "");
    if (full.endsWith(shortTail)) return full;
  }
  return raw;
}

/**
 * @param {string} html
 * @param {string} dateStr YYYY-MM-DD
 */
export function parseBallparkPalPositiveEvHtml(html, dateStr) {
  if (!html) return [];
  const d = dateStr.replace(/-/g, "");
  const theadM = html.match(/<thead[^>]*>([\s\S]*?)<\/thead>/);
  let csColIdx = -1;
  let winColIdx = -1;
  let bpOddsColIdx = -1;
  let oppColIdx = -1;
  let deltaVigColIdx = -1;
  if (theadM) {
    const thHits = matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g, theadM[1]);
    const thTxt = thHits.map((h) =>
      htmlText(h[1])
        .toUpperCase()
        .replace(/\s+/g, "")
        .replace(/&#42;|\*/g, "STAR"),
    );
    const hits = [];
    for (let i = 0; i < thTxt.length; i++) {
      if (thTxt[i] === "CSSTAR" || thTxt[i] === "CS") hits.push(i);
      if (thTxt[i] === "WIN") winColIdx = i;
      if (thTxt[i] === "OPP") oppColIdx = i;
      if (thTxt[i] === "BP" && bpOddsColIdx < 0) bpOddsColIdx = i;
    }
    if (hits.length) csColIdx = hits[hits.length - 1];
    for (let i = 0; i < thTxt.length; i++) {
      const raw = htmlText(thHits[i]?.[1] ?? "");
      const rawU = raw.replace(/\s+/g, "");
      const isDelta =
        rawU === "Δ" ||
        rawU === "\u0394" ||
        thTxt[i] === "\u0394" ||
        /^(DELTA|&DELTA;)$/i.test(rawU.replace(/[^A-Z&;]/gi, ""));
      if (isDelta && csColIdx >= 0 && i > csColIdx) {
        deltaVigColIdx = i;
        break;
      }
    }
  }
  const tbodyM = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
  if (!tbodyM) return [];
  const tbody = tbodyM[1];
  const rowHits = matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g, tbody);
  /** @type {any[]} */
  const out = [];

  for (const rh of rowHits) {
    const r = rh[1];
    if (!r) continue;
    if (!r.includes("Matchup-Machine.php") && !r.includes("data-bet-side=")) continue;
    const cells = bppTdMatchAll(r);
    if (cells.length < 18) continue;

    let mid = null;
    const midM = r.match(/data-market-id="([0-9]+)"/);
    if (midM) mid = midM[1];
    let marketKey = mid ? BPP_BETMARKET_MAP[mid] : null;
    if (!marketKey) marketKey = bppMarketTextToKey(htmlText(cells[3]));
    if (!marketKey) continue;
    if (EXCLUDED_BPP_MARKET_KEYS.has(marketKey)) continue;

    const tm = htmlText(cells[0]).toUpperCase().replace(/\s+/g, " ").trim();
    if (!tm) continue;
    const playerRaw = playerNameFromCell(cells[1]);
    if (!playerRaw) continue;

    const bkAbbr = htmlText(cells[2]).trim();
    const bkKey = bppPositiveEvBookAbbrToKey(bkAbbr);
    if (!bkKey) continue;

    const dbs = r.match(/data-bet-side="(-?1)"/)?.[1];
    const ou = htmlText(cells[4]).toUpperCase().trim();
    let side = null;
    if (dbs === "1") side = "over";
    else if (dbs === "-1") side = "under";
    else if (ou === "O") side = "over";
    else if (ou === "U") side = "under";
    if (!side) continue;

    const dbl = r.match(/data-bet-line="([^"]+)"/)?.[1];
    let ln = dbl ? Number(dbl) : NaN;
    if (!Number.isFinite(ln)) {
      ln = Number.parseFloat(htmlText(cells[5]).replace(/[^0-9.-]/g, ""));
    }
    if (!Number.isFinite(ln)) continue;

    const pr = parseAmericanNum(htmlText(cells[6]));
    if (!Number.isFinite(pr)) continue;

    /** Ballpark Pal model line (American odds); thead first "BP" column is model American odds. */
    let bpPrice = NaN;
    if (bpOddsColIdx >= 0 && bpOddsColIdx < cells.length) {
      bpPrice = parseAmericanNum(htmlText(cells[bpOddsColIdx]));
    } else if (cells.length > 14) {
      bpPrice = parseAmericanNum(htmlText(cells[14]));
    }

    const oppCell =
      oppColIdx >= 0 && oppColIdx < cells.length ? cells[oppColIdx] : cells.length > 17 ? cells[17] : "";
    const opp = htmlText(oppCell).toUpperCase().replace(/\s+/g, " ").trim();
    if (!opp) continue;

    const pair = [tm, opp].sort();
    const awayTm = pair[0];
    const homeTm = pair[1];

    const winIdx =
      winColIdx >= 0 && winColIdx < cells.length ? winColIdx : Math.max(0, cells.length - 2);
    let win = parseBppWinPctFromTd(cells[winIdx]);
    if (!Number.isFinite(win) || win <= 0 || win >= 1) win = NaN;

    let csStar = NaN;
    if (csColIdx >= 0 && csColIdx < cells.length) {
      const csTxt = htmlText(cells[csColIdx]);
      const csVal = Number.parseFloat(csTxt.replace(/[^0-9.-]/g, ""));
      if (Number.isFinite(csVal)) csStar = csVal;
    }

    let deltaVig = NaN;
    if (deltaVigColIdx >= 0 && deltaVigColIdx < cells.length) {
      deltaVig = parseDeltaVigFromTd(cells[deltaVigColIdx]);
    }

    const lnSlug = Number.isFinite(ln) ? String(ln).replace(/[^0-9.-]/g, "_") : "NA";
    const eventId = `bpp_${d}_${marketKey}_${awayTm}_${homeTm}_L${lnSlug}`;
    const ck = canonicalBookKey(bkKey);

    out.push({
      event_id: eventId,
      home_team: homeTm,
      away_team: awayTm,
      bookmaker_key: ck,
      bookmaker: BOOK_DISPLAY[ck] ?? bkAbbr,
      market: marketKey,
      side,
      player: playerRaw,
      line: ln,
      price: pr,
      bp_price: Number.isFinite(bpPrice) ? bpPrice : null,
      consensus_win_prob: win,
      cs_star: csStar,
      delta_prob_consensus_vig: Number.isFinite(deltaVig) ? deltaVig : null,
    });
  }
  return out;
}

export function dedupeRows(rows) {
  const seen = new Set();
  return rows.filter((r) => {
    const k = [r.event_id, r.bookmaker_key, r.market, r.player, r.line, r.side].join("|");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Positive-EV.php HTML is very large (~15–20MB). Short timeouts abort mid-download → 0 rows.
 * Default 90s; cap 180s. Env: MLB_SCANNER_BPP_TIMEOUT_SEC (or MLB_SHINY_BPP_TIMEOUT_SEC).
 */
export async function fetchPositiveEvForDate(dateStr, timeoutSec, betMarketId = 0) {
  const bm = Number.isFinite(Number(betMarketId)) && Number(betMarketId) >= 0 ? Math.floor(Number(betMarketId)) : 0;
  const u = `${BALLPARK_PAL_POSITIVE_EV_URL}?date=${encodeURIComponent(dateStr)}&UseMyBooks=0&BetMarket=${bm}`;
  const sec = Math.min(180, Math.max(20, timeoutSec));
  const headers = {
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "User-Agent": UA,
  };

  async function tryOnce(ms) {
    const resp = await fetch(u, {
      signal: abortAfterMs(ms),
      headers,
    });
    const status = resp.status;
    const html = resp.ok ? await resp.text() : "";
    const flat = html ? parseBallparkPalPositiveEvHtml(html, dateStr) : [];
    return { flat, status, htmlLen: html.length };
  }

  try {
    return await tryOnce(sec * 1000);
  } catch (e) {
    const name = e?.name ?? "";
    const isAbort = name === "AbortError" || name === "TimeoutError";
    if (isAbort && sec < 180) {
      try {
        return await tryOnce(Math.min(180, sec * 2) * 1000);
      } catch (e2) {
        return { flat: [], status: 0, error: String(e2?.message ?? e2), htmlLen: 0 };
      }
    }
    return { flat: [], status: 0, error: String(e?.message ?? e), htmlLen: 0 };
  }
}

export async function fetchBallparkPalOddsFlat(opts = {}) {
  const betMarketId = opts.betMarketId ?? 0;
  const to = envNum("MLB_SCANNER_BPP_TIMEOUT_SEC", envNum("MLB_SHINY_BPP_TIMEOUT_SEC", 90));
  const days = envInt("MLB_SCANNER_BPP_FETCH_DAYS", 2);
  const nDays = days >= 1 && days <= 2 ? days : 2;
  const parallel = process.env.MLB_SCANNER_BPP_PARALLEL === "1";

  const today = new Date();
  const y = today.getFullYear();
  const mo = String(today.getMonth() + 1).padStart(2, "0");
  const da = String(today.getDate()).padStart(2, "0");
  const d0 = `${y}-${mo}-${da}`;
  const t1 = new Date(today);
  t1.setDate(t1.getDate() + 1);
  const d1 = `${t1.getFullYear()}-${String(t1.getMonth() + 1).padStart(2, "0")}-${String(t1.getDate()).padStart(2, "0")}`;

  let t0;
  let t1r;
  if (nDays === 1) {
    t0 = await fetchPositiveEvForDate(d0, to, betMarketId);
    t1r = { flat: [], status: "—", htmlLen: 0 };
  } else if (parallel) {
    [t0, t1r] = await Promise.all([
      fetchPositiveEvForDate(d0, to, betMarketId),
      fetchPositiveEvForDate(d1, to, betMarketId),
    ]);
  } else {
    // Default: one ~18MB download at a time — fewer timeouts on slow links / less RAM spike.
    t0 = await fetchPositiveEvForDate(d0, to, betMarketId);
    t1r = await fetchPositiveEvForDate(d1, to, betMarketId);
  }

  let flat = [...t0.flat, ...t1r.flat];
  flat = dedupeRows(flat);

  const maxRows = envInt("MLB_SCANNER_MAX_ODDS_ROWS", envInt("MLB_SHINY_MAX_ODDS_ROWS", 0));
  if (maxRows > 0 && flat.length > maxRows) flat = flat.slice(0, maxRows);

  /** @type {string[]} */
  const warnings = [];
  if (t0.error) warnings.push(`today (${d0}): ${t0.error}`);
  if (t1r.error) warnings.push(`tomorrow (${d1}): ${t1r.error}`);
  if (flat.length === 0 && !t0.error && !t1r.error && (t0.htmlLen < 1000 || t1r.htmlLen < 1000)) {
    warnings.push("Ballpark Pal returned very small HTML (blocked or error page). Check network or try again.");
  }

  return {
    flat,
    stats: {
      fetch: "ballpark_pal",
      strategy: "ballpark_pal_positive_ev",
      http_status: [t0.status || "—", t1r.status || "—"].join(","),
      raw_html_bytes: (t0.htmlLen || 0) + (t1r.htmlLen || 0),
      rows: flat.length,
      warnings,
    },
  };
}

function lineKey(ln) {
  if (!Number.isFinite(ln)) return "NA";
  return ln.toFixed(4);
}

/**
 * BPP single-side EV table (matches R build_ev_table_bpp + two-way devig when O/U pair exists).
 * @param {any[]} rows
 */
export function buildEvTableBpp(rows, opts = {}) {
  const minBooks = envInt("MLB_SCANNER_MIN_BOOKS_SAME_LINE", envInt("MLB_SHINY_MIN_BOOKS_SAME_LINE", 1));
  const bankroll = opts.bankroll ?? 1000;
  const kellyFrac = envNum("MLB_SCANNER_KELLY_FRACTION", envNum("MLB_SHINY_KELLY_FRACTION", 0.25));
  const devigMethod = String(opts.devigMethod ?? "multiplicative");
  const devigSource = String(opts.devigSource ?? "ALL");

  /** @type {Record<string, number>|null} */
  let devigWeightNorm = null;
  const dwRaw = opts.devigWeights;
  if (dwRaw && typeof dwRaw === "object" && !Array.isArray(dwRaw)) {
    const acc = {};
    let sum = 0;
    for (const [bk, w0] of Object.entries(dwRaw)) {
      const w = Number(w0);
      if (!Number.isFinite(w) || w <= 0) continue;
      const raw = String(bk).trim();
      const ck =
        raw === "ballpark_pal" || raw === "__bp_model__" ? "__bp_model__" : canonicalBookKey(bk);
      acc[ck] = (acc[ck] ?? 0) + w;
      sum += w;
    }
    if (sum > 0) {
      devigWeightNorm = {};
      for (const k of Object.keys(acc)) devigWeightNorm[k] = acc[k] / sum;
    }
  }

  const d = rows.map((r) => ({
    ...r,
    implied: toProb(r.price),
    game: `${r.away_team} @ ${r.home_team}`,
    market_label: MARKET_LABELS[r.market] ?? r.market,
    line_key: lineKey(r.line),
    bp_price: Number.isFinite(Number(r.bp_price)) ? Number(r.bp_price) : null,
  }));

  const keysInData = [...new Set(d.map((r) => r.bookmaker_key).filter(Boolean))].sort();
  const orderedBookKeys = [
    ...TARGET_BOOKS.filter((k) => keysInData.includes(k) && !SKIPPED_BOOK_KEYS.has(k)),
    ...keysInData.filter((k) => !TARGET_BOOKS.includes(k) && !SKIPPED_BOOK_KEYS.has(k)),
  ];
  const booksForUi = orderedBookKeys.map((k) => ({
    key: canonicalBookKey(k),
    label: bookLabelForKey(k),
    abbr: bookColAbbr(k),
  }));

  /** BP model over/under American prices per prop (for ballpark_pal two-way devig). */
  const bpByPropEarly = new Map();
  for (const r of d) {
    const pk = [r.event_id, r.market, r.player, r.line_key].join("\t");
    if (!bpByPropEarly.has(pk)) bpByPropEarly.set(pk, {});
    const sd = r.side;
    if ((sd === "over" || sd === "under") && r.bp_price != null && Number.isFinite(Number(r.bp_price))) {
      bpByPropEarly.get(pk)[sd] = Number(r.bp_price);
    }
  }

  let devigBooksList;
  const dbRaw = String(opts.devigBooks ?? "ALL").trim();
  if (dbRaw.toUpperCase() !== "ALL") {
    const parts = dbRaw
      .split(",")
      .map((x) => canonicalBookKey(x.trim()))
      .filter(Boolean)
      .filter((x) => keysInData.includes(x) || x === "ballpark_pal");
    if (parts.length > 0) devigBooksList = parts;
    else devigBooksList = keysInData.length > 0 ? keysInData : [...TARGET_BOOKS];
  } else {
    devigBooksList = keysInData.length > 0 ? keysInData : [...TARGET_BOOKS];
  }

  let withFair = d.map((r) => {
    const fpRaw = Number.isFinite(r.consensus_win_prob) ? r.consensus_win_prob : r.implied;
    let fairProb = Math.min(0.98, Math.max(0.02, fpRaw));
    const fairOdds = probToAmerican(fairProb);
    const evPct = calcEvPct(fairProb, r.price);
    return { ...r, fair_prob: fairProb, fair_odds: fairOdds, ev_pct: evPct };
  });

  /** Same event/market/player/line + book → { over, under } for two-way devig */
  const pairMap = new Map();
  for (const r of withFair) {
    if (!devigBooksList.includes(r.bookmaker_key)) continue;
    const bk = [r.event_id, r.market, r.player, r.line_key, r.bookmaker_key].join("\t");
    if (!pairMap.has(bk)) pairMap.set(bk, {});
    const o = pairMap.get(bk);
    if (r.side === "over") o.over = r;
    if (r.side === "under") o.under = r;
  }

  if (devigBooksList.includes("ballpark_pal")) {
    const seenPk = new Set();
    for (const r of withFair) {
      const pk = [r.event_id, r.market, r.player, r.line_key].join("\t");
      if (seenPk.has(pk)) continue;
      seenPk.add(pk);
      const bo = bpByPropEarly.get(pk);
      if (!Number.isFinite(bo?.over) || !Number.isFinite(bo?.under)) continue;
      const bk = [r.event_id, r.market, r.player, r.line_key, "ballpark_pal"].join("\t");
      pairMap.set(bk, {
        over: { implied: toProb(bo.over), side: "over" },
        under: { implied: toProb(bo.under), side: "under" },
      });
    }
  }

  withFair = withFair.map((r) => {
    const bpBk = [r.event_id, r.market, r.player, r.line_key, "ballpark_pal"].join("\t");
    let o = null;
    if (devigBooksList.includes("ballpark_pal")) {
      o = pairMap.get(bpBk);
    }
    if (!o?.over || !o?.under) {
      if (!devigBooksList.includes(r.bookmaker_key)) return r;
      const bk = [r.event_id, r.market, r.player, r.line_key, r.bookmaker_key].join("\t");
      o = pairMap.get(bk);
    }
    if (!o?.over || !o?.under) return r;
    let m = devigMethod;
    if (r.market === "batter_home_runs") m = "multiplicative";
    const pO = o.over.implied;
    const pU = o.under.implied;
    const [fO, fU] = devigTwoWayAggregate(pO, pU, m);
    const fp = r.side === "over" ? fO : fU;
    if (!Number.isFinite(fp)) return r;
    const fairProb = Math.min(0.98, Math.max(0.02, fp));
    const fairOdds = probToAmerican(fairProb);
    const evPct = calcEvPct(fairProb, r.price);
    return { ...r, fair_prob: fairProb, fair_odds: fairOdds, ev_pct: evPct };
  });

  /** @type {Map<string, any>} */
  const bestByKey = new Map();
  for (const r of withFair) {
    const k = [r.event_id, r.market, r.player, r.line_key, r.side].join("\t");
    const cur = bestByKey.get(k);
    if (!cur || r.ev_pct > cur.ev_pct) bestByKey.set(k, { ...r });
  }
  const bestPrices = [...bestByKey.values()];

  const bpByPropAll = new Map();
  for (const r of withFair) {
    const pk = [r.event_id, r.market, r.player, r.line_key].join("\t");
    if (!bpByPropAll.has(pk)) bpByPropAll.set(pk, {});
    const sd = r.side;
    if ((sd === "over" || sd === "under") && r.bp_price != null && Number.isFinite(Number(r.bp_price))) {
      bpByPropAll.get(pk)[sd] = Number(r.bp_price);
    }
  }

  function consensusMapFromRows(rows, devigMethodUsed) {
    const m = new Map();
    for (const r of rows) {
      const k = [r.event_id, r.game, r.market, r.market_label, r.player, r.line_key, r.side].join("\t");
      if (!m.has(k)) m.set(k, []);
      m.get(k).push({
        fair_prob: r.fair_prob,
        fair_odds: r.fair_odds,
        book: canonicalBookKey(r.bookmaker_key),
      });
    }
    const out = new Map();
    const bpW =
      devigWeightNorm && Number.isFinite(Number(devigWeightNorm.__bp_model__))
        ? Number(devigWeightNorm.__bp_model__)
        : devigWeightNorm
          ? 0
          : 1;
    for (const [k, arr] of m) {
      const parts = k.split("\t");
      if (parts.length >= 7) {
        const side = parts[6];
        const pk = [parts[0], parts[2], parts[4], parts[5]].join("\t");
        const bo = bpByPropAll.get(pk);
        const bpO = bo?.over;
        const bpU = bo?.under;
        if (Number.isFinite(bpO) && Number.isFinite(bpU)) {
          const pO = toProb(bpO);
          const pU = toProb(bpU);
          if (Number.isFinite(pO) && Number.isFinite(pU)) {
            const [fO, fU] = devigTwoWayAggregate(pO, pU, devigMethodUsed);
            const fp = side === "over" ? fO : fU;
            if (Number.isFinite(fp)) {
              const fairProb = Math.min(0.98, Math.max(0.02, fp));
              arr.push({
                fair_prob: fairProb,
                fair_odds: probToAmerican(fairProb),
                book: "__bp_model__",
              });
            }
          }
        }
      }
      let medProb;
      let medOdds;
      if (devigWeightNorm) {
        let sumW = 0;
        let sumP = 0;
        for (const x of arr) {
          let w = devigWeightNorm[x.book];
          if (x.book === "__bp_model__") w = bpW;
          if (w == null || !Number.isFinite(w) || w <= 0) continue;
          sumW += w;
          sumP += x.fair_prob * w;
        }
        if (sumW > 0) {
          medProb = sumP / sumW;
          medOdds = probToAmerican(medProb);
        } else {
          medProb = median(arr.map((x) => x.fair_prob));
          medOdds = median(arr.map((x) => x.fair_odds));
        }
      } else {
        medProb = median(arr.map((x) => x.fair_prob));
        medOdds = median(arr.map((x) => x.fair_odds));
      }
      if (!Number.isFinite(medProb) || !Number.isFinite(medOdds)) continue;
      out.set(k, { fair_prob: medProb, fair_odds: Math.round(medOdds) });
    }
    return out;
  }

  /** Always: all books (fallback when "Fair from" book did not post that side). BP model included in median when O/U pair exists. */
  const consensusAll = consensusMapFromRows(withFair, devigMethod);

  let wfConsensus = withFair;
  if (devigSource !== "ALL") {
    const src = canonicalBookKey(devigSource);
    const filt = withFair.filter((r) => r.bookmaker_key === src);
    if (filt.length > 0) wfConsensus = filt;
  }
  const consensusFiltered = consensusMapFromRows(wfConsensus, devigMethod);

  const gridKey = (r) => [r.event_id, r.game, r.market, r.player, r.line_key, r.side].join("\t");
  const gridMap = new Map();
  for (const r of withFair) {
    const gk = gridKey(r);
    if (!gridMap.has(gk)) gridMap.set(gk, {});
    const col = bookColAbbr(r.bookmaker_key);
    const prev = gridMap.get(gk)[col];
    if (!prev || r.price > prev) gridMap.get(gk)[col] = r.price;
  }

  const bookDepth = new Map();
  for (const [gk, prices] of gridMap) {
    const n = Object.keys(prices).filter((c) => Number.isFinite(prices[c])).length;
    bookDepth.set(gk, n);
  }

  /** One BP (Ballpark Pal model American odds) per prop grid key; same across books when present. */
  const bpByGrid = new Map();
  for (const r of withFair) {
    const gk = gridKey(r);
    if (bpByGrid.has(gk)) continue;
    if (r.bp_price != null && Number.isFinite(r.bp_price)) bpByGrid.set(gk, r.bp_price);
  }

  /** @type {any[]} */
  const out = [];
  for (const bp of bestPrices) {
    const ck = [bp.event_id, bp.game, bp.market, bp.market_label, bp.player, bp.line_key, bp.side].join("\t");
    const cons = consensusFiltered.get(ck) ?? consensusAll.get(ck);
    if (!cons) continue;
    const gk = gridKey(bp);
    if ((bookDepth.get(gk) ?? 0) < minBooks) continue;

    let bestPrice = NaN;
    let bestKey = null;
    let bestEvPick = -Infinity;
    for (const cand of withFair) {
      if (gridKey(cand) !== gk) continue;
      const ev = calcEvPct(cons.fair_prob, cand.price);
      if (Number.isFinite(ev) && ev > bestEvPick) {
        bestEvPick = ev;
        bestPrice = cand.price;
        bestKey = cand.bookmaker_key;
      }
    }
    if (!Number.isFinite(bestPrice)) {
      bestPrice = bp.price;
      bestKey = bp.bookmaker_key;
    }
    const bestPriceFmt = fmtAmerican(bestPrice);
    const impliedFmt = (toProb(bestPrice) * 100).toFixed(1) + "%";
    const evPct = calcEvPct(cons.fair_prob, bestPrice);

    const kelly = kellyBetDollars(cons.fair_prob, bestPrice, bankroll, kellyFrac);
    const bpModel = bpByGrid.get(gk);
    const bpFmt = bpModel != null && Number.isFinite(bpModel) ? fmtAmerican(bpModel) : "—";

    /** Δ: implied prob at best price minus median implied prob across all books (each side’s American line, with vig). */
    const bookOddsMap = gridMap.get(gk) ?? {};
    const priceList = Object.values(bookOddsMap).filter((x) => Number.isFinite(Number(x)));
    const impliedList = priceList.map((px) => toProb(px)).filter(Number.isFinite);
    let deltaProbConsensusVig = NaN;
    if (impliedList.length >= 2) {
      const pMed = median(impliedList);
      const pBest = toProb(bestPrice);
      if (Number.isFinite(pMed) && Number.isFinite(pBest)) {
        deltaProbConsensusVig = pBest - pMed;
      }
    }

    out.push({
      event_id: bp.event_id,
      game: bp.game,
      market: bp.market,
      market_label: bp.market_label,
      player: bp.player,
      line: bp.line,
      side: bp.side,
      away_team: bp.away_team,
      home_team: bp.home_team,
      best_book: bookLabelForKey(bestKey) || bp.bookmaker,
      best_book_key: canonicalBookKey(bestKey),
      best_price: bestPrice,
      fair_prob: cons.fair_prob,
      fair_odds: cons.fair_odds,
      fair_fmt: fmtAmerican(cons.fair_odds),
      implied_fmt: impliedFmt,
      best_price_fmt: bestPriceFmt,
      bp_price: bpModel ?? null,
      bp_fmt: bpFmt,
      ev_pct: evPct,
      cs_star: Number.isFinite(bp.cs_star) ? bp.cs_star : null,
      delta_prob_consensus_vig: Number.isFinite(deltaProbConsensusVig) ? deltaProbConsensusVig : null,
      delta_vig_fmt: Number.isFinite(deltaProbConsensusVig)
        ? `${(deltaProbConsensusVig * 100).toFixed(1)}%`
        : "—",
      kelly_fmt:
        !Number.isFinite(kelly) || bankroll <= 0 ? "—" : kelly <= 0 ? "$0" : `$${kelly.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`,
      books: { ...(gridMap.get(gk) ?? {}) },
    });
  }

  out.sort((a, b) => b.ev_pct - a.ev_pct);
  const maxTable = envInt("MLB_SCANNER_MAX_TABLE_ROWS", envInt("MLB_SHINY_MAX_TABLE_ROWS", 0));
  const sliced = maxTable > 0 && out.length > maxTable ? out.slice(0, maxTable) : out;
  return { rows: sliced, booksForUi };
}

function median(arr) {
  const x = arr.filter(Number.isFinite).sort((a, b) => a - b);
  if (!x.length) return NaN;
  const m = Math.floor(x.length / 2);
  return x.length % 2 ? x[m] : (x[m - 1] + x[m]) / 2;
}

export function parseParkFactorsHtml(html) {
  if (!html) return [];
  const rowHits = matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g, html);
  const out = [];
  for (const rh of rowHits) {
    const chunk = rh[1];
    if (!chunk.includes('data-column="Game"') || !chunk.includes("gameLink")) continue;
    const mu = chunk.match(/class="gameLink"[^>]*>([^<]+)<\/a>/)?.[1]?.trim();
    if (!mu) continue;
    const pk = chunk.match(/Game\.php\?GamePk=([0-9]+)/)?.[1];
    const colText = (col) => {
      const m = chunk.match(new RegExp(`<td[^>]*data-column="${col}"[^>]*>([\\s\\S]*?)<\\/td>`));
      return m ? htmlText(m[1]) : "";
    };
    const hr = colText("HomeRuns");
    const xb = colText("DoublesTriples");
    const s1 = colText("Singles");
    const rn = colText("Runs");
    const pairStr = normalizeBpMatchupString(mu);
    const ma = pairStr.replace(/\s*@.*$/, "").trim();
    const mb = pairStr.replace(/^.*@\s*/, "").trim();
    const matchup_pair = ballparkPairKey(ma, mb);
    out.push({
      game_pk: pk ?? null,
      matchup_bp: mu,
      hr_pct: hr || "—",
      xbh_pct: xb || "—",
      singles_pct: s1 || "—",
      runs_pct: rn || "—",
      matchup_pair,
    });
  }
  return out;
}

export async function fetchParkFactors(dateStr) {
  const to = envNum("MLB_SCANNER_BPP_TIMEOUT_SEC", envNum("MLB_SHINY_BPP_TIMEOUT_SEC", 90));
  const url = `${BALLPARK_PAL_PF_URL}?date=${dateStr}`;
  const sec = Math.min(120, Math.max(15, to));
  const resp = await fetch(url, {
    signal: abortAfterMs(sec * 1000),
    headers: { "User-Agent": UA },
  });
  if (!resp.ok) return [];
  const html = await resp.text();
  return parseParkFactorsHtml(html);
}

export function attachParkFactors(evRows, pfRows) {
  const byPair = new Map();
  for (const p of pfRows) {
    if (p.matchup_pair) byPair.set(p.matchup_pair, p);
  }
  return evRows.map((r) => {
    const pair = ballparkPairKey(r.away_team, r.home_team);
    const pf = pair ? byPair.get(pair) : null;
    return {
      ...r,
      bpp_hr: pf?.hr_pct ?? "—",
      bpp_2b3b: pf?.xbh_pct ?? "—",
      bpp_1b: pf?.singles_pct ?? "—",
      bpp_runs: pf?.runs_pct ?? "—",
    };
  });
}
