const { userFromSession, multiUserMode } = require("../utils/http");
const { validatedRequest } = require("../utils/middleware/validatedRequest");
const {
  flexUserRoleValid,
  ROLES,
} = require("../utils/middleware/multiUserProtected");
const { Workspace } = require("../models/workspace");
const { GeneratedDocument } = require("../models/generatedDocument");
const { AuditLog } = require("../models/auditLog");

/**
 * Library endpoints — read-only surface backing the RF-10 document library
 * page. The lector role is granted alongside the other three (admin, manager,
 * default) because this is the only surface a lector is allowed to touch.
 */
function libraryEndpoints(app) {
  if (!app) return;

  /**
   * List documents the caller is allowed to see, with filters and pagination.
   *
   * Query params (all optional):
   *   workspaceId - only rows for this carrera
   *   fileType    - "docx" | "pdf" | "xlsx" | "pptx" | "txt" | "text"
   *   docType     - "programa" | "plan" | "asesoria" | "informe"
   *   q           - case-insensitive substring against title / displayFilename
   *   page        - 1-based, default 1
   *   pageSize    - default 30, capped at 100
   *
   * Response shape:
   *   {
   *     documents: [ {...row, workspace, user} ],
   *     total: number,
   *     page, pageSize,
   *     workspaces: [ {id, name, slug} ]  // scope of the filter dropdown
   *   }
   */
  app.get(
    "/library",
    [validatedRequest, flexUserRoleValid([ROLES.all, ROLES.lector])],
    async (request, response) => {
      try {
        const isMultiUser = multiUserMode(response);
        const user = isMultiUser
          ? await userFromSession(request, response)
          : null;

        // Workspace scope the caller is allowed to see. In single-user mode
        // that's every workspace; in multi-user mode whereWithUser handles
        // the admin/manager (all) vs. member (workspace_users) split.
        const scopeWorkspaces = user
          ? await Workspace.whereWithUser(user)
          : await Workspace.where();
        const scopeIds = scopeWorkspaces.map((w) => w.id);

        if (scopeIds.length === 0) {
          return response.status(200).json({
            documents: [],
            total: 0,
            page: 1,
            pageSize: 0,
            workspaces: [],
          });
        }

        const {
          workspaceId,
          fileType,
          docType,
          q,
          page: rawPage,
          pageSize: rawPageSize,
        } = request.query;

        const page = Math.max(1, Number.parseInt(rawPage, 10) || 1);
        const pageSize = Math.max(
          1,
          Math.min(Number.parseInt(rawPageSize, 10) || 30, 100)
        );

        // Compose the where clause. workspaceId, if provided, must intersect
        // the caller's scope — otherwise fall back to the full scope to avoid
        // leaking existence of a workspace the caller can't see.
        const where = {};
        if (workspaceId) {
          const wid = Number.parseInt(workspaceId, 10);
          if (Number.isInteger(wid) && scopeIds.includes(wid)) {
            where.workspaceId = wid;
          } else {
            where.workspaceId = { in: scopeIds };
          }
        } else {
          where.workspaceId = { in: scopeIds };
        }
        if (
          fileType &&
          GeneratedDocument.VALID_FILE_TYPES.includes(String(fileType))
        ) {
          where.fileType = String(fileType);
        }
        if (
          docType &&
          GeneratedDocument.VALID_DOC_TYPES.includes(String(docType))
        ) {
          where.docType = String(docType);
        }
        if (q && String(q).trim().length > 0) {
          const needle = String(q).trim();
          where.OR = [
            { title: { contains: needle } },
            { displayFilename: { contains: needle } },
          ];
        }

        const [documents, total] = await Promise.all([
          GeneratedDocument.where(
            where,
            pageSize,
            (page - 1) * pageSize,
            { createdAt: "desc" }
          ),
          GeneratedDocument.count(where),
        ]);

        return response.status(200).json({
          documents,
          total,
          page,
          pageSize,
          workspaces: scopeWorkspaces.map((w) => ({
            id: w.id,
            name: w.name,
            slug: w.slug,
          })),
        });
      } catch (error) {
        console.error("[library] list failed:", error.message);
        return response.status(500).json({ error: "Failed to load library." });
      }
    }
  );

  /**
   * Soft-delete a document from the library. Only admin and manager can
   * do this — docentes and lectores are read-only on the library.
   * The file on disk is left in place; the row is stamped with deletedAt.
   */
  app.delete(
    "/library/:id",
    [
      validatedRequest,
      flexUserRoleValid([ROLES.admin, ROLES.manager]),
    ],
    async (request, response) => {
      try {
        const id = Number.parseInt(request.params.id, 10);
        if (!Number.isInteger(id)) {
          return response.status(400).json({ error: "Invalid document id." });
        }

        // Enforce that the doc belongs to a workspace the caller can access,
        // then soft-delete. whereWithUser already handles the admin/manager
        // "see everything" case.
        const isMultiUser = multiUserMode(response);
        const user = isMultiUser
          ? await userFromSession(request, response)
          : null;
        const scopeWorkspaces = user
          ? await Workspace.whereWithUser(user)
          : await Workspace.where();
        const scopeIds = scopeWorkspaces.map((w) => w.id);

        const doc = await GeneratedDocument.get({ id });
        if (!doc || !scopeIds.includes(doc.workspaceId)) {
          return response.status(404).json({ error: "Document not found." });
        }

        const ok = await GeneratedDocument.softDelete(id);
        if (ok) {
          // Audit trail (RF-09). Log the deletion with the actor's info so
          // there's a record even after the row is soft-deleted from the
          // library view.
          try {
            await AuditLog.record({
              action: AuditLog.ACTIONS.DOCUMENT_DELETED,
              userId: user?.id ?? null,
              entityType: "generated_document",
              entityId: doc.id,
              request,
              metadata: {
                workspaceId: doc.workspaceId,
                fileType: doc.fileType,
                docType: doc.docType,
                displayFilename: doc.displayFilename,
              },
            });
          } catch (auditError) {
            console.error("[library] audit write failed:", auditError.message);
          }
        }
        return response.status(ok ? 200 : 500).json({ ok });
      } catch (error) {
        console.error("[library] delete failed:", error.message);
        return response
          .status(500)
          .json({ error: "Failed to delete document." });
      }
    }
  );
}

module.exports = { libraryEndpoints };
