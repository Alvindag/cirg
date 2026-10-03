# CRM Dashboard

A dark, glassmorphic CRM dashboard built with Next.js 14 (App Router), TypeScript, Tailwind CSS and shadcn/ui conventions (New York style, zinc base). All data is mock data for now.

## Getting started

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # production build
npm run start   # serve the production build
npm run lint
```

Requires Node 18.17 or newer. Press **⌘K** or **Ctrl+K** anywhere to open the command palette.

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
components/
  ui/                     Primitives: GlassPanel, SkeletonLoader
  layout/                 Shell pieces: Sidebar, Header, CommandMenu,
                          MeshGradientBackground, Providers, nav-items
  dashboard/              Page widgets: Widget (shared frame), PipelineOverview,
                          QuickActions, ActivityTimeline, CopilotInsight, BentoGrid
lib/utils.ts              cn() and the shared focusRing class
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

- `/contacts`, `/pipeline`, `/analytics` and `/settings` are linked but not built yet.
- The sidebar is hidden below the `md` breakpoint and there is no mobile nav yet; the command palette is the fallback.
- Quick Actions and the palette's Actions group are placeholders.
- `shadcn init` could not reach the shadcn registry from the build environment, so `components.json` and the theme were written by hand. `npx shadcn add <component>` should work wherever the registry is reachable.
