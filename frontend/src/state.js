// Estado global de la aplicación
export const state = {
  // Usuario
  userProfile: null, // { id, email, role: 'admin'|'gestor', permissions: {} }

  // Maestros
  clientes: [],
  catalogo: [],
  tecnicos: [],
  metodoPago: [],
  estadosPedido: [],

  // Operación
  pedidos: [],
  pedidoDetalle: [],
  servicios: [],
  pagos: [],

  // Inventario nuevo
  inventarioExistencias: [],
  inventarioMovimientos: [],
  ubicacionesInventario: [],

  // Rutas
  routeConfigs: [],

  // Legacy (compatibilidad)
  servicios_metricas: [],
  almacenamiento: [],
};

// Helpers de permisos
export function isAdmin() {
  return state.userProfile?.role === 'admin';
}
export function canDo(permission) {
  if (isAdmin()) return true;
  return state.userProfile?.permissions?.[permission] !== false;
}

// ============= CLIENTES =============
// Acepta tanto el esquema legacy (numero, direccion, metodo_pago, num_pedido)
// como el esquema nuevo (telefono, telefono_alt, email, notas_cliente)
export function cFromDb(r) {
  return {
    id:          r.id,
    nombre:      r.nombre,
    activo:      r.activo !== false, // soft-delete flag
    // campos legacy — siguen en la tabla
    numero:      r.numero       || r.telefono || '',
    direccion:   r.direccion    || '',
    municipio:   r.municipio    || 'Desconocido',
    lat:         r.lat          || null,
    lng:         r.lng          || null,
    metodoPago:  r.metodo_pago  || 'Efectivo',
    numPedido:   r.num_pedido   || null,
    // campos nuevos
    telefono:    r.telefono     || r.numero   || '',
    telefonoAlt: r.telefono_alt || null,
    email:       r.email        || null,
    notasCliente: r.notas_cliente || null,
    // relaciones
    direcciones: (r.cliente_direcciones || []).map(dirFromDb),
    createdAt:   r.created_at,
  };
}

export function cToDb(c) {
  return {
    nombre:       c.nombre,
    // legacy
    numero:       c.numero      || c.telefono  || null,
    direccion:    c.direccion    || null,
    municipio:    c.municipio    || 'Desconocido',
    lat:          c.lat          || null,
    lng:          c.lng          || null,
    metodo_pago:  c.metodoPago   || 'Efectivo',
    num_pedido:   c.numPedido    || null,
    // nuevo
    telefono:     c.telefono     || c.numero    || null,
    telefono_alt: c.telefonoAlt  || null,
    email:        c.email        || null,
    notas_cliente: c.notasCliente || null,
  };
}

export function dirFromDb(r) {
  return {
    id:               r.id,
    clienteId:        r.cliente_id,
    alias:            r.alias || 'Principal',
    contactoRecibe:   r.contacto_recibe,
    telefonoContacto: r.telefono_contacto,
    calle:            r.calle,
    numeroExt:        r.numero_ext,
    numeroInt:        r.numero_int,
    colonia:          r.colonia,
    municipio:        r.municipio || 'Desconocido',
    estadoMx:         r.estado_mx || 'Nuevo León',
    codigoPostal:     r.codigo_postal,
    referencias:      r.referencias,
    googleMapsUrl:    r.google_maps_url,
    lat:              r.lat,
    lng:              r.lng,
    esPrincipal:      r.es_principal,
  };
}

export function dirToDb(d) {
  return {
    alias:             d.alias            || 'Principal',
    contacto_recibe:   d.contactoRecibe   || null,
    telefono_contacto: d.telefonoContacto || null,
    calle:             d.calle            || null,
    numero_ext:        d.numeroExt        || null,
    numero_int:        d.numeroInt        || null,
    colonia:           d.colonia          || null,
    municipio:         d.municipio        || 'Desconocido',
    estado_mx:         d.estadoMx         || 'Nuevo León',
    codigo_postal:     d.codigoPostal     || null,
    referencias:       d.referencias      || null,
    google_maps_url:   d.googleMapsUrl    || null,
    lat:               d.lat              || null,
    lng:               d.lng              || null,
    es_principal:      d.esPrincipal      || false,
  };
}

