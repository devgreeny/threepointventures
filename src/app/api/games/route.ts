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
  };
  underdog: {
    name: string;
    odds: number;
    score?: number;
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

  // Try to match with ESPN for live scores
  let status: ApiGame["status"] = "upcoming";
  let result: ApiGame["result"] = "pending";
  let clock: string | undefined;
  let period: number | undefined;
  let favScore: number | undefined;
  let dogScore: number | undefined;

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

      if (favComp) favScore = parseInt(favComp.score, 10) || undefined;
      if (dogComp) dogScore = parseInt(dogComp.score, 10) || undefined;

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

  return {
    id: oddsEvent.id,
    commence_time: oddsEvent.commence_time,
    home_team: oddsEvent.home_team,
    away_team: oddsEvent.away_team,
    favorite: { ...favorite, score: favScore },
    underdog: { ...underdog, score: dogScore },
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
  // Without odds data, we can't reliably identify the underdog
  // Use home/away as a rough proxy — away team is often the lower seed in tournament
  const home = teams.find((t) => t.homeAway === "home") || teams[0];
  const away = teams.find((t) => t.homeAway === "away") || teams[1];

  let status: ApiGame["status"] = "upcoming";
  let result: ApiGame["result"] = "pending";

  const homeScore = parseInt(home.score, 10) || undefined;
  const awayScore = parseInt(away.score, 10) || undefined;

  if (comp.status.type.completed) {
    status = "final";
    // Without odds we don't know who the underdog is, so no result
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
    favorite: { name: home.team.displayName, odds: 0, score: homeScore },
    underdog: { name: away.team.displayName, odds: 0, score: awayScore },
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
