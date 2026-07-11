import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";

/**
 * Read-only client for /api/llm-usage — admin surface for the "panel simple
 * de consumo" required by the RFP.
 */
const LlmUsageClient = {
  /**
   * @param {object} filters
   * @param {string|null} [filters.from] ISO datetime; default = 30 days ago
   * @param {string|null} [filters.to]   ISO datetime; default = now
   * @param {number} [filters.topN=10]   rows per aggregation, capped at 50 server-side
   */
  summary: async function ({ from = null, to = null, topN = 10 } = {}) {
    const url = new URL(`${API_BASE}/llm-usage`);
    if (from) url.searchParams.set("from", from);
    if (to) url.searchParams.set("to", to);
    if (topN) url.searchParams.set("topN", topN);
    return fetch(url.toString(), { headers: baseHeaders() })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load usage");
        return res.json();
      })
      .catch((e) => {
        console.error("[LlmUsage.summary]", e);
        return {
          window: { from, to },
          totals: { totalCostUsd: 0, totalTokens: 0, totalRequests: 0 },
          credits: null,
          daily: [],
          byUser: [],
          byWorkspace: [],
          byModel: [],
          byProvider: [],
        };
      });
  },
};

export default LlmUsageClient;
