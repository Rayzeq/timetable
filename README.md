# Web Timetable for Limoges - IUT, Computer Science

A small stack to browse the timetables of the IUT informatique de Limoges.

- `web/`: an offline-first PWA built with [Solid v2](https://github.com/solidjs/solid) and Vite.
- `api/`: a Rust API built with [axum](https://github.com/tokio-rs/axum), caching into a
  Valkey (Redis-compatible) database. Timetable data comes from the
  [`unilim-edt-iut-info`](https://code.vexcited.com/unilim/edt-iut-info) crate which
  lists and parses the official per-subgroup `.ics` files.

## API

| Endpoint | Description |
| -------- | ----------- |
| `GET /api/timetables/{year}` | Header metadata of every published week for a year (`A1`, `A2`, `A3`). |
| `GET /api/timetable/{year}/{week}` | Merged timetable of one week for a year, all groups included. |
| `GET /api/health` | Health probe. |

Responses use the `{ "success": true, "data": ... }` envelope and carry an `ETag`
(a fingerprint of the source `.ics` files), so revalidations answer `304 Not
Modified`. A background refresher keeps listings, parsed files and pre-serialized
responses warm in a two-tier cache (in-process memory + Valkey), so upstream updates
land within the refresh interval and requests never wait on the timetable server.
The web client uses the meta list's `last_update` to refetch only weeks that
actually changed.

Environment variables:

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `CACHE_URL` | `redis://127.0.0.1:6379` | Valkey/Redis connection URL. The API still works without it, just slower. |
| `LISTEN_ADDRESS` | `0.0.0.0:8000` | Address the HTTP server binds to. |

## Development

```sh
# api - serves http://localhost:8000/api
cd api && cargo run

# web - serves http://localhost:5173 and proxies /api to localhost:8000
bun install
cd web && bun dev
```

Running a local Valkey (`docker run -p 6379:6379 valkey/valkey:8-alpine`) is optional
during development.

## Deployment with Docker Compose

Clone both repositories side by side, the API builds the crate from the sibling
checkout:

```sh
git clone https://code.vexcited.com/unilim/timetable.git unilim-timetable
git clone https://code.vexcited.com/unilim/edt-iut-info.git unilim-edt-iut-info

cd unilim-timetable
docker compose up -d --build
```

The app is served on <http://localhost:8080> - `web` (nginx) serves the static PWA and
proxies `/api` to the `api` service, which talks to the `valkey` service.

## Deployment on a bare host (Proxmox LXC, ...)

1. Install `valkey` (or any Redis-compatible server) from your distribution.
2. Build the API with `cargo build --release` (with `unilim-edt-iut-info` cloned as a
   sibling of this repository) and run `target/release/unilim-timetable-api` as a
   service, with `CACHE_URL` pointing to your Valkey instance.
3. Build the web app with `bun install && cd web && bun run build` and serve `web/dist`
   with any web server, proxying `/api` to the API - `web/nginx.conf` is a working
   example.
