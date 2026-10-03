# DAS Engage 360 – Web dashboard

React + TypeScript (Vite). For managers and the commercial team; reps use the mobile app.

```bash
npm install
npm run dev          # http://localhost:5173 (the API allows this origin in Development)
npm test             # unit and component tests (vitest + Testing Library)
npm run typecheck && npm run lint && npm run build
npm run e2e          # real headless Chromium against a built copy, API mocked at the network layer
```

## Configuration (Vite env, e.g. `.env.local`)
| Variable | Meaning |
|---|---|
| `VITE_API_BASE_URL` | API address, e.g. `https://api.example.com` |
| `VITE_ENTRA_CLIENT_ID` | client id of the **web** (single-page app) registration |
| `VITE_ENTRA_TENANT` | directory id/domain, or `organizations` (default) for multi-tenant |
| `VITE_API_SCOPE` | `api://das-engage-360/access_as_user` |
| `VITE_DEV_LOGIN=true` | development only: paste a token instead of Microsoft sign-in. A production build refuses to run with it on (the browser test opts in with `DAS_ALLOW_DEV_LOGIN_BUILD=true`), so it cannot reach a deployed site. |

The API must list the site's origin under `Cors:AllowedOrigins`. See `docs/entra-setup.md` for the Entra registrations.

## Pages
- **Overview:** calls completed, plan adherence, coverage, visits outside the geofence; calls per day, calls by rep, product engagement (calls vs sample units), rep activity and last known positions.
  Everything respects the signed-in manager's team scope (enforced by the API). Revenue appears once ERP data is integrated.
- **Customers:** search and filter; edit a customer (managers, marketing, key accounts) or remove one (managers); CSV import with a check-first step (new / updated / duplicates / errors) before anything is saved.
- **Team:** people, reporting lines and territories; admins and the NSM can add and deactivate people (reassigning reports) and add, rename and delete territories (deleting is refused while people or customers are assigned).
- **Samples:** approve or reject requests (history can be filtered by status and rep), issue stock (oldest expiry first), stock by holder with expiry and recall flags (stock controllers can write off, correct, or take a rep's stock back to the warehouse), batches (create, receive, quarantine, recall; the reps holding a batch are notified), per-customer sample limits per product, compliance summary and CSV download.
- **Notices** (bell in the header): unread notifications for the signed-in person, such as a recalled batch they hold; refreshed every minute.
- **Insights:** customer scores with the factors behind them, product opportunities, territory balance with administrator-applied moves, and the AI governance register with the organisation opt-in switch (see `docs/ai.md`).
- **ERP** (administrators; executives read-only): gateway connection and integration keys, CSV imports with accounts and items still to link, the outbox to the ERP (retry failed messages), stock reconciliation, procurement suggestions and requisitions. The Overview shows revenue once invoices exist. See `docs/erp-integration.md`.
- **Audit:** the append-only audit log.

## Development sign-in
In development the sign-in page takes a pasted token (`python scripts\dev-token.py --role Admin | Set-Clipboard`). The pasted text is cleaned up (line breaks, spaces, quotes and a leading "Bearer" are removed) and checked before use: a wrong shape or an expired token is explained on the page instead of being ignored. A sales rep token opens the "dashboard is for managers" page, which has a Sign out button.

## Route to market
The **RTM** page (managers) shows how outlets are served and how much of the market is mapped and reached, by kind of outlet, channel and region, and lets people tag outlets that have no channel or kind yet. National leaders enter the estimated market size there. It reports on channels and regions, never on individual sales people. See `docs/route-to-market.md`.

## Customisable overview
On the Sales overview, **Customise** lets each person drag cards into a new order (or use the arrow buttons, which also work from the keyboard), change a card's width, hide cards and bring them back. The layout is saved per person in this browser's `localStorage` (not on the server, so it does not follow someone to another device) and **Reset layout** restores the default. The logic is in `src/lib/layout.ts`, the grid in `src/components/Bento.tsx`.

## Security notes
- Entra sign-in uses authorization code + PKCE (MSAL, redirect flow); tokens stay in `sessionStorage` and are acquired silently. The API decides who the user is and what they may do; the UI only hides what the API would refuse.
- Roles shown in the UI come from `GET /me` (the database), never from the token.
- Serve over HTTPS with security headers (CSP, `X-Content-Type-Options`, `frame-ancestors 'none'`); this is a static site and can go on Azure Static Web Apps or Blob + Front Door.

## Not yet done
- Real-tenant sign-in test, map view of rep positions, localisation, editing users in place (only add and deactivate), tenant administration screens.
- The e2e test mocks the API; run it against a staging API as well.
