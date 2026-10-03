# CRM Dashboard

A dark, glassmorphic CRM dashboard built with Next.js 14 (App Router), TypeScript, Tailwind CSS and shadcn/ui conventions (New York style, zinc base). Runs on sample data out of the box and can connect to a DAS Engage 360 API.

## Getting started

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # production build
npm run start   # serve the production build
npm run lint
```

Requires Node 18.17 or newer. Press **⌘K** or **Ctrl+K** anywhere to open the command palette.

## Connecting to DAS Engage 360

By default the dashboard shows sample data. Set `DAS_API_BASE_URL` (see `.env.example`) and the widgets read from a [DAS Engage 360](https://github.com/Alvindag/cirg/pull/7) API instead:

```bash
cp .env.example .env.local      # edit DAS_API_BASE_URL
npm run dev
```

Then open **Connect DAS Engage** in the header, paste an access token and press Connect. For a development API, mint one with `python3 scripts/dev-token.py --role Admin` in the DAS Engage 360 repo. The token is kept in `sessionStorage` (this tab only), and the header shows the signed-in role.

| Widget | Endpoint |
| --- | --- |
| Last 30 days (KPIs) | `GET /dashboards/sales` |
| Product Engagement | `GET /dashboards/products` |
| Recent Activity | `GET /notifications` |
| AI Copilot Insight | `GET /admin/products`, then `GET /ai/opportunities` |
| Command palette, Recent Contacts | `GET /customers` |

Pages (live data only; they ask you to connect first):

| Page | What it does |
| --- | --- |
| Customers | Search and filter, edit or remove a customer, CSV import with a check-first step |
| Samples | Requests (approve, reject, issue stock), stock (adjust, write off, return), batches (create, receive, quarantine, recall), per-customer limits, compliance report and CSV download |
| Team | People and reporting lines (add, deactivate with reassignment, reactivate) and territories (add, edit, delete) |
| Audit | The append-only audit log, newest first, with "Load older" |

Pages for managers show a short message to other roles. Edits that need a number or a reason use the browser's built-in prompt boxes, as the original DAS web app did; a nicer dialog is a possible follow-up.

Each widget shows a **Live** or **Sample data** badge, so it is always clear which one you are looking at. Signed out, offline or on an API error, widgets fall back to sample data.

How it works:
- `next.config.mjs` proxies `/das-api/*` to `DAS_API_BASE_URL`, so the API needs no CORS change.
- `lib/das/` holds the typed client (`client.ts`), the sign-in state (`context.tsx`), the `useDasQuery` hook and the sample data (`demo.ts`).
- `node scripts/mock-das-api.mjs` runs a tiny fake API on port 5050 so you can try live mode without the .NET backend: `DAS_API_BASE_URL=http://localhost:5050 npm run dev`.

Not done yet: Microsoft Entra sign-in (only pasted development tokens), and the DAS web app's Insights, ERP, Route-to-market and Notices pages.

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
    customers/ samples/ team/ audit/ connect/   DAS Engage 360 pages
components/
  ui/                     Primitives: GlassPanel, SkeletonLoader, tables, buttons, fields, badges
  layout/                 Shell pieces: Sidebar, Header, CommandMenu,
                          MeshGradientBackground, Providers, nav-items
  das/                    Page bodies for Customers, Samples, Team, Audit
  dashboard/              Page widgets: Widget (shared frame), KpiRow, ProductEngagement,
                          QuickActions, ActivityTimeline, CopilotInsight, BentoGrid
lib/utils.ts              cn() and the shared focusRing class
lib/das/                  DAS Engage 360 client, sign-in state, query hook, sample data
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

- The sidebar is hidden below the `md` breakpoint and there is no mobile nav yet; the command palette is the fallback.
- Quick Actions and the palette's Actions group are placeholders.
- `shadcn init` could not reach the shadcn registry from the build environment, so `components.json` and the theme were written by hand. `npx shadcn add <component>` should work wherever the registry is reachable.
