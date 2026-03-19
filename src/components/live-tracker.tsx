"use client";

import { useEffect, useState, useCallback } from "react";
import { games as staticGames, getStats, calcPayout, UNIT_SIZE } from "@/data/bets";
import type { Game, BetResult } from "@/data/bets";
import { mergeWithLiveScores, type LiveGame } from "@/lib/match-scores";
import type { ScoreboardResponse } from "@/app/api/scores/route";

const POLL_INTERVAL_LIVE = 30_000; // 30s when games are live
const POLL_INTERVAL_IDLE = 120_000; // 2min when no live games

function formatOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function formatMoney(amount: number): string {
  const prefix = amount >= 0 ? "+$" : "-$";
  return `${prefix}${Math.abs(amount).toFixed(2)}`;
}

function resultBadge(result: BetResult, status: LiveGame["status"], clock?: string, period?: number) {
  if (status === "live") {
    const halfLabel = period === 1 ? "1H" : period === 2 ? "2H" : `P${period}`;
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-live/15 px-2.5 py-0.5 text-xs font-semibold text-live">
        <span className="h-1.5 w-1.5 rounded-full bg-live animate-pulse-live" />
        {clock && clock !== "0.0" ? `${halfLabel} ${clock}` : "LIVE"}
      </span>
    );
  }
  if (result === "win") {
    return (
      <span className="rounded-full bg-win/15 px-2.5 py-0.5 text-xs font-semibold text-win">
        WIN ✓
      </span>
    );
  }
  if (result === "loss") {
    return (
      <span className="rounded-full bg-loss/15 px-2.5 py-0.5 text-xs font-semibold text-loss">
        LOSS
      </span>
    );
  }
  if (result === "push") {
    return (
      <span className="rounded-full bg-pending/15 px-2.5 py-0.5 text-xs font-semibold text-pending">
        PUSH
      </span>
    );
  }
  return (
    <span className="rounded-full bg-pending/10 px-2.5 py-0.5 text-xs font-medium text-pending">
      PENDING
    </span>
  );
}

