import { api, convex } from "~/server/convex";
import AircraftImagesClient from "./AircraftImagesClient";

export const revalidate = 60;

export default async function AircraftImagesPage() {
  const initialImages = (
    await convex.query(api.aircraftImages.getApproved, {})
  ).slice(0, 10);
  return <AircraftImagesClient initialImages={initialImages} />;
}
