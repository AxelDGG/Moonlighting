# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Moonlighting — Abanicos & Persianas** is a business management web app for a ceiling fan and blind installation company in Monterrey, NL. It handles clients, orders, calendar scheduling, route mapping, operational metrics, and AI-generated feedback.

## Stack & Running the App

No build system. The app is three plain files:
- `index.html` — all HTML structure and modals
- `app.js` — all application logic (`'use strict'`, vanilla JS)
- `style.css` — all styles

To run: open `index.html` in a browser or serve with any static file server (e.g. `npx serve .`). There are no tests, no linting, no compilation step.

**External dependencies via CDN** (no npm):
- Supabase JS v2 (`@supabase/supabase-js@2`)
- Leaflet 1.9.4 (map rendering)
- Groq API called directly via `fetch`

## Architecture

### Data Layer

Three global state arrays are the source of truth:
```
clientes[]          — customers
pedidos[]           — orders
servicios_metricas[]— service tracking records
```

These are loaded once on login via `loadAll()` (parallel Supabase queries), then kept in sync by `dbInsert*/dbUpdate*/dbDelete*` functions that update both Supabase and the local array.

DB mappers (`cFromDb/cToDb`, `pFromDb/pToDb`, `smFromDb`) handle snake_case ↔ camelCase conversion between Supabase rows and JS objects.

### Render Flow

Tab navigation calls `showTab(name)` → `render*()` functions read from global state arrays and write innerHTML. No virtual DOM, no reactivity — all re-renders are full repaints of the relevant section.

Pattern: `render*()` → reads state → builds HTML string → sets `innerHTML`.

### Modal System

Overlays use class `.ov` + `.open`. `openOv(id)` / `closeOv(id)` add/remove `.open`.

**Pedido modal** (`ov-ped`): `openPedidoModal(id=null)` handles both create and edit. When `id` is provided it's edit mode; `p-eid` hidden input stores the ID. `updatePF()` shows/hides fields based on service type — all referenced IDs (`r-ab-hd`, `r-pe-hd`, `r-nt-hd`, `r-modelo`, `r-ndesins`, `r-ancho`, `r-alto`, `r-inst`, `r-tela`, `r-notas`) must exist in the HTML or `updatePF()` crashes and the modal never opens.

**Cliente modal** (`ov-cli`): edit-only, no create flow.

### Key Subsystems

**Calendar** (`renderCalWeek` / `renderCalDay`): reads `pedidos[]` filtered by date. Day view shows edit (✏️) and tracking (📍) buttons per order. Week view chips call `openPedidoModal(id)`.

**Map** (`initMap` / `updateMapMarkers`): Leaflet map with geocoding via Nominatim. `getClientServiceStatus(clienteId)` derives marker color from `servicios_metricas`. Filter state in `mapFilter` object + `activeLayers` object for municipio toggles.

**Metrics** (`renderMetricas`): reads `servicios_metricas[]` joined with `pedidos[]`. All charts are hand-drawn SVG (donut) or `renderBarChart()` (bar rows).

**Groq LLM** (`generateFeedback`): calls `https://api.groq.com/openai/v1/chat/completions`. `buildMetricsData()` aggregates all KPIs → `buildGroqPrompt(data)` builds the prompt → response rendered via `mdToHtml()`. Model and key are constants at the top of the `GROQ LLM` section.

**Auth**: Supabase Auth via `db.auth.onAuthStateChange`. Login screen (`#login-screen`) shown by default; `#app-shell` has `display:none` until auth check passes.

### CSS Conventions

CSS variables defined in `:root`: `--p` (primary blue), `--bg`, `--card`, `--text`, `--mu` (muted), `--bo` (border), `--ok`, `--err`, `--wa` (warning).

Button classes: `btn bp` (primary), `btn bg` (gray), `btn bw` (white/outline), `btn bd` (danger), `btn bsm` (small). Cards use `.card > .ch` (header) + `.cb` (body). Tables use `.tw > table`.

## Supabase Tables

- `clientes` — customer records with geocoords and payment method
- `pedidos` — orders with `cliente_id` FK, `tipo_servicio`, `detalles` (JSONB)
- `servicios_metricas` — service tracking with timestamps, technician, delay data

Config constants (`SB_URL`, `SB_KEY`) are at the top of `app.js`.
