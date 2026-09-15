"use client";

import { useState, useTransition } from "react";
import type { ConfigResult } from "@/lib/actions/configuration";

/**
 * A button inside an existing form that runs a server action against the values
 * currently on screen and reports the result, without saving them.
 */
export function ActionButton({
  action,
  label,
  busyLabel,
  className = "btn btn-secondary",
}: {
  action: (form: FormData) => Promise<ConfigResult>;
  label: string;
  busyLabel?: string;
  className?: string;
}) {
  const [result, setResult] = useState<ConfigResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-2">
      <button
        type="button"
        className={className}
        disabled={pending}
        onClick={(event) => {
          const form = event.currentTarget.closest("form");
          if (!form) return;
          const data = new FormData(form);
          setResult(null);
          startTransition(async () => setResult(await action(data)));
        }}
      >
        {pending ? (busyLabel ?? "Working…") : label}
      </button>

      {result ? (
        <div className={`notice ${result.ok ? "notice-success" : "notice-error"}`}>
          {result.message}
        </div>
      ) : null}
    </div>
  );
}
