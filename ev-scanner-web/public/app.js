const FAVICON = {
  draftkings: "draftkings.com",
  fanduel: "fanduel.com",
  espnbet: "thescore.com",
  betmgm: "betmgm.com",
  novig: "novig.com",
  caesars: "caesars.com",
};

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

let lastData = null;

/** API lives on the Node server; opening index.html via file:// breaks relative /api/scan. */
function apiOrigin() {
  const meta = document.querySelector('meta[name="api-origin"]')?.getAttribute("content")?.trim();
  if (meta) return meta.replace(/\/$/, "");
  if (window.location.protocol === "file:") return "http://127.0.0.1:3847";
  return "";
}

function scanUrl(opts = {}) {
  const p = new URLSearchParams();
  if (window.location.search.includes("skipPf=1")) p.set("skipPf", "1");
  if (opts.nocache) p.set("nocache", "1");
  const qs = p.toString();
  const path = `/api/scan${qs ? `?${qs}` : ""}`;
  const o = apiOrigin();
  return o ? `${o}${path}` : path;
}

function applyFilters(rows) {
  if (!rows?.length) return [];
  let out = rows;
  const market = document.getElementById("market").value;
  if (market && market !== "All") out = out.filter((r) => r.market === market);
  const game = document.getElementById("game").value;
  if (game && game !== "All Games") out = out.filter((r) => r.game === game);
  const ou = document.getElementById("ou").value;
  if (ou === "Overs") out = out.filter((r) => r.side === "over");
  else if (ou === "Unders") out = out.filter((r) => r.side === "under");
  const bb = document.getElementById("bestBook").value;
  if (bb && bb !== "All") out = out.filter((r) => r.best_book_key === bb);
  return out;
}

function getBankroll() {
  const n = Number.parseFloat(document.getElementById("bankroll").value);
  return Number.isFinite(n) ? n : 1000;
}

async function load(opts = {}) {
  const status = document.getElementById("status");
  if (window.location.protocol === "file:") {
    status.textContent = `Loading via API ${apiOrigin() || "(same host)"}… If this fails, open http://127.0.0.1:3847 after npm start (recommended). First load 30–120s.`;
  } else {
    status.textContent = "Loading odds… (Ballpark Pal pages are large; first load can take 30–120s)";
  }
  try {
    const r = await fetch(scanUrl(opts), { cache: "no-store" });
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
    lastData = data;
    fillFilters(data);
    redraw();
    const n = applyFilters(data.rows).length;
    const st = data.stats || {};
    const warn = Array.isArray(st.warnings) && st.warnings.length ? ` · ⚠ ${st.warnings.join(" ")}` : "";
    status.textContent = `Updated ${new Date(data.fetchedAt).toLocaleString()} · showing ${n} of ${data.rows.length} table rows · raw odds ${st.flat_odds_rows ?? "?"} · HTTP ${st.http_status ?? ""}${warn}`;
    if (data.rows.length === 0 && (st.flat_odds_rows ?? 0) === 0) {
      const origin = apiOrigin() || "";
      const base = origin || window.location.origin || "";
      status.textContent += ` — No raw odds. Open ${base}/api/health in a new tab (server up?). In the terminal running npm start you should see [mlb-ev] lines with row counts. Try: longer timeout (set MLB_SCANNER_BPP_TIMEOUT_SEC=120), only today (MLB_SCANNER_BPP_FETCH_DAYS=1), or ?skipPf=1.`;
    }
  } catch (e) {
    status.textContent = `Error: ${e.message} — Is the server running (npm start)? Try ${apiOrigin() || ""}/api/health`;
    document.getElementById("tbody").innerHTML = "";
  }
}

function redraw() {
  if (!lastData) return;
  const rows = applyFilters(lastData.rows);
  const br = getBankroll();
  render(rows, br, lastData.books || []);
  const status = document.getElementById("status");
  if (lastData.stats) {
    status.textContent = `Updated ${new Date(lastData.fetchedAt).toLocaleString()} · showing ${rows.length} of ${lastData.rows.length} rows · HTTP ${lastData.stats.http_status ?? ""}`;
  }
}

