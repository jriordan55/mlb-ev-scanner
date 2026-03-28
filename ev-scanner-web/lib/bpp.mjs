import {
  BALLPARK_PAL_PF_URL,
  BALLPARK_PAL_POSITIVE_EV_URL,
  TARGET_BOOKS,
  BOOK_DISPLAY,
  BOOK_ABBR_UPPER,
  MARKET_LABELS,
  BPP_BETMARKET_MAP,
  ballparkPairKey,
  normalizeBpMatchupString,
} from "./constants.mjs";

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

function toProb(american) {
  const a = Number(american);
  if (!Number.isFinite(a)) return NaN;
  return a > 0 ? 100 / (a + 100) : Math.abs(a) / (Math.abs(a) + 100);
}

function probToAmerican(p) {
  let x = Math.min(0.999, Math.max(0.001, p));
  return x < 0.5 ? Math.round((100 * (1 - x)) / x) : Math.round(-(100 * x) / (1 - x));
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

function fmtAmerican(x) {
  if (!Number.isFinite(x)) return "";
  return x > 0 ? `+${Math.round(x)}` : String(Math.round(x));
}

function canonicalBookKey(x) {
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
    SCOREBET: "espnbet",
    ESPN: "espnbet",
    ESPNBET: "espnbet",
    NV: "novig",
    NVG: "novig",
    NVIG: "novig",
    NOV: "novig",
    NOVIG: "novig",
  };
  return m[norm] ?? null;
}

function bppMarketTextToKey(t) {
  const x = String(t ?? "")
    .toLowerCase()
    .trim();
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
    strikeouts: "pitcher_strikeouts",
    "earned runs": "pitcher_earned_runs",
    outs: "pitcher_outs",
    "hits allowed": "pitcher_hits_allowed",
    "to record win": "pitcher_record_a_win",
    win: "pitcher_record_a_win",
  };
  return map[x] ?? null;
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
    }
    if (hits.length) csColIdx = hits[hits.length - 1];
  }
  const tbodyM = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
  if (!tbodyM) return [];
  const tbody = tbodyM[1];
  const rowHits = matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g, tbody);
  const targetPat = />(DK|FD|CZR|MGM|TSC|TS|NVG|NV|NOVIG|THESCORE)</i;
  /** @type {any[]} */
  const out = [];

  for (const rh of rowHits) {
    const r = rh[1];
    if (!r || !targetPat.test(r)) continue;
    const cells = bppTdMatchAll(r);
    if (cells.length < 20) continue;

    let mid = null;
    const midM = r.match(/data-market-id="([0-9]+)"/);
    if (midM) mid = midM[1];
    let marketKey = mid ? BPP_BETMARKET_MAP[mid] : null;
    if (!marketKey) marketKey = bppMarketTextToKey(htmlText(cells[3]));
    if (!marketKey) continue;

    const tm = htmlText(cells[0]).toUpperCase().replace(/\s+/g, " ").trim();
    if (!tm) continue;
    const playerRaw = playerNameFromCell(cells[1]);
    if (!playerRaw) continue;

    const bkAbbr = htmlText(cells[2]).trim();
    const bkKey = bppPositiveEvBookAbbrToKey(bkAbbr);
    if (!bkKey || !TARGET_BOOKS.includes(bkKey)) continue;

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

    const opp = htmlText(cells[17]).toUpperCase().replace(/\s+/g, " ").trim();
    if (!opp) continue;

    const pair = [tm, opp].sort();
    const awayTm = pair[0];
    const homeTm = pair[1];

    const winIdx = Math.min(cells.length, 24) - 1;
    let win = parseBppWinPctFromTd(cells[winIdx]);
    if (!Number.isFinite(win) || win <= 0 || win >= 1) win = NaN;

    let csStar = NaN;
    if (csColIdx >= 0 && csColIdx < cells.length) {
      const csTxt = htmlText(cells[csColIdx]);
      const csVal = Number.parseFloat(csTxt.replace(/[^0-9.-]/g, ""));
      if (Number.isFinite(csVal)) csStar = csVal;
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
      consensus_win_prob: win,
      cs_star: csStar,
    });
  }
  return out;
}

