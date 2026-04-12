export function toast(msg, type = 'ok') {
  const el = document.createElement('div');
  el.className = `toast t${type}`;
  el.textContent = (type === 'ok' ? '✅' : '❌') + ' ' + msg;
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
