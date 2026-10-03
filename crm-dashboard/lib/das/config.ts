/**
 * DAS Engage 360 connection settings.
 *
 * The browser never calls an API host directly: it calls `/das-api/*` on this
 * origin. With `DAS_API_BASE_URL` set, `next.config.mjs` proxies that path to the
 * real DAS Engage 360 API. With it unset, the app serves the same API itself
 * (the built-in backend in `lib/server`), so every page works out of the box.
 */
export const dasEnabled = true;

/** True when no external API is configured and the built-in backend answers. */
export const dasBuiltIn = process.env.NEXT_PUBLIC_DAS_BUILTIN === "true";

export const DAS_PROXY_PREFIX = "/das-api";
export const DAS_API_PREFIX = `${DAS_PROXY_PREFIX}/api/v1`;

/** The user the built-in backend signs in as when nobody has chosen one. */
export const BUILTIN_DEFAULT_USER = "user-0001";
export const builtinToken = (userId: string) => `builtin:${userId}`;
