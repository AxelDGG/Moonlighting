import fp from 'fastify-plugin';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';

export default fp(async (fastify) => {
  const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey, {
    auth: { persistSession: false },
  });
  fastify.decorate('supabase', supabase);
});
