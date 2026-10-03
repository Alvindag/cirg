"use client";

import { useEffect, useState } from "react";

import { dasGet, DasApiError, type Query } from "./client";
import { useDas } from "./context";

type State<T> = { data?: T; error?: string };

/**
 * Fetches `path` once the user is signed in. In demo or signed-out mode it
 * does nothing and `data` stays undefined, so callers fall back to sample data.
 * Pass `null` as the path to skip the request.
 */
export function useDasQuery<T>(path: string | null, query?: Query) {
  const { status, token, signOut } = useDas();
  const [state, setState] = useState<State<T>>({});
  const queryKey = JSON.stringify(query ?? {});

  useEffect(() => {
    if (status !== "live" || !token || !path) return;
    const ctrl = new AbortController();
    dasGet<T>(path, token, JSON.parse(queryKey), ctrl.signal)
      .then((data) => setState({ data }))
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        if (e instanceof DasApiError && e.status === 401) signOut();
        setState({ error: e instanceof Error ? e.message : "Request failed" });
      });
    return () => ctrl.abort();
  }, [status, token, path, queryKey, signOut]);

  return { ...state, live: status === "live" && state.data !== undefined };
}