// ============= PEDIDOS =============
// Acepta filas de la vista v_pedidos_resumen (que incluye campos legacy)
// y también filas crudas de la tabla pedidos
export function pFromDb(r) {
  return {
    id:               r.id,
    folio:            r.folio,
    // IDs
    clienteId:        r.cliente_id,
    estadoId:         r.estado_id,
    metodopagoId:     r.metodo_pago_id,
    // Nombres (de la vista con JOINs)
    clienteNombre:    r.cliente_nombre   || null,
    clienteTelefono:  r.cliente_telefono || null,
    municipio:        r.municipio        || null,
    estado:           r.estado           || null,   // texto del estado (vista)
    metodoPago:       r.metodo_pago      || null,   // texto del método (vista)
    // Fechas — compatibilidad legacy + nuevo
    fecha:            r.fecha            || r.fecha_pedido || null,
    fechaPedido:      r.fecha_pedido     || r.fecha        || null,
    fechaServicio:    r.fecha_servicio   || null,
    // Campos legacy (siguen en la tabla pedidos)
    tipoServicio:     r.tipo_servicio    || null,
    cantidad:         r.cantidad         || 1,
    detalles:         r.detalles         || {},
    // Montos
    total:            parseFloat(r.total      || 0),
    subtotal:         parseFloat(r.subtotal   || 0),
    descuento:        parseFloat(r.descuento  || 0),
    cargoExtra:       parseFloat(r.cargo_extra || 0),
    anticipo:         parseFloat(r.anticipo   || 0),
    saldo:            parseFloat(r.saldo      || 0),
    // Notas
    requiereFactura:  r.requiere_factura  || false,
    notasComerciales: r.notas_comerciales || null,
    notasOperativas:  r.notas_operativas  || null,
    createdAt:        r.created_at,
    updatedAt:        r.updated_at,
  };
}

export function pToDb(p) {
  const fecha = p.fecha || p.fechaPedido || null;
  return {
    cliente_id:           p.clienteId            || null,
    // Fechas — envía ambos para compatibilidad
    fecha:                fecha,
    fecha_pedido:         fecha,
    fecha_servicio:       p.fechaServicio         || null,
    // Estado — opcional, el backend auto-asigna 'pendiente' si falta
    estado_id:            p.estadoId              || null,
    metodo_pago_id:       p.metodopagoId          || null,
    // Legacy
    tipo_servicio:        p.tipoServicio          || null,
    cantidad:             p.cantidad              || 1,
    total:                p.total                 || 0,
    detalles:             p.detalles              || null,
    // Nuevo
    descuento:            p.descuento             || 0,
    cargo_extra:          p.cargoExtra            || 0,
    anticipo:             p.anticipo              || 0,
    requiere_factura:     p.requiereFactura        || false,
    notas_comerciales:    p.notasComerciales       || null,
    notas_operativas:     p.notasOperativas        || null,
  };
}

// ============= PEDIDO DETALLE =============
export function pdFromDb(r) {
  return {
    id:                   r.id,
    pedidoId:             r.pedido_id,
    itemCatalogoId:       r.item_catalogo_id,
    tipoLinea:            r.tipo_linea,
    descripcion:          r.descripcion,
    cantidad:             parseFloat(r.cantidad      || 1),
    unidadMedida:         r.unidad_medida,
    precioUnitario:       parseFloat(r.precio_unitario || 0),
    costoUnitario:        parseFloat(r.costo_unitario  || 0),
    subtotal:             parseFloat(r.subtotal         || 0),
    modeloAbanico:        r.modelo_abanico,
    desinstalarCantidad:  r.desinstalar_cantidad,
    perforacionCantidad:  r.perforacion_cantidad,
    anchoM:               r.ancho_m,
    altoM:                r.alto_m,
    areaM2:               parseFloat(r.area_m2 || 0),
    telaColor:            r.tela_color,
    sistemaInstalacion:   r.sistema_instalacion,
    habitacion:           r.habitacion,
    requiereInventario:   r.requiere_inventario,
    requiereServicio:     r.requiere_servicio,
    notas:                r.notas,
  };
}

export function pdToDb(pd) {
  return {
    item_catalogo_id:     pd.itemCatalogoId       || null,
    tipo_linea:           pd.tipoLinea             || 'item',
    descripcion:          pd.descripcion,
    cantidad:             pd.cantidad              || 1,
    unidad_medida:        pd.unidadMedida          || 'pieza',
    precio_unitario:      pd.precioUnitario        || 0,
    costo_unitario:       pd.costoUnitario         || 0,
    modelo_abanico:       pd.modeloAbanico         || null,
    desinstalar_cantidad: pd.desinstalarCantidad   || null,
    perforacion_cantidad: pd.perforacionCantidad   || null,
    ancho_m:              pd.anchoM                || null,
    alto_m:               pd.altoM                 || null,
    tela_color:           pd.telaColor             || null,
    sistema_instalacion:  pd.sistemaInstalacion    || null,
    habitacion:           pd.habitacion            || null,
    requiere_inventario:  pd.requiereInventario     || false,
    requiere_servicio:    pd.requiereServicio       !== false,
    notas:                pd.notas                 || null,
  };
}

