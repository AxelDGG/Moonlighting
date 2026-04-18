# Plan de Pruebas — Asistente IA (Chatbot)

Este documento describe el plan de pruebas para el asistente conversacional
expuesto en `POST /api/ai/chat` y consumido por `frontend/src/modules/chatbot.js`.

## Objetivo

Verificar que el chatbot:

1. No regrese "Internal Server Error" ante preguntas válidas.
2. Consulte las tablas correctas de Supabase y devuelva datos reales.
3. Responda en español, conciso, y use las herramientas cuando corresponde.
4. Maneje elegantemente errores transitorios (timeout de Groq, fallas de Supabase).

## Arquitectura bajo prueba

| Capa | Qué se valida |
|---|---|
| Frontend (`chatbot.js`) | envía historial (`role`/`content`), renderiza respuesta, muestra error amigable |
| API (`api/_src/routes/ai.js`) | valida esquema, orquesta tool calls, maneja timeout y errores |
| Herramientas (`executeTool`) | consulta Supabase en tablas/vistas correctas (`almacenamiento`, `v_pedidos_resumen`, `pagos`, `estados_pedido`) |
| Modelo Groq | `llama-3.3-70b-versatile` con `tool_choice: auto` |

## Fuentes de datos verificadas

| Pregunta típica | Herramienta | Tabla/Vista |
|---|---|---|
| "¿Qué pedidos tengo hoy?" | `query_orders_today` | `v_pedidos_resumen` (filtro `gte/lt` sobre `fecha_servicio`) |
| "¿Cuánto vendí hoy?" | `query_sales_today` | `pagos` + `metodos_pago` |
| "¿Qué pedidos pendientes hay?" | `query_orders_by_status` | `estados_pedido` (resolver nombre→id) + `v_pedidos_resumen` |
| "¿Qué inventario tengo?" | `query_inventory_summary` | `almacenamiento` (agrupado por `lugar` y `categoria`) |
| "¿Cuántos abanicos F7239 tengo?" | `query_inventory` (nombre_item + categoria=abanico) | `almacenamiento` (ilike `modelo`) |
| "¿Qué hay en la camioneta nueva?" | `query_vehicle_inventory` | `almacenamiento` (ilike `lugar`) |

## Casos de prueba

### CP-01 — Saludo simple
**Entrada:** `hola`
**Esperado:** Respuesta breve en español sin llamar herramientas
(ej. "¡Hola! ¿En qué puedo ayudarte?").
**Regresión:** No debe mostrar inventario ni pedidos.

### CP-02 — Pedidos del día (vacío)
**Entrada:** `¿Qué pedidos tengo hoy?`
**Esperado:** El modelo llama `query_orders_today`, la tabla devuelve `[]`,
respuesta tipo "No hay pedidos con fecha de servicio el 2026-04-18".
**Regresión:** No debe regresar `Internal Server Error`.

### CP-03 — Pedidos del día (con datos)
**Precondición:** Al menos un pedido con `fecha_servicio` = hoy.
**Entrada:** `¿Qué pedidos tengo hoy?`
**Esperado:** Lista resumida con cliente/total/hora; conteo correcto.

### CP-04 — Pedidos por estado
**Entrada:** `¿Cuántos pedidos pendientes hay?`
**Esperado:** Usa `query_orders_by_status` con `estado='pendiente'`;
número y lista corta.

### CP-05 — Ventas de hoy
**Entrada:** `¿Cuánto he vendido hoy?`
**Esperado:** Monto total `$X,XXX.XX`, número de pagos, desglose por método.

### CP-06 — Inventario general (resumen)
**Entrada:** `¿Qué inventario tengo?`
**Esperado:** Usa `query_inventory_summary`. Respuesta incluye:
- total de unidades
- desglose por ubicación (Bodega, Casa, camionetas)
- desglose por categoría (abanico, persiana, refacciones)

### CP-07 — Cuántos abanicos de modelo X
**Entrada:** `¿Cuántos abanicos tengo del modelo F7239?`
**Esperado:** Usa `query_inventory` con `nombre_item='F7239'`
(o modelo equivalente). Respuesta indica unidades totales y ubicaciones.

