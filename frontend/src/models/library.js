import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";

/**
 * Client for /api/library — the CFT document library backing RF-10.
 * Documents are indexed at generation time by the create-files agent; this
 * client only reads and (for admin/manager) soft-deletes them.
 */
const Library = {
  /**
   * List documents visible to the current user, with server-side filters.
   * @param {object} filters
   * @param {number|null} [filters.workspaceId]
   * @param {string|null} [filters.fileType]   docx|pdf|xlsx|pptx|txt|text
   * @param {string|null} [filters.docType]    programa|plan|asesoria|informe
   * @param {string|null} [filters.q]          substring search
   * @param {number} [filters.page=1]
   * @param {number} [filters.pageSize=30]
   * @returns {Promise<{documents:Array, total:number, page:number, pageSize:number, workspaces:Array}>}
   */
  list: async function ({
    workspaceId = null,
    fileType = null,
    docType = null,
    q = null,
    page = 1,
    pageSize = 30,
  } = {}) {
    const url = new URL(`${API_BASE}/library`);
    if (workspaceId) url.searchParams.set("workspaceId", workspaceId);
    if (fileType) url.searchParams.set("fileType", fileType);
    if (docType) url.searchParams.set("docType", docType);
    if (q && q.trim().length > 0) url.searchParams.set("q", q.trim());
    url.searchParams.set("page", page);
    url.searchParams.set("pageSize", pageSize);

    return fetch(url.toString(), { headers: baseHeaders() })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load library");
        return res.json();
      })
      .catch((e) => {
        console.error("[Library.list]", e);
        return {
          documents: [],
          total: 0,
          page: 1,
          pageSize: 0,
          workspaces: [],
        };
      });
  },

  /**
   * Soft-delete a document. Only admin and manager (asesor curricular) are
   * allowed by the backend; a 401 is expected for other roles.
   */
  softDelete: async function (id) {
    return fetch(`${API_BASE}/library/${id}`, {
      method: "DELETE",
      headers: baseHeaders(),
    })
      .then((res) => res.ok)
      .catch((e) => {
        console.error("[Library.softDelete]", e);
        return false;
      });
  },
};

export default Library;
