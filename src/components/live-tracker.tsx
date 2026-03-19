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

function formatDate(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTipoff(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
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
    wins: wins.length,
    losses: losses.length,
    pending: games.length - settled.length,
    totalProfit,
    totalWagered,
    roi,
  };
}

/* ── Tiny sub-components ── */

function StatusPill({ game }: { game: ApiGame }) {
  if (game.status === "live") {
    const half = game.period === 1 ? "1H" : game.period === 2 ? "2H" : game.period ? `OT${game.period - 2}` : "";
    const label = game.clock && game.clock !== "0.0" ? `${half} ${game.clock}` : "LIVE";
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-ios-red">
        <span className="h-[6px] w-[6px] rounded-full bg-ios-red animate-pulse-live" />
        {label}
      </span>
    );
  }

  if (game.status === "final") {
    if (game.result === "win")
      return <span className="text-[12px] font-semibold text-ios-green">Win</span>;
    if (game.result === "loss")
      return <span className="text-[12px] font-semibold text-ios-red">Loss</span>;
    return <span className="text-[12px] font-medium text-secondary">Final</span>;
  }

  return <span className="text-[12px] font-medium text-tertiary">Upcoming</span>;
}

function SeedBadge({ seed, highlight }: { seed?: number; highlight?: boolean }) {
  if (!seed) return null;
  return (
    <span
      className={`flex h-[22px] min-w-[22px] items-center justify-center rounded-[6px] px-1 text-[11px] font-bold tabular-nums ${
        highlight
          ? "bg-ios-blue/10 text-ios-blue"
          : "bg-label-bg text-secondary"
      }`}
    >
      {seed}
    </span>
  );
}

/* ── Game card ── */

