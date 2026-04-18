-- RLS para user_profiles.
--
-- Contexto:
-- La API corre con la service_role key, que bypasea RLS. Todas las escrituras
-- van a través de /api/user-profiles, que ya valida rol admin en el handler.
-- Esta migración cierra el acceso directo desde clientes que usaran la anon
-- key (o una sesión authenticated) contra PostgREST.

alter table public.user_profiles enable row level security;

-- Un usuario autenticado solo puede leer su propia fila.
drop policy if exists user_profiles_self_select on public.user_profiles;
create policy user_profiles_self_select on public.user_profiles
  for select
  to authenticated
  using (id = auth.uid());

-- No se crean policies de insert/update/delete para authenticated ni anon:
-- solo service_role (API) puede modificar perfiles.
