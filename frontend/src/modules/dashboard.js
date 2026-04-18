import { state } from '../state.js';
import { money, esc, fdateShort, muniColor, pillPago, tipoPill } from '../utils.js';
import { TIPO_IC, TIPO_BG, TIPO_CO } from '../constants.js';
import { refreshIcons } from '../icons.js';

export function renderDash() {
  const ab  = state.pedidos.filter(p => p.tipoServicio === 'Abanico').length;
  const pe  = state.pedidos.filter(p => p.tipoServicio === 'Persiana').length;
  const tot = state.pedidos.reduce((s, p) => s + parseFloat(p.total || 0), 0);

  document.getElementById('s-c').textContent = state.clientes.length;
  document.getElementById('s-a').textContent = ab;
  document.getElementById('s-p').textContent = pe;
  document.getElementById('s-t').textContent = money(tot);

  const dcl = document.getElementById('dc');
  const uc  = state.clientes.slice(-4).reverse();
  if (dcl) {
    dcl.innerHTML = uc.length
      ? uc.map(c => `<div style="display:flex;align-items:center;gap:9px;padding:8px 0;border-bottom:1px solid var(--bo)">
          <div style="width:32px;height:32px;border-radius:50%;background:${muniColor(c.municipio)};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0">${esc(c.nombre.charAt(0).toUpperCase())}</div>
          <div style="flex:1;min-width:0"><div style="font-size:12.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.nombre)}</div><div style="font-size:11px;color:var(--mu)">${esc(c.municipio || '')}</div></div>
          ${pillPago(c.metodoPago)}</div>`).join('')
      : '<div class="empty" style="padding:18px"><div class="ei"><i data-lucide="users" style="width:28px;height:28px;color:var(--mu)"></i></div><p>Sin clientes</p></div>';
    refreshIcons(dcl);
  }

  const dp2 = document.getElementById('dp');
  const up  = state.pedidos.slice(-4).reverse();
  if (dp2) {
    dp2.innerHTML = up.length
      ? up.map(p => {
          const c = p.clienteId ? state.clientes.find(x => x.id === +p.clienteId) : null;
          const iconName = TIPO_IC[p.tipoServicio] || 'package', bg = TIPO_BG[p.tipoServicio] || '#f1f5f9', co = TIPO_CO[p.tipoServicio] || '#475569';
          return `<div style="display:flex;align-items:center;gap:9px;padding:8px 0;border-bottom:1px solid var(--bo)">
            <div style="width:32px;height:32px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;flex-shrink:0;color:${co}"><i data-lucide="${iconName}" style="width:16px;height:16px"></i></div>
            <div style="flex:1;min-width:0"><div style="font-size:12.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.tipoServicio)}${p.detalles?.modelo ? ' — ' + esc(p.detalles.modelo) : ''}</div>
            <div style="font-size:11px;color:var(--mu)">${c ? esc(c.nombre) : 'Sin cliente'} · ${fdateShort(p.fecha)}</div></div>
            <span style="font-weight:700;color:var(--ok);font-size:12.5px;flex-shrink:0">${money(p.total)}</span>
          </div>`;
        }).join('')
      : '<div class="empty" style="padding:18px"><div class="ei"><i data-lucide="package" style="width:28px;height:28px;color:var(--mu)"></i></div><p>Sin pedidos</p></div>';
    refreshIcons(dp2);
  }
}
