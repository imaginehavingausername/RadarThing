"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export function AcarsPanel({ googleId }: { googleId?: string }) {
  const { user } = useUser();
  const entries = useQuery(
    api.acars.listPublic,
    googleId ? { googleId } : "skip",
  );
  const report = useMutation(api.acars.report);
  const [reportingId, setReportingId] = useState<Id<"acarsMessages"> | null>(
    null,
  );
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  if (!entries?.length) return null;

  async function submitReport(messageId: Id<"acarsMessages">) {
    if (!reason.trim()) return;
    setBusy(true);
    try {
      await report({ messageId, reason: reason.trim() });
      toast.success("ACARS report sent to admins");
      setReportingId(null);
      setReason("");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not send report",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="Pilot ACARS"
      className="mb-3 rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.06] p-3.5 shadow-lg"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="font-mono text-[10px] font-black tracking-[0.2em] text-cyan-300 uppercase">
          Pilot ACARS
        </h2>
        <span className="font-mono text-[9px] text-white/35">Latest first</span>
      </div>
      <div className="max-h-64 space-y-2 overflow-y-auto">
        {entries.map((entry) => (
          <article
            key={entry._id}
            className="rounded-xl border border-white/10 bg-black/35 p-3"
          >
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <time
                className="font-mono text-[9px] text-cyan-300/70"
                dateTime={new Date(entry.createdAt).toISOString()}
              >
                {new Date(entry.createdAt).toLocaleString()}
              </time>
              <button
                type="button"
                className="cursor-pointer font-mono text-[9px] text-white/35 hover:text-amber-300"
                onClick={() => {
                  if (!user)
                    return toast.error("Sign in to report an ACARS entry");
                  setReportingId(reportingId === entry._id ? null : entry._id);
                  setReason("");
                }}
              >
                Report
              </button>
            </div>
            <p className="font-mono text-[11px] leading-relaxed break-words whitespace-pre-wrap text-white/85">
              {entry.body}
            </p>
            {reportingId === entry._id && (
              <form
                className="mt-3 space-y-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitReport(entry._id);
                }}
              >
                <label
                  className="block font-mono text-[9px] text-white/60"
                  htmlFor={`acars-report-${entry._id}`}
                >
                  Why are you reporting this?
                </label>
                <textarea
                  id={`acars-report-${entry._id}`}
                  value={reason}
                  maxLength={2000}
                  onChange={(event) => setReason(event.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-black/40 p-2 text-xs text-white outline-none focus:border-cyan-400"
                  rows={2}
                />
                <button
                  type="submit"
                  disabled={busy || !reason.trim()}
                  className="rounded-lg border border-amber-400/25 bg-amber-500/10 px-3 py-1.5 font-mono text-[9px] font-bold text-amber-200 disabled:opacity-40"
                >
                  Send report
                </button>
              </form>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
