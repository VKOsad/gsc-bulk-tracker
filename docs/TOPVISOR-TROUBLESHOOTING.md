# Topvisor Rank Tracker — Troubleshooting

Errors are surfaced with a stable code. Common ones and fixes:

| Code / message | Cause | Fix |
|---|---|---|
| **TOPVISOR_ENCRYPTION_NOT_CONFIGURED** | `TOPVISOR_ENCRYPTION_KEY` not set | Add a 32-byte hex key (`openssl rand -hex 32`) to `.env`, then `docker compose … up -d`. |
| **TOPVISOR_AUTH_FAILED** (remote code 53) | Wrong User ID or API key | Re-check both on Topvisor's API page; re-save the connection. |
| **TOPVISOR_INSUFFICIENT_BALANCE** | Not enough balance for the check | Top up the Topvisor account. |
| **TOPVISOR_RATE_LIMITED** (429) | >5 concurrent requests to Topvisor | Transient — the client retries with backoff; try again shortly. |
| **TOPVISOR_CHECK_ALREADY_RUNNING** | A check is already in flight for the project | Wait for it to finish (progress shown on the project page). |
| **TOPVISOR_PROJECT_DUPLICATE** | A Topvisor project already exists for this domain | Use **Link existing project** in the wizard instead of Create. |
| **TOPVISOR_REGION_NOT_CONFIGURED** | No region_index yet | Finish the wizard's GEO step; run **Sync** to pull the region index. |
| **COST_LIMIT_EXCEEDED** | Scheduled check price > the project's cost limit | Raise the limit or reduce keywords/regions/depth. |
| **RANK_PROJECT_PARTIAL** | Setup didn't complete | Open the site → **Continue setup**. |

## Positions are all "—" after a check

- A check runs asynchronously on Topvisor. Results appear after it completes and the
  scheduler syncs them (within a few minutes). Click **Sync** to pull immediately.
- Brand-new domains may genuinely have no positions in the tracked Top-N.

## Region search returns nothing

- Type at least 2 characters. Optionally set a 2-letter **country code** to narrow it.
- Results are cached server-side for 10 minutes.

## The Topvisor section / page is missing

- `TOPVISOR_RANK_TRACKER_ENABLED=false` hides the UI and stops the scheduler. Set it
  to `true` (or remove it) and `docker compose … up -d`.

## Google depth only goes to Top-50

Expected — Topvisor's Google position depth maxes at Top-50 (depth 1–5). Top-100 is
not offered by the provider.

## Alerts

Existing rank-drop Telegram alerts keep working: Topvisor keywords update the same
`TrackedKeyword.lastPosition` / `prevPosition` fields the alert scheduler reads.

## Logs

```bash
docker compose -f compose.prod.yaml logs -f opengsc | grep -i topvisor
```
