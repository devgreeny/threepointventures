"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { ApiGame, GamesResponse } from "@/app/api/games/route";

const UNIT_SIZE = 10;
const POLL_LIVE = 30_000;
const POLL_IDLE = 120_000;

// Strip the last word (mascot) to get the school name — "Duke Blue Devils" → "Duke"
function schoolName(fullName: string): string {
  const words = fullName.trim().split(/\s+/);
  if (words.length <= 1) return fullName;
  // Handle two-word mascots: "Blue Devils", "Tar Heels", "Yellow Jackets", etc.
  const twoWordMascots = ["blue", "tar", "yellow", "red", "golden", "mean", "horned", "sun", "bull", "saint"];
  if (words.length >= 3 && twoWordMascots.includes(words[words.length - 2].toLowerCase())) {
    return words.slice(0, -2).join(" ");
  }
  return words.slice(0, -1).join(" ");
}

// Test data: fake results for first 3 games to verify chart works
const TEST_MODE = false;
function applyTestData(games: ApiGame[]): ApiGame[] {
  if (!TEST_MODE || games.length < 3) return games;
  const copy = games.map((g) => ({ ...g, favorite: { ...g.favorite }, underdog: { ...g.underdog } }));
  const sorted = [...copy].sort((a, b) =>
    new Date(a.commence_time || 0).getTime() - new Date(b.commence_time || 0).getTime()
  );
  const ids = new Set(sorted.slice(0, 3).map((g) => g.id));
  const now = Date.now();
  return copy.map((g) => {
    if (!ids.has(g.id)) return g;
    const idx = sorted.findIndex((s) => s.id === g.id);
    if (idx === 0) {
      return { ...g, commence_time: new Date(now - 4 * 3600_000).toISOString(), status: "final" as const, result: "win" as const, favorite: { ...g.favorite, score: 60 }, underdog: { ...g.underdog, score: 72, odds: g.underdog.odds || 250 } };
    }
    if (idx === 1) {
      return { ...g, commence_time: new Date(now - 2.5 * 3600_000).toISOString(), status: "final" as const, result: "loss" as const, favorite: { ...g.favorite, score: 78 }, underdog: { ...g.underdog, score: 65, odds: g.underdog.odds || 180 } };
    }
    if (idx === 2) {
      return { ...g, commence_time: new Date(now - 1 * 3600_000).toISOString(), status: "live" as const, result: "pending" as const, clock: "8:42", period: 2, favorite: { ...g.favorite, score: 34 }, underdog: { ...g.underdog, score: 41, odds: g.underdog.odds || 320 }, underdogWinPct: 62 };
    }
    return g;
  });
}

/* ── Helpers ── */

function formatOdds(odds: number): string {
  if (odds === 0) return "—";
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function formatMoney(amount: number): string {
  const prefix = amount >= 0 ? "+$" : "-$";
  return `${prefix}${Math.abs(amount).toFixed(2)}`;
}

function formatMoneyShort(amount: number): string {
  const prefix = amount >= 0 ? "+" : "-";
  return `${prefix}$${Math.abs(amount).toFixed(0)}`;
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

function impliedProb(odds: number): number {
  if (odds === 0) return 0;
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

function calcEV(game: ApiGame): number {
  const payout = calcPayout(game.underdog.odds);
  if (game.underdog.odds === 0) return 0;

  if (game.result === "win") return payout;
  if (game.result === "loss") return -UNIT_SIZE;
  if (game.result === "push") return 0;

  // Live: use ESPN win probability
  if (game.status === "live" && game.underdogWinPct !== undefined) {
    const winProb = game.underdogWinPct / 100;
    return winProb * payout - (1 - winProb) * UNIT_SIZE;
  }

  // Upcoming: use odds-implied probability (~breakeven)
  const winProb = impliedProb(game.underdog.odds);
  return winProb * payout - (1 - winProb) * UNIT_SIZE;
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
  const projectedPL = games.reduce((sum, g) => sum + calcEV(g), 0);

  return {
    total: games.length,
    wins: wins.length,
    losses: losses.length,
    pending: games.length - settled.length,
    totalProfit,
    totalWagered,
    roi,
    projectedPL,
  };
}

/* ── Sub-components ── */

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
    <span className={`flex h-[22px] min-w-[22px] items-center justify-center rounded-[6px] px-1 text-[11px] font-bold tabular-nums ${
      highlight ? "bg-ios-blue/10 text-ios-blue" : "bg-label-bg text-secondary"
    }`}>
      {seed}
    </span>
  );
}

function TeamLogo({ src, alt }: { src?: string; alt: string }) {
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} width={24} height={24} className="h-6 w-6 object-contain shrink-0" />
  );
}

