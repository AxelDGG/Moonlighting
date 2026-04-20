# Migraciones de base de datos

Las migraciones SQL viven en `db/migrations/` como archivos versionados con el prefijo `YYYYMMDD_`. Se aplican manualmente en el dashboard de Supabase — **Vercel no las ejecuta en el deploy**.

## Proceso de aplicación

1. Abrir el proyecto en https://app.supabase.com → **SQL Editor**.
2. Pegar el contenido del archivo `.sql` en orden cronológico (por fecha del prefijo).
3. Ejecutar. Si falla, revertir manualmente y corregir el archivo antes de re-aplicar.
4. Commit del archivo a la rama correspondiente.

## Convención de nombres

`YYYYMMDD_descripcion_corta.sql` — por ejemplo `20260419_user_profiles_rls.sql`.

Si un mismo día se crean dos migraciones, añadir sufijo: `20260419a_...`, `20260419b_...`.

## Estado del repo vs Supabase (gap conocido)

`RESTRUCTURING_PROGRESS.md` menciona "9 migraciones Supabase incrementales", pero solo los siguientes archivos existen en este directorio:

| Archivo | Descripción |
|---|---|
| `20260417_geocoding_postgis.sql` | Cache de geocodes y zonas PostGIS |
| `20260418_find_user_by_email.sql` | RPC para buscar UUID por email |
| `20260419_user_profiles_rls.sql` | RLS en `user_profiles` |
| `20260419a_backfill_pedido_detalle.sql` | Backfill de pedidos legacy (JSONB `detalles`) a `pedido_detalle`. Idempotente. |
| `20260420_hardcoded_values_to_db.sql` | Tablas de config (`pricing_config`, `service_duration_subtipos`, `geo_regions`, `municipios`, `postal_zones`, `municipio_aliases`) + normaliza `servicios_metricas.estado` (`en_curso` → `en_proceso`). Idempotente. |
| `20260420a_almacen_sub_tipo.sql` | Añade `almacenamiento.sub_tipo` (candil/plafón/retráctil para abanicos). El subtipo ahora se define en almacén y se hereda al pedido. Idempotente. |

Las tablas base (`clientes`, `pedidos`, `pedido_detalle`, `items_catalogo`, `tecnicos`, `servicios`, `servicios_metricas`, `pagos`, `vehiculos`, `almacenamiento`, `inventario_*`, `user_profiles`, `route_configs`) y las vistas (`v_pedidos_resumen`, `v_servicios_resumen`, `v_inventario_consolidado`, `v_clientes_zona`) fueron creadas directamente en el dashboard. **Pendiente:** ejecutar `supabase db dump --schema-only` y checkear el resultado como `20260101_baseline_schema.sql` para que el repo refleje el estado real.

## Fuentes de verdad

- **`servicios`** — tabla nueva, canónica para pedidos normalizados. La vista `v_servicios_resumen` la consume.
- **`servicios_metricas`** — tabla legacy que usa `openTrackModal` y el dashboard de métricas (columnas `hora_programada/llegada/inicio/fin`, `motivo_retraso`, `estado`). Se mantiene hasta que `servicios` tenga campos equivalentes y se migre el flujo de tracking. Mientras tanto, **todo write nuevo de tracking va aquí**; los servicios "formales" van a `servicios`.

## Variables de entorno relacionadas

- `ADMIN_EMAILS` (coma-separado) — lista de correos que se auto-provisionan como `admin` la primera vez que hacen login. Sin esta var, todos los usuarios nuevos se crean como `gestor`.
