# Topvisor Rank Tracker — Migration & Rollback

This project applies its Prisma schema with **`prisma db push`** (the runtime entrypoint
and `update.sh` both use it; the `prisma/migrations/` folder is stale and does **not**
contain most current tables). Therefore the Topvisor schema change is applied the same
way — **do not run `prisma migrate`** here: it would try to baseline against the stale
history and could propose a destructive reset.

All new schema is **additive and nullable**, so `db push` applies it without touching or
dropping any existing data (`TrackedKeyword`, `RankCheck`, etc. are preserved).

## What changes

New tables: `TopvisorConnection`, `RankProject`, `RankRegion`, `RankJob`, `RankSummaryCache`.

New columns:
- `TrackedKeyword`: `provider` (default `"serp"`), `rankProjectId`, `externalKeywordId`,
  `externalGroupId`, `externalGroupName`, `active` (default `true`), `lastRemoteSyncAt`.
  Changed unique: `@@unique([siteId, keyword, device, country, provider])` (was without
  `provider`); added `@@unique([rankProjectId, keyword])` and indexes.
- `RankCheck`: `source` (default `"serp"`), `rankRegionId`, `externalCheckedAt`,
  `snippet`, `serpFeatures`, `syncedAt`; added index `[rankRegionId, checkedAt]`.

Existing rows get the column defaults (`provider="serp"`, `source="serp"`), so legacy
Rank Tracker keeps working unchanged.

## Apply (production)

```bash
cd /opt/gsc-bulk-tracker/app

# 1. ALWAYS back up first (SQLite lives on the Docker volume)
bash /opt/gsc-bulk-tracker/backup.sh
ls -lh /opt/gsc-bulk-tracker/backups/   # confirm a fresh copy

# 2. Deploy the new code + apply schema. The container entrypoint runs `prisma db push`
#    on start, which is idempotent and additive here.
git pull --ff-only origin main
docker compose -f compose.prod.yaml up -d --build

# 3. Verify the push succeeded
docker logs gsc-bulk-tracker 2>&1 | grep -i "in sync with your Prisma schema"
```

To apply the schema push manually (without a full rebuild), inside the container:

```bash
docker exec gsc-bulk-tracker npx prisma db push
```

## Verify

```bash
VOL=$(docker volume inspect -f '{{.Mountpoint}}' app_opengsc-data)
sqlite3 "$VOL/prod.db" ".tables" | tr ' ' '\n' | grep -iE "Topvisor|RankProject|RankRegion|RankJob|RankSummaryCache"
sqlite3 "$VOL/prod.db" "PRAGMA table_info(TrackedKeyword);" | grep -i provider
# Existing data intact:
sqlite3 "$VOL/prod.db" "SELECT count(*) FROM TrackedKeyword; SELECT count(*) FROM RankCheck;"
```

## Rollback

The new tables/columns are additive, so the safest rollback is simply to **redeploy the
previous commit** — the new tables are ignored by old code and hold no legacy data.

```bash
cd /opt/gsc-bulk-tracker/app
git checkout <previous-good-commit>
docker compose -f compose.prod.yaml up -d --build
```

If you also want to physically drop the new objects (optional; only after a DB backup):

```sql
-- Run against a COPY first. New columns on TrackedKeyword/RankCheck can stay (harmless);
-- SQLite DROP COLUMN is supported (3.35+) if you insist on removing them.
DROP TABLE IF EXISTS "RankSummaryCache";
DROP TABLE IF EXISTS "RankJob";
DROP TABLE IF EXISTS "RankCheck_topvisor_backup"; -- only if you created one
DROP TABLE IF EXISTS "RankRegion";
DROP TABLE IF EXISTS "RankProject";
DROP TABLE IF EXISTS "TopvisorConnection";
-- Optional column removal (SQLite 3.35+); leaving them is safe:
-- ALTER TABLE "TrackedKeyword" DROP COLUMN "rankProjectId"; ... etc.
```

> Note: `RankCheck` rows created by Topvisor (`source = 'topvisor'`) reference
> `rankRegionId`; if you drop `RankRegion` first, delete those rows too, or keep the
> additive columns and just disable the feature (see below) — the simplest rollback.

## Fastest rollback = feature flag (no schema change)

Set `TOPVISOR_RANK_TRACKER_ENABLED=false` in `.env` and restart. The Topvisor UI and
scheduler are disabled, the legacy Rank Tracker keeps working, and no data is removed.

```bash
# in /opt/gsc-bulk-tracker/app/.env
TOPVISOR_RANK_TRACKER_ENABLED=false
docker compose -f compose.prod.yaml up -d   # up -d (NOT restart) to reload .env
```
