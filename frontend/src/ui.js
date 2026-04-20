import { ic, refreshIcons } from './icons.js';

// Toast dedup cache (prevents spamming identical messages)
const _toastSeen = new Map();

export function toast(msg, type = 'ok', opts = {}) {
  // Dedup: same msg within 1500ms ignored unless it carries an action
  const key = `${type}:${msg}`;
  const now = Date.now();
  if (!opts.action && _toastSeen.get(key) > now - 1500) return null;
  _toastSeen.set(key, now);

  const el = document.createElement('div');
  const cls = { ok: 'tok', error: 'ter', warn: 'twa', info: 'tin' }[type] || 'tok';
  el.className = `toast ${cls}`;
  const iconName = { ok: 'check-circle', error: 'x-circle', warn: 'alert-triangle', info: 'info' }[type] || 'check-circle';

  let actionHtml = '';
  if (opts.action?.label) {
    actionHtml = `<button type="button" class="toast-undo" data-toast-action>${opts.action.label}</button>`;
  }

  el.innerHTML = `<span style="display:flex;align-items:center;gap:7px;flex:1">
    <i data-lucide="${iconName}" style="width:14px;height:14px;flex-shrink:0"></i>${msg}
  </span>${actionHtml}`;

  document.getElementById('toasts')?.appendChild(el);
  if (window.lucide) try { window.lucide.createIcons({ nodes: el.querySelectorAll('[data-lucide]') }); } catch (_) {}

  if (opts.action?.onClick) {
    const btn = el.querySelector('[data-toast-action]');
    btn?.addEventListener('click', () => {
      try { opts.action.onClick(); } finally { el.remove(); }
    });
  }

  const ttl = opts.duration ?? (opts.action ? 6000 : 3500);
  const timer = setTimeout(() => el.remove(), ttl);
  el.addEventListener('click', e => {
    if (e.target.closest('[data-toast-action]')) return;
    clearTimeout(timer);
    el.remove();
  });
  return el;
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

// ── Overlay open/close with focus management ─────────────────────────────────
const _focusBeforeOpen = new WeakMap();
const _trapCleanups = new WeakMap();

export function openOv(id) {
  const el = document.getElementById(id);
  if (!el) return;
  _focusBeforeOpen.set(el, document.activeElement);
  el.classList.add('open');
  el.setAttribute('aria-hidden', 'false');
  _trapCleanups.set(el, trapFocus(el));
  // Focus first focusable element (skip close buttons so user sees content first)
  queueMicrotask(() => {
    const focusable = _focusables(el);
    const firstReal = focusable.find(f => !f.classList?.contains('mc')) || focusable[0];
    firstReal?.focus();
  });
}

export function closeOv(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('open');
  el.setAttribute('aria-hidden', 'true');
  const cleanup = _trapCleanups.get(el);
  if (cleanup) { cleanup(); _trapCleanups.delete(el); }
  const prev = _focusBeforeOpen.get(el);
  if (prev && typeof prev.focus === 'function') {
    try { prev.focus(); } catch (_) {}
  }
  _focusBeforeOpen.delete(el);
}

function _focusables(root) {
  return [...root.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )].filter(el => el.offsetParent !== null);
}

export function trapFocus(overlay) {
  const onKey = e => {
    if (e.key !== 'Tab') return;
    const items = _focusables(overlay);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  overlay.addEventListener('keydown', onKey);
  return () => overlay.removeEventListener('keydown', onKey);
}

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
  document.querySelectorAll('.ov').forEach(o => {
    o.setAttribute('role', 'dialog');
    o.setAttribute('aria-modal', 'true');
    o.setAttribute('aria-hidden', 'true');
    o.addEventListener('click', e => { if (e.target === o) closeOv(o.id); });
  });

  // Global Esc → close topmost open overlay
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const openOvs = [...document.querySelectorAll('.ov.open')];
    if (!openOvs.length) return;
    closeOv(openOvs[openOvs.length - 1].id);
    e.stopPropagation();
  });
}

