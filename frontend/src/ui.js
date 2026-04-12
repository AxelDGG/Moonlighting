const _checkIc = `<svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const _xIc     = `<svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

export function toast(msg, type = 'ok') {
  const el = document.createElement('div');
  el.className = `toast t${type}`;
  const icon = document.createElement('span');
  icon.className = 'toast-icon';
  icon.innerHTML = type === 'ok' ? _checkIc : _xIc;
  icon.style.color = type === 'ok' ? '#22c55e' : '#ef4444';
  el.appendChild(icon);
  el.appendChild(document.createTextNode(msg));
  document.getElementById('toasts')?.appendChild(el);
  setTimeout(() => el.remove(), 3500);
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

export function initOverlayListeners() {
  document.querySelectorAll('.ov').forEach(o =>
    o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); })
  );
}
