import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import UserAutocomplete from "../components/UserAutocomplete";
import { useAuth } from "../auth/AuthContext";
import { hasAnyPermission } from "../data/permissions";
import { PRIORITY_LEVELS, TICKET_STATUSES, normalizeText, toLocalDatetimeInput } from "../data/helpdesk";
import { useAppData } from "../data/AppDataContext";

const defaultCreateForm = {
  title: "",
  type: "Incidente",
  status: "Aberto",
  departmentId: "",
  location: "",
  priority: "Media",
  urgency: "Media",
  impact: "Media",
  openedAt: new Date().toISOString(),
  watchers: [],
  description: "",
  attachments: [],
  knowledgeArticleIds: [],
};

const priorityLegend = [
  { label: "Critico", value: "Critica", className: "priority-line-critica" },
  { label: "Alto", value: "Alta", className: "priority-line-alta" },
  { label: "Medio", value: "Media", className: "priority-line-media" },
  { label: "Baixo", value: "Baixa", className: "priority-line-baixa" },
];

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

function getStatusBadgeClass(status) {
  const normalized = normalizeText(status);
  if (normalized === "aberto") return "status-badge-aberto";
  if (normalized === "em andamento") return "status-badge-andamento";
  if (normalized === "aguardando usuario") return "status-badge-aguardando";
  if (normalized === "reaberto") return "status-badge-reaberto";
  if (normalized === "resolvido") return "status-badge-resolvido";
  return "badge-neutral";
}

function getSlaTone(ticket) {
  if (ticket.isOverdue || ticket.criticalWaitingTechnician) return "status-badge-reaberto";
  if (ticket.dueSoon || ticket.unassigned) return "status-badge-aguardando";
  return "status-badge-resolvido";
}

function getFreshCreateForm() {
  return {
    ...defaultCreateForm,
    openedAt: new Date().toISOString(),
    watchers: [],
    attachments: [],
    knowledgeArticleIds: [],
  };
}

