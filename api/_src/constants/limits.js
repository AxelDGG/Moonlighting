// Límites de longitud usados en schemas de validación JSON.
export const MAX_LENGTHS = Object.freeze({
  NOMBRE:              200,
  DIRECCION:           300,
  TELEFONO:            30,
  SKU:                 50,
  TECNICO_NAME:        100,
  ZONA_NAME:           100,
  MOTIVO:              200,
  NOTA:                300,
  DIA_SEMANA:          20,
  GOOGLE_MAPS_URL:     500,
  OBSERVACIONES:       500,
});

// Límites aplicados en queries a Supabase.
export const QUERY_LIMITS = Object.freeze({
  SEARCH_RESULTS:  20,
  MOVIMIENTOS:    100,
  PAGOS:          200,
});
