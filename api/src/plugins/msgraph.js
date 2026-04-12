import fp from 'fastify-plugin';

export default fp(async (fastify) => {
  const { MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, MS_CALENDAR_USER } = process.env;
  const configured = MS_TENANT_ID && MS_CLIENT_ID && MS_CLIENT_SECRET && MS_CALENDAR_USER;

  if (!configured) {
    fastify.decorate('msGraph', null);
    return;
  }

  let _token      = null;
  let _tokenExpiry = 0;

  async function getToken() {
    if (_token && Date.now() < _tokenExpiry) return _token;
    const body = new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     MS_CLIENT_ID,
      client_secret: MS_CLIENT_SECRET,
      scope:         'https://graph.microsoft.com/.default',
    });
    const res  = await fetch(
      `https://login.microsoftonline.com/${MS_TENANT_ID}/oauth2/v2.0/token`,
      { method: 'POST', body }
    );
    const json = await res.json();
    if (!json.access_token) throw new Error(`MS token error: ${json.error_description || json.error}`);
    _token       = json.access_token;
    _tokenExpiry = Date.now() + (json.expires_in - 60) * 1000;
    return _token;
  }

  function addOneHour(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    const d = new Date(2000, 0, 1, h + 1, m);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function buildEventPayload(pedido, metrica, cliente) {
    const ICONS = { Abanico: '🪭', Persiana: '🪟', Levantamiento: '📐', Limpieza: '🧹', Mantenimiento: '🔧' };
    const ic     = ICONS[pedido.tipo_servicio] || '📋';
    const nombre = cliente?.nombre || 'Sin cliente';
    const hora   = metrica?.hora_programada || '08:00';
    const fin    = metrica?.hora_fin || addOneHour(hora);
    const zona   = metrica?.zona || cliente?.municipio || '';
    const dir    = cliente?.direccion ? `${zona} — ${cliente.direccion}` : zona;

    const bodyLines = [
      `<b>Técnico:</b> ${metrica?.tecnico || 'Por asignar'}`,
      `<b>Zona:</b> ${zona || '—'}`,
      cliente?.numero ? `<b>Tel:</b> ${cliente.numero}` : '',
      `<b>Total:</b> $${pedido.total}`,
      `<b>Cantidad:</b> ${pedido.cantidad}`,
      pedido.detalles?.modelo   ? `<b>Modelo:</b> ${pedido.detalles.modelo}` : '',
      pedido.detalles?.tipoTela ? `<b>Tela:</b> ${pedido.detalles.tipoTela}` : '',
      pedido.detalles?.notas    ? `<b>Notas:</b> ${pedido.detalles.notas}`   : '',
    ].filter(Boolean).join('<br>');

    return {
      subject: `${ic} ${pedido.tipo_servicio} – ${nombre}`,
      body:     { contentType: 'HTML', content: bodyLines },
      start:    { dateTime: `${pedido.fecha}T${hora}:00`, timeZone: 'America/Monterrey' },
      end:      { dateTime: `${pedido.fecha}T${fin}:00`,  timeZone: 'America/Monterrey' },
      location: { displayName: dir },
      isReminderOn:                true,
      reminderMinutesBeforeStart:  30,
    };
  }

  async function createEvent(payload) {
    const token = await getToken();
    const res   = await fetch(
      `https://graph.microsoft.com/v1.0/users/${MS_CALENDAR_USER}/events`,
      {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      }
    );
    if (!res.ok) throw new Error(`Graph createEvent ${res.status}: ${await res.text()}`);
    return res.json();
  }

  async function updateEvent(eventId, payload) {
    const token = await getToken();
    const res   = await fetch(
      `https://graph.microsoft.com/v1.0/users/${MS_CALENDAR_USER}/events/${eventId}`,
      {
        method:  'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      }
    );
    if (!res.ok) throw new Error(`Graph updateEvent ${res.status}: ${await res.text()}`);
  }

  async function deleteEvent(eventId) {
    const token = await getToken();
    const res   = await fetch(
      `https://graph.microsoft.com/v1.0/users/${MS_CALENDAR_USER}/events/${eventId}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok && res.status !== 404) throw new Error(`Graph deleteEvent ${res.status}`);
  }

  fastify.decorate('msGraph', { buildEventPayload, createEvent, updateEvent, deleteEvent });
});
