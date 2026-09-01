# api

Rust API serving merged timetables for the IUT informatique de Limoges, using the
[`unilim-edt-iut-info`](https://crates.io/crates/unilim-edt-iut-info) crate as data
source.

```sh
cargo run
curl http://localhost:8000/api/timetables/A1
```

The interactive API reference is served on
[`/api/openapi`](http://localhost:8000/api/openapi) (Scalar), the raw OpenAPI
document on `/api/openapi.json`.

Configuration, caching design and the module map are documented in
[docs/development/api.md](../docs/development/api.md).
