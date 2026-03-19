"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { ApiGame, GamesResponse } from "@/app/api/games/route";

const UNIT_SIZE = 10;
const POLL_LIVE = 30_000;
const POLL_IDLE = 120_000;
const MINUTE_MS = 60_000;
const EV_SNAPSHOTS_KEY = "ev-tracker-snapshots";
const EV_SNAPSHOTS_RETENTION_MS = 7 * 24 * 60 * MINUTE_MS; // 7 days

export interface EVSnapshot {
  t: number;
  v: number;
}

function getEVSnapshotsLocal(): EVSnapshot[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(EV_SNAPSHOTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as EVSnapshot[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function appendEVSnapshotLocal(timestamp: number, value: number): void {
  if (typeof window === "undefined") return;
  const t = Math.floor(timestamp / MINUTE_MS) * MINUTE_MS;
  const snapshots = getEVSnapshotsLocal();
  const filtered = snapshots.filter((s) => s.t !== t);
  filtered.push({ t, v: value });
  filtered.sort((a, b) => a.t - b.t);
  const cutoff = Date.now() - EV_SNAPSHOTS_RETENTION_MS;
  const trimmed = filtered.filter((s) => s.t >= cutoff);
  try {
    localStorage.setItem(EV_SNAPSHOTS_KEY, JSON.stringify(trimmed));
  } catch {
    // quota or disabled
  }
}

async function fetchEVSnapshots(): Promise<EVSnapshot[]> {
  try {
    const res = await fetch("/api/ev-snapshots");
    if (!res.ok) return getEVSnapshotsLocal();
    const data = (await res.json()) as { snapshots?: EVSnapshot[] };
    return Array.isArray(data?.snapshots) ? data.snapshots : [];
  } catch {
    return getEVSnapshotsLocal();
  }
}

async function pushEVSnapshot(timestamp: number, value: number): Promise<EVSnapshot[] | null> {
  const t = Math.floor(timestamp / MINUTE_MS) * MINUTE_MS;
  try {
    const res = await fetch("/api/ev-snapshots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ t, v: value }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { snapshots?: EVSnapshot[] };
    return Array.isArray(data?.snapshots) ? data.snapshots : null;
  } catch {
    return null;
  }
}

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

/* ── EV Chart (Google Finance–style: timeframes, tooltip, reference line) ── */

type Timeframe = "1D" | "5D" | "7D" | "Max";

function EVChart({ games }: { games: ApiGame[] }) {
  const [now, setNow] = useState(0);
  const [snapshots, setSnapshots] = useState<EVSnapshot[]>([]);
  const [timeframe, setTimeframe] = useState<Timeframe>("1D");
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const chartWrapRef = useRef<HTMLDivElement>(null);
  const lastPostedMinuteRef = useRef<number>(0);

  useEffect(() => {
    setNow(Date.now());
    fetchEVSnapshots().then(setSnapshots);
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      fetchEVSnapshots().then(setSnapshots);
    }, MINUTE_MS);
    return () => clearInterval(id);
  }, []);

  const withOdds = games.filter((g) => g.underdog.odds !== 0 && g.commence_time);
  const startedGames = withOdds.filter((g) => g.status === "live" || g.status === "final");
  // Include live games even with 0 odds so the blue dot shows on the chart
  const anyLive = games.some((g) => g.status === "live");
  const gamesWithMarkers = games.filter(
    (g) => (g.status === "final" || g.status === "live") && g.commence_time
  );

  // Current cumulative EV from games (for live display and recording)
  const currentCumulativeEV = startedGames.length
    ? withOdds
        .filter((g) => new Date(g.commence_time).getTime() <= now)
        .reduce((sum, g) => sum + calcEV(g), 0)
    : 0;

  // Record a snapshot once per minute when we have started games (server-first, fallback to localStorage)
  useEffect(() => {
    if (startedGames.length === 0 || now === 0) return;
    const floored = Math.floor(now / MINUTE_MS) * MINUTE_MS;
    if (floored === lastPostedMinuteRef.current) return;
    lastPostedMinuteRef.current = floored;
    pushEVSnapshot(floored, currentCumulativeEV).then((serverSnapshots) => {
      if (serverSnapshots) setSnapshots(serverSnapshots);
      else {
        appendEVSnapshotLocal(floored, currentCumulativeEV);
        setSnapshots(getEVSnapshotsLocal());
      }
    });
  }, [now, currentCumulativeEV, startedGames.length]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
  }, [now, games, snapshots]);

  if (startedGames.length === 0) {
    return (
      <div className="bg-card rounded-2xl shadow-card overflow-hidden">
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-center justify-between">
            <h3 className="text-[15px] font-semibold">P/L Timeline</h3>
            <span className="text-[15px] font-bold tabular-nums text-foreground">$0.00</span>
          </div>
          <p className="text-[12px] text-tertiary mt-0.5">
            Live cumulative P/L · tracks every minute (stock-style)
          </p>
        </div>
        <div className="flex items-center justify-center py-10">
          <div className="text-center">
            <p className="text-[13px] text-secondary">Chart goes live at tipoff</p>
            <p className="text-[11px] text-tertiary mt-0.5">Values saved every minute for historical chart</p>
          </div>
        </div>
        <div className="flex items-center justify-center gap-4 px-4 pb-3 text-[11px] text-tertiary">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-ios-green" /> Win
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-ios-blue" /> Live
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-ios-red" /> Loss
          </span>
        </div>
      </div>
    );
  }

  const t0 = Math.min(
    ...startedGames.map((g) => new Date(g.commence_time).getTime()),
    snapshots.length ? snapshots[0].t : Infinity
  );
  const t0Aligned = Math.floor(t0 / MINUTE_MS) * MINUTE_MS;
  const tN = Math.floor(now / MINUTE_MS) * MINUTE_MS;

  const snapshotByMinute = new Map<number, number>();
  for (const s of snapshots) snapshotByMinute.set(s.t, s.v);

  interface Tick { time: number; cumulative: number; hasLive: boolean }
  const ticks: Tick[] = [];
  let lastV: number | undefined = undefined;

  for (let t = t0Aligned; t <= tN; t += MINUTE_MS) {
    const stored = snapshotByMinute.get(t);
    const isCurrentMinute = t === tN;
    const value: number =
      stored !== undefined ? stored
      : isCurrentMinute ? currentCumulativeEV
      : lastV ?? 0;
    lastV = value;
    ticks.push({
      time: t,
      cumulative: value,
      hasLive: isCurrentMinute && anyLive,
    });
  }

  if (ticks.length === 0) return null;

  // Filter by timeframe (Google-style range)
  const rangeMs =
    timeframe === "1D" ? 24 * 60 * MINUTE_MS
    : timeframe === "5D" ? 5 * 24 * 60 * MINUTE_MS
    : timeframe === "7D" ? 7 * 24 * 60 * MINUTE_MS
    : Infinity;
  const tStart = rangeMs === Infinity ? t0Aligned : Math.max(t0Aligned, tN - rangeMs);
  const ticksInRange = ticks.filter((t) => t.time >= tStart);
  const displayTicks = ticksInRange.length > 0 ? ticksInRange : ticks;
  const firstVal = displayTicks[0].cumulative;
  const lastVal = displayTicks[displayTicks.length - 1].cumulative;
  const change = lastVal - firstVal;
  const changePct = firstVal !== 0 ? (change / Math.abs(firstVal)) * 100 : (lastVal !== 0 ? 100 : 0);
  const isPositive = lastVal >= 0;

  const W_PER_MIN = 2;
  const svgW = Math.max(displayTicks.length * W_PER_MIN, 320);
  const H = 280;
  const PAD_L = 48;
  const PAD_R = 64;
  const PAD_T = 24;
  const PAD_B = 56;
  const chartW = svgW - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  const values = displayTicks.map((t) => t.cumulative);
  const rawMax = Math.max(Math.abs(Math.max(...values)), Math.abs(Math.min(...values)), 10);
  const yMax = Math.ceil(rawMax / 10) * 10;

  const toX = (i: number) => PAD_L + (displayTicks.length <= 1 ? chartW / 2 : (i / (displayTicks.length - 1)) * chartW);
  const toY = (val: number) => PAD_T + chartH / 2 - (val / yMax) * (chartH / 2);

  const zeroY = toY(0);

  // Downsample for SVG perf — max ~600 points in the path
  const step = Math.max(1, Math.floor(displayTicks.length / 600));
  const sampledIdx = displayTicks.map((_, i) => i).filter((i) => i % step === 0 || i === displayTicks.length - 1);

  const pathPoints = sampledIdx.map((i) => `${toX(i)},${toY(displayTicks[i].cumulative)}`);
  const linePath = `M${pathPoints.join("L")}`;
  const areaPath = `M${toX(sampledIdx[0])},${zeroY}L${pathPoints.join("L")}L${toX(sampledIdx[sampledIdx.length - 1])},${zeroY}Z`;

  const yTicks2 = [-yMax, -yMax / 2, 0, yMax / 2, yMax].filter((v) => Math.abs(v) <= yMax);

  // X-axis labels every 30 min (stock-style time axis)
  const HALF_HOUR = 30 * MINUTE_MS;
  const tFirst = displayTicks[0].time;
  const tLast = displayTicks[displayTicks.length - 1].time;
  const firstLabel = Math.ceil(tFirst / HALF_HOUR) * HALF_HOUR;
  const xLabels: { idx: number; label: string; dateLabel: string; isDay: boolean }[] = [];
  let prevDay = "";
  for (let t = firstLabel; t <= tLast; t += HALF_HOUR) {
    const idx = Math.round((t - tFirst) / MINUTE_MS);
    if (idx < 0 || idx >= displayTicks.length) continue;
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

  const lastUpdated = new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const tabs: Timeframe[] = ["1D", "5D", "7D", "Max"];

  const handleChartMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    const rect = scrollEl.getBoundingClientRect();
    const paddingLeft = 8;
    const xInContent = e.clientX - rect.left - paddingLeft + scrollEl.scrollLeft;
    const xInChart = xInContent - PAD_L;
    if (xInChart < 0 || xInChart > chartW) {
      setHoveredIndex(null);
      return;
    }
    const i = Math.round((xInChart / chartW) * (displayTicks.length - 1));
    const clamped = Math.max(0, Math.min(i, displayTicks.length - 1));
    setHoveredIndex(clamped);
  };

  const handleChartMouseLeave = () => setHoveredIndex(null);

  return (
    <div className="bg-card rounded-2xl shadow-card overflow-hidden">
      {/* Google-style header: large value, change %, timestamp */}
      <div className="px-4 pt-4 pb-1">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className={`text-[28px] font-bold tabular-nums tracking-tight ${
              isPositive ? "text-ios-green" : lastVal < 0 ? "text-ios-red" : "text-foreground"
            }`}>
              {lastVal >= 0 ? "+" : ""}{lastVal.toFixed(2)} USD
            </p>
            <p className={`text-[13px] mt-0.5 tabular-nums ${
              change >= 0 ? "text-ios-green" : "text-ios-red"
            }`}>
              {change >= 0 ? "+" : ""}{change.toFixed(2)} ({changePct >= 0 ? "+" : ""}{changePct.toFixed(1)}%) {change >= 0 ? "↑" : "↓"} {timeframe === "1D" ? "today" : timeframe.toLowerCase()}
            </p>
            <p className="text-[11px] text-tertiary mt-1">
              {lastUpdated}
              {snapshots.length > 0 && (
                <span className="ml-1">· {snapshots.length} point{snapshots.length !== 1 ? "s" : ""} recorded</span>
              )}
            </p>
          </div>
          {anyLive && (
            <span className="flex items-center gap-1.5 text-[12px] font-semibold text-ios-blue shrink-0">
              <span className="h-2 w-2 rounded-full bg-ios-blue animate-pulse" /> Live
            </span>
          )}
        </div>
      </div>

      {/* Timeframe tabs */}
      <div className="flex border-b border-separator px-4">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setTimeframe(tab)}
            className={`relative py-2.5 px-3 text-[13px] font-medium tabular-nums transition-colors ${
              timeframe === tab ? "text-foreground" : "text-tertiary"
            }`}
          >
            {tab}
            {timeframe === tab && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-ios-blue rounded-full" />
            )}
          </button>
        ))}
      </div>

      <div
        ref={chartWrapRef}
        onMouseMove={handleChartMouseMove}
        onMouseLeave={handleChartMouseLeave}
        className="relative"
      >
      <div ref={scrollRef} className="px-2 pb-3 overflow-x-auto">
        <div className="relative inline-block" style={{ width: svgW, minWidth: 320 }}>
        <svg viewBox={`0 0 ${svgW} ${H}`} className="block" style={{ width: svgW, minWidth: 320, height: H }}>
          {/* Y grid lines — stock-style light grid */}
          {yTicks2.map((v) => (
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

          {/* Previous close / session start reference line */}
          {displayTicks.length > 1 && (
            <g>
              <line
                x1={PAD_L} y1={toY(firstVal)} x2={svgW - PAD_R} y2={toY(firstVal)}
                stroke="rgba(128,128,128,0.5)" strokeWidth="1" strokeDasharray="4 3"
              />
              <text
                x={svgW - PAD_R + 4} y={toY(firstVal)} textAnchor="start" dominantBaseline="middle"
                fill="#8e8e93" fontSize="9" fontWeight="500"
              >
                Session start {firstVal >= 0 ? "+" : ""}{firstVal.toFixed(2)}
              </text>
            </g>
          )}

          {/* Area fill */}
          <path d={areaPath} fill={isPositive ? "rgba(52,199,89,0.08)" : "rgba(255,59,48,0.08)"} />

          {/* Line */}
          <path
            d={linePath} fill="none"
            stroke={isPositive ? "#34c759" : "#ff3b30"}
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          />

          {/* Hover: vertical dashed line + dot + tooltip */}
          {hoveredIndex !== null && (
            <g>
              <line
                x1={toX(hoveredIndex)} y1={PAD_T} x2={toX(hoveredIndex)} y2={H - PAD_B}
                stroke="#8e8e93" strokeWidth="1" strokeDasharray="4 3" opacity={0.8}
              />
              <circle
                cx={toX(hoveredIndex)} cy={toY(displayTicks[hoveredIndex].cumulative)} r={4}
                fill={isPositive ? "#34c759" : "#ff3b30"} stroke="#fff" strokeWidth="1.5"
              />
            </g>
          )}

          {/* Game dots on the line — includes live games (for blue dot) */}
          {(() => {
            const placed: { x: number; y: number; above: boolean }[] = [];
            return gamesWithMarkers.map((g, gi) => {
              const start = new Date(g.commence_time).getTime();
              const startIdx = displayTicks.findIndex((t) => t.time >= start);
              const idx = startIdx < 0 ? displayTicks.length - 1 : startIdx;
              if (idx < 0 || idx >= displayTicks.length) return null;
              const ev = calcEV(g);
              const won = g.result === "win";
              const live = g.status === "live";
              const color = live ? "#007aff" : won ? "#34c759" : "#ff3b30";
              const label = schoolName(g.underdog.name);
              const dotX = toX(idx);
              const dotY = toY(displayTicks[idx].cumulative);

              // Decide label position: prefer above line for wins, below for losses
              let above = dotY <= toY(0);
              // Check for label collisions with previously placed labels
              const tooClose = placed.some(
                (p) => Math.abs(p.x - dotX) < 45 && Math.abs(p.y - dotY) < 20 && p.above === above
              );
              if (tooClose) above = !above;
              const labelY = above ? dotY - 8 : dotY + 14;
              const evLabelY = above ? dotY - 17 : dotY + 23;
              placed.push({ x: dotX, y: dotY, above });

              // Clamp label x so it doesn't go off the edges
              const clampedX = Math.max(PAD_L + 20, Math.min(dotX, svgW - PAD_R - 20));

              return (
                <g key={`evt-${gi}`}>
                  <circle
                    cx={dotX} cy={dotY} r={4}
                    fill={color} stroke="#fff" strokeWidth="1.5"
                  />
                  {live && (
                    <circle
                      cx={dotX} cy={dotY} r={7}
                      fill="none" stroke="#007aff" strokeWidth="1.5" opacity="0.4"
                    />
                  )}
                  <text
                    x={clampedX} y={labelY}
                    textAnchor="middle" fill={color} fontSize="8" fontWeight="600"
                  >
                    {live ? label : won ? `${label} W` : `${label} L`}
                  </text>
                  {g.status === "final" && ev !== 0 && (
                    <text
                      x={clampedX} y={evLabelY}
                      textAnchor="middle" fill={color} fontSize="7" fontWeight="500" opacity="0.7"
                    >
                      {ev >= 0 ? `+$${ev.toFixed(0)}` : `-$${Math.abs(ev).toFixed(0)}`}
                    </text>
                  )}
                </g>
              );
            });
          })()}

          {/* Leading edge dot (when not hovering) */}
          {hoveredIndex === null && (
            <>
              <circle
                cx={toX(displayTicks.length - 1)} cy={toY(lastVal)} r={4}
                fill={anyLive ? "#007aff" : isPositive ? "#34c759" : "#ff3b30"}
              />
              {anyLive && (
                <circle
                  cx={toX(displayTicks.length - 1)} cy={toY(lastVal)} r={7}
                  fill="none" stroke="#007aff" strokeWidth="1.5" opacity="0.4"
                />
              )}
            </>
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

        {/* Floating tooltip (Google-style) */}
        {hoveredIndex !== null && (
          <div
            className="pointer-events-none absolute z-10 rounded-lg bg-[#2c2c2e] px-2.5 py-1.5 shadow-lg"
            style={{
              left: toX(hoveredIndex) - 44,
              top: toY(displayTicks[hoveredIndex].cumulative) - 36,
              minWidth: 88,
            }}
          >
            <p className="text-[12px] font-semibold tabular-nums text-white">
              {displayTicks[hoveredIndex].cumulative >= 0 ? "+" : ""}
              {displayTicks[hoveredIndex].cumulative.toFixed(2)} USD
            </p>
            <p className="text-[11px] text-tertiary">
              {new Date(displayTicks[hoveredIndex].time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </p>
          </div>
        )}
        </div>
      </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 px-4 pb-3 text-[11px] text-tertiary">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-ios-green" /> Win
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-ios-blue" /> Live
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-ios-red" /> Loss
        </span>
      </div>
    </div>
  );
}

/* ── Scores tab content ── */

function Countdown({ games }: { games: ApiGame[] }) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const upcoming = games
    .filter((g) => g.status === "upcoming" && g.commence_time)
    .sort((a, b) => new Date(a.commence_time).getTime() - new Date(b.commence_time).getTime());

  if (upcoming.length === 0 || now === 0) return null;

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

function ScoresTab({ games, stats, liveCount, lastUpdated, loading, error, oddsOutOfCredits, oddsRemaining }: {
  games: ApiGame[]; stats: ReturnType<typeof getStats>; liveCount: number;
  lastUpdated: string | null; loading: boolean; error: boolean;
  oddsOutOfCredits?: boolean; oddsRemaining?: number | null;
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
            {oddsOutOfCredits && <span className="text-ios-orange font-medium">Out of Odds API credits</span>}
            {error && !oddsOutOfCredits && <span className="text-ios-red">Connection error</span>}
            {oddsRemaining != null && !oddsOutOfCredits && (
              <span className="text-tertiary tabular-nums">{oddsRemaining} odds credits</span>
            )}
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
            <p className="text-[15px] text-secondary">No games found</p>
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

/* ── Main component ── */

export default function LiveTracker() {
  const [games, setGames] = useState<ApiGame[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const hasLiveRef = useRef(false);

  const [oddsOutOfCredits, setOddsOutOfCredits] = useState(false);
  const [oddsRemaining, setOddsRemaining] = useState<number | null>(null);

  const fetchGames = useCallback(async () => {
    try {
      const res = await fetch("/api/games");
      if (!res.ok) throw new Error("fetch failed");
      const data: GamesResponse = await res.json();
      setGames(applyTestData(data.games));
      setLastUpdated(new Date().toLocaleTimeString());
      hasLiveRef.current = data.games.some((g) => g.status === "live");
      setError(false);
      setOddsOutOfCredits(data.oddsOutOfCredits ?? false);
      setOddsRemaining(data.oddsRemaining ?? null);
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
    <ScoresTab
      games={games}
      stats={stats}
      liveCount={liveCount}
      lastUpdated={lastUpdated}
      loading={loading}
      error={error}
      oddsOutOfCredits={oddsOutOfCredits}
      oddsRemaining={oddsRemaining}
    />
  );
}
