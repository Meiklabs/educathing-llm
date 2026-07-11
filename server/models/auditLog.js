const prisma = require("../utils/prisma");

/**
 * @typedef {Object} AuditLogRow
 * @property {number} id
 * @property {number|null} userId
 * @property {string} action
 * @property {string|null} entityType
 * @property {string|null} entityId
 * @property {string|null} ipAddress
 * @property {string|null} userAgent
 * @property {string|null} metadata      JSON-stringified extras
 * @property {Date} createdAt
 */

// Known action strings. This is intentionally a whitelist so a typo at a
// call site fails at record() time instead of quietly polluting the trail
// with garbage values. Extend as new events are wired in.
const ACTIONS = Object.freeze({
  DOCUMENT_GENERATED: "document_generated",
  DOCUMENT_DOWNLOADED: "document_downloaded",
  DOCUMENT_DELETED: "document_deleted",
});
const VALID_ACTIONS = new Set(Object.values(ACTIONS));

// Trust proxy-forwarded IPs only when the app runs behind our Caddy
// reverse proxy in the shipped compose. Direct-Node deployments still get
// the socket remoteAddress. When both are absent we log null instead of
// making one up.
function ipFromRequest(request) {
  if (!request) return null;
  const forwarded = request.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    // x-forwarded-for is a comma-separated list; the left-most entry is
    // the original client. Trim aggressively to bound stored length.
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  const remote = request.ip || request.socket?.remoteAddress || null;
  return remote ? String(remote).slice(0, 64) : null;
}

function userAgentFromRequest(request) {
  const ua = request?.headers?.["user-agent"];
  if (!ua || typeof ua !== "string") return null;
  return ua.slice(0, 512);
}

const AuditLog = {
  ACTIONS,

  /**
   * Insert an audit row. Best-effort: never throws — a broken audit trail
   * must not break the underlying action.
   * @param {object} params
   * @param {string} params.action - Must be one of AuditLog.ACTIONS.
   * @param {number|null} [params.userId]
   * @param {string|null} [params.entityType]
   * @param {string|number|null} [params.entityId]
   * @param {object|null} [params.metadata]  - Any JSON-serializable object.
   * @param {object} [params.request]        - Express request; used to pull
   *   ipAddress + userAgent. Skip for background/system events.
   * @returns {Promise<AuditLogRow|null>}
   */
  record: async function ({
    action,
    userId = null,
    entityType = null,
    entityId = null,
    metadata = null,
    request = null,
  }) {
    try {
      if (!VALID_ACTIONS.has(action)) {
        console.warn(`[AuditLog.record] unknown action: ${action}`);
        return null;
      }
      let metaBlob = null;
      if (metadata !== null && metadata !== undefined) {
        try {
          metaBlob = JSON.stringify(metadata).slice(0, 8192);
        } catch {
          metaBlob = null;
        }
      }
      return await prisma.audit_log.create({
        data: {
          userId: userId != null ? Number(userId) : null,
          action,
          entityType: entityType || null,
          entityId: entityId != null ? String(entityId).slice(0, 64) : null,
          ipAddress: ipFromRequest(request),
          userAgent: userAgentFromRequest(request),
          metadata: metaBlob,
        },
      });
    } catch (error) {
      // Don't rethrow — the audit trail is a satellite of the action, not
      // a gatekeeper.
      console.error("[AuditLog.record]", error.message);
      return null;
    }
  },

  /**
   * List audit rows matching the where clause with pagination.
   * @param {object} [clause]
   * @param {number} [limit=100]
   * @param {number} [offset=0]
   * @returns {Promise<AuditLogRow[]>}
   */
  where: async function (clause = {}, limit = 100, offset = 0) {
    try {
      return await prisma.audit_log.findMany({
        where: clause,
        take: Math.max(1, Math.min(Number(limit) || 100, 500)),
        skip: Math.max(0, Number(offset) || 0),
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { id: true, username: true, role: true } },
        },
      });
    } catch (error) {
      console.error("[AuditLog.where]", error.message);
      return [];
    }
  },

  /**
   * Count rows matching the where clause. Used for pagination totals.
   */
  count: async function (clause = {}) {
    try {
      return await prisma.audit_log.count({ where: clause });
    } catch (error) {
      console.error("[AuditLog.count]", error.message);
      return 0;
    }
  },
};

module.exports = { AuditLog };
