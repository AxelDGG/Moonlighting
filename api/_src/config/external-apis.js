// URLs y parámetros de APIs externas (Groq, Nominatim, MS Graph).
// Todos tienen defaults sensatos; overridables por env var.

const {
  GROQ_API_ENDPOINT,
  GROQ_MODEL,
  GROQ_TEMPERATURE,
  GROQ_MAX_TOKENS,
  NOMINATIM_BASE_URL,
  NOMINATIM_USER_AGENT,
  NOMINATIM_ACCEPT_LANG,
  NOMINATIM_REVERSE_ZOOM,
  FETCH_TIMEOUT_MS,
  MS_GRAPH_BASE_URL,
  MS_AUTH_BASE_URL,
  MS_CALENDAR_TIMEZONE,
  MS_CALENDAR_REMINDER_MIN,
  MS_CALENDAR_DEFAULT_HOUR,
  MS_TOKEN_REFRESH_BUFFER_SEC,
} = process.env;

export const GROQ = Object.freeze({
  ENDPOINT:    GROQ_API_ENDPOINT || 'https://api.groq.com/openai/v1/chat/completions',
  MODEL:       GROQ_MODEL || 'llama-3.3-70b-versatile',
  TEMPERATURE: GROQ_TEMPERATURE != null ? Number(GROQ_TEMPERATURE) : 0.5,
  MAX_TOKENS:  Number(GROQ_MAX_TOKENS) || 600,
});

export const NOMINATIM = Object.freeze({
  BASE_URL:     NOMINATIM_BASE_URL || 'https://nominatim.openstreetmap.org',
  USER_AGENT:   NOMINATIM_USER_AGENT || 'Moonlighting/4.0 (contacto: moonlighting@local)',
  ACCEPT_LANG:  NOMINATIM_ACCEPT_LANG || 'es',
  REVERSE_ZOOM: NOMINATIM_REVERSE_ZOOM || '18',
  TIMEOUT_MS:   Number(FETCH_TIMEOUT_MS) || 8000,
});

export const MS_GRAPH = Object.freeze({
  GRAPH_BASE:            MS_GRAPH_BASE_URL || 'https://graph.microsoft.com/v1.0',
  AUTH_BASE:             MS_AUTH_BASE_URL || 'https://login.microsoftonline.com',
  CALENDAR_TIMEZONE:     MS_CALENDAR_TIMEZONE || 'America/Monterrey',
  REMINDER_MIN:          Number(MS_CALENDAR_REMINDER_MIN) || 30,
  DEFAULT_SERVICE_HOUR:  MS_CALENDAR_DEFAULT_HOUR || '08:00',
  TOKEN_REFRESH_BUFFER_SEC: Number(MS_TOKEN_REFRESH_BUFFER_SEC) || 60,
});
