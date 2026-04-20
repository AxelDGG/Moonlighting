-- ============================================================================
-- Migración: subtipo (candil/plafón/retráctil) ahora vive en almacenamiento
-- ============================================================================
-- Antes el subtipo se elegía en cada pedido (frontend/src/modules/pedidos.js).
-- Por requerimiento operativo, el subtipo es una propiedad del modelo en
-- almacén; al elegir un modelo en pedido se hereda el subtipo automáticamente.
-- Aplica a categoría = 'abanico'. Para otras categorías queda NULL.
-- ============================================================================

BEGIN;

ALTER TABLE almacenamiento
  ADD COLUMN IF NOT EXISTS sub_tipo text;

COMMENT ON COLUMN almacenamiento.sub_tipo IS
  'Subtipo del modelo (candil/plafón/retráctil para abanicos). Se hereda en los pedidos.';

-- Validar valores permitidos para abanicos. Otras categorías pueden ser NULL.
ALTER TABLE almacenamiento
  DROP CONSTRAINT IF EXISTS almacenamiento_sub_tipo_check;
ALTER TABLE almacenamiento
  ADD CONSTRAINT almacenamiento_sub_tipo_check
    CHECK (
      categoria <> 'abanico'
      OR sub_tipo IS NULL
      OR sub_tipo IN ('plafón', 'plafon', 'candil', 'retráctil', 'retractil')
    );

COMMIT;
