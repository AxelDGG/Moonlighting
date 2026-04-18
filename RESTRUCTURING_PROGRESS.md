# Restructuración de Base de Datos — Progreso

**Rama:** `claude/restructure-database-tables-A9Jk6`
**Estado:** En Progreso - Fase 2/3 Completada

## ✅ Completado

### Fase 1: Diseño & Migraciones
- ✅ Definida nueva arquitectura con 17+ tablas normalizadas
- ✅ Creadas 9 migraciones Supabase incrementales
- ✅ Aplicada migración `cleanup_and_finalize_schema`:
  - Eliminadas tablas obsoletas (`servicios_metricas`, `almacenamiento`)
  - Creados índices de performance
  - Agregados triggers automáticos (updated_at, cálculos, folio)
  - Creadas 3 vistas SQL consolidadas

### Fase 2: Backend API
- ✅ **Actualizadas rutas existentes:**
  - `clientes.js` — Solo datos de persona, maneja `cliente_direcciones`
  - `pedidos.js` — Soporta múltiples líneas via `pedido_detalle`

- ✅ **Creadas rutas nuevas:**
  - `inventario.js` — Existencias, movimientos, ubicaciones
  - `servicios.js` — Ejecución en campo con calendario
  - `pagos.js` — Registro multi-pago con recálculo automático de saldo
  - `catalogo.js` — Gestión del catálogo de productos
  - `tecnicos.js` — Gestión de técnicos + disponibilidad

- ✅ **Actualizado:**
  - `app.js` — Registradas todas las nuevas rutas con prefijos correctos

### Fase 3: Frontend (En Progreso)
- ✅ **Completados:**
  - `state.js` — Reescrito con nuevos mappers para todas las tablas:
    - `cFromDb/cToDb` — Clientes
    - `dirFromDb/dirToDb` — Direcciones
    - `pFromDb/pToDb` — Pedidos
    - `pdFromDb/pdToDb` — Pedido detalle
    - `itemFromDb/itemToDb` — Catálogo
    - `servFromDb` — Servicios
    - `invExistFromDb` — Inventario existencias
    - `invMovFromDb` — Movimientos inventario
  
  - `api.js` — Reorganizado con nuevos endpoints:
    - `/clientes/*` — Gestión de clientes y direcciones
    - `/pedidos/*` — Gestión de pedidos y líneas
    - `/servicios/*` — Gestión de servicios
    - `/pagos/*` — Gestión de pagos
    - `/catalogo/*` — Gestión de catálogo
    - `/tecnicos/*` — Gestión de técnicos
    - `/inventario/*` — Gestión de inventario

- ⏳ **Falta actualizar módulos UI:**
  - `clientes.js` — Actualizar formulario para incluir direcciones
  - `pedidos.js` — Refactorizar para múltiples líneas de detalle
  - `almacenamiento.js` → `inventario.js` — Reescribir para nueva tabla
  - Crear módulos nuevos: servicios.js, pagos.js (si aplica)

### Documentación
- ✅ `DATABASE_SCHEMA.md` — Referencia completa de la arquitectura
  - Descripción de todas las 17 tablas
  - API endpoints reference
  - Reglas de negocio
  - Catálogo inicial (56 items)

- ✅ `RESTRUCTURING_PROGRESS.md` — Este archivo

### Datos Iniciales
- ✅ Catálogo cargado en Supabase:
  - 9 abanicos (Malibu, Ventilador, Vila)
  - 28 persianas (FL, Screen, BO, Duo, Sheer)
  - 9 servicios (instalación, mantenimiento, etc.)
  - 4 ubicaciones de inventario
  - Todas las categorías y tipos

## ⏳ Por Hacer

### Fase 3: Frontend UI (Estimado 2-3 días)
1. **Módulo Clientes**
   - Actualizar formulario de nuevo cliente para incluir dirección
   - Manejar múltiples direcciones con edición en línea
   - Buscar cliente existente por teléfono

