# Development setup

## Prerequisites

- [Rust](https://rustup.rs) (stable) for the API.
- [Bun](https://bun.com) for the web app.
- A [Valkey](https://valkey.io) (or any Redis-compatible) server is **optional** in
  development: the API keeps a full in-process cache and only uses the database to
  stay warm across restarts. Install it natively if you want it
  (`brew install valkey` on macOS, `apt install valkey-server` on Debian 13+).

## Repository layout

| Path | Description |
| ---- | ----------- |
| `api/` | Rust API (axum) serving merged timetables - see [api.md](./api.md). |
| `web/` | Solid v2 PWA - see [web.md](./web.md). |
| `docs/` | This documentation. |

## Running everything

```sh
git clone https://code.vexcited.com/unilim/timetable.git
cd timetable

# terminal 1: the api, on http://localhost:8000/api
cd api && cargo run

# terminal 2: the web app, on http://localhost:5173
bun install
cd web && bun dev
```

The Vite dev server proxies `/api` to `localhost:8000`, so the web app talks to
your local API transparently.
