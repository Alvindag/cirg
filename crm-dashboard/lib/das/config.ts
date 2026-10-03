/**
 * DAS Engage 360 connection settings.
 *
 * The browser never calls the API host directly. `next.config.mjs` proxies
 * `/das-api/*` to `DAS_API_BASE_URL`, which avoids any CORS changes on the API.
 * With no `DAS_API_BASE_URL` the app runs on built-in demo data.
 */
export const dasEnabled = process.env.NEXT_PUBLIC_DAS_ENABLED === "true";

export const DAS_PROXY_PREFIX = "/das-api";
export const DAS_API_PREFIX = `${DAS_PROXY_PREFIX}/api/v1`;
