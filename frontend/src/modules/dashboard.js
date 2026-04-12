import { state } from '../state.js';
import { money, esc, fdateShort, muniColor, pillPago, tipoPill } from '../utils.js';
import { TIPO_BG } from '../constants.js';
import { ic } from '../icons.js';

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
      : `<div class="empty" style="padding:18px"><div class="ei">${ic('users', 'xl')}</div><p>Sin clientes</p></div>`;
  }

  const dp2 = document.getElementById('dp');
  const up  = state.pedidos.slice(-4).reverse();
  if (dp2) {
    dp2.innerHTML = up.length
      ? up.map(p => {
          const c  = p.clienteId ? state.clientes.find(x => x.id === +p.clienteId) : null;
          const bg = TIPO_BG[p.tipoServicio] || '#f1f5f9';
          return `<div style="display:flex;align-items:center;gap:9px;padding:8px 0;border-bottom:1px solid var(--bo)">
            <div style="width:32px;height:32px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#475569">${ic('box')}</div>
            <div style="flex:1;min-width:0"><div style="font-size:12.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${tipoPill(p.tipoServicio)}${p.detalles?.modelo ? ' <span class="mu">— ' + esc(p.detalles.modelo) + '</span>' : ''}</div>
            <div style="font-size:11px;color:var(--mu)">${c ? esc(c.nombre) : 'Sin cliente'} · ${fdateShort(p.fecha)}</div></div>
            <span style="font-weight:700;color:var(--ok);font-size:12.5px;flex-shrink:0">${money(p.total)}</span>
          </div>`;
        }).join('')
      : `<div class="empty" style="padding:18px"><div class="ei">${ic('box', 'xl')}</div><p>Sin pedidos</p></div>`;
  }
}
