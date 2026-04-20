import { TOAST_DURATION_MS } from './constants.js';

export function toast(msg, type = 'ok') {
  const el = document.createElement('div');
  el.className = `toast t${type}`;
  const iconName = type === 'ok' ? 'check-circle' : 'x-circle';
  el.innerHTML = `<span style="display:flex;align-items:center;gap:7px"><i data-lucide="${iconName}" style="width:14px;height:14px;flex-shrink:0"></i>${msg}</span>`;
  document.getElementById('toasts')?.appendChild(el);
  if (window.lucide) try { window.lucide.createIcons({ nodes: el.querySelectorAll('[data-lucide]') }); } catch (_) {}
  setTimeout(() => el.remove(), TOAST_DURATION_MS);
}

export function setLoader(show, msg = '') {
  const el = document.getElementById('loader');
  if (!el) return;
  el.classList.toggle('show', show);
  if (msg) document.getElementById('loader-msg').textContent = msg;
}

export function setDbStatus(ok) {
  const dot    = document.getElementById('db-dot');
  const status = document.getElementById('db-status');
  if (dot)    dot.className = 'sf-dot' + (ok ? ' online' : '');
  if (status) status.textContent = ok ? 'Conectado a Supabase' : 'Sin conexión';
}

export function openOv(id)  { document.getElementById(id)?.classList.add('open'); }
export function closeOv(id) { document.getElementById(id)?.classList.remove('open'); }

export function badge(t) { const el = document.getElementById('pbadge'); if (el) el.textContent = t; }

export function toggleSidebar() {
  document.querySelector('.sidebar')?.classList.toggle('open');
  document.getElementById('sidebar-overlay')?.classList.toggle('show');
}

export function initMobileRows(tbody) {
  if (!tbody) return;
  tbody.querySelectorAll('tr').forEach(tr => {
    if (!tr.querySelector('.mob-det')) return;
    const td = document.createElement('td');
    td.className = 'mob-exp';
    td.textContent = 'Ver detalles ▼';
    tr.appendChild(td);
    tr.addEventListener('click', e => {
      if (e.target.closest('button, a, input, select')) return;
      const expanded = tr.classList.toggle('expanded');
      td.textContent = expanded ? 'Ver menos ▲' : 'Ver detalles ▼';
    });
  });
}

export function initOverlayListeners() {
  document.querySelectorAll('.ov').forEach(o =>
    o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); })
  );
}
