// SVG icon helper — inline, no external deps
const _ic = (d) => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

export const MUNIS = {
  'Monterrey':               { color: '#3b82f6', center: [25.6694, -100.3097], radius: 7500 },
  'San Pedro Garza García':  { color: '#22c55e', center: [25.6519, -100.4042], radius: 4500 },
  'Guadalupe':               { color: '#ef4444', center: [25.6800, -100.2540], radius: 5000 },
  'San Nicolás de los Garza':{ color: '#a855f7', center: [25.7395, -100.3063], radius: 4500 },
  'Apodaca':                 { color: '#f59e0b', center: [25.7735, -100.1949], radius: 5500 },
  'General Escobedo':        { color: '#06b6d4', center: [25.7955, -100.3292], radius: 5500 },
  'Santa Catarina':          { color: '#ec4899', center: [25.6733, -100.4602], radius: 6000 },
  'García':                  { color: '#84cc16', center: [25.7972, -100.5877], radius: 8000 },
};

export const PAGO_CLS = { Efectivo: 'pef', Tarjeta: 'pta', Transferencia: 'ptr', Credito: 'pcr' };

// SVG icons for payment method pills
export const PAGO_IC = {
  Efectivo:     _ic(`<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 12h.01M18 12h.01"/>`),
  Tarjeta:      _ic(`<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>`),
  Transferencia:_ic(`<line x1="3" y1="22" x2="21" y2="22"/><line x1="6" y1="18" x2="6" y2="11"/><line x1="10" y1="18" x2="10" y2="11"/><line x1="14" y1="18" x2="14" y2="11"/><line x1="18" y1="18" x2="18" y2="11"/><polygon points="12 2 20 7 4 7"/>`),
  Credito:      _ic(`<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>`),
};

// SVG icons for service type pills
export const TIPO_IC = {
  Abanico:      _ic(`<path d="M12 12c0-2.76 2.24-5 5-5 1.38 0 2 1.62 1 2.5L12 12"/><path d="M12 12c-2.76 0-5-2.24-5-5 0-1.38 1.62-2 2.5-1L12 12"/><path d="M12 12c0 2.76-2.24 5-5 5-1.38 0-2-1.62-1-2.5L12 12"/><path d="M12 12c2.76 0 5 2.24 5 5 0 1.38-1.62 2-2.5 1L12 12"/><circle cx="12" cy="12" r="2"/>`),
  Persiana:     _ic(`<rect x="3" y="3" width="18" height="3.5" rx="1"/><rect x="3" y="9" width="18" height="3.5" rx="1"/><rect x="3" y="15" width="18" height="3.5" rx="1"/><line x1="9" y1="18.5" x2="9" y2="22"/><line x1="15" y1="18.5" x2="15" y2="22"/>`),
  Levantamiento:_ic(`<path d="M3 5h18v5H3z"/><line x1="7" y1="5" x2="7" y2="8"/><line x1="11" y1="5" x2="11" y2="7"/><line x1="15" y1="5" x2="15" y2="8"/><line x1="19" y1="5" x2="19" y2="7"/>`),
  Limpieza:     _ic(`<path d="M3 21l3.5-3.5"/><path d="M16 3.5l4.5 4.5L11.5 18.5 7 14z"/>`),
  Mantenimiento:_ic(`<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>`),
};

export const TIPO_BG = { Abanico: '#dbeafe', Persiana: '#dcfce7', Levantamiento: '#f3e8ff', Limpieza: '#fef3c7', Mantenimiento: '#ffedd5' };
export const TIPO_CO = { Abanico: '#1e40af', Persiana: '#166534', Levantamiento: '#581c87', Limpieza: '#92400e', Mantenimiento: '#c2410c' };

export const STATUS_LABELS = { programado: 'Programado', en_curso: 'En curso', completado: 'Completado', cancelado: 'Cancelado', atrasado: 'Atrasado' };
export const STATUS_COLORS = { programado: '#f59e0b', en_curso: '#3b82f6', completado: '#22c55e', cancelado: '#94a3b8', atrasado: '#ef4444' };
export const STATUS_BG     = { programado: '#fef3c7', en_curso: '#dbeafe', completado: '#dcfce7', cancelado: '#f1f5f9', atrasado: '#fee2e2' };

export const TECHNICIANS = ['Carlos R.', 'Miguel A.', 'José L.'];
