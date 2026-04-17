# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Moonlighting — Abanicos & Persianas** is a business management app for a ceiling fan and blind installation company in Monterrey, NL. Stack: Fastify (Node.js) backend + Vite vanilla JS frontend, deployed on Vercel.

## Commands

```bash
# Dev (both servers concurrently)
npm run dev

# Frontend only (port 5173)
npm --prefix frontend run dev

# API only (port 3001)
npm --prefix api run dev

# Production build (Vite → frontend/dist)
npm run build

# Install deps for both packages
cd frontend && npm install && cd ../api && npm install
```

No tests or lint scripts.

## Architecture

### Monorepo layout

Two independent packages — **no npm workspaces** (removed; caused Vercel bundler conflicts):

```
api/
  index.js        Vercel handler — singleton (let app = null, reused across warm invocations)
  src/
    config.js     env vars destructured at module top (esbuild constraint — see below)
    app.js        createApp() — registers plugins then routes
    plugins/      cors, helmet, rate-limit, supabase, auth, msgraph
    routes/       clientes, pedidos, metricas, ai, calendar, tecnicos, pagos, catalogo, servicios, inventario, almacenamiento

frontend/
  index.html
  src/
    main.js       entry — wires auth, assigns window.* globals for HTML onclick handlers
    api.js        fetch wrapper — attaches Bearer token, all requests go to /api/*
    auth.js       Supabase client (VITE_ env vars), token stored in module-level _token
    state.js      global state arrays + DB row mappers (cFromDb/pFromDb/smFromDb)
    ui.js         toast, loader, overlay helpers, badge
    constants.js  TIPO_IC, TIPO_BG and other shared constants
    utils.js      money, esc, fdateShort, mdToHtml
    modules/      dashboard, clientes, pedidos, calendar, mapa, tracking, metricas, tecnicos, almacenamiento
```

### Request flow

```
Browser → fetch /api/* → Vite proxy (dev) / Vercel rewrite (prod) → api/index.js
                                          ↓ verifyAuth preHandler (validates Supabase JWT)
                                          ↓ route handler → fastify.supabase.from(...)
```

Frontend auth: Supabase client in `auth.js` handles login/session → JWT stored in `_token` → `api.js` attaches it as `Authorization: Bearer` on every request. Auth state listener in `auth.js` auto-refreshes `_token` on session changes.

All endpoints require auth — there are no public `/api/*` routes. Each route file applies `fastify.addHook('preHandler', fastify.verifyAuth)` at the module level.

### Critical Vercel/esbuild constraint

`api/src/config.js` **must** destructure `process.env` at module level before assigning values. Vercel's bundler cannot handle:
- `CallExpression` at module level — e.g. `requireEnv('X')`
- `BinaryExpression` on `process.env` — e.g. `process.env.X || 'default'`

**Working pattern:**
```js
const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
export const config = { supabaseUrl: SUPABASE_URL, ... };
```

Defaults belong in the callers (`cors.js`, `dev-server.js`), never in `config.js`.

### Frontend globals

`main.js` assigns all exported functions to `window.*` so HTML `onclick` attributes work with ES modules. If a new function needs to be callable from HTML, add it to `window` in `main.js`.

### Render pattern

`showTab(name)` → calls the relevant `render*()` function → reads from global state arrays → builds HTML string → sets `innerHTML`. No virtual DOM, no reactivity.

XSS: always call `esc()` before writing user data into innerHTML. `mdToHtml()` calls `esc()` internally before applying markdown transforms.

After any `innerHTML` update that includes icons, call `refreshIcons()` (from `utils.js`) so Lucide renders `<i data-lucide="...">` elements. Lucide is loaded via CDN in `index.html`.

### Modal/overlay pattern

All modal overlays pre-exist in `index.html` with IDs like `ov-cli`, `ov-ped`, `ov-track`. Modules expose `open*Modal(id)` to populate the form and call `openOv('ov-*')`, and `submit*()` to POST and refresh state. Closing calls `closeOv('ov-*')`.

