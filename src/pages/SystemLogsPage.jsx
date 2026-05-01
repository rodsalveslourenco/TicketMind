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

const FIELD_LABELS = {
  name: "nome",
  email: "email",
  role: "perfil",
  team: "equipe",
  department: "departamento",
  status: "status",
  permissionProfileId: "perfil de permissao",
  permissions: "permissoes",
  additionalPermissions: "permissoes adicionais",
  restrictedPermissions: "restricoes de permissao",
  code: "codigo",
  departmentId: "departamento vinculado",
  description: "descricao",
  smtpSettings: "configuracao SMTP",
  emailServiceSettings: "servico de e-mail",
  apiConfigs: "integracoes de API",
  emailLayouts: "layouts de e-mail",
  departments: "departamentos",
  navigationSections: "menus e navegacao",
  active: "ativo",
  recipientUserIds: "destinatarios internos",
  externalEmails: "destinatarios externos",
  layoutId: "layout vinculado",
};

const MODULE_LABELS = {
  autenticacao: "Autenticacao",
  seguranca: "Seguranca",
  usuarios: "Usuarios",
  localizacoes: "Localizacoes",
  perfis: "Perfis de permissao",
  configuracoes: "Configuracoes",
  chamados: "Chamados",
  notificacoes: "Notificacoes",
};

const EVENT_LABELS = {
  erro: "Erro",
  falha: "Falha",
  inclusao: "Criacao",
  alteracao: "Alteracao",
  exclusao: "Exclusao",
  login: "Login",
  permissao: "Permissao",
  chamado: "Chamado",
  notificacao: "Notificacao",
  configuracao: "Configuracao",
};

const STATUS_LABELS = {
  sucesso: "Sucesso",
  alerta: "Atencao",
  erro: "Erro",
};

function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

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

function formatTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatFieldLabel(field) {
  return FIELD_LABELS[field] || String(field || "").replace(/([A-Z])/g, " $1").toLowerCase().trim();
}

function formatModuleLabel(module) {
  return MODULE_LABELS[module] || String(module || "").trim() || "-";
}

function formatEventLabel(eventType) {
  return EVENT_LABELS[eventType] || String(eventType || "").trim() || "-";
}

function formatStatusLabel(status) {
  return STATUS_LABELS[status] || String(status || "").trim() || "-";
}

function summarizeChangeList(changes = []) {
  const labels = changes.map((change) => formatFieldLabel(change.field)).filter(Boolean);
  if (!labels.length) return "";
  return `Campos alterados: ${labels.join(", ")}.`;
}

function summarizeMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") return "";
  if (Array.isArray(metadata.changes) && metadata.changes.length) {
    return summarizeChangeList(metadata.changes);
  }
  if (Array.isArray(metadata) && metadata.length && metadata[0]?.field) {
    return summarizeChangeList(metadata);
  }
  if (metadata.reason === "user_inactive") {
    return "Tentativa bloqueada porque o usuario esta inativo.";
  }
  if (metadata.reason === "invalid_credentials") {
    return "Tentativa rejeitada por credenciais invalidas.";
  }
  if (metadata.route || metadata.method) {
    return `Origem tecnica: ${String(metadata.method || "").toUpperCase()} ${metadata.route || ""}`.trim();
  }
  if (metadata.field && Array.isArray(metadata.changes) && metadata.changes.length) {
    return `Configuracao afetada: ${formatFieldLabel(metadata.field)}. ${summarizeChangeList(metadata.changes)}`;
  }
  if (metadata.action === "create") return "Registro criado.";
  if (metadata.action === "update") return "Registro atualizado.";
  if (metadata.action === "delete") return "Registro removido.";
  if (metadata.action === "permissions") return "Permissoes revisadas.";
  return "";
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
    startDate: getTodayDateString(),
    endDate: getTodayDateString(),
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
      startDate: getTodayDateString(),
      endDate: getTodayDateString(),
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
          <p className="module-caption">Resumo legivel das acoes de hoje, com foco em quem fez, o que ocorreu e se houve alerta.</p>
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
            <span>A tela abre mostrando os eventos de hoje. Use os filtros para investigar periodos anteriores.</span>
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
              <input className="toolbar-search" onChange={updateFilter("search")} placeholder="Usuario, modulo ou descricao do ocorrido" value={filters.search} />
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
            <span>{loading ? "Carregando registros..." : `${logs.length} ocorrencias nesta pagina`}</span>
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
                    <strong>{formatTime(entry.occurredAt)}</strong>
                    <span className={`badge ${getStatusBadgeClass(entry.status)}`}>{formatStatusLabel(entry.status)}</span>
                    <span className="badge badge-neutral">{formatEventLabel(entry.eventType)}</span>
                    <span className="badge badge-neutral">{formatModuleLabel(entry.module)}</span>
                  </div>
                  <p className="system-log-description">{entry.description}</p>
                  <div className="row-stats row-stats-wrap">
                    <span>{entry.userName || "Sistema"}</span>
                    <span>{entry.userDepartment || "Sem departamento"}</span>
                    <span>{formatDateTime(entry.occurredAt)}</span>
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