// ============= CATÁLOGO =============
export function itemFromDb(r) {
  return {
    id:                 r.id,
    sku:                r.sku,
    nombre:             r.nombre,
    categoriaId:        r.categoria_id,
    tipoPersianaId:     r.tipo_persiana_id,
    marca:              r.marca,
    modelo:             r.modelo,
    color:              r.color,
    unidadMedida:       r.unidad_medida,
    precioBase:         parseFloat(r.precio_base || 0),
    costoBase:          parseFloat(r.costo_base  || 0),
    controlaInventario: r.controla_inventario,
    activo:             r.activo,
    notas:              r.notas,
    createdAt:          r.created_at,
    updatedAt:          r.updated_at,
  };
}

export function itemToDb(i) {
  return {
    sku:                i.sku                || null,
    nombre:             i.nombre,
    categoria_id:       i.categoriaId,
    tipo_persiana_id:   i.tipoPersianaId     || null,
    marca:              i.marca              || null,
    modelo:             i.modelo             || null,
    color:              i.color              || null,
    unidad_medida:      i.unidadMedida       || 'pieza',
    precio_base:        i.precioBase         || 0,
    costo_base:         i.costoBase          || 0,
    controla_inventario: i.controlaInventario || false,
    activo:             i.activo !== false,
    notas:              i.notas              || null,
  };
}

// ============= SERVICIOS =============
export function servFromDb(r) {
  return {
    id:                r.id,
    pedidoId:          r.pedido_id,
    pedidoDetalleId:   r.pedido_detalle_id,
    tipoServicio:      r.tipo_servicio,
    fechaServicio:     r.fecha_servicio,
    horaProgramada:    r.hora_programada,
    horaLlegada:       r.hora_llegada,
    horaInicio:        r.hora_inicio,
    horaFin:           r.hora_fin,
    tecnicoId:         r.tecnico_id,
    tecnicoApoyoId:    r.tecnico_apoyo_id,
    rutaNum:           r.ruta_num,
    estado:            r.estado,
    motivoCancelacion: r.motivo_cancelacion,
    motivoRetraso:     r.motivo_retraso,
    evidenciaUrl:      r.evidencia_url,
    observaciones:     r.observaciones,
    createdAt:         r.created_at,
    updatedAt:         r.updated_at,
  };
}

// ============= ALMACENAMIENTO (legacy) =============
export function aFromDb(r) {
  return {
    id:        r.id,
    modelo:    r.modelo,
    categoria: r.categoria,
    lugar:     r.lugar,
    cantidad:  r.cantidad,
    precio:    r.precio,
    notas:     r.notas,
    updatedAt: r.updated_at || r.updatedAt,
  };
}

// ============= SERVICIOS METRICAS (legacy) =============
export function smFromDb(r) {
  return {
    id:              r.id,
    pedido_id:       r.pedido_id,
    tecnico:         r.tecnico,
    hora_programada: r.hora_programada,
    hora_llegada:    r.hora_llegada,
    hora_inicio:     r.hora_inicio,
    hora_fin:        r.hora_fin,
    zona:            r.zona,
    orden_ruta:      r.orden_ruta,
    estado:          r.estado,
    retraso_min:     r.retraso_min,
    motivo_retraso:  r.motivo_retraso,
    dia_semana:      r.dia_semana,
  };
}

// ============= INVENTARIO =============
export function invExistFromDb(r) {
  return {
    id:            r.id,
    itemCatalogoId: r.item_catalogo_id,
    ubicacionId:   r.ubicacion_id,
    cantidad:      parseFloat(r.cantidad      || 0),
    costoPromedio: parseFloat(r.costo_promedio || 0),
    updatedAt:     r.updated_at,
  };
}

export function invMovFromDb(r) {
  return {
    id:                  r.id,
    itemCatalogoId:      r.item_catalogo_id,
    ubicacionOrigenId:   r.ubicacion_origen_id,
    ubicacionDestinoId:  r.ubicacion_destino_id,
    tipoMovimiento:      r.tipo_movimiento,
    cantidad:            parseFloat(r.cantidad      || 0),
    costoUnitario:       parseFloat(r.costo_unitario || 0),
    pedidoId:            r.pedido_id,
    servicioId:          r.servicio_id,
    referencia:          r.referencia,
    notas:               r.notas,
    createdAt:           r.created_at,
  };
}
