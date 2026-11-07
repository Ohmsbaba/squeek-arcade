import type { Metadata } from "next";
import { LeaderboardPanel } from "@/components/community/LeaderboardPanel";

export const metadata: Metadata = { title: "Leaderboards" };

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-3xl p-3 sm:p-6">
      <LeaderboardPanel />
    </div>
  );
}
