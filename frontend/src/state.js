// Nueva arquitectura de estado
export const state = {
  // Maestros
  clientes: [],
  clienteDirecciones: [],    // Múltiples direcciones por cliente
  catalogo: [],               // Catálogo de items
  tecnicos: [],
  metodoPago: [],
  estadosPedido: [],

  // Operación
  pedidos: [],                // Cabeceras de pedidos
  pedidoDetalle: [],          // Líneas de detalle
  servicios: [],              // Ejecución en campo
  pagos: [],                  // Registro de pagos

  // Inventario
  inventarioExistencias: [],  // Stock actual
  inventarioMovimientos: [],  // Historial de movimientos
  ubicacionesInventario: [],

  // Histórico
  clienteInteracciones: [],
};

// ============= CLIENTES =============
export function cFromDb(r) {
  return {
    id: r.id,
    nombre: r.nombre,
    telefono: r.telefono,
    telefonoAlt: r.telefono_alt,
    email: r.email,
    notasCliente: r.notas_cliente,
    direcciones: (r.cliente_direcciones || []).map(dirFromDb),
    createdAt: r.created_at,
  };
}

export function cToDb(c) {
  return {
    nombre: c.nombre,
    telefono: c.telefono,
    telefono_alt: c.telefonoAlt || null,
    email: c.email || null,
    notas_cliente: c.notasCliente || null,
  };
}

export function dirFromDb(r) {
  return {
    id: r.id,
    clienteId: r.cliente_id,
    alias: r.alias || 'Principal',
    contactoRecibe: r.contacto_recibe,
    telefonoContacto: r.telefono_contacto,
    calle: r.calle,
    numeroExt: r.numero_ext,
    numeroInt: r.numero_int,
    colonia: r.colonia,
    municipio: r.municipio || 'Desconocido',
    estadoMx: r.estado_mx || 'Nuevo León',
    codigoPostal: r.codigo_postal,
    referencias: r.referencias,
    googleMapsUrl: r.google_maps_url,
    lat: r.lat,
    lng: r.lng,
    esPrincipal: r.es_principal,
  };
}

export function dirToDb(d) {
  return {
    alias: d.alias || 'Principal',
    contacto_recibe: d.contactoRecibe || null,
    telefono_contacto: d.telefonoContacto || null,
    calle: d.calle || null,
    numero_ext: d.numeroExt || null,
    numero_int: d.numeroInt || null,
    colonia: d.colonia || null,
    municipio: d.municipio || 'Desconocido',
    estado_mx: d.estadoMx || 'Nuevo León',
    codigo_postal: d.codigoPostal || null,
    referencias: d.referencias || null,
    google_maps_url: d.googleMapsUrl || null,
    lat: d.lat || null,
    lng: d.lng || null,
    es_principal: d.esPrincipal || false,
  };
}

