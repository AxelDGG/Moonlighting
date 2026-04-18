import { state } from '../state.js';
import { esc, money, fdate, tipoPill, statusPill, pedidoDetalle, todayStr } from '../utils.js';
import { refreshIcons } from '../icons.js';

function mapsUrl(c) {
  if (!c) return null;
  if (c.googleMapsUrl) return c.googleMapsUrl;
  if (c.lat != null && c.lng != null) return `https://www.google.com/maps?q=${c.lat},${c.lng}`;
  if (c.direccion) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.direccion)}`;
  return null;
}

function telUrl(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/[^\d+]/g, '');
  return digits ? 'tel:' + digits : null;
}

function fmtHora(h) {
  if (!h) return '';
  return String(h).slice(0, 5);
}

function diaBonito(fechaStr) {
  if (!fechaStr) return '—';
  const d = new Date(fechaStr + 'T12:00:00');
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const diff = Math.round((d - hoy) / 86400000);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Mañana';
  if (diff === -1) return 'Ayer';
  const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  return dias[d.getDay()] + ' ' + d.toLocaleDateString('es', { day: '2-digit', month: 'short' });
}

function isCancelled(p) {
  return (p.estado || '').toLowerCase() === 'cancelado';
}

function myPedidos() {
  const name = state._tecnicoNombre;
  if (!name) return [];
  const smByPedido = new Map(
    (state.servicios_metricas || []).map(s => [s.pedido_id, s])
  );
  return (state.pedidos || [])
    .filter(p => !isCancelled(p))
    .map(p => ({ p, sm: smByPedido.get(p.id) || null }))
    .filter(({ sm }) => sm && sm.tecnico === name);
}

export function renderTecnicoView() {
  const tab = document.getElementById('tab-tecnico');
  if (!tab) return;

  const items = myPedidos();

  // Agrupar por fecha para el resumen
  const hoy = todayStr();
  const porDia = new Map();
  items.forEach(({ p, sm }) => {
    const k = p.fecha || 'sin-fecha';
    if (!porDia.has(k)) porDia.set(k, []);
    porDia.get(k).push({ p, sm });
  });
  const dias = Array.from(porDia.keys()).sort((a, b) => a.localeCompare(b));

  const totalHoy = (porDia.get(hoy) || []).length;
  const totalProx = items.filter(({ p }) => p.fecha && p.fecha > hoy).length;

  if (!items.length) {
    tab.innerHTML = `
      <div style="max-width:720px;margin:24px auto;padding:0 16px">
        <div class="card"><div class="cb" style="text-align:center;padding:40px 20px">
          <i data-lucide="calendar-check" style="width:42px;height:42px;color:#94a3b8;margin-bottom:10px"></i>
          <div style="font-size:16px;font-weight:600;margin-bottom:4px">No tienes pedidos asignados</div>
          <div style="color:var(--mu);font-size:13px">Cuando un administrador te asigne un servicio, aparecerá aquí.</div>
        </div></div>
      </div>`;
    refreshIcons(tab);
    return;
  }

  const summary = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:14px">
      <div class="card" style="margin:0"><div class="cb" style="padding:14px">
        <div style="font-size:11px;color:var(--mu);text-transform:uppercase;letter-spacing:.5px;font-weight:600">Hoy</div>
        <div style="font-size:24px;font-weight:700;color:var(--p);margin-top:4px">${totalHoy}</div>
        <div style="font-size:11px;color:var(--mu)">servicio${totalHoy === 1 ? '' : 's'}</div>
      </div></div>
      <div class="card" style="margin:0"><div class="cb" style="padding:14px">
        <div style="font-size:11px;color:var(--mu);text-transform:uppercase;letter-spacing:.5px;font-weight:600">Próximos</div>
        <div style="font-size:24px;font-weight:700;color:#059669;margin-top:4px">${totalProx}</div>
        <div style="font-size:11px;color:var(--mu)">pendiente${totalProx === 1 ? '' : 's'}</div>
      </div></div>
      <div class="card" style="margin:0"><div class="cb" style="padding:14px">
        <div style="font-size:11px;color:var(--mu);text-transform:uppercase;letter-spacing:.5px;font-weight:600">Total asignados</div>
        <div style="font-size:24px;font-weight:700;color:#7c3aed;margin-top:4px">${items.length}</div>
        <div style="font-size:11px;color:var(--mu)">pedido${items.length === 1 ? '' : 's'}</div>
      </div></div>
    </div>`;

  const diasHtml = dias.map(dia => {
    const lista = porDia.get(dia).sort((a, b) => {
      const ha = a.sm?.hora_programada || '99:99';
      const hb = b.sm?.hora_programada || '99:99';
      return ha.localeCompare(hb);
    });
    const isPast = dia !== 'sin-fecha' && dia < hoy;
    const isToday = dia === hoy;
    const label = dia === 'sin-fecha' ? 'Sin fecha asignada' : diaBonito(dia);
    const fullDate = dia === 'sin-fecha' ? '' : fdate(dia);
    const borderColor = isToday ? 'var(--p)' : isPast ? '#cbd5e1' : 'var(--bo)';
    const headerBg = isToday ? 'rgba(29,78,216,0.08)' : 'transparent';

    const cards = lista.map(({ p, sm }) => {
      const c = p.clienteId ? state.clientes.find(x => x.id === +p.clienteId) : null;
      const hora = fmtHora(sm?.hora_programada);
      const maps = mapsUrl(c);
      const tel = telUrl(c?.telefono || c?.numero);
      const estado = sm?.estado ? statusPill(sm.estado) : '';
      const dir = c?.direccion ? esc(c.direccion) : '<span class="mu">Sin dirección registrada</span>';
      const muni = c?.municipio && c.municipio !== 'Desconocido' ? esc(c.municipio) : '';

      return `
      <div style="border:1px solid var(--bo);border-radius:12px;padding:14px;margin-bottom:10px;background:var(--card)${isPast ? ';opacity:0.7' : ''}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:10px;flex-wrap:wrap">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            ${hora ? `<span style="background:var(--p);color:#fff;padding:4px 10px;border-radius:8px;font-weight:700;font-size:13px;font-family:monospace">${hora}</span>` : ''}
            ${tipoPill(p.tipoServicio)}
            ${estado}
          </div>
          <span class="pill pi" style="font-size:11px">#${p.id}</span>
        </div>

        <div style="margin-bottom:10px">
          <div style="font-weight:700;font-size:15px;margin-bottom:2px">${c ? esc(c.nombre) : '<span class="mu">Sin cliente</span>'}</div>
          ${muni ? `<div style="font-size:11px;color:var(--mu);margin-bottom:4px">${muni}</div>` : ''}
          <div style="font-size:13px;color:var(--text);margin-bottom:2px">
            <i data-lucide="map-pin" style="width:13px;height:13px;vertical-align:middle;color:#64748b"></i>
            ${dir}
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;font-size:12.5px">
          <div>
            <div style="color:var(--mu);font-size:11px;text-transform:uppercase;letter-spacing:.3px;font-weight:600">Detalle</div>
            <div style="margin-top:2px">${pedidoDetalle(p)}</div>
          </div>
          <div>
            <div style="color:var(--mu);font-size:11px;text-transform:uppercase;letter-spacing:.3px;font-weight:600">Cantidad · Total</div>
            <div style="margin-top:2px"><b>${p.cantidad}</b> · <b class="grn">${money(p.total)}</b></div>
          </div>
        </div>

        ${p.notasOperativas ? `<div style="background:#fef3c7;color:#92400e;padding:8px 10px;border-radius:8px;font-size:12px;margin-bottom:10px">
          <i data-lucide="sticky-note" style="width:12px;height:12px;vertical-align:middle"></i>
          <b>Notas:</b> ${esc(p.notasOperativas)}
        </div>` : ''}

        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${maps ? `<a href="${esc(maps)}" target="_blank" rel="noopener" class="btn bp bsm" style="text-decoration:none">
            <i data-lucide="navigation" style="width:13px;height:13px"></i> Ir en Maps
          </a>` : ''}
          ${tel ? `<a href="${esc(tel)}" class="btn bg bsm" style="text-decoration:none">
            <i data-lucide="phone" style="width:13px;height:13px"></i> Llamar
          </a>` : ''}
          ${!isPast ? `<button class="btn bg bsm" style="background:#dbeafe;color:#1d4ed8" onclick="openTrackModal(${p.id})">
            <i data-lucide="clock" style="width:13px;height:13px"></i> Seguimiento
          </button>` : ''}
        </div>
      </div>`;
    }).join('');

    return `
      <div style="margin-bottom:16px">
        <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:${headerBg};border-left:3px solid ${borderColor};border-radius:6px;margin-bottom:10px">
          <span style="font-weight:700;font-size:14px">${label}</span>
          ${fullDate ? `<span style="color:var(--mu);font-size:12px">${fullDate}</span>` : ''}
          <span style="margin-left:auto;background:var(--bg);color:var(--mu);padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600">${lista.length} servicio${lista.length === 1 ? '' : 's'}</span>
        </div>
        ${cards}
      </div>`;
  }).join('');

  tab.innerHTML = `
    <div style="max-width:780px;margin:0 auto;padding:0 4px">
      <div style="margin-bottom:14px">
        <h2 style="margin:0 0 4px;font-size:20px">Mi agenda</h2>
        <div style="color:var(--mu);font-size:13px">${state._tecnicoNombre ? esc(state._tecnicoNombre) : 'Técnico'} · pedidos asignados</div>
      </div>
      ${summary}
      ${diasHtml}
    </div>`;

  refreshIcons(tab);
}
