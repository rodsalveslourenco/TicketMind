import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useAppData } from "../data/AppDataContext";
import { hasAnyPermission, isTechnologyDepartment } from "../data/permissions";
import { requestJson } from "../lib/api";

const eventTypeOptions = [
  "erro",
  "falha",
  "inclusao",
  "alteracao",
  "exclusao",
  "login",
  "permissao",
  "chamado",
  "notificacao",
  "configuracao",
];

const statusOptions = ["sucesso", "alerta", "erro"];

function toDateInputValue(value) {
  return value ? String(value).slice(0, 10) : "";
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
}

function summarizeMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") return "";
  const entries = Object.entries(metadata)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`);
  return entries.join(" | ");
}

function buildQueryString(filters, page, limit) {
  const params = new URLSearchParams();
  Object.entries({
    startDate: filters.startDate,
    endDate: filters.endDate,
    user: filters.user,
    department: filters.department,
    module: filters.module,
    eventType: filters.eventType,
    status: filters.status,
    search: filters.search,
    page: String(page),
    limit: String(limit),
  }).forEach(([key, value]) => {
    if (String(value || "").trim()) params.set(key, value);
  });
  return params.toString();
}

function getStatusBadgeClass(status) {
  if (status === "sucesso") return "status-badge-resolvido";
  if (status === "alerta") return "status-badge-aguardando";
  if (status === "erro") return "status-badge-reaberto";
  return "badge-neutral";
}

function SystemLogsPage() {
  const { user } = useAuth();
  const { departments, pushToast, users } = useAppData();
  const [filters, setFilters] = useState({
    startDate: "",
    endDate: "",
    user: "",
    department: "",
    module: "",
    eventType: "",
    status: "",
    search: "",
  });
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);

  const canViewLogs = isTechnologyDepartment(user) && hasAnyPermission(user, ["system_logs_view"]);

  const availableUsers = useMemo(() => users.slice().sort((left, right) => left.name.localeCompare(right.name)), [users]);
  const availableDepartments = useMemo(
    () => departments.slice().sort((left, right) => left.name.localeCompare(right.name)),
    [departments],
  );
  const moduleOptions = useMemo(
    () =>
      Array.from(new Set(logs.map((entry) => entry.module).filter(Boolean)))
        .sort((left, right) => left.localeCompare(right)),
    [logs],
  );
  const loginEvents = logs.filter((entry) => entry.eventType === "login").length;
  const permissionEvents = logs.filter((entry) => entry.eventType === "permissao").length;
  const settingsEvents = logs.filter((entry) => entry.eventType === "configuracao").length;

  useEffect(() => {
    if (!canViewLogs) return undefined;

    let cancelled = false;
    setLoading(true);

    const timeoutId = window.setTimeout(async () => {
      try {
        const queryString = buildQueryString(filters, pagination.page, pagination.limit);
        const payload = await requestJson(`/api/system-logs?${queryString}`);
        if (cancelled) return;
        setLogs(Array.isArray(payload?.items) ? payload.items : []);
        setPagination((current) => ({
          ...current,
          ...(payload?.pagination || {}),
        }));
      } catch (error) {
        if (cancelled) return;
        setLogs([]);
        pushToast("Falha ao carregar logs", error.message, "warning");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [canViewLogs, filters, pagination.page, pagination.limit]);

  if (!canViewLogs) {
    return <Navigate replace to="/app/dashboard" />;
  }

  const updateFilter = (field) => (event) => {
    const value = event.target.value;
    setFilters((current) => ({ ...current, [field]: value }));
    setPagination((current) => ({ ...current, page: 1 }));
  };

  const handleClearFilters = () => {
    setFilters({
      startDate: "",
      endDate: "",
      user: "",
      department: "",
      module: "",
      eventType: "",
      status: "",
      search: "",
    });
    setPagination((current) => ({ ...current, page: 1 }));
  };

  return (
    <div className="ticket-page system-logs-page">
      <section className="module-hero board-card">
        <div>
          <span className="eyebrow">Configuracoes</span>
          <h2>Auditoria e Acessos</h2>
          <p className="module-caption">Rastreia logins, permissoes, falhas operacionais e mudancas sensiveis com origem e contexto.</p>
        </div>
        <div className="insight-strip">
          <div className="insight-chip">
            <strong>{pagination.total}</strong>
            <span>eventos encontrados</span>
          </div>
          <div className="insight-chip">
            <strong>{loginEvents}</strong>
            <span>eventos de login</span>
          </div>
          <div className="insight-chip">
            <strong>{permissionEvents}</strong>
            <span>alteracoes de acesso</span>
          </div>
          <div className="insight-chip">
            <strong>{settingsEvents}</strong>
            <span>mudancas de configuracao</span>
          </div>
        </div>
      </section>

      <section className="board-card glpi-panel">
        <div className="glpi-toolbar">
          <div>
            <h2>Filtros e busca</h2>
            <span>Os resultados priorizam acesso, seguranca e alteracoes sensiveis em ordem cronologica reversa.</span>
          </div>
          <div className="toolbar">
            <button className="ghost-button interactive-button" onClick={handleClearFilters} type="button">
              Limpar filtros
            </button>
          </div>
        </div>

        <div className="dashboard-filter-shell compact-filter-shell">
          <div className="dashboard-filter-grid system-logs-filter-grid">
            <label>
              <span>Busca geral</span>
              <input className="toolbar-search" onChange={updateFilter("search")} placeholder="Usuario, modulo, origem, rota ou descricao" value={filters.search} />
            </label>
            <label>
              <span>Periodo inicial</span>
              <input onChange={updateFilter("startDate")} type="date" value={toDateInputValue(filters.startDate)} />
            </label>
            <label>
              <span>Periodo final</span>
              <input onChange={updateFilter("endDate")} type="date" value={toDateInputValue(filters.endDate)} />
            </label>
            <label>
              <span>Usuario</span>
              <select onChange={updateFilter("user")} value={filters.user}>
                <option value="">Todos</option>
                {availableUsers.map((candidate) => (
                  <option key={candidate.id} value={candidate.name}>
                    {candidate.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Departamento</span>
              <select onChange={updateFilter("department")} value={filters.department}>
                <option value="">Todos</option>
                {availableDepartments.map((department) => (
                  <option key={department.id} value={department.name}>
                    {department.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Modulo</span>
              <select onChange={updateFilter("module")} value={filters.module}>
                <option value="">Todos</option>
                {moduleOptions.map((moduleName) => (
                  <option key={moduleName} value={moduleName}>
                    {moduleName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Tipo do evento</span>
              <select onChange={updateFilter("eventType")} value={filters.eventType}>
                <option value="">Todos</option>
                {eventTypeOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Status</span>
              <select onChange={updateFilter("status")} value={filters.status}>
                <option value="">Todos</option>
                {statusOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </section>

      <section className="board-card glpi-panel">
        <div className="glpi-toolbar">
          <div>
            <h2>Eventos registrados</h2>
            <span>{loading ? "Carregando registros..." : `${logs.length} itens nesta pagina`}</span>
          </div>
          <div className="toolbar">
            <label className="system-logs-page-size">
              <span>Itens por pagina</span>
              <select
                onChange={(event) =>
                  setPagination((current) => ({
                    ...current,
                    limit: Number(event.target.value) || 25,
                    page: 1,
                  }))
                }
                value={pagination.limit}
              >
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
              </select>
            </label>
          </div>
        </div>

        <div className="table-list">
          {logs.length ? (
            logs.map((entry) => (
              <article className="table-row system-log-row" key={entry.id}>
                <div className="system-log-main">
                  <div className="system-log-head">
                    <strong>{formatDateTime(entry.occurredAt)}</strong>
                    <span className={`badge ${getStatusBadgeClass(entry.status)}`}>{entry.status}</span>
                    <span className="badge badge-neutral">{entry.eventType}</span>
                    <span className="badge badge-neutral">{entry.module}</span>
                  </div>
                  <p className="system-log-description">{entry.description}</p>
                  <div className="row-stats row-stats-wrap">
                    <span>{entry.userName || "Sistema"}</span>
                    <span>{entry.userDepartment || "-"}</span>
                    <span>{entry.origin || "-"}</span>
                  </div>
                  {summarizeMetadata(entry.metadata) ? (
                    <p className="system-log-metadata">{summarizeMetadata(entry.metadata)}</p>
                  ) : null}
                </div>
              </article>
            ))
          ) : (
            <div className="empty-state">
              <strong>{loading ? "Consultando logs..." : "Nenhum log encontrado."}</strong>
              <span>Ajuste os filtros para localizar erros, acoes ou alteracoes especificas.</span>
            </div>
          )}
        </div>

        <div className="ticket-create-actions system-logs-pagination">
          <button
            className="ghost-button interactive-button"
            disabled={pagination.page <= 1 || loading}
            onClick={() => setPagination((current) => ({ ...current, page: current.page - 1 }))}
            type="button"
          >
            Pagina anterior
          </button>
          <span>
            Pagina {pagination.page} de {pagination.totalPages}
          </span>
          <button
            className="ghost-button interactive-button"
            disabled={pagination.page >= pagination.totalPages || loading}
            onClick={() => setPagination((current) => ({ ...current, page: current.page + 1 }))}
            type="button"
          >
            Proxima pagina
          </button>
        </div>
      </section>
    </div>
  );
}

export default SystemLogsPage;