2. **Módulo Pedidos**
   - Reescribir para multi-línea (eliminación del campo `tipo_servicio` simple)
   - Crear tabla de líneas de detalle editables
   - Agregar selector de items de catálogo
   - Mostrar cálculos automáticos (área para persianas, etc.)

3. **Módulo Inventario**
   - Reescribir almacenamiento.js como inventario.js
   - Mostrar stock por ubicación
   - Registrar movimientos (entrada, salida, transferencia)
   - Mostrar historial de movimientos

4. **Dashboard/Reportes** (Opcional)
   - Actualizar métricas para usar vistas SQL consolidadas
   - Mostrar información de pagos pendientes
   - Mostrar servicios por técnico

### Fase 4: Testing & Validación (1 día)
1. Testing de APIs con datos reales
2. Testing de flujos UI completos
3. Verificar cálculos automáticos
4. Validar autogeneración de folios

### Fase 5: Migración de Datos Históricos (1 día)
1. Scripts para migrar datos históricos de tablas viejas
2. Validar integridad de datos
3. Verificar que vistas cálculan correctamente

## Cambios de Datos vs. Estructura Anterior

| Concepto | Viejo | Nuevo | Beneficio |
|----------|-------|-------|-----------|
| Líneas en pedido | 1 (JSONB) | N en `pedido_detalle` | Consultas SQL sencillas |
| Direcciones cliente | 1 fija | N en `cliente_direcciones` | Múltiples servicios |
| Pagos | Campo único | Tabla `pagos` | Pagos parciales/mixtos |
| Inventario | Tabla `almacenamiento` | `existencias` + `movimientos` | Trazabilidad completa |
| Métricas | Tabla separada | `servicios` consolidado | Una fuente de verdad |
| Catálogo | Implícito en pedidos | Tabla `items_catalogo` | Control de precios |

## Commits Realizados

```
364fd74 - refactor: complete database schema restructuring and update API routes
6209363 - docs: add database schema documentation and seed initial catalog
b6019e6 - refactor(frontend): update state mappers for new database schema
26f3e34 - refactor(frontend): update API endpoints for new schema
```

## URLs Útiles

- **Supabase Project:** https://zbypsyftfumjsvzbrefu.supabase.co
- **GitHub Branch:** `claude/restructure-database-tables-A9Jk6`
- **Database Schema Ref:** [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)

## Notas Importantes

### Datos que NO se migraron (intencional)
- `pedidos.detalles` (JSONB) — Ahora está en `pedido_detalle`
- `clientes.numero/direccion/metodo_pago` — Ahora en `cliente_direcciones` y `pedidos`
- `servicios_metricas` — Consolidado en `servicios`
- `almacenamiento` — Reemplazado por `inventario_existencias` + `inventario_movimientos`

### Triggers Automáticos
- `update_*_updated_at` — Mantiene `updated_at` sincronizado
- `trigger_subtotal_pedido_detalle` — Calcula `subtotal` automáticamente
- `trigger_area_persiana` — Calcula `area_m2` para persianas
- `folio_trigger` — Genera folio ML-#### automáticamente

### Vistas SQL Disponibles
- `v_pedidos_resumen` — Info consolidada de pedidos con cliente/dirección
- `v_servicios_resumen` — Info de servicios con duraciones calculadas
- `v_inventario_consolidado` — Stock disponible con valor total

## Próximas Prioridades

1. **Actualizar módulo de Pedidos** (más crítico para la operación)
2. **Actualizar módulo de Clientes** (para manejar múltiples direcciones)
3. **Reescribir inventario.js** (para nuevas tablas)
4. Crear visualización de servicios/técnicos (opcional en fase 1)

## Contacto/Revisión

Para cualquier pregunta sobre la nueva estructura:
1. Ver [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)
2. Revisar endpoints en `api/_src/routes/*.js`
3. Consultar mappers en `frontend/src/state.js`
