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
  clientes: {
    getAll:    ()           => get('/clientes'),
    create:    (data)       => post('/clientes', data),
    update:    (id, data)   => put(`/clientes/${id}`, data),
    delete:    (id)         => del(`/clientes/${id}`),
  },
  pedidos: {
    getAll:    ()           => get('/pedidos'),
    create:    (data)       => post('/pedidos', data),
    update:    (id, data)   => put(`/pedidos/${id}`, data),
    delete:    (id)         => del(`/pedidos/${id}`),
  },
  metricas: {
    getAll:    ()           => get('/metricas'),
    create:    (data)       => post('/metricas', data),
    update:    (id, data)   => put(`/metricas/${id}`, data),
  },
  almacenamiento: {
    getAll:    ()           => get('/almacenamiento'),
    create:    (data)       => post('/almacenamiento', data),
    update:    (id, data)   => put(`/almacenamiento/${id}`, data),
    delete:    (id)         => del(`/almacenamiento/${id}`),
  },
  ai: {
    feedback:  (data)       => post('/ai/feedback', data),
  },
  calendar: {
    sync:      (pedidoId)   => post(`/calendar/sync/${pedidoId}`),
  },
};
