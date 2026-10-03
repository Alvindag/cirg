"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { dasGet, DasApiError } from "./client";
import { dasEnabled } from "./config";
import { loadToken, saveToken } from "./token";
import type { Me } from "./types";

/**
 * demo:        no API configured, built-in sample data
 * signed-out:  API configured, no valid token yet (sample data shown)
 * connecting:  token present, checking it with GET /me
 * live:        signed in, widgets read from the API
 */
export type DasStatus = "demo" | "signed-out" | "connecting" | "live";

type DasContextValue = {
  status: DasStatus;
  token: string | null;
  me: Me | null;
  error: string | null;
  signIn: (token: string) => void;
  signOut: () => void;
};

const DasContext = createContext<DasContextValue | null>(null);

export function DasProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (dasEnabled) setToken(loadToken());
    setReady(true);
  }, []);

  const signOut = useCallback(() => {
    saveToken(null);
    setToken(null);
    setMe(null);
  }, []);

  const signIn = useCallback((t: string) => {
    saveToken(t);
    setError(null);
    setMe(null);
    setToken(t);
  }, []);

  useEffect(() => {
    if (!token) return;
    const ctrl = new AbortController();
    dasGet<Me>("/me", token, undefined, ctrl.signal)
      .then(setMe)
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        const unauthorized = e instanceof DasApiError && e.status === 401;
        setError(
          unauthorized
            ? "The API refused this token. It may have expired."
            : e instanceof Error
              ? e.message
              : "Could not reach the API.",
        );
        signOut();
      });
    return () => ctrl.abort();
  }, [token, signOut]);

  const status: DasStatus = !dasEnabled
    ? "demo"
    : !ready
      ? "signed-out"
      : me && token
        ? "live"
        : token
          ? "connecting"
          : "signed-out";

  const value = useMemo(
    () => ({ status, token, me, error, signIn, signOut }),
    [status, token, me, error, signIn, signOut],
  );
  return <DasContext.Provider value={value}>{children}</DasContext.Provider>;
}

export function useDas() {
  const ctx = useContext(DasContext);
  if (!ctx) throw new Error("useDas must be used inside <DasProvider>");
  return ctx;
}