### Data layer

`state.js` holds master data (`clientes`, `catalogo`, `tecnicos`, `metodoPago`, `estadosPedido`) and operational data (`pedidos`, `servicios`, `pagos`). Loaded once via `loadAll()`. All mutations go through `api.js` — no direct Supabase calls from modules.

DB mappers: `cFromDb`/`cToDb` (clientes), `pFromDb`/`pToDb` (pedidos), `smFromDb` (metricas) — handle snake_case ↔ camelCase conversion. Mappers support both legacy and current DB field names for backwards compatibility.

Routes also accept legacy field names (e.g., `numero`/`telefono`) and normalize them server-side before writing to Supabase.

### Supabase queries

Routes use PostgREST nested selects (e.g., `select('*, clientes(*)')`). Several read endpoints query **database views** (`v_pedidos_resumen`, `v_servicios_resumen`, `v_inventario_consolidado`) — changes to underlying tables must keep these views consistent.

Soft delete: deleting a `pedido` sets `estado_id = 'cancelado'` rather than removing the row. Before deleting a `cliente`, the route nullifies all their `pedidos.cliente_id` to avoid FK violations.

### Rate limiting

Global: 120 req/min per authenticated user (falls back to IP). Per-route override: `/api/ai/feedback` is limited to 10 req/min.

### Optional integrations

**Microsoft Graph / Outlook calendar** — enabled when `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_CALENDAR_USER` are set. Token is cached module-level and refreshed on expiry. Routes return 503 if `fastify.msGraph` is `null`. Outlook event IDs are stored inside `pedidos.detalles.outlook_event_id` (JSONB). Timezone is hardcoded to `America/Monterrey`.

**Groq LLM** (`/api/ai/feedback`) — uses `llama-3.3-70b-versatile` via OpenAI-compatible API. Returns Spanish operations feedback. Returns 503 if `GROQ_API_KEY` is missing.

### Environment variables

**API** (`api/.env` locally, Vercel env vars in production):
| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | service_role key (secret) |
| `GROQ_API_KEY` | Groq LLM API key |
| `FRONTEND_URL` | Allowed CORS origin |
| `MS_TENANT_ID` | Azure AD tenant (optional) |
| `MS_CLIENT_ID` | Azure app client ID (optional) |
| `MS_CLIENT_SECRET` | Azure app secret (optional) |
| `MS_CALENDAR_USER` | Outlook calendar user UPN (optional) |

**Frontend** (`frontend/.env` locally, Vercel env vars in production — must have `VITE_` prefix):
| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | anon/public key |

Frontend uses `import.meta.env.VITE_*`. API uses destructured `process.env`. Never mix them.

CORS also reads `process.env.VERCEL_URL` to allow Vercel preview deployment URLs automatically.

### Vercel config (`vercel.json`)

- **installCommand**: `cd frontend && npm install && cd ../api && npm install` — uses `cd`, not `--prefix` or workspace flags (both caused bundler issues)
- **buildCommand**: `cd frontend && npm run build`
- **outputDirectory**: `frontend/dist`
- **Rewrite**: `/api/(.*)` → `api/index.js`
- **Function limits**: `api/index.js` runs with 256 MB memory, 30-second max duration

### Supabase tables

- `clientes` — customers with geocoords and payment method
- `pedidos` — orders with `cliente_id` FK, `tipo_servicio`, `detalles` (JSONB)
- `servicios_metricas` — service tracking with timestamps, technician, delay data

### CSS conventions

Variables in `:root`: `--p` (primary blue), `--bg`, `--card`, `--text`, `--mu` (muted), `--bo` (border), `--ok`, `--err`, `--wa` (warning).

Button classes: `btn bp` (primary), `btn bg` (gray), `btn bw` (white/outline), `btn bd` (danger), `btn bsm` (small). Cards: `.card > .ch` (header) + `.cb` (body). Tables: `.tw > table`.

Leaflet loaded via CDN in `index.html` (exposes `L` globally) — map module in `modules/mapa.js`.
