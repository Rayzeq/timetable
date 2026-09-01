# Development setup

## Prerequisites

- [Rust](https://rustup.rs) for the API.
- [Bun](https://bun.com) for the web app.
- A [Valkey](https://valkey.io) (or any Redis-compatible) server is **optional** in
  development: the API keeps a full in-process cache and only uses the database to
  stay warm across restarts.

## Quick Start

```sh
git clone https://code.vexcited.com/unilim/timetable
cd timetable

# terminal 1: the api, on http://localhost:8000/api
cd api && cargo run

# terminal 2: the web app, on http://localhost:5173
bun install
cd web && bun dev
```

Vite will proxy `/api` to `localhost:8000`, so the web app talks to your local API transparently.
