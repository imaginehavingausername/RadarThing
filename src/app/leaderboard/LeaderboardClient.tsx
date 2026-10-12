"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import {
  ArrowLeft,
  ChevronDown,
  Clock,
  Flame,
  Flag,
  Navigation,
  Plane,
  Trophy,
  Upload,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { Analytics } from "~/lib/analytics";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { SystemThemeLogo } from "~/components/ui/SystemThemeLogo";
import { ChallengeDescription } from "~/components/challenges/ChallengeDescription";
import { getLeaderboardTabHref, type SortKey } from "./leaderboardTabs";

function formatFlightTime(ms: number): string {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function getActiveSortLabel(sortBy: SortKey): string {
  if (sortBy === "distance") return "Dist";
  if (sortBy === "time") return "Time";
  if (sortBy === "streak") return "Streak";
  if (sortBy === "contribution") return "Uploads";
  if (sortBy === "challenges") return "Challenge";
  return "Flights";
}

function formatChallengeWindow(startAt: number, endAt: number) {
  return `${new Date(startAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })} - ${new Date(endAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })}`;
}

function hasStartedChallengeEntry(entry: {
  progressCurrent: number;
  isComplete: boolean;
  status: "completed" | "in_progress" | "pending" | "rejected";
}) {
  return (
    entry.isComplete ||
    entry.status === "completed" ||
    entry.status === "pending" ||
    entry.status === "rejected" ||
    entry.progressCurrent > 0
  );
}

export default function LeaderboardClient({
  initialSort,
  initialLeaderboard,
}: {
  initialSort: SortKey;
  initialLeaderboard: FunctionReturnType<typeof api.flights.getLeaderboard>;
}) {
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const liveLeaderboard = useQuery(api.flights.getLeaderboard);
  const leaderboard = liveLeaderboard ?? initialLeaderboard;
  const challengeLeaderboard = useQuery(
    api.challenges.listActiveLeaderboard,
    {},
  );
  const dbUser = useQuery(
    api.users.getByClerkId,
    user?.id ? { clerkId: user.id } : "skip",
  );
  const [sortBy, setSortBy] = useState<SortKey>(initialSort);
  const [expandedChallengeIds, setExpandedChallengeIds] = useState<Set<string>>(
    new Set(),
  );

  const currentUserRef = useRef<HTMLButtonElement>(null);
  const hasActiveChallenge =
    challengeLeaderboard === undefined || challengeLeaderboard.length > 0;
  const sortOptions = [
    { key: "flights" as SortKey, label: "Flights", icon: Plane },
    {
      key: "distance" as SortKey,
      label: "Distance",
      icon: Navigation,
    },
    { key: "time" as SortKey, label: "Time", icon: Clock },
    { key: "streak" as SortKey, label: "Streak", icon: Flame },
    {
      key: "contribution" as SortKey,
      label: "Contribution",
      icon: Upload,
    },
    ...(hasActiveChallenge
      ? [
          {
            key: "challenges" as SortKey,
            label: "Challenges",
            icon: Flag,
          },
        ]
      : []),
  ];

  useEffect(() => {
    Analytics.leaderboardViewed();
  }, []);

  useEffect(() => {
    setSortBy(initialSort);
  }, [initialSort]);

  useEffect(() => {
    if (
      challengeLeaderboard !== undefined &&
      !hasActiveChallenge &&
      sortBy === "challenges"
    ) {
      setSortBy("flights");
      router.replace(getLeaderboardTabHref("flights"));
    }
  }, [challengeLeaderboard, hasActiveChallenge, router, sortBy]);

  const sorted = leaderboard
    ? [...leaderboard].sort((a, b) => {
        if (sortBy === "flights") return b.totalFlights - a.totalFlights;
        if (sortBy === "distance") return b.totalDistanceNm - a.totalDistanceNm;
        if (sortBy === "streak") return b.currentStreak - a.currentStreak;
        if (sortBy === "contribution") {
          return b.approvedAircraftImages - a.approvedAircraftImages;
        }
        return b.totalFlightTimeMs - a.totalFlightTimeMs;
      })
    : null;

  const currentUserRank =
    isLoaded && sorted
      ? sorted.findIndex((entry) => entry.clerkId === user?.id) + 1
      : 0;
  const currentUserEntry =
    isLoaded && sorted
      ? (sorted.find((entry) => entry.clerkId === user?.id) ?? null)
      : null;
  const visibleSorted = sorted?.slice(0, 10) ?? null;

  const scrollToCurrentUser = () => {
    currentUserRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  };

  const selectLeaderboardTab = (key: SortKey) => {
    setSortBy(key);
    router.push(getLeaderboardTabHref(key));

    if (key === "challenges") {
      Analytics.track("challenge_leaderboard_viewed", {
        challenge_count: challengeLeaderboard?.length ?? 0,
        source: "leaderboard_page",
      });
    }
  };

  return (
    <div className="leaderboard-theme-surface min-h-screen bg-[#0a0a0f] text-white">
      <header className="border-b border-white/10 bg-black/40 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 sm:py-5">
          <button
            onClick={() => router.push("/radar")}
            className="cursor-pointer"
          >
            <SystemThemeLogo alt="RadarThing" width={100} height={30} />
          </button>
          <button
            onClick={() => router.push("/radar")}
            className="flex cursor-pointer items-center gap-2 text-sm text-slate-400 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Map
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-6 flex items-center gap-3 sm:mb-8">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-amber-500/50 bg-amber-500/10 sm:h-12 sm:w-12">
            <Trophy className="h-4 w-4 text-amber-400 sm:h-5 sm:w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white sm:text-2xl">
              Leaderboard
            </h1>
            <p className="text-xs text-slate-500 sm:text-sm">
              Top pilots and approved aircraft image contributors on RadarThing
            </p>
          </div>
        </div>

        {sortBy !== "challenges" && currentUserEntry && currentUserRank > 0 && (
          <button
            onClick={scrollToCurrentUser}
            className="mb-6 flex w-full cursor-pointer items-center gap-3 rounded-xl border border-cyan-500/30 bg-cyan-500/[0.06] p-3 text-left transition-all hover:bg-cyan-500/[0.1] sm:gap-4 sm:p-4"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-cyan-500/40 bg-cyan-500/10 font-mono text-xs font-bold text-cyan-400 sm:h-9 sm:w-9 sm:text-sm">
              {currentUserRank}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-mono text-[10px] tracking-wider text-slate-500 uppercase sm:text-xs">
                Your Position
              </div>
              <div className="flex items-center gap-2">
                <span className="truncate font-mono text-xs font-bold text-white sm:text-sm">
                  {currentUserEntry.discordUsername ??
                    currentUserEntry.callsign}
                </span>
                {currentUserEntry.currentStreak > 0 && sortBy === "streak" && (
                  <div className="flex shrink-0 items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 sm:px-2">
                    <Flame className="h-3 w-3 text-amber-400" />
                    <span className="font-mono text-[10px] font-bold text-amber-400 sm:text-xs">
                      {currentUserEntry.currentStreak}d
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3 text-right sm:hidden">
              <div>
                <div className="font-mono text-[10px] text-slate-600 uppercase">
                  {getActiveSortLabel(sortBy)}
                </div>
                <div
                  title={
                    sortBy === "contribution"
                      ? `${currentUserEntry.approvedAircraftImages} approved aircraft images`
                      : undefined
                  }
                  className={`font-mono text-sm font-bold ${
                    sortBy === "streak"
                      ? "text-amber-400"
                      : sortBy === "contribution"
                        ? "text-emerald-400"
                        : "text-white"
                  }`}
                >
                  {sortBy === "flights"
                    ? currentUserEntry.totalFlights
                    : sortBy === "distance"
                      ? currentUserEntry.totalDistanceNm.toLocaleString()
                      : sortBy === "time"
                        ? formatFlightTime(currentUserEntry.totalFlightTimeMs)
                        : sortBy === "streak"
                          ? currentUserEntry.currentStreak > 0
                            ? `${currentUserEntry.currentStreak}d`
                            : "—"
                          : currentUserEntry.approvedAircraftImages}
                </div>
              </div>
              <ChevronDown className="h-4 w-4 text-cyan-400/60" />
            </div>
            <div className="hidden shrink-0 items-center gap-4 text-right sm:flex">
              <div>
                <div className="font-mono text-[10px] text-slate-600 uppercase">
                  Flights
                </div>
                <div className="font-mono text-sm font-bold text-white">
                  {currentUserEntry.totalFlights}
                </div>
              </div>
              <div>
                <div className="font-mono text-[10px] text-slate-600 uppercase">
                  Distance
                </div>
                <div className="font-mono text-sm font-bold text-white">
                  {currentUserEntry.totalDistanceNm.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="font-mono text-[10px] text-slate-600 uppercase">
                  Time
                </div>
                <div className="font-mono text-sm font-bold whitespace-nowrap text-white">
                  {formatFlightTime(currentUserEntry.totalFlightTimeMs)}
                </div>
              </div>
              <div>
                <div className="font-mono text-[10px] text-slate-600 uppercase">
                  Streak
                </div>
                <div className="font-mono text-sm font-bold text-amber-400">
                  {currentUserEntry.currentStreak > 0
                    ? `${currentUserEntry.currentStreak}d`
                    : "—"}
                </div>
              </div>
              <div>
                <div className="font-mono text-[10px] text-slate-600 uppercase">
                  Uploads
                </div>
                <div
                  title={`${currentUserEntry.approvedAircraftImages} approved aircraft images`}
                  className="font-mono text-sm font-bold text-emerald-400"
                >
                  {currentUserEntry.approvedAircraftImages}
                </div>
              </div>
              <ChevronDown className="h-4 w-4 text-cyan-400/60" />
            </div>
          </button>
        )}

        <div className="mb-6 sm:hidden">
          <Select
            value={sortBy}
            onValueChange={(value) => {
              selectLeaderboardTab(value as SortKey);
            }}
          >
            <SelectTrigger className="h-11 w-full rounded-xl border-white/10 bg-white/5 font-mono text-sm text-white shadow-none hover:bg-white/[0.07] focus-visible:border-cyan-500/50 focus-visible:ring-cyan-500/20">
              <SelectValue placeholder="Sort leaderboard" />
            </SelectTrigger>
            <SelectContent className="border-white/10 bg-[#12121a] text-white shadow-2xl">
              {sortOptions.map(({ key, label }) => (
                <SelectItem
                  key={key}
                  value={key}
                  className="font-mono text-sm text-slate-200 focus:bg-cyan-500/10 focus:text-cyan-200"
                >
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="mb-6 hidden sm:block">
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <div className="flex w-fit gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
              {sortOptions.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => {
                    selectLeaderboardTab(key);
                  }}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all sm:px-4 sm:py-2 sm:text-sm ${
                    sortBy === key
                      ? "bg-white/10 text-white"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  <Icon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {sortBy === "challenges" ? (
          challengeLeaderboard === undefined ? (
            <LeaderboardSkeleton />
          ) : challengeLeaderboard.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-black/40 p-12 text-center backdrop-blur-xl">
              <Flag className="mx-auto mb-4 h-12 w-12 text-slate-600" />
              <h3 className="mb-2 text-xl font-semibold text-white">
                No Active Challenges
              </h3>
              <p className="text-slate-400">
                Challenge rankings appear here whenever a challenge is live.
              </p>
            </div>
          ) : (
            <div
              className={
                challengeLeaderboard.length > 1
                  ? "grid gap-6 md:grid-cols-2"
                  : "space-y-6"
              }
            >
              {challengeLeaderboard.map((challenge) => {
                const visibleEntries = challenge.entries
                  .filter(hasStartedChallengeEntry)
                  .slice(0, 10);
                const shouldCollapseEntries = challengeLeaderboard.length > 2;
                const entriesOpen =
                  !shouldCollapseEntries ||
                  expandedChallengeIds.has(challenge.id);

                return (
                  <section
                    key={challenge.id}
                    className="min-w-0 rounded-2xl border border-white/10 bg-black/40 p-5 backdrop-blur-xl sm:p-6"
                  >
                    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-2xl font-bold text-white">
                          {challenge.title}
                        </h3>
                        <ChallengeDescription
                          description={challenge.description}
                          className="mt-2 text-sm text-slate-300"
                        />
                      </div>

                      <div className="flex items-center gap-1 text-xs text-slate-500">
                        <Clock className="h-3.5 w-3.5" />
                        <span>
                          {formatChallengeWindow(
                            challenge.startAt,
                            challenge.endAt,
                          )}
                        </span>
                      </div>
                    </div>

                    {shouldCollapseEntries && (
                      <button
                        type="button"
                        onClick={() => {
                          setExpandedChallengeIds((current) => {
                            const next = new Set(current);
                            if (next.has(challenge.id)) {
                              next.delete(challenge.id);
                            } else {
                              next.add(challenge.id);
                            }
                            return next;
                          });
                        }}
                        className="mb-4 flex w-full cursor-pointer items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-[10px] font-semibold tracking-wider text-slate-500 uppercase transition-all hover:border-white/15 hover:bg-white/[0.06]"
                      >
                        <span>
                          {entriesOpen ? "Hide Rankings" : "Show Rankings"}
                        </span>
                        <ChevronDown
                          className={`h-3.5 w-3.5 transition-transform ${
                            entriesOpen ? "rotate-180" : ""
                          }`}
                        />
                      </button>
                    )}

                    {entriesOpen && (
                      <>
                        <div className="flex items-center gap-3 px-3 pb-3 sm:gap-4 sm:px-4">
                          <div className="w-8 shrink-0 sm:w-9" />
                          <div className="min-w-0 flex-1 font-mono text-[10px] font-semibold tracking-wider text-slate-600 uppercase">
                            Pilot
                          </div>
                          <div className="w-20 shrink-0 text-right font-mono text-[10px] font-semibold tracking-wider text-slate-600 uppercase">
                            Progress
                          </div>
                        </div>

                        <div className="space-y-2">
                          {visibleEntries.map((entry, index) => {
                            const rank = index + 1;
                            const isTop3 = rank <= 3;
                            const isHighlighted = dbUser?._id === entry.userId;
                            const progressPercent = Math.min(
                              100,
                              Math.round(
                                (entry.progressCurrent /
                                  Math.max(1, entry.progressTarget)) *
                                  100,
                              ),
                            );
                            const medalColor =
                              rank === 1
                                ? "text-amber-400 border-amber-500/40 bg-amber-500/10"
                                : rank === 2
                                  ? "text-slate-300 border-slate-400/40 bg-slate-400/10"
                                  : rank === 3
                                    ? "text-orange-400 border-orange-500/40 bg-orange-500/10"
                                    : "";

                            return (
                              <button
                                key={entry.userId}
                                onClick={() =>
                                  router.push(`/pilot/${entry.userId}`)
                                }
                                className={`flex w-full cursor-pointer items-center gap-3 rounded-xl border p-3 text-left transition-all hover:border-cyan-500/30 hover:bg-white/10 sm:gap-4 sm:p-4 ${
                                  isHighlighted
                                    ? "border-cyan-500/40 bg-cyan-500/[0.08] ring-1 ring-cyan-500/20"
                                    : isTop3
                                      ? "border-white/10 bg-white/[0.04]"
                                      : "border-white/5 bg-white/[0.02]"
                                }`}
                              >
                                <div
                                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border font-mono text-xs font-bold sm:h-9 sm:w-9 sm:text-sm ${
                                    isTop3
                                      ? medalColor
                                      : "border-white/10 bg-white/5 text-slate-500"
                                  }`}
                                >
                                  {rank}
                                </div>

                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 sm:gap-2">
                                    <span className="truncate font-mono text-xs font-bold text-white sm:text-sm">
                                      {entry.displayName}
                                    </span>
                                    {isHighlighted && (
                                      <span className="shrink-0 rounded bg-cyan-500/20 px-1 py-0.5 font-mono text-[8px] font-bold text-cyan-400 sm:px-1.5 sm:text-[9px]">
                                        YOU
                                      </span>
                                    )}
                                  </div>
                                  {entry.callsign &&
                                    entry.callsign !== entry.displayName && (
                                      <p className="mt-1 font-mono text-[11px] text-slate-500">
                                        {entry.callsign}
                                      </p>
                                    )}
                                </div>

                                <div className="w-20 shrink-0 text-right">
                                  <div className="font-mono text-xs font-bold text-cyan-400 sm:text-sm">
                                    {progressPercent}%
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}

                    {visibleEntries.length === 0 && (
                      <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-sm text-slate-500">
                        No pilots have made progress yet.
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )
        ) : (
          <>
            {visibleSorted === null ? (
              <LeaderboardSkeleton />
            ) : visibleSorted.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-black/40 p-12 text-center backdrop-blur-xl">
                <Plane className="mx-auto mb-4 h-12 w-12 text-slate-600" />
                <h3 className="mb-2 text-xl font-semibold text-white">
                  No Pilots Yet
                </h3>
                <p className="text-slate-400">
                  Be the first to record a flight or get an aircraft image
                  approved.
                </p>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-3 px-3 pb-3 sm:gap-4 sm:px-4">
                  <div className="w-8 shrink-0 sm:w-9" />
                  <div className="min-w-0 flex-1 font-mono text-[10px] font-semibold tracking-wider text-slate-600 uppercase">
                    Pilot
                  </div>
                  <div className="w-14 shrink-0 text-right font-mono text-[10px] font-semibold tracking-wider text-slate-600 uppercase sm:hidden">
                    {getActiveSortLabel(sortBy)}
                  </div>
                  <div className="hidden shrink-0 items-center gap-6 sm:flex">
                    <div className="w-12 text-right font-mono text-[10px] font-semibold tracking-wider text-slate-600 uppercase">
                      Flights
                    </div>
                    <div className="w-16 text-right font-mono text-[10px] font-semibold tracking-wider text-slate-600 uppercase">
                      Distance
                    </div>
                    <div className="w-14 text-right font-mono text-[10px] font-semibold tracking-wider text-slate-600 uppercase">
                      Time
                    </div>
                    <div className="w-12 text-right font-mono text-[10px] font-semibold tracking-wider text-slate-600 uppercase">
                      Streak
                    </div>
                    <div className="w-14 text-right font-mono text-[10px] font-semibold tracking-wider text-slate-600 uppercase">
                      Uploads
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  {visibleSorted.map((entry, i) => {
                    const rank = i + 1;
                    const isTop3 = rank <= 3;
                    const isCurrentUser = user?.id === entry.clerkId;
                    const medalColor =
                      rank === 1
                        ? "text-amber-400 border-amber-500/40 bg-amber-500/10"
                        : rank === 2
                          ? "text-slate-300 border-slate-400/40 bg-slate-400/10"
                          : rank === 3
                            ? "text-orange-400 border-orange-500/40 bg-orange-500/10"
                            : "";

                    return (
                      <button
                        key={entry.userId}
                        ref={isCurrentUser ? currentUserRef : undefined}
                        onClick={() => router.push(`/pilot/${entry.userId}`)}
                        className={`flex w-full cursor-pointer items-center gap-3 rounded-xl border p-3 text-left transition-all hover:border-cyan-500/30 hover:bg-white/10 sm:gap-4 sm:p-4 ${
                          isCurrentUser
                            ? "border-cyan-500/40 bg-cyan-500/[0.08] ring-1 ring-cyan-500/20"
                            : isTop3
                              ? "border-white/10 bg-white/[0.04]"
                              : "border-white/5 bg-white/[0.02]"
                        }`}
                      >
                        <div
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border font-mono text-xs font-bold sm:h-9 sm:w-9 sm:text-sm ${
                            isTop3
                              ? medalColor
                              : "border-white/10 bg-white/5 text-slate-500"
                          }`}
                        >
                          {rank}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 sm:gap-2">
                            <span className="truncate font-mono text-xs font-bold text-white sm:text-sm">
                              {entry.discordUsername ?? entry.callsign}
                            </span>
                            {isCurrentUser && (
                              <span className="shrink-0 rounded bg-cyan-500/20 px-1 py-0.5 font-mono text-[8px] font-bold text-cyan-400 sm:px-1.5 sm:text-[9px]">
                                YOU
                              </span>
                            )}
                            {(entry.role === "PRO" ||
                              entry.role === "ADMIN") && (
                              <span className="shrink-0 rounded bg-emerald-500/20 px-1 py-0.5 font-mono text-[8px] font-bold text-emerald-400 sm:px-1.5 sm:text-[9px]">
                                PRO
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="w-14 shrink-0 text-right sm:hidden">
                          <div
                            title={
                              sortBy === "contribution"
                                ? `${entry.approvedAircraftImages} approved aircraft images`
                                : undefined
                            }
                            className={`font-mono text-xs font-bold ${
                              sortBy === "streak"
                                ? "text-amber-400"
                                : sortBy === "contribution"
                                  ? "text-emerald-400"
                                  : "text-cyan-400"
                            }`}
                          >
                            {sortBy === "flights"
                              ? entry.totalFlights
                              : sortBy === "distance"
                                ? entry.totalDistanceNm.toLocaleString()
                                : sortBy === "time"
                                  ? formatFlightTime(entry.totalFlightTimeMs)
                                  : sortBy === "streak"
                                    ? entry.currentStreak > 0
                                      ? `${entry.currentStreak}d`
                                      : "—"
                                    : entry.approvedAircraftImages}
                          </div>
                        </div>

                        <div className="hidden shrink-0 items-center gap-6 sm:flex">
                          <div
                            className={`w-12 text-right font-mono text-sm font-bold ${
                              sortBy === "flights"
                                ? "text-cyan-400"
                                : "text-white"
                            }`}
                          >
                            {entry.totalFlights}
                          </div>
                          <div
                            className={`w-16 text-right font-mono text-sm font-bold ${
                              sortBy === "distance"
                                ? "text-cyan-400"
                                : "text-white"
                            }`}
                          >
                            {entry.totalDistanceNm.toLocaleString()}
                          </div>
                          <div
                            className={`w-14 text-right font-mono text-sm font-bold whitespace-nowrap ${
                              sortBy === "time" ? "text-cyan-400" : "text-white"
                            }`}
                          >
                            {formatFlightTime(entry.totalFlightTimeMs)}
                          </div>
                          <div
                            className={`w-12 text-right font-mono text-sm font-bold ${
                              sortBy === "streak"
                                ? "text-cyan-400"
                                : "text-amber-400"
                            }`}
                          >
                            {entry.currentStreak > 0
                              ? `${entry.currentStreak}d`
                              : "—"}
                          </div>
                          <div
                            title={`${entry.approvedAircraftImages} approved aircraft images`}
                            className={`w-14 text-right font-mono text-sm font-bold ${
                              sortBy === "contribution"
                                ? "text-emerald-400"
                                : "text-white"
                            }`}
                          >
                            {entry.approvedAircraftImages}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
        <section className="mt-12 border-t border-white/10 pt-8 text-sm leading-7 text-slate-400">
          <h2 className="mb-2 text-lg font-semibold text-white">
            Reading the rankings
          </h2>
          <p className="max-w-3xl">
            These totals come from flights recorded by participating GeoFS
            pilots. Switch tabs to compare completed flights, distance, flight
            time, current streaks and approved aircraft image contributions.
            Select a pilot to inspect their public flight statistics and recent
            routes. Tracker gaps and excluded flights can affect totals; the
            rankings are a community view of simulator activity, not a measure
            of real-world flying experience.
          </p>
          <Link
            href="/guides/flight-history-and-replay"
            className="mt-3 inline-block text-cyan-300 hover:underline"
          >
            How flight history works ↗
          </Link>
        </section>
      </main>
    </div>
  );
}

function LeaderboardSkeleton() {
  return (
    <div className="space-y-2">
      {[...Array(8)].map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3 sm:gap-4 sm:p-4"
        >
          <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-white/10 sm:h-9 sm:w-9" />
          <div className="flex-1">
            <div className="h-4 w-20 animate-pulse rounded bg-white/10 sm:w-28" />
          </div>
          <div className="h-4 w-14 animate-pulse rounded bg-white/10 sm:hidden" />
          <div className="hidden items-center gap-6 sm:flex">
            <div className="h-4 w-12 animate-pulse rounded bg-white/10" />
            <div className="h-4 w-16 animate-pulse rounded bg-white/10" />
            <div className="h-4 w-14 animate-pulse rounded bg-white/10" />
            <div className="h-4 w-12 animate-pulse rounded bg-white/10" />
            <div className="h-4 w-14 animate-pulse rounded bg-white/10" />
          </div>
        </div>
      ))}
    </div>
  );
}
