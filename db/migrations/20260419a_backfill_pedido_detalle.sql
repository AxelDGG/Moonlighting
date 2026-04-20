-- Backfill pedido_detalle desde el JSONB legacy pedidos.detalles.
-- Genera UNA línea por cada pedido que no tenga filas aún en pedido_detalle,
-- interpretando tipo_servicio + detalles + cantidad + total.
--
-- Idempotente: el WHERE NOT EXISTS evita duplicar si se corre dos veces.
-- No modifica pedidos.detalles ni pedidos.total — queda como respaldo histórico.

INSERT INTO pedido_detalle (
  pedido_id,
  tipo_linea,
  descripcion,
  cantidad,
  unidad_medida,
  precio_unitario,
  modelo_abanico,
  desinstalar_cantidad,
  ancho_m,
  alto_m,
  tela_color,
  sistema_instalacion,
  notas,
  requiere_servicio
)
SELECT
  p.id,
  'item'::text,
  COALESCE(
    CASE
      WHEN p.tipo_servicio = 'Abanico'       THEN p.detalles->>'modelo'
      WHEN p.tipo_servicio = 'Persiana'      THEN p.detalles->>'tipoTela'
      WHEN p.tipo_servicio = 'Limpieza'      THEN COALESCE(p.detalles->>'modelo', 'Limpieza')
      ELSE p.tipo_servicio
    END,
    p.tipo_servicio,
    'Servicio'
  ) AS descripcion,
  COALESCE(NULLIF(p.cantidad, 0), 1)::numeric AS cantidad,
  CASE
    WHEN p.tipo_servicio = 'Persiana' THEN 'm2'
    ELSE 'pieza'
  END AS unidad_medida,
  -- precio_unitario = total / cantidad (fallback 0 si el total es 0)
  CASE
    WHEN COALESCE(NULLIF(p.cantidad, 0), 1) > 0
      THEN COALESCE(p.total, 0) / COALESCE(NULLIF(p.cantidad, 0), 1)
    ELSE 0
  END::numeric AS precio_unitario,
  CASE WHEN p.tipo_servicio = 'Abanico' THEN p.detalles->>'modelo' END AS modelo_abanico,
  CASE
    WHEN p.tipo_servicio = 'Abanico'
      THEN NULLIF(p.detalles->>'nDesins', '')::int
  END AS desinstalar_cantidad,
  CASE
    WHEN p.tipo_servicio = 'Persiana'
      THEN NULLIF(p.detalles->>'ancho', '')::numeric / 100.0
  END AS ancho_m,
  CASE
    WHEN p.tipo_servicio = 'Persiana'
      THEN NULLIF(p.detalles->>'alto', '')::numeric / 100.0
  END AS alto_m,
  CASE WHEN p.tipo_servicio = 'Persiana' THEN p.detalles->>'tipoTela' END AS tela_color,
  CASE WHEN p.tipo_servicio = 'Persiana' THEN p.detalles->>'instalacion' END AS sistema_instalacion,
  p.detalles->>'notas' AS notas,
  TRUE AS requiere_servicio
FROM pedidos p
WHERE NOT EXISTS (
  SELECT 1 FROM pedido_detalle pd WHERE pd.pedido_id = p.id
);
