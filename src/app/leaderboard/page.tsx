import LeaderboardClient from "./LeaderboardClient";
import { api, convex } from "~/server/convex";

export const revalidate = 60;

export default async function LeaderboardPage() {
  const initialLeaderboard = await convex.query(api.flights.getLeaderboard, {});
  return (
    <LeaderboardClient
      initialSort="flights"
      initialLeaderboard={initialLeaderboard}
    />
  );
}