function profitForGame(game: Game): number | null {
  if (game.result === "win") return calcPayout(game.underdog.odds, UNIT_SIZE);
  if (game.result === "loss") return -UNIT_SIZE;
  if (game.result === "push") return 0;
  return null;
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "win" | "loss" | "neutral";
}) {
  const accentColor =
    accent === "win"
      ? "text-win"
      : accent === "loss"
        ? "text-loss"
        : "text-foreground";
  return (
    <div className="flex flex-col items-center rounded-xl border border-card-border bg-card/60 px-4 py-4 backdrop-blur-sm">
      <p className="text-[11px] font-medium uppercase tracking-wider text-pending">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${accentColor}`}>
        {value}
      </p>
      {sub && (
        <p className="mt-0.5 text-[11px] font-medium text-pending">{sub}</p>
      )}
    </div>
  );
}

function GameCard({ game, index }: { game: LiveGame; index: number }) {
  const profit = profitForGame(game);
  const isFinal = game.status === "final";
  const isLive = game.status === "live";
  const showScores = isFinal || isLive;

  // Highlight the winner's score, dim the loser's
  const underdogWinning =
    showScores &&
    game.underdog.score !== undefined &&
    game.favorite.score !== undefined &&
    game.underdog.score >= game.favorite.score;

  return (
    <div
      className={`animate-slide-up rounded-xl border bg-card/50 backdrop-blur-sm overflow-hidden transition-colors hover:border-card-border/80 ${
        isLive ? "border-live/30 shadow-[0_0_20px_-5px] shadow-live/10" : "border-card-border"
      }`}
      style={{ animationDelay: `${index * 30}ms` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-card-border/50">
        <div className="flex items-center gap-2">
          {game.region && (
            <span className="text-[10px] font-semibold uppercase tracking-widest text-accent">
              {game.region}
            </span>
          )}
          <span className="text-[10px] font-medium uppercase tracking-widest text-pending">
            {game.round}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-pending">
            {game.date} · {game.time}
          </span>
          {resultBadge(game.result, game.status, game.clock, game.period)}
        </div>
      </div>

      {/* Matchup */}
      <div className="px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Favorite */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/5 text-[10px] font-bold text-pending">
                {game.favorite.seed}
              </span>
              <span
                className={`text-sm font-medium truncate ${
                  isFinal && game.result === "win" ? "text-pending/60" : "text-foreground"
                }`}
              >
                {game.favorite.name}
              </span>
            </div>
          </div>

          {/* Score */}
          {showScores ? (
            <div className="flex items-center gap-3 tabular-nums px-3 shrink-0">
              <span
                className={`text-lg font-bold ${
                  underdogWinning ? "text-pending/60" : "text-foreground"
                }`}
              >
                {game.favorite.score ?? "-"}
              </span>
              <span className="text-xs text-pending">-</span>
              <span
                className={`text-lg font-bold ${
                  !underdogWinning && showScores ? "text-pending/60" : isLive && underdogWinning ? "text-win" : "text-foreground"
                }`}
              >
                {game.underdog.score ?? "-"}
              </span>
            </div>
          ) : (
            <span className="text-xs text-pending px-3 shrink-0">vs</span>
          )}

          {/* Underdog (our pick) */}
          <div className="flex-1 min-w-0 text-right">
            <div className="flex items-center justify-end gap-2">
              <span
                className={`text-sm font-medium truncate ${
                  isFinal && game.result === "loss" ? "text-pending/60" : "text-foreground"
                }`}
              >
                {game.underdog.name}
              </span>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent/10 text-[10px] font-bold text-accent">
                {game.underdog.seed}
              </span>
            </div>
          </div>
        </div>

        {/* Bottom row: odds + payout */}
        <div className="mt-2.5 flex items-center justify-between text-xs">
          <span className="rounded-md bg-accent/10 px-2 py-0.5 font-mono font-semibold text-accent">
            🐶 {formatOdds(game.underdog.odds)}
          </span>
          <span className="font-mono text-pending">
            Wager: ${UNIT_SIZE.toFixed(2)}
          </span>
          {profit !== null ? (
            <span
              className={`font-mono font-semibold ${profit >= 0 ? "text-win" : "text-loss"}`}
            >
              {formatMoney(profit)}
            </span>
          ) : (
            <span className="font-mono text-pending">
              To win: {formatMoney(calcPayout(game.underdog.odds, UNIT_SIZE))}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LiveTracker() {
  const [liveGames, setLiveGames] = useState<LiveGame[]>(
    staticGames.map((g) => ({ ...g, espnMatched: false }))
  );
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchScores = useCallback(async () => {
    try {
      const res = await fetch("/api/scores");
      if (!res.ok) return;
      const data: ScoreboardResponse = await res.json();
      const merged = mergeWithLiveScores(staticGames, data.events);
      setLiveGames(merged);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch {
      // Silently fail — keep showing last known data
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchScores();

    const hasLive = liveGames.some((g) => g.status === "live");
    const interval = setInterval(
      fetchScores,
      hasLive ? POLL_INTERVAL_LIVE : POLL_INTERVAL_IDLE
    );

    return () => clearInterval(interval);
  }, [fetchScores, liveGames]);

  const stats = getStats(liveGames);
  const profitAccent =
    stats.totalProfit > 0 ? "win" : stats.totalProfit < 0 ? "loss" : "neutral";

  const rounds = [
    "First Four",
    "Round of 64",
    "Round of 32",
    "Sweet 16",
    "Elite 8",
    "Final Four",
    "Championship",
  ];
  const gamesByRound = rounds
    .map((round) => ({
      round,
      games: liveGames.filter((g) => g.round === round),
    }))
    .filter((r) => r.games.length > 0);

  const liveCount = liveGames.filter((g) => g.status === "live").length;

  return (
    <>
      {/* Stats Bar */}
      <section className="border-b border-card-border bg-card/30">
        <div className="mx-auto max-w-3xl px-4 py-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard
              label="Record"
              value={`${stats.wins}-${stats.losses}`}
              sub={`${stats.pending} pending`}
            />
            <StatCard
              label="P/L"
              value={formatMoney(stats.totalProfit)}
              accent={profitAccent}
            />
            <StatCard
              label="ROI"
              value={`${stats.roi >= 0 ? "+" : ""}${stats.roi.toFixed(1)}%`}
              accent={profitAccent}
            />
            <StatCard
              label="Wagered"
              value={`$${stats.totalWagered.toFixed(0)}`}
              sub={`$${UNIT_SIZE} / game`}
            />
          </div>
          {/* Live indicator */}
          <div className="mt-3 flex items-center justify-center gap-2 text-xs text-pending">
            {liveCount > 0 && (
              <span className="inline-flex items-center gap-1.5 text-live font-semibold">
                <span className="h-1.5 w-1.5 rounded-full bg-live animate-pulse-live" />
                {liveCount} game{liveCount !== 1 ? "s" : ""} live
              </span>
            )}
            {lastUpdated && (
              <span>
                {liveCount > 0 ? " · " : ""}Updated {lastUpdated}
              </span>
            )}
            {isLoading && (
              <span className="text-accent">Fetching scores...</span>
            )}
          </div>
        </div>
      </section>

      {/* Game List */}
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        {gamesByRound.map(({ round, games: roundGames }) => (
          <section key={round} className="mb-8">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-pending">
              <span className="h-px flex-1 bg-card-border" />
              {round}
              <span className="text-accent font-mono text-xs font-normal normal-case">
                {roundGames.filter((g) => g.result === "win").length}/
                {roundGames.filter((g) => g.result !== "pending").length}
              </span>
              <span className="h-px flex-1 bg-card-border" />
            </h2>
            <div className="flex flex-col gap-3">
              {roundGames.map((game, i) => (
                <GameCard key={game.id} game={game} index={i} />
              ))}
            </div>
          </section>
        ))}
      </main>
    </>
  );
}
