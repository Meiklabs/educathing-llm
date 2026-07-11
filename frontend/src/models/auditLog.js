import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";

/**
 * Read-only client for /api/audit-log — admin surface backing RF-09.
 */
const AuditLogClient = {
  /**
   * @param {object} filters
   * @param {number|null} [filters.userId]
   * @param {string|null} [filters.action]
   * @param {string|null} [filters.from]     ISO datetime
   * @param {string|null} [filters.to]       ISO datetime
   * @param {number} [filters.page=1]
   * @param {number} [filters.pageSize=50]
   * @returns {Promise<{entries:Array, total:number, page:number, pageSize:number}>}
   */
  list: async function ({
    userId = null,
    action = null,
    from = null,
    to = null,
    page = 1,
    pageSize = 50,
  } = {}) {
    const url = new URL(`${API_BASE}/audit-log`);
    if (userId) url.searchParams.set("userId", userId);
    if (action) url.searchParams.set("action", action);
    if (from) url.searchParams.set("from", from);
    if (to) url.searchParams.set("to", to);
    url.searchParams.set("page", page);
    url.searchParams.set("pageSize", pageSize);

    return fetch(url.toString(), { headers: baseHeaders() })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load audit log");
        return res.json();
      })
      .catch((e) => {
        console.error("[AuditLog.list]", e);
        return { entries: [], total: 0, page: 1, pageSize: 0 };
      });
  },

  /**
   * @returns {Promise<string[]>} whitelisted action strings
   */
  actions: async function () {
    return fetch(`${API_BASE}/audit-log/actions`, { headers: baseHeaders() })
      .then((res) => (res.ok ? res.json() : { actions: [] }))
      .then((body) => body.actions || [])
      .catch(() => []);
  },
};

export default AuditLogClient;
