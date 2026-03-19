export type GameStatus = "upcoming" | "live" | "final";
export type BetResult = "win" | "loss" | "push" | "pending";

export interface Game {
  id: string;
  round: string;
  region: string;
  date: string;
  time: string;
  favorite: {
    name: string;
    seed: number;
    score?: number;
  };
  underdog: {
    name: string;
    seed: number;
    score?: number;
    odds: number; // American odds, e.g. +350
  };
  status: GameStatus;
  result: BetResult;
}

export const UNIT_SIZE = 10; // $10 per bet

// 2025 NCAA Tournament — All Underdog ML picks
// Update scores + status as games finish
export const games: Game[] = [
  // ─── FIRST FOUR ───
  {
    id: "ff-1",
    round: "First Four",
    region: "",
    date: "Mar 18",
    time: "6:40 PM",
    favorite: { name: "San Diego St", seed: 11, score: 86 },
    underdog: { name: "North Carolina", seed: 11, odds: +110, score: 78 },
    status: "final",
    result: "loss",
  },
  {
    id: "ff-2",
    round: "First Four",
    region: "",
    date: "Mar 18",
    time: "9:10 PM",
    favorite: { name: "Texas", seed: 11, score: undefined },
    underdog: { name: "Xavier", seed: 11, odds: +130, score: undefined },
    status: "upcoming",
    result: "pending",
  },
  {
    id: "ff-3",
    round: "First Four",
    region: "",
    date: "Mar 19",
    time: "6:40 PM",
    favorite: { name: "Alabama St", seed: 16 },
    underdog: { name: "Saint Francis", seed: 16, odds: +150 },
    status: "upcoming",
    result: "pending",
  },
  {
    id: "ff-4",
    round: "First Four",
    region: "",
    date: "Mar 19",
    time: "9:10 PM",
    favorite: { name: "American", seed: 16 },
    underdog: { name: "Mount St. Mary's", seed: 16, odds: +115 },
    status: "upcoming",
    result: "pending",
  },

  // ─── ROUND OF 64 — EAST ───
  {
    id: "r64-e-1",
    round: "Round of 64",
    region: "East",
    date: "Mar 20",
    time: "12:15 PM",
    favorite: { name: "Duke", seed: 1 },
    underdog: { name: "American / Mt St. Mary's", seed: 16, odds: +4500 },
    status: "upcoming",
    result: "pending",
  },
  {
    id: "r64-e-2",
    round: "Round of 64",
    region: "East",
    date: "Mar 20",
    time: "2:45 PM",
    favorite: { name: "Alabama", seed: 2 },
    underdog: { name: "Robert Morris", seed: 15, odds: +2200 },
    status: "upcoming",
    result: "pending",
  },
  {
    id: "r64-e-3",
    round: "Round of 64",
    region: "East",
    date: "Mar 21",
    time: "12:15 PM",
    favorite: { name: "Wisconsin", seed: 3 },
    underdog: { name: "Montana", seed: 14, odds: +900 },
    status: "upcoming",
    result: "pending",
  },
  {
    id: "r64-e-4",
    round: "Round of 64",
    region: "East",
    date: "Mar 21",
    time: "2:45 PM",
    favorite: { name: "Arizona", seed: 4 },
    underdog: { name: "Akron", seed: 13, odds: +650 },
    status: "upcoming",
    result: "pending",
  },
  {
    id: "r64-e-5",
    round: "Round of 64",
    region: "East",
    date: "Mar 20",
    time: "6:50 PM",
    favorite: { name: "Oregon", seed: 5 },
    underdog: { name: "Liberty", seed: 12, odds: +260 },
    status: "upcoming",
    result: "pending",
  },
  {
    id: "r64-e-6",
    round: "Round of 64",
    region: "East",
    date: "Mar 20",
    time: "9:20 PM",
    favorite: { name: "BYU", seed: 6 },
    underdog: { name: "VCU", seed: 11, odds: +175 },
    status: "upcoming",
    result: "pending",
  },
  {
    id: "r64-e-7",
    round: "Round of 64",
    region: "East",
    date: "Mar 21",
    time: "6:50 PM",
    favorite: { name: "Saint Mary's", seed: 7 },
    underdog: { name: "Vanderbilt", seed: 10, odds: +115 },
    status: "upcoming",
    result: "pending",
  },
  {
    id: "r64-e-8",
    round: "Round of 64",
    region: "East",
    date: "Mar 21",
    time: "9:20 PM",
    favorite: { name: "UConn", seed: 8 },
    underdog: { name: "Oklahoma", seed: 9, odds: +105 },
    status: "upcoming",
    result: "pending",
  },

  // ─── ROUND OF 64 — WEST ───
  {
    id: "r64-w-1",
    round: "Round of 64",
    region: "West",
    date: "Mar 21",
    time: "12:15 PM",
    favorite: { name: "Florida", seed: 1 },
    underdog: { name: "Norfolk State", seed: 16, odds: +5000 },
    status: "upcoming",
    result: "pending",
  },
  {
    id: "r64-w-2",
    round: "Round of 64",
    region: "West",
    date: "Mar 21",
    time: "2:45 PM",
    favorite: { name: "St. John's", seed: 2 },
    underdog: { name: "Omaha", seed: 15, odds: +2500 },
    status: "upcoming",
    result: "pending",
  },
  {
    id: "r64-w-3",
    round: "Round of 64",
    region: "West",
    date: "Mar 20",
    time: "12:15 PM",
    favorite: { name: "Texas Tech", seed: 3 },
    underdog: { name: "UNC Wilmington", seed: 14, odds: +1100 },
    status: "upcoming",
    result: "pending",
  },
  {
    id: "r64-w-4",
    round: "Round of 64",
    region: "West",
    date: "Mar 20",
    time: "2:45 PM",
    favorite: { name: "Maryland", seed: 4 },
    underdog: { name: "Grand Canyon", seed: 13, odds: +550 },
    status: "upcoming",
    result: "pending",
  },
  {
    id: "r64-w-5",
    round: "Round of 64",
    region: "West",
    date: "Mar 21",
    time: "6:50 PM",
    favorite: { name: "Memphis", seed: 5 },
    underdog: { name: "Colorado St", seed: 12, odds: +220 },
    status: "upcoming",
    result: "pending",
  },
  {
    id: "r64-w-6",
    round: "Round of 64",
    region: "West",
    date: "Mar 21",
    time: "9:20 PM",
    favorite: { name: "Missouri", seed: 6 },
    underdog: { name: "Drake", seed: 11, odds: +170 },
    status: "upcoming",
    result: "pending",
  },
  {
    id: "r64-w-7",
    round: "Round of 64",
    region: "West",
    date: "Mar 20",
    time: "6:50 PM",
    favorite: { name: "Kansas", seed: 7 },
    underdog: { name: "Arkansas", seed: 10, odds: +130 },
    status: "upcoming",
    result: "pending",
  },
  {
    id: "r64-w-8",
    round: "Round of 64",
    region: "West",
    date: "Mar 20",
    time: "9:20 PM",
    favorite: { name: "UCLA", seed: 8 },
    underdog: { name: "UC San Diego", seed: 9, odds: +145 },
    status: "upcoming",
    result: "pending",
  },

  // ─── ROUND OF 64 — SOUTH ───
  {
    id: "r64-s-1",
    round: "Round of 64",
    region: "South",
    date: "Mar 20",
    time: "12:15 PM",
    favorite: { name: "Auburn", seed: 1 },
    underdog: { name: "Alabama St / St Francis", seed: 16, odds: +6500 },
    status: "upcoming",
    result: "pending",
  },
  {
    id: "r64-s-2",
    round: "Round of 64",
    region: "South",
    date: "Mar 20",
    time: "2:45 PM",
    favorite: { name: "Michigan State", seed: 2 },
    underdog: { name: "Bryant", seed: 15, odds: +1800 },
    status: "upcoming",
    result: "pending",
  },
  {
    id: "r64-s-3",
    round: "Round of 64",
    region: "South",
    date: "Mar 21",
    time: "12:15 PM",
    favorite: { name: "Iowa State", seed: 3 },
    underdog: { name: "Lipscomb", seed: 14, odds: +1200 },
    status: "upcoming",
    result: "pending",
  },
  {
    id: "r64-s-4",
    round: "Round of 64",
    region: "South",
    date: "Mar 21",
    time: "2:45 PM",
    favorite: { name: "Texas A&M", seed: 4 },
    underdog: { name: "Yale", seed: 13, odds: +500 },
    status: "upcoming",
    result: "pending",
  },
  {
    id: "r64-s-5",
    round: "Round of 64",
    region: "South",
    date: "Mar 20",
    time: "6:50 PM",
    favorite: { name: "Michigan", seed: 5 },
    underdog: { name: "UC Irvine", seed: 12, odds: +280 },
    status: "upcoming",
    result: "pending",
  },
  {
    id: "r64-s-6",
    round: "Round of 64",
    region: "South",
    date: "Mar 20",
    time: "9:20 PM",
    favorite: { name: "Ole Miss", seed: 6 },
    underdog: { name: "San Diego St", seed: 11, odds: +200 },
    status: "upcoming",
    result: "pending",
  },
  {
    id: "r64-s-7",
    round: "Round of 64",
    region: "South",
    date: "Mar 21",
    time: "6:50 PM",
    favorite: { name: "Marquette", seed: 7 },
    underdog: { name: "New Mexico", seed: 10, odds: +155 },
    status: "upcoming",
    result: "pending",
  },
  {
    id: "r64-s-8",
    round: "Round of 64",
    region: "South",
    date: "Mar 21",
    time: "9:20 PM",
    favorite: { name: "Louisville", seed: 8 },
    underdog: { name: "Creighton", seed: 9, odds: +110 },
    status: "upcoming",
    result: "pending",
  },

  // ─── ROUND OF 64 — MIDWEST ───
  {
    id: "r64-m-1",
    round: "Round of 64",
    region: "Midwest",
    date: "Mar 21",
    time: "12:15 PM",
    favorite: { name: "Houston", seed: 1 },
    underdog: { name: "SIU Edwardsville", seed: 16, odds: +7500 },
    status: "upcoming",
    result: "pending",
  },
  {
    id: "r64-m-2",
    round: "Round of 64",
    region: "Midwest",
    date: "Mar 21",
    time: "2:45 PM",
    favorite: { name: "Tennessee", seed: 2 },
    underdog: { name: "Winthrop", seed: 15, odds: +2000 },
    status: "upcoming",
    result: "pending",
  },
  {
    id: "r64-m-3",
    round: "Round of 64",
    region: "Midwest",
    date: "Mar 20",
    time: "12:15 PM",
    favorite: { name: "Kentucky", seed: 3 },
    underdog: { name: "Troy", seed: 14, odds: +750 },
    status: "upcoming",
    result: "pending",
  },
  {
    id: "r64-m-4",
    round: "Round of 64",
    region: "Midwest",
    date: "Mar 20",
    time: "2:45 PM",
    favorite: { name: "Purdue", seed: 4 },
    underdog: { name: "High Point", seed: 13, odds: +700 },
    status: "upcoming",
    result: "pending",
  },
  {
    id: "r64-m-5",
    round: "Round of 64",
    region: "Midwest",
    date: "Mar 21",
    time: "6:50 PM",
    favorite: { name: "Clemson", seed: 5 },
    underdog: { name: "McNeese", seed: 12, odds: +240 },
    status: "upcoming",
    result: "pending",
  },
  {
    id: "r64-m-6",
    round: "Round of 64",
    region: "Midwest",
    date: "Mar 21",
    time: "9:20 PM",
    favorite: { name: "Illinois", seed: 6 },
    underdog: { name: "Texas / Xavier", seed: 11, odds: +185 },
    status: "upcoming",
    result: "pending",
  },
  {
    id: "r64-m-7",
    round: "Round of 64",
    region: "Midwest",
    date: "Mar 20",
    time: "6:50 PM",
    favorite: { name: "Gonzaga", seed: 7 },
    underdog: { name: "Georgia", seed: 10, odds: +145 },
    status: "upcoming",
    result: "pending",
  },
  {
    id: "r64-m-8",
    round: "Round of 64",
    region: "Midwest",
    date: "Mar 20",
    time: "9:20 PM",
    favorite: { name: "Mississippi State", seed: 8 },
    underdog: { name: "Boise State", seed: 9, odds: +115 },
    status: "upcoming",
    result: "pending",
  },
];

// Helper to calculate payout from American odds
export function calcPayout(odds: number, unitSize: number): number {
  if (odds > 0) {
    return unitSize * (odds / 100);
  }
  return unitSize * (100 / Math.abs(odds));
}

export function getStats(gamesList: Game[]) {
  const settled = gamesList.filter((g) => g.result !== "pending");
  const wins = settled.filter((g) => g.result === "win");
  const losses = settled.filter((g) => g.result === "loss");

  let totalProfit = 0;
  for (const g of settled) {
    if (g.result === "win") {
      totalProfit += calcPayout(g.underdog.odds, UNIT_SIZE);
    } else if (g.result === "loss") {
      totalProfit -= UNIT_SIZE;
    }
  }

  const totalWagered = settled.length * UNIT_SIZE;
  const roi = totalWagered > 0 ? (totalProfit / totalWagered) * 100 : 0;

  return {
    totalGames: gamesList.length,
    settled: settled.length,
    wins: wins.length,
    losses: losses.length,
    pending: gamesList.length - settled.length,
    totalProfit,
    totalWagered,
    roi,
  };
}
