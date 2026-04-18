# Moonlighting — Nueva Arquitectura de Base de Datos

## Resumen ejecutivo

La nueva arquitectura implementa una normalización sana con 17+ tablas especializadas, reemplazando la estructura monolítica anterior. Esto permite:

- ✅ Múltiples líneas de detalle por pedido (abanicos + persianas + servicios)
- ✅ Múltiples direcciones por cliente
- ✅ Múltiples pagos parciales por pedido
- ✅ Trazabilidad completa de inventario
- ✅ Histórico de interacciones comerciales
- ✅ Escalabilidad para reportes y métricas

## Tablas principales

### 1. Clientes
Datos de la persona, no de la ubicación del servicio.

```sql
clientes (
  id, nombre, telefono, telefono_alt, email, notas_cliente,
  created_at, updated_at
)
```

**Importante:** No incluye `numero`, `direccion`, o `metodo_pago` — eso va en otras tablas.

### 2. Cliente Direcciones
Múltiples ubicaciones de servicio por cliente.

```sql
cliente_direcciones (
  id, cliente_id, alias, contacto_recibe, telefono_contacto,
  calle, numero_ext, numero_int, colonia, municipio, estado_mx,
  codigo_postal, referencias, google_maps_url, lat, lng,
  es_principal, created_at, updated_at
)
```

### 3. Catálogo de Items
Productos y servicios vendibles. Requiere `items_catalogo` en todas las líneas de detalle.

```sql
items_catalogo (
  id, sku, nombre, categoria_id, tipo_persiana_id,
  marca, modelo, color, unidad_medida (pieza/m2/m/servicio),
  precio_base, costo_base, controla_inventario, activo,
  notas, created_at, updated_at
)
```

### 4. Pedidos (Cabecera)
Una orden comercial completa. No tiene `tipo_servicio` ni `cantidad` — eso está en `pedido_detalle`.

```sql
pedidos (
  id, folio (ML-0001, ML-0002...), cliente_id, direccion_servicio_id,
  fecha_pedido, fecha_servicio, estado_id, metodo_pago_id,
  subtotal, descuento, cargo_extra, total, anticipo, saldo,
  requiere_factura, notas_comerciales, notas_operativas,
  created_at, updated_at
)
```

**Campos calculados automáticamente:**
- `folio` — generado por trigger al crear
- `subtotal` — suma de `pedido_detalle.subtotal`
- `total` — `subtotal - descuento + cargo_extra`
- `saldo` — `total - suma(pagos)`

### 5. Pedido Detalle
Líneas individuales. Un pedido puede tener N líneas.

```sql
pedido_detalle (
  id, pedido_id, item_catalogo_id, tipo_linea (item/ajuste/descuento/cargo),
  descripcion, cantidad, unidad_medida,
  precio_unitario, costo_unitario, subtotal,
  
  -- Abanicos
  modelo_abanico, desinstalar_cantidad, perforacion_cantidad,
  
  -- Persianas
  ancho_m, alto_m, area_m2, tela_color, sistema_instalacion (dentro/fuera),
  habitacion,
  
  -- Control operativo
  requiere_inventario, requiere_servicio, notas
)
```

**Campos calculados automáticamente:**
- `subtotal` — `cantidad * precio_unitario`
- `area_m2` — `ancho_m * alto_m` (para persianas)

### 6. Estados de Pedido
Tabla de referencia (lookup).

```
borrador → cotizado → confirmado → programado → en_proceso → completado
                ↓                                              ↓
                └────────────────────────────── cancelado ────┘
```

### 7. Métodos de Pago
Tabla de referencia.

```
Efectivo, Transferencia, Tarjeta, Mixto
```

### 8. Pagos
Registro detallado de cada pago (soporta parciales).

```sql
pagos (
  id, pedido_id, fecha_pago, metodo_pago_id, monto,
  referencia, comprobante_url, recibido_por, notas
)
```

**Cálculo automático:**
- Saldo del pedido se recalcula al insertar/actualizar/eliminar pagos

### 9. Técnicos
Instaladores y especialistas.

```sql
tecnicos (
  id, nombre, telefono, activo, tipo_colaborador (interno/externo/especialista),
  porcentaje_instalacion, porcentaje_mantenimiento, notas, created_at
)
```

### 10. Servicios
Ejecución en campo. Una entrada = un servicio programado.

