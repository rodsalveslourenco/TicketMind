import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import UserAutocomplete from "../components/UserAutocomplete";
import { useAuth } from "../auth/AuthContext";
import { canViewAllTickets as hasGlobalTicketView, hasAnyPermission } from "../data/permissions";
import { useAppData } from "../data/AppDataContext";

const defaultCreateForm = {
  title: "",
  type: "Incidente",
  location: "",
  urgency: "Media",
  impact: "Media",
  openedAt: new Date().toISOString(),
  dueDate: "",
  watchers: [],
  description: "",
  attachments: [],
};

const detailFields = [
  { key: "type", label: "Tipo", kind: "select" },
  { key: "status", label: "Status", kind: "select" },
  { key: "queue", label: "Fila", kind: "select" },
  { key: "requester", label: "Solicitante", kind: "input" },
  { key: "source", label: "Origem", kind: "select" },
  { key: "category", label: "Categoria", kind: "input" },
  { key: "location", label: "Localizacao", kind: "input" },
  { key: "urgency", label: "Urgencia", kind: "select" },
  { key: "impact", label: "Impacto", kind: "select" },
  { key: "dueDate", label: "Data limite", kind: "date" },
  { key: "openedAt", label: "Abertura", kind: "datetime" },
  { key: "watchers", label: "Observadores", kind: "input" },
  { key: "assignee", label: "Tecnico responsavel", kind: "assignee" },
];

