import { NextResponse } from "next/server";

const ESPN_SCOREBOARD =
  "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard";

export interface ESPNCompetitor {
  team: { displayName: string; shortDisplayName: string; abbreviation: string };
  score: string;
  curatedRank?: { current: number };
  winner?: boolean;
}

export interface ESPNCompetition {
  competitors: ESPNCompetitor[];
  status: {
    type: { name: string; completed: boolean; description: string };
    displayClock: string;
    period: number;
  };
}

export interface ESPNEvent {
  id: string;
  name: string;
  shortName: string;
  competitions: ESPNCompetition[];
}

export interface ScoreboardResponse {
  events: ESPNEvent[];
  fetchedAt: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  // ESPN uses dates in YYYYMMDD format
  // Allow passing a specific date, or default to today + surrounding days
  const dates = searchParams.get("dates");
  const groups = "100"; // NCAA Tournament group ID

  try {
    // Fetch multiple days to cover games that span the tournament window
    const dateList = dates
      ? [dates]
      : getTournamentDates();

    const allEvents: ESPNEvent[] = [];

    for (const d of dateList) {
      const url = `${ESPN_SCOREBOARD}?dates=${d}&groups=${groups}&limit=100`;
      const res = await fetch(url, {
        next: { revalidate: 30 },
        headers: { "User-Agent": "3PTVentures/1.0" },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.events) {
          allEvents.push(...data.events);
        }
      }
    }

    // Deduplicate by event ID
    const seen = new Set<string>();
    const unique = allEvents.filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });

    const response: ScoreboardResponse = {
      events: unique,
      fetchedAt: new Date().toISOString(),
    };

    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    });
  } catch (error) {
    console.error("ESPN API error:", error);
    return NextResponse.json(
      { events: [], fetchedAt: new Date().toISOString(), error: "Failed to fetch scores" },
      { status: 502 }
    );
  }
}

function getTournamentDates(): string[] {
  // Return dates covering the current tournament window
  // First Four: Mar 18-19, Round of 64: Mar 20-21, Round of 32: Mar 22-23
  // Sweet 16: Mar 27-28, Elite 8: Mar 29-30, Final Four: Apr 5, Championship: Apr 7
  const today = new Date();
  const dates: string[] = [];

  // Include today and the next 2 days to catch upcoming + in-progress
  for (let i = -1; i <= 2; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    dates.push(
      `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`
    );
  }

  return dates;
}
