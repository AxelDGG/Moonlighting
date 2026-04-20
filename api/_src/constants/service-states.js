// Fuente de verdad única para estados de servicio.
// Reemplaza enums duplicados en routes/servicios.js y routes/metricas.js
// y elimina el drift histórico 'en_curso' (metricas) vs 'en_proceso' (servicios).

export const SERVICE_STATES = Object.freeze({
  PROGRAMADO:  'programado',
  EN_RUTA:     'en_ruta',
  EN_PROCESO:  'en_proceso',
  COMPLETADO:  'completado',
  CANCELADO:   'cancelado',
  ATRASADO:    'atrasado',
});

export const ALL_SERVICE_STATES = Object.freeze([
  SERVICE_STATES.PROGRAMADO,
  SERVICE_STATES.EN_RUTA,
  SERVICE_STATES.EN_PROCESO,
  SERVICE_STATES.COMPLETADO,
  SERVICE_STATES.CANCELADO,
  SERVICE_STATES.ATRASADO,
]);

// Estados activos (no terminales) usados para filtrar servicios en curso.
export const ACTIVE_SERVICE_STATES = Object.freeze([
  SERVICE_STATES.PROGRAMADO,
  SERVICE_STATES.EN_RUTA,
  SERVICE_STATES.EN_PROCESO,
]);

// Mapa de estados legacy (metricas_servicios previo a la migración 20260420)
// → estados canónicos actuales. Se usa al leer datos antiguos.
export const LEGACY_STATE_MAP = Object.freeze({
  en_curso: SERVICE_STATES.EN_PROCESO,
});

export function normalizeServiceState(estado) {
  if (!estado) return estado;
  return LEGACY_STATE_MAP[estado] || estado;
}
