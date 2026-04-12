const {
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  GROQ_API_KEY,
  FRONTEND_URL,
  NODE_ENV,
} = process.env;

export const config = {
  supabaseUrl:        SUPABASE_URL,
  supabaseServiceKey: SUPABASE_SERVICE_KEY,
  groqApiKey:         GROQ_API_KEY,
  frontendUrl:        FRONTEND_URL,
  isProduction:       NODE_ENV === 'production',
  port:               3001,
};
