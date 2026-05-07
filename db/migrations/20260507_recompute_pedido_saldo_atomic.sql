-- =====================================================================
-- Race condition fix: saldo de pedidos
-- =====================================================================
-- Antes: api/_src/routes/pagos.js hacía read-modify-write en JS:
--   1) SELECT pedidos.total
--   2) SELECT SUM(pagos.monto) WHERE pedido_id = X
--   3) UPDATE pedidos SET anticipo, saldo
-- Dos POST /pagos concurrentes sobre el mismo pedido podían leer el mismo
-- estado y sobrescribirse mutuamente, dejando saldo incorrecto.
--
-- Después: una sola transacción con FOR UPDATE bloquea la fila del pedido
-- mientras se recalcula. Las llamadas concurrentes se serializan a nivel DB.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.recompute_pedido_saldo(p_pedido_id integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total        numeric;
  v_total_pagado numeric;
  v_saldo        numeric;
BEGIN
  -- Bloquea la fila del pedido para esta transacción.
  -- Cualquier otra recompute concurrente espera aquí hasta que terminemos.
  SELECT total INTO v_total
  FROM pedidos
  WHERE id = p_pedido_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido % no encontrado', p_pedido_id;
  END IF;

  -- Suma de pagos: COALESCE para pedido sin pagos
  SELECT COALESCE(SUM(monto), 0) INTO v_total_pagado
  FROM pagos
  WHERE pedido_id = p_pedido_id;

  v_saldo := GREATEST(0, COALESCE(v_total, 0) - v_total_pagado);

  UPDATE pedidos
  SET anticipo = v_total_pagado,
      saldo    = v_saldo
  WHERE id = p_pedido_id;
END;
$$;

-- Solo el service_role (el cliente Supabase del API) ejecuta esta función.
-- Los usuarios autenticados directos no tienen acceso, evitando que un cliente
-- malicioso fuerce recálculos arbitrarios fuera del flujo /api/pagos.
REVOKE ALL ON FUNCTION public.recompute_pedido_saldo(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recompute_pedido_saldo(integer) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.recompute_pedido_saldo(integer) TO service_role;

COMMENT ON FUNCTION public.recompute_pedido_saldo(integer) IS
  'Recalcula anticipo/saldo de un pedido con FOR UPDATE. Llamada solo desde /api/pagos.';
