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

const get  = (path)        => request('GET',    path);
const post = (path, body)  => request('POST',   path, body);
const put  = (path, body)  => request('PUT',    path, body);
const del  = (path)        => request('DELETE', path);

export const api = {
  // ========== CLIENTES ==========
  clientes: {
    getAll:           ()           => get('/clientes'),
    getById:          (id)         => get(`/clientes/${id}`),
    create:           (data)       => post('/clientes', data),
    update:           (id, data)   => put(`/clientes/${id}`, data),
    delete:           (id)         => del(`/clientes/${id}`),
    direcciones:      (id)         => get(`/clientes/${id}/direcciones`),
    addDireccion:     (id, dir)    => post(`/clientes/${id}/direcciones`, dir),
  },

  // ========== PEDIDOS ==========
  pedidos: {
    getAll:           ()           => get('/pedidos'),
    getById:          (id)         => get(`/pedidos/${id}`),
    create:           (data)       => post('/pedidos', data),
    update:           (id, data)   => put(`/pedidos/${id}`, data),
    delete:           (id)         => del(`/pedidos/${id}`),
    detalle:          (id)         => get(`/pedidos/${id}/detalle`),
    addDetalle:       (id, det)    => post(`/pedidos/${id}/detalle`, det),
    updateDetalle:    (id, det)    => put(`/pedidos/detalle/${id}`, det),
    deleteDetalle:    (id)         => del(`/pedidos/detalle/${id}`),
  },

  // ========== SERVICIOS ==========
  servicios: {
    getAll:           ()           => get('/servicios'),
    getById:          (id)         => get(`/servicios/${id}`),
    create:           (data)       => post('/servicios', data),
    update:           (id, data)   => put(`/servicios/${id}`, data),
    delete:           (id)         => del(`/servicios/${id}`),
    porFecha:         (fecha)      => get(`/servicios/fecha/${fecha}`),
    porTecnico:       (tecId)      => get(`/servicios/tecnico/${tecId}`),
  },

  // ========== PAGOS ==========
  pagos: {
    porPedido:        (pedId)      => get(`/pagos/pedido/${pedId}`),
    getAll:           ()           => get('/pagos'),
    create:           (data)       => post('/pagos', data),
    update:           (id, data)   => put(`/pagos/${id}`, data),
    delete:           (id)         => del(`/pagos/${id}`),
  },

  // ========== CATÁLOGO ==========
  catalogo: {
    getAll:           ()           => get('/catalogo'),
    getById:          (id)         => get(`/catalogo/${id}`),
    create:           (data)       => post('/catalogo', data),
    update:           (id, data)   => put(`/catalogo/${id}`, data),
    delete:           (id)         => del(`/catalogo/${id}`),
    porCategoria:     (catId)      => get(`/catalogo/categoria/${catId}`),
    buscar:           (query)      => get(`/catalogo/buscar/${query}`),
  },

  // ========== TÉCNICOS ==========
  tecnicos: {
    getAll:           ()           => get('/tecnicos'),
    getById:          (id)         => get(`/tecnicos/${id}`),
    create:           (data)       => post('/tecnicos', data),
    update:           (id, data)   => put(`/tecnicos/${id}`, data),
    delete:           (id)         => del(`/tecnicos/${id}`),
    disponibles:      (fecha)      => get(`/tecnicos/disponibles/${fecha}`),
    carga:            (fecha)      => get(`/tecnicos/carga/${fecha}`),
  },

  // ========== INVENTARIO ==========
  inventario: {
    existencias:      ()           => get('/inventario/existencias'),
    existenciasPorUbicacion: (ubId) => get(`/inventario/existencias/${ubId}`),
    upsertExistencia: (data)       => post('/inventario/existencias', data),
    movimientos:      ()           => get('/inventario/movimientos'),
    crearMovimiento:  (data)       => post('/inventario/movimientos', data),
    ubicaciones:      ()           => get('/inventario/ubicaciones'),
    crearUbicacion:   (data)       => post('/inventario/ubicaciones', data),
  },

  // ========== HEREDADO (compatible) ==========
  almacenamiento: {
    getAll:    ()           => get('/inventario/existencias'),
    create:    (data)       => post('/inventario/existencias', data),
    update:    (id, data)   => put(`/inventario/existencias/${id}`, data),
  },

  metricas: {
    getAll:    ()           => get('/metricas'),
    create:    (data)       => post('/metricas', data),
    update:    (id, data)   => put(`/metricas/${id}`, data),
  },

  ai: {
    feedback:  (data)       => post('/ai/feedback', data),
  },

  calendar: {
    sync:      (pedidoId)   => post(`/calendar/sync/${pedidoId}`),
  },
};
