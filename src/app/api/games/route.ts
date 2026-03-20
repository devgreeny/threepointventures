import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

const ODDS_API = "https://api.the-odds-api.com/v4/sports/basketball_ncaab";
const PREGAME_ODDS_COLLECTION = "pregame_odds";
const COMPLETED_GAMES_COLLECTION = "completed_games";
const ESPN_API =
  "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard";
const ESPN_SUMMARY =
  "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary";

// ── Odds API types ──

interface OddsOutcome {
  name: string;
  price: number; // American odds
}

interface OddsMarket {
  key: string;
  outcomes: OddsOutcome[];
}

interface OddsBookmaker {
  key: string;
  title: string;
  markets: OddsMarket[];
}

interface OddsEvent {
  id: string;
  sport_key: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: OddsBookmaker[];
}

// ── ESPN types ──

interface ESPNCompetitor {
  team: { displayName: string; shortDisplayName: string; abbreviation: string; logo?: string };
  score: string;
  homeAway: string;
  winner?: boolean;
  curatedRank?: { current: number };
}

// ── Official 2026 NCAA Tournament Field (68 teams) ──
// Each entry: canonical name, seed, and alternate names used by Odds API / ESPN

interface TournamentTeam {
  name: string;
  seed: number;
  rank: number; // AP/committee ranking (1-68)
  aliases: string[];
}

const TOURNAMENT_FIELD: TournamentTeam[] = [
  // 1-seeds
  { name: "Duke", seed: 1, rank: 1, aliases: ["Duke Blue Devils"] },
  { name: "Arizona", seed: 1, rank: 2, aliases: ["Arizona Wildcats"] },
  { name: "Michigan", seed: 1, rank: 3, aliases: ["Michigan Wolverines"] },
  { name: "Florida", seed: 1, rank: 4, aliases: ["Florida Gators"] },
  // 2-seeds
  { name: "Houston", seed: 2, rank: 5, aliases: ["Houston Cougars"] },
  { name: "UConn", seed: 2, rank: 6, aliases: ["UConn Huskies", "Connecticut Huskies", "Connecticut"] },
  { name: "Iowa State", seed: 2, rank: 7, aliases: ["Iowa State Cyclones", "Iowa St", "Iowa St Cyclones"] },
  { name: "Purdue", seed: 2, rank: 8, aliases: ["Purdue Boilermakers"] },
  // 3-seeds
  { name: "Michigan State", seed: 3, rank: 9, aliases: ["Michigan State Spartans", "Michigan St Spartans", "Michigan St"] },
  { name: "Illinois", seed: 3, rank: 10, aliases: ["Illinois Fighting Illini"] },
  { name: "Gonzaga", seed: 3, rank: 11, aliases: ["Gonzaga Bulldogs"] },
  { name: "Virginia", seed: 3, rank: 12, aliases: ["Virginia Cavaliers"] },
  // 4-seeds
  { name: "Nebraska", seed: 4, rank: 13, aliases: ["Nebraska Cornhuskers"] },
  { name: "Alabama", seed: 4, rank: 14, aliases: ["Alabama Crimson Tide"] },
  { name: "Kansas", seed: 4, rank: 15, aliases: ["Kansas Jayhawks"] },
  { name: "Arkansas", seed: 4, rank: 16, aliases: ["Arkansas Razorbacks"] },
  // 5-seeds
  { name: "Vanderbilt", seed: 5, rank: 17, aliases: ["Vanderbilt Commodores"] },
  { name: "St. John's", seed: 5, rank: 18, aliases: ["St. John's Red Storm", "St. John's (NY)", "Saint Johns", "St Johns", "Saint John's Red Storm"] },
  { name: "Texas Tech", seed: 5, rank: 19, aliases: ["Texas Tech Red Raiders"] },
  { name: "Wisconsin", seed: 5, rank: 20, aliases: ["Wisconsin Badgers"] },
  // 6-seeds
  { name: "Tennessee", seed: 6, rank: 21, aliases: ["Tennessee Volunteers"] },
  { name: "North Carolina", seed: 6, rank: 22, aliases: ["North Carolina Tar Heels", "UNC"] },
  { name: "Louisville", seed: 6, rank: 23, aliases: ["Louisville Cardinals"] },
  { name: "BYU", seed: 6, rank: 24, aliases: ["BYU Cougars", "Brigham Young", "Brigham Young Cougars"] },
  // 7-seeds
  { name: "Kentucky", seed: 7, rank: 25, aliases: ["Kentucky Wildcats"] },
  { name: "Saint Mary's", seed: 7, rank: 26, aliases: ["Saint Mary's Gaels", "Saint Mary's (CA)", "St. Mary's", "St. Mary's Gaels"] },
  { name: "Miami", seed: 7, rank: 27, aliases: ["Miami Hurricanes", "Miami (FL)", "Miami FL Hurricanes"] },
  { name: "UCLA", seed: 7, rank: 28, aliases: ["UCLA Bruins"] },
  // 8-seeds
  { name: "Clemson", seed: 8, rank: 29, aliases: ["Clemson Tigers"] },
  { name: "Villanova", seed: 8, rank: 30, aliases: ["Villanova Wildcats"] },
  { name: "Ohio State", seed: 8, rank: 31, aliases: ["Ohio State Buckeyes", "Ohio St", "Ohio St Buckeyes"] },
  { name: "Georgia", seed: 8, rank: 32, aliases: ["Georgia Bulldogs"] },
  // 9-seeds
  { name: "Utah State", seed: 9, rank: 33, aliases: ["Utah State Aggies", "Utah St", "Utah St Aggies"] },
  { name: "TCU", seed: 9, rank: 34, aliases: ["TCU Horned Frogs"] },
  { name: "Saint Louis", seed: 9, rank: 35, aliases: ["Saint Louis Billikens", "St. Louis", "St. Louis Billikens"] },
  { name: "Iowa", seed: 9, rank: 36, aliases: ["Iowa Hawkeyes"] },
  // 10-seeds
  { name: "Santa Clara", seed: 10, rank: 37, aliases: ["Santa Clara Broncos"] },
  { name: "UCF", seed: 10, rank: 38, aliases: ["UCF Knights"] },
  { name: "Missouri", seed: 10, rank: 39, aliases: ["Missouri Tigers"] },
  { name: "Texas A&M", seed: 10, rank: 40, aliases: ["Texas A&M Aggies", "Texas AM", "Texas AM Aggies"] },
  // 11-seeds (includes First Four play-in teams)
  { name: "NC State", seed: 11, rank: 41, aliases: ["NC State Wolfpack", "North Carolina State", "North Carolina State Wolfpack"] },
  { name: "Texas", seed: 11, rank: 42, aliases: ["Texas Longhorns"] },
  { name: "SMU", seed: 11, rank: 43, aliases: ["SMU Mustangs"] },
  { name: "Miami (OH)", seed: 11, rank: 44, aliases: ["Miami (OH) RedHawks", "Miami Ohio", "Miami Ohio RedHawks", "Miami RedHawks"] },
  { name: "VCU", seed: 11, rank: 45, aliases: ["VCU Rams"] },
  { name: "South Florida", seed: 11, rank: 46, aliases: ["South Florida Bulls", "USF", "USF Bulls"] },
  // 12-seeds
  { name: "McNeese", seed: 12, rank: 47, aliases: ["McNeese Cowboys", "McNeese State", "McNeese St", "McNeese St Cowboys", "McNeese State Cowboys"] },
  { name: "Akron", seed: 12, rank: 48, aliases: ["Akron Zips"] },
  { name: "Northern Iowa", seed: 12, rank: 49, aliases: ["Northern Iowa Panthers", "UNI", "UNI Panthers"] },
  { name: "High Point", seed: 12, rank: 50, aliases: ["High Point Panthers"] },
  // 13-seeds
  { name: "California Baptist", seed: 13, rank: 51, aliases: ["California Baptist Lancers", "Cal Baptist Lancers", "Cal Baptist", "CBU"] },
  { name: "Hofstra", seed: 13, rank: 52, aliases: ["Hofstra Pride"] },
  { name: "Troy", seed: 13, rank: 53, aliases: ["Troy Trojans"] },
  { name: "Hawai'i", seed: 13, rank: 54, aliases: ["Hawai'i Rainbow Warriors", "Hawaii Rainbow Warriors", "Hawaii"] },
  // 14-seeds
  { name: "North Dakota State", seed: 14, rank: 55, aliases: ["North Dakota State Bison", "North Dakota St Bison", "North Dakota St", "NDSU"] },
  { name: "Penn", seed: 14, rank: 56, aliases: ["Pennsylvania Quakers", "Pennsylvania"] },
  { name: "Wright State", seed: 14, rank: 57, aliases: ["Wright State Raiders", "Wright St Raiders", "Wright St"] },
  { name: "Kennesaw State", seed: 14, rank: 58, aliases: ["Kennesaw State Owls", "Kennesaw St Owls", "Kennesaw St"] },
  // 15-seeds
  { name: "Tennessee State", seed: 15, rank: 59, aliases: ["Tennessee State Tigers", "Tennessee St Tigers", "Tennessee St"] },
  { name: "Idaho", seed: 15, rank: 60, aliases: ["Idaho Vandals"] },
  { name: "Furman", seed: 15, rank: 61, aliases: ["Furman Paladins"] },
  { name: "Queens", seed: 15, rank: 62, aliases: ["Queens University Royals", "Queens (NC)", "Queens University"] },
  // 16-seeds (includes First Four play-in teams)
  { name: "Siena", seed: 16, rank: 63, aliases: ["Siena Saints"] },
  { name: "LIU", seed: 16, rank: 64, aliases: ["LIU Sharks", "Long Island", "Long Island University Sharks"] },
  { name: "Howard", seed: 16, rank: 65, aliases: ["Howard Bison"] },
  { name: "UMBC", seed: 16, rank: 66, aliases: ["UMBC Retrievers"] },
  { name: "Lehigh", seed: 16, rank: 67, aliases: ["Lehigh Mountain Hawks"] },
  { name: "Prairie View", seed: 16, rank: 68, aliases: ["Prairie View Panthers", "Prairie View A&M", "Prairie View A&M Panthers"] },
];

