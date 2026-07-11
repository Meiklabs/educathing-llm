import { useEffect, useMemo, useState } from "react";
import Library from "@/models/library";
import StorageFiles from "@/models/files";
import { userFromStorage } from "@/utils/request";
import { isMobile } from "react-device-detect";
import showToast from "@/utils/toast";
import {
  FileDoc,
  FilePdf,
  FileXls,
  FilePpt,
  FileText,
  DownloadSimple,
  Trash,
  MagnifyingGlass,
} from "@phosphor-icons/react";

/**
 * Human-friendly labels for the docType filter (RF-03/04/05/07).
 * Kept in sync with server/models/generatedDocument.js VALID_DOC_TYPES.
 */
const DOC_TYPE_LABELS = {
  programa: "Programa de módulo",
  plan: "Plan de estudio",
  asesoria: "Asesoría curricular",
  informe: "Informe de seguimiento",
};

const FILE_TYPE_LABELS = {
  docx: "Word (.docx)",
  pdf: "PDF (.pdf)",
  xlsx: "Excel (.xlsx)",
  pptx: "PowerPoint (.pptx)",
  txt: "Texto (.txt)",
  text: "Texto",
};

function FileIcon({ fileType, size = 20 }) {
  const props = { size, weight: "regular" };
  switch (fileType) {
    case "docx":
      return <FileDoc {...props} />;
    case "pdf":
      return <FilePdf {...props} />;
    case "xlsx":
      return <FileXls {...props} />;
    case "pptx":
      return <FilePpt {...props} />;
    default:
      return <FileText {...props} />;
  }
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
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
    });
  } catch {
    return String(iso);
  }
}

async function triggerDownload(doc) {
  const blob = await StorageFiles.download(doc.storageFilename);
  if (!blob) {
    showToast("No se pudo descargar el documento.", "error");
    return;
  }
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = doc.displayFilename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}

