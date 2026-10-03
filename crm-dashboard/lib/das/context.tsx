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
import {
  BUILTIN_DEFAULT_USER,
  builtinToken,
  dasBuiltIn,
  DAS_API_PREFIX,
} from "./config";
import { loadToken, saveToken } from "./token";
import type { Me } from "./types";

/**
 * connecting:  working out how to sign in, or checking the session with GET /me
 * signed-out:  no valid session or token yet
 * live:        signed in, pages read from the API
 * (demo is kept for old callers and is no longer produced)
 */
export type DasStatus = "demo" | "signed-out" | "connecting" | "live";

/** How people sign in. Only the built-in backend reports this; an external API always uses pasted tokens. */
export type AuthMode = "entra" | "demo" | "unconfigured" | "token";

/** In Microsoft mode the session lives in an HttpOnly cookie; this placeholder only marks the header on writes. */
export const SESSION_TOKEN = "session";

type DasContextValue = {
  status: DasStatus;
  authMode: AuthMode | null;
  token: string | null;
  me: Me | null;
  error: string | null;
  signIn: (token: string) => void;
  signOut: () => void;
  /** Demo mode only: switch to another demo user. */
  switchUser: (userId: string) => void;
};

const DasContext = createContext<DasContextValue | null>(null);

export function DasProvider({ children }: { children: React.ReactNode }) {
  const [authMode, setAuthMode] = useState<AuthMode | null>(
    dasBuiltIn ? null : "token",
  );
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Find out how this server wants people to sign in, then pick a starting token.
  useEffect(() => {
    let cancelled = false;
    async function start() {
      let mode: AuthMode = "token";
      if (dasBuiltIn) {
        try {
          const r = await fetch(`${DAS_API_PREFIX}/auth/config`);
          const c = (await r.json()) as { mode: AuthMode; reason?: string | null };
          mode = c.mode;
          if (c.mode === "unconfigured") setError(c.reason ?? "Sign-in is not configured.");
        } catch {
          setError("Could not reach the server.");
          mode = "unconfigured";
        }
      }
      if (cancelled) return;
      setAuthMode(mode);
      if (mode === "entra") setToken(SESSION_TOKEN);
      else if (mode === "demo") setToken(loadToken() ?? builtinToken(BUILTIN_DEFAULT_USER));
      else if (mode === "token") setToken(loadToken());
      setReady(true);
    }
    void start();
    return () => {
      cancelled = true;
    };
  }, []);

  const signOut = useCallback(() => {
    if (authMode === "entra") {
      // Clear the cookie on the server, then reload as a signed-out visitor.
      void fetch("/auth/logout", { method: "POST" }).finally(() => {
        window.location.assign("/connect");
      });
      return;
    }
    if (authMode === "demo") {
      // No signed-out state in demo mode: fall back to the default user.
      const t = builtinToken(BUILTIN_DEFAULT_USER);
      saveToken(t);
      setMe(null);
      setToken(t);
      return;
    }
    saveToken(null);
    setToken(null);
    setMe(null);
  }, [authMode]);

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
        if (authMode === "entra") {
          // Not signed in (or the session ended). Show the sign-in page; do not loop.
          setToken(null);
          setMe(null);
          if (!unauthorized) setError(e instanceof Error ? e.message : "Could not reach the server.");
          return;
        }
        // A demo token for a user that no longer exists (data was reset): start over as the default user.
        if (authMode === "demo" && unauthorized && token !== builtinToken(BUILTIN_DEFAULT_USER)) {
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
  }, [token, authMode, signOut, signIn]);

  const status: DasStatus = !ready
    ? "connecting"
    : me && token
      ? "live"
      : token
        ? "connecting"
        : "signed-out";

  const value = useMemo(
    () => ({ status, authMode, token, me, error, signIn, signOut, switchUser }),
    [status, authMode, token, me, error, signIn, signOut, switchUser],
  );
  return <DasContext.Provider value={value}>{children}</DasContext.Provider>;
}

export function useDas() {
  const ctx = useContext(DasContext);
  if (!ctx) throw new Error("useDas must be used inside <DasProvider>");
  return ctx;
}