// Build lookup structures from the tournament field
const _seedMap = new Map<string, number>();
const _teamLookup = new Map<string, TournamentTeam>();

for (const team of TOURNAMENT_FIELD) {
  const allNames = [team.name, ...team.aliases];
  for (const name of allNames) {
    _seedMap.set(normalize(name), team.seed);
    _teamLookup.set(normalize(name), team);
  }
}

function canonicalTeamName(name: string): string {
  const norm = normalize(name);
  const direct = _teamLookup.get(norm);
  if (direct) return normalize(direct.name);
  for (const [key, team] of _teamLookup) {
    if (norm.includes(key) || key.includes(norm)) return normalize(team.name);
  }
  return norm;
}

function lookupSeed(teamName: string): number | undefined {
  const norm = normalize(teamName);
  if (_seedMap.has(norm)) return _seedMap.get(norm);
  for (const [key, seed] of _seedMap) {
    if (norm.includes(key) || key.includes(norm)) return seed;
  }
  return undefined;
}

function isTournamentTeam(teamName: string): boolean {
  const norm = normalize(teamName);
  if (_teamLookup.has(norm)) return true;
  for (const key of _teamLookup.keys()) {
    if (norm.includes(key) || key.includes(norm)) return true;
  }
  return false;
}

interface ESPNCompetition {
  competitors: ESPNCompetitor[];
  status: {
    type: { name: string; completed: boolean };
    displayClock: string;
    period: number;
  };
}

interface ESPNEvent {
  id: string;
  name: string;
  shortName: string;
  date?: string; // ISO date for commence_time when building from ESPN only
  competitions: ESPNCompetition[];
}

// ── Unified game type returned to the client ──

export interface ApiGame {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  favorite: {
    name: string;
    odds: number;
    score?: number;
    seed?: number;
    logo?: string;
  };
  underdog: {
    name: string;
    odds: number;
    score?: number;
    seed?: number;
    logo?: string;
  };
  status: "upcoming" | "live" | "final";
  result: "win" | "loss" | "push" | "pending";
  clock?: string;
  period?: number;
  espnId?: string;
  underdogWinPct?: number; // 0-100, live win probability for the underdog
  oddsSource?: string; // e.g. "DraftKings"
}