```sql
servicios (
  id, pedido_id, pedido_detalle_id, tipo_servicio,
  fecha_servicio, hora_programada, hora_llegada, hora_inicio, hora_fin,
  tecnico_id, tecnico_apoyo_id, ruta_num,
  estado (programado/en_ruta/en_proceso/completado/cancelado/atrasado),
  motivo_cancelacion, motivo_retraso, evidencia_url, observaciones,
  created_at, updated_at
)
```

### 11. Ubicaciones de Inventario
Dónde se guarda stock.

```sql
ubicaciones_inventario (
  id, nombre (Bodega/Casa/Ramiro/etc), tipo (bodega/tecnico/transito),
  direccion, notas
)
```

### 12. Existencias
Stock actual por item y ubicación.

```sql
inventario_existencias (
  id, item_catalogo_id, ubicacion_id, cantidad, costo_promedio, updated_at,
  UNIQUE (item_catalogo_id, ubicacion_id)
)
```

### 13. Movimientos de Inventario
Historial para trazabilidad. Nunca actualices `inventario_existencias` directamente — crea un movimiento.

```sql
inventario_movimientos (
  id, item_catalogo_id,
  ubicacion_origen_id, ubicacion_destino_id,
  tipo_movimiento (entrada/salida/transferencia/ajuste),
  cantidad, costo_unitario, pedido_id, servicio_id,
  referencia, notas, created_at
)
```

### 14. Interacciones Comerciales
Historial de contactos para seguimiento y postventa.

```sql
cliente_interacciones (
  id, cliente_id, pedido_id, canal (whatsapp/messenger/llamada),
  tipo (cotizacion/seguimiento/confirmacion/postventa),
  nota, usuario_responsable, created_at
)
```

## Vistas útiles

### v_pedidos_resumen
Información consolidada de un pedido con cliente y dirección.

### v_servicios_resumen
Información de ejecución en campo con duración calculada.

### v_inventario_consolidado
Stock disponible por item y ubicación con valor total.

## API Endpoints

### Clientes
```
GET    /api/clientes              — Listar clientes
GET    /api/clientes/:id          — Obtener cliente con direcciones
POST   /api/clientes              — Crear cliente + dirección inicial
PUT    /api/clientes/:id          — Actualizar cliente
DELETE /api/clientes/:id          — Eliminar cliente (si no tiene pedidos)

GET    /api/clientes/:id/direcciones      — Listar direcciones del cliente
POST   /api/clientes/:id/direcciones      — Agregar dirección
```

### Pedidos
```
GET    /api/pedidos               — Listar pedidos
GET    /api/pedidos/:id           — Obtener pedido con detalles
POST   /api/pedidos               — Crear pedido
PUT    /api/pedidos/:id           — Actualizar pedido
DELETE /api/pedidos/:id           — Cancelar pedido

POST   /api/pedidos/:id/detalle   — Agregar línea de detalle
GET    /api/pedidos/:id/detalle   — Obtener líneas del pedido
PUT    /api/pedidos/detalle/:id   — Actualizar línea
DELETE /api/pedidos/detalle/:id   — Eliminar línea
```

### Servicios
```
GET    /api/servicios             — Listar servicios
GET    /api/servicios/:id         — Obtener servicio
POST   /api/servicios             — Crear servicio
PUT    /api/servicios/:id         — Actualizar servicio
DELETE /api/servicios/:id         — Cancelar servicio

GET    /api/servicios/fecha/:fecha           — Servicios en fecha
GET    /api/servicios/tecnico/:tecnico_id    — Servicios de técnico
```

### Pagos
```
GET    /api/pagos/pedido/:pedido_id  — Pagos de un pedido
GET    /api/pagos                     — Todos los pagos
POST   /api/pagos                     — Registrar pago
PUT    /api/pagos/:id                 — Actualizar pago
DELETE /api/pagos/:id                 — Eliminar pago
```

### Catálogo
```
GET    /api/catalogo               — Listar items activos
GET    /api/catalogo/:id           — Obtener item con stock
POST   /api/catalogo               — Crear item
PUT    /api/catalogo/:id           — Actualizar item
DELETE /api/catalogo/:id           — Desactivar item (no borra)

GET    /api/catalogo/categoria/:id  — Items de categoría
GET    /api/catalogo/buscar/:query  — Buscar por nombre/SKU/modelo
```

