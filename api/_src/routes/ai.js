const GROQ_MODEL = 'llama-3.3-70b-versatile';

/* ── CHAT TOOLS ── */
const CHAT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'query_inventory',
      description: 'Consulta el inventario de productos (abanicos, persianas, refacciones) por ubicación o nombre. Úsalo cuando pregunten cuánto hay de algo o qué hay en un lugar.',
      parameters: {
        type: 'object',
        properties: {
          nombre_item: {
            type: 'string',
            description: 'Nombre o parte del nombre del producto a buscar (opcional)',
          },
          nombre_ubicacion: {
            type: 'string',
            description: 'Nombre o parte del nombre de la ubicación a filtrar (opcional)',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_orders_today',
      description: 'Obtiene los pedidos con fecha de servicio en una fecha específica (por defecto hoy). Úsalo cuando pregunten qué pedidos hay hoy o en una fecha.',
      parameters: {
        type: 'object',
        properties: {
          fecha: {
            type: 'string',
            description: 'Fecha en formato YYYY-MM-DD. Si no se especifica, usar la fecha de hoy.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_sales_today',
      description: 'Consulta el total vendido (pagos recibidos) en una fecha o rango. Úsalo cuando pregunten cuánto se ha vendido o cobrado.',
      parameters: {
        type: 'object',
        properties: {
          desde: {
            type: 'string',
            description: 'Fecha inicio en formato YYYY-MM-DD. Si preguntan "hoy" usar la fecha actual.',
          },
          hasta: {
            type: 'string',
            description: 'Fecha fin en formato YYYY-MM-DD. Si preguntan "hoy" usar la misma fecha que desde.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_orders_by_status',
      description: 'Lista pedidos filtrados por estado. Úsalo cuando pregunten por pedidos pendientes, en proceso, cancelados, completados, etc.',
      parameters: {
        type: 'object',
        properties: {
          estado: {
            type: 'string',
            description: 'Estado del pedido: pendiente, en_proceso, completado, cancelado, reagendado',
          },
          limite: {
            type: 'integer',
            description: 'Número máximo de resultados a retornar (default 10)',
          },
        },
        required: ['estado'],
      },
    },
  },
];

async function executeTool(toolName, args, supabase) {
  if (toolName === 'query_inventory') {
    // App uses 'almacenamiento' table (legacy system where data actually lives)
    let query = supabase
      .from('almacenamiento')
      .select('id, modelo, categoria, lugar, cantidad, precio')
      .gt('cantidad', 0);

    if (args.nombre_item)      query = query.ilike('modelo', `%${args.nombre_item}%`);
    if (args.nombre_ubicacion) query = query.ilike('lugar',  `%${args.nombre_ubicacion}%`);

    const { data, error } = await query.order('lugar').order('modelo').limit(50);
    if (error) return { error: 'No se pudo consultar el inventario' };

    const rows = data || [];
    if (rows.length === 0) return { resultado: 'No hay productos en el inventario con esos criterios.' };
    return {
      total_items: rows.length,
      inventario: rows.map(r =>
        `${r.modelo} (${r.categoria || 'sin categoría'}) en ${r.lugar}: ${r.cantidad} unid. — $${r.precio}/ud`
      ),
    };
  }

  if (toolName === 'query_orders_today') {
    // Use the same view as the existing GET /pedidos endpoint
    // fecha_servicio is a DATE column (YYYY-MM-DD), no timestamp suffix needed
    const fecha = args.fecha || new Date().toLocaleDateString('sv', { timeZone: 'America/Monterrey' });
    const { data, error } = await supabase
      .from('v_pedidos_resumen')
      .select('*')
      .eq('fecha_servicio', fecha)
      .order('fecha_servicio');
    if (error) return { error: 'No se pudieron consultar los pedidos' };
    if (!data || data.length === 0) return { resultado: `No hay pedidos con fecha de servicio el ${fecha}.` };
    return {
      fecha,
      total_pedidos: data.length,
      pedidos: data.slice(0, 20),
    };
  }

  if (toolName === 'query_sales_today') {
    const today = new Date().toLocaleDateString('sv', { timeZone: 'America/Monterrey' });
    const desde = args.desde || today;
    const hasta = args.hasta || today;
    const { data, error } = await supabase
      .from('pagos')
      .select('monto, fecha_pago, metodos_pago(nombre)')
      .gte('fecha_pago', `${desde}T00:00:00`)
      .lte('fecha_pago', `${hasta}T23:59:59`);
    if (error) return { error: 'No se pudieron consultar los pagos' };
    const total = (data || []).reduce((s, p) => s + (p.monto || 0), 0);
    const porMetodo = {};
    for (const p of data || []) {
      const m = p.metodos_pago?.nombre || 'Sin método';
      porMetodo[m] = (porMetodo[m] || 0) + (p.monto || 0);
    }
    return {
      desde,
      hasta,
      total_cobrado: total,
      num_pagos: (data || []).length,
      por_metodo: porMetodo,
    };
  }

  if (toolName === 'query_orders_by_status') {
    const limite = args.limite || 10;
    // Resolve estado name → ID first, then filter the view
    const { data: estados } = await supabase.from('estados_pedido').select('id, nombre');
    const estadoMatch = (estados || []).find(e =>
      e.nombre.toLowerCase().includes(args.estado.toLowerCase())
    );
    let query = supabase
      .from('v_pedidos_resumen')
      .select('*')
      .order('fecha_pedido', { ascending: false })
      .limit(limite);
    if (estadoMatch) query = query.eq('estado_id', estadoMatch.id);
    const { data, error } = await query;
    if (error) return { error: 'No se pudieron consultar los pedidos' };
    if (!data || data.length === 0) return { resultado: `No hay pedidos con estado "${args.estado}".` };
    return {
      estado: args.estado,
      total_encontrados: data.length,
      pedidos: data,
    };
  }

  return { error: `Herramienta desconocida: ${toolName}` };
}

const zonaSchema = { type: 'object', properties: { zona: { type: 'string' }, avg: { type: 'number' } } };
const tecSchema  = { type: 'object', properties: { tec: { type: 'string' }, pct: { type: 'number' }, n: { type: 'integer' } } };
const tipoSchema = { type: 'object', properties: { tipo: { type: 'string' }, avg: { type: 'number' } } };
const diaSchema  = { type: 'object', properties: { dia: { type: 'string' }, avg: { type: 'number' } } };

function buildPrompt(d) {
  const zonas   = d.zonas.length    ? d.zonas.map(z => `- ${z.zona}: ${z.avg} min prom.`).join('\n') : 'Sin datos';
  const tecs    = d.tecnicos.length ? d.tecnicos.map(t => `- ${t.tec}: ${t.pct}% completados (${t.n} servicios)`).join('\n') : 'Sin datos';
  const tipos   = d.tipos.length    ? d.tipos.map(t => `- ${t.tipo}: ${t.avg} min prom.`).join('\n') : 'Sin datos';
  const dias    = d.dias.slice(0, 5).map(x => `- ${x.dia}: ${x.avg} min prom.`).join('\n') || 'Sin datos';
  const motivos = d.motivos.length  ? d.motivos.join(', ') : 'Sin datos';

  return `Eres un consultor de operaciones para Moonlighting, empresa de instalación de abanicos y persianas en Monterrey, NL.

Analiza las métricas y da retroalimentación ejecutiva en español:

RESUMEN
- Clientes: ${d.nClientes} | Pedidos: ${d.nPedidos} | Ingresos: $${Number(d.ingresos).toLocaleString('es', { minimumFractionDigits: 2 })}
- Servicios con tracking: ${d.total} | Completados: ${d.completed} (${d.pctOk}%)
- Atrasados: ${d.delayed} | Cancelados: ${d.cancelled}
- Retraso promedio: ${d.avgDelay} min | Duración promedio: ${d.avgDur} min

RETRASO POR ZONA
${zonas}

EFICIENCIA POR TÉCNICO
${tecs}

RETRASO POR TIPO DE SERVICIO
${tipos}

DÍAS CON MÁS RETRASO
${dias}

MOTIVOS
${motivos}

Responde SOLO con este formato:

## ✅ Qué está funcionando bien
(2-3 puntos con números concretos)

## 🔧 Prioridades de mejora
1. [acción] — [impacto]
2. [acción] — [impacto]
3. [acción] — [impacto]

## 🚨 Alerta
(Indicador crítico o "Sin alertas críticas.")

Máximo 250 palabras. Sé directo y usa los números.`;
}

export default async function aiRoutes(fastify) {
  fastify.addHook('preHandler', fastify.verifyAuth);

  fastify.post('/feedback', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    schema: {
      body: {
        type: 'object',
        required: ['total', 'completed', 'nPedidos', 'nClientes'],
        properties: {
          total:     { type: 'integer' },
          completed: { type: 'integer' },
          delayed:   { type: 'integer' },
          cancelled: { type: 'integer' },
          pctOk:     { type: 'integer' },
          avgDelay:  { type: 'integer' },
          avgDur:    { type: 'integer' },
          ingresos:  { type: 'number' },
          nClientes: { type: 'integer' },
          nPedidos:  { type: 'integer' },
          zonas:     { type: 'array', items: zonaSchema },
          tecnicos:  { type: 'array', items: tecSchema },
          tipos:     { type: 'array', items: tipoSchema },
          dias:      { type: 'array', items: diaSchema },
          motivos:   { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    },
  }, async (req, reply) => {
    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      return reply.code(503).send({ error: 'GROQ_API_KEY no configurado en el servidor' });
    }
    const prompt = buildPrompt(req.body);

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqApiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: 'Eres un consultor de operaciones experto. Responde en español, de forma directa y con los datos numéricos provistos.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.5,
        max_tokens: 600,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return reply.code(502).send({ error: err.error?.message || 'Error al contactar el modelo' });
    }

    const json = await res.json();
    const text = json.choices?.[0]?.message?.content || 'Sin respuesta del modelo.';
    return { text, model: GROQ_MODEL };
  });

  /* ── POST /chat ── conversational chatbot with tool calling ── */
  fastify.post('/chat', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    schema: {
      body: {
        type: 'object',
        required: ['messages'],
        properties: {
          messages: {
            type: 'array',
            minItems: 1,
            maxItems: 40,
            items: {
              type: 'object',
              required: ['role', 'content'],
              properties: {
                role:    { type: 'string', enum: ['user', 'assistant'] },
                content: { type: 'string', maxLength: 2000 },
              },
              additionalProperties: false,
            },
          },
        },
        additionalProperties: false,
      },
    },
  }, async (req, reply) => {
    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      return reply.code(503).send({ error: 'GROQ_API_KEY no configurado en el servidor' });
    }

    const today = new Date().toLocaleDateString('es', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Monterrey' });
    const todayISO = new Date().toLocaleDateString('sv', { timeZone: 'America/Monterrey' });

    const systemMsg = {
      role: 'system',
      content: `Eres el asistente de Moonlighting, empresa de instalación de abanicos de techo y persianas en Monterrey, NL.
Hoy es ${today} (${todayISO}).
Respondes en español, de forma concisa y útil. Cuando el usuario pregunta sobre datos del negocio (inventario, pedidos, ventas) SIEMPRE usas las herramientas disponibles para consultar información real. No inventes datos ni des respuestas genéricas cuando hay una herramienta que puede resolver la pregunta.`,
    };

    const messages = [systemMsg, ...req.body.messages];

    const callGroq = async (msgs) => {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${groqApiKey}`,
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: msgs,
          tools: CHAT_TOOLS,
          tool_choice: 'auto',
          temperature: 0.3,
          max_tokens: 800,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || 'Error al contactar el modelo');
      }
      return res.json();
    };

    let json = await callGroq(messages);
    let choice = json.choices?.[0];

    // Loop to handle multi-hop tool calls (max 4 rounds)
    let maxIter = 4;
    while (choice?.finish_reason === 'tool_calls' && choice.message?.tool_calls?.length > 0 && maxIter-- > 0) {
      // Normalize content: null breaks some API parsers
      messages.push({ ...choice.message, content: choice.message.content ?? '' });

      for (const tc of choice.message.tool_calls) {
        let toolArgs = {};
        try { toolArgs = JSON.parse(tc.function.arguments || '{}'); } catch { /* ignore */ }
        const toolResult = await executeTool(tc.function.name, toolArgs, fastify.supabase);
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(toolResult),
        });
      }

      json = await callGroq(messages);
      choice = json.choices?.[0];
    }

    const text = choice?.message?.content || 'No pude generar una respuesta. Intenta de nuevo.';
    return { text, model: GROQ_MODEL };
  });
}