export interface GamesResponse {
  games: ApiGame[];
  fetchedAt: string;
  oddsRemaining?: number;
  /** Set when Odds API returned 429 (out of credits) but we served cached games */
  oddsOutOfCredits?: boolean;
}

// ── Static ESPN team ID map for guaranteed logo URLs ──

const ESPN_TEAM_IDS: Record<string, number> = {
  "Akron Zips": 2006,
  "Alabama Crimson Tide": 333,
  "Alabama State Hornets": 2011,
  "Arizona Wildcats": 12,
  "Arkansas Razorbacks": 8,
  "Auburn Tigers": 2,
  "BYU Cougars": 252,
  "Baylor Bears": 239,
  "California Baptist Lancers": 2856,
  "Clemson Tigers": 228,
  "Colgate Raiders": 2142,
  "Creighton Bluejays": 156,
  "Drake Bulldogs": 2181,
  "Duke Blue Devils": 150,
  "Florida Gators": 57,
  "Furman Paladins": 231,
  "Georgia Bulldogs": 61,
  "Gonzaga Bulldogs": 2250,
  "Grand Canyon Antelopes": 2253,
  "High Point Panthers": 2272,
  "Hofstra Pride": 2275,
  "Houston Cougars": 248,
  "Illinois Fighting Illini": 356,
  "Iowa Hawkeyes": 2294,
  "Iowa State Cyclones": 66,
  "Kansas Jayhawks": 2305,
  "Kentucky Wildcats": 96,
  "Lipscomb Bisons": 288,
  "Louisville Cardinals": 97,
  "Marquette Golden Eagles": 269,
  "Maryland Terrapins": 120,
  "McNeese Cowboys": 2377,
  "Memphis Tigers": 235,
  "Michigan State Spartans": 127,
  "Michigan Wolverines": 130,
  "Mississippi State Bulldogs": 344,
  "Missouri Tigers": 142,
  "Montana Grizzlies": 149,
  "North Carolina Tar Heels": 153,
  "Northern Iowa Panthers": 2460,
  "Ole Miss Rebels": 145,
  "Omaha Mavericks": 2437,
  "Oregon Ducks": 2483,
  "Purdue Boilermakers": 2509,
  "Robert Morris Colonials": 2523,
  "SIU Edwardsville Cougars": 2565,
  "Santa Clara Broncos": 2541,
  "St. John's Red Storm": 2599,
  "Tennessee State Tigers": 2634,
  "Tennessee Volunteers": 2633,
  "Texas A&M Aggies": 245,
  "Texas Tech Red Raiders": 2641,
  "Troy Trojans": 2653,
  "Utah State Aggies": 328,
  "UC San Diego Tritons": 28,
  "UCF Knights": 2116,
  "UCLA Bruins": 26,
  "UConn Huskies": 41,
  "UNC Wilmington Seahawks": 350,
  "VCU Rams": 2670,
  "Villanova Wildcats": 222,
  "Virginia Cavaliers": 258,
  "Wisconsin Badgers": 275,
  "Wofford Terriers": 2747,
  "Wright State Raiders": 2750,
  "Yale Bulldogs": 43,
  "North Dakota State Bison": 2449,
  "Kennesaw State Owls": 338,
  "Miami Hurricanes": 2390,
};

function expandAbbreviations(s: string): string {
  return s
    .replace(/\bst\b/g, "state")
    .replace(/\bso\b/g, "southern")
    .replace(/\bn\b/g, "north")
    .replace(/\bs\b/g, "south")
    .replace(/\bw\b/g, "west")
    .replace(/\be\b/g, "east")
    .replace(/\bfl\b/g, "florida")
    .replace(/\bcal\b/g, "california");
}

const LOCAL_LOGOS: Record<string, string> = {
  "Queens University Royals": "/logos/queens.png",
  "Utah State Aggies": "/logos/utah-state.png",
};

function getStaticLogo(teamName: string): string | undefined {
  // Check local logos first (teams not in ESPN)
  if (LOCAL_LOGOS[teamName]) return LOCAL_LOGOS[teamName];
  const nl = normalize(teamName);
  for (const [name, url] of Object.entries(LOCAL_LOGOS)) {
    if (normalize(name) === nl || nl.includes(normalize(name))) return url;
  }
  // ESPN ID lookup
  const directId = ESPN_TEAM_IDS[teamName];
  if (directId && directId > 0) {
    return `https://a.espncdn.com/i/teamlogos/ncaa/500/${directId}.png`;
  }
  // Fuzzy match by normalized + expanded name
  const n = expandAbbreviations(nl);
  for (const [name, id] of Object.entries(ESPN_TEAM_IDS)) {
    if (!id || id === 0) continue;
    const nn = expandAbbreviations(normalize(name));
    if (nn === n || nn.includes(n) || n.includes(nn)) {
      return `https://a.espncdn.com/i/teamlogos/ncaa/500/${id}.png`;
    }
  }
  return undefined;
}

// ── Team name normalization for matching between APIs ──

function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function teamsMatch(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;

  // Handle common mismatches
  const aliases: Record<string, string[]> = {
    "san diego state": ["san diego st", "sdsu", "san diego state aztecs"],
    "uc san diego": ["ucsd", "uc san diego tritons"],
    "uc irvine": ["uci"],
    "st johns": ["saint johns", "st johns red storm"],
    "mount st marys": ["mt st marys", "mount saint marys"],
    "saint francis": ["st francis"],
    "mississippi state": ["miss state", "mississippi st"],
    "ole miss": ["mississippi rebels", "mississippi"],
    "texas am": ["texas a&m"],
    "siu edwardsville": ["siue"],
    "unc wilmington": ["uncw"],
    "colorado state": ["colorado st"],
    "boise state": ["boise st"],
    "iowa state": ["iowa st"],
    "michigan state": ["michigan st"],
    "norfolk state": ["norfolk st"],
    "alabama state": ["alabama st"],
    "mcneese": ["mcneese state", "mcneese st"],
    "grand canyon": ["gcu", "grand canyon antelopes"],
    "high point": ["high point panthers"],
  };

  for (const [, names] of Object.entries(aliases)) {
    const aMatch = names.some((n) => na.includes(n) || n.includes(na));
    const bMatch = names.some((n) => nb.includes(n) || n.includes(nb));
    if (aMatch && bMatch) return true;
    // Also check if one of them matches the canonical key
    const canonical = normalize(Object.keys(aliases).find((k) =>
      aliases[k] === names
    ) || "");
    if ((na.includes(canonical) || canonical.includes(na)) && bMatch) return true;
    if ((nb.includes(canonical) || canonical.includes(nb)) && aMatch) return true;
  }

  return false;
}

