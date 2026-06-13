-- Audit log genérico para tablas sensibles (pagos, pedidos).
-- Registra QUÉ cambió y CUÁNDO con snapshots JSONB antes/después.
--
-- Limitación conocida: el ACTOR no se captura. La API escribe con la
-- service_role key, así que todas las escrituras comparten el mismo rol de
-- Postgres y current_setting('request.jwt.claims') no identifica al usuario.
-- Capturarlo requeriría pasar el contexto del usuario por request (GUC o
-- columna explícita) — pendiente si se vuelve requisito.

create table if not exists audit_log (
  id            bigint generated always as identity primary key,
  tabla         text not null,
  registro_id   bigint,
  accion        text not null check (accion in ('INSERT', 'UPDATE', 'DELETE')),
  datos_antes   jsonb,
  datos_despues jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists idx_audit_log_lookup
  on audit_log (tabla, registro_id, created_at desc);

-- RLS sin policies: solo service_role (API) y el SQL editor pueden leerla.
alter table audit_log enable row level security;

create or replace function fn_audit_row() returns trigger as $$
declare
  v_id  bigint;
  v_old jsonb;
  v_new jsonb;
begin
  if tg_op = 'DELETE' then
    v_id := old.id;  v_old := to_jsonb(old);
  elsif tg_op = 'INSERT' then
    v_id := new.id;  v_new := to_jsonb(new);
  else
    v_id := new.id;  v_old := to_jsonb(old);  v_new := to_jsonb(new);
  end if;

  insert into audit_log (tabla, registro_id, accion, datos_antes, datos_despues)
  values (tg_table_name, v_id, tg_op, v_old, v_new);

  return coalesce(new, old);
end;
$$ language plpgsql;

drop trigger if exists audit_pagos on pagos;
create trigger audit_pagos
after insert or update or delete on pagos
for each row execute function fn_audit_row();

drop trigger if exists audit_pedidos on pedidos;
create trigger audit_pedidos
after insert or update or delete on pedidos
for each row execute function fn_audit_row();
