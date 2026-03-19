import LiveTracker from "@/components/live-tracker";

export default function Home() {
  return (
    <div className="flex flex-col min-h-full">
      {/* Hero */}
      <header className="relative overflow-hidden border-b border-card-border bg-gradient-to-b from-accent/5 to-transparent">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-accent/10 via-transparent to-transparent" />
        <div className="relative mx-auto max-w-3xl px-4 py-10 text-center sm:py-14">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-accent">
            3PT Ventures Presents
          </p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-5xl">
            All Dogs, All Day 🐶
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm text-pending sm:text-base">
            Every underdog moneyline. Every game. March Madness 2025.
            <br />
            Ride with us or laugh at us — either way, follow along.
          </p>
        </div>
      </header>

      <LiveTracker />

      {/* Footer */}
      <footer className="border-t border-card-border py-6 text-center">
        <p className="text-xs text-pending">
          3PT Ventures © 2025 · For entertainment only · Bet responsibly
          <br />
          <span className="text-pending/50">
            Live scores via ESPN · Updates every 30s during games
          </span>
        </p>
      </footer>
    </div>
  );
}
