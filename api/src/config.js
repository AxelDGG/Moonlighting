export const config = {
  supabaseUrl:        process.env.SUPABASE_URL        || '',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY || '',
  groqApiKey:         process.env.GROQ_API_KEY         || '',
  frontendUrl:        process.env.FRONTEND_URL         || 'http://localhost:5173',
  isProduction:       process.env.NODE_ENV === 'production',
  port:               parseInt(process.env.PORT        || '3001', 10),
};
