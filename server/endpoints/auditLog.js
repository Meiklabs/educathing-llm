const { validatedRequest } = require("../utils/middleware/validatedRequest");
const {
  strictMultiUserRoleValid,
  ROLES,
} = require("../utils/middleware/multiUserProtected");
const { AuditLog } = require("../models/auditLog");

/**
 * Read-only endpoints for the RF-09 audit trail. Admin only — the trail
 * exposes user IDs and IP addresses of colleagues, so managers and below
 * are intentionally excluded.
 */
function auditLogEndpoints(app) {
  if (!app) return;

  /**
   * GET /audit-log
   *
   * Query params (all optional):
   *   userId  - filter to actions performed by this user
   *   action  - "document_generated" | "document_downloaded" | "document_deleted"
   *   from    - ISO date (inclusive)
   *   to      - ISO date (exclusive)
   *   page    - 1-based, default 1
   *   pageSize - default 50, capped at 200
   *
   * Response:
   *   { entries: [...], total, page, pageSize }
   */
  app.get(
    "/audit-log",
    [validatedRequest, strictMultiUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const {
          userId,
          action,
          from,
          to,
          page: rawPage,
          pageSize: rawPageSize,
        } = request.query;

        const page = Math.max(1, Number.parseInt(rawPage, 10) || 1);
        const pageSize = Math.max(
          1,
          Math.min(Number.parseInt(rawPageSize, 10) || 50, 200)
        );

        const where = {};
        if (userId) {
          const uid = Number.parseInt(userId, 10);
          if (Number.isInteger(uid)) where.userId = uid;
        }
        if (action && typeof action === "string") {
          where.action = action;
        }
        if (from || to) {
          where.createdAt = {};
          const fromDate = from ? new Date(String(from)) : null;
          const toDate = to ? new Date(String(to)) : null;
          if (fromDate && !Number.isNaN(fromDate.getTime())) {
            where.createdAt.gte = fromDate;
          }
          if (toDate && !Number.isNaN(toDate.getTime())) {
            where.createdAt.lt = toDate;
          }
          if (Object.keys(where.createdAt).length === 0) delete where.createdAt;
        }

        const [entries, total] = await Promise.all([
          AuditLog.where(where, pageSize, (page - 1) * pageSize),
          AuditLog.count(where),
        ]);

        // Metadata is stored as a JSON string blob; parse for the client
        // so it doesn't have to re-parse per row. Best-effort — malformed
        // blobs pass through as raw strings for debugging.
        const shaped = entries.map((row) => {
          let metadata = row.metadata;
          if (metadata && typeof metadata === "string") {
            try {
              metadata = JSON.parse(metadata);
            } catch {
              // keep as string
            }
          }
          return { ...row, metadata };
        });

        return response
          .status(200)
          .json({ entries: shaped, total, page, pageSize });
      } catch (error) {
        console.error("[auditLog] list failed:", error.message);
        return response.status(500).json({ error: "Failed to load audit log." });
      }
    }
  );

  /**
   * GET /audit-log/actions
   *
   * Enumerate the currently supported action strings so the frontend can
   * populate the filter dropdown without hardcoding them.
   */
  app.get(
    "/audit-log/actions",
    [validatedRequest, strictMultiUserRoleValid([ROLES.admin])],
    async (_request, response) => {
      return response
        .status(200)
        .json({ actions: Object.values(AuditLog.ACTIONS) });
    }
  );
}

module.exports = { auditLogEndpoints };
