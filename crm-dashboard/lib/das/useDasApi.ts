"use client";

import { useMemo } from "react";

import { dasDownload, dasSend, DasApiError, type Query } from "./client";
import { useDas } from "./context";

/** Request helpers bound to the signed-in token. A 401 signs the user out. */
export function useDasApi() {
  const { token, signOut } = useDas();

  return useMemo(() => {
    async function run<T>(fn: (token: string) => Promise<T>): Promise<T> {
      if (!token) throw new DasApiError(401, "Not signed in.");
      try {
        return await fn(token);
      } catch (e) {
        if (e instanceof DasApiError && e.status === 401) signOut();
        throw e;
      }
    }
    return {
      get: <T>(path: string, query?: Query) =>
        run((t) => dasSend<T>("GET", path, t, { query })),
      post: <T>(path: string, body?: unknown, query?: Query) =>
        run((t) => dasSend<T>("POST", path, t, { body, query })),
      put: <T>(path: string, body?: unknown) =>
        run((t) => dasSend<T>("PUT", path, t, { body })),
      del: <T>(path: string) => run((t) => dasSend<T>("DELETE", path, t)),
      postText: <T>(path: string, text: string, query?: Query) =>
        run((t) => dasSend<T>("POST", path, t, { text, query })),
      download: (path: string, query: Query, filename: string) =>
        run((t) => dasDownload(path, t, query, filename)),
    };
  }, [token, signOut]);
}
