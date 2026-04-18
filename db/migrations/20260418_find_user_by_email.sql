-- Busca el id de un usuario en auth.users por email (case-insensitive).
-- Reemplaza a supabase.auth.admin.listUsers(), que en ciertos proyectos
-- devuelve "Database error finding users" desde GoTrue y además pagina
-- internamente (solo primeros 50 usuarios).
-- Esta función es O(1) usando el índice único de auth.users.email y se
-- ejecuta con SECURITY DEFINER para permitir que el service_role consulte
-- el schema auth. Se revocan permisos para anon/authenticated.

create or replace function public.find_user_id_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = public, auth
as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;

revoke all on function public.find_user_id_by_email(text) from public;
revoke all on function public.find_user_id_by_email(text) from anon;
revoke all on function public.find_user_id_by_email(text) from authenticated;
grant execute on function public.find_user_id_by_email(text) to service_role;
