const { SystemSettings } = require("../../models/systemSettings");
const { userFromSession } = require("../http");
const ROLES = {
  all: "<all>",
  admin: "admin",
  manager: "manager",
  default: "default",
  // Read-only role. In the CFT deployment these users can only browse the
  // document library and download previously generated documents — no chat,
  // no workspace mutation, no admin surfaces. Routes that want to grant a
  // lector access must add ROLES.lector explicitly to their allowlist; the
  // catch-all ROLES.all sentinel deliberately excludes lector.
  lector: "lector",
};
const DEFAULT_ROLES = [ROLES.admin, ROLES.admin];

/**
 * Decides whether the caller is a lector that should be denied from a
 * ROLES.all bypass. Returns true if we should short-circuit with 401.
 * Only runs when multi-user mode is on (single-user mode has no lectors).
 */
async function shouldDenyLector(request, response, allowedRoles) {
  if (allowedRoles.includes(ROLES.lector)) return false;
  const user =
    response.locals?.user ?? (await userFromSession(request, response));
  return user?.role === ROLES.lector;
}

/**
 * Explicitly check that single user mode is enabled as well as that the
 * requesting user has the appropriate role to modify or call the URL.
 * @returns {function}
 */
async function isSingleUserMode(_request, response, next) {
  const multiUserMode = await SystemSettings.isMultiUserMode();
  if (multiUserMode) return response.sendStatus(401).end();
  next();
  return;
}

/**
 * Explicitly check that multi user mode is enabled as well as that the
 * requesting user has the appropriate role to modify or call the URL.
 * @param {string[]} allowedRoles - The roles that are allowed to access the route
 * @returns {function}
 */
function strictMultiUserRoleValid(allowedRoles = DEFAULT_ROLES) {
  return async (request, response, next) => {
    // If the access-control is allowable for all - skip validations and continue;
    // unless the caller is a lector, in which case we deny by default (see
    // shouldDenyLector). Endpoints that want to expose a ROLES.all bypass to
    // lectors must add ROLES.lector to their allowlist.
    if (allowedRoles.includes(ROLES.all)) {
      const multiUserMode =
        response.locals?.multiUserMode ??
        (await SystemSettings.isMultiUserMode());
      if (
        multiUserMode &&
        (await shouldDenyLector(request, response, allowedRoles))
      ) {
        return response.sendStatus(401).end();
      }
      next();
      return;
    }

    const multiUserMode =
      response.locals?.multiUserMode ??
      (await SystemSettings.isMultiUserMode());
    if (!multiUserMode) return response.sendStatus(401).end();

    const user =
      response.locals?.user ?? (await userFromSession(request, response));
    if (allowedRoles.includes(user?.role)) {
      next();
      return;
    }
    return response.sendStatus(401).end();
  };
}

/**
 * Apply role permission checks IF the current system is in multi-user mode.
 * This is relevant for routes that are shared between MUM and single-user mode.
 * @param {string[]} allowedRoles - The roles that are allowed to access the route
 * @returns {function}
 */
function flexUserRoleValid(allowedRoles = DEFAULT_ROLES) {
  return async (request, response, next) => {
    // If the access-control is allowable for all - skip validations and continue;
    // It does not matter if multi-user or not. Lector is denied here unless
    // the endpoint explicitly opts in via ROLES.lector — this keeps chat and
    // workspace mutation surfaces off-limits without touching every route.
    if (allowedRoles.includes(ROLES.all)) {
      const multiUserMode =
        response.locals?.multiUserMode ??
        (await SystemSettings.isMultiUserMode());
      if (
        multiUserMode &&
        (await shouldDenyLector(request, response, allowedRoles))
      ) {
        return response.sendStatus(401).end();
      }
      next();
      return;
    }

    // Bypass if not in multi-user mode
    const multiUserMode =
      response.locals?.multiUserMode ??
      (await SystemSettings.isMultiUserMode());
    if (!multiUserMode) {
      next();
      return;
    }

    const user =
      response.locals?.user ?? (await userFromSession(request, response));
    if (allowedRoles.includes(user?.role)) {
      next();
      return;
    }
    return response.sendStatus(401).end();
  };
}

// Middleware check on a public route if the instance is in a valid
// multi-user set up.
async function isMultiUserSetup(_request, response, next) {
  const multiUserMode = await SystemSettings.isMultiUserMode();
  if (!multiUserMode) {
    response.status(403).json({
      error: "Invalid request",
    });
    return;
  }

  next();
  return;
}

module.exports = {
  ROLES,
  isSingleUserMode,
  strictMultiUserRoleValid,
  flexUserRoleValid,
  isMultiUserSetup,
};
