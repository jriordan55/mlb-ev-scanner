export const BALLPARK_PAL_PF_URL = "https://www.ballparkpal.com/Park-Factors.php";
export const BALLPARK_PAL_POSITIVE_EV_URL = "https://www.ballparkpal.com/Positive-EV.php";
export const BALLPARK_PAL_ODDS_SCREEN_URL = "https://www.ballparkpal.com/Odds-Screen.php";

export const TARGET_BOOKS = [
  "draftkings",
  "fanduel",
  "espnbet",
  "betmgm",
  "novig",
  "caesars",
  "betvictor",
  "kalshi",
  "hardrock",
];

export const BOOK_DISPLAY = {
  draftkings: "DraftKings",
  fanduel: "FanDuel",
  betmgm: "BetMGM",
  caesars: "Caesars",
  circa: "Circa",
  bet365: "Bet365",
  espnbet: "theScore",
  novig: "Novig",
  betvictor: "BetVictor",
  kalshi: "Kalshi",
  hardrock: "Hard Rock",
};

export const BOOK_ABBR_UPPER = {
  draftkings: "DK",
  fanduel: "FD",
  betmgm: "MGM",
  caesars: "CZR",
  espnbet: "TS",
  novig: "NV",
  betvictor: "BVD",
  kalshi: "KAL",
  hardrock: "HRK",
};

export const MARKET_LABELS = {
  game_moneyline: "Moneyline",
  game_total_runs: "Total Runs",
  runs_first_inning: "Runs 1st Inning",
  team_total_runs: "Team Total Runs",
  batter_singles: "Singles",
  batter_doubles: "Doubles",
  batter_triples: "Triples",
  batter_home_runs: "Home Runs",
  batter_strikeouts: "Batter K",
  batter_walks: "Batter Walks",
  batter_hits: "Hits",
  batter_total_bases: "Total Bases",
  batter_stolen_bases: "Stolen Bases",
  batter_rbis: "RBI",
  batter_runs_scored: "Runs",
  batter_hits_runs_rbis: "H + R + RBI",
  pitcher_walks: "Pitcher Walks",
  pitcher_strikeouts: "Strikeouts",
  pitcher_earned_runs: "Earned Runs",
  pitcher_record_a_win: "Win",
  pitcher_hits_allowed: "Hits Allowed",
  pitcher_outs: "Outs",
};

export const BPP_BETMARKET_MAP = {
  1: "game_moneyline",
  2: "game_total_runs",
  4: "runs_first_inning",
  5: "team_total_runs",
  7: "batter_singles",
  8: "batter_doubles",
  9: "batter_triples",
  10: "batter_home_runs",
  11: "batter_strikeouts",
  12: "batter_walks",
  13: "batter_hits",
  14: "batter_total_bases",
  15: "batter_stolen_bases",
  16: "batter_rbis",
  17: "batter_runs_scored",
  18: "batter_hits_runs_rbis",
  19: "pitcher_walks",
  20: "pitcher_strikeouts",
  21: "pitcher_earned_runs",
  22: "pitcher_record_a_win",
  23: "pitcher_hits_allowed",
  24: "pitcher_outs",
};

/** market_key → Positive-EV.php `BetMarket` id (0 = all markets). */
export const BPP_MARKET_KEY_TO_BET_ID = Object.fromEntries(
  Object.entries(BPP_BETMARKET_MAP).map(([id, key]) => [key, Number(id)]),
);

/** BPP abbr → slug for ESPN MLB logos (500px). */
export const MLB_LOGO_ABBR = {
  ATH: "oak",
  WSH: "wsh",
  SFG: "sf",
  TBR: "tb",
  KCR: "kc",
};

