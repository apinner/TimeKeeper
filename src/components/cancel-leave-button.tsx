"use client";

import { useState, useTransition } from "react";
import { cancelLeaveRequest } from "@/lib/actions/leave";

export function CancelLeaveButton({ requestId }: { requestId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirming(true)}>
        Cancel
      </button>
    );
  }

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <div className="inline-flex gap-1">
        <button
          type="button"
          className="btn btn-danger btn-sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await cancelLeaveRequest(requestId);
              if (!result.ok) setError(result.error ?? "Could not cancel");
              setConfirming(false);
            })
          }
        >
          {pending ? "Cancelling…" : "Confirm"}
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setConfirming(false)}
          disabled={pending}
        >
          Keep
        </button>
      </div>
      {error ? <span className="text-xs text-[var(--color-negative)]">{error}</span> : null}
    </div>
  );
}
