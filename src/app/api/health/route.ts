import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

/**
 * GET /api/health — Check MongoDB connection.
 * Returns { ok, mongodb: "connected" | "disconnected" | "error" }.
 */
export async function GET() {
  let db;
  try {
    db = getDb();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid connection string";
    const hint = message.includes("option") && message.includes("is not supported")
      ? " — URL-encode special characters in the password (e.g. @ → %40, # → %23). See docs/MONGODB_ATLAS.md"
      : "";
    return NextResponse.json(
      { ok: false, mongodb: "error", message: message + hint },
      { status: 503 }
    );
  }
  if (!db) {
    return NextResponse.json(
      { ok: false, mongodb: "disconnected", message: "MONGODB_URI not set or invalid" },
      { status: 503 }
    );
  }
  try {
    await db.command({ ping: 1 });
    return NextResponse.json({ ok: true, mongodb: "connected" });
  } catch (e) {
    console.error("MongoDB health check:", e);
    const message = e instanceof Error ? e.message : "Connection failed";
    const hint = message.includes("option") && message.includes("is not supported")
      ? " — Check that your password in MONGODB_URI is URL-encoded (e.g. @ → %40, # → %23)"
      : "";
    return NextResponse.json(
      { ok: false, mongodb: "error", message: message + hint },
      { status: 503 }
    );
  }
}
