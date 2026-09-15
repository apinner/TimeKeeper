"use client";

import { useState, useTransition } from "react";
import { decideLeaveRequest } from "@/lib/actions/leave";
import { decideTimesheet } from "@/lib/actions/timesheets";

export function DecisionForm({
  kind,
  id,
  approveLabel = "Approve",
  rejectLabel = "Reject",
}: {
  kind: "leave" | "timesheet";
  id: string;
  approveLabel?: string;
  rejectLabel?: string;
}) {
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function decide(approve: boolean) {
    setError(null);
    startTransition(async () => {
      const result =
        kind === "leave"
          ? await decideLeaveRequest({ requestId: id, approve, comment: comment.trim() || undefined })
          : await decideTimesheet({ timesheetId: id, approve, comment: comment.trim() || undefined });
      if (!result.ok) setError(result.error ?? "Could not record that decision");
    });
  }

  return (
    <div className="space-y-2">
      <label className="sr-only" htmlFor={`comment-${id}`}>
        Comment
      </label>
      <input
        id={`comment-${id}`}
        className="input"
        placeholder="Comment (optional, sent with the decision)"
        value={comment}
        disabled={pending}
        onChange={(event) => setComment(event.target.value)}
      />
      <div className="flex gap-2">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={pending}
          onClick={() => decide(true)}
        >
          {pending ? "Saving…" : approveLabel}
        </button>
        <button
          type="button"
          className="btn btn-danger btn-sm"
          disabled={pending}
          onClick={() => decide(false)}
        >
          {rejectLabel}
        </button>
      </div>
      {error ? <div className="notice notice-error">{error}</div> : null}
    </div>
  );
}
