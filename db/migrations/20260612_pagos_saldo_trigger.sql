-- Recalcula pedidos.anticipo y pedidos.saldo automáticamente al insertar,
-- actualizar o eliminar pagos. Mueve el cálculo de la API a la DB para
-- eliminar la race condition (dos pagos simultáneos se pisaban el saldo).
-- El SELECT ... FOR UPDATE serializa los recálculos por pedido.

create or replace function recalc_pedido_saldo(p_pedido_id bigint)
returns void as $$
declare
  v_total  numeric;
  v_pagado numeric;
begin
  -- Lock de la fila del pedido: recálculos concurrentes del mismo pedido se serializan
  select total into v_total from pedidos where id = p_pedido_id for update;
  if not found then
    return;
  end if;

  select coalesce(sum(monto), 0) into v_pagado from pagos where pedido_id = p_pedido_id;

  update pedidos
     set anticipo = v_pagado,
         saldo    = greatest(0, coalesce(v_total, 0) - v_pagado)
   where id = p_pedido_id;
end;
$$ language plpgsql;

create or replace function trg_recalc_pedido_saldo()
returns trigger as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform recalc_pedido_saldo(new.pedido_id);
  end if;
  -- En DELETE, o si un UPDATE movió el pago a otro pedido, recalcular el pedido anterior
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and new.pedido_id is distinct from old.pedido_id) then
    perform recalc_pedido_saldo(old.pedido_id);
  end if;
  return coalesce(new, old);
end;
$$ language plpgsql;

drop trigger if exists pagos_recalc_saldo on pagos;
create trigger pagos_recalc_saldo
after insert or update or delete on pagos
for each row execute function trg_recalc_pedido_saldo();

-- Backfill: corregir saldos que hayan quedado desincronizados.
-- Solo toca pedidos que tienen pagos registrados (no pisa anticipos manuales
-- de pedidos sin pagos).
update pedidos p
   set anticipo = s.pagado,
       saldo    = greatest(0, coalesce(p.total, 0) - s.pagado)
  from (select pedido_id, sum(monto) as pagado from pagos group by pedido_id) s
 where s.pedido_id = p.id;
