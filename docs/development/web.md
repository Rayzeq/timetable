# Web

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

- [Solid v2](https://github.com/solidjs/solid)
- [UnoCSS](https://unocss.dev) for styling, [Swiper Element](https://swiperjs.com/element)
  for the day slides, [Luxon](https://moment.github.io/luxon/) for dates.
- `vite-plugin-pwa` makes the app installable and offline-first.

## Client caching

Timetables are stored in IndexedDB (localforage) per year and week; the meta list
of a year lives in localStorage. A stored week is only refetched when the meta
list - refreshed at most every 5 minutes, cheap thanks to server `ETag`s - shows a
newer `last_update` for it, with a one hour fallback when the meta is unreachable.
Lessons are normalized once at ingest (`start_ts`/`end_ts`/`weekday`) so the
rendering hot paths compare plain numbers.
