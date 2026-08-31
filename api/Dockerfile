# build context must be the directory containing BOTH repositories,
# cloned side by side:
#   <context>/unilim-timetable
#   <context>/unilim-edt-iut-info
# the compose file at the repository root sets this up already.

FROM rust:1-slim-bookworm AS builder

RUN apt-get update \
  && apt-get install -y --no-install-recommends pkg-config libssl-dev \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY unilim-edt-iut-info ./unilim-edt-iut-info
COPY unilim-timetable/api ./unilim-timetable/api

WORKDIR /build/unilim-timetable/api
RUN cargo build --release

FROM debian:bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates libssl3 curl \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /build/unilim-timetable/api/target/release/unilim-timetable-api /usr/local/bin/unilim-timetable-api

ENV LISTEN_ADDRESS=0.0.0.0:8000
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD curl -fsS http://127.0.0.1:8000/api/health || exit 1

CMD ["unilim-timetable-api"]
