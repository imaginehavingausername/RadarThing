import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";

export const metadata: Metadata = {
  title: "Live GeoFS Flight Radar",
  description:
    "Explore participating GeoFS flights on a live map, inspect flight paths and pilot profiles, and find airports and weather layers.",
  alternates: { canonical: "/radar" },
};

export default function RadarLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Suspense fallback={<div className="h-screen w-screen bg-[#081722]" />}>
        {children}
      </Suspense>
      <dialog
        id="radar-about"
        aria-labelledby="radar-about-title"
        className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[min(30rem,calc(100vw-2rem))] overflow-y-auto border border-cyan-300/30 bg-[#071923] p-0 text-slate-100 shadow-2xl backdrop:bg-black/60"
      >
        <form
          method="dialog"
          className="flex items-center justify-between gap-4 px-4 py-3"
        >
          <span className="font-mono text-xs tracking-widest text-cyan-200 uppercase">
            About this radar
          </span>
          <button className="cursor-pointer px-2 py-1 text-sm text-slate-300 hover:text-white focus-visible:outline-2 focus-visible:outline-cyan-300">
            Close
          </button>
        </form>
        <div className="border-t border-cyan-300/20 px-4 pt-4 pb-5 text-sm leading-6 text-slate-300">
          <h1
            id="radar-about-title"
            className="mb-3 text-xl font-semibold text-white"
          >
            Explore GeoFS traffic together
          </h1>
          <p>
            RadarThing shows flights from GeoFS pilots who have installed the
            RadarThing tracker and signed in to the simulator. Aircraft appear
            as their positions arrive; the map does not represent all GeoFS
            traffic or real-world aircraft.
          </p>
          <h2 className="mt-5 mb-2 font-semibold text-white">Find a flight</h2>
          <p>
            Select an aircraft to see its callsign, speed, altitude, route and
            recorded path. Search for a callsign, airport or pilot to focus the
            map. If a pilot is not visible, check their GeoFS sign-in and
            tracker connection before assuming their flight has ended.
          </p>
          <h2 className="mt-5 mb-2 font-semibold text-white">
            Revisit a route
          </h2>
          <p>
            Public pilot profiles show recorded flight totals and routes. A
            flight replay follows the positions captured during that session;
            gaps can occur when a tracker disconnects. Weather, airport and
            chart layers are provided for simulator use only.
          </p>
          <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 border-t border-white/10 pt-4 text-cyan-200">
            <Link href="/guides/using-the-radar" className="hover:underline">
              Radar guide ↗
            </Link>
            <Link
              href="/guides/aircraft-not-appearing"
              className="hover:underline"
            >
              Troubleshooting ↗
            </Link>
          </div>
        </div>
      </dialog>
    </>
  );
}
