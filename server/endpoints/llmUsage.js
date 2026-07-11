const { validatedRequest } = require("../utils/middleware/validatedRequest");
const {
  strictMultiUserRoleValid,
  ROLES,
} = require("../utils/middleware/multiUserProtected");
const { LlmUsage } = require("../models/llmUsage");

// Default window when the caller doesn't specify one: last 30 days ending now.
function resolveWindow(request) {
  const now = new Date();
  const rawFrom = request.query.from;
  const rawTo = request.query.to;
  const to = rawTo ? new Date(String(rawTo)) : now;
  const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const from = rawFrom ? new Date(String(rawFrom)) : defaultFrom;
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return { from: defaultFrom, to: now };
  }
  return { from, to };
}

// Query OpenRouter's balance endpoint if the instance is configured with an
// OpenRouter key. Silently returns null on failure so a network hiccup on the
// dashboard does not break the whole panel.
async function fetchOpenRouterCredits() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch("https://openrouter.ai/api/v1/credits", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const body = await res.json();
    const data = body?.data || body;
    // Response shape (2024+): { data: { total_credits, total_usage } }.
    // Older shape: { total_credits, total_usage }. Handle both.
    if (data && typeof data.total_credits === "number") {
      return {
        totalCredits: data.total_credits,
        totalUsage: data.total_usage ?? 0,
        remaining:
          data.total_credits - (data.total_usage ?? 0),
      };
    }
    return null;
  } catch (error) {
    console.error("[llmUsage] OpenRouter credits fetch failed:", error.message);
    return null;
  }
}

function llmUsageEndpoints(app) {
  if (!app) return;

  /**
   * GET /llm-usage
   *
   * Query params:
   *   from, to  - ISO datetimes (defaults: last 30 days)
   *   topN      - how many rows per aggregation (default 10, capped at 50)
   *
   * Response:
   *   {
   *     window: { from, to },
   *     totals: { totalCostUsd, totalTokens, totalRequests },
   *     credits: { totalCredits, totalUsage, remaining } | null,
   *     daily: [{ day, costUsd, totalTokens, requests }],
   *     byUser, byWorkspace, byModel, byProvider:
   *       [{ key, name, costUsd, totalTokens, requests }]
   *   }
   */
  app.get(
    "/llm-usage",
    [validatedRequest, strictMultiUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const { from, to } = resolveWindow(request);
        const topN = Math.max(
          1,
          Math.min(Number.parseInt(request.query.topN, 10) || 10, 50)
        );

        const [totals, daily, byUser, byWorkspace, byModel, byProvider, credits] =
          await Promise.all([
            LlmUsage.totals(from, to),
            LlmUsage.daily(from, to),
            LlmUsage.aggregate("user", from, to, topN),
            LlmUsage.aggregate("workspace", from, to, topN),
            LlmUsage.aggregate("model", from, to, topN),
            LlmUsage.aggregate("provider", from, to, topN),
            fetchOpenRouterCredits(),
          ]);

        return response.status(200).json({
          window: { from: from.toISOString(), to: to.toISOString() },
          totals,
          credits,
          daily,
          byUser,
          byWorkspace,
          byModel,
          byProvider,
        });
      } catch (error) {
        console.error("[llmUsage] list failed:", error.message);
        return response
          .status(500)
          .json({ error: "Failed to load usage data." });
      }
    }
  );
}

module.exports = { llmUsageEndpoints };
