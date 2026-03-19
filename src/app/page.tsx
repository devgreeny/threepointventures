import LiveTracker from "@/components/live-tracker";

export default function Home() {
  return (
    <div className="flex flex-col min-h-full">
      <header className="bg-card">
        <div className="mx-auto max-w-lg px-5 pt-14 pb-4 text-center">
          <h1 className="text-[20px] font-bold tracking-tight">
            3pt Ventures
          </h1>
        </div>
      </header>

      <LiveTracker />

      <footer className="mt-auto py-8 text-center">
        <p className="text-[12px] text-tertiary leading-relaxed">
          3PT Ventures © 2025 · For entertainment only
          <br />
          Live scores via ESPN · Odds via DraftKings
        </p>
      </footer>
    </div>
  );
}
