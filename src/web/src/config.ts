/** Build-time settings (Vite env). See docs/entra-setup.md. */
export const config = {
  /** Base URL of the API, e.g. https://api.example.com (empty = same origin / dev proxy). */
  apiBaseUrl: ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '').replace(/\/+$/, ''),
  entraClientId: (import.meta.env.VITE_ENTRA_CLIENT_ID as string | undefined) ?? '',
  /** Directory id or domain; "organizations" for multi-tenant sign-in. */
  entraTenant: (import.meta.env.VITE_ENTRA_TENANT as string | undefined) ?? 'organizations',
  apiScope: (import.meta.env.VITE_API_SCOPE as string | undefined) ?? 'api://das-engage-360/access_as_user',
  /** Shows the paste-a-token sign-in. Development builds only. */
  devLogin: import.meta.env.VITE_DEV_LOGIN === 'true',
}