function StatItem({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col items-center">
      <p className={`text-[20px] font-bold tabular-nums ${color ?? "text-foreground"}`}>{value}</p>
      <p className="text-[11px] font-medium text-tertiary mt-0.5">{label}</p>
    </div>
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

      <div className="px-4 pt-2.5 pb-1">
        <div className="flex items-center gap-2.5 py-[6px]">
          <TeamLogo src={game.favorite.logo} alt={game.favorite.name} />
          <SeedBadge seed={game.favorite.seed} />
          <span className={`flex-1 text-[15px] font-medium truncate ${
            game.status === "final" && game.result === "win" ? "text-tertiary" : "text-foreground"
          }`}>
            {schoolName(game.favorite.name)}
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

        <div className="flex items-center gap-2.5 py-[6px]">
          <TeamLogo src={game.underdog.logo} alt={game.underdog.name} />
          <SeedBadge seed={game.underdog.seed} highlight />
          <span className={`flex-1 text-[15px] font-semibold truncate ${
            game.status === "final" && game.result === "loss" ? "text-tertiary" : "text-foreground"
          }`}>
            {schoolName(game.underdog.name)}
          </span>
          {showScores && (
            <span className={`text-[17px] font-bold tabular-nums ${
              game.status === "final" && game.result === "loss"
                ? "text-tertiary"
                : isLive ? "text-ios-blue" : "text-foreground"
            }`}>
              {game.underdog.score ?? "-"}
            </span>
          )}
        </div>
      </div>

      {isLive && game.underdogWinPct !== undefined && (() => {
        const favPct = 100 - game.underdogWinPct;
        const dogPct = game.underdogWinPct;
        const dogLeading = dogPct >= 50;
        const favShort = schoolName(game.favorite.name);
        const dogShort = schoolName(game.underdog.name);
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

/* ── EV Chart (pure SVG, time-bucketed) ── */

function EVChart({ games }: { games: ApiGame[] }) {
  const [now, setNow] = useState(Date.now());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
  }, [now, games]);

  const withOdds = games.filter((g) => g.underdog.odds !== 0 && g.commence_time);
  const startedGames = withOdds.filter((g) => g.status === "live" || g.status === "final");

  if (startedGames.length === 0) {
    return (
      <div className="bg-card rounded-2xl shadow-card overflow-hidden">
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-center justify-between">
            <h3 className="text-[15px] font-semibold">P/L Timeline</h3>
            <span className="text-[15px] font-bold tabular-nums text-foreground">$0.00</span>
          </div>
          <p className="text-[12px] text-tertiary mt-0.5">
            Live cumulative P/L · updates every minute
          </p>
        </div>
        <div className="flex items-center justify-center py-10">
          <div className="text-center">
            <p className="text-[28px]">📈</p>
            <p className="text-[13px] text-secondary mt-2">Chart goes live at tipoff</p>
            <p className="text-[11px] text-tertiary mt-0.5">Updates in real time as games are played</p>
          </div>
        </div>
        <div className="flex items-center justify-center gap-4 px-4 pb-3 text-[11px] text-tertiary">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-ios-green" /> Winning
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-ios-blue" /> Live
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-ios-red" /> Losing
          </span>
        </div>
      </div>
    );
  }

  const t0 = Math.min(...startedGames.map((g) => new Date(g.commence_time).getTime()));
  const tN = now;
  const MINUTE = 60_000;

  interface Tick { time: number; cumulative: number; hasLive: boolean }
  const ticks: Tick[] = [];
  for (let t = t0; t <= tN; t += MINUTE) {
    let cum = 0;
    let hasLive = false;
    for (const g of withOdds) {
      const start = new Date(g.commence_time).getTime();
      if (start > t) continue;
      cum += calcEV(g);
      if (g.status === "live") hasLive = true;
    }
    ticks.push({ time: t, cumulative: cum, hasLive });
  }

  if (ticks.length === 0) return null;

  const W_PER_MIN = 2;
  const svgW = Math.max(ticks.length * W_PER_MIN, 320);
  const H = 280;
  const PAD_L = 48;
  const PAD_R = 24;
  const PAD_T = 24;
  const PAD_B = 56;
  const chartW = svgW - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  const values = ticks.map((t) => t.cumulative);
  const rawMax = Math.max(Math.abs(Math.max(...values)), Math.abs(Math.min(...values)), 10);
  const yMax = Math.ceil(rawMax / 10) * 10;

  const toX = (i: number) => PAD_L + (ticks.length <= 1 ? chartW / 2 : (i / (ticks.length - 1)) * chartW);
  const toY = (val: number) => PAD_T + chartH / 2 - (val / yMax) * (chartH / 2);

  const zeroY = toY(0);

  // Downsample for SVG perf — max ~600 points in the path
  const step = Math.max(1, Math.floor(ticks.length / 600));
  const sampledIdx = ticks.map((_, i) => i).filter((i) => i % step === 0 || i === ticks.length - 1);

  const pathPoints = sampledIdx.map((i) => `${toX(i)},${toY(ticks[i].cumulative)}`);
  const linePath = `M${pathPoints.join("L")}`;
  const areaPath = `M${toX(sampledIdx[0])},${zeroY}L${pathPoints.join("L")}L${toX(sampledIdx[sampledIdx.length - 1])},${zeroY}Z`;

  const lastVal = ticks[ticks.length - 1].cumulative;
  const isPositive = lastVal >= 0;
  const anyLive = ticks[ticks.length - 1].hasLive;

  const yTicks2 = [-yMax, -yMax / 2, 0, yMax / 2, yMax].filter((v) => Math.abs(v) <= yMax);

  // X-axis labels every 30 min
  const HALF_HOUR = 30 * MINUTE;
  const firstLabel = Math.ceil(ticks[0].time / HALF_HOUR) * HALF_HOUR;
  const xLabels: { idx: number; label: string; dateLabel: string; isDay: boolean }[] = [];
  let prevDay = "";
  for (let t = firstLabel; t <= tN; t += HALF_HOUR) {
    const idx = Math.round((t - t0) / MINUTE);
    if (idx < 0 || idx >= ticks.length) continue;
    const d = new Date(t);
    let h = d.getHours();
    const m = d.getMinutes();
    const ampm = h >= 12 ? "p" : "a";
    h = h % 12 || 12;
    const label = m === 0 ? `${h}${ampm}` : `${h}:${m.toString().padStart(2, "0")}${ampm}`;
    const dateLabel = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const isDay = dateLabel !== prevDay;
    prevDay = dateLabel;
    xLabels.push({ idx, label, dateLabel, isDay });
  }

  return (
    <div className="bg-card rounded-2xl shadow-card overflow-hidden">
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-semibold">P/L Timeline</h3>
          <div className="flex items-center gap-2">
            {anyLive && <span className="h-1.5 w-1.5 rounded-full bg-ios-blue animate-pulse" />}
            <span className={`text-[15px] font-bold tabular-nums ${
              isPositive ? "text-ios-green" : lastVal < 0 ? "text-ios-red" : "text-foreground"
            }`}>
              {formatMoney(lastVal)}
            </span>
          </div>
        </div>
        <p className="text-[12px] text-tertiary mt-0.5">
          Live cumulative P/L · updates every minute
        </p>
      </div>

      <div ref={scrollRef} className="px-2 pb-3 overflow-x-auto">
        <svg viewBox={`0 0 ${svgW} ${H}`} className="block" style={{ width: svgW, minWidth: 320, height: H }}>
          {/* Y grid lines */}
          {yTicks2.map((v) => (
            <g key={v}>
              <line
                x1={PAD_L} y1={toY(v)} x2={svgW - PAD_R} y2={toY(v)}
                stroke={v === 0 ? "rgba(0,0,0,0.12)" : "rgba(0,0,0,0.05)"}
                strokeWidth={v === 0 ? 1 : 0.5}
              />
              <text
                x={PAD_L - 8} y={toY(v)} textAnchor="end" dominantBaseline="middle"
                fill="#8e8e93" fontSize="10" fontWeight="500"
              >
                {formatMoneyShort(v)}
              </text>
            </g>
          ))}

          {/* Area fill */}
          <path d={areaPath} fill={isPositive ? "rgba(52,199,89,0.08)" : "rgba(255,59,48,0.08)"} />

          {/* Line */}
          <path
            d={linePath} fill="none"
            stroke={isPositive ? "#34c759" : "#ff3b30"}
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          />

          {/* Game event markers */}
          {withOdds
            .filter((g) => g.status === "final" || g.status === "live")
            .map((g, gi) => {
              const start = new Date(g.commence_time).getTime();
              const tickIdx = Math.round((start - t0) / MINUTE);
              if (tickIdx < 0 || tickIdx >= ticks.length) return null;
              const x = toX(tickIdx);
              const y = toY(ticks[tickIdx].cumulative);
              const ev = calcEV(g);
              const won = g.result === "win";
              const lost = g.result === "loss";
              const live = g.status === "live";
              const color = live ? "#007aff" : won ? "#34c759" : "#ff3b30";
              const label = schoolName(g.underdog.name);
              const above = y > toY(0);
              return (
                <g key={`evt-${gi}`}>
                  <circle cx={x} cy={y} r={4} fill={color} />
                  {live && (
                    <circle cx={x} cy={y} r={7} fill="none" stroke="#007aff" strokeWidth="1.5" opacity="0.4" />
                  )}
                  <text
                    x={x} y={above ? y + 14 : y - 8} textAnchor="middle"
                    fill={color} fontSize="8" fontWeight="600"
                  >
                    {live ? `${label}` : won ? `${label} W` : `${label} L`}
                  </text>
                  {g.status === "final" && (
                    <text
                      x={x} y={above ? y + 23 : y - 17} textAnchor="middle"
                      fill={color} fontSize="7" fontWeight="500" opacity="0.7"
                    >
                      {ev >= 0 ? `+$${ev.toFixed(0)}` : `-$${Math.abs(ev).toFixed(0)}`}
                    </text>
                  )}
                </g>
              );
            })}

          {/* Leading edge dot */}
          <circle
            cx={toX(ticks.length - 1)} cy={toY(lastVal)} r={4}
            fill={anyLive ? "#007aff" : isPositive ? "#34c759" : "#ff3b30"}
          />
          {anyLive && (
            <circle
              cx={toX(ticks.length - 1)} cy={toY(lastVal)} r={7}
              fill="none" stroke="#007aff" strokeWidth="1.5" opacity="0.4"
            />
          )}

          {/* X-axis labels */}
          {xLabels.map((l, i) => (
            <g key={i}>
              <text
                x={toX(l.idx)} y={H - PAD_B + 14} textAnchor="middle"
                fill="#8e8e93" fontSize="9" fontWeight="400"
              >
                {l.label}
              </text>
              {l.isDay && (
                <text
                  x={toX(l.idx)} y={H - PAD_B + 26} textAnchor="middle"
                  fill="#aeaeb2" fontSize="8" fontWeight="500"
                >
                  {l.dateLabel}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 px-4 pb-3 text-[11px] text-tertiary">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-ios-green" /> Winning
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-ios-blue" /> Live
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-ios-red" /> Losing
        </span>
      </div>
    </div>
  );
}

/* ── EV breakdown per game ── */

function EVRow({ game }: { game: ApiGame }) {
  const ev = calcEV(game);
  const payout = calcPayout(game.underdog.odds);
  const short = schoolName(game.underdog.name);
  const odds = game.underdog.odds;

  let probLabel = "";
  if (game.status === "live" && game.underdogWinPct !== undefined) {
    probLabel = `${game.underdogWinPct.toFixed(0)}% live`;
  } else if (game.status === "final") {
    probLabel = game.result === "win" ? "100%" : "0%";
  } else {
    probLabel = `${(impliedProb(odds) * 100).toFixed(0)}% implied`;
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <TeamLogo src={game.underdog.logo} alt={game.underdog.name} />
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-medium truncate">
          <span className="text-ios-blue font-semibold">{game.underdog.seed} </span>
          {short}
          <span className="text-tertiary font-normal"> {formatOdds(odds)}</span>
        </p>
        <p className="text-[11px] text-tertiary mt-0.5">{probLabel}</p>
      </div>
      <div className="text-right shrink-0">
        <p className={`text-[14px] font-semibold tabular-nums ${
          ev > 0.5 ? "text-ios-green" : ev < -0.5 ? "text-ios-red" : "text-foreground"
        }`}>
          {formatMoney(ev)}
        </p>
        <p className="text-[11px] text-tertiary tabular-nums">
          {game.result !== "pending" ? (game.result === "win" ? `+$${payout.toFixed(0)}` : `-$${UNIT_SIZE}`) : `win $${payout.toFixed(0)}`}
        </p>
      </div>
    </div>
  );
}

/* ── Scores tab content ── */

function Countdown({ games }: { games: ApiGame[] }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const upcoming = games
    .filter((g) => g.status === "upcoming" && g.commence_time)
    .sort((a, b) => new Date(a.commence_time).getTime() - new Date(b.commence_time).getTime());

  if (upcoming.length === 0) return null;

  const next = upcoming[0];
  const tipoff = new Date(next.commence_time).getTime();
  const diff = tipoff - now;

  if (diff <= 0) return null;

  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  const secs = Math.floor((diff % 60_000) / 1000);

  const parts: { value: number; label: string }[] = [];
  if (days > 0) parts.push({ value: days, label: "d" });
  parts.push({ value: hours, label: "h" }, { value: mins, label: "m" }, { value: secs, label: "s" });

  return (
    <div className="bg-card rounded-2xl shadow-card px-4 py-3 mb-4">
      <p className="text-[12px] text-tertiary text-center mb-2">Next game tips off in</p>
      <div className="flex items-center justify-center gap-3">
        {parts.map((p) => (
          <div key={p.label} className="flex items-baseline gap-0.5">
            <span className="text-[28px] font-bold tabular-nums text-foreground">{String(p.value).padStart(2, "0")}</span>
            <span className="text-[13px] font-medium text-tertiary">{p.label}</span>
          </div>
        ))}
      </div>
      <p className="text-[12px] text-secondary text-center mt-2 truncate">
        <span className="text-ios-blue font-semibold">{next.underdog.seed} </span>
        {schoolName(next.underdog.name)} vs{" "}
        <span className="font-semibold">{next.favorite.seed} </span>
        {schoolName(next.favorite.name)}
      </p>
    </div>
  );
}

function ScoresTab({ games, stats, liveCount, lastUpdated, loading, error }: {
  games: ApiGame[]; stats: ReturnType<typeof getStats>; liveCount: number;
  lastUpdated: string | null; loading: boolean; error: boolean;
}) {
  const profitColor = stats.totalProfit > 0 ? "text-ios-green" : stats.totalProfit < 0 ? "text-ios-red" : undefined;

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

      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-4">
        <Countdown games={games} />
        <div className="mb-4">
          <EVChart games={games} />
        </div>
        {games.length === 0 && !loading && (
          <div className="text-center py-24">
            <p className="text-[32px]">🏀</p>
            <p className="mt-3 text-[15px] text-secondary">No games found</p>
            <p className="mt-1 text-[13px] text-tertiary">Check that your API key is configured</p>
          </div>
        )}
        {sections.map(({ label, games: sectionGames }) => (
          <section key={label} className="mb-5">
            <div className="flex items-center justify-between px-1 mb-2">
              <h2 className="text-[13px] font-semibold text-secondary uppercase tracking-wide">{label}</h2>
              <span className="text-[13px] font-medium text-tertiary tabular-nums">{sectionGames.length}</span>
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

/* ── EV tab content ── */

function EVTab({ games, stats }: { games: ApiGame[]; stats: ReturnType<typeof getStats> }) {
  const projColor = stats.projectedPL > 0 ? "text-ios-green" : stats.projectedPL < 0 ? "text-ios-red" : undefined;
  const profitColor = stats.totalProfit > 0 ? "text-ios-green" : stats.totalProfit < 0 ? "text-ios-red" : undefined;

  const sorted = [...games]
    .filter((g) => g.underdog.odds !== 0)
    .sort((a, b) => {
      const order = { final: 0, live: 1, upcoming: 2 };
      if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
      return new Date(a.commence_time || 0).getTime() - new Date(b.commence_time || 0).getTime();
    });

  return (
    <>
      <div className="bg-card shadow-card">
        <div className="mx-auto max-w-lg px-5 py-4">
          <div className="grid grid-cols-3 gap-2">
            <StatItem label="Settled" value={formatMoney(stats.totalProfit)} color={profitColor} />
            <StatItem label="Projected" value={formatMoney(stats.projectedPL)} color={projColor} />
            <StatItem label="Bets" value={`${stats.total}`} />
          </div>
        </div>
      </div>

      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-4">
        <div className="mb-4">
          <EVChart games={games} />
        </div>

        <div className="bg-card rounded-2xl shadow-card overflow-hidden">
          <div className="px-4 pt-3 pb-2">
            <h3 className="text-[13px] font-semibold text-secondary uppercase tracking-wide">
              EV by Game
            </h3>
          </div>
          {sorted.map((game, i) => (
            <div key={game.id}>
              {i > 0 && <div className="h-px bg-separator mx-4" />}
              <EVRow game={game} />
            </div>
          ))}
        </div>
      </main>
    </>
  );
}

/* ── Main component ── */

export default function LiveTracker() {
  const [games, setGames] = useState<ApiGame[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const hasLiveRef = useRef(false);
  const [tab, setTab] = useState<"scores" | "ev">("scores");

  const fetchGames = useCallback(async () => {
    try {
      const res = await fetch("/api/games");
      if (!res.ok) throw new Error("fetch failed");
      const data: GamesResponse = await res.json();
      setGames(applyTestData(data.games));
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
  const liveCount = games.filter((g) => g.status === "live").length;

  return (
    <>
      {/* Tab bar */}
      <div className="bg-card border-b border-separator">
        <div className="mx-auto max-w-lg flex">
          {(["scores", "ev"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-[14px] font-semibold text-center transition-colors relative ${
                tab === t ? "text-ios-blue" : "text-tertiary"
              }`}
            >
              {t === "scores" ? "Scores" : "EV"}
              {tab === t && (
                <span className="absolute bottom-0 left-1/4 right-1/4 h-[2.5px] rounded-full bg-ios-blue" />
              )}
            </button>
          ))}
        </div>
      </div>

      {tab === "scores" ? (
        <ScoresTab games={games} stats={stats} liveCount={liveCount} lastUpdated={lastUpdated} loading={loading} error={error} />
      ) : (
        <EVTab games={games} stats={stats} />
      )}
    </>
  );
}
