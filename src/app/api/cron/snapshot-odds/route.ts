import { NextRequest, NextResponse } from "next/server";
import {
  fetchOddsFromAPI,
  buildPregameSnapshotFromOddsEvent,
  savePregameOddsSnapshot,
  type PregameOddsEntry,
} from "@/app/api/games/route";

/**
 * Cron: run at 11am ET daily to snapshot pregame odds to KV.
 * All games use this snapshot for display and EV calculations.
 *
 * Vercel Cron: set in vercel.json to "0 15 * * *" (15:00 UTC ≈ 11am ET in winter)
 * or "0 16 * * *" in summer (EDT). Alternatively call from external cron with CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  const token = auth?.replace(/^Bearer\s+/i, "") ?? request.nextUrl.searchParams.get("secret");
  if (secret && token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { events } = await fetchOddsFromAPI();
  const entries: PregameOddsEntry[] = [];
  for (const e of events) {
    const entry = buildPregameSnapshotFromOddsEvent(e);
    if (entry) entries.push(entry);
  }

  await savePregameOddsSnapshot(entries);

  return NextResponse.json({
    ok: true,
    date: new Date().toISOString(),
    count: entries.length,
  });
}