// ── Pregame odds cache — lock in odds once captured, never overwrite with live lines ──

// Static pregame odds for specific underdogs (used when API doesn't have pregame or we want to lock in)
const PREGAME_OVERRIDES: Record<string, number> = {
  tcu: 120,
  troy: 650,
  "north dakota state": 950,
  "south florida": 164,
  "texas longhorns": 114,
  "texas am": 136,
  vcu: 120,
};

function getPregameOverride(underdogName: string): number | undefined {
  const n = normalize(underdogName);
  // Sort by key length descending so longer (more specific) keys match first
  const sorted = Object.entries(PREGAME_OVERRIDES).sort((a, b) => b[0].length - a[0].length);
  for (const [key, odds] of sorted) {
    if (n.includes(key) || key.includes(n)) return odds;
  }
  return undefined;
}

interface CachedOdds {
  favoriteOdds: number;
  underdogOdds: number;
  favoriteName: string;
  underdogName: string;
  oddsSource: string;
}

const oddsCache = new Map<string, CachedOdds>();

function cacheOdds(gameKey: string, data: CachedOdds) {
  if (!oddsCache.has(gameKey) && data.underdogOdds !== 0) {
    oddsCache.set(gameKey, data);
  }
}

function getCachedOdds(gameKey: string): CachedOdds | undefined {
  return oddsCache.get(gameKey);
}

export function makeGameKey(team1: string, team2: string): string {
  return [canonicalTeamName(team1), canonicalTeamName(team2)].sort().join("||");
}

// ── Database: 11am ET pregame odds snapshot (Supabase) ──

function getDateET(): string {
  const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const y = et.getFullYear();
  const m = String(et.getMonth() + 1).padStart(2, "0");
  const d = String(et.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export interface PregameOddsEntry {
  gameKey: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  favoriteName: string;
  underdogName: string;
  favoriteOdds: number;
  underdogOdds: number;
  oddsSource: string;
}

interface PregameOddsDoc {
  snapshot_date: string;
  game_key: string;
  favorite_odds: number;
  underdog_odds: number;
  favorite_name: string;
  underdog_name: string;
  odds_source: string;
}

export async function getPregameOddsFromDB(): Promise<Map<string, CachedOdds>> {
  const map = new Map<string, CachedOdds>();
  const db = getDb();
  if (!db) return map;
  try {
    const today = getDateET();
    const yesterday = new Date(new Date(today).getTime() - 86400000).toISOString().slice(0, 10);
    const cursor = db
      .collection<PregameOddsDoc>(PREGAME_ODDS_COLLECTION)
      .find({ snapshot_date: { $in: [today, yesterday] } })
      .project({ game_key: 1, favorite_odds: 1, underdog_odds: 1, favorite_name: 1, underdog_name: 1, odds_source: 1 });
    const rows = await cursor.toArray();
    for (const row of rows) {
      map.set(row.game_key, {
        favoriteOdds: row.favorite_odds ?? 0,
        underdogOdds: row.underdog_odds ?? 0,
        favoriteName: row.favorite_name ?? "",
        underdogName: row.underdog_name ?? "",
        oddsSource: row.odds_source ?? "",
      });
    }
  } catch {
    // no DB or error
  }
  return map;
}

export async function savePregameOddsSnapshot(entries: PregameOddsEntry[]): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    const date = getDateET();
    const col = db.collection(PREGAME_ODDS_COLLECTION);
    await col.deleteMany({ snapshot_date: date });
    if (entries.length > 0) {
      const docs = entries.map((e) => ({
        snapshot_date: date,
        game_key: e.gameKey,
        commence_time: e.commence_time,
        home_team: e.home_team,
        away_team: e.away_team,
        favorite_name: e.favoriteName,
        underdog_name: e.underdogName,
        favorite_odds: e.favoriteOdds,
        underdog_odds: e.underdogOdds,
        odds_source: e.oddsSource,
      }));
      await col.insertMany(docs);
    }
  } catch (e) {
    console.error("savePregameOddsSnapshot:", e);
  }
}

// ── Database: completed games (one source of truth for finished games) ──

export interface CompletedGameDoc {
  game_key: string;
  underdog_name: string;
  favorite_name: string;
  underdog_odds: number;
  result: "win" | "loss" | "push";
  underdog_score?: number;
  favorite_score?: number;
  commence_time: string;
  finished_at?: string;
  espn_id?: string;
  source?: "backfill" | "espn";
}

export async function getCompletedGamesFromDB(): Promise<Map<string, CompletedGameDoc>> {
  const map = new Map<string, CompletedGameDoc>();
  const db = getDb();
  if (!db) return map;
  try {
    const cursor = db.collection<CompletedGameDoc>(COMPLETED_GAMES_COLLECTION).find({});
    const rows = await cursor.toArray();
    for (const row of rows) map.set(row.game_key, row);
  } catch {
    // no DB or error
  }
  return map;
}

export async function saveCompletedGame(doc: CompletedGameDoc): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    const col = db.collection<CompletedGameDoc>(COMPLETED_GAMES_COLLECTION);
    await col.updateOne({ game_key: doc.game_key }, { $set: doc }, { upsert: true });
  } catch (e) {
    console.error("saveCompletedGame:", e);
  }
}

