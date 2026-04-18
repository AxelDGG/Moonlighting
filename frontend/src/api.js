import { getToken } from './auth.js';

async function request(method, path, body = null) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Error del servidor');
  }

  return res.status === 204 ? null : res.json();
}

const get  = (path)       => request('GET',    path);
const post = (path, body) => request('POST',   path, body);
const put  = (path, body) => request('PUT',    path, body);
const del  = (path)       => request('DELETE', path);

export const api = {
  // ========== CLIENTES ==========
  clientes: {
    getAll:       ()         => get('/clientes'),
    getById:      (id)       => get(`/clientes/${id}`),
    create:       (data)     => post('/clientes', data),
    update:       (id, data) => put(`/clientes/${id}`, data),
    delete:       (id)       => del(`/clientes/${id}`),
    direcciones:  (id)       => get(`/clientes/${id}/direcciones`),
    addDireccion: (id, dir)  => post(`/clientes/${id}/direcciones`, dir),
  },

  // ========== PEDIDOS ==========
  pedidos: {
    getAll:        ()         => get('/pedidos'),
    getById:       (id)       => get(`/pedidos/${id}`),
    create:        (data)     => post('/pedidos', data),
    update:        (id, data) => put(`/pedidos/${id}`, data),
    delete:        (id)       => del(`/pedidos/${id}`),
    detalle:       (id)       => get(`/pedidos/${id}/detalle`),
    addDetalle:    (id, det)  => post(`/pedidos/${id}/detalle`, det),
    updateDetalle: (id, det)  => put(`/pedidos/detalle/${id}`, det),
    deleteDetalle: (id)       => del(`/pedidos/detalle/${id}`),
  },

  // ========== SERVICIOS ==========
  servicios: {
    getAll:     ()         => get('/servicios'),
    getById:    (id)       => get(`/servicios/${id}`),
    create:     (data)     => post('/servicios', data),
    update:     (id, data) => put(`/servicios/${id}`, data),
    delete:     (id)       => del(`/servicios/${id}`),
    porFecha:   (fecha)    => get(`/servicios/fecha/${fecha}`),
    porTecnico: (tecId)    => get(`/servicios/tecnico/${tecId}`),
  },

  // ========== PAGOS ==========
  pagos: {
    porPedido: (pedId)    => get(`/pagos/pedido/${pedId}`),
    getAll:    ()         => get('/pagos'),
    create:    (data)     => post('/pagos', data),
    update:    (id, data) => put(`/pagos/${id}`, data),
    delete:    (id)       => del(`/pagos/${id}`),
  },

  // ========== CATÁLOGO ==========
  catalogo: {
    getAll:       ()       => get('/catalogo'),
    getById:      (id)     => get(`/catalogo/${id}`),
    create:       (data)   => post('/catalogo', data),
    update:       (id, d)  => put(`/catalogo/${id}`, d),
    delete:       (id)     => del(`/catalogo/${id}`),
    porCategoria: (catId)  => get(`/catalogo/categoria/${catId}`),
    buscar:       (query)  => get(`/catalogo/buscar/${query}`),
  },

  // ========== TÉCNICOS ==========
  tecnicos: {
    getAll:       ()        => get('/tecnicos'),
    getById:      (id)      => get(`/tecnicos/${id}`),
    create:       (data)    => post('/tecnicos', data),
    update:       (id, d)   => put(`/tecnicos/${id}`, d),
    delete:       (id)      => del(`/tecnicos/${id}`),
    disponibles:  (fecha)   => get(`/tecnicos/disponibles/${fecha}`),
    carga:        (fecha)   => get(`/tecnicos/carga/${fecha}`),
  },

  // ========== ALMACENAMIENTO (legacy) ==========
  almacenamiento: {
    getAll: ()         => get('/almacenamiento'),
    create: (data)     => post('/almacenamiento', data),
    update: (id, data) => put(`/almacenamiento/${id}`, data),
    delete: (id)       => del(`/almacenamiento/${id}`),
  },

  // ========== MÉTRICAS (legacy) ==========
  metricas: {
    getAll: ()         => get('/metricas'),
    create: (data)     => post('/metricas', data),
    update: (id, data) => put(`/metricas/${id}`, data),
  },

  // ========== INVENTARIO (nuevo) ==========
  inventario: {
    existencias:            ()       => get('/inventario/existencias'),
    existenciasPorUbicacion: (ubId)  => get(`/inventario/existencias/${ubId}`),
    upsertExistencia:       (data)   => post('/inventario/existencias', data),
    movimientos:            ()       => get('/inventario/movimientos'),
    crearMovimiento:        (data)   => post('/inventario/movimientos', data),
    ubicaciones:            ()       => get('/inventario/ubicaciones'),
    crearUbicacion:         (data)   => post('/inventario/ubicaciones', data),
  },

  // ========== AI ==========
  ai: {
    feedback: (data)     => post('/ai/feedback', data),
    chat:     (messages) => post('/ai/chat', { messages }),
  },

  // ========== CALENDARIO ==========
  calendar: {
    sync: (pedidoId) => post(`/calendar/sync/${pedidoId}`),
  },

  // ========== ROUTE CONFIGS ==========
  routeConfigs: {
    getAll:      (tecnicoId) => get(`/route-configs${tecnicoId ? `?tecnico_id=${tecnicoId}` : ''}`),
    create:      (data)      => post('/route-configs', data),
    update:      (id, data)  => put(`/route-configs/${id}`, data),
    delete:      (id)        => del(`/route-configs/${id}`),
  },

  // ========== USER PROFILES ==========
  userProfiles: {
    me:       ()          => get('/user-profiles/me'),
    getAll:   ()          => get('/user-profiles'),
    create:   (data)      => post('/user-profiles', data),
    update:   (id, data)  => put(`/user-profiles/${id}`, data),
  },

  // ========== CLIENTES (con inactivos) ==========
  clientesAll: {
    getAll: () => get('/clientes?include_inactive=true'),
  },

  // ========== VEHÍCULOS ==========
  vehiculos: {
    getAll:  ()       => get('/vehiculos'),
    create:  (data)   => post('/vehiculos', data),
    delete:  (id)     => del(`/vehiculos/${id}`),
  },

  // ========== GEOCODE ==========
  geocode: {
    search:       (body)   => post('/geocode/search', body),
    reverse:      (lat, lng) => post('/geocode/reverse', { lat, lng }),
    resolveShort: (url)    => post('/geocode/resolve-short', { url }),
  },
};
