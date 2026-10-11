"use client";

import { useState } from "react";
import { useMutation, usePaginatedQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "../../../../convex/_generated/api";
import { ModerationControls } from "~/components/moderation/ModerationControls";

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
  const [releaseGoogleId, setReleaseGoogleId] = useState("");

  return (
    <section className="space-y-8 text-white">
      <header>
        <h1 className="text-2xl font-semibold">ACARS moderation</h1>
        <p className="mt-2 text-sm text-slate-400">
          Review viewer reports and entries rejected by automatic screening.
        </p>
      </header>
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <label
          htmlFor="acars-release-google-id"
          className="text-sm font-medium"
        >
          Release a GeoFS device claim
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            id="acars-release-google-id"
            value={releaseGoogleId}
            onChange={(event) => setReleaseGoogleId(event.target.value.trim())}
            placeholder="GeoFS ID"
            className="min-w-56 flex-1 rounded-lg border border-white/20 bg-black/20 px-3 py-2 text-sm"
          />
          <button
            disabled={!/^\d{8,32}$/.test(releaseGoogleId)}
            className="rounded-lg border border-amber-400/30 px-3 py-2 text-xs text-amber-200 disabled:opacity-40"
            onClick={async () => {
              if (
                !window.confirm(
                  `Release the ACARS device claim for GeoFS ID ${releaseGoogleId}?`,
                )
              )
                return;
              try {
                const count = await releaseDevice({
                  googleId: releaseGoogleId,
                });
                toast.success(
                  count ? "Device claim released" : "No device claim found",
                );
                setReleaseGoogleId("");
              } catch {
                toast.error("Could not release device claim");
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
                    <p className="text-sm font-semibold">{item.pilotLabel}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {new Date(item.createdAt).toLocaleString()} ·{" "}
                      {item.reviewedAt ? "Reviewed" : "Needs review"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {item.isMessagePresent && (
                      <button
                        className="rounded-lg border border-red-400/20 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10"
                        onClick={async () => {
                          try {
                            await remove({ messageId: item.messageId });
                            toast.success("ACARS entry removed");
                          } catch (error) {
                            toast.error(
                              error instanceof Error
                                ? error.message
                                : "Removal failed",
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
                              error instanceof Error
                                ? error.message
                                : "Review failed",
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
                <p className="text-sm font-semibold">{item.pilotLabel}</p>
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
