# API

```sh
cd api
cargo run                                  # http://localhost:8000/api
curl http://localhost:8000/api/timetables/A1
```

The full API reference is served by the API itself on
[`/api/openapi`](http://localhost:8000/api/openapi) (Scalar UI), with the raw
OpenAPI document on `/api/openapi.json`.

## Configuration

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `CACHE_URL` | `redis://127.0.0.1:6379` | Valkey/Redis connection URL. The API works without it, just slower and cold after restarts. |
| `LISTEN_ADDRESS` | `0.0.0.0:8000` | Address the HTTP server binds to. |
| `REFRESH_INTERVAL_SECONDS` | `120` | Background refresh interval, `0` disables it. |
| `RUST_LOG` | `info` | Log filter. |

## How it works

Timetable data comes from the
[`unilim-edt-iut-info`](https://crates.io/crates/unilim-edt-iut-info) crate, which
lists and parses the official per-subgroup `.ics` files of
[edt-iut-info.unilim.fr](https://edt-iut-info.unilim.fr/edt). A week timetable of a
study year is merged from every subgroup file of that year - lessons shared between
files (CM across the year, TD within a main group) parse identically and are
deduplicated by equality.

### Caching

Two tiers: an in-process memory cache in front of the Valkey database. The database
keeps the cache warm across restarts; the memory tier serves the hot path with no
i/o and keeps the API fully functional if the database is unreachable.

- directory listings are the freshness source, refetched by a background refresher
  on an interval.
- each parsed `.ics` file is cached under a key containing its last-update
  timestamp from the listing, so a republished file gets a fresh key.
- full responses (merged weeks, meta lists) are cached pre-serialized under a
  fingerprint of their input files - an upstream update rebuilds exactly what it
  invalidated, and requests are pure cache hits.

The fingerprint doubles as the `ETag`: responses carry
`Cache-Control: public, no-cache`, so clients revalidate with `If-None-Match` and
get bodiless `304`s unless something actually changed.