function fillFilters(data) {
  const mk = document.getElementById("market");
  const curM = mk.value;
  mk.innerHTML = "";
  const mo = document.createElement("option");
  mo.value = "All";
  mo.textContent = "All";
  mk.appendChild(mo);
  for (const m of data.markets || []) {
    const o = document.createElement("option");
    o.value = m;
    o.textContent = data.marketLabels?.[m] || m;
    mk.appendChild(o);
  }
  if ([...mk.options].some((o) => o.value === curM)) mk.value = curM;

  const gm = document.getElementById("game");
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

  const bb = document.getElementById("bestBook");
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

  const thead = document.querySelector("#grid thead tr");
  const staticCols = 16;
  while (thead.children.length > staticCols) {
    thead.removeChild(thead.lastChild);
  }
  for (const b of data.books || []) {
    const th = document.createElement("th");
    th.className = "book-head";
    const dom = FAVICON[b.key];
    if (dom) {
      th.innerHTML = `<span class="bh"><img src="${favUrl(dom)}" alt="" width="18" height="18" /> ${esc(b.label)}</span>`;
    } else {
      th.textContent = b.label;
    }
    thead.appendChild(th);
  }
}

function render(rows, bankroll, books) {
  const tb = document.getElementById("tbody");
  if (!rows?.length) {
    const st = lastData?.stats;
    const hint =
      st && (st.flat_odds_rows ?? 0) > 0 && (st.ev_table_rows ?? 0) === 0
        ? "Odds loaded but the EV table is empty (unusual). Try lowering MLB_SCANNER_MIN_BOOKS_SAME_LINE to 1 on the server."
        : st && (st.flat_odds_rows ?? 0) === 0
          ? "No odds rows from Ballpark Pal (timeout, block, or off-season)."
          : "No rows match your filters — set Market / Game / Best book to All.";
    tb.innerHTML = `<tr><td colspan="99" style="padding:24px;color:#6b7c99">${esc(hint)}</td></tr>`;
    return;
  }
  const keyToAbbr = Object.fromEntries(books.map((b) => [b.key, b.abbr]));
  const frag = document.createDocumentFragment();
  for (const r of rows) {
    const tr = document.createElement("tr");
    const evc = evClass(r.ev_pct);
    const cs =
      r.cs_star != null && Number.isFinite(Number(r.cs_star))
        ? Number(r.cs_star) > 0
          ? `+${Math.round(Number(r.cs_star))}`
          : String(Math.round(Number(r.cs_star)))
        : "—";
    const kelly = formatKelly(r.fair_prob, r.best_price, bankroll);
    const bestAbbr = keyToAbbr[r.best_book_key] || "";
    const dom = FAVICON[r.best_book_key] || "";

    const evNum = Number(r.ev_pct);
    const evStr = Number.isFinite(evNum) ? `${evNum.toFixed(2)}%` : "—";
    const cells = [
      `<td class="${evc}">${evStr}</td>`,
      `<td>${esc(kelly)}</td>`,
      `<td><span class="book-mini"><img src="${favUrl(dom)}" alt="" width="16" height="16" onerror="this.style.display='none'"/> ${esc(r.best_book || "")}</span></td>`,
      `<td style="text-align:left;max-width:140px;overflow:hidden;text-overflow:ellipsis">${esc(r.player)}</td>`,
      `<td>${esc(r.line)}</td>`,
      `<td>${esc(r.fair_fmt)}</td>`,
      `<td>${esc(cs)}</td>`,
      `<td>${esc(r.implied_fmt)}</td>`,
      `<td>${esc(r.best_price_fmt)}</td>`,
      `<td>${esc(r.market_label)}</td>`,
      `<td>${esc(r.side)}</td>`,
      `<td>${esc(r.game)}</td>`,
      `<td class="${bppClass(r.bpp_hr)}">${esc(r.bpp_hr)}</td>`,
      `<td class="${bppClass(r.bpp_2b3b)}">${esc(r.bpp_2b3b)}</td>`,
      `<td class="${bppClass(r.bpp_1b)}">${esc(r.bpp_1b)}</td>`,
      `<td class="${bppClass(r.bpp_runs)}">${esc(r.bpp_runs)}</td>`,
    ];
    for (const b of books) {
      const raw = r.books?.[b.abbr];
      let inner = raw != null && Number.isFinite(raw) ? formatAm(raw) : "—";
      if (b.abbr === bestAbbr && inner !== "—") inner = `<span class="best-cell">${inner}</span>`;
      cells.push(`<td>${inner}</td>`);
    }
    tr.innerHTML = cells.join("");
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

document.getElementById("btnRefresh").addEventListener("click", () => load({ nocache: true }));
document.getElementById("btnHelp").addEventListener("click", () => document.getElementById("helpDlg").showModal());

["market", "game", "ou", "bestBook"].forEach((id) => {
  document.getElementById(id).addEventListener("change", () => redraw());
});

document.getElementById("bankroll").addEventListener("input", debounce(() => redraw(), 200));

load();