function GameCard({ game, index }: { game: ApiGame; index: number }) {
  const profit =
    game.result === "win" ? calcPayout(game.underdog.odds)
    : game.result === "loss" ? -UNIT_SIZE
    : game.result === "push" ? 0
    : null;

  const showScores = game.status === "final" || game.status === "live";
  const isLive = game.status === "live";
  const hasOdds = game.underdog.odds !== 0;

  return (
    <div
      className={`animate-fade-in bg-card rounded-2xl overflow-hidden ${
        isLive ? "shadow-card-elevated" : "shadow-card"
      }`}
      style={{ animationDelay: `${Math.min(index, 12) * 25}ms` }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 pt-3 pb-0">
        <div className="flex items-center gap-1.5 text-[12px] text-tertiary">
          {game.status === "upcoming" && game.commence_time ? (
            <>
              <span className="font-semibold text-foreground">{formatTipoff(game.commence_time)}</span>
              <span>·</span>
              <span>{formatDate(game.commence_time)}</span>
            </>
          ) : (
            <span>{formatDate(game.commence_time)}</span>
          )}
        </div>
        <StatusPill game={game} />
      </div>

      {/* Matchup rows */}
      <div className="px-4 pt-2.5 pb-1">
        {/* Opponent (lower seed) */}
        <div className="flex items-center gap-2.5 py-[6px]">
          <SeedBadge seed={game.favorite.seed} />
          <span className={`flex-1 text-[15px] font-medium truncate ${
            game.status === "final" && game.result === "win" ? "text-tertiary" : "text-foreground"
          }`}>
            {game.favorite.name}
          </span>
          {showScores && (
            <span className={`text-[17px] font-semibold tabular-nums ${
              game.status === "final" && game.result === "win" ? "text-tertiary" : "text-foreground"
            }`}>
              {game.favorite.score ?? "-"}
            </span>
          )}
        </div>

        <div className="h-px bg-separator mx-0" />

        {/* Our pick (higher seed) */}
        <div className="flex items-center gap-2.5 py-[6px]">
          <SeedBadge seed={game.underdog.seed} highlight />
          <span className={`flex-1 text-[15px] font-semibold truncate ${
            game.status === "final" && game.result === "loss" ? "text-tertiary" : "text-foreground"
          }`}>
            {game.underdog.name}
          </span>
          {showScores && (
            <span className={`text-[17px] font-bold tabular-nums ${
              game.status === "final" && game.result === "loss"
                ? "text-tertiary"
                : isLive
                  ? "text-ios-blue"
                  : "text-foreground"
            }`}>
              {game.underdog.score ?? "-"}
            </span>
          )}
        </div>
      </div>

      {/* Win probability — live only */}
      {isLive && game.underdogWinPct !== undefined && (() => {
        const favPct = 100 - game.underdogWinPct;
        const dogPct = game.underdogWinPct;
        const dogLeading = dogPct >= 50;
        const favShort = game.favorite.name.split(" ").pop() ?? game.favorite.name;
        const dogShort = game.underdog.name.split(" ").pop() ?? game.underdog.name;
        return (
          <div className="px-4 pb-1">
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className={`tabular-nums ${dogLeading ? "text-tertiary" : "font-semibold text-foreground"}`}>
                {favShort} {favPct.toFixed(0)}%
              </span>
              <span className={`tabular-nums ${dogLeading ? "font-semibold text-ios-green" : "text-ios-blue"}`}>
                {dogShort} {dogPct.toFixed(0)}%
              </span>
            </div>
            <div className="relative h-[5px] w-full rounded-full bg-label-bg overflow-hidden">
              <div
                className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out ${
                  dogLeading ? "bg-tertiary/40" : "bg-foreground/20"
                }`}
                style={{ width: `${favPct}%` }}
              />
              <div
                className={`absolute inset-y-0 right-0 rounded-full transition-all duration-700 ease-out ${
                  dogLeading ? "bg-ios-green" : "bg-ios-blue"
                }`}
                style={{ width: `${dogPct}%` }}
              />
            </div>
          </div>
        );
      })()}

      {/* Bet info footer */}
      {hasOdds && (
        <div className="flex items-center justify-between px-4 pt-2 pb-3 text-[13px]">
          <span className="font-semibold text-ios-blue tabular-nums">
            ML {formatOdds(game.underdog.odds)}
          </span>
          <span className="text-tertiary tabular-nums">
            ${UNIT_SIZE}/person
          </span>
          {profit !== null ? (
            <span className={`font-semibold tabular-nums ${profit >= 0 ? "text-ios-green" : "text-ios-red"}`}>
              {formatMoney(profit)}
            </span>
          ) : (
            <span className="text-secondary tabular-nums">
              Win {formatMoney(calcPayout(game.underdog.odds))}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Stats bar ── */

function StatItem({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col items-center">
      <p className={`text-[20px] font-bold tabular-nums ${color ?? "text-foreground"}`}>{value}</p>
      <p className="text-[11px] font-medium text-tertiary mt-0.5">{label}</p>
    </div>
  );
}

/* ── Main component ── */

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
    const id = setInterval(fetchGames, hasLiveRef.current ? POLL_LIVE : POLL_IDLE);
    return () => clearInterval(id);
  }, [fetchGames]);

  const stats = getStats(games);
  const profitColor = stats.totalProfit > 0 ? "text-ios-green" : stats.totalProfit < 0 ? "text-ios-red" : undefined;
  const liveCount = games.filter((g) => g.status === "live").length;

  const liveGames = games.filter((g) => g.status === "live");
  const upcomingGames = games.filter((g) => g.status === "upcoming");
  const finalGames = games.filter((g) => g.status === "final");

  const sections = [
    { label: "Live", games: liveGames },
    { label: "Upcoming", games: upcomingGames },
    { label: "Final", games: finalGames },
  ].filter((s) => s.games.length > 0);

  return (
    <>
      {/* Stats strip */}
      <div className="bg-card shadow-card">
        <div className="mx-auto max-w-lg px-5 py-4">
          <div className="grid grid-cols-4 gap-2">
            <StatItem label="Record" value={`${stats.wins}–${stats.losses}`} />
            <StatItem label="P/L" value={formatMoney(stats.totalProfit)} color={profitColor} />
            <StatItem label="ROI" value={`${stats.roi >= 0 ? "+" : ""}${stats.roi.toFixed(0)}%`} color={profitColor} />
            <StatItem label="Bets" value={`${stats.total}`} />
          </div>

          <div className="flex items-center justify-center gap-1.5 mt-3 text-[12px] text-tertiary">
            {liveCount > 0 && (
              <>
                <span className="inline-flex items-center gap-1 text-ios-red font-semibold">
                  <span className="h-[5px] w-[5px] rounded-full bg-ios-red animate-pulse-live" />
                  {liveCount} live
                </span>
                <span>·</span>
              </>
            )}
            {lastUpdated && <span>Updated {lastUpdated}</span>}
            {loading && !lastUpdated && <span>Loading...</span>}
            {error && <span className="text-ios-red">Connection error</span>}
          </div>
        </div>
      </div>

      {/* Game list */}
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-4">
        {games.length === 0 && !loading && (
          <div className="text-center py-24">
            <p className="text-[32px]">🏀</p>
            <p className="mt-3 text-[15px] text-secondary">No games found</p>
            <p className="mt-1 text-[13px] text-tertiary">
              Check that your API key is configured
            </p>
          </div>
        )}

        {sections.map(({ label, games: sectionGames }) => (
          <section key={label} className="mb-5">
            <div className="flex items-center justify-between px-1 mb-2">
              <h2 className="text-[13px] font-semibold text-secondary uppercase tracking-wide">
                {label}
              </h2>
              <span className="text-[13px] font-medium text-tertiary tabular-nums">
                {sectionGames.length}
              </span>
            </div>
            <div className="flex flex-col gap-2.5">
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
