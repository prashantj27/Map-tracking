/**
 * Central permission gate.
 *
 * The platform currently has no authentication/RBAC layer, so these default to enabled.
 * This is the single place to wire real roles / SSO later — every call site (e.g. the
 * image viewer's delete control) reads through `hasPermission`, so gating an action to
 * admins only becomes a one-line change here with no component edits.
 */
export type Permission = 'project.image.upload' | 'project.image.delete';

const GRANTED: Record<Permission, boolean> = {
  'project.image.upload': true,
  'project.image.delete': true,
};

export function hasPermission(permission: Permission): boolean {
  return GRANTED[permission] ?? false;
}

/** Hook form for use inside components. */
export function usePermission(permission: Permission): boolean {
  return hasPermission(permission);
}