// ============= PEDIDOS =============
export function pFromDb(r) {
  return {
    id: r.id,
    folio: r.folio,
    clienteId: r.cliente_id,
    direccionServicioId: r.direccion_servicio_id,
    fechaPedido: r.fecha_pedido,
    fechaServicio: r.fecha_servicio,
    estadoId: r.estado_id,
    metodopagoId: r.metodo_pago_id,
    subtotal: parseFloat(r.subtotal || 0),
    descuento: parseFloat(r.descuento || 0),
    cargoExtra: parseFloat(r.cargo_extra || 0),
    total: parseFloat(r.total || 0),
    anticipo: parseFloat(r.anticipo || 0),
    saldo: parseFloat(r.saldo || 0),
    requiereFactura: r.requiere_factura,
    notasComerciales: r.notas_comerciales,
    notasOperativas: r.notas_operativas,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function pToDb(p) {
  return {
    cliente_id: p.clienteId,
    direccion_servicio_id: p.direccionServicioId || null,
    fecha_pedido: p.fechaPedido,
    fecha_servicio: p.fechaServicio || null,
    estado_id: p.estadoId,
    metodo_pago_id: p.metodopagoId || null,
    descuento: p.descuento || 0,
    cargo_extra: p.cargoExtra || 0,
    anticipo: p.anticipo || 0,
    requiere_factura: p.requiereFactura || false,
    notas_comerciales: p.notasComerciales || null,
    notas_operativas: p.notasOperativas || null,
  };
}

// ============= PEDIDO DETALLE =============
export function pdFromDb(r) {
  return {
    id: r.id,
    pedidoId: r.pedido_id,
    itemCatalogoId: r.item_catalogo_id,
    tipoLinea: r.tipo_linea,
    descripcion: r.descripcion,
    cantidad: parseFloat(r.cantidad || 1),
    unidadMedida: r.unidad_medida,
    precioUnitario: parseFloat(r.precio_unitario || 0),
    costoUnitario: parseFloat(r.costo_unitario || 0),
    subtotal: parseFloat(r.subtotal || 0),
    // Abanicos
    modeloAbanico: r.modelo_abanico,
    desinstalarCantidad: r.desinstalar_cantidad,
    perforacionCantidad: r.perforacion_cantidad,
    // Persianas
    anchoM: r.ancho_m,
    altoM: r.alto_m,
    areaM2: parseFloat(r.area_m2 || 0),
    telaColor: r.tela_color,
    sistemaInstalacion: r.sistema_instalacion,
    habitacion: r.habitacion,
    // Control
    requiereInventario: r.requiere_inventario,
    requiereServicio: r.requiere_servicio,
    notas: r.notas,
  };
}

export function pdToDb(pd) {
  return {
    item_catalogo_id: pd.itemCatalogoId || null,
    tipo_linea: pd.tipoLinea || 'item',
    descripcion: pd.descripcion,
    cantidad: pd.cantidad || 1,
    unidad_medida: pd.unidadMedida || 'pieza',
    precio_unitario: pd.precioUnitario || 0,
    costo_unitario: pd.costoUnitario || 0,
    modelo_abanico: pd.modeloAbanico || null,
    desinstalar_cantidad: pd.desinstalarCantidad || null,
    perforacion_cantidad: pd.perforacionCantidad || null,
    ancho_m: pd.anchoM || null,
    alto_m: pd.altoM || null,
    tela_color: pd.telaColor || null,
    sistema_instalacion: pd.sistemaInstalacion || null,
    habitacion: pd.habitacion || null,
    requiere_inventario: pd.requiereInventario || false,
    requiere_servicio: pd.requiereServicio || true,
    notas: pd.notas || null,
  };
}

// ============= CATÁLOGO =============
export function itemFromDb(r) {
  return {
    id: r.id,
    sku: r.sku,
    nombre: r.nombre,
    categoriaId: r.categoria_id,
    tipoPersianaId: r.tipo_persiana_id,
    marca: r.marca,
    modelo: r.modelo,
    color: r.color,
    unidadMedida: r.unidad_medida,
    precioBase: parseFloat(r.precio_base || 0),
    costoBase: parseFloat(r.costo_base || 0),
    controlaInventario: r.controla_inventario,
    activo: r.activo,
    notas: r.notas,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function itemToDb(i) {
  return {
    sku: i.sku || null,
    nombre: i.nombre,
    categoria_id: i.categoriaId,
    tipo_persiana_id: i.tipoPersianaId || null,
    marca: i.marca || null,
    modelo: i.modelo || null,
    color: i.color || null,
    unidad_medida: i.unidadMedida || 'pieza',
    precio_base: i.precioBase || 0,
    costo_base: i.costoBase || 0,
    controla_inventario: i.controlaInventario || false,
    activo: i.activo !== false,
    notas: i.notas || null,
  };
}

// ============= SERVICIOS =============
export function servFromDb(r) {
  return {
    id: r.id,
    pedidoId: r.pedido_id,
    pedidoDetalleId: r.pedido_detalle_id,
    tipoServicio: r.tipo_servicio,
    fechaServicio: r.fecha_servicio,
    horaProgramada: r.hora_programada,
    horaLlegada: r.hora_llegada,
    horaInicio: r.hora_inicio,
    horaFin: r.hora_fin,
    tecnicoId: r.tecnico_id,
    tecnicoApoyoId: r.tecnico_apoyo_id,
    rutaNum: r.ruta_num,
    estado: r.estado,
    motivoCancelacion: r.motivo_cancelacion,
    motivoRetraso: r.motivo_retraso,
    evidenciaUrl: r.evidencia_url,
    observaciones: r.observaciones,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ============= ALMACENAMIENTO (legacy) =============
export function aFromDb(r) {
  return {
    id: r.id,
    modelo: r.modelo,
    categoria: r.categoria,
    lugar: r.lugar,
    cantidad: r.cantidad,
    precio: r.precio,
    notas: r.notas,
    updatedAt: r.updated_at || r.updatedAt,
  };
}

// ============= SERVICIOS METRICAS (legacy) =============
export function smFromDb(r) {
  return {
    id: r.id,
    pedido_id: r.pedido_id,
    tecnico: r.tecnico,
    hora_programada: r.hora_programada,
    zona: r.zona,
    orden_ruta: r.orden_ruta,
    estado: r.estado,
    dia_semana: r.dia_semana,
  };
}

// ============= INVENTARIO =============
export function invExistFromDb(r) {
  return {
    id: r.id,
    itemCatalogoId: r.item_catalogo_id,
    ubicacionId: r.ubicacion_id,
    cantidad: parseFloat(r.cantidad || 0),
    costoPromedio: parseFloat(r.costo_promedio || 0),
    updatedAt: r.updated_at,
  };
}

export function invMovFromDb(r) {
  return {
    id: r.id,
    itemCatalogoId: r.item_catalogo_id,
    ubicacionOrigenId: r.ubicacion_origen_id,
    ubicacionDestinoId: r.ubicacion_destino_id,
    tipoMovimiento: r.tipo_movimiento,
    cantidad: parseFloat(r.cantidad || 0),
    costoUnitario: parseFloat(r.costo_unitario || 0),
    pedidoId: r.pedido_id,
    servicioId: r.servicio_id,
    referencia: r.referencia,
    notas: r.notas,
    createdAt: r.created_at,
  };
}
