# api

Rust API serving merged timetables for the IUT informatique de Limoges, using the
[`unilim-edt-iut-info`](https://code.vexcited.com/unilim/edt-iut-info) crate as data
source - it must be cloned as a sibling of this repository since it is a path
dependency, along with its [`rikka`](https://code.vexcited.com/rikka/rikka) http
client.

## Endpoints

| Endpoint | Description |
| -------- | ----------- |
| `GET /api/timetables/{year}` | Header metadata of every published week for a year (`A1`, `A2`, `A3`). |
| `GET /api/timetable/{year}/{week}` | Merged timetable of one week, every group of the year included. |
| `GET /api/health` | Health probe. |

A year timetable is merged from every subgroup `.ics` file of the year - lessons
shared between files (CM across the year, TD within a main group) parse identically
and are deduplicated.

## Caching

Two tiers: an in-process memory cache in front of any Redis-compatible database -
Valkey in the compose setup. The database keeps the cache warm across restarts; the
API stays fully functional on memory alone if it is unreachable.

A background refresher refetches the directory listings on an interval, so requests
are pure cache hits. Parsed `.ics` files are cached under a key containing their
last-update timestamp from the listing, and full responses (merged weeks, meta
lists) are cached pre-serialized under a fingerprint of their input files - any
upstream update changes the fingerprint and rebuilds exactly what it invalidated.

The fingerprint doubles as the `ETag`: responses are served with
`Cache-Control: public, no-cache`, so clients revalidate cheaply and get `304 Not
Modified` unless something actually changed.

## Configuration

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `CACHE_URL` | `redis://127.0.0.1:6379` | Valkey/Redis connection URL. |
| `LISTEN_ADDRESS` | `0.0.0.0:8000` | Address the HTTP server binds to. |
| `REFRESH_INTERVAL_SECONDS` | `120` | Background refresh interval, `0` disables it. |
| `RUST_LOG` | `info` | Log filter. |

## Development

```sh
cargo run
curl http://localhost:8000/api/timetables/A1
```
