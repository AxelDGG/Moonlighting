import fp from 'fastify-plugin';
import { estimatePedidoDurationMin, addMinutesHHMM } from '../durations.js';
import { MS_GRAPH } from '../config/external-apis.js';
import { HTTP } from '../constants/http.js';
import { getRuntimeConfig } from '../loaders/config-cache.js';

// Iconos por tipo de producto. Si a futuro se quieren configurar por BD, mover
// a la tabla enriquecida service_types y leer desde runtime-config.
const ICONS = Object.freeze({
  Abanico: '🪭',
  Persiana: '🪟',
  Levantamiento: '📐',
  Limpieza: '🧹',
  Mantenimiento: '🔧',
});

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
      `${MS_GRAPH.AUTH_BASE}/${MS_TENANT_ID}/oauth2/v2.0/token`,
      { method: 'POST', body }
    );
    const json = await res.json();
    if (!json.access_token) throw new Error(`MS token error: ${json.error_description || json.error}`);
    _token       = json.access_token;
    _tokenExpiry = Date.now() + (json.expires_in - MS_GRAPH.TOKEN_REFRESH_BUFFER_SEC) * 1000;
    return _token;
  }

  async function buildEventPayload(pedido, metrica, cliente, lineas) {
    const cfg = await getRuntimeConfig(fastify.supabase).catch(() => null);
    const durationsByTipo = cfg?.durations || {};

    const tipo   = pedido.tipo_servicio || 'Servicio';
    const ic     = ICONS[tipo] || '📋';
    const nombre = cliente?.nombre || 'Sin cliente';
    const tel    = cliente?.numero || cliente?.telefono || '';
    const hora   = (metrica?.hora_programada || MS_GRAPH.DEFAULT_SERVICE_HOUR).slice(0, 5);
    const duracionEst = estimatePedidoDurationMin(tipo, lineas, pedido.cantidad, durationsByTipo);
    const fin    = (metrica?.hora_fin || addMinutesHHMM(hora, duracionEst)).slice(0, 5);
    const municipio = cliente?.municipio || '';
    const zona   = cliente?.zona || metrica?.zona || '';
    const zonaLabel = zona && municipio ? `${municipio} ${zona}` : (municipio || zona || '');
    const direccion = cliente?.direccion || '';
    const mapsUrl   = cliente?.google_maps_url || null;

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

    const location = { displayName: direccion || zonaLabel || 'Sin dirección' };
    if (cliente?.lat && cliente?.lng) {
      location.coordinates = { latitude: cliente.lat, longitude: cliente.lng };
    }

    const tz = cfg?.region?.timezone || MS_GRAPH.CALENDAR_TIMEZONE;

    return {
      subject: `${ic} ${tipo} – ${nombre}`,
      body:     { contentType: 'html', content: bodyLines },
      start:    { dateTime: `${pedido.fecha}T${hora}:00`, timeZone: tz },
      end:      { dateTime: `${pedido.fecha}T${fin}:00`,  timeZone: tz },
      location,
      isReminderOn:                true,
      reminderMinutesBeforeStart:  MS_GRAPH.REMINDER_MIN,
    };
  }

  async function createEvent(payload) {
    const token = await getToken();
    const res   = await fetch(
      `${MS_GRAPH.GRAPH_BASE}/users/${MS_CALENDAR_USER}/events`,
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
      `${MS_GRAPH.GRAPH_BASE}/users/${MS_CALENDAR_USER}/events/${eventId}`,
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
      `${MS_GRAPH.GRAPH_BASE}/users/${MS_CALENDAR_USER}/events/${eventId}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok && res.status !== HTTP.NOT_FOUND) throw new Error(`Graph deleteEvent ${res.status}`);
  }

  fastify.decorate('msGraph', { buildEventPayload, createEvent, updateEvent, deleteEvent });
});