export default function LibraryPage() {
  const [state, setState] = useState({
    documents: [],
    workspaces: [],
    total: 0,
    page: 1,
    pageSize: 30,
    loading: true,
  });
  const [filters, setFilters] = useState({
    workspaceId: "",
    fileType: "",
    docType: "",
    q: "",
    page: 1,
  });

  const user = useMemo(() => userFromStorage(), []);
  const canDelete = user?.role === "admin" || user?.role === "manager";

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setState((s) => ({ ...s, loading: true }));
      const data = await Library.list({
        workspaceId: filters.workspaceId || null,
        fileType: filters.fileType || null,
        docType: filters.docType || null,
        q: filters.q || null,
        page: filters.page,
        pageSize: 30,
      });
      if (cancelled) return;
      setState({
        documents: data.documents || [],
        workspaces: data.workspaces || [],
        total: data.total || 0,
        page: data.page || 1,
        pageSize: data.pageSize || 30,
        loading: false,
      });
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [filters]);

  const totalPages = Math.max(
    1,
    Math.ceil(state.total / (state.pageSize || 30))
  );

  const onFilterChange = (key) => (e) => {
    setFilters((f) => ({ ...f, [key]: e.target.value, page: 1 }));
  };

  const onDelete = async (doc) => {
    if (
      !window.confirm(
        `¿Eliminar "${doc.displayFilename}" de la biblioteca? El archivo original se conserva en el servidor.`
      )
    ) {
      return;
    }
    const ok = await Library.softDelete(doc.id);
    if (!ok) {
      showToast("No se pudo eliminar.", "error");
      return;
    }
    showToast("Documento eliminado.", "success");
    setFilters((f) => ({ ...f })); // trigger reload
  };

  return (
    <div className="w-screen h-screen overflow-hidden bg-theme-bg-container flex">
      <div
        style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
        className="relative md:mx-[16px] md:my-[16px] md:rounded-[16px] bg-theme-bg-secondary w-full h-full overflow-y-scroll p-4 md:p-8"
      >
        <div className="w-full flex flex-col gap-y-1 mb-6">
          <div className="items-center flex gap-x-4">
            <p className="text-lg leading-6 font-bold text-theme-text-primary">
              Biblioteca de documentos
            </p>
          </div>
          <p className="text-xs leading-[18px] font-base text-theme-text-secondary">
            Documentos generados por el asistente para cada carrera. Filtrá por
            carrera y tipo, y descargá en Word o PDF.
          </p>
        </div>

        {/* Filter row */}
        <div className="flex flex-col md:flex-row gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <MagnifyingGlass
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-text-secondary"
            />
            <input
              type="search"
              placeholder="Buscar por título o nombre de archivo…"
              value={filters.q}
              onChange={onFilterChange("q")}
              className="w-full pl-9 pr-3 py-2 text-sm bg-theme-settings-input-bg text-theme-text-primary rounded-lg border border-theme-modal-border focus:outline-none focus:ring-1 focus:ring-primary-button"
            />
          </div>
          <select
            value={filters.workspaceId}
            onChange={onFilterChange("workspaceId")}
            className="px-3 py-2 text-sm bg-theme-settings-input-bg text-theme-text-primary rounded-lg border border-theme-modal-border focus:outline-none focus:ring-1 focus:ring-primary-button"
          >
            <option value="">Todas las carreras</option>
            {state.workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <select
            value={filters.docType}
            onChange={onFilterChange("docType")}
            className="px-3 py-2 text-sm bg-theme-settings-input-bg text-theme-text-primary rounded-lg border border-theme-modal-border focus:outline-none focus:ring-1 focus:ring-primary-button"
          >
            <option value="">Todos los tipos</option>
            {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select
            value={filters.fileType}
            onChange={onFilterChange("fileType")}
            className="px-3 py-2 text-sm bg-theme-settings-input-bg text-theme-text-primary rounded-lg border border-theme-modal-border focus:outline-none focus:ring-1 focus:ring-primary-button"
          >
            <option value="">Todos los formatos</option>
            {Object.entries(FILE_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-lg border border-theme-modal-border">
          <table className="w-full text-sm text-left text-theme-text-primary">
            <thead className="text-xs uppercase bg-theme-settings-input-bg text-theme-text-secondary">
              <tr>
                <th scope="col" className="px-4 py-3">Documento</th>
                <th scope="col" className="px-4 py-3">Carrera</th>
                <th scope="col" className="px-4 py-3">Tipo</th>
                <th scope="col" className="px-4 py-3">Generado por</th>
                <th scope="col" className="px-4 py-3">Fecha</th>
                <th scope="col" className="px-4 py-3">Tamaño</th>
                <th scope="col" className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {state.loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-theme-text-secondary">
                    Cargando…
                  </td>
                </tr>
              )}
              {!state.loading && state.documents.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-theme-text-secondary">
                    No se encontraron documentos con los filtros aplicados.
                  </td>
                </tr>
              )}
              {!state.loading &&
                state.documents.map((doc) => (
                  <tr
                    key={doc.id}
                    className="border-t border-theme-modal-border hover:bg-theme-settings-input-bg/40"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <FileIcon fileType={doc.fileType} />
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {doc.title || doc.displayFilename}
                          </span>
                          <span className="text-xs text-theme-text-secondary">
                            {doc.displayFilename}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">{doc.workspace?.name || "—"}</td>
                    <td className="px-4 py-3">
                      {doc.docType ? DOC_TYPE_LABELS[doc.docType] : "—"}
                    </td>
                    <td className="px-4 py-3">{doc.user?.username || "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatDate(doc.createdAt)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatBytes(doc.fileSize)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => triggerDownload(doc)}
                          className="p-2 rounded-md hover:bg-theme-settings-input-bg text-theme-text-primary"
                          title="Descargar"
                        >
                          <DownloadSimple size={18} />
                        </button>
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => onDelete(doc)}
                            className="p-2 rounded-md hover:bg-red-500/10 text-red-500"
                            title="Eliminar de la biblioteca"
                          >
                            <Trash size={18} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {state.total > state.pageSize && (
          <div className="flex items-center justify-between mt-4 text-xs text-theme-text-secondary">
            <span>
              Página {state.page} de {totalPages} · {state.total} documento
              {state.total === 1 ? "" : "s"}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={state.page <= 1}
                onClick={() =>
                  setFilters((f) => ({ ...f, page: Math.max(1, f.page - 1) }))
                }
                className="px-3 py-1 rounded-md bg-theme-settings-input-bg disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={state.page >= totalPages}
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
