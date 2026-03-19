import { NextResponse } from "next/server";

const ODDS_API = "https://api.the-odds-api.com/v4/sports/basketball_ncaab";
const ESPN_API =
  "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard";

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

// 2025 NCAA Tournament seeds — static fallback when ESPN data is unavailable
const SEEDS: Record<string, number> = {
  // East
  "Duke": 1, "Alabama": 2, "Wisconsin": 3, "Arizona": 4,
  "Oregon": 5, "BYU": 6, "Saint Mary's": 7, "UConn": 8,
  "Oklahoma": 9, "Vanderbilt": 10, "VCU": 11, "Liberty": 12,
  "Akron": 13, "Montana": 14, "Robert Morris": 15,
  // West
  "Florida": 1, "St. John's": 2, "Texas Tech": 3, "Maryland": 4,
  "Memphis": 5, "Missouri": 6, "Kansas": 7, "UCLA": 8,
  "UC San Diego": 9, "Arkansas": 10, "Drake": 11, "Colorado State": 12,
  "Grand Canyon": 13, "UNC Wilmington": 14, "Omaha": 15, "Norfolk State": 16,
  // South
  "Auburn": 1, "Michigan State": 2, "Iowa State": 3, "Texas A&M": 4,
  "Michigan": 5, "Ole Miss": 6, "Marquette": 7, "Louisville": 8,
  "Creighton": 9, "New Mexico": 10, "San Diego State": 11, "UC Irvine": 12,
  "Yale": 13, "Lipscomb": 14, "Bryant": 15,
  // Midwest
  "Houston": 1, "Tennessee": 2, "Kentucky": 3, "Purdue": 4,
  "Clemson": 5, "Illinois": 6, "Gonzaga": 7, "Mississippi State": 8,
  "Boise State": 9, "Georgia": 10, "McNeese": 11, "High Point": 13,
  "Troy": 14, "Winthrop": 15, "SIU Edwardsville": 16,
  // First Four / Play-in
  "North Carolina": 11, "Xavier": 11, "Texas": 11,
  "Alabama State": 16, "Saint Francis": 16,
  "American": 16, "Mount St. Mary's": 16,
  // Common alternate names
  "San Diego St": 11, "McNeese State": 11,
  "St. John's (NY)": 2, "UNC-Wilmington": 14,
  "Colorado St": 12, "Mississippi St": 8,
  "Boise St": 9, "Norfolk St": 16,
  "Iowa St": 3, "Michigan St": 2,
  "Alabama St": 16, "Mt St Mary's": 16,
  "UCSD": 9, "GCU": 13, "SIUE": 16,
};

function lookupSeed(teamName: string): number | undefined {
  // Direct match
  if (SEEDS[teamName] !== undefined) return SEEDS[teamName];

  // Normalized match
  const norm = normalize(teamName);
  for (const [key, seed] of Object.entries(SEEDS)) {
    if (normalize(key) === norm) return seed;
    if (norm.includes(normalize(key)) || normalize(key).includes(norm)) return seed;
  }

  return undefined;
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

// ── Fetch odds from The Odds API ──

async function fetchOdds(): Promise<{ events: OddsEvent[]; remaining?: number }> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey || apiKey === "YOUR_KEY_HERE") {
    return { events: [] };
  }

  const url = `${ODDS_API}/odds?apiKey=${apiKey}&regions=us&markets=h2h&oddsFormat=american`;
  const res = await fetch(url, { next: { revalidate: 300 } }); // cache 5 min to save quota

  if (!res.ok) {
    console.error("Odds API error:", res.status, await res.text());
    return { events: [] };
  }

  const remaining = res.headers.get("x-requests-remaining");
  const data: OddsEvent[] = await res.json();
  return { events: data, remaining: remaining ? parseInt(remaining) : undefined };
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
  // Get consensus odds — prefer DraftKings, FanDuel, then first available
  const preferredBooks = ["draftkings", "fanduel", "betmgm", "pointsbetus"];
  let bookmaker = oddsEvent.bookmakers.find((b) =>
    preferredBooks.includes(b.key)
  );
  if (!bookmaker) bookmaker = oddsEvent.bookmakers[0];

  const h2h = bookmaker?.markets.find((m) => m.key === "h2h");
  const homeOutcome = h2h?.outcomes.find((o) => o.name === oddsEvent.home_team);
  const awayOutcome = h2h?.outcomes.find((o) => o.name === oddsEvent.away_team);

  const homeOdds = homeOutcome?.price ?? 0;
  const awayOdds = awayOutcome?.price ?? 0;

  // The underdog has the higher (more positive) American odds
  const homeIsUnderdog = homeOdds > awayOdds;

  const favorite = {
    name: homeIsUnderdog ? oddsEvent.away_team : oddsEvent.home_team,
    odds: homeIsUnderdog ? awayOdds : homeOdds,
  };
  const underdog = {
    name: homeIsUnderdog ? oddsEvent.home_team : oddsEvent.away_team,
    odds: homeIsUnderdog ? homeOdds : awayOdds,
  };

  // Try to match with ESPN for live scores + seeds
  let status: ApiGame["status"] = "upcoming";
  let result: ApiGame["result"] = "pending";
  let clock: string | undefined;
  let period: number | undefined;
  let favScore: number | undefined;
  let dogScore: number | undefined;
  let favSeed: number | undefined;
  let dogSeed: number | undefined;

  for (const espn of espnEvents) {
    const comp = espn.competitions[0];
    if (!comp) continue;

    const espnTeams = comp.competitors.map((c) => c.team.displayName);
    const matchesFav = espnTeams.some((t) => teamsMatch(t, favorite.name));
    const matchesDog = espnTeams.some((t) => teamsMatch(t, underdog.name));

    if (matchesFav || matchesDog) {
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

  // Fall back to static seed map if ESPN didn't provide seeds
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
  };
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
  };
}

// ── Main handler ──

export async function GET() {
  try {
    const [oddsResult, espnEvents] = await Promise.all([
      fetchOdds(),
      fetchESPN(),
    ]);

    const oddsGames = oddsResult.events.map((e) => buildGame(e, espnEvents));

    // Find ESPN games not covered by odds (already tipped off or finished)
    const coveredTeams = new Set(
      oddsGames.flatMap((g) => [normalize(g.home_team), normalize(g.away_team)])
    );

    const extraGames: ApiGame[] = [];
    for (const espn of espnEvents) {
      const comp = espn.competitions[0];
      if (!comp) continue;
      const espnTeams = comp.competitors.map((c) =>
        normalize(c.team.displayName)
      );
      const alreadyCovered = espnTeams.some((t) =>
        [...coveredTeams].some((ct) => teamsMatch(t, ct))
      );
      if (!alreadyCovered) {
        const game = buildGameFromESPN(espn);
        if (game) extraGames.push(game);
      }
    }

    // Sort: live first, then upcoming by time, then final
    const allGames = [...oddsGames, ...extraGames].sort((a, b) => {
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