/** Turn a completed game doc into an ApiGame for display (e.g. backfilled games not on live feed). */
function completedDocToApiGame(doc: CompletedGameDoc): GameWithMeta {
  const favSeed = lookupSeed(doc.favorite_name);
  const dogSeed = lookupSeed(doc.underdog_name);
  return {
    id: doc.espn_id ?? doc.game_key,
    commence_time: doc.commence_time,
    home_team: doc.favorite_name,
    away_team: doc.underdog_name,
    favorite: {
      name: doc.favorite_name,
      odds: 0,
      score: doc.favorite_score,
      seed: favSeed,
      logo: getStaticLogo(doc.favorite_name),
    },
    underdog: {
      name: doc.underdog_name,
      odds: doc.underdog_odds,
      score: doc.underdog_score,
      seed: dogSeed,
      logo: getStaticLogo(doc.underdog_name),
    },
    status: "final",
    result: doc.result,
    espnId: doc.espn_id,
  } as GameWithMeta;
}

/** Build one snapshot entry from an Odds API event (tournament only). Used by cron. */
export function buildPregameSnapshotFromOddsEvent(oddsEvent: OddsEvent): PregameOddsEntry | null {
  if (!isTournamentTeam(oddsEvent.home_team) || !isTournamentTeam(oddsEvent.away_team)) return null;
  let bookmaker = oddsEvent.bookmakers.find((b) => b.key === "draftkings");
  if (!bookmaker) bookmaker = oddsEvent.bookmakers.find((b) => b.key === "fanduel");
  if (!bookmaker) bookmaker = oddsEvent.bookmakers.find((b) => b.key === "betmgm");
  if (!bookmaker) bookmaker = oddsEvent.bookmakers[0];
  const oddsSource = bookmaker?.title ?? "";
  const h2h = bookmaker?.markets.find((m) => m.key === "h2h");
  const homeOutcome = h2h?.outcomes.find((o) => o.name === oddsEvent.home_team);
  const awayOutcome = h2h?.outcomes.find((o) => o.name === oddsEvent.away_team);
  const homeOdds = homeOutcome?.price ?? 0;
  const awayOdds = awayOutcome?.price ?? 0;
  const homeSeed = lookupSeed(oddsEvent.home_team);
  const awaySeed = lookupSeed(oddsEvent.away_team);
  const homeIsOurPick =
    (homeSeed ?? 0) > (awaySeed ?? 0)
    || ((homeSeed ?? 0) === (awaySeed ?? 0) && homeOdds > awayOdds);
  const opponentName = homeIsOurPick ? oddsEvent.away_team : oddsEvent.home_team;
  const ourPickName = homeIsOurPick ? oddsEvent.home_team : oddsEvent.away_team;
  const opponentOdds = homeIsOurPick ? awayOdds : homeOdds;
  const ourPickOdds = homeIsOurPick ? homeOdds : awayOdds;
  const override = getPregameOverride(ourPickName);
  const underdogOdds = override ?? ourPickOdds;
  const favoriteOdds = opponentOdds;
  return {
    gameKey: makeGameKey(oddsEvent.home_team, oddsEvent.away_team),
    commence_time: oddsEvent.commence_time,
    home_team: oddsEvent.home_team,
    away_team: oddsEvent.away_team,
    favoriteName: opponentName,
    underdogName: ourPickName,
    favoriteOdds,
    underdogOdds: underdogOdds || 0,
    oddsSource,
  };
}

/** Fetch odds from API without using in-memory cache. Used by 11am cron. */
export async function fetchOddsFromAPI(): Promise<{ events: OddsEvent[]; remaining?: number }> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey || apiKey === "YOUR_KEY_HERE") return { events: [] };
  const url = `${ODDS_API}/odds?apiKey=${apiKey}&regions=us&markets=h2h&oddsFormat=american&bookmakers=draftkings`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      if (res.status === 429) return { events: [], remaining: 0 };
      return { events: [] };
    }
    const remaining = res.headers.get("x-requests-remaining");
    const data: OddsEvent[] = await res.json();
    return { events: data, remaining: remaining ? parseInt(remaining) : undefined };
  } catch {
    return { events: [] };
  }
}

// ── Filtering rules ──

function isFirstFour(favSeed?: number, dogSeed?: number): boolean {
  if (!favSeed || !dogSeed) return false;
  return favSeed === dogSeed;
}

function isOneVsSixteen(favSeed?: number, dogSeed?: number): boolean {
  if (!favSeed || !dogSeed) return false;
  return (favSeed === 1 && dogSeed === 16) || (favSeed === 16 && dogSeed === 1);
}

// ── Daily odds cache — fetch once per day at 11am ET, serve from cache otherwise ──

interface DailyOddsCache {
  events: OddsEvent[];
  remaining?: number;
  fetchedAt: number; // epoch ms
}

let dailyOddsCache: DailyOddsCache | null = null;

function shouldRefreshOdds(): boolean {
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const todayRefreshTime = new Date(et);
  todayRefreshTime.setHours(11, 0, 0, 0);

  if (!dailyOddsCache) return true;

  const cachedDate = new Date(
    new Date(dailyOddsCache.fetchedAt).toLocaleString("en-US", { timeZone: "America/New_York" })
  );

  // If it's past 11am ET and cache is from before 11am ET today, refresh
  if (et >= todayRefreshTime) {
    const cacheRefreshTime = new Date(cachedDate);
    cacheRefreshTime.setHours(11, 0, 0, 0);
    return cachedDate < cacheRefreshTime || cachedDate.toDateString() !== et.toDateString();
  }

  // Before 11am — use cache if it exists from yesterday's 11am refresh
  return false;
}

async function fetchOdds(): Promise<{ events: OddsEvent[]; remaining?: number }> {
  if (!shouldRefreshOdds() && dailyOddsCache) {
    return { events: dailyOddsCache.events, remaining: dailyOddsCache.remaining };
  }

  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey || apiKey === "YOUR_KEY_HERE") {
    return { events: dailyOddsCache?.events ?? [], remaining: dailyOddsCache?.remaining };
  }

  const url = `${ODDS_API}/odds?apiKey=${apiKey}&regions=us&markets=h2h&oddsFormat=american&bookmakers=draftkings`;
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch (err) {
    console.error("Odds API connection failed:", err);
    return { events: dailyOddsCache?.events ?? [], remaining: dailyOddsCache?.remaining };
  }

  if (!res.ok) {
    const body = await res.text();
    console.error("Odds API error:", res.status, body);
    if (res.status === 429) {
      console.error("[Odds API] Out of credits (429). Use cached odds until next refresh.");
      return { events: dailyOddsCache?.events ?? [], remaining: 0 };
    }
    return { events: dailyOddsCache?.events ?? [], remaining: dailyOddsCache?.remaining };
  }

  const remaining = res.headers.get("x-requests-remaining");
  const data: OddsEvent[] = await res.json();

  dailyOddsCache = {
    events: data,
    remaining: remaining ? parseInt(remaining) : undefined,
    fetchedAt: Date.now(),
  };

  console.log(`[Odds API] Refreshed at ${new Date().toISOString()} — ${remaining} credits remaining`);

  return { events: data, remaining: dailyOddsCache.remaining };
}

