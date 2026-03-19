import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import {
  getCompletedGamesFromDB,
  saveCompletedGame,
  makeGameKey,
  type CompletedGameDoc,
} from "@/app/api/games/route";

const ESPN_API =
  "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard";
const MINUTE_MS = 60_000;
const EV_COLLECTION = "ev_snapshots";
const UNIT_SIZE = 10;

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
  // Common shorthand
  const aliases: Record<string, string[]> = {
    vandy: ["vanderbilt", "vanderbilt commodores"],
    wisco: ["wisconsin", "wisconsin badgers"],
    "north dakota state": ["north dakota st", "ndsu", "north dakota st bison"],
    "south florida": ["usf", "south florida bulls"],
    louisville: ["louisville cardinals"],
    hawaii: ["hawaii", "hawaii rainbow warriors", "hawaii"],
  };
  for (const [, names] of Object.entries(aliases)) {
    const aMatch = names.some((n) => na.includes(n) || n.includes(na));
    const bMatch = names.some((n) => nb.includes(n) || n.includes(nb));
    if (aMatch && bMatch) return true;
  }
  return false;
}

interface ESPNCompetitor {
  team: { displayName: string };
  score: string;
  homeAway: string;
}

interface ESPNEvent {
  id: string;
  name: string;
  date?: string;
  competitions: Array<{
    competitors: ESPNCompetitor[];
    status: { type: { name: string; completed: boolean } };
  }>;
}

/** Backfill input: underdog (first team), favorite (second), odds (American), result */
const BACKFILL_GAMES: Array<{
  underdog: string;
  favorite: string;
  underdogOdds: number;
  result: "win" | "loss";
}> = [
  { underdog: "McNeese", favorite: "Vanderbilt", underdogOdds: 540, result: "loss" },
  { underdog: "TCU", favorite: "Ohio State", underdogOdds: 130, result: "win" },
  { underdog: "Troy", favorite: "Nebraska", underdogOdds: 650, result: "loss" },
  { underdog: "High Point", favorite: "Wisconsin", underdogOdds: 370, result: "win" },
  { underdog: "Hawaii", favorite: "Arkansas", underdogOdds: 850, result: "loss" },
  { underdog: "North Dakota State", favorite: "Michigan State", underdogOdds: 0, result: "loss" },
  { underdog: "South Florida", favorite: "Louisville", underdogOdds: 0, result: "loss" },
];

async function fetchESPNForDates(dates: string[]): Promise<ESPNEvent[]> {
  const all: ESPNEvent[] = [];
  for (const date of dates) {
    try {
      const res = await fetch(`${ESPN_API}?dates=${date}&groups=100&limit=100`, {
        cache: "no-store",
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data.events)) all.push(...data.events);
    } catch {
      // continue
    }
  }
  const seen = new Set<string>();
  return all.filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });
}

function findESPNEvent(
  espnEvents: ESPNEvent[],
  underdog: string,
  favorite: string
): ESPNEvent | null {
  for (const ev of espnEvents) {
    const comp = ev.competitions?.[0];
    if (!comp || comp.competitors.length < 2) continue;
    const names = comp.competitors.map((c) => c.team.displayName);
    const matchUnderdog = names.some((n) => teamsMatch(n, underdog));
    const matchFavorite = names.some((n) => teamsMatch(n, favorite));
    if (matchUnderdog && matchFavorite) return ev;
  }
  return null;
}

function calcPayout(americanOdds: number): number {
  if (americanOdds === 0) return 0;
  if (americanOdds > 0) return UNIT_SIZE * (americanOdds / 100);
  return UNIT_SIZE * (100 / Math.abs(americanOdds));
}

