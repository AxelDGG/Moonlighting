export const state = {
  clientes: [],
  pedidos: [],
  servicios_metricas: [],
};

// DB row → frontend object mappers
export function cFromDb(r) {
  return { id: r.id, nombre: r.nombre, numero: r.numero, direccion: r.direccion, municipio: r.municipio || 'Desconocido', lat: r.lat, lng: r.lng, metodoPago: r.metodo_pago || 'Efectivo', numPedido: r.num_pedido || '' };
}
export function cToDb(c) {
  return { nombre: c.nombre, numero: c.numero, direccion: c.direccion, municipio: c.municipio, lat: c.lat, lng: c.lng, metodo_pago: c.metodoPago, num_pedido: c.numPedido || null };
}
export function pFromDb(r) {
  return { id: r.id, clienteId: r.cliente_id, tipoServicio: r.tipo_servicio, fecha: r.fecha, cantidad: r.cantidad, total: parseFloat(r.total || 0), detalles: r.detalles || {} };
}
export function pToDb(p) {
  return { cliente_id: p.clienteId || null, tipo_servicio: p.tipoServicio, fecha: p.fecha, cantidad: p.cantidad, total: p.total, detalles: p.detalles };
}
export function smFromDb(r) {
  return { id: r.id, pedido_id: r.pedido_id, tecnico: r.tecnico || '', hora_programada: r.hora_programada, hora_llegada: r.hora_llegada, hora_inicio: r.hora_inicio, hora_fin: r.hora_fin, zona: r.zona || '', orden_ruta: r.orden_ruta, estado: r.estado || 'programado', retraso_min: r.retraso_min, motivo_retraso: r.motivo_retraso || '', motivo_cancelacion: r.motivo_cancelacion || '', dia_semana: r.dia_semana || '', es_fecha_especial: r.es_fecha_especial || false, nota_fecha_especial: r.nota_fecha_especial || '', created_at: r.created_at };
}
