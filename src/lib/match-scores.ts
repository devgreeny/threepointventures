import type { Game, GameStatus, BetResult } from "@/data/bets";
import type { ESPNEvent, ESPNCompetitor } from "@/app/api/scores/route";

// Normalize a team name for fuzzy matching
function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Known aliases where ESPN names differ from our data
const ALIASES: Record<string, string[]> = {
  "san diego state": ["san diego st", "sdsu"],
  "north carolina": ["unc", "tar heels"],
  "mount st marys": ["mount st marys", "mt st marys"],
  "saint francis": ["st francis", "saint francis"],
  "alabama state": ["alabama st"],
  "uc san diego": ["ucsd"],
  "uc irvine": ["uci"],
  "siu edwardsville": ["siue", "siu edwardsville"],
  "st johns": ["st johns", "saint johns"],
  "unc wilmington": ["uncw"],
  "colorado state": ["colorado st"],
  "mississippi state": ["miss state", "mississippi st"],
  "boise state": ["boise st"],
  "ole miss": ["mississippi"],
  "texas am": ["texas a&m", "texas am"],
  "iowa state": ["iowa st"],
  "michigan state": ["michigan st", "mich state"],
  "high point": ["high point"],
  "mcneese": ["mcneese state", "mcneese st"],
  "grand canyon": ["gcu"],
  "robert morris": ["robert morris"],
  "norfolk state": ["norfolk st"],
};

function teamMatches(espnName: string, ourName: string): boolean {
  const a = normalize(espnName);
  const b = normalize(ourName);

  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;

  // Check aliases
  for (const [canonical, aliases] of Object.entries(ALIASES)) {
    const allNames = [canonical, ...aliases];
    const aMatch = allNames.some((n) => a.includes(n) || n.includes(a));
    const bMatch = allNames.some((n) => b.includes(n) || n.includes(b));
    if (aMatch && bMatch) return true;
  }

  return false;
}

function findCompetitor(
  competitors: ESPNCompetitor[],
  teamName: string
): ESPNCompetitor | undefined {
  return competitors.find(
    (c) =>
      teamMatches(c.team.displayName, teamName) ||
      teamMatches(c.team.shortDisplayName, teamName) ||
      teamMatches(c.team.abbreviation, teamName)
  );
}

function mapStatus(espnStatus: string, completed: boolean): GameStatus {
  if (completed) return "final";
  if (espnStatus === "STATUS_IN_PROGRESS" || espnStatus === "STATUS_HALFTIME")
    return "live";
  return "upcoming";
}

function determineResult(
  underdogScore: number,
  favoriteScore: number,
  completed: boolean
): BetResult {
  if (!completed) return "pending";
  if (underdogScore > favoriteScore) return "win";
  if (underdogScore < favoriteScore) return "loss";
  return "push";
}

export interface LiveGame extends Game {
  clock?: string;
  period?: number;
  espnMatched: boolean;
}

export function mergeWithLiveScores(
  bets: Game[],
  events: ESPNEvent[]
): LiveGame[] {
  return bets.map((bet) => {
    // For play-in TBD matchups (contain "/"), try matching either team
    const favoriteNames = bet.favorite.name.split(" / ");
    const underdogNames = bet.underdog.name.split(" / ");

    for (const event of events) {
      const comp = event.competitions[0];
      if (!comp) continue;

      // Try to match both teams from the bet to ESPN competitors
      let favComp: ESPNCompetitor | undefined;
      let dogComp: ESPNCompetitor | undefined;

      for (const favName of favoriteNames) {
        favComp = findCompetitor(comp.competitors, favName);
        if (favComp) break;
      }
      for (const dogName of underdogNames) {
        dogComp = findCompetitor(comp.competitors, dogName);
        if (dogComp) break;
      }

      // Need at least one team to match (both preferred)
      if (!favComp && !dogComp) continue;

      // If we only matched one side, find the other by elimination
      if (favComp && !dogComp) {
        dogComp = comp.competitors.find((c) => c !== favComp);
      } else if (dogComp && !favComp) {
        favComp = comp.competitors.find((c) => c !== dogComp);
      }

      if (!favComp || !dogComp) continue;

      const status = mapStatus(
        comp.status.type.name,
        comp.status.type.completed
      );
      const favScore = parseInt(favComp.score, 10) || 0;
      const dogScore = parseInt(dogComp.score, 10) || 0;
      const hasScores = favComp.score !== undefined && favComp.score !== "";

      const result = determineResult(
        dogScore,
        favScore,
        comp.status.type.completed
      );

      return {
        ...bet,
        status,
        result: status === "final" ? result : bet.result === "pending" ? "pending" : bet.result,
        favorite: {
          ...bet.favorite,
          score: hasScores ? favScore : bet.favorite.score,
        },
        underdog: {
          ...bet.underdog,
          score: hasScores ? dogScore : bet.underdog.score,
        },
        clock: comp.status.displayClock,
        period: comp.status.period,
        espnMatched: true,
      };
    }

    // No ESPN match found — return original data
    return { ...bet, espnMatched: false };
  });
}
