"use client";

import { useState } from "react";

import { dasEnabled } from "@/lib/das/config";
import { useDas } from "@/lib/das/context";
import { checkPastedToken } from "@/lib/das/token";
import { cn, focusRing } from "@/lib/utils";

export default function ConnectPage() {
  const { status, me, error, signIn, signOut } = useDas();
  const [raw, setRaw] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  function connect(e: React.FormEvent) {
    e.preventDefault();
    const check = checkPastedToken(raw);
    if (!check.ok) return setProblem(check.message);
    setProblem(null);
    setRaw("");
    signIn(check.token);
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-xl font-semibold tracking-tight">DAS Engage 360</h1>

      {!dasEnabled ? (
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">
          This dashboard is running on sample data. Set{" "}
          <code className="font-mono text-zinc-200">DAS_API_BASE_URL</code> and
          restart to connect it to a DAS Engage 360 API (see the README).
        </p>
      ) : status === "live" && me ? (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-zinc-300">
            Signed in as <strong>{me.fullName}</strong> ({me.role}). The
            dashboard is showing live data.
          </p>
          <button
            type="button"
            onClick={signOut}
            className={cn(
              "rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10",
              focusRing,
            )}
          >
            Sign out
          </button>
        </div>
      ) : (
        <form onSubmit={connect} className="mt-4 space-y-3">
          <p className="text-sm leading-relaxed text-zinc-400">
            Paste an access token for the API. Development tokens come from{" "}
            <code className="font-mono text-zinc-200">
              python3 scripts/dev-token.py --role Admin
            </code>{" "}
            in the DAS Engage 360 repo. The token stays in this tab only.
          </p>
          <label htmlFor="token" className="block text-sm text-zinc-300">
            Access token
          </label>
          <textarea
            id="token"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={4}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={!!(problem || error)}
            aria-describedby="token-problem"
            className={cn(
              "w-full rounded-lg border border-white/10 bg-white/5 p-3 font-mono text-xs text-zinc-100 placeholder:text-zinc-400",
              focusRing,
            )}
          />
          <p
            id="token-problem"
            role="alert"
            className="min-h-5 text-sm text-red-300"
          >
            {problem ?? error}
          </p>
          <button
            type="submit"
            disabled={status === "connecting"}
            className={cn(
              "rounded-lg bg-indigo-500/80 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50",
              focusRing,
            )}
          >
            {status === "connecting" ? "Connecting…" : "Connect"}
          </button>
        </form>
      )}
    </div>
  );
}
