# Contributing

Thanks for wanting to help! Start with the
[development setup](docs/development/setup.md), then dive into the part you're
touching:

- [API development](docs/development/api.md) - the Rust service, its caching
  design and configuration.
- [Web development](docs/development/web.md) - the Solid v2 PWA, its stack and
  client caching.

Deployment lives in [docs/installation/proxmox.md](docs/installation/proxmox.md).

## Before opening a pull request

- API: `cargo clippy` (pedantic lints are on) and `cargo test` must pass.
- Web: `bun run check` and `bun run build` must pass.

## Commits

Use [conventional commits](https://www.conventionalcommits.org), one concern per
commit, with a short description and no body:

```
feat(web): swiper view
fix(api): listing date parsing
docs: proxmox installation
```
