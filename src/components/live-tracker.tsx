"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { ApiGame, GamesResponse } from "@/app/api/games/route";

const UNIT_SIZE = 10;
const POLL_LIVE = 30_000;
const POLL_IDLE = 120_000;

function formatOdds(odds: number): string {
  if (odds === 0) return "—";
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function formatMoney(amount: number): string {
  const prefix = amount >= 0 ? "+$" : "-$";
  return `${prefix}${Math.abs(amount).toFixed(2)}`;
}

function calcPayout(odds: number): number {
  if (odds === 0) return 0;
  if (odds > 0) return UNIT_SIZE * (odds / 100);
  return UNIT_SIZE * (100 / Math.abs(odds));
}

function formatTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    " · " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function getStats(games: ApiGame[]) {
  const settled = games.filter((g) => g.result !== "pending");
  const wins = settled.filter((g) => g.result === "win");
  const losses = settled.filter((g) => g.result === "loss");

  let totalProfit = 0;
  for (const g of settled) {
    if (g.result === "win") totalProfit += calcPayout(g.underdog.odds);
    else if (g.result === "loss") totalProfit -= UNIT_SIZE;
  }

  const totalWagered = games.length * UNIT_SIZE;
  const roi = totalWagered > 0 ? (totalProfit / totalWagered) * 100 : 0;

  return {
    total: games.length,
    settled: settled.length,
    wins: wins.length,
    losses: losses.length,
    pending: games.length - settled.length,
    totalProfit,
    totalWagered,
    roi,
  };
}

function ResultBadge({ game }: { game: ApiGame }) {
  if (game.status === "live") {
    const half = game.period === 1 ? "1H" : game.period === 2 ? "2H" : game.period ? `OT${game.period - 2}` : "";
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-live/15 px-2.5 py-0.5 text-xs font-semibold text-live">
        <span className="h-1.5 w-1.5 rounded-full bg-live animate-pulse-live" />
        {game.clock && game.clock !== "0.0" ? `${half} ${game.clock}` : "LIVE"}
      </span>
    );
  }
  const map = {
    win: { bg: "bg-win/15", text: "text-win", label: "WIN ✓" },
    loss: { bg: "bg-loss/15", text: "text-loss", label: "LOSS" },
    push: { bg: "bg-pending/15", text: "text-pending", label: "PUSH" },
    pending: { bg: "bg-pending/10", text: "text-pending", label: "PENDING" },
  };
  const s = map[game.result];
  return (
    <span className={`rounded-full ${s.bg} px-2.5 py-0.5 text-xs font-semibold ${s.text}`}>
      {s.label}
    </span>
  );
}

function StatCard({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent?: "win" | "loss" | "neutral";
}) {
  const color = accent === "win" ? "text-win" : accent === "loss" ? "text-loss" : "text-foreground";
  return (
    <div className="flex flex-col items-center rounded-xl border border-card-border bg-card/60 px-4 py-4 backdrop-blur-sm">
      <p className="text-[11px] font-medium uppercase tracking-wider text-pending">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${color}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] font-medium text-pending">{sub}</p>}
    </div>
  );
}

