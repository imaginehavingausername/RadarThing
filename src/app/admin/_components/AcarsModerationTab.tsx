"use client";

import { useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import Link from "next/link";
import { toast } from "sonner";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { ModerationControls } from "~/components/moderation/ModerationControls";
import { moderationErrorMessage } from "~/lib/moderation-error";

export function AcarsModerationTab() {
  const reports = usePaginatedQuery(
    api.acars.adminReports,
    {},
    { initialNumItems: 25 },
  );
  const blocked = usePaginatedQuery(
    api.acars.adminBlocked,
    {},
    { initialNumItems: 25 },
  );
  const remove = useMutation(api.acars.adminRemove);
  const review = useMutation(api.acars.markReportReviewed);
  const releaseDevice = useMutation(api.acars.adminReleaseDevice);
  const [releaseRtId, setReleaseRtId] = useState("");
  const [pilotSearch, setPilotSearch] = useState("");
  const matchingPilots = useQuery(
    api.moderation.searchTargets,
    pilotSearch.trim() ? { search: pilotSearch } : "skip",
  );

  return (
    <section className="space-y-8 text-white">
      <header>
        <h1 className="text-2xl font-semibold">ACARS moderation</h1>
        <p className="mt-2 text-sm text-slate-400">
          Review viewer reports and entries rejected by automatic screening.
        </p>
      </header>
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <label htmlFor="acars-pilot-search" className="text-sm font-medium">
          Find an RT account
        </label>
        <input
          id="acars-pilot-search"
          value={pilotSearch}
          onChange={(event) => setPilotSearch(event.target.value)}
          placeholder="Search Discord username or RT ID"
          className="mt-2 w-full rounded-lg border border-white/20 bg-black/20 px-3 py-2 text-sm outline-none focus:border-cyan-400"
        />
        {matchingPilots?.map((pilot) => (
          <div
            key={pilot._id}
            className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 py-3 last:border-0"
          >
            <Link
              href={`/pilot/${pilot._id}`}
              className="group block min-w-0 hover:underline"
              aria-label={`Open ${pilot.label}'s profile`}
            >
              <span className="block text-sm font-semibold break-all text-cyan-300">
                {pilot.label}
              </span>
              <span className="block text-xs break-all text-slate-400">
                RT ID: {pilot._id}
              </span>
            </Link>
            <button
              type="button"
              onClick={() => setReleaseRtId(pilot._id)}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/10"
            >
              Select for device release
            </button>
          </div>
        ))}
        {pilotSearch.trim() && matchingPilots?.length === 0 && (
          <p className="mt-3 text-sm text-slate-400">No matching accounts.</p>
        )}
      </div>
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <label htmlFor="acars-release-rt-id" className="text-sm font-medium">
          Release an ACARS device claim by RT ID
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            id="acars-release-rt-id"
            value={releaseRtId}
            onChange={(event) => setReleaseRtId(event.target.value.trim())}
            placeholder="RT ID"
            className="min-w-56 flex-1 rounded-lg border border-white/20 bg-black/20 px-3 py-2 text-sm"
          />
          <button
            disabled={!releaseRtId}
            className="rounded-lg border border-amber-400/30 px-3 py-2 text-xs text-amber-200 disabled:opacity-40"
            onClick={async () => {
              if (
                !window.confirm(
                  `Release the ACARS device claim for RT ID ${releaseRtId}?`,
                )
              )
                return;
              try {
                const count = await releaseDevice({
                  userId: releaseRtId as Id<"users">,
                });
                toast.success(
                  count ? "Device claim released" : "No device claim found",
                );
                setReleaseRtId("");
              } catch (error) {
                toast.error(
                  moderationErrorMessage(
                    error,
                    "Could not release the device claim. Check the RT ID and try again.",
                  ),
                );
              }
            }}
          >
            Release claim
          </button>
        </div>
      </div>
      <div>
        <h2 className="mb-3 font-mono text-xs font-bold tracking-widest text-cyan-300 uppercase">
          Viewer reports
        </h2>
        {reports.status === "LoadingFirstPage" ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : reports.results.length === 0 ? (
          <p className="text-sm text-slate-400">No reports.</p>
        ) : (
          <div className="space-y-3">
            {reports.results.map((item) => (
              <article
                key={item._id}
                className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    {item.pilotId ? (
                      <Link
                        href={`/pilot/${item.pilotId}`}
                        className="text-sm font-semibold break-all text-cyan-300 hover:underline"
                      >
                        {item.pilotLabel}
                      </Link>
                    ) : (
                      <p className="text-sm font-semibold">{item.pilotLabel}</p>
                    )}
                    <p className="mt-1 text-xs text-slate-400">
                      {new Date(item.createdAt).toLocaleString()} ·{" "}
                      {item.reviewedAt ? "Reviewed" : "Needs review"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {item.isMessagePresent &&
                      !item.moderationDisabledReason && (
                        <button
                          className="rounded-lg border border-red-400/20 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10"
                          onClick={async () => {
                            try {
                              await remove({ messageId: item.messageId });
                              toast.success("ACARS entry removed");
                            } catch (error) {
                              toast.error(
                                moderationErrorMessage(
                                  error,
                                  "Could not remove the ACARS entry. Please try again.",
                                ),
                              );
                            }
                          }}
                        >
                          Remove entry
                        </button>
                      )}
                    {!item.reviewedAt && (
                      <button
                        className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/10"
                        onClick={async () => {
                          try {
                            await review({ reportId: item._id });
                            toast.success("Report reviewed");
                          } catch (error) {
                            toast.error(
                              moderationErrorMessage(
                                error,
                                "Could not mark the report reviewed. Please try again.",
                              ),
                            );
                          }
                        }}
                      >
                        Mark reviewed
                      </button>
                    )}
                  </div>
                </div>
                <p className="mt-3 text-sm break-words whitespace-pre-wrap">
                  {item.body}
                </p>
                {!item.isMessagePresent && (
                  <p className="mt-1 text-xs text-slate-400">Entry removed</p>
                )}
                <p className="mt-2 text-xs text-amber-200">
                  Report: {item.reason}
                </p>
                {item.pilotId && (
                  <div className="mt-3">
                    <ModerationControls
                      userId={item.pilotId}
                      label={item.pilotLabel}
                      disabledReason={
                        item.moderationDisabledReason ?? undefined
                      }
                    />
                  </div>
                )}
              </article>
            ))}
            {reports.status === "CanLoadMore" && (
              <button
                className="text-sm text-cyan-300"
                onClick={() => reports.loadMore(25)}
              >
                Load older reports
              </button>
            )}
          </div>
        )}
      </div>
      <div>
        <h2 className="mb-3 font-mono text-xs font-bold tracking-widest text-cyan-300 uppercase">
          Automatically blocked
        </h2>
        {blocked.status === "LoadingFirstPage" ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : blocked.results.length === 0 ? (
          <p className="text-sm text-slate-400">No blocked entries.</p>
        ) : (
          <div className="space-y-3">
            {blocked.results.map((item) => (
              <article
                key={item._id}
                className="rounded-xl border border-amber-400/15 bg-amber-500/[0.04] p-4"
              >
                {item.userId ? (
                  <Link
                    href={`/pilot/${item.userId}`}
                    className="text-sm font-semibold break-all text-cyan-300 hover:underline"
                  >
                    {item.pilotLabel}
                  </Link>
                ) : (
                  <p className="text-sm font-semibold">{item.pilotLabel}</p>
                )}
                <p className="mt-1 text-xs text-slate-400">
                  {new Date(item.createdAt).toLocaleString()} ·{" "}
                  {item.categories.join(", ") || "Flagged"}
                </p>
                <p className="mt-3 text-sm break-words whitespace-pre-wrap">
                  {item.body}
                </p>
                {item.userId && (
                  <div className="mt-3">
                    <ModerationControls
                      userId={item.userId}
                      label={item.pilotLabel}
                      disabledReason={
                        item.moderationDisabledReason ?? undefined
                      }
                    />
                  </div>
                )}
              </article>
            ))}
            {blocked.status === "CanLoadMore" && (
              <button
                className="text-sm text-cyan-300"
                onClick={() => blocked.loadMore(25)}
              >
                Load older blocked entries
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
