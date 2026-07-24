# Updates — pulling changes from upstream OpenGSC

This repository tracks the original project as the `upstream` remote so we can
pull future OpenGSC improvements in a controlled way. **No automatic/unattended
upstream updates.**

```
origin    → https://github.com/VKOsad/gsc-bulk-tracker   (our fork, deployed)
upstream  → https://github.com/fenjo26/opengsc           (original project)
```

## Update procedure (controlled)

Do this on a workstation, not directly on the server.

```bash
# 1. Fetch upstream
git fetch upstream

# 2. Review what changed
git log --oneline main..upstream/main

# 3. Merge on an integration branch (never straight into main)
git checkout main
git pull origin main
git checkout -b chore/upstream-merge-$(date +%Y%m%d)
git merge upstream/main        # or: git rebase upstream/main

# 4. Resolve conflicts, keeping our deployment files:
#      .env.example, compose.prod.yaml, docs/DEPLOYMENT.md, docs/UPDATES.md,
#      docs/BACKUP-RESTORE.md, docs/GOOGLE-OAUTH-SETUP.md
#    and the .gitignore "!.env.example" exception.

# 5. Test locally / in staging, then push and open a PR into main
git push -u origin chore/upstream-merge-$(date +%Y%m%d)
# open the PR, review, merge into main
```

## Deploy the update to the server

**Always back up first** (see [BACKUP-RESTORE.md](BACKUP-RESTORE.md)).

```bash
cd /opt/gsc-bulk-tracker/app

# Backup the DB before touching anything
bash /opt/gsc-bulk-tracker/backup.sh          # or the manual cp in BACKUP-RESTORE.md

# Pull the reviewed main and rebuild
git fetch origin
git checkout main
git pull --ff-only origin main
docker compose -f compose.prod.yaml up -d --build

# Verify
docker compose -f compose.prod.yaml ps
curl -I http://127.0.0.1:3000/
docker compose -f compose.prod.yaml logs --tail=50 opengsc
```

The container applies schema changes automatically via `prisma db push` on start.

> Note: the upstream repo also ships an in-app "Update" button (`update.sh`) that
> does `git reset --hard origin/main` + rebuild for the **native/PM2** install.
> We use Docker, so update via the Compose flow above. Avoid `update.sh` on this
> deployment — a hard reset would discard any local server-side changes.

## Rollback an update

```bash
cd /opt/gsc-bulk-tracker/app
git checkout <previous-good-commit>
docker compose -f compose.prod.yaml up -d --build
# restore the pre-update DB backup only if a schema change must be reverted
```
