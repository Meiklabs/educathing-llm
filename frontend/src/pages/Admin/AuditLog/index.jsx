import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/SettingsSidebar";
import AuditLogClient from "@/models/auditLog";
import { isMobile } from "react-device-detect";
import {
  FileArrowDown,
  Sparkle,
  Trash,
  Question,
} from "@phosphor-icons/react";

/**
 * Human-friendly Spanish labels for the whitelisted action strings.
 * Kept in sync with server/models/auditLog.js ACTIONS.
 */
const ACTION_LABELS = {
  document_generated: {
    label: "Documento generado",
    icon: Sparkle,
    tint: "text-emerald-500",
  },
  document_downloaded: {
    label: "Documento descargado",
    icon: FileArrowDown,
    tint: "text-blue-500",
  },
  document_deleted: {
    label: "Documento eliminado",
    icon: Trash,
    tint: "text-red-500",
  },
};

function actionMeta(action) {
  return (
    ACTION_LABELS[action] ?? {
      label: action,
      icon: Question,
      tint: "text-theme-text-secondary",
    }
  );
}

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-CL", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return String(iso);
  }
}

function summarizeMetadata(entry) {
  const md = entry.metadata;
  if (!md || typeof md !== "object") return null;
  const parts = [];
  if (md.displayFilename) parts.push(md.displayFilename);
  if (md.workspaceId) parts.push(`carrera #${md.workspaceId}`);
  if (md.docType) parts.push(md.docType);
  if (md.fileType) parts.push(`.${md.fileType}`);
  return parts.length ? parts.join(" · ") : null;
}

export default function AuditLogPage() {
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [availableActions, setAvailableActions] = useState([]);
  const [filters, setFilters] = useState({
    action: "",
    userId: "",
    from: "",
    to: "",
    page: 1,
  });
  const pageSize = 50;

  useEffect(() => {
    (async () => {
      setAvailableActions(await AuditLogClient.actions());
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const data = await AuditLogClient.list({
        action: filters.action || null,
        userId: filters.userId || null,
        from: filters.from || null,
        to: filters.to || null,
        page: filters.page,
        pageSize,
      });
      if (cancelled) return;
      setEntries(data.entries || []);
      setTotal(data.total || 0);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [filters]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / pageSize)),
    [total]
  );

  const onFilterChange = (key) => (e) => {
    setFilters((f) => ({ ...f, [key]: e.target.value, page: 1 }));
  };

  return (
    <div className="w-screen h-screen overflow-hidden bg-theme-bg-container flex">
      <Sidebar />
      <div
        style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
        className="relative md:ml-[2px] md:mr-[16px] md:my-[16px] md:rounded-[16px] bg-theme-bg-secondary w-full h-full overflow-y-scroll p-4 md:p-8"
      >
        <div className="w-full flex flex-col gap-y-1 mb-6">
          <p className="text-lg leading-6 font-bold text-theme-text-primary">
            Auditoría de documentos
          </p>
          <p className="text-xs leading-[18px] font-base text-theme-text-secondary">
            Registro de generación, descarga y eliminación de documentos por
            usuario, con IP de origen. Requisito RF-09 de trazabilidad.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-3 mb-4">
          <select
            value={filters.action}
            onChange={onFilterChange("action")}
            className="px-3 py-2 text-sm bg-theme-settings-input-bg text-theme-text-primary rounded-lg border border-theme-modal-border focus:outline-none focus:ring-1 focus:ring-primary-button"
          >
            <option value="">Todas las acciones</option>
            {availableActions.map((a) => (
              <option key={a} value={a}>
                {actionMeta(a).label}
              </option>
            ))}
          </select>
          <input
            type="number"
            min="1"
            placeholder="ID de usuario"
            value={filters.userId}
            onChange={onFilterChange("userId")}
            className="px-3 py-2 text-sm bg-theme-settings-input-bg text-theme-text-primary rounded-lg border border-theme-modal-border focus:outline-none focus:ring-1 focus:ring-primary-button w-40"
          />
          <input
            type="date"
            value={filters.from}
            onChange={onFilterChange("from")}
            className="px-3 py-2 text-sm bg-theme-settings-input-bg text-theme-text-primary rounded-lg border border-theme-modal-border focus:outline-none focus:ring-1 focus:ring-primary-button"
          />
          <input
            type="date"
            value={filters.to}
            onChange={onFilterChange("to")}
            className="px-3 py-2 text-sm bg-theme-settings-input-bg text-theme-text-primary rounded-lg border border-theme-modal-border focus:outline-none focus:ring-1 focus:ring-primary-button"
          />
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-lg border border-theme-modal-border">
          <table className="w-full text-sm text-left text-theme-text-primary">
            <thead className="text-xs uppercase bg-theme-settings-input-bg text-theme-text-secondary">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Acción</th>
                <th className="px-4 py-3">Usuario</th>
                <th className="px-4 py-3">Documento</th>
                <th className="px-4 py-3">IP</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-theme-text-secondary">
                    Cargando…
                  </td>
                </tr>
              )}
              {!loading && entries.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-theme-text-secondary">
                    No hay eventos registrados con los filtros aplicados.
                  </td>
                </tr>
              )}
              {!loading &&
                entries.map((row) => {
                  const meta = actionMeta(row.action);
                  const Icon = meta.icon;
                  const summary = summarizeMetadata(row);
                  return (
                    <tr
                      key={row.id}
                      className="border-t border-theme-modal-border hover:bg-theme-settings-input-bg/40 align-top"
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-theme-text-secondary">
                        {formatDate(row.createdAt)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-2">
                          <Icon size={16} className={meta.tint} />
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {row.user ? (
                          <span className="flex flex-col">
                            <span className="font-medium">
                              {row.user.username}
                            </span>
                            <span className="text-xs text-theme-text-secondary">
                              {row.user.role}
                            </span>
                          </span>
                        ) : (
                          <span className="text-theme-text-secondary">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {summary ? (
                          <span className="text-xs">{summary}</span>
                        ) : (
                          <span className="text-theme-text-secondary">—</span>
                        )}
                        {row.entityId && (
                          <div className="text-[10px] text-theme-text-secondary">
                            id: {row.entityId}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs">
                        {row.ipAddress || "—"}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > pageSize && (
          <div className="flex items-center justify-between mt-4 text-xs text-theme-text-secondary">
            <span>
              Página {filters.page} de {totalPages} · {total} evento
              {total === 1 ? "" : "s"}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={filters.page <= 1}
                onClick={() =>
                  setFilters((f) => ({ ...f, page: Math.max(1, f.page - 1) }))
                }
                className="px-3 py-1 rounded-md bg-theme-settings-input-bg disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={filters.page >= totalPages}
                onClick={() =>
                  setFilters((f) => ({
                    ...f,
                    page: Math.min(totalPages, f.page + 1),
                  }))
                }
                className="px-3 py-1 rounded-md bg-theme-settings-input-bg disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
