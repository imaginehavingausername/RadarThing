"use client";

import { useState } from "react";
import { useMutation, usePaginatedQuery } from "convex/react";
import { Dialog } from "radix-ui";
import { AlertTriangle, Ban, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useProStatus } from "~/hooks/useProStatus";
import { moderationErrorMessage } from "~/lib/moderation-error";

export const moderationButton =
  "cursor-pointer rounded-md border border-white/15 px-3 py-2 text-sm transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40";

export function ModerationControls({
  userId,
  label,
  disabledReason,
}: {
  userId?: Id<"users">;
  label: string;
  disabledReason?: string;
}) {
  const { isAdminUser } = useProStatus();
  const [kind, setKind] = useState<"warn" | "ban" | null>(null);
  if (!isAdminUser) return null;
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button
          title={disabledReason}
          disabled={!userId || !!disabledReason}
          className={`${moderationButton} flex items-center gap-2 text-amber-300`}
          onClick={() => setKind("warn")}
        >
          <AlertTriangle size={14} />
          Warn
        </button>
        <button
          title={disabledReason}
          disabled={!userId || !!disabledReason}
          className={`${moderationButton} flex items-center gap-2 text-red-300`}
          onClick={() => setKind("ban")}
        >
          <Ban size={14} />
          Ban
        </button>
      </div>
      {disabledReason && (
        <p className="text-xs text-slate-400">{disabledReason}</p>
      )}
      {kind && userId && (
        <ModerationDialog
          key={`${userId}:${kind}`}
          userId={userId}
          label={label}
          kind={kind}
          onClose={() => setKind(null)}
        />
      )}
    </div>
  );
}

function ModerationDialog({
  userId,
  label,
  kind,
  onClose,
}: {
  userId: Id<"users">;
  label: string;
  kind: "warn" | "ban";
  onClose: () => void;
}) {
  const issue = useMutation(api.moderation.issue);
  const { results, status, loadMore } = usePaginatedQuery(
    api.moderation.targetHistory,
    { targetUserId: userId },
    { initialNumItems: 5 },
  );
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [requestId] = useState(() => crypto.randomUUID());
  const [submittedReason, setSubmittedReason] = useState<string | null>(null);
  const activeBan = results.some((r) => r.kind === "ban" && !r.revokedAt);
  async function submit() {
    setBusy(true);
    const finalReason = submittedReason ?? reason.trim();
    setSubmittedReason(finalReason);
    try {
      await issue({
        targetUserId: userId,
        kind,
        reason: finalReason,
        requestId,
      });
      toast.success(
        kind === "ban"
          ? "User banned. Email queued."
          : "Warning issued. Email queued.",
      );
      onClose();
    } catch (error) {
      toast.error(
        moderationErrorMessage(
          error,
          "Could not apply the moderation action. Please try again.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[1000] bg-black/75 backdrop-blur-sm" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-[1001] max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-white/15 bg-[#08151c] p-6 text-white shadow-2xl">
          <Dialog.Close
            disabled={busy}
            aria-label="Close"
            className="absolute top-4 right-4 cursor-pointer p-1"
          >
            <X size={18} />
          </Dialog.Close>
          <p className="mb-2 font-mono text-xs tracking-widest text-slate-400">
            ACCOUNT MODERATION
          </p>
          <Dialog.Title className="pr-6 text-xl font-semibold">
            {kind === "ban" ? "Ban" : "Warn"} {label}
          </Dialog.Title>
          <Dialog.Description className="mt-3 text-sm text-slate-300">
            {kind === "ban"
              ? "This blocks access until the super-admin lifts the ban. The user will receive an email."
              : "The user will receive an email and a warning popup on their next visit to RT."}{" "}
            Only the super-admin can reverse this action.
          </Dialog.Description>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
            className="mt-5 space-y-4"
          >
            <label className="block text-sm">
              Reason shared with the user
              <textarea
                required
                maxLength={2000}
                value={reason}
                disabled={busy || submittedReason !== null}
                onChange={(e) => setReason(e.target.value)}
                className="mt-2 min-h-28 w-full rounded-md border border-white/20 bg-black/30 p-3 outline-none focus:border-cyan-400"
                placeholder="Explain the rule broken and what happened."
              />
            </label>
            {activeBan && (
              <p className="text-sm text-red-300">
                This user is already banned.
              </p>
            )}
            <button
              disabled={
                busy ||
                !reason.trim() ||
                activeBan ||
                status === "LoadingFirstPage"
              }
              className={`${moderationButton} w-full ${kind === "ban" ? "bg-red-500/15 text-red-300" : "bg-amber-500/15 text-amber-300"}`}
            >
              {busy
                ? "Saving…"
                : submittedReason
                  ? "Retry submission"
                  : kind === "ban"
                    ? "Confirm ban"
                    : "Send warning"}
            </button>
          </form>
          <div className="mt-6 border-t border-white/10 pt-4">
            <h3 className="text-sm font-semibold">Previous actions</h3>
            {status === "LoadingFirstPage" ? (
              <p className="mt-2 text-sm text-slate-400">Loading history…</p>
            ) : !results.length ? (
              <p className="mt-2 text-sm text-slate-400">
                No previous warnings or bans.
              </p>
            ) : (
              results.map((record) => (
                <div
                  key={record._id}
                  className="mt-3 border-l border-white/20 pl-3 text-sm"
                >
                  <p className="text-slate-300">
                    {record.kind === "ban" ? "Ban" : "Warning"}
                    {record.revokedAt ? " · Overridden" : ""} ·{" "}
                    {new Date(record.createdAt).toLocaleString()}
                  </p>
                  <p className="mt-1 break-words whitespace-pre-wrap">
                    {record.reason}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    By {record.actorLabel}
                  </p>
                </div>
              ))
            )}
            {status === "CanLoadMore" && (
              <button
                onClick={() => loadMore(5)}
                className={`${moderationButton} mt-3`}
              >
                Older actions
              </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