// ── confirmDialog — promise-based replacement for native confirm() ───────────
export function confirmDialog(message, opts = {}) {
  const {
    title = '¿Estás seguro?',
    confirmLabel = 'Confirmar',
    cancelLabel = 'Cancelar',
    variant = 'danger',   // 'danger' | 'warn' | 'info'
  } = opts;

  return new Promise(resolve => {
    const prev = document.activeElement;
    const overlay = document.createElement('div');
    overlay.className = 'cd-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'cd-title');

    const iconClass = variant === 'warn' ? 'warn' : variant === 'info' ? 'info' : '';
    const iconName = variant === 'warn' ? 'alert-triangle' : variant === 'info' ? 'info' : 'alert-octagon';
    const confirmBtnClass = variant === 'info' ? 'bp' : variant === 'warn' ? 'bw' : 'bd';

    overlay.innerHTML = `
      <div class="cd-box">
        <div class="cd-icon ${iconClass}">${ic(iconName, { size: 22 })}</div>
        <div class="cd-title" id="cd-title">${_escHtml(title)}</div>
        <div class="cd-msg">${_escHtml(message)}</div>
        <div class="cd-actions">
          <button type="button" class="btn bg" data-cd-cancel>${_escHtml(cancelLabel)}</button>
          <button type="button" class="btn ${confirmBtnClass}" data-cd-confirm>${_escHtml(confirmLabel)}</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);
    refreshIcons(overlay);

    const cleanup = trapFocus(overlay);
    const close = result => {
      cleanup();
      overlay.remove();
      if (prev?.focus) try { prev.focus(); } catch (_) {}
      resolve(result);
    };

    overlay.querySelector('[data-cd-confirm]').addEventListener('click', () => close(true));
    overlay.querySelector('[data-cd-cancel]').addEventListener('click', () => close(false));
    overlay.addEventListener('click', e => { if (e.target === overlay) close(false); });
    overlay.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.stopPropagation(); close(false); }
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        close(true);
      }
    });

    queueMicrotask(() => overlay.querySelector('[data-cd-confirm]')?.focus());
  });
}

// ── withSubmitLock — disable button + show spinner during async op ───────────
export async function withSubmitLock(btn, fn) {
  if (!btn) return fn();
  if (btn.disabled) return;
  const originalHtml = btn.innerHTML;
  const originalWidth = btn.offsetWidth;
  btn.disabled = true;
  btn.style.minWidth = originalWidth + 'px';
  btn.innerHTML = '<span class="sp" aria-hidden="true"></span>';
  try {
    return await fn();
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
    btn.style.minWidth = '';
    if (window.lucide) try { window.lucide.createIcons({ nodes: btn.querySelectorAll('[data-lucide]') }); } catch (_) {}
  }
}

function _escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── promptDialog — promise-based replacement for native prompt() ─────────────
export function promptDialog(message, opts = {}) {
  const {
    title = 'Ingresa un valor',
    placeholder = '',
    defaultValue = '',
    confirmLabel = 'Aceptar',
    cancelLabel = 'Cancelar',
    multiline = false,
    required = false,
  } = opts;

  return new Promise(resolve => {
    const prev = document.activeElement;
    const overlay = document.createElement('div');
    overlay.className = 'cd-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    const inputHtml = multiline
      ? `<textarea class="cd-input" rows="3" placeholder="${_escHtml(placeholder)}">${_escHtml(defaultValue)}</textarea>`
      : `<input type="text" class="cd-input" placeholder="${_escHtml(placeholder)}" value="${_escHtml(defaultValue)}"/>`;

    overlay.innerHTML = `
      <div class="cd-box">
        <div class="cd-icon info">${ic('edit-3', { size: 22 })}</div>
        <div class="cd-title">${_escHtml(title)}</div>
        <div class="cd-msg">${_escHtml(message)}</div>
        <div style="margin-bottom:16px">${inputHtml}</div>
        <div class="cd-actions">
          <button type="button" class="btn bg" data-cd-cancel>${_escHtml(cancelLabel)}</button>
          <button type="button" class="btn bp" data-cd-confirm>${_escHtml(confirmLabel)}</button>
        </div>
      </div>`;

    // Inject minimal styles if not present
    const style = overlay.querySelector('.cd-input');
    Object.assign(style.style, {
      width: '100%',
      padding: '10px 12px',
      border: '1px solid var(--bo)',
      borderRadius: '8px',
      fontFamily: 'inherit',
      fontSize: '13px',
      background: 'var(--surface)',
      color: 'var(--text)',
      outline: 'none',
    });

    document.body.appendChild(overlay);
    refreshIcons(overlay);

    const cleanup = trapFocus(overlay);
    const input = overlay.querySelector('.cd-input');

    const close = (value) => {
      cleanup();
      overlay.remove();
      if (prev?.focus) try { prev.focus(); } catch (_) {}
      resolve(value);
    };

    overlay.querySelector('[data-cd-confirm]').addEventListener('click', () => {
      const v = input.value;
      if (required && !v.trim()) { input.focus(); return; }
      close(v);
    });
    overlay.querySelector('[data-cd-cancel]').addEventListener('click', () => close(null));
    overlay.addEventListener('click', e => { if (e.target === overlay) close(null); });
    overlay.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.stopPropagation(); close(null); }
      if (e.key === 'Enter' && !multiline) {
        e.preventDefault();
        const v = input.value;
        if (required && !v.trim()) return;
        close(v);
      }
    });

    queueMicrotask(() => input?.focus());
  });
}
