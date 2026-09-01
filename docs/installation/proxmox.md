# Installation on Proxmox (LXC)

The whole stack - Valkey, the API and nginx serving the PWA - fits in a single
unprivileged LXC container.

## 1. Create the container

Download a Debian 13 template and create an unprivileged container from it, through
the UI or the shell of the node:

```sh
pveam update
pveam download local debian-13-standard_13.1-2_amd64.tar.zst

pct create 200 local:vztmpl/debian-13-standard_13.1-2_amd64.tar.zst \
  --hostname timetable \
  --cores 2 --memory 1024 --swap 512 \
  --rootfs local-lvm:8 \
  --net0 name=eth0,bridge=vmbr0,ip=dhcp \
  --unprivileged 1 --features nesting=1 \
  --onboot 1

pct start 200
pct enter 200
```

Adjust the storage, bridge and static IP to your setup. Everything below runs
inside the container.

## 2. Packages and toolchains

```sh
apt update && apt upgrade -y
apt install -y git curl unzip build-essential pkg-config libssl-dev nginx valkey-server

# rust, for the api.
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
. "$HOME/.cargo/env"

# bun, for the web build.
curl -fsSL https://bun.sh/install | bash
export PATH="$HOME/.bun/bin:$PATH"
```

Valkey listens on `127.0.0.1:6379` out of the box, which is exactly what the API
expects:

```sh
systemctl enable --now valkey-server
```

## 3. Build

```sh
git clone https://code.vexcited.com/unilim/timetable.git /opt/timetable
cd /opt/timetable

# api.
cd api && cargo build --release && cd ..

# web.
bun install
cd web && APP_COMMIT_SHA=$(git rev-parse --short HEAD) bun run build && cd ..
```

## 4. The API as a service

```sh
useradd --system --no-create-home --shell /usr/sbin/nologin timetable

cat > /etc/systemd/system/timetable-api.service <<'EOF'
[Unit]
Description=unilim timetable api
After=network-online.target valkey-server.service
Wants=network-online.target

[Service]
User=timetable
ExecStart=/opt/timetable/api/target/release/unilim-timetable-api
Environment=LISTEN_ADDRESS=127.0.0.1:8000
Environment=CACHE_URL=redis://127.0.0.1:6379
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl enable --now timetable-api
curl http://127.0.0.1:8000/api/health
```

See [the API configuration](../development/api.md#configuration) for the other
environment variables.

## 5. nginx

```sh
cat > /etc/nginx/sites-available/timetable <<'EOF'
server {
  listen 80 default_server;
  server_name _;

  root /opt/timetable/web/dist;
  index index.html;

  gzip on;
  gzip_types text/css application/javascript application/json image/svg+xml application/manifest+json;

  location /api/ {
    proxy_pass http://127.0.0.1:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  # hashed assets can be cached forever.
  location /assets/ {
    add_header Cache-Control "public, max-age=31536000, immutable";
  }

  # the service worker and entry point must always be revalidated
  # so updates get picked up.
  location = /sw.js {
    add_header Cache-Control "no-cache";
  }

  location = /index.html {
    add_header Cache-Control "no-cache";
  }

  location / {
    try_files $uri $uri/ /index.html;
  }
}
EOF

ln -sf /etc/nginx/sites-available/timetable /etc/nginx/sites-enabled/timetable
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

The app is now served on the container's IP. Put your reverse proxy or
[certbot](https://certbot.eff.org) in front of it for HTTPS.

## Updating

```sh
cd /opt/timetable
git pull

cd api && cargo build --release && cd ..
systemctl restart timetable-api

bun install
cd web && APP_COMMIT_SHA=$(git rev-parse --short HEAD) bun run build && cd ..
```

The PWA picks the new version up on its next update check and prompts users to
restart.
