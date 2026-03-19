import { NextResponse } from "next/server";

const ODDS_API = "https://api.the-odds-api.com/v4/sports/basketball_ncaab";
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
  team: { displayName: string; shortDisplayName: string; abbreviation: string };
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
  { name: "Iowa State", seed: 2, rank: 7, aliases: ["Iowa State Cyclones", "Iowa St"] },
  { name: "Purdue", seed: 2, rank: 8, aliases: ["Purdue Boilermakers"] },
  // 3-seeds
  { name: "Michigan State", seed: 3, rank: 9, aliases: ["Michigan St Spartans", "Michigan St", "Michigan State Spartans"] },
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
  { name: "St. John's", seed: 5, rank: 18, aliases: ["St. John's Red Storm", "St. John's (NY)", "Saint Johns", "St Johns"] },
  { name: "Texas Tech", seed: 5, rank: 19, aliases: ["Texas Tech Red Raiders"] },
  { name: "Wisconsin", seed: 5, rank: 20, aliases: ["Wisconsin Badgers"] },
  // 6-seeds
  { name: "Tennessee", seed: 6, rank: 21, aliases: ["Tennessee Volunteers"] },
  { name: "North Carolina", seed: 6, rank: 22, aliases: ["North Carolina Tar Heels", "UNC"] },
  { name: "Louisville", seed: 6, rank: 23, aliases: ["Louisville Cardinals"] },
  { name: "BYU", seed: 6, rank: 24, aliases: ["BYU Cougars", "Brigham Young"] },
  // 7-seeds
  { name: "Kentucky", seed: 7, rank: 25, aliases: ["Kentucky Wildcats"] },
  { name: "Saint Mary's", seed: 7, rank: 26, aliases: ["Saint Mary's Gaels", "Saint Mary's (CA)", "St. Mary's"] },
  { name: "Miami", seed: 7, rank: 27, aliases: ["Miami Hurricanes", "Miami (FL)"] },
  { name: "UCLA", seed: 7, rank: 28, aliases: ["UCLA Bruins"] },
  // 8-seeds
  { name: "Clemson", seed: 8, rank: 29, aliases: ["Clemson Tigers"] },
  { name: "Villanova", seed: 8, rank: 30, aliases: ["Villanova Wildcats"] },
  { name: "Ohio State", seed: 8, rank: 31, aliases: ["Ohio State Buckeyes", "Ohio St"] },
  { name: "Georgia", seed: 8, rank: 32, aliases: ["Georgia Bulldogs"] },
  // 9-seeds
  { name: "Utah State", seed: 9, rank: 33, aliases: ["Utah State Aggies", "Utah St"] },
  { name: "TCU", seed: 9, rank: 34, aliases: ["TCU Horned Frogs"] },
  { name: "Saint Louis", seed: 9, rank: 35, aliases: ["Saint Louis Billikens", "St. Louis"] },
  { name: "Iowa", seed: 9, rank: 36, aliases: ["Iowa Hawkeyes"] },
  // 10-seeds
  { name: "Santa Clara", seed: 10, rank: 37, aliases: ["Santa Clara Broncos"] },
  { name: "UCF", seed: 10, rank: 38, aliases: ["UCF Knights"] },
  { name: "Missouri", seed: 10, rank: 39, aliases: ["Missouri Tigers"] },
  { name: "Texas A&M", seed: 10, rank: 40, aliases: ["Texas A&M Aggies", "Texas AM"] },
  // 11-seeds (includes First Four play-in teams)
  { name: "NC State", seed: 11, rank: 41, aliases: ["NC State Wolfpack", "North Carolina State"] },
  { name: "Texas", seed: 11, rank: 42, aliases: ["Texas Longhorns"] },
  { name: "SMU", seed: 11, rank: 43, aliases: ["SMU Mustangs"] },
  { name: "Miami (OH)", seed: 11, rank: 44, aliases: ["Miami (OH) RedHawks", "Miami Ohio", "Miami RedHawks"] },
  { name: "VCU", seed: 11, rank: 45, aliases: ["VCU Rams"] },
  { name: "South Florida", seed: 11, rank: 46, aliases: ["South Florida Bulls", "USF", "USF Bulls"] },
  // 12-seeds
  { name: "McNeese", seed: 12, rank: 47, aliases: ["McNeese Cowboys", "McNeese State", "McNeese St"] },
  { name: "Akron", seed: 12, rank: 48, aliases: ["Akron Zips"] },
  { name: "Northern Iowa", seed: 12, rank: 49, aliases: ["Northern Iowa Panthers", "UNI"] },
  { name: "High Point", seed: 12, rank: 50, aliases: ["High Point Panthers"] },
  // 13-seeds
  { name: "California Baptist", seed: 13, rank: 51, aliases: ["Cal Baptist Lancers", "Cal Baptist", "CBU"] },
  { name: "Hofstra", seed: 13, rank: 52, aliases: ["Hofstra Pride"] },
  { name: "Troy", seed: 13, rank: 53, aliases: ["Troy Trojans"] },
  { name: "Hawai'i", seed: 13, rank: 54, aliases: ["Hawai'i Rainbow Warriors", "Hawaii Rainbow Warriors", "Hawaii"] },
  // 14-seeds
  { name: "North Dakota State", seed: 14, rank: 55, aliases: ["North Dakota St Bison", "North Dakota St", "NDSU"] },
  { name: "Penn", seed: 14, rank: 56, aliases: ["Pennsylvania Quakers", "Pennsylvania"] },
  { name: "Wright State", seed: 14, rank: 57, aliases: ["Wright St Raiders", "Wright St"] },
  { name: "Kennesaw State", seed: 14, rank: 58, aliases: ["Kennesaw St Owls", "Kennesaw St"] },
  // 15-seeds
  { name: "Tennessee State", seed: 15, rank: 59, aliases: ["Tennessee St Tigers", "Tennessee St"] },
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
  };
  underdog: {
    name: string;
    odds: number;
    score?: number;
    seed?: number;
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

function makeGameKey(team1: string, team2: string): string {
  return [normalize(team1), normalize(team2)].sort().join("||");
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
  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    console.error("Odds API error:", res.status, await res.text());
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

async function fetchESPN(): Promise<ESPNEvent[]> {
  const today = new Date();
  const dates: string[] = [];
  for (let i = -1; i <= 1; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    dates.push(
      `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`
    );
  }

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

function buildGame(oddsEvent: OddsEvent, espnEvents: ESPNEvent[]): ApiGame {
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

  // Cache pregame odds — lock in on first sight, never overwrite
  const cached = getCachedOdds(gameKey);
  if (!cached && ourPickOdds !== 0) {
    cacheOdds(gameKey, {
      favoriteOdds: opponentOdds,
      underdogOdds: ourPickOdds,
      favoriteName: opponentName,
      underdogName: ourPickName,
      oddsSource,
    });
  }

  const locked = cached ?? {
    favoriteOdds: opponentOdds,
    underdogOdds: ourPickOdds,
    favoriteName: opponentName,
    underdogName: ourPickName,
    oddsSource,
  };

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
      }
      if (dogComp) {
        dogScore = parseInt(dogComp.score, 10) || undefined;
        if (dogComp.curatedRank?.current) dogSeed = dogComp.curatedRank.current;
        dogIsHome = dogComp.homeAway === "home";
      }

      if (comp.status.type.completed) {
        status = "final";
        if (dogScore !== undefined && favScore !== undefined) {
          result = dogScore > favScore ? "win" : dogScore < favScore ? "loss" : "push";
        }
      } else if (
        comp.status.type.name === "STATUS_IN_PROGRESS" ||
        comp.status.type.name === "STATUS_HALFTIME"
      ) {
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
    favorite: { ...favorite, score: favScore, seed: favSeed },
    underdog: { ...underdog, score: dogScore, seed: dogSeed },
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
  } else if (
    comp.status.type.name === "STATUS_IN_PROGRESS" ||
    comp.status.type.name === "STATUS_HALFTIME"
  ) {
    status = "live";
  }

  return {
    id: espn.id,
    commence_time: "",
    home_team: home.team.displayName,
    away_team: away.team.displayName,
    favorite: { name: fav.team.displayName, odds: 0, score: favScore, seed: favSeed },
    underdog: { name: dog.team.displayName, odds: 0, score: dogScore, seed: dogSeed },
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
    const [oddsResult, espnEvents] = await Promise.all([
      fetchOdds(),
      fetchESPN(),
    ]);

    // Only keep Odds API events where BOTH teams are in the tournament field
    const tournamentOddsEvents = oddsResult.events.filter((e) =>
      isTournamentTeam(e.home_team) && isTournamentTeam(e.away_team)
    );

    const oddsGames = tournamentOddsEvents.map((e) => buildGame(e, espnEvents)) as GameWithMeta[];

    // Find ESPN tournament games not covered by odds (already tipped off or finished)
    const coveredTeams = new Set(
      oddsGames.flatMap((g) => [normalize(g.home_team), normalize(g.away_team)])
    );

    const extraGames: GameWithMeta[] = [];
    for (const espn of espnEvents) {
      const comp = espn.competitions[0];
      if (!comp) continue;
      const espnTeams = comp.competitors.map((c) => c.team.displayName);

      // Both teams must be in the tournament field
      if (!espnTeams.every((t) => isTournamentTeam(t))) continue;

      const alreadyCovered = espnTeams.some((t) =>
        [...coveredTeams].some((ct) => teamsMatch(normalize(t), ct))
      );
      if (!alreadyCovered) {
        const game = buildGameFromESPN(espn);
        if (game) extraGames.push(game as GameWithMeta);
      }
    }

    const allGamesUnfiltered = [...oddsGames, ...extraGames];

    // Filter out: 1 vs 16 matchups and First Four (same-seed play-in) games
    const allGamesRaw = allGamesUnfiltered.filter((g) => {
      const favSeed = g.favorite.seed;
      const dogSeed = g.underdog.seed;
      if (isOneVsSixteen(favSeed, dogSeed)) return false;
      if (isFirstFour(favSeed, dogSeed)) return false;
      return true;
    });

    // Fetch win probability for live games (parallel, up to 8 at once)
    const liveGames = allGamesRaw.filter((g) => g.status === "live" && g.espnId);
    const wpResults = await Promise.all(
      liveGames.map(async (g) => {
        const wp = await fetchWinProbability(g.espnId!);
        return { id: g.id, wp, dogIsHome: g._dogIsHome };
      })
    );

    const wpMap = new Map(wpResults.map((r) => [r.id, r]));

    // Merge win probability and clean up internal fields
    const allGames: ApiGame[] = allGamesRaw.map((g) => {
      const wpEntry = wpMap.get(g.id);
      let underdogWinPct: number | undefined;

      if (wpEntry?.wp) {
        underdogWinPct = wpEntry.dogIsHome
          ? wpEntry.wp.homeWinPct
          : wpEntry.wp.awayWinPct;
      }

      const { _dogIsHome, ...game } = g;
      return { ...game, underdogWinPct };
    });

    // Sort: live first, then upcoming by time, then final
    allGames.sort((a, b) => {
      const order = { live: 0, upcoming: 1, final: 2 };
      if (order[a.status] !== order[b.status])
        return order[a.status] - order[b.status];
      return (
        new Date(a.commence_time || 0).getTime() -
        new Date(b.commence_time || 0).getTime()
      );
    });

    const response: GamesResponse = {
      games: allGames,
      fetchedAt: new Date().toISOString(),
      oddsRemaining: oddsResult.remaining,
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
