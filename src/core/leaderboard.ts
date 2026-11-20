import fs from "node:fs";
import path from "node:path";

interface Entry {
  name: string;
  score: number;
  nights_won: number;
  achieved_at: string;
  seed: number;
}

const FILE_PATH = path.resolve("leaderboard.json");

export function loadLeaderboard(): Entry[] {
  try {
    if (fs.existsSync(FILE_PATH)) {
      const data = JSON.parse(fs.readFileSync(FILE_PATH, "utf8"));
      if (Array.isArray(data.entries)) return data.entries;
    }
  } catch {
    // ignore error
  }
  return [];
}

export function saveLeaderboardEntry(entry: Entry): Entry[] {
  const list = loadLeaderboard();
  list.push(entry);
  list.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(a.achieved_at).getTime() - new Date(b.achieved_at).getTime();
  });
  const top10 = list.slice(0, 10);
  fs.writeFileSync(FILE_PATH, JSON.stringify({ entries: top10 }, null, 2) + "\n", "utf8");
  return top10;
}
