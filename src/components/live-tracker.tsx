"use client";

import { useEffect, useState, useRef } from "react";
import type { ApiGame, GamesResponse } from "@/app/api/games/route";

const UNIT_SIZE = 10;

function schoolName(fullName: string): string {
  const words = fullName.trim().split(/\s+/);
  if (words.length <= 1) return fullName;
  const twoWordMascots = ["blue", "tar", "yellow", "red", "golden", "mean", "horned", "sun", "bull", "saint"];
  if (words.length >= 3 && twoWordMascots.includes(words[words.length - 2].toLowerCase())) {
    return words.slice(0, -2).join(" ");
  }
  return words.slice(0, -1).join(" ");
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

function getStats(games: ApiGame[]) {
  const settled = games.filter((g) => g.result !== "pending");
  const wins = settled.filter((g) => g.result === "win");
  const losses = settled.filter((g) => g.result === "loss");

  let totalProfit = 0;
  for (const g of settled) {
    if (g.result === "win") totalProfit += calcPayout(g.underdog.odds);
    else if (g.result === "loss") totalProfit -= UNIT_SIZE;
  }

  const totalWagered = settled.length * UNIT_SIZE;
  const roi = totalWagered > 0 ? (totalProfit / totalWagered) * 100 : 0;

  return {
    total: settled.length,
    wins: wins.length,
    losses: losses.length,
    totalProfit,
    totalWagered,
    roi,
  };
}

/* ── Sub-components ── */

function StatusPill({ game }: { game: ApiGame }) {
  if (game.result === "win")
    return <span className="text-[12px] font-semibold text-ios-green">Win</span>;
  if (game.result === "loss")
    return <span className="text-[12px] font-semibold text-ios-red">Loss</span>;
  return <span className="text-[12px] font-medium text-secondary">Final</span>;
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

  const showScores = game.status === "final";
  const hasOdds = game.underdog.odds !== 0;

  return (
    <div
      className="animate-fade-in bg-card rounded-2xl overflow-hidden shadow-card"
      style={{ animationDelay: `${Math.min(index, 12) * 25}ms` }}
    >
      <div className="flex items-center justify-between px-4 pt-3 pb-0">
        <div className="flex items-center gap-1.5 text-[12px] text-tertiary">
          <span>{formatDate(game.commence_time)}</span>
        </div>
        <StatusPill game={game} />
      </div>

      <div className="px-4 pt-2.5 pb-1">
        <div className="flex items-center gap-2.5 py-[6px]">
          <TeamLogo src={game.favorite.logo} alt={game.favorite.name} />
          <SeedBadge seed={game.favorite.seed} />
          <span className={`flex-1 text-[15px] font-medium truncate ${
            game.result === "win" ? "text-tertiary" : "text-foreground"
          }`}>
            {schoolName(game.favorite.name)}
          </span>
          {showScores && (
            <span className={`text-[17px] font-semibold tabular-nums ${
              game.result === "win" ? "text-tertiary" : "text-foreground"
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
            game.result === "loss" ? "text-tertiary" : "text-foreground"
          }`}>
            {schoolName(game.underdog.name)}
          </span>
          {showScores && (
            <span className={`text-[17px] font-bold tabular-nums text-foreground`}>
              {game.underdog.score ?? "-"}
            </span>
          )}
        </div>
      </div>

      {hasOdds && (
        <div className="flex items-center justify-between px-4 pt-2 pb-3 text-[13px]">
          <span className="font-semibold text-ios-blue tabular-nums">
            ML {formatOdds(game.underdog.odds)}
          </span>
          <span className="text-tertiary tabular-nums">
            ${UNIT_SIZE}/person
          </span>
          {profit !== null && (
            <span className={`font-semibold tabular-nums ${profit >= 0 ? "text-ios-green" : "text-ios-red"}`}>
              {formatMoney(profit)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Static Cumulative P/L Chart ── */

interface ChartPoint {
  label: string;
  cumulative: number;
  gamePL: number;
  won: boolean;
  date: string;
  odds: number;
}

function PLChart({ games }: { games: ApiGame[] }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const chartWrapRef = useRef<HTMLDivElement>(null);

  const settled = games
    .filter((g) => g.result === "win" || g.result === "loss")
    .sort((a, b) => new Date(a.commence_time).getTime() - new Date(b.commence_time).getTime());

  if (settled.length === 0) {
    return (
      <div className="bg-card rounded-2xl shadow-card overflow-hidden">
        <div className="px-4 pt-4 pb-2">
          <h3 className="text-[15px] font-semibold">Cumulative P/L</h3>
          <p className="text-[12px] text-tertiary mt-0.5">No settled games yet</p>
        </div>
      </div>
    );
  }

  const points: ChartPoint[] = [];
  let cumulative = 0;
  for (const g of settled) {
    const won = g.result === "win";
    const pl = won ? calcPayout(g.underdog.odds) : -UNIT_SIZE;
    cumulative += pl;
    points.push({
      label: schoolName(g.underdog.name),
      cumulative,
      gamePL: pl,
      won,
      date: formatDate(g.commence_time),
      odds: g.underdog.odds,
    });
  }

  const finalPL = points[points.length - 1].cumulative;
  const isPositive = finalPL >= 0;

  const N = points.length;
  const W_PER_GAME = Math.max(60, Math.min(90, 600 / N));
  const svgW = Math.max(N * W_PER_GAME + 120, 360);
  const H = 420;
  const PAD_L = 52;
  const PAD_R = 16;
  const PAD_T = 32;
  const PAD_B = 64;
  const chartW = svgW - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  const allVals = [0, ...points.map((p) => p.cumulative)];
  const rawMax = Math.max(Math.abs(Math.max(...allVals)), Math.abs(Math.min(...allVals)), 10);
  const yMax = Math.ceil(rawMax / 10) * 10;

  const toX = (i: number) => PAD_L + ((i + 1) / (N + 1)) * chartW;
  const toY = (val: number) => PAD_T + chartH / 2 - (val / yMax) * (chartH / 2);

  const zeroY = toY(0);
  const startX = PAD_L;
  const startY = toY(0);

  const pathParts = [`M${startX},${startY}`];
  for (let i = 0; i < N; i++) {
    pathParts.push(`L${toX(i)},${toY(points[i].cumulative)}`);
  }
  const linePath = pathParts.join("");
  const areaPath = `${linePath}L${toX(N - 1)},${zeroY}L${startX},${zeroY}Z`;

  const yTicks = [-yMax, -yMax / 2, 0, yMax / 2, yMax].filter((v) => Math.abs(v) <= yMax);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = chartWrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const xRel = e.clientX - rect.left;
    let closest = -1;
    let closestDist = Infinity;
    for (let i = 0; i < N; i++) {
      const dist = Math.abs(xRel - toX(i));
      if (dist < closestDist) {
        closestDist = dist;
        closest = i;
      }
    }
    setHoveredIndex(closestDist < 40 ? closest : null);
  };

  return (
    <div className="bg-card rounded-2xl shadow-card overflow-hidden">
      <div className="px-4 pt-4 pb-1">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className={`text-[28px] font-bold tabular-nums tracking-tight ${
              isPositive ? "text-ios-green" : finalPL < 0 ? "text-ios-red" : "text-foreground"
            }`}>
              {finalPL >= 0 ? "+" : ""}{finalPL.toFixed(2)} USD
            </p>
            <p className="text-[11px] text-tertiary mt-1">
              Final · {N} game{N !== 1 ? "s" : ""} settled
            </p>
          </div>
        </div>
      </div>

      <div
        ref={chartWrapRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredIndex(null)}
        className="relative px-2 pb-3"
      >
        <svg viewBox={`0 0 ${svgW} ${H}`} className="block w-full" style={{ maxHeight: H }}>
          {yTicks.map((v) => (
            <g key={v}>
              <line
                x1={PAD_L} y1={toY(v)} x2={svgW - PAD_R} y2={toY(v)}
                stroke={v === 0 ? "rgba(0,0,0,0.15)" : "rgba(0,0,0,0.06)"}
                strokeWidth={v === 0 ? 1.5 : 0.5}
              />
              <text
                x={PAD_L - 8} y={toY(v)} textAnchor="end" dominantBaseline="middle"
                fill="#8e8e93" fontSize="10" fontWeight="500"
              >
                {formatMoneyShort(v)}
              </text>
            </g>
          ))}

          <path d={areaPath} fill={isPositive ? "rgba(52,199,89,0.08)" : "rgba(255,59,48,0.08)"} />

          <path
            d={linePath} fill="none"
            stroke={isPositive ? "#34c759" : "#ff3b30"}
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          />

          {hoveredIndex !== null && (
            <g>
              <line
                x1={toX(hoveredIndex)} y1={PAD_T} x2={toX(hoveredIndex)} y2={H - PAD_B}
                stroke="#8e8e93" strokeWidth="1" strokeDasharray="4 3" opacity={0.8}
              />
            </g>
          )}

          {points.map((p, i) => {
            const cx = toX(i);
            const cy = toY(p.cumulative);
            const color = p.won ? "#34c759" : "#ff3b30";
            const isHovered = hoveredIndex === i;

            const above = cy < zeroY;
            const labelY = above ? cy - 10 : cy + 16;

            return (
              <g key={i}>
                <circle
                  cx={cx} cy={cy} r={isHovered ? 7 : 5}
                  fill={color} stroke="#fff" strokeWidth="2"
                />
                <text
                  x={cx} y={labelY}
                  textAnchor="middle" fill={color} fontSize="10" fontWeight="600"
                >
                  {p.label}
                </text>
              </g>
            );
          })}

          {/* X-axis date labels */}
          {(() => {
            let prevDate = "";
            return points.map((p, i) => {
              const showDate = p.date !== prevDate;
              prevDate = p.date;
              return showDate ? (
                <text
                  key={`date-${i}`}
                  x={toX(i)} y={H - PAD_B + 16} textAnchor="middle"
                  fill="#aeaeb2" fontSize="9" fontWeight="500"
                >
                  {p.date}
                </text>
              ) : null;
            });
          })()}
        </svg>

        {hoveredIndex !== null && (() => {
          const p = points[hoveredIndex];
          const cx = toX(hoveredIndex);
          const svgEl = chartWrapRef.current;
          if (!svgEl) return null;
          const wrapW = svgEl.clientWidth;
          const tooltipW = 140;
          const scaledX = (cx / svgW) * wrapW;
          const left = Math.max(4, Math.min(scaledX - tooltipW / 2, wrapW - tooltipW - 4));

          return (
            <div
              className="pointer-events-none absolute z-10 rounded-lg bg-[#2c2c2e] px-3 py-2 shadow-lg"
              style={{ left, top: 8, minWidth: tooltipW }}
            >
              <p className="text-[13px] font-semibold text-white">
                {p.label}{" "}
                <span className={p.won ? "text-ios-green" : "text-ios-red"}>
                  ({p.won ? "W" : "L"})
                </span>
              </p>
              <p className="text-[12px] text-gray-300 tabular-nums">
                ML {formatOdds(p.odds)} · {p.gamePL >= 0 ? "+" : ""}{p.gamePL.toFixed(2)}
              </p>
              <p className="text-[11px] text-gray-400 tabular-nums mt-0.5">
                Cumulative: {p.cumulative >= 0 ? "+" : ""}{p.cumulative.toFixed(2)}
              </p>
            </div>
          );
        })()}
      </div>

      <div className="flex items-center justify-center gap-4 px-4 pb-3 text-[11px] text-tertiary">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-ios-green" /> Win
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-ios-red" /> Loss
        </span>
      </div>
    </div>
  );
}

/* ── Main component ── */

export default function LiveTracker() {
  const [games, setGames] = useState<ApiGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/games");
        if (!res.ok) throw new Error("fetch failed");
        const data: GamesResponse = await res.json();
        setGames(data.games);
        setError(false);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const stats = getStats(games);
  const profitColor = stats.totalProfit > 0 ? "text-ios-green" : stats.totalProfit < 0 ? "text-ios-red" : undefined;

  const finalGames = games
    .filter((g) => g.status === "final")
    .sort((a, b) => new Date(b.commence_time).getTime() - new Date(a.commence_time).getTime());

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
            {loading && <span>Loading...</span>}
            {error && <span className="text-ios-red">Connection error</span>}
            {!loading && !error && <span>Tournament complete · {stats.total} games</span>}
          </div>
        </div>
      </div>

      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-4">
        <div className="mb-4">
          <PLChart games={games} />
        </div>

        {finalGames.length === 0 && !loading && (
          <div className="text-center py-24">
            <p className="text-[15px] text-secondary">No games found</p>
          </div>
        )}

        {finalGames.length > 0 && (
          <section className="mb-5">
            <div className="flex items-center justify-between px-1 mb-2">
              <h2 className="text-[13px] font-semibold text-secondary uppercase tracking-wide">Results</h2>
              <span className="text-[13px] font-medium text-tertiary tabular-nums">{finalGames.length}</span>
            </div>
            <div className="flex flex-col gap-2.5">
              {finalGames.map((game, i) => (
                <GameCard key={game.id} game={game} index={i} />
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  );
}
