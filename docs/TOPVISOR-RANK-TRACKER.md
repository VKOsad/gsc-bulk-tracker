# Rank Tracker (Topvisor) — Usage

A project-based Google position tracker. Topvisor is the source of truth for remote
projects, regions, keywords, results, price and check status; the app keeps a local
binding + cache so the portfolio and history render instantly.

Prerequisite: [connect Topvisor](TOPVISOR-INTEGRATION.md).

## Portfolio — `/rank-tracker`

Lists **every** GSC site with its Rank Tracker status. Built entirely from the local
DB (no per-site Topvisor call), so it scales to hundreds of sites. Search, filter by
status, paginate. A banner appears when new GSC sites are found without a project.

Per-site actions:
- **Add project** — unconfigured site → opens the setup wizard.
- **Continue setup** — a partially-configured project.
- **Open positions** — an active project → the history page.

New GSC sites (added automatically by GSC sync) show up here as **Not set up**. No
Topvisor project or paid check is ever created automatically.

## Setup wizard

1. **Project** — create a new Topvisor project or **link** an existing one. If a
   project with the same domain already exists in Topvisor, the wizard offers to link
   it (no duplicates are created). Idempotent: re-running after a partial failure
   resumes, it never creates a second project.
2. **Google GEO** — country, region/city (searched live against Topvisor), device
   (**Desktop** / **Mobile**), and **depth** (Top-10 … **Top-50**).
   > Note: Topvisor's Google depth maxes out at **Top-50** — Top-100 is not available.
   Each region + device combination is stored as its own region.
3. **Keywords** — one phrase per line. A live preview shows valid / duplicate /
   rejected counts. Whitespace is normalized; nothing is stripped or case-changed.
   Keywords are **not** imported from GSC automatically.
4. **Cost** — the wizard creates the project + regions + keywords (all **free**), then
   shows the **price** of a check. Ticking *"run first check"* and confirming the
   quoted price launches one paid check.

### region_key vs region_index

Topvisor uses two different region identifiers, both stored locally:
- **region_key** — the region's id in Topvisor's global DB; used when **adding** a
  region to a project.
- **region_index** — the index of that region **within the project**; used when
  **querying** history / price / running a check.
They are **not** interchangeable.

## Checking positions (paid)

On the project page → **Check positions**:
1. The app requests the **price** from Topvisor and shows it.
2. Only after you **confirm** does it launch the check (`checker/go`, async).
3. The check runs as a **background job** — the request returns immediately with a job
   id; progress is polled. When Topvisor reports it complete, results are synced
   automatically and the table/KPI refresh.

A paid check is **never** run automatically on page load, GSC sync, deploy, restart,
or by tests. Double-click / re-run is guarded (one active check per project).

## Automatic schedule

Per project you can enable **Daily** / **Weekly** auto-checks. Before each scheduled
run the app quotes the price and **skips** the run (recording the reason) if it
exceeds the project's cost limit. Default is **Manual**.

## History page — `/rank-tracker/[projectId]`

- **KPI:** movement (up / same / down), average position (+ delta), median position,
  Top distribution (Top-3/10/30/50/100/beyond/not-found).
- **Table:** keywords × the actual check dates. Each cell shows the position and the
  change vs the previous check (green ↑ = improved, red ↓ = dropped). Sticky keyword
  column, horizontal scroll, search + improved/dropped filters, region + period
  selectors.
- **Keyword chart:** expand a row to see the position trend (reversed Y-axis — 1 at
  the top) with the **Topvisor** series and the **GSC** average-position overlay.

## Sync

**Sync** pulls the latest positions from Topvisor into the local cache (free). Use it
if positions were checked outside the app, or to refresh after a check.

## Jobs & logs

Background work is tracked in the `RankJob` table (create_project / import_keywords /
price / check / sync). Server logs are tagged `[topvisorScheduler]`; view with
`docker compose -f compose.prod.yaml logs -f opengsc`.
