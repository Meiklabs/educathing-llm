const prisma = require("../utils/prisma");

/**
 * @typedef {Object} LlmUsageRow
 * @property {number} id
 * @property {number|null} userId
 * @property {number|null} workspaceId
 * @property {number|null} threadId
 * @property {string} provider
 * @property {string} model
 * @property {string} requestType  "chat" | "agent" | ...
 * @property {number} promptTokens
 * @property {number} completionTokens
 * @property {number} totalTokens
 * @property {number|null} costUsd    USD; null when provider does not report cost
 * @property {number|null} durationMs
 * @property {Date} createdAt
 */

function toInt(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
}
function toIntOrNull(v) {
  if (v === null || v === undefined) return null;
  return toInt(v);
}

const LlmUsage = {
  REQUEST_TYPES: Object.freeze({
    CHAT: "chat",
    AGENT: "agent",
    EMBED: "embed",
    API: "api",
  }),

  /**
   * Insert a usage row. Best-effort: never throws — an LLM call must not
   * fail because of usage bookkeeping.
   */
  record: async function ({
    userId = null,
    workspaceId = null,
    threadId = null,
    provider,
    model,
    requestType = "chat",
    promptTokens = 0,
    completionTokens = 0,
    totalTokens = 0,
    costUsd = null,
    durationMs = null,
  }) {
    try {
      if (!provider || !model) return null;
      const total =
        totalTokens && totalTokens > 0
          ? toInt(totalTokens)
          : toInt(promptTokens) + toInt(completionTokens);
      return await prisma.llm_usage.create({
        data: {
          userId: toIntOrNull(userId),
          workspaceId: toIntOrNull(workspaceId),
          threadId: toIntOrNull(threadId),
          provider: String(provider).slice(0, 64),
          model: String(model).slice(0, 128),
          requestType: String(requestType).slice(0, 32),
          promptTokens: toInt(promptTokens),
          completionTokens: toInt(completionTokens),
          totalTokens: total,
          costUsd:
            costUsd !== null && costUsd !== undefined && Number.isFinite(Number(costUsd))
              ? Number(costUsd)
              : null,
          durationMs: durationMs != null ? toInt(durationMs) : null,
        },
      });
    } catch (error) {
      console.error("[LlmUsage.record]", error.message);
      return null;
    }
  },

  /**
   * Global totals over a time range.
   * @param {Date} from
   * @param {Date} to
   * @returns {Promise<{totalCostUsd:number, totalTokens:number, totalRequests:number}>}
   */
  totals: async function (from, to) {
    try {
      const agg = await prisma.llm_usage.aggregate({
        where: { createdAt: { gte: from, lt: to } },
        _sum: { costUsd: true, totalTokens: true },
        _count: { id: true },
      });
      return {
        totalCostUsd: agg._sum.costUsd || 0,
        totalTokens: agg._sum.totalTokens || 0,
        totalRequests: agg._count.id || 0,
      };
    } catch (error) {
      console.error("[LlmUsage.totals]", error.message);
      return { totalCostUsd: 0, totalTokens: 0, totalRequests: 0 };
    }
  },

  /**
   * Group by a single dimension (user | workspace | model | provider).
   * Returns rows shaped { key, name, costUsd, totalTokens, requests } sorted
   * by cost desc.
   */
  aggregate: async function (dimension, from, to, limit = 10) {
    try {
      const field =
        dimension === "user"
          ? "userId"
          : dimension === "workspace"
            ? "workspaceId"
            : dimension === "model"
              ? "model"
              : "provider";

      const rows = await prisma.llm_usage.groupBy({
        by: [field],
        where: { createdAt: { gte: from, lt: to } },
        _sum: { costUsd: true, totalTokens: true },
        _count: { id: true },
        orderBy: { _sum: { costUsd: "desc" } },
        take: Math.max(1, Math.min(Number(limit) || 10, 50)),
      });

      // Resolve labels for id-based dimensions.
      let labelMap = new Map();
      if (dimension === "user") {
        const ids = rows.map((r) => r.userId).filter((v) => v != null);
        if (ids.length) {
          const users = await prisma.users.findMany({
            where: { id: { in: ids } },
            select: { id: true, username: true, role: true },
          });
          for (const u of users) labelMap.set(u.id, u);
        }
      } else if (dimension === "workspace") {
        const ids = rows.map((r) => r.workspaceId).filter((v) => v != null);
        if (ids.length) {
          const wss = await prisma.workspaces.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true, slug: true },
          });
          for (const w of wss) labelMap.set(w.id, w);
        }
      }

      return rows.map((r) => {
        const key = r[field];
        let name = key;
        if (dimension === "user") {
          const u = labelMap.get(key);
          name = u ? `${u.username} (${u.role})` : `usuario #${key ?? "n/d"}`;
        } else if (dimension === "workspace") {
          const w = labelMap.get(key);
          name = w ? w.name : `carrera #${key ?? "n/d"}`;
        }
        return {
          key,
          name,
          costUsd: r._sum.costUsd || 0,
          totalTokens: r._sum.totalTokens || 0,
          requests: r._count.id || 0,
        };
      });
    } catch (error) {
      console.error("[LlmUsage.aggregate]", error.message);
      return [];
    }
  },

  /**
   * Daily timeline of cost + tokens for a chart.
   * SQLite doesn't have $groupBy on a truncated date, so we do it in JS
   * over the raw rows in the window. The window is bounded by from/to so
   * this stays cheap even after months of usage.
   */
  daily: async function (from, to) {
    try {
      const rows = await prisma.llm_usage.findMany({
        where: { createdAt: { gte: from, lt: to } },
        select: { createdAt: true, costUsd: true, totalTokens: true },
      });
      const buckets = new Map();
      for (const r of rows) {
        const day = r.createdAt.toISOString().slice(0, 10);
        const b = buckets.get(day) || { day, costUsd: 0, totalTokens: 0, requests: 0 };
        b.costUsd += r.costUsd || 0;
        b.totalTokens += r.totalTokens || 0;
        b.requests += 1;
        buckets.set(day, b);
      }
      return [...buckets.values()].sort((a, b) => a.day.localeCompare(b.day));
    } catch (error) {
      console.error("[LlmUsage.daily]", error.message);
      return [];
    }
  },
};

module.exports = { LlmUsage };
