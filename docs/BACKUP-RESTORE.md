# Backup & Restore

All persistent state is a single SQLite file, `prod.db`, on the Docker named
volume `opengsc-data` (mounted at `/data/prod.db` inside the container).

## What is backed up

- `prod.db` — the entire application database (users, GSC tokens, cached data).

## What is NOT in backups (by design)

- `.env` — contains secrets. Back it up **separately and encrypted**, or store the
  values in a password manager. It is never committed to git and is excluded from
  the DB backup archive.

## Automated daily backup

A cron job runs `/opt/gsc-bulk-tracker/backup.sh` daily. It:

1. Copies `prod.db` out of the volume using SQLite's online backup (`.backup`,
   safe while the app is running), or a container-side `cp` fallback.
2. Runs `PRAGMA integrity_check` to verify the copy.
3. Compresses it to `/opt/gsc-bulk-tracker/backups/prod-YYYY-MM-DD.db.gz`.
4. Keeps the **last 7** daily copies (older ones are pruned).

Check backups:

```bash
ls -lh /opt/gsc-bulk-tracker/backups/
cat /opt/gsc-bulk-tracker/logs/backup.log
```

> ⚠️ Local backups live on the same VPS. They protect against app/DB corruption
> and bad deploys, **not** against total VPS loss. For disaster recovery, copy the
> `backups/` directory to off-site storage (S3/R2/rsync) — not yet configured.

## Manual backup (on demand)

```bash
# Online, consistent copy via SQLite backup API (preferred)
docker exec gsc-bulk-tracker sh -c \
  "npx --yes prisma db execute --stdin <<'SQL' >/dev/null 2>&1; sqlite3 /data/prod.db \".backup '/data/backup.db'\""
# Simpler: plain copy of the file out of the container
docker compose -f compose.prod.yaml cp opengsc:/data/prod.db ./prod-$(date +%F).db
```

## Verify a backup archive

```bash
gunzip -t /opt/gsc-bulk-tracker/backups/prod-YYYY-MM-DD.db.gz && echo "gzip OK"
# Integrity check on a decompressed copy:
gunzip -c /opt/gsc-bulk-tracker/backups/prod-YYYY-MM-DD.db.gz > /tmp/verify.db
sqlite3 /tmp/verify.db "PRAGMA integrity_check;"   # expect: ok
rm -f /tmp/verify.db
```

## Restore

```bash
cd /opt/gsc-bulk-tracker/app

# 1. Stop the app so the DB is not being written
docker compose -f compose.prod.yaml stop opengsc

# 2. Decompress the chosen backup
gunzip -c /opt/gsc-bulk-tracker/backups/prod-YYYY-MM-DD.db.gz > /tmp/restore.db
sqlite3 /tmp/restore.db "PRAGMA integrity_check;"   # must print: ok

# 3. Copy it back into the volume as prod.db
docker compose -f compose.prod.yaml start opengsc
docker compose -f compose.prod.yaml cp /tmp/restore.db opengsc:/data/prod.db
docker compose -f compose.prod.yaml restart opengsc
rm -f /tmp/restore.db

# 4. Verify the app
curl -I http://127.0.0.1:3000/
```
