// Rate limits globales y por ruta. Overridables vía env vars para permitir
// ajustes sin redeploy de código.
//
// Importante: seguimos el patrón de esbuild documentado en CLAUDE.md —
// destructurar process.env al tope del módulo y aplicar defaults con expresiones
// sobre variables locales (no sobre process.env.X directamente).

const {
  RATE_LIMIT_GLOBAL_MAX,
  RATE_LIMIT_GLOBAL_WINDOW,
  RATE_LIMIT_AI_MAX,
  RATE_LIMIT_AI_WINDOW,
  RATE_LIMIT_GEOCODE_MAX,
  RATE_LIMIT_GEOCODE_WINDOW,
} = process.env;

export const RATE_LIMITS = Object.freeze({
  GLOBAL: Object.freeze({
    max:        Number(RATE_LIMIT_GLOBAL_MAX) || 120,
    timeWindow: RATE_LIMIT_GLOBAL_WINDOW || '1 minute',
  }),
  AI_FEEDBACK: Object.freeze({
    max:        Number(RATE_LIMIT_AI_MAX) || 10,
    timeWindow: RATE_LIMIT_AI_WINDOW || '1 minute',
  }),
  GEOCODE: Object.freeze({
    max:        Number(RATE_LIMIT_GEOCODE_MAX) || 20,
    timeWindow: RATE_LIMIT_GEOCODE_WINDOW || '1 minute',
  }),
});