function GameCard({ game, index }: { game: ApiGame; index: number }) {
  const profit = game.result === "win" ? calcPayout(game.underdog.odds)
    : game.result === "loss" ? -UNIT_SIZE
    : game.result === "push" ? 0 : null;

  const showScores = game.status === "final" || game.status === "live";
  const dogAhead = showScores &&
    (game.underdog.score ?? 0) >= (game.favorite.score ?? 0);
  const isLive = game.status === "live";
  const hasOdds = game.underdog.odds !== 0;

  return (
    <div
      className={`animate-slide-up rounded-xl border bg-card/50 backdrop-blur-sm overflow-hidden transition-colors hover:border-card-border/80 ${
        isLive ? "border-live/30 shadow-[0_0_20px_-5px] shadow-live/10" : "border-card-border"
      }`}
      style={{ animationDelay: `${Math.min(index, 10) * 30}ms` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-card-border/50">
        <span className="text-[11px] text-pending truncate">
          {formatTime(game.commence_time)}
        </span>
        <ResultBadge game={game} />
      </div>

      {/* Matchup */}
      <div className="px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          {/* Favorite */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex h-6 shrink-0 items-center justify-center rounded-md bg-white/5 px-1.5 text-[10px] font-bold text-pending font-mono">
                {formatOdds(game.favorite.odds)}
              </span>
              <span className={`text-sm font-medium truncate ${
                game.status === "final" && game.result === "win" ? "text-pending/60" : "text-foreground"
              }`}>
                {game.favorite.name}
              </span>
            </div>
          </div>

          {/* Score */}
          {showScores ? (
            <div className="flex items-center gap-3 tabular-nums px-2 shrink-0">
              <span className={`text-lg font-bold ${dogAhead ? "text-pending/60" : "text-foreground"}`}>
                {game.favorite.score ?? "-"}
              </span>
              <span className="text-xs text-pending">-</span>
              <span className={`text-lg font-bold ${
                !dogAhead ? "text-pending/60" : isLive ? "text-win" : "text-foreground"
              }`}>
                {game.underdog.score ?? "-"}
              </span>
            </div>
          ) : (
            <span className="text-xs text-pending px-2 shrink-0">vs</span>
          )}

          {/* Underdog (our pick) */}
          <div className="flex-1 min-w-0 text-right">
            <div className="flex items-center justify-end gap-2">
              <span className={`text-sm font-medium truncate ${
                game.status === "final" && game.result === "loss" ? "text-pending/60" : "text-foreground"
              }`}>
                {game.underdog.name}
              </span>
              <span className="flex h-6 shrink-0 items-center justify-center rounded-md bg-accent/10 px-1.5 text-[10px] font-bold text-accent font-mono">
                {formatOdds(game.underdog.odds)}
              </span>
            </div>
          </div>
        </div>

        {/* Bottom: wager + payout */}
        {hasOdds && (
          <div className="mt-2.5 flex items-center justify-between text-xs">
            <span className="rounded-md bg-accent/10 px-2 py-0.5 font-mono font-semibold text-accent">
              🐶 ML {formatOdds(game.underdog.odds)}
            </span>
            <span className="font-mono text-pending">
              ${UNIT_SIZE} bet
            </span>
            {profit !== null ? (
              <span className={`font-mono font-semibold ${profit >= 0 ? "text-win" : "text-loss"}`}>
                {formatMoney(profit)}
              </span>
            ) : (
              <span className="font-mono text-pending">
                To win: {formatMoney(calcPayout(game.underdog.odds))}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function LiveTracker() {
  const [games, setGames] = useState<ApiGame[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const hasLiveRef = useRef(false);

  const fetchGames = useCallback(async () => {
    try {
      const res = await fetch("/api/games");
      if (!res.ok) throw new Error("fetch failed");
      const data: GamesResponse = await res.json();
      setGames(data.games);
      setLastUpdated(new Date().toLocaleTimeString());
      hasLiveRef.current = data.games.some((g) => g.status === "live");
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGames();
    const id = setInterval(() => {
      fetchGames();
    }, hasLiveRef.current ? POLL_LIVE : POLL_IDLE);
    return () => clearInterval(id);
  }, [fetchGames]);

  const stats = getStats(games);
  const profitAccent = stats.totalProfit > 0 ? "win" : stats.totalProfit < 0 ? "loss" : "neutral";
  const liveCount = games.filter((g) => g.status === "live").length;

  // Group: live, upcoming, final
  const liveGames = games.filter((g) => g.status === "live");
  const upcomingGames = games.filter((g) => g.status === "upcoming");
  const finalGames = games.filter((g) => g.status === "final");

  const sections = [
    { label: "Live Now", emoji: "🔴", games: liveGames },
    { label: "Upcoming", emoji: "⏳", games: upcomingGames },
    { label: "Final", emoji: "✅", games: finalGames },
  ].filter((s) => s.games.length > 0);

  return (
    <>
      {/* Stats */}
      <section className="border-b border-card-border bg-card/30">
        <div className="mx-auto max-w-3xl px-4 py-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Record" value={`${stats.wins}-${stats.losses}`} sub={`${stats.pending} pending`} />
            <StatCard label="P/L" value={formatMoney(stats.totalProfit)} accent={profitAccent} />
            <StatCard label="ROI" value={`${stats.roi >= 0 ? "+" : ""}${stats.roi.toFixed(1)}%`} accent={profitAccent} />
            <StatCard label="Total Bets" value={`${stats.total}`} sub={`$${stats.totalWagered} wagered`} />
          </div>
          <div className="mt-3 flex items-center justify-center gap-2 text-xs text-pending">
            {liveCount > 0 && (
              <span className="inline-flex items-center gap-1.5 text-live font-semibold">
                <span className="h-1.5 w-1.5 rounded-full bg-live animate-pulse-live" />
                {liveCount} game{liveCount !== 1 ? "s" : ""} live
              </span>
            )}
            {lastUpdated && <span>{liveCount > 0 ? " · " : ""}Updated {lastUpdated}</span>}
            {loading && <span className="text-accent">Fetching scores...</span>}
            {error && <span className="text-loss">Failed to fetch — retrying...</span>}
          </div>
        </div>
      </section>

      {/* Games */}
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        {games.length === 0 && !loading && (
          <div className="text-center py-20">
            <p className="text-2xl">🏀</p>
            <p className="mt-2 text-pending">
              No tournament games found yet.
              <br />
              <span className="text-xs">Make sure your <code className="text-accent">ODDS_API_KEY</code> is set in <code className="text-accent">.env.local</code></span>
            </p>
          </div>
        )}

        {sections.map(({ label, emoji, games: sectionGames }) => (
          <section key={label} className="mb-8">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-pending">
              <span className="h-px flex-1 bg-card-border" />
              {emoji} {label}
              <span className="text-accent font-mono text-xs font-normal normal-case">
                {sectionGames.length}
              </span>
              <span className="h-px flex-1 bg-card-border" />
            </h2>
            <div className="flex flex-col gap-3">
              {sectionGames.map((game, i) => (
                <GameCard key={game.id} game={game} index={i} />
              ))}
            </div>
          </section>
        ))}
      </main>
    </>
  );
}
