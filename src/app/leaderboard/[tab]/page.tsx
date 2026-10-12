import { notFound } from "next/navigation";

import LeaderboardClient from "../LeaderboardClient";
import { isLeaderboardTab, tabToSortKey } from "../leaderboardTabs";
import { api, convex } from "~/server/convex";

export const revalidate = 60;

export default async function LeaderboardTabPage({
  params,
}: {
  params: Promise<{ tab: string }>;
}) {
  const { tab } = await params;

  if (!isLeaderboardTab(tab)) {
    notFound();
  }

  const initialLeaderboard = await convex.query(api.flights.getLeaderboard, {});
  return (
    <LeaderboardClient
      initialSort={tabToSortKey(tab)}
      initialLeaderboard={initialLeaderboard}
    />
  );
}
