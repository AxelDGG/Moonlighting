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
    const tipo   = pedido.tipo_servicio || 'Servicio';
    const nombre = cliente?.nombre || 'Sin cliente';
    const tel    = cliente?.numero || cliente?.telefono || '';
    const hora   = (metrica?.hora_programada || '08:00').slice(0, 5);
    const fin    = (metrica?.hora_fin || addOneHour(hora)).slice(0, 5);
    const municipio = cliente?.municipio || '';
    const zona   = cliente?.zona || metrica?.zona || '';
    const zonaLabel = zona && municipio ? `${municipio} ${zona}` : (municipio || zona || '');
    const direccion = cliente?.direccion || '';
    const mapsUrl   = cliente?.google_maps_url || null;

    // Detalles específicos por tipo de servicio
    const det = pedido.detalles || {};
    const detalleLineas = [];
    if (tipo === 'Abanico') {
      if (det.modelo)   detalleLineas.push(`<b>Modelo:</b> ${det.modelo}`);
      if (det.nDesins)  detalleLineas.push(`<b>Desinstalar:</b> ${det.nDesins} ud`);
    } else if (tipo === 'Persiana') {
      if (det.tipoTela) detalleLineas.push(`<b>Tela:</b> ${det.tipoTela}`);
      if (det.ancho && det.alto) detalleLineas.push(`<b>Medidas:</b> ${det.ancho} × ${det.alto} cm`);
      if (det.instalacion) detalleLineas.push(`<b>Instalación:</b> ${det.instalacion}`);
    } else if (tipo === 'Limpieza') {
      if (det.modelo) detalleLineas.push(`<b>Modelo:</b> ${det.modelo}`);
    }
    if (det.notas)    detalleLineas.push(`<b>Notas:</b> ${det.notas}`);
    if (det.traslado) detalleLineas.push(`<b>Traslado:</b> $${det.traslado}`);

    const bodyLines = [
      `<b>Cliente:</b> ${nombre}`,
      tel ? `<b>Teléfono:</b> <a href="tel:${tel}">${tel}</a>` : '',
      direccion ? `<b>Dirección:</b> ${direccion}` : '',
      zonaLabel ? `<b>Zona:</b> ${zonaLabel}` : '',
      `<b>Tipo de servicio:</b> ${tipo}`,
      `<b>Cantidad:</b> ${pedido.cantidad}`,
      ...detalleLineas,
      `<b>Total a pagar:</b> $${pedido.total}`,
      `<b>Técnico:</b> ${metrica?.tecnico || 'Por asignar'}`,
      mapsUrl ? `<br><b>Ubicación exacta:</b> <a href="${mapsUrl}">Abrir en Google Maps</a>` : '',
    ].filter(Boolean).join('<br>');

    // Location con coordenadas si están disponibles para mejor navegación
    const location = { displayName: direccion || zonaLabel || 'Sin dirección' };
    if (cliente?.lat && cliente?.lng) {
      location.coordinates = { latitude: cliente.lat, longitude: cliente.lng };
    }

    return {
      subject: `${ic} ${tipo} – ${nombre}`,
      body:     { contentType: 'html', content: bodyLines },
      start:    { dateTime: `${pedido.fecha}T${hora}:00`, timeZone: 'America/Monterrey' },
      end:      { dateTime: `${pedido.fecha}T${fin}:00`,  timeZone: 'America/Monterrey' },
      location,
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
