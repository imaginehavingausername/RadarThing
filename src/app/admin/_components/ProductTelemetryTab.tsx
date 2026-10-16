"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import {
  ArrowDownRight,
  ArrowUpRight,
  History,
  Radio,
  RefreshCw,
} from "lucide-react";
import { api } from "../../../../convex/_generated/api";

const RANGE_OPTIONS = [
  { days: 7, label: "7D" },
  { days: 30, label: "30D" },
  { days: 90, label: "90D" },
  { days: 365, label: "1Y" },
] as const;

const GRANULARITIES = [
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
] as const;

const TREND_METRICS = [
  { value: "flights", label: "Flights" },
  { value: "pilots", label: "Active pilots" },
  { value: "newPilots", label: "New pilots" },
  { value: "flightHours", label: "Flight hours" },
  { value: "newUsers", label: "Sign-ups" },
  { value: "livePeak", label: "Peak live" },
  { value: "imagesUploaded", label: "Images uploaded" },
  { value: "acarsMessages", label: "ACARS messages" },
] as const;

type Granularity = (typeof GRANULARITIES)[number]["value"];
type TrendMetric = (typeof TREND_METRICS)[number]["value"];

const numberFormat = new Intl.NumberFormat();
const compactFormat = new Intl.NumberFormat(undefined, {
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatValue(value: number, metric?: TrendMetric) {
  if (metric === "flightHours") {
    return value >= 100
      ? numberFormat.format(Math.round(value))
      : value.toFixed(1);
  }
  return numberFormat.format(Math.round(value));
}

function formatUtcTime(value: number) {
  const date = new Date(value);
  return `${String(date.getUTCHours()).padStart(2, "0")}${String(
    date.getUTCMinutes(),
  ).padStart(2, "0")}z`;
}

function formatUtcDate(value: number, granularity: Granularity = "day") {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: "UTC",
    ...(granularity === "month"
      ? { month: "short", year: "2-digit" }
      : { month: "short", day: "numeric" }),
  }).format(new Date(value));
}

