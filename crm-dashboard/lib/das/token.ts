const KEY = "das.devToken";

/** Kept in sessionStorage (never localStorage) so it dies with the tab. */
export function loadToken(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function saveToken(token: string | null) {
  try {
    if (token) sessionStorage.setItem(KEY, token);
    else sessionStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: the session just won't survive a reload */
  }
}

export type TokenCheck =
  | { ok: true; token: string }
  | { ok: false; message: string };

const MAKE_ONE =
  "Make a new one with: python3 scripts/dev-token.py --role Admin (in the DAS Engage 360 repo).";

/**
 * Cleans up and sanity-checks a pasted token: terminals add line breaks, and
 * people paste "Bearer " or quotes with it. A bad paste is explained, not ignored.
 */
export function checkPastedToken(raw: string, now = new Date()): TokenCheck {
  const token = raw
    .replace(/^\s*(authorization:\s*)?bearer\s+/i, "")
    .replace(/\s+/g, "")
    .replace(/^["'`]+|["'`]+$/g, "");
  if (!token) return { ok: false, message: "Paste the access token first." };

  const parts = token.split(".");
  if (parts.length !== 3 || !parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p))) {
    return {
      ok: false,
      message: `That does not look like a token: it should be one long line of three parts separated by two dots. ${MAKE_ONE}`,
    };
  }
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(
      atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)),
    ) as { exp?: unknown };
    if (typeof claims.exp === "number" && claims.exp * 1000 <= now.getTime()) {
      return {
        ok: false,
        message: `This token expired on ${new Date(claims.exp * 1000).toLocaleString()}. ${MAKE_ONE}`,
      };
    }
  } catch {
    return {
      ok: false,
      message: `That does not look like a token. ${MAKE_ONE}`,
    };
  }
  return { ok: true, token };
}
