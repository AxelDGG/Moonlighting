-- Add "vehiculo" column to tecnicos so the UI can associate a technician
-- with the vehicle they drive. The column is nullable and holds the vehicle
-- name (matches ubicaciones_inventario.nombre / vehiculos.nombre).
--
-- Safe to run multiple times.

ALTER TABLE public.tecnicos
  ADD COLUMN IF NOT EXISTS vehiculo text;

COMMENT ON COLUMN public.tecnicos.vehiculo IS
  'Nombre del vehículo asignado al técnico (texto libre, idealmente coincide con vehiculos.nombre).';
