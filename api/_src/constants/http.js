export const HTTP = Object.freeze({
  OK:              200,
  CREATED:         201,
  NO_CONTENT:      204,
  REDIRECT_MIN:    300,
  REDIRECT_MAX:    400,
  BAD_REQUEST:     400,
  UNAUTHORIZED:    401,
  FORBIDDEN:       403,
  NOT_FOUND:       404,
  TOO_MANY:        429,
  INTERNAL:        500,
  BAD_GATEWAY:     502,
  UNAVAILABLE:     503,
});

// Códigos de error de PostgREST/Supabase usados en lógica de control de flujo.
export const SUPABASE_ERROR = Object.freeze({
  NOT_FOUND: 'PGRST116', // "row not found" en .single()
});
