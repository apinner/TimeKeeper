"use client";

import { useState, useTransition } from "react";
import {
  removeLocalPassword,
  setLocalPassword,
  unlockAccount,
  type ConfigResult,
} from "@/lib/actions/configuration";

interface Administrator {
  id: string;
  label: string;
  hasPassword: boolean;
  isLocked: boolean;
}

export function LocalPasswordForm({
  administrators,
  currentUserId,
}: {
  administrators: Administrator[];
  currentUserId: string;
}) {
  const [userId, setUserId] = useState(currentUserId);
  const [result, setResult] = useState<ConfigResult | null>(null);
  const [pending, startTransition] = useTransition();

  const selected = administrators.find((person) => person.id === userId);

  function run(action: (form: FormData) => Promise<ConfigResult>, form?: HTMLFormElement | null) {
    const data = form ? new FormData(form) : new FormData();
    data.set("userId", userId);
    setResult(null);
    startTransition(async () => setResult(await action(data)));
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        run(setLocalPassword, event.currentTarget);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="local-user">
            Administrator
          </label>
          <select
            id="local-user"
            className="select"
            value={userId}
            onChange={(event) => {
              setUserId(event.target.value);
              setResult(null);
            }}
          >
            {administrators.map((person) => (
              <option key={person.id} value={person.id}>
                {person.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="password">
            New password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            className="input"
            autoComplete="new-password"
          />
        </div>

        <div>
          <label className="label" htmlFor="confirm">
            Confirm
          </label>
          <input
            id="confirm"
            name="confirm"
            type="password"
            className="input"
            autoComplete="new-password"
          />
        </div>
      </div>

      <p className="hint">At least 12 characters.</p>

      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Working…" : selected?.hasPassword ? "Change password" : "Set password"}
        </button>

        {selected?.hasPassword ? (
          <button
            type="button"
            className="btn btn-danger"
            disabled={pending}
            onClick={() => run(removeLocalPassword)}
          >
            Remove password
          </button>
        ) : null}

        {selected?.isLocked ? (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={pending}
            onClick={() => run(unlockAccount)}
          >
            Unlock now
          </button>
        ) : null}
      </div>

      {result ? (
        <div className={`notice ${result.ok ? "notice-success" : "notice-error"}`}>
          {result.message}
        </div>
      ) : null}
    </form>
  );
}
