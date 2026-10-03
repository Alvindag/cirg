"use client";

import { useCallback, useEffect, useState } from "react";

import { dasGet, DasApiError, type Query } from "./client";
import { useDas } from "./context";

type State<T> = { data?: T; error?: string; loading: boolean };

/**
 * Fetches `path` once the user is signed in. In demo or signed-out mode it
 * does nothing and `data` stays undefined, so callers fall back to sample data.
 * Pass `null` as the path to skip the request.
 *
 * `reload()` fetches again and keeps the old data on screen meanwhile.
 * `refreshMs` re-fetches quietly on an interval, only while the tab is visible.
 */
export function useDasQuery<T>(
  path: string | null,
  query?: Query,
  options: { refreshMs?: number } = {},
) {
  const { status, token, signOut } = useDas();
  const [state, setState] = useState<State<T>>({ loading: false });
  const [tick, setTick] = useState(0);
  const queryKey = JSON.stringify(query ?? {});
  const { refreshMs } = options;

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (status !== "live" || !token || !path) return;
    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true }));
    dasGet<T>(path, token, JSON.parse(queryKey), ctrl.signal)
      .then((data) => setState({ data, loading: false }))
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        if (e instanceof DasApiError && e.status === 401) signOut();
        setState((s) => ({
          ...s,
          loading: false,
          error: e instanceof Error ? e.message : "Request failed",
        }));
      });
    return () => ctrl.abort();
  }, [status, token, path, queryKey, tick, signOut]);

  useEffect(() => {
    if (!refreshMs) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") reload();
    }, refreshMs);
    return () => clearInterval(id);
  }, [refreshMs, reload]);

  return {
    data: state.data,
    error: state.error,
    loading: state.loading,
    live: status === "live" && state.data !== undefined,
    reload,
  };
}
