function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const config = {
  supabaseUrl:        requireEnv('SUPABASE_URL'),
  supabaseServiceKey: requireEnv('SUPABASE_SERVICE_KEY'),
  groqApiKey:         process.env.GROQ_API_KEY || '',   // optional — AI feature degrades gracefully
  frontendUrl:        process.env.FRONTEND_URL || 'http://localhost:5173',
  isProduction:       process.env.NODE_ENV === 'production',
  port:               parseInt(process.env.PORT || '3001', 10),
};
