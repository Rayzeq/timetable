# Web development

```sh
bun install       # once, from the repository root
cd web
bun dev           # http://localhost:5173, proxies /api to localhost:8000
```

Before opening a pull request:

```sh
bun run check     # typescript
bun run build     # production build (also runs the pwa precache step)
```

The footer commit link is filled from the `APP_COMMIT_SHA` environment variable at
build time (`dev` when unset).

## Stack

- [Solid v2](https://github.com/solidjs/solid) with
  [`@solidjs/vite-plugin`](https://www.npmjs.com/package/@solidjs/vite-plugin) and
  [`@solidjs/router`](https://www.npmjs.com/package/@solidjs/router). Note that
  Solid 2 differs from Solid 1 in several ways - split `createEffect`, `onSettled`
  lifecycle, `class` array/object forms - see the
  [migration guide](https://github.com/solidjs/solid/blob/next/documentation/solid-2.0/MIGRATION.md)
  before touching reactivity.
- [UnoCSS](https://unocss.dev) for styling, [Swiper Element](https://swiperjs.com/element)
  for the day slides, [Luxon](https://moment.github.io/luxon/) for dates.
- `vite-plugin-pwa` makes the app installable and offline-first.

## Source layout

| Path | Description |
| ---- | ----------- |
| `src/entry.tsx` | Render root, router, theme color effect. |
| `src/routes/` | Pages: timetable (`index`), free rooms (`rooms`), 404 redirect. |
| `src/components/` | Swiper view, day timetables, widgets, modals. |
| `src/stores/` | Preferences, timetable cache, personal notes, the minute clock. |
| `src/utils/` | Lesson filtering/merging, dates, teachers, ics export. |
| `src/primitives/` | Media query and window size reactive helpers. |
| `src/types/` | Wire types (`api.ts`) and normalized client types (`client.ts`). |

## Client caching

Timetables are stored in IndexedDB (localforage) per year and week; the meta list
of a year lives in localStorage. A stored week is only refetched when the meta
list - refreshed at most every 5 minutes, cheap thanks to server `ETag`s - shows a
newer `last_update` for it, with a one hour fallback when the meta is unreachable.
Lessons are normalized once at ingest (`start_ts`/`end_ts`/`weekday`) so the
rendering hot paths compare plain numbers.