function dedupeRows(rows) {
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
export async function fetchPositiveEvForDate(dateStr, timeoutSec) {
  const u = `${BALLPARK_PAL_POSITIVE_EV_URL}?date=${dateStr}+00%3A00%3A00&UseMyBooks=0&BetMarket=0`;
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

export async function fetchBallparkPalOddsFlat() {
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
    t0 = await fetchPositiveEvForDate(d0, to);
    t1r = { flat: [], status: "—", htmlLen: 0 };
  } else if (parallel) {
    [t0, t1r] = await Promise.all([fetchPositiveEvForDate(d0, to), fetchPositiveEvForDate(d1, to)]);
  } else {
    // Default: one ~18MB download at a time — fewer timeouts on slow links / less RAM spike.
    t0 = await fetchPositiveEvForDate(d0, to);
    t1r = await fetchPositiveEvForDate(d1, to);
  }

  let flat = [...t0.flat, ...t1r.flat];
  flat = flat.filter((r) => TARGET_BOOKS.includes(r.bookmaker_key));
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
 * BPP single-side EV table (matches R build_ev_table_bpp_single_side core).
 * @param {any[]} rows
 */
export function buildEvTableBpp(rows, opts = {}) {
  const minBooks = envInt("MLB_SCANNER_MIN_BOOKS_SAME_LINE", envInt("MLB_SHINY_MIN_BOOKS_SAME_LINE", 2));
  const bankroll = opts.bankroll ?? 1000;
  const kellyFrac = envNum("MLB_SCANNER_KELLY_FRACTION", envNum("MLB_SHINY_KELLY_FRACTION", 0.25));

  const d = rows.map((r) => ({
    ...r,
    implied: toProb(r.price),
    game: `${r.away_team} @ ${r.home_team}`,
    market_label: MARKET_LABELS[r.market] ?? r.market,
    line_key: lineKey(r.line),
  }));

  const withFair = d.map((r) => {
    const fpRaw = Number.isFinite(r.consensus_win_prob) ? r.consensus_win_prob : r.implied;
    let fairProb = Math.min(0.98, Math.max(0.02, fpRaw));
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

  const consensusMap = new Map();
  for (const r of withFair) {
    const k = [r.event_id, r.game, r.market, r.market_label, r.player, r.line_key, r.side].join("\t");
    if (!consensusMap.has(k)) consensusMap.set(k, []);
    consensusMap.get(k).push({ fair_prob: r.fair_prob, fair_odds: r.fair_odds });
  }
  const consensus = new Map();
  for (const [k, arr] of consensusMap) {
    const medProb = median(arr.map((x) => x.fair_prob));
    const medOdds = median(arr.map((x) => x.fair_odds));
    consensus.set(k, { fair_prob: medProb, fair_odds: Math.round(medOdds) });
  }

  /** book col -> uppercase key */
  const bookCol = (bk) => BOOK_ABBR_UPPER[canonicalBookKey(bk)] ?? bk.toUpperCase().slice(0, 3);

  const gridKey = (r) => [r.event_id, r.game, r.market, r.player, r.line_key, r.side].join("\t");
  const gridMap = new Map();
  for (const r of withFair) {
    const gk = gridKey(r);
    if (!gridMap.has(gk)) gridMap.set(gk, {});
    const col = bookCol(r.bookmaker_key);
    const prev = gridMap.get(gk)[col];
    if (!prev || r.price > prev) gridMap.get(gk)[col] = r.price;
  }

  const bookDepth = new Map();
  for (const [gk, prices] of gridMap) {
    const n = Object.keys(prices).filter((c) => Number.isFinite(prices[c])).length;
    bookDepth.set(gk, n);
  }

  /** @type {any[]} */
  const out = [];
  for (const bp of bestPrices) {
    const ck = [bp.event_id, bp.game, bp.market, bp.market_label, bp.player, bp.line_key, bp.side].join("\t");
    const cons = consensus.get(ck);
    if (!cons) continue;
    const gk = gridKey(bp);
    if ((bookDepth.get(gk) ?? 0) < minBooks) continue;

    const gridPrices = gridMap.get(gk) ?? {};
    let bestPrice = bp.price;
    let bestPriceFmt = fmtAmerican(bestPrice);
    let impliedFmt = (toProb(bestPrice) * 100).toFixed(1) + "%";
    let evPct = calcEvPct(cons.fair_prob, bestPrice);

    const bkU = bookCol(bp.bookmaker_key);
    const gridPr = gridPrices[bkU];
    if (Number.isFinite(gridPr)) {
      bestPrice = gridPr;
      bestPriceFmt = fmtAmerican(gridPr);
      impliedFmt = (toProb(gridPr) * 100).toFixed(1) + "%";
      evPct = calcEvPct(cons.fair_prob, gridPr);
    }

    const kelly = kellyBetDollars(cons.fair_prob, bestPrice, bankroll, kellyFrac);

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
      best_book: bp.bookmaker,
      best_book_key: bp.bookmaker_key,
      best_price: bestPrice,
      fair_prob: cons.fair_prob,
      fair_odds: cons.fair_odds,
      fair_fmt: fmtAmerican(cons.fair_odds),
      implied_fmt: impliedFmt,
      best_price_fmt: bestPriceFmt,
      ev_pct: evPct,
      cs_star: Number.isFinite(bp.cs_star) ? bp.cs_star : null,
      kelly_fmt:
        !Number.isFinite(kelly) || bankroll <= 0 ? "—" : kelly <= 0 ? "$0" : `$${kelly.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`,
      books: { ...gridPrices },
    });
  }

  out.sort((a, b) => b.ev_pct - a.ev_pct);
  const maxTable = envInt("MLB_SCANNER_MAX_TABLE_ROWS", envInt("MLB_SHINY_MAX_TABLE_ROWS", 0));
  if (maxTable > 0 && out.length > maxTable) return out.slice(0, maxTable);
  return out;
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
