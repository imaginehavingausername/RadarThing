import { notFound } from "next/navigation";
import { api, convex } from "~/server/convex";
import PilotClient from "./PilotClient";

export default async function PilotPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ callsign?: string }>;
}) {
  const { id } = await params;
  const { callsign } = await searchParams;
  const initialUser = await convex.query(api.users.getByProfileIdentifier, {
    profileIdentifier: id,
  });
  if (!initialUser) notFound();

  const initialStats = await convex.query(api.flights.getStatsById, {
    userId: initialUser._id,
  });
  if (!initialStats) notFound();

  return (
    <PilotClient
      initialUser={initialUser}
      initialStats={initialStats}
      profileIdentifier={id}
      callsignFromUrl={callsign ?? null}
    />
  );
}
