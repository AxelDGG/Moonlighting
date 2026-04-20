import { ROLES } from './roles.js';

// Permisos por defecto asignados al auto-provisionar un perfil de usuario.
// Centralizado aquí porque antes estaba duplicado en routes/user_profiles.js.
export const DEFAULT_PERMISSIONS_BY_ROLE = Object.freeze({
  [ROLES.ADMIN]: {},
  [ROLES.GESTOR]: Object.freeze({
    ver_metricas:    false,
    ver_dashboard:   false,
    crear_tecnicos:  false,
    ver_porcentajes: false,
    ver_almacen:     true,
    ver_calendario:  true,
    ver_mapa:        true,
  }),
  [ROLES.TECNICO]: Object.freeze({
    ver_metricas:    false,
    ver_dashboard:   false,
    crear_tecnicos:  false,
    ver_porcentajes: false,
    ver_almacen:     false,
    ver_calendario:  false,
    ver_mapa:        false,
  }),
});

export function defaultPermissionsFor(role) {
  return { ...(DEFAULT_PERMISSIONS_BY_ROLE[role] || {}) };
}
