# Contributing

Thanks for wanting to help !

## Prerequisites

- [Rust](https://rustup.rs) for running the API
- [Bun](https://bun.com) and [Node](https://nodejs.org) for running the web app
- [Valkey](https://valkey.io) (or any Redis-compatible) server is **optional**, the API keeps a full in-process cache and only uses the database to stay warm across restarts

## Getting Started

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

## Commits

You should use [conventional commits](https://www.conventionalcommits.org) to format your commits otherwise your PR might get closed.