export function mlbTeamLogoUrl(abbr) {
  const a = String(abbr ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  if (!a) return "";
  const slug = String(MLB_LOGO_ABBR[a] ?? a).toLowerCase();
  return `https://a.espncdn.com/i/teamlogos/mlb/500/${slug}.png`;
}

/** @type {Record<string, string>} */
const TEAM_KEYS = {
  "arizona diamondbacks": "ari",
  "atlanta braves": "atl",
  "baltimore orioles": "bal",
  "boston red sox": "bos",
  "chicago cubs": "chc",
  "chicago white sox": "chw",
  "cincinnati reds": "cin",
  "cleveland guardians": "cle",
  "cleveland indians": "cle",
  "colorado rockies": "col",
  "detroit tigers": "det",
  "houston astros": "hou",
  "kansas city royals": "kc",
  "los angeles angels": "laa",
  "la angels": "laa",
  "los angeles dodgers": "lad",
  "la dodgers": "lad",
  "miami marlins": "mia",
  "milwaukee brewers": "mil",
  "minnesota twins": "min",
  "new york mets": "nym",
  "ny mets": "nym",
  "new york yankees": "nyy",
  "ny yankees": "nyy",
  "oakland athletics": "oak",
  athletics: "oak",
  "philadelphia phillies": "phi",
  "pittsburgh pirates": "pit",
  "san diego padres": "sd",
  "san francisco giants": "sf",
  "sf giants": "sf",
  "seattle mariners": "sea",
  "st. louis cardinals": "stl",
  "st louis cardinals": "stl",
  "tampa bay rays": "tb",
  "texas rangers": "tex",
  "toronto blue jays": "tor",
  "washington nationals": "wsh",
  "washington nats": "wsh",
  nats: "wsh",
  ari: "ari",
  atl: "atl",
  bal: "bal",
  bos: "bos",
  chc: "chc",
  chw: "chw",
  cin: "cin",
  cle: "cle",
  col: "col",
  det: "det",
  hou: "hou",
  kc: "kc",
  laa: "laa",
  lad: "lad",
  mia: "mia",
  mil: "mil",
  min: "min",
  nym: "nym",
  nyy: "nyy",
  oak: "oak",
  phi: "phi",
  pit: "pit",
  sd: "sd",
  sf: "sf",
  sea: "sea",
  stl: "stl",
  tb: "tb",
  tex: "tex",
  tor: "tor",
  wsh: "wsh",
  angels: "laa",
  astros: "hou",
  braves: "atl",
  brewers: "mil",
  cardinals: "stl",
  cubs: "chc",
  diamondbacks: "ari",
  "d-backs": "ari",
  dbacks: "ari",
  guardians: "cle",
  mariners: "sea",
  marlins: "mia",
  mets: "nym",
  nationals: "wsh",
  orioles: "bal",
  padres: "sd",
  phillies: "phi",
  pirates: "pit",
  rangers: "tex",
  rays: "tb",
  rockies: "col",
  royals: "kc",
  tigers: "det",
  twins: "min",
  yankees: "nyy",
  dodgers: "lad",
  giants: "sf",
  reds: "cin",
};

const NICKNAME_TO_ABBR = {
  "red sox": "bos",
  "white sox": "chw",
  "blue jays": "tor",
  "bay rays": "tb",
};

function normalizeTeam(x) {
  let y = String(x ?? "")
    .toLowerCase()
    .trim()
    .replace(/\./g, "")
    .replace(/'/g, "")
    .replace(/&/g, "")
    .replace(/\s+/g, " ");
  return y;
}

export function teamAbbrFromName(teamName) {
  const n = normalizeTeam(teamName);
  if (!n) return null;
  if (TEAM_KEYS[n]) return TEAM_KEYS[n];
  const parts = n.split(" ").filter(Boolean);
  if (parts.length >= 2) {
    const w2 = parts.slice(-2).join(" ");
    if (NICKNAME_TO_ABBR[w2]) return NICKNAME_TO_ABBR[w2];
  }
  if (parts.length >= 1) {
    const w1 = parts[parts.length - 1];
    if (NICKNAME_TO_ABBR[w1]) return NICKNAME_TO_ABBR[w1];
  }
  return null;
}

export function ballparkPairKey(teamA, teamB) {
  const aa = teamAbbrFromName(teamA);
  const bb = teamAbbrFromName(teamB);
  if (!aa || !bb) return null;
  return [aa.toUpperCase(), bb.toUpperCase()].sort().join("|");
}

export function normalizeBpMatchupString(s) {
  return String(s ?? "")
    .toUpperCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\bCWS\b/g, "CHW");
}