/**
 * POST /api/backfill-completed
 * 1) Backfill the 7 completed games with ESPN scores/times into completed_games.
 * 2) Backfill ev_snapshots with cumulative P/L at each game's end time.
 * Optional: ?secret=CRON_SECRET for auth.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  const token = auth?.replace(/^Bearer\s+/i, "") ?? request.nextUrl.searchParams.get("secret");
  if (secret && token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "MongoDB not configured" }, { status: 503 });
  }

  // Remove old backfill entries (may have stale keys from previous runs)
  await db.collection("completed_games").deleteMany({ source: "backfill" });

  // Dates to search for NCAA tournament (March 18–20)
  const year = new Date().getFullYear();
  const dates = [
    `${year}0318`,
    `${year}0319`,
    `${year}0320`,
  ];

  const espnEvents = await fetchESPNForDates(dates);
  const saved: CompletedGameDoc[] = [];
  const notFound: string[] = [];

  for (const g of BACKFILL_GAMES) {
    const gameKey = makeGameKey(g.underdog, g.favorite);
    const ev = findESPNEvent(espnEvents, g.underdog, g.favorite);

    let doc: CompletedGameDoc;
    if (ev) {
      const comp = ev.competitions[0];
      const home = comp.competitors.find((c) => c.homeAway === "home");
      const away = comp.competitors.find((c) => c.homeAway === "away");
      const homeName = home?.team.displayName ?? "";
      const awayName = away?.team.displayName ?? "";
      const underdogScore = teamsMatch(homeName, g.underdog)
        ? parseInt(home?.score ?? "0", 10)
        : parseInt(away?.score ?? "0", 10);
      const favoriteScore = teamsMatch(homeName, g.favorite)
        ? parseInt(home?.score ?? "0", 10)
        : parseInt(away?.score ?? "0", 10);
      const commenceTime = ev.date
        ? new Date(ev.date).toISOString()
        : new Date().toISOString();
      doc = {
        game_key: gameKey,
        underdog_name: g.underdog,
        favorite_name: g.favorite,
        underdog_odds: g.underdogOdds,
        result: g.result,
        underdog_score: underdogScore,
        favorite_score: favoriteScore,
        commence_time: commenceTime,
        finished_at: ev.date ? new Date(ev.date).toISOString() : undefined,
        espn_id: ev.id,
        source: "backfill",
      };
    } else {
      // No ESPN match: save with result only; use a placeholder time so EV order is stable
      const placeholderDate = new Date(Date.UTC(year, 2, 18, 12 + notFound.length, 0, 0));
      doc = {
        game_key: gameKey,
        underdog_name: g.underdog,
        favorite_name: g.favorite,
        underdog_odds: g.underdogOdds,
        result: g.result,
        commence_time: placeholderDate.toISOString(),
        finished_at: placeholderDate.toISOString(),
        source: "backfill",
      };
      notFound.push(`${g.underdog} vs ${g.favorite}`);
    }

    await saveCompletedGame(doc);
    saved.push(doc);
  }

  // Backfill EV P/L: load completed games, sort by finished_at/commence_time, compute cumulative EV, write snapshots
  const completedMap = await getCompletedGamesFromDB();
  const completedList = [...completedMap.values()].sort(
    (a, b) =>
      new Date(a.finished_at ?? a.commence_time).getTime() -
      new Date(b.finished_at ?? b.commence_time).getTime()
  );

  let cumulative = 0;
  const evCol = db.collection<{ t: number; v: number }>(EV_COLLECTION);

  for (const doc of completedList) {
    if (doc.result === "win") cumulative += calcPayout(doc.underdog_odds);
    else if (doc.result === "loss") cumulative -= UNIT_SIZE;
    const finishedAt = doc.finished_at ?? doc.commence_time;
    const t = Math.floor(new Date(finishedAt).getTime() / MINUTE_MS) * MINUTE_MS;
    await evCol.updateOne({ t }, { $set: { t, v: cumulative } }, { upsert: true });
  }

  return NextResponse.json({
    ok: true,
    completedSaved: saved.length,
    notFoundFromESPN: notFound,
    evSnapshotsBackfilled: completedList.length,
  });
}
