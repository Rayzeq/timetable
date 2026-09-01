# Installation on Proxmox (LXC)

The whole stack - Valkey, the API and Caddy serving the PWA - fits in a single
unprivileged Alpine LXC container, based on the
[community-scripts Valkey container](https://community-scripts.org/scripts/valkey).

## 1. Create the container

From the shell of the Proxmox node:

```sh
var_os='alpine' var_cpu=2 var_ram=2048 var_disk=8 \
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/ct/valkey.sh)"
```

The script's Alpine defaults (1 vCPU, 256 MB RAM, 1 GB disk) are enough to *run*
the stack but not to *build* it, hence the bumped `var_*` overrides.

The container comes with Valkey already running as an OpenRC service, bound to
`0.0.0.0` with a generated password stored in `~/valkey.creds`. Since only the
local API needs it, you can bind it back to localhost:

```sh
sed -i 's/^bind .*/bind 127.0.0.1/' /etc/valkey/valkey.conf
rc-service valkey restart
```

Everything below runs inside the container (`pct enter <ctid>`).

## 2. Packages and toolchains

```sh
apk update
apk add git bash curl build-base pkgconf openssl-dev libstdc++ caddy

# rust, for the api.
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
. "$HOME/.cargo/env"

# bun, for the web build.
curl -fsSL https://bun.sh/install | bash
export PATH="$HOME/.bun/bin:$PATH"
```

## 3. Build

```sh
git clone https://code.vexcited.com/unilim/timetable /opt/timetable
cd /opt/timetable

# api.
cd api && cargo build --release && cd ..

# web.
bun install
cd web && APP_COMMIT_SHA=$(git rev-parse --short HEAD) bun run build && cd ..
```

## 4. The API as a service

```sh
adduser -S -D -H timetable
VALKEY_PASS=$(cat ~/valkey.creds)

cat > /etc/init.d/timetable-api <<EOF
#!/sbin/openrc-run
supervisor=supervise-daemon
name="timetable-api"
command="/opt/timetable/api/target/release/unilim-timetable-api"
command_user="timetable"
supervise_daemon_args="--env LISTEN_ADDRESS=127.0.0.1:8000 --env CACHE_URL=redis://:${VALKEY_PASS}@127.0.0.1:6379 --stdout /var/log/timetable-api.log --stderr /var/log/timetable-api.log"

depend() {
	need net
	use valkey
}
EOF

chmod +x /etc/init.d/timetable-api
rc-update add timetable-api default
rc-service timetable-api start

curl http://127.0.0.1:8000/api/health
```

See [the API configuration](../development/api.md#configuration) for the other
environment variables.

## 5. Caddy

```sh
cat > /etc/caddy/Caddyfile <<'EOF'
:80 {
	encode gzip
	root * /opt/timetable/web/dist

	handle /api/* {
		reverse_proxy 127.0.0.1:8000
	}

	# hashed assets can be cached forever.
	handle /assets/* {
		header Cache-Control "public, max-age=31536000, immutable"
		file_server
	}

	# everything else - the entry point and the service worker included -
	# must always be revalidated so updates get picked up.
	handle {
		header Cache-Control "no-cache"
		try_files {path} /index.html
		file_server
	}
}
EOF

caddy validate --config /etc/caddy/Caddyfile
rc-update add caddy default
rc-service caddy start
```

The app is now served on the container's IP. If the container is directly
reachable on ports 80/443, replacing `:80` with your domain name gets you
automatic HTTPS from Caddy; behind another reverse proxy, keep `:80` as is.

## Updating

```sh
cd /opt/timetable
git pull

cd api && cargo build --release && cd ..
rc-service timetable-api restart

bun install
cd web && APP_COMMIT_SHA=$(git rev-parse --short HEAD) bun run build && cd ..
```

The PWA picks the new version up on its next update check and prompts users to
restart. Valkey itself is updated through the community script's management menu,
by rerunning the creation command on the node.
