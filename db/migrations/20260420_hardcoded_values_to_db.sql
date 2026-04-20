-- 20260420_hardcoded_values_to_db.sql
--
-- Migra valores hardcoded del código (duraciones SLA, pricing, geo-data, zonas
-- postales) a tablas de configuración en Supabase. El objetivo es permitir que
-- un admin actualice tarifas, SLAs o expanda la app a otra ciudad sin redeploy.
--
-- También normaliza estados de servicio: `servicios_metricas` usa `'en_curso'`
-- mientras que `servicios` y el frontend (post-migración) usan `'en_proceso'`.
-- Esta migración unifica ambos lados a `'en_proceso'`.
--
-- Idempotente: usa IF NOT EXISTS / ON CONFLICT.

BEGIN;

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. TABLA: pricing_config
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pricing_config (
  clave        text PRIMARY KEY,
  valor        numeric(12, 2) NOT NULL,
  descripcion  text,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

INSERT INTO pricing_config (clave, valor, descripcion) VALUES
  ('costo_desinstalacion_por_ud', 100, 'Cargo por abanico a desinstalar (MXN por unidad)'),
  ('costo_traslado_default',        0, 'Costo de traslado por defecto (MXN)')
ON CONFLICT (clave) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. TABLA: service_duration_subtipos
--    Duraciones promedio de servicio por tipo/subtipo. Reemplaza durations.js
--    (api/_src/durations.js y frontend/src/durations.js).
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_duration_subtipos (
  id              serial PRIMARY KEY,
  tipo_servicio   text NOT NULL,
  subtipo         text,                            -- NULL = default para el tipo
  per_unit        boolean NOT NULL DEFAULT true,
  duracion_min    integer NOT NULL CHECK (duracion_min > 0),
  desinstalacion_per_ud integer,                   -- solo aplica a Abanico
  UNIQUE (tipo_servicio, subtipo)
);

-- Seed desde api/_src/durations.js / frontend/src/durations.js
INSERT INTO service_duration_subtipos (tipo_servicio, subtipo, per_unit, duracion_min, desinstalacion_per_ud) VALUES
  ('Abanico',       NULL,        true,  25, 10),
  ('Abanico',       'plafón',    true,  25, 10),
  ('Abanico',       'retráctil', true,  25, 10),
  ('Abanico',       'candil',    true,  57, 10),
  ('Persiana',      NULL,        true,  37, NULL),
  ('Levantamiento', NULL,        false, 20, NULL),
  ('Mantenimiento', NULL,        true,  40, NULL),
  ('Mantenimiento', 'plafón',    true,  40, NULL),
  ('Mantenimiento', 'candil',    true,  75, NULL),
  ('Mantenimiento', 'persiana',  true,  35, NULL),
  ('Mantenimiento', 'arreglos',  true,  30, NULL),
  ('Limpieza',      NULL,        true,  30, NULL)
ON CONFLICT (tipo_servicio, subtipo) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. TABLA: geo_regions
--    Región base de la organización (centro del mapa, timezone, estado default).
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS geo_regions (
  id             serial PRIMARY KEY,
  organizacion   text NOT NULL DEFAULT 'default',
  estado         text NOT NULL,
  timezone       text NOT NULL,
  center_lat     double precision NOT NULL,
  center_lng     double precision NOT NULL,
  default_zoom   integer NOT NULL DEFAULT 11,
  is_default     boolean NOT NULL DEFAULT false,
  UNIQUE (organizacion, estado)
);

INSERT INTO geo_regions (organizacion, estado, timezone, center_lat, center_lng, default_zoom, is_default) VALUES
  ('default', 'Nuevo León', 'America/Monterrey', 25.6866, -100.3161, 11, true)
ON CONFLICT (organizacion, estado) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. TABLA: municipios
--    Municipios con coordenadas, color y radio. Reemplaza MUNIS en
--    frontend/src/constants.js.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS municipios (
  id             serial PRIMARY KEY,
  region_id      integer NOT NULL REFERENCES geo_regions(id) ON DELETE CASCADE,
  nombre         text NOT NULL,
  color          text NOT NULL,
  center_lat     double precision NOT NULL,
  center_lng     double precision NOT NULL,
  radius_meters  integer NOT NULL CHECK (radius_meters > 0),
  UNIQUE (region_id, nombre)
);

-- Seed (8 municipios del área metropolitana de Monterrey)
WITH r AS (SELECT id FROM geo_regions WHERE estado = 'Nuevo León' AND organizacion = 'default')
INSERT INTO municipios (region_id, nombre, color, center_lat, center_lng, radius_meters)
SELECT r.id, m.nombre, m.color, m.lat, m.lng, m.radius
FROM r, (VALUES
  ('Monterrey',                '#3b82f6', 25.6694, -100.3097, 7500),
  ('San Pedro Garza García',   '#22c55e', 25.6519, -100.4042, 4500),
  ('Guadalupe',                '#ef4444', 25.6800, -100.2540, 5000),
  ('San Nicolás de los Garza', '#a855f7', 25.7395, -100.3063, 4500),
  ('Apodaca',                  '#f59e0b', 25.7735, -100.1949, 5500),
  ('General Escobedo',         '#06b6d4', 25.7955, -100.3292, 5500),
  ('Santa Catarina',           '#ec4899', 25.6733, -100.4602, 6000),
  ('García',                   '#84cc16', 25.7972, -100.5877, 8000)
) AS m(nombre, color, lat, lng, radius)
ON CONFLICT (region_id, nombre) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. TABLA: postal_zones
--    Rangos de códigos postales por municipio/zona. Reemplaza
--    ZONAS_POR_MUNICIPIO en frontend/src/zonas.js.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS postal_zones (
  id            serial PRIMARY KEY,
  municipio_id  integer NOT NULL REFERENCES municipios(id) ON DELETE CASCADE,
  zona          text NOT NULL,
  cp_start      integer NOT NULL,
  cp_end        integer NOT NULL,
  CHECK (cp_end >= cp_start)
);

-- Seed desde frontend/src/zonas.js
WITH m AS (SELECT id, nombre FROM municipios)
INSERT INTO postal_zones (municipio_id, zona, cp_start, cp_end)
SELECT m.id, z.zona, z.cp_start, z.cp_end
FROM (VALUES
  ('Monterrey',                'Norte',    64200, 64699),
  ('Monterrey',                'Centro',   64000, 64199),
  ('Monterrey',                'Sur',      64700, 64999),
  ('Santa Catarina',           'Oriente',  66100, 66249),
  ('Santa Catarina',           'Poniente', 66250, 66399),
  ('San Pedro Garza García',   'Oriente',  66200, 66249),
  ('San Pedro Garza García',   'Poniente', 66250, 66299),
  ('Guadalupe',                'Poniente', 67100, 67199),
  ('Guadalupe',                'Oriente',  67200, 67299),
  ('San Nicolás de los Garza', 'Poniente', 66400, 66450),
  ('San Nicolás de los Garza', 'Oriente',  66451, 66499),
  ('General Escobedo',         'Sur',      66050, 66074),
  ('General Escobedo',         'Norte',    66075, 66099),
  ('Apodaca',                  'Poniente', 66600, 66630),
  ('Apodaca',                  'Centro',   66631, 66649),
  ('Apodaca',                  'Oriente',  66650, 66699),
  ('García',                   'Oriente',  66000, 66015),
  ('García',                   'Centro',   66016, 66034),
  ('García',                   'Poniente', 66035, 66059)
) AS z(mun, zona, cp_start, cp_end)
JOIN m ON m.nombre = z.mun
ON CONFLICT DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────────
-- 6. TABLA: municipio_aliases
--    Normalización de nombres de municipios ("mty" → "Monterrey").
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS municipio_aliases (
  alias         text PRIMARY KEY,
  municipio_id  integer NOT NULL REFERENCES municipios(id) ON DELETE CASCADE
);

WITH m AS (SELECT id, nombre FROM municipios)
INSERT INTO municipio_aliases (alias, municipio_id)
SELECT a.alias, m.id
FROM (VALUES
  ('monterrey', 'Monterrey'),
  ('mty',       'Monterrey'),
  ('san pedro', 'San Pedro Garza García'),
  ('sp',        'San Pedro Garza García'),
  ('guadalupe', 'Guadalupe'),
  ('san nicolas', 'San Nicolás de los Garza'),
  ('san nicolás', 'San Nicolás de los Garza'),
  ('nicolas',   'San Nicolás de los Garza'),
  ('apodaca',   'Apodaca'),
  ('escobedo',  'General Escobedo'),
  ('santa catarina', 'Santa Catarina'),
  ('garcia',    'García'),
  ('garcía',    'García')
) AS a(alias, mun)
JOIN m ON m.nombre = a.mun
ON CONFLICT (alias) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────────
-- 7. NORMALIZACIÓN DE ESTADOS LEGACY
--    servicios_metricas.estado usaba 'en_curso'; unificamos a 'en_proceso'
--    para consistencia con servicios.estado y frontend post-refactor.
-- ──────────────────────────────────────────────────────────────────────────────
UPDATE servicios_metricas SET estado = 'en_proceso' WHERE estado = 'en_curso';

-- ──────────────────────────────────────────────────────────────────────────────
-- 8. RLS — todas las tablas de config son de lectura pública autenticada y
--    escritura solo vía service_role (lo cual ignora RLS, así que no hace falta
--    policy de write).
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE pricing_config             ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_duration_subtipos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE geo_regions                ENABLE ROW LEVEL SECURITY;
ALTER TABLE municipios                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE postal_zones               ENABLE ROW LEVEL SECURITY;
ALTER TABLE municipio_aliases          ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_auth" ON pricing_config;
DROP POLICY IF EXISTS "read_auth" ON service_duration_subtipos;
DROP POLICY IF EXISTS "read_auth" ON geo_regions;
DROP POLICY IF EXISTS "read_auth" ON municipios;
DROP POLICY IF EXISTS "read_auth" ON postal_zones;
DROP POLICY IF EXISTS "read_auth" ON municipio_aliases;

CREATE POLICY "read_auth" ON pricing_config            FOR SELECT TO authenticated USING (true);
CREATE POLICY "read_auth" ON service_duration_subtipos FOR SELECT TO authenticated USING (true);
CREATE POLICY "read_auth" ON geo_regions               FOR SELECT TO authenticated USING (true);
CREATE POLICY "read_auth" ON municipios                FOR SELECT TO authenticated USING (true);
CREATE POLICY "read_auth" ON postal_zones              FOR SELECT TO authenticated USING (true);
CREATE POLICY "read_auth" ON municipio_aliases         FOR SELECT TO authenticated USING (true);

COMMIT;
