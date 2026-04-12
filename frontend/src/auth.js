import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

let _token = null;

export function getToken()      { return _token; }
export function setToken(t)     { _token = t; }
export function clearToken()    { _token = null; }

export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  setToken(data.session.access_token);
  return data.user;
}

export async function logout() {
  await supabase.auth.signOut();
  clearToken();
}

export async function checkSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) { setToken(session.access_token); return session.user; }
  return null;
}

// Keep token fresh on refresh
supabase.auth.onAuthStateChange((_event, session) => {
  if (session) setToken(session.access_token);
  else clearToken();
});
