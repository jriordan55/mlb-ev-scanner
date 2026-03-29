/**
 * Ballpark Pal Odds-Screen.php — book + BP American odds (per market / side / date).
 * Merged only for games that appear on the +EV table (pre‑game slate proxy).
 */
import {
  BALLPARK_PAL_ODDS_SCREEN_URL,
  BPP_BETMARKET_MAP,
  TARGET_BOOKS,
  SKIPPED_BOOK_KEYS,
  BOOK_ABBR_UPPER,
  BOOK_DISPLAY,
  EXCLUDED_BPP_MARKET_KEYS,
} from "./constants.mjs";
import { buildEvTableBpp, dedupeRows, fmtAmerican, calcEvPct, toProb } from "./bpp.mjs";

function envInt(name, def) {
  const v = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(v) ? v : def;
}

function envNum(name, def) {
  const v = Number.parseFloat(process.env[name] ?? "");
  return Number.isFinite(v) ? v : def;
}

function abortAfterMs(ms) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  t.unref?.();
  return c.signal;
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** market_key → BetMarket id for Odds-Screen */
export const MARKET_KEY_TO_BET_ID = Object.fromEntries(
  Object.entries(BPP_BETMARKET_MAP).map(([id, key]) => [key, Number(id)]),
);

function canonicalBookKey(x) {
  const k = String(x ?? "")
    .toLowerCase()
    .trim();
  if (["williamhill_us", "williamhill", "caesars"].includes(k)) return "caesars";
  if (
    ["espnbet", "espn_bet", "thescore", "thescorebet", "the_score", "the_score_bet", "ts", "tsc", "score"].includes(k)
  )
    return "espnbet";
  if (["betmgm", "mgm", "betmgmus", "betmgm_us", "betmgmnj", "betmgmpa", "betmgmmi", "betmgmaz"].includes(k))
    return "betmgm";
  if (["novig", "novig_us", "novig_exchange", "nvg", "nv", "nvig", "no_vig", "no-vig", "no vig"].includes(k))
    return "novig";
  if (k === "bet365") return "bet365";
  if (["betvictor", "bvd"].includes(k)) return "betvictor";
  if (["sharp_book_price", "sbp"].includes(k)) return "sharp_book_price";
  if (["bookmaker", "bkm"].includes(k)) return "bookmaker";
  if (["bally_bet", "bly"].includes(k)) return "bally_bet";
  if (["betrivers", "riv"].includes(k)) return "betrivers";
  if (["circa", "cir"].includes(k)) return "circa";
  if (["bovada", "bv", "kalshi", "kal", "sin_book", "sin", "prx"].includes(k)) return "bpp_skip";
  if (["hardrock", "hrk", "hardrockbet"].includes(k)) return "bpp_skip";
  if (
    ["polymarket", "poly", "flf", "onl", "sh", "bpp_poly", "bpp_flf", "bpp_onl", "bpp_sh"].includes(k) ||
    SKIPPED_BOOK_KEYS.has(k)
  )
    return "bpp_skip";
  return k;
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

function lineKey(ln) {
  if (!Number.isFinite(ln)) return "NA";
  return ln.toFixed(4);
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

function normPlayer(p) {
  return String(p ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function dateFromBppEventId(eventId) {
  const m = String(eventId ?? "").match(/^bpp_(\d{4})(\d{2})(\d{2})_/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function mergeRowKey(dateStr, market, side, player, line, game) {
  return [dateStr, market, side, normPlayer(player), lineKey(line), game].join("\t");
}

export function allowedGamesByDateFromEvRows(evRows) {
  /** @type {Map<string, Set<string>>} */
  const byDate = new Map();
  for (const r of evRows) {
    const d = dateFromBppEventId(r.event_id);
    if (!d || !r.game) continue;
    if (!byDate.has(d)) byDate.set(d, new Set());
    byDate.get(d).add(r.game);
  }
  return byDate;
}

/** When the EV table is empty (e.g. minBooks filter) but raw flat odds exist — still fetch Odds Screen for those games. */
export function allowedGamesByDateFromFlat(flat) {
  /** @type {Map<string, Set<string>>} */
  const byDate = new Map();
  for (const r of flat ?? []) {
    const d = dateFromBppEventId(r.event_id);
    if (!d) continue;
    const game = `${r.away_team} @ ${r.home_team}`;
    if (!byDate.has(d)) byDate.set(d, new Set());
    byDate.get(d).add(game);
  }
  return byDate;
}

/** Parse `"propName":[...]` arrays embedded in page JS (may contain many books; naive regex truncates early). */
function parseJsonArrayAfterProp(html, propName) {
  const needle = `"${propName}"`;
  let idx = html.indexOf(needle);
  if (idx < 0) return null;
  const bracket = html.indexOf("[", idx + needle.length);
  if (bracket < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let j = bracket; j < html.length; j++) {
    const c = html[j];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(bracket, j + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

const DEFAULT_SLOT_BOOKS_FALLBACK = [
  "draftkings",
  "fanduel",
  "espnbet",
  "betmgm",
  "caesars",
  "novig",
  "betvictor",
  "circa",
  "sharp_book_price",
  "bookmaker",
  "bally_bet",
  "betrivers",
  "bet365",
];

function extractSlotBooks(html) {
  const arr = parseJsonArrayAfterProp(html, "def");
  if (Array.isArray(arr) && arr.length) return arr.map((x) => canonicalBookKey(String(x)));
  return DEFAULT_SLOT_BOOKS_FALLBACK.map((x) => canonicalBookKey(x));
}

function parseRowTds(rowHtml) {
  return [...rowHtml.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/gi)].map((m) => {
    const cls = m[1].match(/class="([^"]*)"/)?.[1] ?? "";
    return { cls, inner: m[2] };
  });
}

/** BP American column: reject 0–100 implied (e.g. 61.3). */
function parseBpAmericanTd(td) {
  const t = htmlText(td.inner);
  if (!t || t === "—") return NaN;
  const n = parseAmericanNum(t);
  if (!Number.isFinite(n)) return NaN;
  if (t.includes("%")) return NaN;
  if (n > 0 && n <= 100 && String(t).trim().includes(".")) return NaN;
  return n;
}

function parseBookCellTd(td) {
  const t = htmlText(td.inner);
  if (!t || t === "—" || t === ".") return NaN;
  const n = parseAmericanNum(t);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * @returns {null | { tm: string, opp: string, away_team: string, home_team: string, game: string, player: string, line: number, bp_price: number, prices: Record<string, number> }}
 */
function parseOddsScreenDataRow(rowInner, slotBooks) {
  const tds = parseRowTds(rowInner);
  if (tds.length < 12) return null;
  const lineIdx = tds.findIndex((t) => t.cls.includes("col-line"));
  if (lineIdx < 0) return null;

  const teamTd = tds.find((t) => t.cls.includes("col-team"));
  const nameTd = tds.find((t) => t.cls.includes("col-name"));
  const oppTd = tds.find((t) => t.cls.includes("col-opp"));
  if (!teamTd || !nameTd || !oppTd) return null;

  const tm = htmlText(teamTd.inner).toUpperCase().replace(/\s+/g, " ").trim();
  if (!tm) return null;
  const playerRaw = playerNameFromCell(nameTd.inner);
  if (!playerRaw) return null;
  let opp = oppTd.inner.match(/alt\s*=\s*"([^"]+)"/i)?.[1]?.trim().toUpperCase();
  if (!opp) opp = htmlText(oppTd.inner).toUpperCase().replace(/\s+/g, " ").trim();
  if (!opp) return null;

  const lineTxt = htmlText(tds[lineIdx].inner);
  const ln = Number.parseFloat(lineTxt.replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(ln)) return null;

  let i = lineIdx + 1;
  while (i < tds.length && !tds[i].cls.includes("col-bp")) i++;
  if (i >= tds.length) return null;
  const bpAm = parseBpAmericanTd(tds[i]);
  i++;
  const amPrices = [];
  while (i < tds.length && tds[i].cls.includes("book-cell")) {
    amPrices.push(parseBookCellTd(tds[i]));
    i++;
  }
  /** @type {Record<string, number>} */
  const prices = {};
  const n = Math.min(slotBooks.length, amPrices.length);
  for (let j = 0; j < n; j++) {
    const bk = canonicalBookKey(slotBooks[j]);
    if (bk === "bpp_skip" || SKIPPED_BOOK_KEYS.has(bk)) continue;
    const pr = amPrices[j];
    if (TARGET_BOOKS.includes(bk) && Number.isFinite(pr)) prices[bk] = pr;
  }

  const pair = [tm, opp].sort();
  const away_team = pair[0];
  const home_team = pair[1];
  const game = `${away_team} @ ${home_team}`;

  return {
    tm,
    opp,
    away_team,
    home_team,
    game,
    player: playerRaw,
    line: ln,
    bp_price: Number.isFinite(bpAm) ? bpAm : NaN,
    prices,
  };
}

async function fetchOddsScreenPage(dateStr, betMarketId, betSide, timeoutSec) {
  const u = `${BALLPARK_PAL_ODDS_SCREEN_URL}?date=${encodeURIComponent(dateStr)}&BetSide=${betSide}&BetMarket=${betMarketId}&BetLine=&TeamFilter=`;
  const sec = Math.min(120, Math.max(15, timeoutSec));
  const resp = await fetch(u, {
    signal: abortAfterMs(sec * 1000),
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent": UA,
    },
  });
  const html = resp.ok ? await resp.text() : "";
  return { html, status: resp.status, len: html.length };
}

/**
 * @param {Map<string, Set<string>>} allowedGamesByDate
 * @param {Set<string>} fetchKeys `${date}|${market}|${side}`
 */
export async function buildOddsScreenPriceMap(fetchKeys, allowedGamesByDate) {
  const timeoutSec = envNum("MLB_SCANNER_OS_TIMEOUT_SEC", envNum("MLB_SHINY_BPP_TIMEOUT_SEC", 45));
  const delayMs = envInt("MLB_SCANNER_OS_DELAY_MS", 0);
  const parallel = process.env.MLB_SCANNER_OS_PARALLEL === "1";

  let fetches = 0;
  let bytes = 0;
  /** @type {Map<string, { bp_price: number, prices: Record<string, number> }>} */
  const map = new Map();

  async function one(key) {
    const [dateStr, market, side] = key.split("|");
    const betId = MARKET_KEY_TO_BET_ID[market];
    if (!betId) return;
    const betSide = side === "under" ? -1 : 1;
    try {
      const { html, len } = await fetchOddsScreenPage(dateStr, betId, betSide, timeoutSec);
      fetches++;
      bytes += len;
      if (!html) return;
      const slotBooks = extractSlotBooks(html);
      const rows = matchAll(/<tr[^>]*data-game="[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi, html);
      const allowed = allowedGamesByDate.get(dateStr);
      if (!allowed || allowed.size === 0) return;
      for (const rh of rows) {
        const inner = rh[1];
        if (!inner.includes("Matchup-Machine.php")) continue;
        const rec = parseOddsScreenDataRow(inner, slotBooks);
        if (!rec) continue;
        if (!allowed.has(rec.game)) continue;
        const mk = mergeRowKey(dateStr, market, side, rec.player, rec.line, rec.game);
        const prev = map.get(mk) ?? { bp_price: NaN, prices: {} };
        if (Number.isFinite(rec.bp_price)) prev.bp_price = rec.bp_price;
        for (const [bk, pr] of Object.entries(rec.prices)) {
          if (Number.isFinite(pr)) prev.prices[bk] = pr;
        }
        map.set(mk, prev);
      }
    } catch {
      /* skip page */
    }
  }

  const keys = [...fetchKeys];
  if (parallel) {
    await Promise.all(keys.map((k) => one(k)));
  } else {
    for (const k of keys) {
      await one(k);
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return { map, fetches, bytes };
}

export function collectOddsScreenFetchKeys(_flat, allowedGamesByDate) {
  const keys = new Set();
  const markets = Object.keys(MARKET_KEY_TO_BET_ID).filter((k) => !EXCLUDED_BPP_MARKET_KEYS.has(k));
  for (const [dateStr, games] of allowedGamesByDate) {
    if (!games?.size) continue;
    for (const market of markets) {
      keys.add(`${dateStr}|${market}|over`);
      keys.add(`${dateStr}|${market}|under`);
    }
  }
  return keys;
}

export function applyOddsScreenToFlat(flat, priceMap, allowedGamesByDate) {
  let merged = 0;
  const out = flat.map((r) => {
    const d = dateFromBppEventId(r.event_id);
    if (!d || !allowedGamesByDate.get(d)?.has(r.game)) return r;
    const mk = mergeRowKey(d, r.market, r.side, r.player, r.line, r.game);
    const hit = priceMap.get(mk);
    if (!hit) return r;
    const next = { ...r };
    const bk = r.bookmaker_key;
    if (bk && Number.isFinite(hit.prices[bk])) {
      next.price = hit.prices[bk];
      merged++;
    }
    if (Number.isFinite(hit.bp_price)) next.bp_price = hit.bp_price;
    return next;
  });
  return { flat: out, merged_price_cells: merged };
}

/**
 * Add flat rows for target books that only appear on Odds Screen (so EV grid depth + devig see them).
 */
export function injectOddsScreenMissingBooks(flat, priceMap, allowedGamesByDate) {
  if (!flat.length || !priceMap?.size) return { flat, injected: 0 };
  /** @type {Map<string, any>} */
  const templateByMk = new Map();
  for (const r of flat) {
    const d = dateFromBppEventId(r.event_id);
    if (!d || !r.game || !allowedGamesByDate.get(d)?.has(r.game)) continue;
    const mk = mergeRowKey(d, r.market, r.side, r.player, r.line, r.game);
    if (!templateByMk.has(mk)) templateByMk.set(mk, r);
  }
  const have = new Set();
  for (const r of flat) {
    const d = dateFromBppEventId(r.event_id);
    if (!d) continue;
    const mk = mergeRowKey(d, r.market, r.side, r.player, r.line, r.game);
    have.add(`${mk}\t${r.bookmaker_key}`);
  }
  const added = [];
  for (const [mk, hit] of priceMap) {
    const tmpl = templateByMk.get(mk);
    if (!tmpl) continue;
    for (const bk of TARGET_BOOKS) {
      if (SKIPPED_BOOK_KEYS.has(bk)) continue;
      if (!Number.isFinite(hit.prices[bk])) continue;
      const rowKey = `${mk}\t${bk}`;
      if (have.has(rowKey)) continue;
      have.add(rowKey);
      added.push({
        ...tmpl,
        bookmaker_key: bk,
        bookmaker: BOOK_DISPLAY[bk] ?? bk,
        price: hit.prices[bk],
        bp_price: Number.isFinite(hit.bp_price) ? hit.bp_price : tmpl.bp_price,
      });
    }
  }
  return { flat: added.length ? [...flat, ...added] : flat, injected: added.length };
}

function bookColAbbr(bk) {
  const k = canonicalBookKey(bk);
  return BOOK_ABBR_UPPER[k] ?? String(k).toUpperCase().slice(0, 3);
}

/**
 * Fill per-row book columns + BP from Odds-Screen map (all six books when present), and refresh best line to max EV among those prices.
 */
export function applyOddsScreenToEvRows(evRows, priceMap) {
  if (!priceMap?.size || !evRows?.length) return evRows;
  return evRows.map((r) => {
    const ln = Number(r.line);
    if (!Number.isFinite(ln)) return r;
    const d = dateFromBppEventId(r.event_id);
    if (!d) return r;
    const mk = mergeRowKey(d, r.market, r.side, r.player, ln, r.game);
    const hit = priceMap.get(mk);
    if (!hit) return r;
    const books = { ...r.books };
    for (const bk of TARGET_BOOKS) {
      const pr = hit.prices[bk];
      if (Number.isFinite(pr)) books[bookColAbbr(bk)] = pr;
    }
    let bp_price = r.bp_price;
    let bp_fmt = r.bp_fmt;
    if (Number.isFinite(hit.bp_price)) {
      bp_price = hit.bp_price;
      bp_fmt = fmtAmerican(hit.bp_price);
    }
    let bestKey = null;
    let bestPrice = NaN;
    let bestEv = -Infinity;
    for (const bk of TARGET_BOOKS) {
      const col = bookColAbbr(bk);
      const pr = books[col];
      if (!Number.isFinite(pr)) continue;
      const ev = calcEvPct(r.fair_prob, pr);
      if (Number.isFinite(ev) && ev > bestEv) {
        bestEv = ev;
        bestPrice = pr;
        bestKey = bk;
      }
    }
    if (bestKey == null) {
      return { ...r, books, bp_price, bp_fmt };
    }
    const tp = toProb(bestPrice);
    const implied_fmt = Number.isFinite(tp) ? `${(tp * 100).toFixed(1)}%` : r.implied_fmt;
    return {
      ...r,
      books,
      bp_price,
      bp_fmt,
      best_price: bestPrice,
      best_book_key: bestKey,
      best_book:
        BOOK_DISPLAY[bestKey] ??
        (String(bestKey).startsWith("bpp_") ? bestKey.slice(4).toUpperCase() : bestKey),
      best_price_fmt: fmtAmerican(bestPrice),
      implied_fmt,
    };
  });
}

/**
 * Recompute +EV rows to get the pre-game slate, fetch Odds-Screen for those games only, overlay prices.
 */
export async function mergeOddsScreenPrices(flat, buildOpts) {
  if (process.env.MLB_SCANNER_ODDS_SCREEN !== "1") {
    return { flat, stats: {}, priceMap: null };
  }
  if (!flat.length) return { flat, stats: {}, priceMap: null };

  const evProbe = buildEvTableBpp(flat, buildOpts);
  const probeRows = evProbe.rows ?? evProbe;
  let allowed = allowedGamesByDateFromEvRows(probeRows);
  let totalAllowedGames = 0;
  for (const s of allowed.values()) totalAllowedGames += s.size;
  if (totalAllowedGames === 0) {
    allowed = allowedGamesByDateFromFlat(flat);
    totalAllowedGames = 0;
    for (const s of allowed.values()) totalAllowedGames += s.size;
  }
  if (totalAllowedGames === 0) {
    return {
      flat,
      priceMap: null,
      stats: {
        odds_screen_skipped: "no_games_in_scope",
      },
    };
  }

  const fetchKeys = collectOddsScreenFetchKeys(flat, allowed);
  if (fetchKeys.size === 0) {
    return { flat, priceMap: null, stats: { odds_screen_skipped: "no_fetch_keys" } };
  }

  const { map, fetches, bytes } = await buildOddsScreenPriceMap(fetchKeys, allowed);
  let { flat: newFlat, merged_price_cells } = applyOddsScreenToFlat(flat, map, allowed);
  const inj = injectOddsScreenMissingBooks(newFlat, map, allowed);
  newFlat = dedupeRows(inj.flat);

  return {
    flat: newFlat,
    priceMap: map,
    stats: {
      odds_screen_fetches: fetches,
      odds_screen_html_bytes: bytes,
      odds_screen_keys: fetchKeys.size,
      odds_screen_map_rows: map.size,
      odds_screen_merged_cells: merged_price_cells,
      odds_screen_injected_rows: inj.injected,
    },
  };
}