function TicketsPage() {
  const {
    addTicketAttachments,
    allTickets,
    canViewAllTickets,
    createKnowledgeArticleFromTicket,
    createTicket,
    deleteTicket,
    departments,
    knowledgeArticles,
    linkKnowledgeArticleToTicket,
    pushToast,
    removeTicketAttachment,
    searchKnowledgeArticles,
    searchTickets,
    serviceCenter,
    tickets,
    updateTicket,
    users,
  } = useAppData();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [viewMode, setViewMode] = useState("list");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [priorityFilter, setPriorityFilter] = useState("Todas");
  const [slaFilter, setSlaFilter] = useState("Todos");
  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState(getFreshCreateForm);
  const [watcherQuery, setWatcherQuery] = useState("");
  const [createKnowledgeQuery, setCreateKnowledgeQuery] = useState("");
  const [detailTicketId, setDetailTicketId] = useState(null);
  const [detailForm, setDetailForm] = useState(null);
  const [knowledgeQuery, setKnowledgeQuery] = useState("");
  const createInputRef = useRef(null);
  const detailInputRef = useRef(null);
  const watcherBoxRef = useRef(null);
  const canCreateTicket = hasAnyPermission(user, ["tickets_create", "tickets_admin"]);
  const canEditTicket = hasAnyPermission(user, ["tickets_edit", "tickets_admin"]);
  const canDeleteTicket = hasAnyPermission(user, ["tickets_delete", "tickets_admin"]);
  const canAssignTicket = hasAnyPermission(user, ["tickets_assign", "tickets_admin"]);
  const canChangePriority = hasAnyPermission(user, ["tickets_change_priority", "tickets_admin"]);
  const canChangeStatus = hasAnyPermission(user, ["tickets_change_status", "tickets_admin"]);
  const canManageAttachments = hasAnyPermission(user, ["tickets_edit", "tickets_admin"]);
  const canCreateKnowledge = hasAnyPermission(user, ["knowledge_create", "knowledge_admin"]);
  const canSeeAllTickets = Boolean(canViewAllTickets);
  const serviceCenterEnabled = Boolean(serviceCenter?.enabled);

  const requestableDepartments = useMemo(
    () =>
      departments.filter((department) => {
        const config = serviceCenter?.departments?.[department.id] || {};
        return (
          normalizeText(department.status) === "ativo" &&
          Boolean(config.active) &&
          (config.acceptsTickets !== undefined ? Boolean(config.acceptsTickets) : true) &&
          Boolean(config.showInRequestPortal)
        );
      }),
    [departments, serviceCenter],
  );

  const serviceDepartmentDirectory = useMemo(
    () =>
      departments.reduce(
        (accumulator, department) => ({
          ...accumulator,
          [department.id]: {
            ...department,
            serviceConfig: serviceCenter?.departments?.[department.id] || {},
          },
        }),
        {},
      ),
    [departments, serviceCenter],
  );

  const selectableDepartmentOptions = useMemo(() => {
    if (!serviceCenterEnabled) {
      return [
        { id: "", name: "Service Desk" },
        { id: "queue-infra", name: "Infraestrutura" },
        { id: "queue-apps", name: "Aplicacoes" },
        { id: "queue-security", name: "Seguranca" },
      ];
    }
    return departments.filter((department) => {
      const config = serviceCenter?.departments?.[department.id] || {};
      return normalizeText(department.status) === "ativo" && Boolean(config.active);
    });
  }, [departments, serviceCenter, serviceCenterEnabled]);

  const selectedCreateDepartment = serviceCenterEnabled
    ? requestableDepartments.find((department) => department.id === createForm.departmentId) || null
    : null;

  const detailTicket = tickets.find((ticket) => ticket.id === detailTicketId) ?? null;
  const currentDetailDepartmentId = detailForm?.departmentId || detailTicket?.departmentId || "";
  const detailDepartment = currentDetailDepartmentId ? serviceDepartmentDirectory[currentDetailDepartmentId] || null : null;
  const assigneeDepartment = serviceCenterEnabled ? detailDepartment?.serviceConfig || {} : null;

  const assigneeUsers = useMemo(() => {
    if (!serviceCenterEnabled) {
      return users.filter((candidate) => normalizeText(candidate.department) === "ti");
    }

    const responsibleIds = Array.isArray(assigneeDepartment?.responsibleUserIds) ? assigneeDepartment.responsibleUserIds : [];
    if (responsibleIds.length) {
      return users.filter((candidate) => responsibleIds.includes(candidate.id));
    }

    if (!currentDetailDepartmentId) return [];
    return users.filter((candidate) => candidate.departmentId === currentDetailDepartmentId);
  }, [assigneeDepartment, currentDetailDepartmentId, serviceCenterEnabled, users]);

  useEffect(() => {
    setSearch(searchParams.get("q") || "");
  }, [searchParams]);

  useEffect(() => {
    if (searchParams.get("new") === "1" && canCreateTicket) {
      setShowCreateForm(true);
      setCreateForm({
        ...getFreshCreateForm(),
        departmentId: serviceCenterEnabled && requestableDepartments.length ? requestableDepartments[0].id : "",
      });
      setCreateKnowledgeQuery("");
    }
  }, [canCreateTicket, requestableDepartments, searchParams, serviceCenterEnabled]);

  const filteredTickets = useMemo(() => {
    let currentTickets = searchTickets(search, tickets);

    if (statusFilter !== "Todos") {
      currentTickets = currentTickets.filter((ticket) => normalizeText(ticket.status) === normalizeText(statusFilter));
    }
    if (priorityFilter !== "Todas") {
      currentTickets = currentTickets.filter((ticket) => normalizeText(ticket.priority) === normalizeText(priorityFilter));
    }
    if (slaFilter === "Vence em 1h") {
      currentTickets = currentTickets.filter((ticket) => ticket.dueSoon);
    }
    if (slaFilter === "Vencido") {
      currentTickets = currentTickets.filter((ticket) => ticket.isOverdue);
    }
    if (slaFilter === "Critico sem tecnico") {
      currentTickets = currentTickets.filter((ticket) => ticket.criticalWaitingTechnician);
    }
    if (slaFilter === "Sem tecnico") {
      currentTickets = currentTickets.filter((ticket) => ticket.unassigned);
    }

    return currentTickets;
  }, [priorityFilter, search, searchTickets, slaFilter, statusFilter, tickets]);

  const linkedArticles = useMemo(
    () =>
      detailTicket
        ? knowledgeArticles.filter((article) => (detailTicket.knowledgeArticleIds || []).includes(article.id))
        : [],
    [detailTicket, knowledgeArticles],
  );
  const articleSuggestions = useMemo(
    () =>
      normalizeText(knowledgeQuery)
        ? searchKnowledgeArticles(knowledgeQuery, knowledgeArticles).filter((article) => article.status === "Ativo").slice(0, 6)
        : [],
    [knowledgeArticles, knowledgeQuery, searchKnowledgeArticles],
  );
  const createArticleSuggestions = useMemo(
    () =>
      normalizeText(createKnowledgeQuery)
        ? searchKnowledgeArticles(createKnowledgeQuery, knowledgeArticles).filter((article) => article.status === "Ativo").slice(0, 6)
        : [],
    [createKnowledgeQuery, knowledgeArticles, searchKnowledgeArticles],
  );

  const watcherSuggestions = useMemo(() => {
    const query = normalizeText(watcherQuery);
    if (!query) return [];
    return users
      .filter((candidate) => candidate.id !== user?.id)
      .filter((candidate) => !createForm.watchers.some((watcher) => watcher.id === candidate.id))
      .filter((candidate) =>
        [candidate.name, candidate.email, candidate.team, candidate.department].some((value) => normalizeText(value).includes(query)),
      )
      .slice(0, 6);
  }, [createForm.watchers, user?.id, users, watcherQuery]);

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
      departmentId: detailTicket.departmentId || "",
      department: detailTicket.department || "",
      queue: detailTicket.queue,
      requester: detailTicket.requester,
      requesterEmail: detailTicket.requesterEmail || "",
      assignee: detailTicket.assignee,
      source: detailTicket.source,
      category: detailTicket.category,
      location: detailTicket.location || "",
      priority: detailTicket.priority,
      urgency: detailTicket.urgency || detailTicket.priority,
      impact: detailTicket.impact || detailTicket.priority,
      openedAt: toLocalDatetimeInput(detailTicket.openedAt),
      dueDate: detailTicket.dueDate ? detailTicket.dueDate.slice(0, 10) : "",
      watchers: detailTicket.watchers || "",
      knowledgeArticleIds: detailTicket.knowledgeArticleIds || [],
    });
  }, [detailTicket]);

  useEffect(() => {
    if (!showCreateForm) return undefined;

    const handlePointerDown = (event) => {
      if (watcherBoxRef.current && !watcherBoxRef.current.contains(event.target)) {
        setWatcherQuery("");
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [showCreateForm]);

  if (
    !hasAnyPermission(user, [
      "tickets_view_own",
      "tickets_view_all",
      "tickets_admin",
      "service_center_view_department_tickets",
      "service_center_view_all_tickets",
      "service_center_attend_linked_departments",
    ])
  ) {
    return <Navigate replace to="/app/dashboard" />;
  }

  const updateCreateField = (field) => (event) => setCreateForm((current) => ({ ...current, [field]: event.target.value }));
  const updateDetailField = (field) => (event) => setDetailForm((current) => ({ ...current, [field]: event.target.value }));

  const handleSearchChange = (value) => {
    setSearch(value);
    const nextParams = new URLSearchParams(searchParams);
    if (value.trim()) nextParams.set("q", value);
    else nextParams.delete("q");
    setSearchParams(nextParams, { replace: true });
  };

  const handleCreateAttachments = async (event) => {
    const nextFiles = Array.from(event.target.files || []);
    if (!nextFiles.length) return;
    const attachments = await Promise.all(nextFiles.map(readFileAsDataUrl));
    setCreateForm((current) => ({ ...current, attachments: [...current.attachments, ...attachments] }));
    event.target.value = "";
  };

  const handleOpenCreateModal = () => {
    const nextDepartmentId = serviceCenterEnabled && requestableDepartments.length ? requestableDepartments[0].id : "";
    setCreateForm({ ...getFreshCreateForm(), departmentId: nextDepartmentId });
    setWatcherQuery("");
    setCreateKnowledgeQuery("");
    setShowCreateForm(true);
  };

  const handleCloseCreateModal = () => {
    setShowCreateForm(false);
    setWatcherQuery("");
    setCreateKnowledgeQuery("");
    setCreateForm(getFreshCreateForm());
  };

  const handleAddWatcher = (candidate) => {
    setCreateForm((current) => ({ ...current, watchers: [...current.watchers, candidate] }));
    setWatcherQuery("");
  };

  const handleRemoveWatcher = (watcherId) => {
    setCreateForm((current) => ({ ...current, watchers: current.watchers.filter((watcher) => watcher.id !== watcherId) }));
  };

  const handleCreateSubmit = (event) => {
    event.preventDefault();
    if (!createForm.title || !user?.name || !createForm.description) return;
    if (serviceCenterEnabled && !createForm.departmentId) {
      pushToast("Departamento obrigatorio", "Selecione um departamento para abrir o chamado.", "warning");
      return;
    }

    const createdTicket = createTicket({
      ...createForm,
      requester: user.name,
      requesterId: user.id,
      requesterEmail: user.email,
      queue: selectedCreateDepartment?.name || "Service Desk",
      departmentId: createForm.departmentId,
      department: selectedCreateDepartment?.name || "",
      category: "Geral",
      source: "Portal",
      watchers: createForm.watchers.map((watcher) => watcher.name).join(", "),
      assignee: "",
      openedAt: toIsoOrEmpty(createForm.openedAt) || new Date().toISOString(),
    });

    if (!createdTicket) {
      pushToast("Falha ao abrir chamado", "Revise a configuracao do departamento selecionado.", "warning");
      return;
    }

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
          <span className="eyebrow">Helpdesk</span>
          <h2>Fila de chamados</h2>
        </div>
        <div className="insight-strip">
          <div className="insight-chip">
            <strong>{tickets.length}</strong>
            <span>tickets visiveis</span>
          </div>
          <div className="insight-chip">
            <strong>{tickets.filter((ticket) => ticket.dueSoon || ticket.isOverdue).length}</strong>
            <span>alertas de SLA</span>
          </div>
          <div className="insight-chip">
            <strong>{serviceCenterEnabled ? requestableDepartments.length : users.filter((candidate) => normalizeText(candidate.department) === "ti").length}</strong>
            <span>{serviceCenterEnabled ? "departamentos de abertura" : "tecnicos TI"}</span>
          </div>
        </div>
        {!canSeeAllTickets ? (
          <p className="module-caption">
            {serviceCenterEnabled
              ? "Visualizacao restrita aos seus chamados e aos departamentos em que voce atua, conforme permissao."
              : "Visualizacao restrita aos seus proprios chamados."}
          </p>
        ) : null}
      </section>

      <section className="board-card glpi-panel">
        <div className="glpi-toolbar">
          <div>
            <h2>Listagem operacional</h2>
            <span>Priorize a fila por impacto, acompanhe SLA e abra novos chamados sem perder contexto.</span>
          </div>
          <div className="toolbar">
            <div className="view-toggle">
              <button className={`filter-pill interactive-button${viewMode === "list" ? " is-active" : ""}`} onClick={() => setViewMode("list")} type="button">
                Lista
              </button>
            </div>
            {canCreateTicket ? (
              <button className="primary-button interactive-button" onClick={handleOpenCreateModal} type="button">
                Abrir chamado
              </button>
            ) : null}
          </div>
        </div>

        <div className="dashboard-filter-shell compact-filter-shell">
          <div className="dashboard-filter-grid">
            <label>
              <span>Busca global</span>
              <input className="toolbar-search" onChange={(event) => handleSearchChange(event.target.value)} placeholder="Numero, usuario, email, tecnico, status, prioridade, titulo ou descricao" value={search} />
            </label>
            <label>
              <span>Status</span>
              <select onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
                <option>Todos</option>
                {TICKET_STATUSES.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Prioridade</span>
              <select onChange={(event) => setPriorityFilter(event.target.value)} value={priorityFilter}>
                <option>Todas</option>
                {PRIORITY_LEVELS.map((priority) => (
                  <option key={priority}>{priority}</option>
                ))}
              </select>
            </label>
            <label>
              <span>SLA</span>
              <select onChange={(event) => setSlaFilter(event.target.value)} value={slaFilter}>
                <option>Todos</option>
                <option>Vence em 1h</option>
                <option>Vencido</option>
                <option>Critico sem tecnico</option>
                <option>Sem tecnico</option>
              </select>
            </label>
          </div>
        </div>

        <div className="ticket-rows ticket-rows-wide">
          {filteredTickets.length ? (
            filteredTickets.map((ticket) => (
              <button
                className={`ticket-row-card interactive-button ${getPriorityRowClass(ticket.priority)}${detailTicketId === ticket.id ? " is-selected" : ""}`}
                key={ticket.id}
                onClick={() => setDetailTicketId(ticket.id)}
                type="button"
              >
                <div className="ticket-row-main">
                  <div className="ticket-row-title">
                    <strong>{ticket.id}</strong>
                    <h3>{ticket.title}</h3>
                  </div>
                  <div className="ticket-row-badges">
                    <span className={`badge ${getPriorityBadgeClass(ticket.priority)}`}>{ticket.priority}</span>
                    <span className={`badge badge-priority-harmony ${getStatusBadgeClass(ticket.status)}`}>{ticket.status}</span>
                    <span className={`badge badge-priority-harmony ${getSlaTone(ticket)}`}>{ticket.slaLabel}</span>
                  </div>
                </div>
                <div className="ticket-row-meta">
                  <span>{ticket.requester}</span>
                  <span>{ticket.requesterEmail || "-"}</span>
                  <span>{ticket.assignee || "Sem tecnico"}</span>
                  <span>{ticket.queue}</span>
                </div>
              </button>
            ))
          ) : (
            <div className="empty-state">
              <strong>Nenhum chamado encontrado.</strong>
              <span>Ajuste busca, filtros ou registre um novo chamado.</span>
            </div>
          )}
        </div>

        <div className="priority-legend" aria-label="Legenda de prioridades">
          {priorityLegend.map((item) => (
            <div className="priority-legend-item" key={item.value}>
              <span className={`priority-legend-swatch ${item.className}`} />
              <strong>{item.label}</strong>
              <span>{item.value}</span>
            </div>
          ))}
        </div>
      </section>

      {showCreateForm ? (
        <div className="ticket-modal-backdrop" onClick={handleCloseCreateModal} role="presentation">
          <div className="ticket-modal board-card" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
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
                {serviceCenterEnabled ? (
                  <div className="field-block field-full">
                    <span>Departamento de destino</span>
                    <div className="service-request-grid">
                      {requestableDepartments.map((department) => (
                        <button
                          className={`service-request-card interactive-button${createForm.departmentId === department.id ? " is-selected" : ""}`}
                          key={department.id}
                          onClick={() => setCreateForm((current) => ({ ...current, departmentId: department.id }))}
                          type="button"
                        >
                          <strong>Chamado para {department.name}</strong>
                          <span>{department.code || "SEM-CODIGO"}</span>
                        </button>
                      ))}
                    </div>
                    {!requestableDepartments.length ? (
                      <div className="empty-state">
                        <strong>Nenhum departamento disponivel.</strong>
                        <span>Ative departamentos com abertura habilitada em Configuracoes &gt; Central de Servicos.</span>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className="field-block">
                  <span>Solicitante</span>
                  <div className="requester-stamp">
                    <strong>{user?.name || "Usuario nao identificado"}</strong>
                    <small>{user ? `${user.email} | ${user.role}` : "Faca login para registrar o solicitante."}</small>
                  </div>
                </div>
                <label className="field-block">
                  <span>Status</span>
                  <select onChange={updateCreateField("status")} value={createForm.status}>
                    {TICKET_STATUSES.map((status) => (
                      <option key={status}>{status}</option>
                    ))}
                  </select>
                </label>
                <label className="field-block">
                  <span>Localizacao</span>
                  <input onChange={updateCreateField("location")} value={createForm.location} />
                </label>
                <label className="field-block">
                  <span>Prioridade</span>
                  <select onChange={updateCreateField("priority")} value={createForm.priority}>
                    {PRIORITY_LEVELS.map((priority) => (
                      <option key={priority}>{priority}</option>
                    ))}
                  </select>
                </label>
                <label className="field-block">
                  <span>Urgencia</span>
                  <select onChange={updateCreateField("urgency")} value={createForm.urgency}>
                    {PRIORITY_LEVELS.map((priority) => (
                      <option key={priority}>{priority}</option>
                    ))}
                  </select>
                </label>
                <label className="field-block">
                  <span>Impacto</span>
                  <select onChange={updateCreateField("impact")} value={createForm.impact}>
                    {PRIORITY_LEVELS.map((priority) => (
                      <option key={priority}>{priority}</option>
                    ))}
                  </select>
                </label>
                <label className="field-block">
                  <span>Data e hora da abertura</span>
                  <input onChange={updateCreateField("openedAt")} type="datetime-local" value={toLocalDatetimeInput(createForm.openedAt)} />
                </label>
                <label className="field-block">
                  <span>Pesquisar artigo</span>
                  <input onChange={(event) => setCreateKnowledgeQuery(event.target.value)} placeholder="Pesquisar solucao existente" value={createKnowledgeQuery} />
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
                    <input onChange={(event) => setWatcherQuery(event.target.value)} placeholder="Digite nome, email ou equipe" value={watcherQuery} />
                    {watcherSuggestions.length ? (
                      <div className="watcher-suggestions">
                        {watcherSuggestions.map((candidate) => (
                          <button className="watcher-suggestion interactive-button" key={candidate.id} onClick={() => handleAddWatcher(candidate)} type="button">
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

              {createArticleSuggestions.length ? (
                <div className="ticket-rows">
                  {createArticleSuggestions.map((article) => (
                    <button
                      className="ticket-row-card interactive-button"
                      key={article.id}
                      onClick={() =>
                        setCreateForm((current) => ({
                          ...current,
                          knowledgeArticleIds: [...new Set([...(current.knowledgeArticleIds || []), article.id])],
                        }))
                      }
                      type="button"
                    >
                      <div className="ticket-row-main">
                        <div className="ticket-row-title">
                          <strong>{article.title}</strong>
                          <h3>{article.category}</h3>
                        </div>
                        <div className="ticket-row-badges">
                          <span className="badge status-badge-resolvido">Ativo</span>
                        </div>
                      </div>
                      <div className="ticket-row-meta">
                        <span>{article.solutionApplied}</span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : null}

              {createForm.knowledgeArticleIds.length ? (
                <div className="ticket-row-meta">
                  <span>{createForm.knowledgeArticleIds.length} artigo(s) vinculado(s) ao novo chamado</span>
                </div>
              ) : null}

              <div className="attachment-toolbar glpi-subbar">
                <button className="ghost-button interactive-button" onClick={() => createInputRef.current?.click()} type="button">
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
          <div className="ticket-modal ticket-modal-large board-card" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
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
                  <button className="ghost-button interactive-button" onClick={() => setDetailTicketId(null)} type="button">
                    Fechar
                  </button>
                  {canDeleteTicket ? (
                    <button className="danger-button interactive-button" onClick={handleDeleteTicket} type="button">
                      Excluir
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="glpi-info-strip">
                <div>
                  <span>Prioridade</span>
                  <strong className={`badge ${getPriorityBadgeClass(detailForm.priority)}`}>{detailForm.priority}</strong>
                </div>
                <div>
                  <span>Status</span>
                  <strong className={`badge ${getStatusBadgeClass(detailForm.status)}`}>{detailForm.status}</strong>
                </div>
                <div>
                  <span>SLA</span>
                  <strong className={`badge ${getSlaTone(detailTicket)}`}>{detailTicket.slaLabel}</strong>
                </div>
              </div>

              <label className="field-block field-full">
                <span>Titulo</span>
                <input disabled={!canEditTicket} onChange={updateDetailField("title")} value={detailForm.title} />
              </label>

              <div className="detail-grid">
                <label className="field-block">
                  <span>Tipo</span>
                  <select disabled={!canEditTicket} onChange={updateDetailField("type")} value={detailForm.type}>
                    <option>Incidente</option>
                    <option>Requisicao</option>
                    <option>Problema</option>
                  </select>
                </label>
                <label className="field-block">
                  <span>Status</span>
                  <select disabled={!canChangeStatus} onChange={updateDetailField("status")} value={detailForm.status}>
                    {TICKET_STATUSES.map((status) => (
                      <option key={status}>{status}</option>
                    ))}
                  </select>
                </label>
                <label className="field-block">
                  <span>{serviceCenterEnabled ? "Departamento de atendimento" : "Fila"}</span>
                  {serviceCenterEnabled ? (
                    <select
                      disabled={!canEditTicket}
                      onChange={(event) => {
                        const nextDepartmentId = event.target.value;
                        const nextDepartment = serviceDepartmentDirectory[nextDepartmentId] || null;
                        setDetailForm((current) => ({
                          ...current,
                          departmentId: nextDepartmentId,
                          department: nextDepartment?.name || "",
                          queue: nextDepartment?.name || current.queue,
                          assignee: "",
                        }));
                      }}
                      value={detailForm.departmentId || ""}
                    >
                      <option value="">Selecione</option>
                      {selectableDepartmentOptions.map((department) => (
                        <option key={department.id || department.name} value={department.id || ""}>
                          {department.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <select disabled={!canEditTicket} onChange={updateDetailField("queue")} value={detailForm.queue}>
                      <option>Service Desk</option>
                      <option>Infraestrutura</option>
                      <option>Aplicacoes</option>
                      <option>Seguranca</option>
                    </select>
                  )}
                </label>
                <label className="field-block">
                  <span>Solicitante</span>
                  <input disabled={!canEditTicket || !canSeeAllTickets} onChange={updateDetailField("requester")} value={detailForm.requester} />
                </label>
                <label className="field-block">
                  <span>Email solicitante</span>
                  <input disabled={!canEditTicket || !canSeeAllTickets} onChange={updateDetailField("requesterEmail")} value={detailForm.requesterEmail} />
                </label>
                <label className="field-block">
                  <span>Origem</span>
                  <select disabled={!canEditTicket} onChange={updateDetailField("source")} value={detailForm.source}>
                    <option>Portal</option>
                    <option>E-mail</option>
                    <option>Telefone</option>
                    <option>Monitoramento</option>
                  </select>
                </label>
                <label className="field-block">
                  <span>Categoria</span>
                  <input disabled={!canEditTicket} onChange={updateDetailField("category")} value={detailForm.category || ""} />
                </label>
                <label className="field-block">
                  <span>Localizacao</span>
                  <input disabled={!canEditTicket} onChange={updateDetailField("location")} value={detailForm.location || ""} />
                </label>
                <label className="field-block">
                  <span>Prioridade</span>
                  <select disabled={!canChangePriority} onChange={updateDetailField("priority")} value={detailForm.priority}>
                    {PRIORITY_LEVELS.map((priority) => (
                      <option key={priority}>{priority}</option>
                    ))}
                  </select>
                </label>
                <label className="field-block">
                  <span>Urgencia</span>
                  <select disabled={!canChangePriority} onChange={updateDetailField("urgency")} value={detailForm.urgency}>
                    {PRIORITY_LEVELS.map((priority) => (
                      <option key={priority}>{priority}</option>
                    ))}
                  </select>
                </label>
                <label className="field-block">
                  <span>Impacto</span>
                  <select disabled={!canChangePriority} onChange={updateDetailField("impact")} value={detailForm.impact}>
                    {PRIORITY_LEVELS.map((priority) => (
                      <option key={priority}>{priority}</option>
                    ))}
                  </select>
                </label>
                <label className="field-block">
                  <span>Data limite</span>
                  <input disabled={!canEditTicket} onChange={updateDetailField("dueDate")} type="date" value={detailForm.dueDate || ""} />
                </label>
                <label className="field-block">
                  <span>Abertura</span>
                  <input disabled={!canEditTicket} onChange={updateDetailField("openedAt")} type="datetime-local" value={detailForm.openedAt || ""} />
                </label>
                <label className="field-block">
                  <span>Observadores</span>
                  <input disabled={!canEditTicket} onChange={updateDetailField("watchers")} value={detailForm.watchers || ""} />
                </label>
                <label className="field-block">
                  <span>Tecnico responsavel</span>
                  <UserAutocomplete
                    filterFn={(candidate) =>
                      serviceCenterEnabled
                        ? assigneeUsers.some((assigneeCandidate) => assigneeCandidate.id === candidate.id)
                        : normalizeText(candidate.department) === "ti"
                    }
                    disabled={!canAssignTicket}
                    onChange={(nextValue) => setDetailForm((current) => ({ ...current, assignee: nextValue }))}
                    placeholder={serviceCenterEnabled ? "Comece a digitar um responsavel do departamento" : "Comece a digitar um tecnico de TI"}
                    users={assigneeUsers}
                    value={detailForm.assignee || ""}
                  />
                </label>
              </div>

              <label className="field-block field-full">
                <span>Descricao</span>
                <textarea disabled={!canEditTicket} onChange={updateDetailField("description")} value={detailForm.description} />
              </label>

              <label className="field-block field-full">
                <span>Solucao / acompanhamento tecnico</span>
                <textarea disabled={!canEditTicket} onChange={updateDetailField("resolutionNotes")} value={detailForm.resolutionNotes} />
              </label>

              <section className="ticket-attachment-panel">
                <div className="attachment-toolbar glpi-subbar">
                  <div>
                    <strong>Base de conhecimento vinculada</strong>
                    <span>Pesquise artigos existentes ou transforme a solucao do chamado em artigo reutilizavel.</span>
                  </div>
                </div>
                <input className="toolbar-search" onChange={(event) => setKnowledgeQuery(event.target.value)} placeholder="Pesquisar artigos por problema, solucao ou palavra-chave" value={knowledgeQuery} />
                {articleSuggestions.length ? (
                  <div className="ticket-rows">
                    {articleSuggestions.map((article) => (
                      <button className="ticket-row-card interactive-button" key={article.id} onClick={() => linkKnowledgeArticleToTicket(detailTicket.id, article.id)} type="button">
                        <div className="ticket-row-main">
                          <div className="ticket-row-title">
                            <strong>{article.title}</strong>
                            <h3>{article.category}</h3>
                          </div>
                          <div className="ticket-row-badges">
                            <span className={`badge ${article.status === "Ativo" ? "status-badge-resolvido" : "status-badge-reaberto"}`}>{article.status}</span>
                          </div>
                        </div>
                        <div className="ticket-row-meta">
                          <span>{article.solutionApplied}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : null}
                {linkedArticles.length ? (
                  <div className="ticket-rows">
                    {linkedArticles.map((article) => (
                      <article className="ticket-row-card" key={article.id}>
                        <div className="ticket-row-main">
                          <div className="ticket-row-title">
                            <strong>{article.title}</strong>
                            <h3>{article.category}</h3>
                          </div>
                          <div className="ticket-row-badges">
                            <span className={`badge ${article.status === "Ativo" ? "status-badge-resolvido" : "status-badge-reaberto"}`}>{article.status}</span>
                          </div>
                        </div>
                        <div className="ticket-row-meta">
                          <span>{article.solutionApplied}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <strong>Nenhum artigo vinculado.</strong>
                    <span>Use a busca acima para reaproveitar solucoes registradas.</span>
                  </div>
                )}
                {canCreateKnowledge && detailTicket.resolutionNotes ? (
                  <div className="ticket-create-actions compact-actions">
                    <button className="ghost-button interactive-button" onClick={() => createKnowledgeArticleFromTicket(detailTicket.id)} type="button">
                      Transformar solucao em artigo
                    </button>
                  </div>
                ) : null}
              </section>

              <section className="ticket-attachment-panel">
                <div className="attachment-toolbar glpi-subbar">
                  <div>
                    <strong>Anexos</strong>
                    <span>Prints, documentos e evidencias vinculadas ao chamado.</span>
                  </div>
                  {canManageAttachments ? (
                    <button className="ghost-button interactive-button" onClick={() => detailInputRef.current?.click()} type="button">
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
              </section>

              <section className="ticket-attachment-panel">
                <div className="attachment-toolbar glpi-subbar">
                  <div>
                    <strong>Historico e auditoria</strong>
                    <span>Registro de alteracoes de status, prioridade, tecnico, solucao, reabertura e eventos de SLA.</span>
                  </div>
                </div>
                {detailTicket.history?.length ? (
                  <div className="ticket-rows">
                    {detailTicket.history.map((entry) => (
                      <article className="ticket-row-card" key={entry.id}>
                        <div className="ticket-row-main">
                          <div className="ticket-row-title">
                            <strong>{entry.message}</strong>
                            <h3>{entry.actorName || "Sistema"}</h3>
                          </div>
                          <div className="ticket-row-badges">
                            <span className="badge badge-neutral">{entry.type}</span>
                          </div>
                        </div>
                        <div className="ticket-row-meta">
                          <span>{entry.createdAtLabel}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <strong>Nenhum evento registrado.</strong>
                    <span>As alteracoes deste chamado passarao a aparecer aqui.</span>
                  </div>
                )}
              </section>

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
