import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

const MINUTE_MS = 60_000;
const EV_SNAPSHOTS_RETENTION_MS = 7 * 24 * 60 * MINUTE_MS; // 7 days
const COLLECTION = "ev_snapshots";

export interface EVSnapshot {
  t: number;
  v: number;
}

export async function GET() {
  try {
    const db = getDb();
    if (!db) {
      return NextResponse.json({ snapshots: [] as EVSnapshot[] });
    }
    const cursor = db.collection<EVSnapshot>(COLLECTION).find({}).sort({ t: 1 });
    const data = await cursor.toArray();
    const snapshots = data.map((doc) => ({ t: Number(doc.t), v: Number(doc.v) }));
    return NextResponse.json({ snapshots });
  } catch (e) {
    console.error("ev_snapshots GET:", e);
    return NextResponse.json({ snapshots: [] as EVSnapshot[] });
  }
}

export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    if (!db) {
      return NextResponse.json({ ok: true });
    }
    const body = await request.json();
    const t = typeof body?.t === "number" ? Math.floor(body.t / MINUTE_MS) * MINUTE_MS : null;
    const v = typeof body?.v === "number" ? body.v : null;
    if (t == null || v == null) {
      return NextResponse.json({ error: "Missing t or v" }, { status: 400 });
    }
    const col = db.collection<EVSnapshot>(COLLECTION);
    await col.updateOne({ t }, { $set: { t, v } }, { upsert: true });
    const cutoff = Date.now() - EV_SNAPSHOTS_RETENTION_MS;
    await col.deleteMany({ t: { $lt: cutoff } });
    const cursor = col.find({}).sort({ t: 1 });
    const data = await cursor.toArray();
    const snapshots = data.map((doc) => ({ t: Number(doc.t), v: Number(doc.v) }));
    return NextResponse.json({ ok: true, snapshots });
  } catch (e) {
    console.error("EV snapshots POST:", e);
    return NextResponse.json({ error: "Storage error" }, { status: 503 });
  }
}
