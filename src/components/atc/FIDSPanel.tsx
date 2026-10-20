"use client";

import { type PositionUpdate } from "~/lib/aircraft-store";
import { normalizeAircraftType } from "~/lib/utils";

interface Props {
  aircrafts: PositionUpdate[];
  onTrack: (aircraft: PositionUpdate) => void;
}

function isRadarThingTraffic(aircraft: PositionUpdate) {
  const source = aircraft.source ?? aircraft.trafficSource;
  if (typeof source === "string") {
    return (
      source.trim().toLowerCase().replace(/[\s_-]+/g, "") === "radarthing"
    );
  }

  return (
    typeof aircraft.navMode === "boolean" ||
    aircraft.speedMode === "knots" ||
    aircraft.speedMode === "mach" ||
    typeof aircraft.flapsPosition === "number" ||
    typeof aircraft.flapsMaxPosition === "number"
  );
}

export function FIDSPanel({ aircrafts, onTrack }: Props) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
        <h2 className="font-mono text-[11px] font-semibold tracking-[0.2em] text-cyan-400 uppercase">
          Live Flights
        </h2>
        <span className="rounded border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 font-mono text-[10px] text-cyan-300">
          {aircrafts.length}
        </span>
      </div>

      {/* Column headers */}
      <div className="grid shrink-0 grid-cols-[minmax(0,3fr)_minmax(0,3fr)_4rem_5.25rem] items-center gap-2 border-b border-white/10 px-4 py-1.5">
        <span className="font-mono text-[9px] tracking-wider text-white/30 uppercase">
          Flight
        </span>
        <span className="font-mono text-[9px] tracking-wider text-white/30 uppercase">
          Route
        </span>
        <span className="font-mono text-[9px] tracking-wider text-white/30 uppercase">
          Aircraft
        </span>
        <span />
      </div>

      <div className="custom-scrollbar flex-1 overflow-y-auto">
        {aircrafts.map((ac, index) => (
          <FIDSRow
            key={ac.id ?? ac.callsign}
            aircraft={ac}
            onTrack={onTrack}
            index={index}
          />
        ))}
      </div>
    </div>
  );
}

function FIDSRow({
  aircraft,
  onTrack,
  index,
}: {
  aircraft: PositionUpdate;
  onTrack: (aircraft: PositionUpdate) => void;
  index: number;
}) {
  const showRadarThingDot = isRadarThingTraffic(aircraft);

  return (
    <div
      className="animate-fade-in-up grid grid-cols-[minmax(0,3fr)_minmax(0,3fr)_4rem_5.25rem] items-center gap-2 border-b border-white/5 px-4 py-2.5 text-xs transition-colors hover:bg-white/[0.03]"
      style={{ animationDelay: `${Math.min(index * 25, 500)}ms` }}
    >
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          {showRadarThingDot && (
            <span
              title="RadarThing SSE"
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.85)]"
            />
          )}
          <span className="truncate font-mono font-bold text-cyan-300">
            {aircraft.flightNo || aircraft.callsign || "—"}
          </span>
        </div>
        {aircraft.flightNo &&
          aircraft.callsign &&
          aircraft.flightNo !== aircraft.callsign && (
            <div className="truncate font-mono text-[10px] text-white/30">
              {aircraft.callsign}
            </div>
          )}
      </div>

      <div className="min-w-0 truncate font-mono text-slate-400">
        {aircraft.departure || "UNK"} → {aircraft.arrival || "UNK"}
      </div>

      <div className="min-w-0 truncate font-mono text-white/40">
        {normalizeAircraftType(aircraft.type) || "—"}
      </div>

      <button
        onClick={() => onTrack(aircraft)}
        className="w-full shrink-0 cursor-pointer rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-[10px] tracking-wide text-cyan-300 uppercase transition-colors hover:bg-cyan-500/20"
      >
        Track
      </button>
    </div>
  );
}
