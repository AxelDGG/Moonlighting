// Tipos de servicio usados en pedidos/servicios y en la configuración de
// duraciones. Hay dos ejes distintos en el dominio:
//
// - "categoria" — cómo se categoriza el trabajo en el schema normalizado
//   (routes/servicios.js).
// - "tipo_producto" — qué se instala/mantiene (Abanico, Persiana, etc.), usado
//   en durations y pedidos.tipo_servicio.

export const SERVICE_CATEGORIES = Object.freeze([
  'instalación',
  'mantenimiento',
  'entrega',
  'reparación',
  'levantamiento',
]);

export const PRODUCT_TYPES = Object.freeze([
  'Abanico',
  'Persiana',
  'Levantamiento',
  'Mantenimiento',
  'Limpieza',
]);