const kanbanStatuses = ["Aberto", "Em atendimento", "Aguardando aprovacao", "Analise", "Resolvido"];

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve({
        id: `att-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        size: file.size,
        type: file.type || "application/octet-stream",
        url: reader.result,
      });
    reader.onerror = () => reject(new Error(`Falha ao anexar ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function formatBytes(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function toIsoOrEmpty(value) {
  return value ? new Date(value).toISOString() : "";
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function getPriorityBadgeClass(priority) {
  const normalized = normalizeText(priority);
  if (normalized === "critica") return "badge-critica";
  if (normalized === "alta") return "badge-alta";
  if (normalized === "baixa") return "badge-baixa";
  return "badge-neutral";
}

function getPriorityRowClass(priority) {
  const normalized = normalizeText(priority);
  if (normalized === "critica") return "priority-line-critica";
  if (normalized === "alta") return "priority-line-alta";
  if (normalized === "baixa") return "priority-line-baixa";
  return "priority-line-media";
}

function getFreshCreateForm() {
  return {
    ...defaultCreateForm,
    openedAt: new Date().toISOString(),
    watchers: [],
    attachments: [],
  };
}

function TicketsPage() {
  const {
    addTicketAttachments,
    createTicket,
    deleteTicket,
    pushToast,
    removeTicketAttachment,
    tickets,
    toLocalDatetimeInput,
    updateTicket,
    users,
  } = useAppData();
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState("list");
  const [filter, setFilter] = useState("Todos");
  const [search, setSearch] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState(getFreshCreateForm);
  const [watcherQuery, setWatcherQuery] = useState("");
  const [detailTicketId, setDetailTicketId] = useState(null);
  const [detailForm, setDetailForm] = useState(null);
  const createInputRef = useRef(null);
  const detailInputRef = useRef(null);
  const watcherBoxRef = useRef(null);

  const tiUsers = useMemo(
    () => users.filter((candidate) => normalizeText(candidate.department) === "ti"),
    [users],
  );

  const filteredTickets = useMemo(() => {
    let currentTickets = tickets;

    if (filter !== "Todos") {
      if (filter === "Proximos do SLA") {
        currentTickets = currentTickets.filter((ticket) => ticket.sla.toLowerCase().includes("min"));
      } else {
        const normalizedFilter = normalizeText(filter);
        currentTickets = currentTickets.filter(
          (ticket) =>
            normalizeText(ticket.type) === normalizedFilter ||
            normalizeText(ticket.status) === normalizedFilter,
        );
      }
    }

    const normalizedSearch = normalizeText(search);
    if (!normalizedSearch) return currentTickets;

    return currentTickets.filter((ticket) =>
      [
        ticket.id,
        ticket.title,
        ticket.requester,
        ticket.assignee,
        ticket.queue,
        ticket.status,
        ticket.priority,
      ].some((field) => normalizeText(field).includes(normalizedSearch)),
    );
  }, [filter, search, tickets]);

  const kanbanColumns = useMemo(
    () =>
      kanbanStatuses.map((status) => ({
        status,
        tickets: filteredTickets.filter((ticket) => ticket.status === status),
      })),
    [filteredTickets],
  );

  const detailTicket = tickets.find((ticket) => ticket.id === detailTicketId) ?? null;

  const watcherSuggestions = useMemo(() => {
    const query = normalizeText(watcherQuery);
    if (!query) return [];

    return users
      .filter((candidate) => candidate.id !== user?.id)
      .filter((candidate) => !createForm.watchers.some((watcher) => watcher.id === candidate.id))
      .filter((candidate) =>
        [candidate.name, candidate.email, candidate.team, candidate.department].some((value) =>
          normalizeText(value).includes(query),
        ),
      )
      .slice(0, 6);
  }, [createForm.watchers, user?.id, users, watcherQuery]);

  const canCreateTicket = hasAnyPermission(user, ["tickets_create", "tickets_admin"]);
  const canEditTicket = hasAnyPermission(user, ["tickets_edit", "tickets_admin"]);
  const canDeleteTicket = hasAnyPermission(user, ["tickets_delete", "tickets_admin"]);
  const canAssignTicket = hasAnyPermission(user, ["tickets_assign", "tickets_admin"]);
  const canChangePriority = hasAnyPermission(user, ["tickets_change_priority", "tickets_admin"]);
  const canChangeStatus = hasAnyPermission(user, ["tickets_change_status", "tickets_admin"]);
  const canManageAttachments = hasAnyPermission(user, ["tickets_edit", "tickets_admin"]);
  const canSeeAllTickets = hasGlobalTicketView(user);

  if (!hasAnyPermission(user, ["tickets_view_own", "tickets_view_all", "tickets_admin"])) {
    return <Navigate replace to="/app/dashboard" />;
  }

  useEffect(() => {
    if (!detailTicket) {
      setDetailForm(null);
      return;
    }

    setDetailForm({
      title: detailTicket.title,
      description: detailTicket.description,
      resolutionNotes: detailTicket.resolutionNotes || "",
      type: detailTicket.type,
      status: detailTicket.status,
      queue: detailTicket.queue,
      requester: detailTicket.requester,
      assignee: detailTicket.assignee,
      source: detailTicket.source,
      category: detailTicket.category,
      location: detailTicket.location || "",
      urgency: detailTicket.urgency || "Media",
      impact: detailTicket.impact || "Media",
      openedAt: toLocalDatetimeInput(detailTicket.openedAt),
      dueDate: detailTicket.dueDate ? detailTicket.dueDate.slice(0, 10) : "",
      watchers: detailTicket.watchers || "",
    });
  }, [detailTicket, toLocalDatetimeInput]);

  useEffect(() => {
    if (!showCreateForm) return undefined;

    const handlePointerDown = (event) => {
      if (watcherBoxRef.current && !watcherBoxRef.current.contains(event.target)) {
        setWatcherQuery("");
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setShowCreateForm(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showCreateForm]);

  useEffect(() => {
    if (!detailTicketId) return undefined;

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setDetailTicketId(null);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [detailTicketId]);

  const updateCreateField = (field) => (event) =>
    setCreateForm((current) => ({ ...current, [field]: event.target.value }));

  const updateDetailField = (field) => (event) =>
    setDetailForm((current) => ({ ...current, [field]: event.target.value }));

  const handleCreateAttachments = async (event) => {
    const nextFiles = Array.from(event.target.files || []);
    if (!nextFiles.length) return;

    const attachments = await Promise.all(nextFiles.map(readFileAsDataUrl));
    setCreateForm((current) => ({
      ...current,
      attachments: [...current.attachments, ...attachments],
    }));
    event.target.value = "";
  };

  const handleOpenCreateModal = () => {
    setCreateForm(getFreshCreateForm());
    setWatcherQuery("");
    setShowCreateForm(true);
  };

  const handleCloseCreateModal = () => {
    setShowCreateForm(false);
    setWatcherQuery("");
    setCreateForm(getFreshCreateForm());
  };

  const handleAddWatcher = (candidate) => {
    setCreateForm((current) => ({
      ...current,
      watchers: [...current.watchers, candidate],
    }));
    setWatcherQuery("");
  };

  const handleRemoveWatcher = (watcherId) => {
    setCreateForm((current) => ({
      ...current,
      watchers: current.watchers.filter((watcher) => watcher.id !== watcherId),
    }));
  };

  const handleCreateSubmit = (event) => {
    event.preventDefault();
    if (!createForm.title || !user?.name || !createForm.description) return;

    createTicket({
      ...createForm,
      requester: user.name,
      requesterId: user.id,
      requesterEmail: user.email,
      queue: "Service Desk",
      category: "Geral",
      source: "Portal",
      watchers: createForm.watchers.map((watcher) => watcher.name).join(", "),
      assignee: "Triagem TI",
      openedAt: toIsoOrEmpty(createForm.openedAt) || new Date().toISOString(),
      dueDate: createForm.dueDate || "",
    });

    pushToast("Chamado aberto", createForm.title);
    handleCloseCreateModal();
  };

  const handleSaveTicket = (event) => {
    event.preventDefault();
    if (!detailTicket || !detailForm?.title || !detailForm?.requester) return;

    updateTicket(detailTicket.id, {
      ...detailForm,
      openedAt: toIsoOrEmpty(detailForm.openedAt),
      dueDate: detailForm.dueDate || "",
    });
    pushToast("Chamado atualizado", detailForm.title);
  };

  const handleDeleteTicket = () => {
    if (!detailTicket) return;
    deleteTicket(detailTicket.id);
    setDetailTicketId(null);
    pushToast("Chamado removido", detailTicket.title);
  };

  const handleDetailAttachments = async (event) => {
    const nextFiles = Array.from(event.target.files || []);
    if (!nextFiles.length || !detailTicket) return;

    const attachments = await Promise.all(nextFiles.map(readFileAsDataUrl));
    addTicketAttachments(detailTicket.id, attachments);
    pushToast("Anexos adicionados", `${attachments.length} arquivo(s) vinculados`);
    event.target.value = "";
  };

  return (
    <div className="ticket-page">
      <section className="module-hero board-card">
        <div>
          <span className="eyebrow">Chamados</span>
          <h2>Chamados</h2>
        </div>
        <div className="insight-strip">
          <div className="insight-chip">
            <strong>{tickets.length}</strong>
            <span>tickets registrados</span>
          </div>
          <div className="insight-chip">
            <strong>{tiUsers.length}</strong>
            <span>tecnicos de TI</span>
          </div>
          <div className="insight-chip">
            <strong>{filteredTickets.length}</strong>
            <span>itens no recorte atual</span>
          </div>
        </div>
        {!canSeeAllTickets ? <p className="module-caption">Visualizacao restrita aos seus proprios chamados.</p> : null}
      </section>

      <section className="board-card glpi-panel">
        <div className="glpi-toolbar">
          <div>
            <h2>Fila de chamados</h2>
          </div>
          <div className="toolbar">
            <div className="view-toggle">
              <button
                className={`filter-pill interactive-button${viewMode === "list" ? " is-active" : ""}`}
                onClick={() => setViewMode("list")}
                type="button"
              >
                Lista
              </button>
              <button
                className={`filter-pill interactive-button${viewMode === "kanban" ? " is-active" : ""}`}
                onClick={() => setViewMode("kanban")}
                type="button"
              >
                Kanban
              </button>
            </div>
            {canCreateTicket ? (
              <button className="primary-button interactive-button" onClick={handleOpenCreateModal} type="button">
                + Criar chamado
              </button>
            ) : null}
          </div>
        </div>

        <div className="toolbar glpi-filter-bar glpi-toolbar-stack">
          {["Todos", "Incidente", "Requisicao", "Aguardando aprovacao", "Proximos do SLA"].map((item) => (
            <button
              key={item}
              className={`filter-pill interactive-button${filter === item ? " is-active" : ""}`}
              onClick={() => setFilter(item)}
              type="button"
            >
              {item}
            </button>
          ))}
          <input
            className="toolbar-search"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por titulo, fila, solicitante ou tecnico"
            value={search}
          />
        </div>

        {viewMode === "list" ? (
          <div className="ticket-rows ticket-rows-wide">
            {filteredTickets.length ? (
              filteredTickets.map((ticket) => (
                <button
                  className={`ticket-row-card interactive-button ${getPriorityRowClass(ticket.priority)}`}
                  key={ticket.id}
                  onDoubleClick={() => setDetailTicketId(ticket.id)}
                  type="button"
                >
                  <div className="ticket-row-main">
                    <div className="ticket-row-title">
                      <strong>{ticket.id}</strong>
                      <h3>{ticket.title}</h3>
                    </div>
                    <div className="ticket-row-badges">
                      <span className={`badge ${getPriorityBadgeClass(ticket.priority)}`}>{ticket.priority}</span>
                      <span className="badge badge-neutral">{ticket.status}</span>
                    </div>
                  </div>
                  <div className="ticket-row-meta">
                    <span>{ticket.requester}</span>
                    <span>{ticket.queue}</span>
                    <span>{ticket.assignee}</span>
                    <span>{ticket.openedAtLabel}</span>
                  </div>
                </button>
              ))
            ) : (
              <div className="empty-state">
                <strong>Nenhum chamado encontrado.</strong>
                <span>Ajuste os filtros ou registre um novo chamado.</span>
              </div>
            )}
          </div>
        ) : (
          <div className="kanban-grid">
            {kanbanColumns.map((column) => (
              <section className="kanban-column" key={column.status}>
                <div className="kanban-column-header">
                  <strong>{column.status}</strong>
                  <span>{column.tickets.length}</span>
                </div>
                <div className="kanban-column-body">
                  {column.tickets.map((ticket) => (
                    <button
                      className={`kanban-card interactive-button ${getPriorityRowClass(ticket.priority)}`}
                      key={ticket.id}
                      onDoubleClick={() => setDetailTicketId(ticket.id)}
                      type="button"
                    >
                      <div className="ticket-top">
                        <strong>{ticket.id}</strong>
                        <span className={`badge ${getPriorityBadgeClass(ticket.priority)}`}>{ticket.priority}</span>
                      </div>
                      <h3>{ticket.title}</h3>
                      <div className="ticket-meta">
                        <span>{ticket.requester}</span>
                        <span>{ticket.assignee}</span>
                        <span>{ticket.sla}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </section>

      {showCreateForm ? (
        <div className="ticket-modal-backdrop" onClick={handleCloseCreateModal} role="presentation">
          <div
            className="ticket-modal board-card"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <form className="ticket-create-form glpi-ticket-form" onSubmit={handleCreateSubmit}>
              <div className="ticket-modal-header">
                <div className="form-section-header">
                  <strong>Abertura de chamado</strong>
                </div>
                <button className="ghost-button interactive-button" onClick={handleCloseCreateModal} type="button">
                  Fechar
                </button>
              </div>

              <div className="glpi-form-grid">
                <label className="field-block field-span-2">
                  <span>Titulo</span>
                  <input onChange={updateCreateField("title")} value={createForm.title} />
                </label>
                <label className="field-block">
                  <span>Tipo</span>
                  <select onChange={updateCreateField("type")} value={createForm.type}>
                    <option>Incidente</option>
                    <option>Requisicao</option>
                    <option>Problema</option>
                  </select>
                </label>
                <div className="field-block">
                  <span>Solicitante</span>
                  <div className="requester-stamp">
                    <strong>{user?.name || "Usuario nao identificado"}</strong>
                    <small>{user ? `${user.email} | ${user.role}` : "Faca login para registrar o solicitante."}</small>
                  </div>
                </div>
                <label className="field-block">
                  <span>Localizacao</span>
                  <input onChange={updateCreateField("location")} value={createForm.location} />
                </label>
                <label className="field-block">
                  <span>Urgencia</span>
                  <select onChange={updateCreateField("urgency")} value={createForm.urgency}>
                    <option>Baixa</option>
                    <option>Media</option>
                    <option>Alta</option>
                    <option>Critica</option>
                  </select>
                </label>
                <label className="field-block">
                  <span>Impacto</span>
                  <select onChange={updateCreateField("impact")} value={createForm.impact}>
                    <option>Baixa</option>
                    <option>Media</option>
                    <option>Alta</option>
                    <option>Critica</option>
                  </select>
                </label>
                <label className="field-block">
                  <span>Data e hora da abertura</span>
                  <input
                    onChange={updateCreateField("openedAt")}
                    type="datetime-local"
                    value={toLocalDatetimeInput(createForm.openedAt)}
                  />
                </label>
                <label className="field-block">
                  <span>Data limite</span>
                  <input onChange={updateCreateField("dueDate")} type="date" value={createForm.dueDate} />
                </label>
                <div className="field-block field-span-2" ref={watcherBoxRef}>
                  <span>Observadores</span>
                  <div className="watcher-picker">
                    <div className="watcher-chip-list">
                      {createForm.watchers.map((watcher) => (
                        <span className="watcher-chip" key={watcher.id}>
                          {watcher.name}
                          <button onClick={() => handleRemoveWatcher(watcher.id)} type="button">
                            x
                          </button>
                        </span>
                      ))}
                    </div>
                    <input
                      onChange={(event) => setWatcherQuery(event.target.value)}
                      placeholder="Comece a digitar nome, email ou equipe"
                      value={watcherQuery}
                    />
                    {watcherSuggestions.length ? (
                      <div className="watcher-suggestions">
                        {watcherSuggestions.map((candidate) => (
                          <button
                            className="watcher-suggestion interactive-button"
                            key={candidate.id}
                            onClick={() => handleAddWatcher(candidate)}
                            type="button"
                          >
                            <strong>{candidate.name}</strong>
                            <small>{candidate.email} | {candidate.team}</small>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
                <label className="field-block field-full">
                  <span>Descricao</span>
                  <textarea onChange={updateCreateField("description")} value={createForm.description} />
                </label>
              </div>

              <div className="attachment-toolbar glpi-subbar">
                <button
                  className="ghost-button interactive-button"
                  onClick={() => createInputRef.current?.click()}
                  type="button"
                >
                  Anexar arquivos
                </button>
                <input hidden multiple onChange={handleCreateAttachments} ref={createInputRef} type="file" />
                <span>{createForm.attachments.length} arquivo(s) selecionado(s)</span>
              </div>

              {createForm.attachments.length ? (
                <div className="attachment-list">
                  {createForm.attachments.map((attachment) => (
                    <div className="attachment-item" key={attachment.id}>
                      <strong>{attachment.name}</strong>
                      <span>{formatBytes(attachment.size)}</span>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="ticket-create-actions">
                <button className="primary-button interactive-button" type="submit">
                  Registrar chamado
                </button>
                <button className="ghost-button interactive-button" onClick={handleCloseCreateModal} type="button">
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {detailTicket && detailForm ? (
        <div className="ticket-modal-backdrop" onClick={() => setDetailTicketId(null)} role="presentation">
          <div
            className="ticket-modal ticket-modal-large board-card"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <form className="ticket-detail-form" onSubmit={handleSaveTicket}>
              <div className="ticket-modal-header">
                <div>
                  <h2>{detailTicket.id}</h2>
                  <span className="modal-subtitle">
                    Aberto em {detailTicket.openedAtLabel}
                    {detailTicket.dueDateLabel ? ` | limite ${detailTicket.dueDateLabel}` : ""}
                  </span>
                </div>
                <div className="ticket-detail-actions">
                  <button
                    className="ghost-button interactive-button"
                    onClick={() => setDetailTicketId(null)}
                    type="button"
                  >
                    Fechar
                  </button>
                  {canDeleteTicket ? (
                    <button className="danger-button interactive-button" onClick={handleDeleteTicket} type="button">
                      Excluir
                    </button>
                  ) : null}
                </div>
              </div>

              <label className="field-block field-full">
                <span>Titulo</span>
                <input disabled={!canEditTicket} onChange={updateDetailField("title")} value={detailForm.title} />
              </label>

              <div className="detail-grid">
                {detailFields.map((field) => (
                  <label className="field-block" key={field.key}>
                    <span>{field.label}</span>
                    {field.kind === "select" && field.key === "type" ? (
                      <select disabled={!canEditTicket} onChange={updateDetailField(field.key)} value={detailForm[field.key]}>
                        <option>Incidente</option>
                        <option>Requisicao</option>
                        <option>Problema</option>
                      </select>
                    ) : null}
                    {field.kind === "select" && field.key === "status" ? (
                      <select disabled={!canChangeStatus} onChange={updateDetailField(field.key)} value={detailForm[field.key]}>
                        <option>Aberto</option>
                        <option>Em atendimento</option>
                        <option>Aguardando aprovacao</option>
                        <option>Analise</option>
                        <option>Resolvido</option>
                      </select>
                    ) : null}
                    {field.kind === "select" && field.key === "queue" ? (
                      <select disabled={!canEditTicket} onChange={updateDetailField(field.key)} value={detailForm[field.key]}>
                        <option>Service Desk</option>
                        <option>Infraestrutura</option>
                        <option>Aplicacoes</option>
                        <option>Seguranca</option>
                      </select>
                    ) : null}
                    {field.kind === "select" && field.key === "source" ? (
                      <select disabled={!canEditTicket} onChange={updateDetailField(field.key)} value={detailForm[field.key]}>
                        <option>Portal</option>
                        <option>E-mail</option>
                        <option>Telefone</option>
                        <option>Monitoramento</option>
                      </select>
                    ) : null}
                    {field.kind === "select" && (field.key === "urgency" || field.key === "impact") ? (
                      <select disabled={!canChangePriority} onChange={updateDetailField(field.key)} value={detailForm[field.key]}>
                        <option>Baixa</option>
                        <option>Media</option>
                        <option>Alta</option>
                        <option>Critica</option>
                      </select>
                    ) : null}
                    {field.kind === "assignee" ? (
                      <UserAutocomplete
                        filterFn={(candidate) => normalizeText(candidate.department) === "ti"}
                        disabled={!canAssignTicket}
                        onChange={(nextValue) => setDetailForm((current) => ({ ...current, assignee: nextValue }))}
                        placeholder="Comece a digitar um tecnico de TI"
                        users={tiUsers}
                        value={detailForm.assignee || ""}
                      />
                    ) : null}
                    {field.kind === "input" ? (
                      <input
                        disabled={field.key === "assignee" ? !canAssignTicket : !canEditTicket}
                        onChange={updateDetailField(field.key)}
                        value={detailForm[field.key] || ""}
                      />
                    ) : null}
                    {field.kind === "date" ? (
                      <input disabled={!canEditTicket} onChange={updateDetailField(field.key)} type="date" value={detailForm[field.key] || ""} />
                    ) : null}
                    {field.kind === "datetime" ? (
                      <input
                        disabled={!canEditTicket}
                        onChange={updateDetailField(field.key)}
                        type="datetime-local"
                        value={detailForm[field.key] || ""}
                      />
                    ) : null}
                  </label>
                ))}
              </div>

              <div className="glpi-info-strip">
                <div>
                  <span>Prioridade calculada</span>
                  <strong>{detailTicket.priority}</strong>
                </div>
                <div>
                  <span>SLA</span>
                  <strong>{detailTicket.sla}</strong>
                </div>
                <div>
                  <span>Ultima atualizacao</span>
                  <strong>{detailTicket.updatedAt}</strong>
                </div>
              </div>

              <label className="field-block field-full">
                <span>Descricao</span>
                <textarea disabled={!canEditTicket} onChange={updateDetailField("description")} value={detailForm.description} />
              </label>

              <label className="field-block field-full">
                <span>Solucao / acompanhamento tecnico</span>
                <textarea disabled={!canEditTicket} onChange={updateDetailField("resolutionNotes")} value={detailForm.resolutionNotes} />
              </label>

              <div className="ticket-attachment-panel">
                <div className="attachment-toolbar glpi-subbar">
                  <div>
                    <strong>Anexos</strong>
                    <span>Prints, documentos e evidencias vinculadas ao chamado.</span>
                  </div>
                {canManageAttachments ? (
                  <button
                    className="ghost-button interactive-button"
                    onClick={() => detailInputRef.current?.click()}
                    type="button"
                  >
                    Adicionar anexos
                  </button>
                ) : null}
                  <input hidden multiple onChange={handleDetailAttachments} ref={detailInputRef} type="file" />
                </div>

                {detailTicket.attachments?.length ? (
                  <div className="attachment-list">
                    {detailTicket.attachments.map((attachment) => (
                      <div className="attachment-item attachment-item-actions" key={attachment.id}>
                        <div>
                          <strong>{attachment.name}</strong>
                          <span>{formatBytes(attachment.size)}</span>
                        </div>
                        <div className="attachment-actions">
                          <a className="ghost-link" download={attachment.name} href={attachment.url}>
                            Baixar
                          </a>
                          {canManageAttachments ? (
                            <button
                              className="ghost-link danger-link interactive-button"
                              onClick={() => {
                                removeTicketAttachment(detailTicket.id, attachment.id);
                                pushToast("Anexo removido", attachment.name);
                              }}
                              type="button"
                            >
                              Remover
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <strong>Nenhum anexo vinculado.</strong>
                    <span>Use o botao acima para anexar prints, PDFs, planilhas ou outros arquivos.</span>
                  </div>
                )}
              </div>

              <div className="ticket-create-actions">
                {canEditTicket ? (
                  <button className="primary-button interactive-button" type="submit">
                    Salvar alteracoes
                  </button>
                ) : null}
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default TicketsPage;
