# Deployment — gsc-bulk-tracker (OpenGSC)

Production deployment of OpenGSC via **Docker Compose** behind an **Nginx** reverse proxy.

```
Internet ──▶ Nginx (:80/:443, host) ──▶ 127.0.0.1:3000 (Docker container) ──▶ opengsc-data volume (/data/prod.db)
```

## Server

- Host: `38.180.114.48` (Ubuntu 24.04 LTS)
- App directory: `/opt/gsc-bulk-tracker`
  - `app/`      — the git checkout (this repository)
  - `backups/`  — daily SQLite backups (see [BACKUP-RESTORE.md](BACKUP-RESTORE.md))
  - `logs/`     — deploy/cron logs
- Container: `gsc-bulk-tracker` (image `gsc-bulk-tracker:local`), published on `127.0.0.1:3000` only.
- Persistent data: Docker named volume `opengsc-data` → `/data/prod.db` (SQLite).

## Prerequisites (installed once)

- Docker Engine + Compose plugin (official Docker apt repo)
- Nginx (host, reverse proxy + TLS termination)
- A domain/subdomain pointing at the server (required for Google OAuth + HTTPS)

## First-time deploy

```bash
# 1. Clone into the app directory
git clone https://github.com/VKOsad/gsc-bulk-tracker.git /opt/gsc-bulk-tracker/app
cd /opt/gsc-bulk-tracker/app

# 2. Create the environment file (NEVER commit it; chmod 600)
cp .env.example .env
# Generate a strong secret:
#   openssl rand -base64 32
# Fill in: NEXTAUTH_SECRET, NEXTAUTH_URL, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
nano .env
chmod 600 .env

# 3. Build & start (production compose file)
docker compose -f compose.prod.yaml up -d --build

# 4. Verify
docker compose -f compose.prod.yaml ps
curl -I http://127.0.0.1:3000/
```

`DATABASE_URL` in `.env` is intentionally overridden inside the container to
`file:/data/prod.db` on the `opengsc-data` volume. The container runs
`prisma db push` on every start, which applies schema changes idempotently
(no destructive `migrate reset` is ever used).

## Operations

| Action | Command (run in `/opt/gsc-bulk-tracker/app`) |
|---|---|
| Status | `docker compose -f compose.prod.yaml ps` |
| Logs (follow) | `docker compose -f compose.prod.yaml logs -f opengsc` |
| Restart | `docker compose -f compose.prod.yaml restart opengsc` |
| Stop | `docker compose -f compose.prod.yaml down` (keeps the volume) |
| Start | `docker compose -f compose.prod.yaml up -d` |
| Health | `docker inspect --format '{{.State.Health.Status}}' gsc-bulk-tracker` |
| Where is my data | `docker volume inspect <project>_opengsc-data` |

The container has `restart: unless-stopped`, so it comes back automatically after
a reboot (the Docker service is enabled on boot).

## Nginx

The reverse-proxy config lives at `/etc/nginx/sites-available/gsc-bulk-tracker`
(symlinked into `sites-enabled/`). It proxies the public domain to
`http://127.0.0.1:3000`, passes standard proxy headers, allows WebSocket upgrade,
and (once a domain is set) redirects HTTP→HTTPS with a Let's Encrypt certificate.
Reload after changes: `nginx -t && systemctl reload nginx`.

## Rollback

Because the deploy is a git checkout + rebuilt image, rollback = check out the
previous commit and rebuild:

```bash
cd /opt/gsc-bulk-tracker/app
git log --oneline -n 5            # find the previous good commit
git checkout <previous-commit>
docker compose -f compose.prod.yaml up -d --build
```

The `opengsc-data` volume (your data) is untouched by a rollback. Take a backup
first (see [BACKUP-RESTORE.md](BACKUP-RESTORE.md)) if the rollback also reverts a
schema change.

## Updating

See [UPDATES.md](UPDATES.md) for the upstream-merge + redeploy procedure.
