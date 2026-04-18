-- ═══════════════════════════════════════════════════════════════════════════
-- Geocoding pipeline + PostGIS zones
-- ═══════════════════════════════════════════════════════════════════════════
-- Adds:
--   1. clientes.geocode_source / geocode_confidence / ubicacion_verificada /
--      verified_at / reverse_municipio / reverse_cp
--   2. geocode_cache — avoids hammering Nominatim
--   3. PostGIS + zonas table — polygonal definitions of operating zones
--   4. v_clientes_zona — joins each client to its zone via ST_Intersects
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Columnas nuevas en clientes ─────────────────────────────────────────────
alter table if exists clientes
  add column if not exists geocode_source       text,    -- 'google_url' | 'manual_drag' | 'nominatim_structured' | 'nominatim_free' | 'mapbox' | 'google'
  add column if not exists geocode_confidence   text,    -- 'high' | 'medium' | 'low'
  add column if not exists ubicacion_verificada boolean not null default false,
  add column if not exists verified_at          timestamptz,
  add column if not exists reverse_municipio    text,
  add column if not exists reverse_cp           text;

-- Mismo tratamiento para cliente_direcciones
alter table if exists cliente_direcciones
  add column if not exists geocode_source       text,
  add column if not exists geocode_confidence   text,
  add column if not exists ubicacion_verificada boolean not null default false,
  add column if not exists verified_at          timestamptz,
  add column if not exists reverse_municipio    text,
  add column if not exists reverse_cp           text;

-- 2) Caché de geocoding ─────────────────────────────────────────────────────
create table if not exists geocode_cache (
  query_hash     text primary key,              -- sha256 del query normalizado
  query_text     text not null,                 -- query tal como se envió
  provider       text not null,                 -- 'nominatim' | 'mapbox' | 'google'
  mode           text not null,                 -- 'search' | 'reverse' | 'structured'
  lat            numeric,
  lng            numeric,
  municipio      text,
  codigo_postal  text,
  display_name   text,
  raw_response   jsonb,
  hit_count      integer not null default 0,
  created_at     timestamptz not null default now(),
  last_used_at   timestamptz not null default now()
);

create index if not exists idx_geocode_cache_last_used
  on geocode_cache (last_used_at desc);

-- 3) PostGIS + zonas ─────────────────────────────────────────────────────────
create extension if not exists postgis;

create table if not exists zonas_geo (
  id           serial primary key,
  municipio    text not null,
  zona         text not null,
  color        text,
  notas        text,
  geom         geography(MultiPolygon, 4326) not null,
  activo       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (municipio, zona)
);

create index if not exists idx_zonas_geo_geom on zonas_geo using gist (geom);

-- Columna geográfica derivada de lat/lng en clientes (auto-mantenida)
alter table if exists clientes
  add column if not exists geom geography(Point, 4326)
  generated always as (
    case
      when lat is not null and lng is not null
      then st_setsrid(st_makepoint(lng, lat), 4326)::geography
      else null
    end
  ) stored;

create index if not exists idx_clientes_geom on clientes using gist (geom);

-- 4) Vista: cliente → zona por point-in-polygon ──────────────────────────────
--
-- Si hay un polígono que contiene el punto, devuelve esa zona.
-- Si no, deja columnas de zona nulas — el frontend aplicará su fallback por CP.
create or replace view v_clientes_zona as
select
  c.*,
  z.id         as zona_geo_id,
  z.municipio  as zona_municipio,
  z.zona       as zona_nombre,
  z.color      as zona_color
from clientes c
left join lateral (
  select zg.id, zg.municipio, zg.zona, zg.color
  from zonas_geo zg
  where zg.activo
    and c.geom is not null
    and st_intersects(zg.geom, c.geom)
  order by zg.id
  limit 1
) z on true;

-- 5) RLS — heredar de la tabla clientes; geocode_cache y zonas_geo abiertos al service_role
alter table geocode_cache enable row level security;
alter table zonas_geo     enable row level security;

-- service_role bypasses RLS; no policies needed for the app.
-- Si quieres dar acceso anónimo a zonas_geo (para mapas públicos) crea una policy aquí.

comment on table  geocode_cache is 'Caché de resultados de geocoding. TTL lógico: 90 días desde last_used_at.';
comment on table  zonas_geo     is 'Polígonos de zonas operativas. Importar desde geojson.io / QGIS con ST_GeomFromGeoJSON.';
comment on view   v_clientes_zona is 'Clientes enriquecidos con su zona por point-in-polygon. Nulo si no hay polígono que los contenga.';
