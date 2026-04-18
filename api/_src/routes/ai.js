const GROQ_MODEL = 'llama-3.3-70b-versatile';

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
}
