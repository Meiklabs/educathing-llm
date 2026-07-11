import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/SettingsSidebar";
import LlmUsageClient from "@/models/llmUsage";
import { isMobile } from "react-device-detect";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CurrencyDollar, Cube, Coins, Users } from "@phosphor-icons/react";

// CFT institutional red so the panel matches the DOCX/PDF branding.
const CFT_RED = "#A62933";
const CFT_GRAY = "#4A4A4A";

const nf = new Intl.NumberFormat("es-CL");
const uf = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});
function fmtCost(v) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return "n/d";
  return uf.format(Number(v));
}
function fmtInt(v) {
  return nf.format(Number(v) || 0);
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

const PRESETS = [
  { label: "Últimos 7 días", days: 7 },
  { label: "Últimos 30 días", days: 30 },
  { label: "Últimos 90 días", days: 90 },
];

function StatCard({ title, value, subtitle, Icon }) {
  return (
    <div className="flex-1 min-w-[180px] bg-theme-settings-input-bg rounded-lg border border-theme-modal-border p-4">
      <div className="flex items-center gap-2 text-theme-text-secondary text-xs uppercase tracking-wide">
        {Icon && <Icon size={14} />}
        {title}
      </div>
      <div className="text-2xl font-semibold text-theme-text-primary mt-1">
        {value}
      </div>
      {subtitle && (
        <div className="text-xs text-theme-text-secondary mt-1">{subtitle}</div>
      )}
    </div>
  );
}

function TopTable({ title, rows, valueLabel = "Costo" }) {
  return (
    <div className="bg-theme-settings-input-bg rounded-lg border border-theme-modal-border overflow-hidden">
      <div className="px-4 py-3 border-b border-theme-modal-border">
        <p className="text-sm font-semibold text-theme-text-primary">{title}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-theme-text-primary">
          <thead className="text-xs uppercase text-theme-text-secondary">
            <tr>
              <th className="px-4 py-2">#</th>
              <th className="px-4 py-2">Nombre</th>
              <th className="px-4 py-2 text-right">{valueLabel}</th>
              <th className="px-4 py-2 text-right">Tokens</th>
              <th className="px-4 py-2 text-right">Requests</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-theme-text-secondary">
                  Sin datos en el período.
                </td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr key={`${r.key ?? "null"}-${i}`} className="border-t border-theme-modal-border">
                <td className="px-4 py-2 text-theme-text-secondary">{i + 1}</td>
                <td className="px-4 py-2 font-medium">{r.name}</td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  {fmtCost(r.costUsd)}
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  {fmtInt(r.totalTokens)}
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  {fmtInt(r.requests)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-theme-bg-container border border-theme-modal-border rounded-md p-2 text-xs shadow-lg">
      <div className="text-theme-text-secondary">{label}</div>
      <div className="text-theme-text-primary">
        {payload.map((p) => (
          <div key={p.dataKey}>
            <span
              className="inline-block w-2 h-2 rounded-full mr-1"
              style={{ background: p.color }}
            />
            {p.dataKey === "costUsd"
              ? `${fmtCost(p.value)}`
              : `${fmtInt(p.value)} ${p.dataKey === "totalTokens" ? "tokens" : "reqs"}`}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function LlmUsagePage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const to = new Date();
      const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
      const res = await LlmUsageClient.summary({
        from: from.toISOString(),
        to: to.toISOString(),
        topN: 10,
      });
      if (cancelled) return;
      setData(res);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [days]);

  const remainingPct = useMemo(() => {
    if (!data?.credits) return null;
    const { totalCredits, remaining } = data.credits;
    if (!totalCredits || totalCredits <= 0) return null;
    return Math.max(0, Math.min(100, (remaining / totalCredits) * 100));
  }, [data]);

  const totals = data?.totals ?? {
    totalCostUsd: 0,
    totalTokens: 0,
    totalRequests: 0,
  };
  const credits = data?.credits ?? null;
  const daily = data?.daily ?? [];

  // Recharts needs day labels short (dd/MM).
  const dailyForChart = daily.map((d) => ({
    ...d,
    day: (() => {
      const parts = d.day.split("-");
      return `${parts[2]}/${parts[1]}`;
    })(),
  }));

  return (
    <div className="w-screen h-screen overflow-hidden bg-theme-bg-container flex">
      <Sidebar />
      <div
        style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
        className="relative md:ml-[2px] md:mr-[16px] md:my-[16px] md:rounded-[16px] bg-theme-bg-secondary w-full h-full overflow-y-scroll p-4 md:p-8"
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
          <div>
            <p className="text-lg leading-6 font-bold text-theme-text-primary">
              Consumo de IA
            </p>
            <p className="text-xs leading-[18px] font-base text-theme-text-secondary">
              Consumo por período, con desglose por usuario, carrera y modelo.
              Panel simple de consumo requerido por la ficha técnica.
            </p>
          </div>
          <div className="flex gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.days}
                type="button"
                onClick={() => setDays(p.days)}
                className={`px-3 py-1.5 text-sm rounded-md border ${
                  days === p.days
                    ? "border-transparent text-white"
                    : "bg-theme-settings-input-bg text-theme-text-primary border-theme-modal-border"
                }`}
                style={days === p.days ? { background: CFT_RED } : undefined}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {loading && (
          <p className="text-sm text-theme-text-secondary">Cargando…</p>
        )}

        {!loading && (
          <div className="flex flex-col gap-6">
            {/* Stat cards */}
            <div className="flex flex-wrap gap-3">
              <StatCard
                title="Saldo OpenRouter"
                value={credits ? fmtCost(credits.remaining) : "n/d"}
                subtitle={
                  credits
                    ? `${fmtCost(credits.totalUsage)} usado de ${fmtCost(credits.totalCredits)}`
                    : "Sin key o sin datos"
                }
                Icon={Coins}
              />
              <StatCard
                title="Gasto en período"
                value={fmtCost(totals.totalCostUsd)}
                subtitle={`${PRESETS.find((p) => p.days === days)?.label ?? "período"}`}
                Icon={CurrencyDollar}
              />
              <StatCard
                title="Tokens totales"
                value={fmtInt(totals.totalTokens)}
                subtitle={`${fmtInt(totals.totalRequests)} requests`}
                Icon={Cube}
              />
              <StatCard
                title="Usuarios activos"
                value={fmtInt(data?.byUser?.length ?? 0)}
                subtitle="con actividad en el período"
                Icon={Users}
              />
            </div>

            {/* Balance progress if we know credits */}
            {credits && remainingPct !== null && (
              <div className="bg-theme-settings-input-bg rounded-lg border border-theme-modal-border p-4">
                <div className="flex justify-between text-xs text-theme-text-secondary mb-2">
                  <span>Saldo OpenRouter restante</span>
                  <span>{remainingPct.toFixed(1)}%</span>
                </div>
                <div className="h-2 rounded-full bg-theme-bg-container overflow-hidden">
                  <div
                    className="h-full transition-all"
                    style={{ width: `${remainingPct}%`, background: CFT_RED }}
                  />
                </div>
              </div>
            )}

            {/* Daily chart */}
            <div className="bg-theme-settings-input-bg rounded-lg border border-theme-modal-border p-4">
              <p className="text-sm font-semibold text-theme-text-primary mb-3">
                Consumo diario (USD)
              </p>
              <div style={{ width: "100%", height: 260 }}>
                <ResponsiveContainer>
                  <AreaChart data={dailyForChart} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="cftGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CFT_RED} stopOpacity={0.4} />
                        <stop offset="100%" stopColor={CFT_RED} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={CFT_GRAY} opacity={0.15} />
                    <XAxis dataKey="day" stroke={CFT_GRAY} fontSize={11} />
                    <YAxis stroke={CFT_GRAY} fontSize={11} />
                    <Tooltip content={<ChartTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="costUsd"
                      stroke={CFT_RED}
                      fill="url(#cftGradient)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Top-N tables */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <TopTable title="Top usuarios" rows={data?.byUser ?? []} />
              <TopTable title="Top carreras" rows={data?.byWorkspace ?? []} />
              <TopTable title="Top modelos" rows={data?.byModel ?? []} />
              <TopTable title="Top proveedores" rows={data?.byProvider ?? []} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