### Técnicos
```
GET    /api/tecnicos               — Listar técnicos activos
GET    /api/tecnicos/:id           — Obtener técnico con servicios
POST   /api/tecnicos               — Crear técnico
PUT    /api/tecnicos/:id           — Actualizar técnico
DELETE /api/tecnicos/:id           — Desactivar técnico

GET    /api/tecnicos/disponibles/:fecha   — Técnicos sin servicios
GET    /api/tecnicos/carga/:fecha         — Carga de trabajo
```

### Inventario
```
GET    /api/inventario/existencias          — Stock consolidado
GET    /api/inventario/existencias/:ubicacion — Stock por ubicación
POST   /api/inventario/existencias          — Crear/actualizar stock

GET    /api/inventario/movimientos          — Historial de movimientos
POST   /api/inventario/movimientos          — Registrar movimiento

GET    /api/inventario/ubicaciones          — Listar ubicaciones
POST   /api/inventario/ubicaciones          — Crear ubicación
```

## Reglas de negocio

### Crear un pedido
1. Cliente existe (reutilizar por teléfono si coincide)
2. Seleccionar dirección (nueva o existente)
3. Agregar líneas de detalle una por una
4. Sistema calcula automáticamente subtotal, total, saldo
5. Cambiar a "confirmado" → sistema genera folio automático

### Registrar un pago
1. Insertar en `pagos` con cantidad y método
2. Sistema recalcula automáticamente `saldo` del pedido
3. Si `saldo = 0` → pedido puede pasar a "completado"

### Movimiento de inventario
1. Nunca actualices `inventario_existencias` directamente
2. Siempre crea un movimiento en `inventario_movimientos`
3. Sistema actualiza automáticamente las existencias

### Ejecución de servicio
1. Crear entrada en `servicios` (programa técnico + horario)
2. Al completar → registrar hojas (hora_llegada, hora_inicio, hora_fin)
3. Crear movimientos de inventario si usa refacciones
4. Puede ligar a `pedido_detalle` si es línea específica

## Catálogo sugerido (datos iniciales)

### Abanicos
- F7239, F7240, Ven 12, Ven 13, Ven 15, VL01A, VL02A, F8585-42, Ven 10

### Persianas
Opciones por tipo (translúcida, blackout, sheer, dim out):
- FL: Long Beach, Ipanema, Budelli, Sidney
- Screen: Basic, Soft, One, Milan, Zero
- BO: Long Beach, Montreal, Ipanema, Texture, Ohio, 500, Budelli, Luxury, Sidney, Galaxy, Stylus
- Duo: Basic, XL, Celebrity, Dim Out
- Wood Line, Dense Woodlook, Bright, Terra
- Sheer Advantage, Genius Dim Out, Dim Out Woods, Glam Dim Out, Royal Dim Out, Lino Dim Out, Brave Dim Out

### Servicios
- Instalación abanico retráctil
- Instalación abanico plafón
- Mantenimiento abanico plafón
- Mantenimiento abanico candil
- Cambio módulo + control
- Cambio lámpara LED
- Retiro de abanico
- Perforación especial
- Levantamiento de medidas

## Datos importantes guardados en JSONB o campos especiales

### Cambios vs. estructura anterior

| Viejo | Nuevo |
|------|-------|
| `pedidos.tipo_servicio` | `pedido_detalle.descripcion` (múltiples líneas) |
| `pedidos.cantidad` | `pedido_detalle.cantidad` (por línea) |
| `pedidos.detalles` (JSONB) | Estructurado en `pedido_detalle`, `pagos`, `servicios` |
| `almacenamiento` (tabla) | `inventario_existencias` + `inventario_movimientos` |
| `servicios_metricas` | `servicios` (consolidado) |
| `clientes.direccion` | `cliente_direcciones` (múltiples) |
| `clientes.metodo_pago` | `pedidos.metodo_pago_id` (por pedido) |

## Migración de datos históricos

Los datos existentes han sido:
- Transferidos a la nueva estructura
- Conservados íntegros (sin pérdida)
- Disponibles en las vistas consolidadas

## Próximos pasos

1. Actualizar frontend para usar nuevos endpoints
2. Cargar catálogo inicial (17 abanicos, 40+ persianas, 9 servicios)
3. Capacitar en formulario de "Nuevo Pedido" multi-línea
4. Implementar reportes con las vistas
5. Integrar tracking de rutas por técnico
