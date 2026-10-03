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
import { BUILTIN_DEFAULT_USER, builtinToken, dasBuiltIn, dasEnabled } from "./config";
import { loadToken, saveToken } from "./token";
import type { Me } from "./types";

/**
 * demo:        sign-in is switched off (not used by the app any more)
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
  /** Built-in backend only: switch to another demo user. */
  switchUser: (userId: string) => void;
};

const DasContext = createContext<DasContextValue | null>(null);

export function DasProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // The built-in backend signs in as a default demo user so every page works at once.
    if (dasEnabled) {
      setToken(loadToken() ?? (dasBuiltIn ? builtinToken(BUILTIN_DEFAULT_USER) : null));
    }
    setReady(true);
  }, []);

  const signOut = useCallback(() => {
    if (dasBuiltIn) {
      // There is no signed-out state with the built-in backend: fall back to the default user.
      const t = builtinToken(BUILTIN_DEFAULT_USER);
      saveToken(t);
      setMe(null);
      setToken(t);
      return;
    }
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

  const switchUser = useCallback(
    (userId: string) => {
      signIn(builtinToken(userId));
    },
    [signIn],
  );

  useEffect(() => {
    if (!token) return;
    const ctrl = new AbortController();
    dasGet<Me>("/me", token, undefined, ctrl.signal)
      .then(setMe)
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        const unauthorized = e instanceof DasApiError && e.status === 401;
        // A built-in token for a user that no longer exists (data was reset): start over as the default user.
        if (dasBuiltIn && unauthorized && token !== builtinToken(BUILTIN_DEFAULT_USER)) {
          signIn(builtinToken(BUILTIN_DEFAULT_USER));
          return;
        }
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
  }, [token, signOut, signIn]);

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
    () => ({ status, token, me, error, signIn, signOut, switchUser }),
    [status, token, me, error, signIn, signOut, switchUser],
  );
  return <DasContext.Provider value={value}>{children}</DasContext.Provider>;
}

export function useDas() {
  const ctx = useContext(DasContext);
  if (!ctx) throw new Error("useDas must be used inside <DasProvider>");
  return ctx;
}
