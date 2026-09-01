# Web Timetable for Limoges - IUT, Computer Science

A small stack to browse the timetables of the IUT informatique de Limoges.

- `web/`: an offline-first PWA built with [Solid v2](https://github.com/solidjs/solid) and Vite.
- `api/`: a Rust API built with [axum](https://github.com/tokio-rs/axum), caching into a
  Valkey (Redis-compatible) database. Timetable data comes from the
  [`unilim-edt-iut-info`](https://crates.io/crates/unilim-edt-iut-info) crate which
  lists and parses the official per-subgroup `.ics` files.

## API

| Endpoint | Description |
| -------- | ----------- |
| `GET /api/timetables/{year}` | Header metadata of every published week for a year (`A1`, `A2`, `A3`). |
| `GET /api/timetable/{year}/{week}` | Merged timetable of one week for a year, all groups included. |
| `GET /api/health` | Health probe. |
| `GET /api/openapi` | Interactive API reference (Scalar), raw spec on `/api/openapi.json`. |

Responses carry an `ETag` derived from the source `.ics` files, so revalidations
answer `304 Not Modified` unless something actually changed upstream.

## Installation

The stack is deployed on a Proxmox LXC - the full walkthrough is in
[docs/installation/proxmox.md](docs/installation/proxmox.md).

## Contributing

Development guides live in [`docs/development/`](docs/development/) - see
[CONTRIBUTING.md](CONTRIBUTING.md) to get started.