// ── Fetch live scores from ESPN ──
// Covers the full tournament window (start through 3 weeks out) so games
// are visible during multi-day breaks between rounds.

function getTournamentDateRange(): string[] {
  const today = new Date();
  const year = today.getFullYear();
  // Tournament typically runs mid-March through early April
  const tourneyStart = new Date(year, 2, 18); // March 18
  const start = tourneyStart < today ? tourneyStart : today;
  // Look up to 3 days ahead for upcoming round scheduling
  const end = new Date(today);
  end.setDate(end.getDate() + 3);

  const dates: string[] = [];
  const d = new Date(start);
  while (d <= end) {
    dates.push(
      `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`
    );
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

async function fetchESPN(): Promise<ESPNEvent[]> {
  const dates = getTournamentDateRange();

  const allEvents: ESPNEvent[] = [];
  for (const date of dates) {
    try {
      const url = `${ESPN_API}?dates=${date}&groups=100&limit=100`;
      const res = await fetch(url, { next: { revalidate: 30 } });
      if (res.ok) {
        const data = await res.json();
        if (data.events) allEvents.push(...data.events);
      }
    } catch {
      // continue
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  return allEvents.filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });
}

// ── Build a game from Odds API event, enriched with ESPN scores ──

function buildGame(
  oddsEvent: OddsEvent,
  espnEvents: ESPNEvent[],
  dbOddsMap?: Map<string, CachedOdds>
): ApiGame {
  const gameKey = makeGameKey(oddsEvent.home_team, oddsEvent.away_team);

  // DraftKings odds only, fall back to FanDuel → BetMGM if DK unavailable
  let bookmaker = oddsEvent.bookmakers.find((b) => b.key === "draftkings");
  if (!bookmaker) bookmaker = oddsEvent.bookmakers.find((b) => b.key === "fanduel");
  if (!bookmaker) bookmaker = oddsEvent.bookmakers.find((b) => b.key === "betmgm");
  if (!bookmaker) bookmaker = oddsEvent.bookmakers[0];
  const oddsSource = bookmaker?.title ?? "";

  const h2h = bookmaker?.markets.find((m) => m.key === "h2h");
  const homeOutcome = h2h?.outcomes.find((o) => o.name === oddsEvent.home_team);
  const awayOutcome = h2h?.outcomes.find((o) => o.name === oddsEvent.away_team);

  const homeOdds = homeOutcome?.price ?? 0;
  const awayOdds = awayOutcome?.price ?? 0;

  // Determine seeds — use static lookup first (always available), ESPN will enrich later
  const homeSeed = lookupSeed(oddsEvent.home_team);
  const awaySeed = lookupSeed(oddsEvent.away_team);

  // Our pick = higher seed number (the bracket underdog). Always.
  // If seeds are equal (First Four), fall back to higher moneyline odds.
  const homeIsOurPick = (homeSeed ?? 0) > (awaySeed ?? 0)
    || ((homeSeed ?? 0) === (awaySeed ?? 0) && homeOdds > awayOdds);

  const opponentName = homeIsOurPick ? oddsEvent.away_team : oddsEvent.home_team;
  const ourPickName = homeIsOurPick ? oddsEvent.home_team : oddsEvent.away_team;
  const opponentOdds = homeIsOurPick ? awayOdds : homeOdds;
  const ourPickOdds = homeIsOurPick ? homeOdds : awayOdds;

  const hasCommenced = new Date(oddsEvent.commence_time).getTime() <= Date.now();
  const cached = getCachedOdds(gameKey);
  const overrideOdds = getPregameOverride(ourPickName);
  const dbOdds = dbOddsMap?.get(gameKey);

  let locked: CachedOdds;

  // Prefer 11am DB snapshot when present (single source of truth for display/calculations)
  if (dbOdds) {
    locked = dbOdds;
  } else if (overrideOdds !== undefined) {
    if (!cached) {
      cacheOdds(gameKey, {
        favoriteOdds: opponentOdds || 0,
        underdogOdds: overrideOdds,
        favoriteName: opponentName,
        underdogName: ourPickName,
        oddsSource: oddsSource || "Pregame",
      });
    }
    locked = getCachedOdds(gameKey) ?? {
      favoriteOdds: opponentOdds || 0,
      underdogOdds: overrideOdds,
      favoriteName: opponentName,
      underdogName: ourPickName,
      oddsSource: oddsSource || "Pregame",
    };
  } else {
    if (!hasCommenced && !cached && ourPickOdds !== 0) {
      cacheOdds(gameKey, {
        favoriteOdds: opponentOdds,
        underdogOdds: ourPickOdds,
        favoriteName: opponentName,
        underdogName: ourPickName,
        oddsSource,
      });
    }
    locked =
      cached ??
      (hasCommenced
        ? { favoriteOdds: 0, underdogOdds: 0, favoriteName: opponentName, underdogName: ourPickName, oddsSource }
        : {
            favoriteOdds: opponentOdds,
            underdogOdds: ourPickOdds,
            favoriteName: opponentName,
            underdogName: ourPickName,
            oddsSource,
          });
  }

  const favorite = { name: locked.favoriteName, odds: locked.favoriteOdds };
  const underdog = { name: locked.underdogName, odds: locked.underdogOdds };

  // Match with ESPN for live scores + seeds
  let status: ApiGame["status"] = "upcoming";
  let result: ApiGame["result"] = "pending";
  let clock: string | undefined;
  let period: number | undefined;
  let favScore: number | undefined;
  let dogScore: number | undefined;
  let favSeed: number | undefined;
  let dogSeed: number | undefined;
  let favLogo: string | undefined;
  let dogLogo: string | undefined;
  let espnId: string | undefined;
  let dogIsHome = false;

  for (const espn of espnEvents) {
    const comp = espn.competitions[0];
    if (!comp) continue;

    const espnTeams = comp.competitors.map((c) => c.team.displayName);
    const matchesFav = espnTeams.some((t) => teamsMatch(t, favorite.name));
    const matchesDog = espnTeams.some((t) => teamsMatch(t, underdog.name));

    if (matchesFav && matchesDog) {
      espnId = espn.id;

      const favComp = comp.competitors.find((c) =>
        teamsMatch(c.team.displayName, favorite.name) ||
        teamsMatch(c.team.shortDisplayName, favorite.name)
      );
      const dogComp = comp.competitors.find((c) =>
        teamsMatch(c.team.displayName, underdog.name) ||
        teamsMatch(c.team.shortDisplayName, underdog.name)
      );

      if (favComp) {
        favScore = parseInt(favComp.score, 10) || undefined;
        if (favComp.curatedRank?.current) favSeed = favComp.curatedRank.current;
        favLogo = favComp.team.logo;
      }
      if (dogComp) {
        dogScore = parseInt(dogComp.score, 10) || undefined;
        if (dogComp.curatedRank?.current) dogSeed = dogComp.curatedRank.current;
        dogIsHome = dogComp.homeAway === "home";
        dogLogo = dogComp.team.logo;
      }

      if (comp.status.type.completed) {
        status = "final";
        if (dogScore !== undefined && favScore !== undefined) {
          result = dogScore > favScore ? "win" : dogScore < favScore ? "loss" : "push";
        }
      } else if (comp.status.type.name !== "STATUS_SCHEDULED") {
        status = "live";
        clock = comp.status.displayClock;
        period = comp.status.period;
      }
      break;
    }
  }

  if (!favSeed) favSeed = lookupSeed(favorite.name);
  if (!dogSeed) dogSeed = lookupSeed(underdog.name);

  return {
    id: oddsEvent.id,
    commence_time: oddsEvent.commence_time,
    home_team: oddsEvent.home_team,
    away_team: oddsEvent.away_team,
    favorite: { ...favorite, score: favScore, seed: favSeed, logo: favLogo },
    underdog: { ...underdog, score: dogScore, seed: dogSeed, logo: dogLogo },
    status,
    result,
    clock,
    period,
    espnId,
    oddsSource: locked.oddsSource,
    _dogIsHome: dogIsHome,
  } as ApiGame & { _dogIsHome?: boolean };
}

// ── Also build games from ESPN that have no odds (already started / finished) ──

function buildGameFromESPN(espn: ESPNEvent): ApiGame | null {
  const comp = espn.competitions[0];
  if (!comp || comp.competitors.length < 2) return null;

  const teams = comp.competitors;
  const home = teams.find((t) => t.homeAway === "home") || teams[0];
  const away = teams.find((t) => t.homeAway === "away") || teams[1];

  // Try to determine favorite/underdog by seed (higher seed = underdog)
  const homeSeed = home.curatedRank?.current ?? lookupSeed(home.team.displayName);
  const awaySeed = away.curatedRank?.current ?? lookupSeed(away.team.displayName);

  // Higher seed number = underdog in the tournament
  const homeIsUnderdog = (homeSeed ?? 99) > (awaySeed ?? 99);
  const fav = homeIsUnderdog ? away : home;
  const dog = homeIsUnderdog ? home : away;
  const favSeed = homeIsUnderdog ? awaySeed : homeSeed;
  const dogSeed = homeIsUnderdog ? homeSeed : awaySeed;

  let status: ApiGame["status"] = "upcoming";
  let result: ApiGame["result"] = "pending";

  const favScore = parseInt(fav.score, 10) || undefined;
  const dogScore = parseInt(dog.score, 10) || undefined;

  if (comp.status.type.completed) {
    status = "final";
    if (dogScore !== undefined && favScore !== undefined) {
      result = dogScore > favScore ? "win" : dogScore < favScore ? "loss" : "push";
    }
  } else if (comp.status.type.name !== "STATUS_SCHEDULED") {
    status = "live";
  }

  return {
    id: espn.id,
    commence_time: espn.date ?? "",
    home_team: home.team.displayName,
    away_team: away.team.displayName,
    favorite: { name: fav.team.displayName, odds: 0, score: favScore, seed: favSeed, logo: fav.team.logo },
    underdog: { name: dog.team.displayName, odds: 0, score: dogScore, seed: dogSeed, logo: dog.team.logo },
    status,
    result,
    clock: comp.status.displayClock,
    period: comp.status.period,
    espnId: espn.id,
    _dogIsHome: dog === home,
  } as ApiGame & { _dogIsHome?: boolean };
}

// ── Fetch win probability from ESPN summary endpoint ──

interface WinProbEntry {
  homeWinPercentage: number;
  // playId, secondsLeft, etc. also exist but we only need the latest
}

async function fetchWinProbability(espnId: string): Promise<{ homeWinPct: number; awayWinPct: number } | null> {
  try {
    const url = `${ESPN_SUMMARY}?event=${espnId}`;
    const res = await fetch(url, { next: { revalidate: 30 } });
    if (!res.ok) return null;
    const data = await res.json();

    const wp: WinProbEntry[] = data.winprobability;
    if (!wp || wp.length === 0) return null;

    // Last entry is the most current
    const latest = wp[wp.length - 1];
    return {
      homeWinPct: latest.homeWinPercentage * 100,
      awayWinPct: (1 - latest.homeWinPercentage) * 100,
    };
  } catch {
    return null;
  }
}

// ── Main handler ──

type GameWithMeta = ApiGame & { _dogIsHome?: boolean };

export async function GET() {
  try {
    // Database-only for odds: no Odds API call here (saves credits). Cron at 11am ET fills pregame_odds.
    const [espnEvents, dbOddsMap, completedMap] = await Promise.all([
      fetchESPN(),
      getPregameOddsFromDB(),
      getCompletedGamesFromDB(),
    ]);

    // Build a logo lookup from all ESPN competitors so every team gets a logo
    const logoLookup = new Map<string, string>();
    for (const espn of espnEvents) {
      const comp = espn.competitions[0];
      if (!comp) continue;
      for (const c of comp.competitors) {
        const logo = c.team.logo;
        if (!logo) continue;
        logoLookup.set(normalize(c.team.displayName), logo);
        logoLookup.set(normalize(c.team.shortDisplayName), logo);
      }
    }

    // Build all games from ESPN only; overlay odds from DB (pregame_odds snapshot from 11am cron)
    const allGamesUnfiltered: GameWithMeta[] = [];
    for (const espn of espnEvents) {
      const comp = espn.competitions?.[0];
      if (!comp || comp.competitors.length < 2) continue;
      const espnTeams = comp.competitors.map((c) => c.team.displayName);
      if (!espnTeams.every((t) => isTournamentTeam(t))) continue;

      const game = buildGameFromESPN(espn);
      if (!game) continue;

      const gameKey = makeGameKey(game.home_team, game.away_team);
      const dbOdds = dbOddsMap.get(gameKey);
      const overrideOdds = getPregameOverride(game.underdog.name);
      if (dbOdds) {
        game.underdog.odds = overrideOdds ?? dbOdds.underdogOdds;
        game.favorite.odds = dbOdds.favoriteOdds;
        game.oddsSource = dbOdds.oddsSource;
      } else if (overrideOdds !== undefined) {
        game.underdog.odds = overrideOdds;
        game.oddsSource = "Pregame";
      }

      allGamesUnfiltered.push(game as GameWithMeta);
    }

    // Filter out: 1 vs 16 matchups and First Four (same-seed play-in) games
    const allGamesRaw = allGamesUnfiltered.filter((g) => {
      const favSeed = g.favorite.seed;
      const dogSeed = g.underdog.seed;
      if (isOneVsSixteen(favSeed, dogSeed)) return false;
      if (isFirstFour(favSeed, dogSeed)) return false;
      return true;
    });

    // Merge completed games from DB (single source of truth) and persist new finals from ESPN
    const mergedKeys = new Set(allGamesRaw.map((g) => makeGameKey(g.home_team, g.away_team)));
    for (const g of allGamesRaw) {
      const gameKey = makeGameKey(g.home_team, g.away_team);
      const doc = completedMap.get(gameKey);
      if (doc) {
        g.status = "final";
        g.result = doc.result;
        g.commence_time = doc.commence_time;
        if (g.favorite) g.favorite.score = doc.favorite_score;
        if (g.underdog) g.underdog.score = doc.underdog_score;
        if (doc.underdog_odds && g.underdog) g.underdog.odds = doc.underdog_odds;
      } else if (g.status === "final") {
        await saveCompletedGame({
          game_key: gameKey,
          underdog_name: g.underdog.name,
          favorite_name: g.favorite.name,
          underdog_odds: g.underdog.odds ?? 0,
          result: g.result as "win" | "loss" | "push",
          underdog_score: g.underdog.score,
          favorite_score: g.favorite.score,
          commence_time: g.commence_time ?? "",
          espn_id: g.espnId,
          source: "espn",
        });
      }
    }
    const backfillOnly = [...completedMap.values()].filter((doc) => !mergedKeys.has(doc.game_key));
    const allGamesMerged = [...allGamesRaw, ...backfillOnly.map(completedDocToApiGame)];

    // Fetch win probability for live games (parallel, up to 8 at once)
    const liveGames = allGamesMerged.filter((g) => g.status === "live" && g.espnId);
    const wpResults = await Promise.all(
      liveGames.map(async (g) => {
        const wp = await fetchWinProbability(g.espnId!);
        return { id: g.id, wp, dogIsHome: g._dogIsHome };
      })
    );

    const wpMap = new Map(wpResults.map((r) => [r.id, r]));

    // Merge win probability, fill missing logos, clean up internal fields
    const allGames: ApiGame[] = allGamesMerged.map((g) => {
      const wpEntry = wpMap.get(g.id);
      let underdogWinPct: number | undefined;

      if (wpEntry?.wp) {
        underdogWinPct = wpEntry.dogIsHome
          ? wpEntry.wp.homeWinPct
          : wpEntry.wp.awayWinPct;
      }

      const { _dogIsHome, ...game } = g;

      // Resolve logos: ESPN scoreboard first, then static ID map
      const favLogo = game.favorite.logo
        || logoLookup.get(normalize(game.favorite.name))
        || getStaticLogo(game.favorite.name);
      const dogLogo = game.underdog.logo
        || logoLookup.get(normalize(game.underdog.name))
        || getStaticLogo(game.underdog.name);

      const gameKey = makeGameKey(game.home_team, game.away_team);
      const underdogOdds =
        getPregameOverride(game.underdog.name)
        ?? dbOddsMap.get(gameKey)?.underdogOdds
        ?? game.underdog.odds;

      return {
        ...game,
        favorite: { ...game.favorite, logo: favLogo },
        underdog: { ...game.underdog, logo: dogLogo, odds: underdogOdds },
        underdogWinPct,
      };
    });

    // Deduplicate by canonical game key (guards against backfill + ESPN producing the same game)
    const seenKeys = new Set<string>();
    const dedupedGames = allGames.filter((g) => {
      const key = makeGameKey(g.home_team, g.away_team);
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    });

    // Sort: live first, then upcoming by time, then final
    dedupedGames.sort((a, b) => {
      const order = { live: 0, upcoming: 1, final: 2 };
      if (order[a.status] !== order[b.status])
        return order[a.status] - order[b.status];
      return (
        new Date(a.commence_time || 0).getTime() -
        new Date(b.commence_time || 0).getTime()
      );
    });

    const response: GamesResponse = {
      games: dedupedGames,
      fetchedAt: new Date().toISOString(),
      // Odds come from DB only (no Odds API call = no credits used)
    };

    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    });
  } catch (error) {
    console.error("Games API error:", error);
    return NextResponse.json(
      { games: [], fetchedAt: new Date().toISOString() },
      { status: 502 }
    );
  }
}
