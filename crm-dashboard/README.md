# CRM Dashboard

A dark, glassmorphic CRM dashboard built with Next.js 14 (App Router), TypeScript, Tailwind CSS and shadcn/ui conventions (New York style, zinc base). Runs on a built-in backend with sample data out of the box and can connect to a DAS Engage 360 API.

## Getting started

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # production build
npm run start   # serve the production build
npm run lint
```

Requires Node 18.17 or newer. Press **⌘K** or **Ctrl+K** anywhere to open the command palette.

## What it is

The DAS Engage 360 web app: a working CRM for a pharma sales force, plus the tools the Route-to-Market review asked for. It runs out of the box on a **built-in backend** (sample data, a JSON file store, role-based access), so every page works with no setup. See [docs/memo-to-features.md](docs/memo-to-features.md) for how each need in the review memo maps to a page, and what is not covered.

| Area | Pages |
| --- | --- |
| Sell | Dashboard (what needs attention), Customers (add, edit, import, customer page), Pipeline (deals by stage), Visits and tasks (GPS check-in, offline queue, tasks), Samples (request, approve, issue, hand over, limits, compliance) |
| Route to market | Route to market (OTIF, cost to serve, cycle time, reach, channel conflict), Field force, Data quality (duplicates, gaps, merge), Batch trace (recall impact), Cost of ownership (saved scenarios) |
| Partners | Distributor portal (own prices, stock, orders, performance) |
| Admin | Team, Audit trail, Access rules and record integrity |

Try it as any role with the **Signed in as** menu in the header. A rep sees their territory, a manager sees their team, a distributor sees only their own partner data. The menu is only a convenience: the server refuses what a role may not do.

## Connecting to a real DAS Engage 360 API

Set `DAS_API_BASE_URL` (see `.env.example`) and the app proxies `/das-api/*` to that API instead of using the built-in backend:

```bash
cp .env.example .env.local      # edit DAS_API_BASE_URL
npm run dev
```

Then open **Connect DAS Engage** in the header and paste an access token (`python3 scripts/dev-token.py --role Admin` in the DAS Engage 360 repo). Pages that use features the real API does not have yet (pipeline, visits, RTM, portal, trace, TCO) will show errors until it grows them; the built-in backend defines those endpoints in `lib/server/routes/`.

`node scripts/mock-das-api.mjs` runs a small fake of the original API on port 5050 for trying external mode.

## Built-in backend

- `lib/server/seed.ts` makes deterministic sample data: Ghana regions, about 220 customers (with duplicates and gaps on purpose), 1,250 visits, 1,000+ orders, deals, sample stock.
- `lib/server/store.ts` keeps it in `.data/crm-db.json` (override with `CRM_DATA_FILE`). Delete the file to start over; an Admin can also reset it from the API (`POST /das-api/api/v1/demo/reset`).
- `lib/server/routes/` holds the endpoints, with role checks. `lib/das/rbac.ts` is the single table of who may open what, used by the menu, the pages and the server.
- Visits and the audit trail are hash-chained (`lib/rtm/hashchain.ts`). Changing a record breaks the chain and the Access page says so.
- Sign-in is a demo role picker (`Bearer builtin:<userId>`). **Do not put real data or real partners on it.** Use Microsoft Entra or your identity provider first.
- One JSON file on one server. Serverless hosts with a read-only or per-request disk will lose changes.

## Tests

```bash
npm test        # unit tests: RTM maths, offline queue, API roles and rules
npm run lint
npx tsc --noEmit
```

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 14, App Router, TypeScript |
| Styling | Tailwind CSS with shadcn-style CSS variables (zinc), `tailwindcss-animate` |
| Motion | Framer Motion |
| Command palette | cmdk |
| Icons | lucide-react |
| Class merging | `clsx` + `tailwind-merge` via `cn()` in `lib/utils.ts` |

## Architecture

```
app/
  layout.tsx              Root layout: fonts, dark class, <Providers>, mesh background
  globals.css             Theme tokens (light + dark), dark-mode base styles, noise utility
  (dashboard)/
    layout.tsx            App shell: sidebar, header, command menu, main glass panel
    page.tsx              Dashboard home: the bento grid
    loading.tsx           Skeleton version of the bento grid
    customers/ pipeline/ activities/ samples/ rtm/ field-force/ data-quality/
    trace/ tco/ portal/ team/ audit/ access/ connect/   pages
  das-api/[...path]/      Built-in DAS Engage 360 API (used when DAS_API_BASE_URL is unset)
components/
  ui/                     Primitives: GlassPanel, SkeletonLoader, tables, buttons, fields, badges
  layout/                 Shell pieces: Sidebar, Header, CommandMenu,
                          MeshGradientBackground, Providers, nav-items
  das/                    Page bodies for Customers, Samples, Team, Audit
  dashboard/              Page widgets: Widget (shared frame), KpiRow, ProductEngagement,
                          QuickActions, ActivityTimeline, CopilotInsight, BentoGrid
lib/utils.ts              cn() and the shared focusRing class
lib/das/                  API client, sign-in state, query hook, role table (rbac.ts), offline queue
lib/rtm/                  Pure RTM logic: metrics, data quality, GPS, hash chain, TCO
lib/server/               Built-in backend: model, seed, store, routes
scripts/mock-das-api.mjs  Tiny fake API for trying live mode
```

Server components are the default. Anything that uses Framer Motion, state or browser events is a client component (`"use client"`). The `(dashboard)` route group lets future pages share the shell without adding to the URL.

The header's search button and the keyboard shortcut both open `CommandMenu`; the button dispatches a window event so the two stay decoupled.

## Design decisions

**Dark by default.** The `<html>` element carries the `dark` class and the body is `bg-zinc-950 text-zinc-100`. Secondary text uses `zinc-400` or lighter, which keeps contrast above WCAG AA against the glass surfaces.

**Glassmorphism.** `GlassPanel` is the single surface primitive: `bg-white/5`, `backdrop-blur-md`, a `border-white/10` hairline and a soft shadow. Sidebar, header, content area, widgets and the command palette all use the same recipe, so the UI reads as one material. The blur only means something over a colorful backdrop, which is why the next item exists.

**Mesh gradient background.** `MeshGradientBackground` is three large blurred blobs (indigo, teal, purple) at 20% opacity that drift slowly (40 to 56 second loops), plus a 2% SVG fractal-noise overlay to avoid banding. It is fixed behind everything and `aria-hidden`.

**Bento layout.** The home page is a CSS grid (`grid-cols-1 md:grid-cols-3 lg:grid-cols-4`) of widgets with different spans, so important widgets get more room without a rigid table of equal cards. On phones it collapses to one column. On large screens the activity timeline spans three columns and the Copilot card runs the full height of the right column so the grid has no holes.

**Motion.** Animations are meant to give feedback, not decorate:
- Widgets fade and rise in with a 0.1s stagger.
- Quick Action buttons scale to 0.95 on press.
- Timeline rows slide 4px right and brighten on hover.
- The sidebar pill glides between items using a shared `layoutId`.
- Skeletons shimmer while content loads.

Only `transform` and `opacity` are animated, so the browser can composite them without layout or paint. For example, chart bars use a fixed height animated with `scaleY`, and the hover highlight fades an overlay's opacity. `Providers` wraps the app in `MotionConfig reducedMotion="user"` so users who ask their OS for less motion get it.

**Accessibility.** Landmarks (`header`, `nav`, `main`, `aside`), one `h1`, labelled icon-only buttons, a keyboard focus ring on every interactive element (`focusRing` in `lib/utils.ts`), decorative icons hidden from assistive tech, and a text alternative for the bar chart.

## Known gaps

- No deployment is set up. Microsoft Entra sign-in is not built.
- Edits that need a number or a reason still use the browser's prompt boxes.
- No photo proof, face check or push notifications for field staff.
- `shadcn init` could not reach the shadcn registry from the build environment, so `components.json` and the theme were written by hand. `npx shadcn add <component>` should work wherever the registry is reachable.