### CP-08 — Inventario por vehículo
**Entrada:** `¿Qué tengo en la camioneta nueva?`
**Esperado:** Usa `query_vehicle_inventory` con `nombre_vehiculo='camioneta nueva'`.
Respuesta: lista de items con cantidades.

### CP-09 — Vehículo inexistente
**Entrada:** `¿Qué hay en la camioneta zafiro?` (no existe)
**Esperado:** Mensaje amable "No hay inventario registrado en 'camioneta zafiro'".

### CP-10 — Timeout del modelo
**Simulación:** Mock de `fetch` a Groq que demora >20 s.
**Esperado:** El backend aborta tras `GROQ_TIMEOUT_MS`, responde HTTP 502
con `{ error: 'El modelo tardó demasiado en responder...' }`.
El frontend muestra: "Lo siento, ocurrió un error: El modelo tardó demasiado…"
**Regresión:** No debe llegar a Vercel's default `Internal Server Error`.

### CP-11 — Error de Supabase en una herramienta
**Simulación:** Tabla inaccesible.
**Esperado:** `executeTool` devuelve `{ error: '…' }` al modelo; el modelo
formula una respuesta del tipo "No pude consultar el inventario, intenta de
nuevo". El endpoint responde 200 (no 500).

### CP-12 — Historial con errores previos
**Entrada:** Conversación donde varios turnos de `assistant` fueron errores
("Lo siento, ocurrió un error…").
**Esperado:** Validación de esquema acepta los mensajes (role/content válidos).
El modelo sigue respondiendo correctamente a la nueva pregunta.

### CP-13 — Runaway tool calls
**Simulación:** Mock del modelo que siempre pide `tool_calls`.
**Esperado:** Loop cortado a 4 iteraciones; regresa respuesta por defecto
"No pude generar una respuesta. Intenta reformular la pregunta."

### CP-14 — Cierre de sesión / token expirado
**Entrada:** Cualquier pregunta con token inválido.
**Esperado:** 401 del middleware `verifyAuth`. El frontend muestra
"Lo siento, ocurrió un error: No autorizado".

## Cobertura automatizada (node test-chat.mjs)

| Test | Qué valida |
|---|---|
| 1 | HTML de chips (onclick sin comillas rotas) |
| 2 | Lógica del loop de tool calls (single, chained, sin tools, runaway) |
| 3 | Tabla de inventario correcta (`almacenamiento`, no `inventario_existencias`) |
| 4 | `v_pedidos_resumen` + rango `gte/lt` para `fecha_servicio` |
| 5 | Nuevas tools: `query_inventory_summary`, `query_vehicle_inventory`, filtro `categoria` |
| 6 | `AbortController` + `GROQ_TIMEOUT_MS`; endpoint cierra con 502, nunca con crash |
| 7 | System prompt instruye no-tools para saludos y sí para datos de negocio |

Ejecutar con: `node test-chat.mjs` (33 asserts).

## Verificación manual sugerida

1. Arrancar `npm run dev` (api en 3001, frontend en 5173).
2. Abrir la pestaña **Asistente IA**.
3. Probar en orden cada entrada de CP-01 → CP-09 y validar:
   - que no aparezca "Internal Server Error",
   - que la respuesta tenga datos consistentes con las tablas
     (`almacenamiento`, `v_pedidos_resumen`, `pagos`),
   - que los saludos no disparen tool calls.
4. Para CP-10/CP-11, usar un proxy o modificar temporalmente
   `GROQ_TIMEOUT_MS = 1` y forzar el escenario.

## Criterios de aceptación

- [ ] 33/33 tests de `test-chat.mjs` pasando.
- [ ] 0 ocurrencias de "Internal Server Error" (en inglés) en la UI.
- [ ] Respuestas de inventario coinciden con filas en la tabla `almacenamiento`.
- [ ] Respuestas de pedidos coinciden con filas en `v_pedidos_resumen`.
- [ ] Saludos reciben respuesta conversacional (no echos de tool result).