function formatRelative(value: number | null) {
  if (!value) return "never";
  const minutes = Math.round((Date.now() - value) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function ProductTelemetryTab({
  canRunSuperAdminQueries,
}: {
  canRunSuperAdminQueries: boolean;
}) {
  const [rangeDays, setRangeDays] = useState<number>(30);
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [metric, setMetric] = useState<TrendMetric>("flights");
  const [pendingAction, setPendingAction] = useState<
    "refresh" | "rebuild" | null
  >(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const dashboard = useQuery(
    api.telemetry.getDashboard,
    canRunSuperAdminQueries ? { rangeDays } : "skip",
  );
  const totals = useQuery(
    api.telemetry.getTotals,
    canRunSuperAdminQueries ? {} : "skip",
  );
  const live = useQuery(
    api.telemetry.getLive,
    canRunSuperAdminQueries ? {} : "skip",
  );
  const refreshToday = useMutation(api.telemetry.refreshToday);
  const rebuildHistory = useMutation(api.telemetry.rebuildHistory);

  const runAction = async (action: "refresh" | "rebuild") => {
    setPendingAction(action);
    setActionMessage(null);
    try {
      if (action === "refresh") {
        await refreshToday({});
        setActionMessage("Recounting today. Numbers update in a few seconds.");
      } else {
        const { fromDay } = await rebuildHistory({});
        setActionMessage(
          `Rebuilding every day since ${fromDay}. This runs in the background and can take a few minutes.`,
        );
      }
    } catch (error) {
      setActionMessage(
        error instanceof ConvexError
          ? String(error.data)
          : "Something went wrong. Check the Convex logs.",
      );
    } finally {
      setPendingAction(null);
    }
  };

  const trendPoints = useMemo(() => {
    if (!dashboard) return [];
    return dashboard.series[granularity].map((point) => ({
      start: point.start,
      value: point[metric],
    }));
  }, [dashboard, granularity, metric]);

  if (dashboard === undefined || totals === undefined || live === undefined) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
      </div>
    );
  }

  if (dashboard === null || totals === null || live === null) {
    return (
      <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
        Super-admin access is required to view telemetry.
      </div>
    );
  }

  const { previous, engagement } = dashboard;
  const { snapshot } = totals;
  const storedPeak = snapshot?.allTimePeak ?? { peak: 0, at: null };
  // Day rollups get live peaks at the nightly reconcile; fold in today's.
  const current = {
    ...dashboard.current,
    livePeak: Math.max(dashboard.current.livePeak, live.todayPeak),
  };
  const allTimePeak =
    live.todayPeak > storedPeak.peak
      ? { peak: live.todayPeak, at: live.todayPeakAt }
      : storedPeak;
  const rangeLabel =
    RANGE_OPTIONS.find((option) => option.days === rangeDays)?.label ?? "";
  const avgFlightMinutes = current.flights
    ? (current.flightHours * 60) / current.flights
    : 0;
  const liveIsStale =
    !live.currentAt || Date.now() - live.currentAt > 5 * 60_000;

  return (
    <div className="space-y-8">
      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedControl
          options={RANGE_OPTIONS.map((option) => ({
            value: option.days,
            label: option.label,
          }))}
          value={rangeDays}
          onChange={setRangeDays}
        />
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-slate-500">
            Reconciled {formatRelative(snapshot?.lastReconciledAt ?? null)}
          </span>
          <button
            type="button"
            disabled={pendingAction !== null}
            onClick={() => void runAction("refresh")}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300 transition-colors hover:border-cyan-500/40 hover:text-cyan-300 disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${pendingAction === "refresh" ? "animate-spin" : ""}`}
            />
            Recount today
          </button>
          <button
            type="button"
            disabled={pendingAction !== null}
            onClick={() => void runAction("rebuild")}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300 transition-colors hover:border-cyan-500/40 hover:text-cyan-300 disabled:opacity-50"
          >
            <History className="h-3.5 w-3.5" />
            Rebuild history
          </button>
        </div>
      </div>

      {actionMessage && (
        <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
          {actionMessage}
        </div>
      )}

      {!snapshot?.hasHistory && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Telemetry only counts flights saved since it was switched on. Click{" "}
          <strong>Rebuild history</strong> once to backfill every past day.
        </div>
      )}

      {/* Live */}
      <section>
        <SectionTitle
          title="Live"
          hint="Signed-in pilots currently connected to the radar, sampled every 30 seconds."
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
            <div className="flex items-center gap-2 text-xs tracking-wider text-slate-500 uppercase">
              <Radio
                className={`h-3.5 w-3.5 ${liveIsStale ? "text-slate-500" : "text-emerald-400"}`}
              />
              Live now
            </div>
            <div className="mt-2 text-3xl font-semibold text-white">
              {numberFormat.format(live.current)}
            </div>
            <div className="mt-1 font-mono text-xs text-slate-500">
              {live.currentAt
                ? `Updated ${formatRelative(live.currentAt)}${liveIsStale ? " (radar server may be offline)" : ""}`
                : "No samples yet"}
            </div>
          </div>
          <StatTile
            label="Peak today"
            value={numberFormat.format(live.todayPeak)}
            note={
              live.todayPeakAt ? `at ${formatUtcTime(live.todayPeakAt)}` : ""
            }
          />
          <StatTile
            label="All-time peak"
            value={numberFormat.format(allTimePeak.peak)}
            note={
              allTimePeak.at
                ? `${formatUtcDate(allTimePeak.at)} at ${formatUtcTime(allTimePeak.at)}`
                : "Recorded since telemetry started"
            }
          />
        </div>
        <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] p-4">
          <div className="mb-2 text-xs text-slate-400">
            Peak live flights per hour, last 48 hours (UTC)
          </div>
          <BarChart
            points={live.hours.map((hour) => ({
              start: hour.hourStart,
              value: hour.peak,
            }))}
            formatLabel={(start) =>
              `${formatUtcDate(start)} ${formatUtcTime(start)}`
            }
            formatTick={formatUtcTime}
            formatValueLabel={(value) => `${value} peak`}
            height={120}
          />
        </div>
      </section>

      {/* Range KPIs */}
      <section>
        <SectionTitle
          title={`Last ${rangeLabel}`}
          hint="Compared with the previous period of the same length. New pilots had no flight in the year before."
        />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiTile
            label="Flights"
            current={current.flights}
            previous={previous.flights}
          />
          <KpiTile
            label="Active pilots"
            current={current.pilots}
            previous={previous.pilots}
          />
          <KpiTile
            label="New pilots"
            current={current.newPilots}
            previous={previous.newPilots}
          />
          <KpiTile
            label="Flight hours"
            current={current.flightHours}
            previous={previous.flightHours}
            metric="flightHours"
          />
          <KpiTile
            label="Sign-ups"
            current={current.newUsers}
            previous={previous.newUsers}
          />
          <KpiTile
            label="Peak live"
            current={current.livePeak}
            previous={previous.livePeak}
          />
          <KpiTile
            label="Images uploaded"
            current={current.imagesUploaded}
            previous={previous.imagesUploaded}
          />
          <KpiTile
            label="ACARS messages"
            current={current.acarsMessages}
            previous={previous.acarsMessages}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs text-slate-500">
          <span>Avg flight {Math.round(avgFlightMinutes)} min</span>
          <span>{compactFormat.format(current.distanceNm)} nm flown</span>
          <span>
            {current.flights && current.pilots
              ? (current.flights / current.pilots).toFixed(1)
              : "0"}{" "}
            flights per pilot
          </span>
          <span>
            {numberFormat.format(current.chartsUploaded)} charts uploaded
          </span>
        </div>
      </section>

      {/* Trend */}
      <section>
        <SectionTitle title="Trend" />
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-1.5">
              {TREND_METRICS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setMetric(option.value)}
                  className={`cursor-pointer rounded-md px-2.5 py-1.5 text-xs transition-colors ${
                    metric === option.value
                      ? "bg-cyan-500/20 text-cyan-300"
                      : "bg-white/5 text-slate-400 hover:bg-white/10"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <SegmentedControl
              options={GRANULARITIES.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
              value={granularity}
              onChange={setGranularity}
            />
          </div>
          <BarChart
            points={trendPoints}
            formatLabel={(start) =>
              granularity === "week"
                ? `Week of ${formatUtcDate(start)}`
                : formatUtcDate(start, granularity)
            }
            formatTick={(start) => formatUtcDate(start, granularity)}
            formatValueLabel={(value) =>
              `${formatValue(value, metric)} ${
                TREND_METRICS.find(
                  (option) => option.value === metric,
                )?.label.toLowerCase() ?? ""
              }`
            }
            height={200}
          />
          {granularity === "day" && (
            <p className="mt-2 text-xs text-slate-500">
              Showing the selected {rangeLabel} range. Weekly and monthly views
              show longer history; the current period is still in progress.
            </p>
          )}
        </div>
      </section>

      {/* Engagement + retention */}
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <div className="min-w-0">
          <SectionTitle
            title="Engagement"
            hint="Unique pilots who saved at least one flight."
          />
          <div className="grid grid-cols-2 gap-3">
            <StatTile
              label="Today (DAU)"
              value={numberFormat.format(engagement.dau)}
            />
            <StatTile
              label="Last 7 days"
              value={numberFormat.format(engagement.wau)}
            />
            <StatTile
              label="Last 30 days"
              value={numberFormat.format(engagement.mau)}
            />
            <StatTile
              label="Stickiness"
              value={`${Math.round(engagement.stickiness * 100)}%`}
              note="Avg daily ÷ 30-day pilots"
            />
          </div>
          <div className="mt-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3">
            <div className="text-xs tracking-wider text-slate-500 uppercase">
              Pilots in last {rangeLabel}
            </div>
            <SplitBar
              left={{ label: "Returning", value: dashboard.returningPilots }}
              right={{ label: "New", value: current.newPilots }}
            />
          </div>
        </div>
        <div className="min-w-0">
          <SectionTitle
            title="Weekly retention"
            hint="Pilots grouped by the week of their first flight. Each cell is the share who flew again that many weeks later."
          />
          <RetentionTable cohorts={dashboard.retention.cohorts} />
        </div>
      </section>

      {/* Top lists */}
      <section className="grid gap-6 md:grid-cols-2">
        <div>
          <SectionTitle title={`Top aircraft, last ${rangeLabel}`} />
          <RankedList items={dashboard.top.aircraft} />
        </div>
        <div>
          <SectionTitle
            title={`Top airports, last ${rangeLabel}`}
            hint="Departures plus arrivals."
          />
          <RankedList items={dashboard.top.airports} />
        </div>
      </section>

      {/* Platform totals */}
      <section>
        <SectionTitle
          title="All time"
          hint={
            snapshot
              ? `Counted ${formatRelative(snapshot.updatedAt)}; refreshed hourly.`
              : undefined
          }
        />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label="Accounts"
            value={snapshot ? numberFormat.format(snapshot.users) : "—"}
            note={snapshot ? `${snapshot.bannedUsers} banned` : "Counting…"}
          />
          <StatTile
            label="PRO"
            value={
              snapshot
                ? numberFormat.format(snapshot.paidPro + snapshot.grantedPro)
                : "—"
            }
            note={
              snapshot
                ? `${snapshot.paidPro} paid · ${snapshot.grantedPro} granted`
                : "Counting…"
            }
          />
          <StatTile
            label="Flights"
            value={snapshot ? numberFormat.format(snapshot.flights) : "—"}
            note={
              snapshot
                ? `${numberFormat.format(snapshot.pilots)} pilots${snapshot.firstDay ? ` since ${snapshot.firstDay}` : ""}`
                : "Counting…"
            }
          />
          <StatTile
            label="Flight hours"
            value={
              snapshot
                ? numberFormat.format(Math.round(snapshot.flightHours))
                : "—"
            }
          />
          <StatTile
            label="Aircraft images"
            value={
              snapshot ? numberFormat.format(snapshot.approvedImages) : "—"
            }
            note={
              snapshot
                ? `${snapshot.pendingImages} pending review`
                : "Counting…"
            }
          />
        </div>
      </section>
    </div>
  );
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-sm font-semibold tracking-wider text-slate-300 uppercase">
        {title}
      </h2>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-white/10 bg-white/5 p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`cursor-pointer rounded-md px-3 py-1.5 font-mono text-xs transition-colors ${
            value === option.value
              ? "bg-cyan-500/20 text-cyan-300"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function StatTile({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
      <div className="text-xs tracking-wider text-slate-500 uppercase">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      {note && (
        <div className="mt-1 font-mono text-xs text-slate-500">{note}</div>
      )}
    </div>
  );
}

function KpiTile({
  label,
  current,
  previous,
  metric,
}: {
  label: string;
  current: number;
  previous: number;
  metric?: TrendMetric;
}) {
  const change = previous > 0 ? (current - previous) / previous : null;
  const isUp = change !== null && change > 0;
  const isDown = change !== null && change < 0;

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
      <div className="text-xs tracking-wider text-slate-500 uppercase">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-white">
        {formatValue(current, metric)}
      </div>
      <div className="mt-1 flex items-center gap-1 font-mono text-xs">
        {change === null ? (
          <span className="text-slate-500">
            {current > 0 ? "none in prior period" : "no activity"}
          </span>
        ) : (
          <>
            {isUp && <ArrowUpRight className="h-3.5 w-3.5 text-emerald-400" />}
            {isDown && <ArrowDownRight className="h-3.5 w-3.5 text-red-400" />}
            <span
              className={
                isUp
                  ? "text-emerald-300"
                  : isDown
                    ? "text-red-300"
                    : "text-slate-400"
              }
            >
              {change > 0 ? "+" : ""}
              {Math.round(change * 100)}%
            </span>
            <span className="text-slate-500">
              vs {formatValue(previous, metric)}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function BarChart({
  points,
  formatLabel,
  formatTick,
  formatValueLabel,
  height,
}: {
  points: { start: number; value: number }[];
  formatLabel: (start: number) => string;
  formatTick: (start: number) => string;
  formatValueLabel: (value: number) => string;
  height: number;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const max = Math.max(1, ...points.map((point) => point.value));
  const hoveredPoint = hovered !== null ? points[hovered] : undefined;
  const tickIndexes = new Set(
    points.length <= 1
      ? [0]
      : [0, Math.floor((points.length - 1) / 2), points.length - 1],
  );

  if (points.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-xs text-slate-500"
        style={{ height }}
      >
        No data yet
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 h-5 font-mono text-xs text-slate-300">
        {hoveredPoint ? (
          <>
            <span className="text-slate-500">
              {formatLabel(hoveredPoint.start)}:
            </span>{" "}
            {formatValueLabel(hoveredPoint.value)}
          </>
        ) : (
          <span className="text-slate-500">
            Max {formatValueLabel(max)}. Hover a bar for details.
          </span>
        )}
      </div>
      <div className="relative" style={{ height }}>
        <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-white/10" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-white/15" />
        <div
          className="absolute inset-0 flex items-end"
          style={{ gap: points.length > 120 ? 0 : points.length > 60 ? 1 : 2 }}
          onMouseLeave={() => setHovered(null)}
        >
          {points.map((point, index) => (
            <div
              key={point.start}
              className="flex h-full min-w-0 flex-1 cursor-default items-end"
              onMouseEnter={() => setHovered(index)}
            >
              <div
                className={`w-full rounded-t-[3px] transition-colors ${
                  hovered === index ? "bg-cyan-300" : "bg-cyan-500/70"
                }`}
                style={{
                  height: `${(point.value / max) * 100}%`,
                  minHeight: point.value > 0 ? 2 : 0,
                }}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="relative mt-1.5 h-4 font-mono text-[10px] text-slate-500">
        {points.map((point, index) =>
          tickIndexes.has(index) ? (
            <span
              key={point.start}
              className="absolute whitespace-nowrap"
              style={{
                left: `${((index + 0.5) / points.length) * 100}%`,
                transform:
                  index === 0
                    ? "translateX(0)"
                    : index === points.length - 1
                      ? "translateX(-100%)"
                      : "translateX(-50%)",
              }}
            >
              {formatTick(point.start)}
            </span>
          ) : null,
        )}
      </div>
    </div>
  );
}

function SplitBar({
  left,
  right,
}: {
  left: { label: string; value: number };
  right: { label: string; value: number };
}) {
  const total = left.value + right.value;
  const leftShare = total ? left.value / total : 0;

  return (
    <div className="mt-3">
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-white/5">
        {left.value > 0 && (
          <div
            className="h-full bg-cyan-500/80"
            style={{ width: `${leftShare * 100}%` }}
          />
        )}
        {right.value > 0 && <div className="h-full flex-1 bg-cyan-200/50" />}
      </div>
      <div className="mt-2 flex justify-between font-mono text-xs text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-cyan-500/80" />
          {left.label} {numberFormat.format(left.value)}
          {total ? ` (${Math.round(leftShare * 100)}%)` : ""}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-cyan-200/50" />
          {right.label} {numberFormat.format(right.value)}
        </span>
      </div>
    </div>
  );
}

function RetentionTable({
  cohorts,
}: {
  cohorts: {
    weekStart: number;
    size: number;
    retained: (number | null)[];
  }[];
}) {
  const weeks = cohorts[0]?.retained.length ?? 0;

  return (
    <div className="overflow-x-auto rounded-lg border border-white/10">
      <table className="w-full min-w-[480px] border-collapse font-mono text-xs">
        <thead>
          <tr className="text-slate-500">
            <th className="px-3 py-2 text-left font-normal">First week</th>
            <th className="px-2 py-2 text-right font-normal">Pilots</th>
            {Array.from({ length: weeks }, (_, index) => (
              <th key={index} className="px-1 py-2 text-center font-normal">
                W{index + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cohorts.map((cohort) => (
            <tr key={cohort.weekStart} className="border-t border-white/5">
              <td className="px-3 py-1.5 whitespace-nowrap text-slate-300">
                {formatUtcDate(cohort.weekStart)}
              </td>
              <td className="px-2 py-1.5 text-right text-slate-300">
                {cohort.size}
              </td>
              {cohort.retained.map((share, index) => (
                <td key={index} className="p-0.5">
                  {share === null ? (
                    <div className="h-7" />
                  ) : (
                    <div
                      className="flex h-7 items-center justify-center rounded text-white"
                      style={{
                        backgroundColor: `rgba(34, 211, 238, ${0.06 + share * 0.6})`,
                      }}
                      title={`${Math.round(share * 100)}% of ${cohort.size} pilots flew in week ${index + 1}`}
                    >
                      {Math.round(share * 100)}%
                    </div>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RankedList({ items }: { items: { name: string; count: number }[] }) {
  const max = Math.max(1, ...items.map((item) => item.count));

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-white/10 py-8 text-center text-xs text-slate-500">
        No flights in this range.
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {items.map((item) => (
        <div
          key={item.name}
          className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_3rem] items-center gap-3 text-xs"
        >
          <span className="truncate font-mono text-slate-300" title={item.name}>
            {item.name}
          </span>
          <div className="h-2 rounded-r-sm bg-white/5">
            <div
              className="h-full rounded-r-sm bg-cyan-500/70"
              style={{ width: `${(item.count / max) * 100}%` }}
            />
          </div>
          <span className="text-right font-mono text-slate-400">
            {numberFormat.format(item.count)}
          </span>
        </div>
      ))}
    </div>
  );
}
