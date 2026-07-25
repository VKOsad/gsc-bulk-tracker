# Topvisor Integration — Connecting Your Account

The Rank Tracker uses [Topvisor](https://topvisor.com) as its position-tracking
provider. This page covers connecting your Topvisor account securely.

## 1. Get your Topvisor credentials

- **User ID** — Topvisor → your profile → *API* (or *Settings → API*). It is a number
  (e.g. `376374`). Not secret.
- **API Key** — same *API* page → *Create key* (or copy an existing one). **Secret.**

## 2. Server prerequisite — encryption key

The API key is stored **encrypted at rest** (AES-256-GCM). Set a 32-byte encryption
key in the server `.env` before connecting:

```bash
# generate once:
openssl rand -hex 32
# then in /opt/gsc-bulk-tracker/app/.env
TOPVISOR_ENCRYPTION_KEY=<the 64-hex value>
TOPVISOR_RANK_TRACKER_ENABLED=true
```

Apply with `docker compose -f compose.prod.yaml up -d` (use `up -d`, not `restart`,
so the new `.env` is read).

If `TOPVISOR_ENCRYPTION_KEY` is missing, the connection form shows a warning and
saving is blocked — the key cannot be stored safely without it.

## 3. Connect

App → **Settings → Съём позиций (Topvisor)**:

1. Enter **Topvisor User ID** and **API Key**.
2. **Save** — the app verifies the credentials against Topvisor, then stores the key
   encrypted. Status shows **Connected** with the last-verified time.
3. **Test connection** re-checks any time. **Disconnect** removes the stored key.

## Security model

- The API key is **never** returned to the browser, logged, put in an error message,
  committed to git, or placed in `.env.example`.
- It is encrypted with `TOPVISOR_ENCRYPTION_KEY` and only decrypted **inside a
  server-side call** (`src/lib/topvisor/connection.ts` → `secretBox.ts`).
- All Topvisor API calls happen server-side only. Guests / share links cannot reach
  any `/api/topvisor/*` route.
- After first setup, consider **rotating the Topvisor API key** if it ever passed
  through an insecure channel.

## Environment variables

| Var | Required | Purpose |
|---|---|---|
| `TOPVISOR_ENCRYPTION_KEY` | to connect | 32-byte (hex) AES-256-GCM key for the API key at rest |
| `TOPVISOR_RANK_TRACKER_ENABLED` | no (default `true`) | Feature flag — `false` hides the UI + stops the scheduler; legacy Rank Tracker keeps working |

See also: [TOPVISOR-RANK-TRACKER.md](TOPVISOR-RANK-TRACKER.md),
[TOPVISOR-TROUBLESHOOTING.md](TOPVISOR-TROUBLESHOOTING.md),
[TOPVISOR-MIGRATION-ROLLBACK.md](TOPVISOR-MIGRATION-ROLLBACK.md).
