
# Avalia

Analytics dashboard for the Portuguese residential housing market. Covers sale and rental prices across the eighteen municipalities of the Lisbon district, drillable down to parish (freguesia) level and broken out by typology (T0–T4+) and floor area.

The project was built for a hackathon and is composed of four independent parts that fit together as a single pipeline: raw CSV data is converted to SQL, loaded into a Cloudflare D1 database, exposed by a small Hono Worker, and consumed by a Vite + React dashboard.

---

## Repository layout

| Path | What lives here |
|---|---|
| `api/` | Cloudflare Worker (Hono + TypeScript) that serves the public REST API, backed by D1. |
| `backend/` | Offline Python pipeline that turns raw CSV exports into the `Create_Tables.sql` and `Insert_Queries.sql` shipped to D1. Not a long-running service. |
| `frontend/` | Vite + React 19 + TypeScript + Tailwind v4 + ShadcnUI dashboard. Charts via Recharts, map via D3-geo. |
| `report/` | LaTeX academic write-up of scope, methodology and findings, with a build script that produces `report.pdf`. |

---

## Architecture

```
CSV exports  ──►  Python conversion  ──►  Create_Tables.sql + Insert_Queries.sql
(backend/csv)     (backend/*.py)          (backend/sql/)
                                                │
                                                ▼
                                  Cloudflare D1  (habitacao_db)
                                                │
                                                ▼
                                    Hono Worker  (api/, "avalia-api")
                                                │
                                                ▼
                                  React frontend (frontend/, Cloudflare Pages)
```

The frontend either calls a deployed Worker via `VITE_API_URL`, or proxies `/api/*` to a local `wrangler dev` instance (default `http://127.0.0.1:8787`).

---

## Prerequisites

- Node.js 20+ and npm.
- Python 3.10+ (only if regenerating SQL from CSV).
- A Cloudflare account with `wrangler` authenticated (`npx wrangler login`).
- LuaLaTeX and Biber (only if building `report/report.pdf`).

---

## 1. Database (Cloudflare D1)

Create the database and load the schema plus the pre-built inserts. Run these from the repo root.

```bash
npx wrangler d1 create habitacao_db
npx wrangler d1 execute habitacao_db --remote --file=./backend/sql/Create_Tables.sql
npx wrangler d1 execute habitacao_db --remote --file=./backend/sql/Insert_Queries.sql
```

After `d1 create`, copy the printed `database_id` into `api/wrangler.toml` under the `[[d1_databases]]` block.

For a smaller smoke-test dataset, swap `Insert_Queries.sql` for `Insert_Demo_Data.sql`.

### Schema

A single table holds pre-aggregated rows; one row per `(month, sale type, typology, geography)` tuple.

```sql
CREATE TABLE habitacao (
    mes_ano        TEXT,    -- "YYYY-MM"
    tipo_venda     TEXT,    -- e.g. "venda", "arrendamento"
    tipo_habitacao TEXT,
    quartos        TEXT,    -- stored as numeric string ("0.0", "1.0", ...)
    distrito       TEXT,
    municipio      TEXT,
    freguesia      TEXT,    -- or "Grouped at Municipio level" for rolled-up rows
    total_rows     INTEGER,
    avg_area       REAL,
    avg_preco      REAL,
    avg_m2         REAL
);

CREATE INDEX idx_search_main ON habitacao (mes_ano, municipio, freguesia);
```

The Worker normalises `quartos` to the frontend-friendly `T0`..`T4+` format on read.

---

## 2. API (Cloudflare Worker)

```bash
cd api
npm install
npx wrangler dev          # local dev on http://127.0.0.1:8787
npx wrangler deploy       # publish to Cloudflare
```

`api/wrangler.toml` declares:

- `name = "avalia-api"`
- `[[d1_databases]] binding = "DB", database_name = "habitacao_db"`
- `[vars] ALLOWED_ORIGIN` — production frontend origin (added to CORS allowlist together with `http://localhost:5173` and `http://127.0.0.1:3000`).

### Endpoints

All endpoints return JSON.

| Method & path | Purpose | Query params |
|---|---|---|
| `GET /api/search` | Main query. Returns aggregated rows for a geography. | `level` (`district` \| `municipality` \| `parish`), `municipio`, `freguesia`, `tipo_venda`, `quartos` (`T0`..`T4+`), `min_area`, `max_area` |
| `GET /api/municipios` | Distinct municipality list. | — |
| `GET /api/freguesias` | Distinct parishes for a given municipality. | `municipio` (required) |
| `GET /api/health` | Liveness probe. Returns `{ok: true, service: "avalia-api"}`. | — |

Notes on `/api/search`:

- `level=district` is a special path. Because Lisboa has no pre-aggregated municipality-level rows in the dataset (only parish rows), the Worker synthesises them on the fly via a `UNION ALL` weighted by `total_rows`.
- `level=municipality` requires `municipio`; `level=parish` requires both `municipio` and `freguesia`.
- Omitting `level` falls back to a legacy free-form filter.
- `quartos=T4+` matches any row with four or more rooms.

---

## 3. Frontend

```bash
cd frontend
npm install
npm run dev               # http://localhost:5173
npm run build             # production build to frontend/dist
npm run typecheck         # tsc --noEmit
npm run lint              # eslint
```

Environment:

- `VITE_API_URL` — absolute base URL of the deployed Worker (e.g. `https://avalia-api.example.workers.dev`). When set, the frontend calls it directly.
- `VITE_DEV_API_TARGET` — used only by `vite dev` when `VITE_API_URL` is unset; Vite proxies `/api/*` to this target. Defaults to `http://127.0.0.1:8787` so `npm run dev` works alongside a local `wrangler dev`.

### Pages

Pages live in `frontend/src/pages/` and are lazy-loaded:

- `MarketOverview` — district heatmap, headline KPIs, drill-down to municipality and parish.
- `AIPredictions` — forward-looking price projections.
- `Signals` — momentum indicators (year-on-year growth, volume trends).
- `Compare` — side-by-side metrics for selected municipalities.
- `Rooms` — affordability broken out by typology (T0 to T4+).
- `Affordability` — income-to-price ratios.
- `TimeMachine` — historical price replay over the available months.

Cross-cutting state (filters, drill-down selection, API fetches) lives in `frontend/src/context/` and `frontend/src/hooks/useAvaliaData.ts`.

---

## 4. Data pipeline

The pipeline is a one-shot, run-on-demand process used to refresh the SQL files when new CSVs are dropped into `backend/csv/`.

```bash
cd backend
python3 convert_csv_to_inserts.py    # CSV -> backend/sql/Insert_Queries.sql
python3 convert_csv_to_json.py       # CSV -> backend/json/ (intermediate)
python3 convert_foreign.py           # auxiliary lookups
python3 count.py                     # row-count sanity checks
```

After regeneration, re-run the `d1 execute` commands in section 1 to push the refreshed inserts to D1.

---

## 5. Report

```bash
cd report
./build.sh                # or: ./build.sh -v   for verbose lualatex output
```

`build.sh` runs `lualatex`, then `biber`, then `lualatex` twice more to settle cross-references, and cleans up auxiliary files. Output: `report/report.pdf`.

---

## First-time scaffolding

These commands were used to bootstrap the project from scratch and are kept for reference only — they are not needed on an existing checkout.

```bash
# API: types for the Worker runtime
npm install -D typescript @cloudflare/workers-types

# Frontend: shadcn init and the components in use
npx shadcn@latest init --preset b0 --template vite
npx shadcn@latest add table badge button dropdown-menu mode-toggle
```
