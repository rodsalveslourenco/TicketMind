import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import UserAutocomplete from "../components/UserAutocomplete";
import { useAuth } from "../auth/AuthContext";
import { getDepartmentColorStyle, normalizeDepartmentColor } from "../data/departments";
import { hasAnyPermission } from "../data/permissions";
import { PRIORITY_LEVELS, TICKET_STATUSES, createFollowUpEntry, normalizeText } from "../data/helpdesk";
import { useAppData } from "../data/AppDataContext";

const defaultCreateForm = {
  title: "",
  type: "Incidente",
  departmentId: "",
  category: "Geral",
  location: "",
  priority: "Media",
  urgency: "Media",
  impact: "Media",
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

const statusTransitions = {
  Aberto: ["Em andamento", "Aguardando usuario", "Aguardando aprovacao", "Resolvido"],
  "Em andamento": ["Aguardando usuario", "Resolvido", "Reaberto"],
  "Aguardando usuario": ["Em andamento", "Resolvido", "Reaberto"],
  "Aguardando aprovacao": ["Aberto", "Em andamento", "Aguardando usuario", "Resolvido"],
  Resolvido: ["Reaberto"],
  Reaberto: ["Em andamento", "Aguardando usuario", "Resolvido"],
};

const responseTemplates = [
  { id: "resp-1", name: "Retorno inicial", visibility: "public", content: "Recebemos sua solicitacao e ela esta em triagem. Em breve retornaremos com a proxima atualizacao." },
  { id: "resp-2", name: "Aguardando validacao", visibility: "public", content: "Aplicamos a acao inicial e precisamos da sua validacao para concluir o atendimento." },
  { id: "resp-3", name: "Nota interna", visibility: "private", content: "Registrar diagnostico interno, risco, impacto e proximo passo tecnico." },
];

const solutionTemplates = [
  { id: "sol-1", name: "Acesso liberado", content: "Acesso concedido apos validacao de perfil, grupo e politica de seguranca." },
  { id: "sol-2", name: "Servico restabelecido", content: "Servico normalizado apos ajuste corretivo e validacao com a area solicitante." },
  { id: "sol-3", name: "Orientacao concluida", content: "Chamado concluido com orientacao ao usuario e confirmacao do funcionamento esperado." },
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
    watchers: [],
    attachments: [],
    knowledgeArticleIds: [],
  };
}

function toDepartmentOptionStyle(color) {
  const normalizedColor = normalizeDepartmentColor(color);
  if (!normalizedColor) return {};
  return {
    backgroundColor: `${normalizedColor}22`,
    color: "#0f172a",
  };
}

function getTicketFiltersStorageKey(userId = "") {
  return `ticketmind.tickets.filters.${userId || "anon"}`;
}

function parseDateValue(value, edge = "start") {
  if (!value) return null;
  const parsed = new Date(edge === "end" ? `${value}T23:59:59.999` : `${value}T00:00:00.000`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function triggerCsvDownload(fileName, rows) {
  if (!rows.length) return;
  const csvContent = rows
    .map((row) =>
      row
        .map((value) => {
          const normalized = String(value ?? "").replace(/"/g, '""');
          return `"${normalized}"`;
        })
        .join(","),
    )
    .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.URL.revokeObjectURL(url);
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
    getAllowedTicketStatuses,
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
  const [advancedFilters, setAdvancedFilters] = useState({
    query: "",
    requester: "",
    assignee: "Todos",
    department: "Todos",
    category: "Todas",
    queue: "Todas",
    source: "Todas",
    dateFrom: "",
    dateTo: "",
  });
  const [savedFilters, setSavedFilters] = useState([]);
  const [savedFilterName, setSavedFilterName] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState(getFreshCreateForm);
  const [watcherQuery, setWatcherQuery] = useState("");
  const [createKnowledgeQuery, setCreateKnowledgeQuery] = useState("");
  const [detailTicketId, setDetailTicketId] = useState(null);
  const [detailForm, setDetailForm] = useState(null);
  const [followUpVisibility, setFollowUpVisibility] = useState("public");
  const [selectedResponseTemplateId, setSelectedResponseTemplateId] = useState("");
  const [selectedSolutionTemplateId, setSelectedSolutionTemplateId] = useState("");
  const [approvalReason, setApprovalReason] = useState("");
  const [followUpDraft, setFollowUpDraft] = useState("");
  const [knowledgeQuery, setKnowledgeQuery] = useState("");
  const createInputRef = useRef(null);
  const detailInputRef = useRef(null);
  const watcherBoxRef = useRef(null);
  const canCreateTicket = hasAnyPermission(user, ["tickets_create", "tickets_admin"]);
  const canEditTicket = hasAnyPermission(user, ["tickets_edit", "tickets_admin"]);
  const canCloseTicket = hasAnyPermission(user, ["tickets_close", "tickets_admin"]);
  const canDeleteTicket = hasAnyPermission(user, ["tickets_delete", "tickets_admin"]);
  const canViewPrivateFollowUps = hasAnyPermission(user, ["tickets_admin", "tickets_edit", "tickets_assign", "tickets_change_status"]);
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

  const departmentDirectory = useMemo(
    () =>
      departments.reduce(
        (accumulator, department) => ({
          ...accumulator,
          [department.id]: department,
        }),
        {},
      ),
    [departments],
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
  const allowedDetailStatuses = detailTicket ? getAllowedTicketStatuses(detailTicket) : TICKET_STATUSES;
  const visibleFollowUps = (detailTicket?.followUps || []).filter((followUp) => canViewPrivateFollowUps || followUp.visibility === "public");
  const detailTimeline = useMemo(() => {
    if (!detailTicket) return [];

    const historyEntries = (detailTicket.history || []).map((entry) => ({
      id: `history-${entry.id}`,
      source: "history",
      tone: entry.type === "status" ? "status-badge-andamento" : entry.type === "sla" ? "status-badge-reaberto" : "badge-neutral",
      title: entry.message,
      actorName: entry.actorName || "Sistema",
      visibility: "audit",
      type: entry.type || "evento",
      createdAt: entry.createdAt || "",
      createdAtLabel: entry.createdAtLabel || "",
    }));

    const followUpEntries = visibleFollowUps.map((entry) => ({
      id: `followup-${entry.id}`,
      source: "followUp",
      tone: entry.visibility === "private" ? "badge-neutral" : "status-badge-resolvido",
      title: entry.message,
      actorName: entry.actorName || "Sistema",
      visibility: entry.visibility || "public",
      type: entry.kind || "acompanhamento",
      createdAt: entry.createdAt || "",
      createdAtLabel: entry.createdAtLabel || "",
    }));

    return [...followUpEntries, ...historyEntries].sort((left, right) => {
      const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0;
      const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0;
      return rightTime - leftTime;
    });
  }, [detailTicket, visibleFollowUps]);
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
    try {
      const storedValue = window.localStorage.getItem(getTicketFiltersStorageKey(user?.id));
      const parsedValue = storedValue ? JSON.parse(storedValue) : [];
      setSavedFilters(Array.isArray(parsedValue) ? parsedValue : []);
    } catch {
      setSavedFilters([]);
    }
  }, [user?.id]);

  useEffect(() => {
    window.localStorage.setItem(getTicketFiltersStorageKey(user?.id), JSON.stringify(savedFilters));
  }, [savedFilters, user?.id]);

  useEffect(() => {
    if (searchParams.get("new") === "1" && canCreateTicket) {
      setShowCreateForm(true);
      setCreateForm({
        ...getFreshCreateForm(),
      });
      setWatcherQuery("");
      setCreateKnowledgeQuery("");
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("new");
      setSearchParams(nextParams, { replace: true });
    }
  }, [canCreateTicket, requestableDepartments, searchParams, serviceCenterEnabled, setSearchParams]);

  const queueOptions = useMemo(
    () => ["Todas", ...new Set(tickets.map((ticket) => String(ticket.queue || "Sem fila").trim() || "Sem fila"))],
    [tickets],
  );
  const assigneeOptions = useMemo(
    () => ["Todos", ...new Set(tickets.map((ticket) => String(ticket.assignee || "Sem tecnico").trim() || "Sem tecnico"))],
    [tickets],
  );
  const categoryOptions = useMemo(
    () => ["Todas", ...new Set(tickets.map((ticket) => String(ticket.category || "Geral").trim() || "Geral"))],
    [tickets],
  );
  const departmentOptions = useMemo(() => {
    const values = tickets.map((ticket) => String(ticket.department || ticket.queue || "Sem departamento").trim() || "Sem departamento");
    return ["Todos", ...new Set(values)];
  }, [tickets]);

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

    const advancedQuery = normalizeText(advancedFilters.query);
    const requesterQuery = normalizeText(advancedFilters.requester);
    const dateFrom = parseDateValue(advancedFilters.dateFrom, "start");
    const dateTo = parseDateValue(advancedFilters.dateTo, "end");

    if (requesterQuery) {
      currentTickets = currentTickets.filter((ticket) => normalizeText(ticket.requester).includes(requesterQuery));
    }
    if (advancedFilters.assignee !== "Todos") {
      currentTickets = currentTickets.filter((ticket) => String(ticket.assignee || "Sem tecnico").trim() === advancedFilters.assignee);
    }
    if (advancedFilters.department !== "Todos") {
      currentTickets = currentTickets.filter((ticket) => String(ticket.department || ticket.queue || "Sem departamento").trim() === advancedFilters.department);
    }
    if (advancedFilters.category !== "Todas") {
      currentTickets = currentTickets.filter((ticket) => String(ticket.category || "Geral").trim() === advancedFilters.category);
    }
    if (advancedFilters.queue !== "Todas") {
      currentTickets = currentTickets.filter((ticket) => String(ticket.queue || "Sem fila").trim() === advancedFilters.queue);
    }
    if (advancedFilters.source !== "Todas") {
      currentTickets = currentTickets.filter((ticket) => String(ticket.source || "Portal").trim() === advancedFilters.source);
    }
    if (dateFrom || dateTo) {
      currentTickets = currentTickets.filter((ticket) => {
        const openedAt = new Date(ticket.openedAt || Date.now());
        if (Number.isNaN(openedAt.getTime())) return false;
        if (dateFrom && openedAt < dateFrom) return false;
        if (dateTo && openedAt > dateTo) return false;
        return true;
      });
    }
    if (advancedQuery) {
      currentTickets = currentTickets.filter((ticket) => {
        const followUpMessages = (ticket.followUps || []).map((entry) => entry.message).join(" ");
        return [
          ticket.id,
          ticket.title,
          ticket.requester,
          ticket.requesterEmail,
          ticket.assignee,
          ticket.queue,
          ticket.department,
          ticket.status,
          ticket.priority,
          ticket.description,
          ticket.category,
          ticket.source,
          ticket.location,
          ticket.resolutionNotes,
          followUpMessages,
        ].some((field) => normalizeText(field).includes(advancedQuery));
      });
    }

    return currentTickets;
  }, [advancedFilters, priorityFilter, search, searchTickets, slaFilter, statusFilter, tickets]);

  const departmentIndicators = useMemo(() => {
    const grouped = filteredTickets.reduce((accumulator, ticket) => {
      const label = String(ticket.department || ticket.queue || "Sem departamento").trim() || "Sem departamento";
      if (!accumulator[label]) accumulator[label] = { label, total: 0, resolved: 0, critical: 0 };
      accumulator[label].total += 1;
      if (normalizeText(ticket.status) === "resolvido") accumulator[label].resolved += 1;
      if (normalizeText(ticket.priority) === "critica") accumulator[label].critical += 1;
      return accumulator;
    }, {});
    return Object.values(grouped).sort((left, right) => right.total - left.total).slice(0, 5);
  }, [filteredTickets]);

  const technicianIndicators = useMemo(() => {
    const grouped = filteredTickets.reduce((accumulator, ticket) => {
      const label = String(ticket.assignee || "Sem tecnico").trim() || "Sem tecnico";
      if (!accumulator[label]) accumulator[label] = { label, total: 0, inProgress: 0, overdue: 0 };
      accumulator[label].total += 1;
      if (["em andamento", "aguardando usuario", "reaberto"].includes(normalizeText(ticket.status))) accumulator[label].inProgress += 1;
      if (ticket.isOverdue || ticket.dueSoon) accumulator[label].overdue += 1;
      return accumulator;
    }, {});
    return Object.values(grouped).sort((left, right) => right.total - left.total).slice(0, 5);
  }, [filteredTickets]);

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
      setFollowUpDraft("");
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
      reopenReason: detailTicket.reopenReason || "",
      priority: detailTicket.priority,
      urgency: detailTicket.urgency || detailTicket.priority,
      impact: detailTicket.impact || detailTicket.priority,
      dueDate: detailTicket.dueDate ? detailTicket.dueDate.slice(0, 10) : "",
      watchers: detailTicket.watchers || "",
      knowledgeArticleIds: detailTicket.knowledgeArticleIds || [],
    });
    setFollowUpDraft("");
    setFollowUpVisibility("public");
    setSelectedResponseTemplateId("");
    setSelectedSolutionTemplateId("");
    setApprovalReason(detailTicket.approval?.decisionReason || "");
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
    setCreateForm(getFreshCreateForm());
    setWatcherQuery("");
    setCreateKnowledgeQuery("");
    setShowCreateForm(true);
  };

  const handleCloseCreateModal = () => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("new");
    setSearchParams(nextParams, { replace: true });
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
      category: createForm.category || "Geral",
      source: "Portal",
      watchers: createForm.watchers.map((watcher) => watcher.name).join(", "),
      assignee: "",
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
    if (normalizeText(detailForm.status) === "reaberto" && !String(detailForm.reopenReason || "").trim()) {
      pushToast("Motivo obrigatorio", "Informe o motivo da reabertura antes de salvar o chamado.", "warning");
      return;
    }

    updateTicket(detailTicket.id, {
      ...detailForm,
      dueDate: detailForm.dueDate || "",
    });
    pushToast("Chamado atualizado", detailForm.title);
  };

  const handleAddFollowUp = () => {
    if (!detailTicket || !followUpDraft.trim()) return;
    const nextFollowUp = createFollowUpEntry({
      visibility: followUpVisibility,
      message: followUpDraft,
      actorId: user?.id,
      actorName: user?.name || "Sistema",
    });
    updateTicket(detailTicket.id, {
      followUps: [nextFollowUp, ...(detailTicket.followUps || [])],
    });
    setFollowUpDraft("");
    pushToast("Acompanhamento incluido", detailTicket.title);
  };

  const handleFinishTicket = () => {
    if (!detailTicket || !detailForm) return;
    if (!detailForm.resolutionNotes.trim()) {
      pushToast("Solucao obrigatoria", "Informe a solucao final antes de encerrar o chamado.", "warning");
      return;
    }

    updateTicket(detailTicket.id, {
      ...detailForm,
      status: "Resolvido",
      dueDate: detailForm.dueDate || "",
      resolutionNotes: detailForm.resolutionNotes.trim(),
    });
    pushToast("Chamado finalizado", detailForm.title);
  };

  const handleApplyResponseTemplate = (templateId) => {
    setSelectedResponseTemplateId(templateId);
    const template = responseTemplates.find((item) => item.id === templateId);
    if (!template) return;
    setFollowUpVisibility(template.visibility);
    setFollowUpDraft(template.content);
  };

  const handleApplySolutionTemplate = (templateId) => {
    setSelectedSolutionTemplateId(templateId);
    const template = solutionTemplates.find((item) => item.id === templateId);
    if (!template) return;
    setDetailForm((current) => ({ ...current, resolutionNotes: template.content }));
  };

  const handleApprovalAction = (action) => {
    if (!detailTicket) return;
    const nextApproval = {
      ...(detailTicket.approval || {}),
      required: true,
      status: action === "approve" ? "approved" : action === "reject" ? "rejected" : "pending",
      decisionReason: approvalReason,
      decidedAt: action === "request" ? detailTicket.approval?.decidedAt || "" : new Date().toISOString(),
      decidedByName: action === "request" ? detailTicket.approval?.decidedByName || "" : user?.name || "Sistema",
    };
    updateTicket(detailTicket.id, {
      approval: nextApproval,
      status: action === "approve" ? (detailTicket.assignee ? "Em andamento" : "Aberto") : action === "reject" ? "Aguardando usuario" : "Aguardando aprovacao",
    });
    pushToast("Aprovacao atualizada", detailTicket.title);
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

  const updateAdvancedFilter = (field) => (event) => {
    setAdvancedFilters((current) => ({ ...current, [field]: event.target.value }));
  };

  const handleResetFilters = () => {
    setStatusFilter("Todos");
    setPriorityFilter("Todas");
    setSlaFilter("Todos");
    handleSearchChange("");
    setAdvancedFilters({
      query: "",
      requester: "",
      assignee: "Todos",
      department: "Todos",
      category: "Todas",
      queue: "Todas",
      source: "Todas",
      dateFrom: "",
      dateTo: "",
    });
  };

  const handleSaveCurrentFilter = () => {
    const trimmedName = savedFilterName.trim();
    if (!trimmedName) {
      pushToast("Nome obrigatorio", "Informe um nome para salvar o filtro atual.", "warning");
      return;
    }
    const preset = {
      id: `preset-${Date.now().toString(36)}`,
      name: trimmedName,
      search,
      statusFilter,
      priorityFilter,
      slaFilter,
      advancedFilters,
    };
    setSavedFilters((current) => [preset, ...current.filter((item) => item.name !== trimmedName)].slice(0, 10));
    setSavedFilterName("");
    pushToast("Filtro salvo", trimmedName);
  };

  const handleApplySavedFilter = (presetId) => {
    const preset = savedFilters.find((item) => item.id === presetId);
    if (!preset) return;
    handleSearchChange(preset.search || "");
    setStatusFilter(preset.statusFilter || "Todos");
    setPriorityFilter(preset.priorityFilter || "Todas");
    setSlaFilter(preset.slaFilter || "Todos");
    setAdvancedFilters({ query: "", requester: "", assignee: "Todos", department: "Todos", category: "Todas", queue: "Todas", source: "Todas", dateFrom: "", dateTo: "", ...(preset.advancedFilters || {}) });
  };

  const handleDeleteSavedFilter = (presetId) => {
    setSavedFilters((current) => current.filter((item) => item.id !== presetId));
  };

  const handleExportTickets = () => {
    if (!filteredTickets.length) {
      pushToast("Sem chamados", "Nao ha chamados no filtro atual para exportar.", "warning");
      return;
    }
    triggerCsvDownload(`ticketmind-chamados-${new Date().toISOString().slice(0, 10)}.csv`, [
      ["ID", "Titulo", "Solicitante", "Email", "Tecnico", "Departamento", "Fila", "Status", "Prioridade", "Categoria", "Origem", "Abertura", "SLA"],
      ...filteredTickets.map((ticket) => [ticket.id, ticket.title, ticket.requester, ticket.requesterEmail || "", ticket.assignee || "", ticket.department || "", ticket.queue || "", ticket.status, ticket.priority, ticket.category || "", ticket.source || "", ticket.openedAtLabel || "", ticket.slaLabel || ticket.sla || ""]),
    ]);
    pushToast("Exportacao concluida", `${filteredTickets.length} chamado(s) exportado(s).`);
  };

  const handleQuickAction = (action) => {
    if (!detailTicket || !detailForm) return;

    if (action === "assignSelf") {
      updateTicket(detailTicket.id, { ...detailForm, assignee: user?.name || detailForm.assignee, status: ["aberto", "reaberto"].includes(normalizeText(detailForm.status)) ? "Em andamento" : detailForm.status });
      pushToast("Atalho aplicado", "Chamado assumido por voce.");
      return;
    }
    if (action === "start") {
      updateTicket(detailTicket.id, { ...detailForm, status: "Em andamento" });
      pushToast("Atalho aplicado", "Chamado movido para em andamento.");
      return;
    }
    if (action === "wait") {
      updateTicket(detailTicket.id, { ...detailForm, status: "Aguardando usuario" });
      pushToast("Atalho aplicado", "Chamado movido para aguardando usuario.");
      return;
    }
    if (action === "resolve") {
      if (!String(detailForm.resolutionNotes || "").trim()) {
        pushToast("Solucao obrigatoria", "Preencha a solucao tecnica antes do atalho de encerramento.", "warning");
        return;
      }
      updateTicket(detailTicket.id, { ...detailForm, status: "Resolvido", resolutionNotes: detailForm.resolutionNotes.trim() });
      pushToast("Atalho aplicado", "Chamado resolvido.");
    }
  };

  return (
    <div className="ticket-page">
      <section className="tickets-header board-card">
        <div className="tickets-header-copy">
          <span className="eyebrow">Central de Operacoes</span>
          <h2>Chamados</h2>
          {!canSeeAllTickets ? (
            <p className="module-caption">
              {serviceCenterEnabled
                ? "Visualizacao restrita aos seus chamados e aos departamentos em que voce atua, conforme permissao."
                : "Visualizacao restrita aos seus proprios chamados."}
            </p>
          ) : null}
        </div>
        <form
          className="tickets-header-search"
          onSubmit={(event) => {
            event.preventDefault();
            handleSearchChange(search);
          }}
        >
          <input
            className="toolbar-search"
            onChange={(event) => handleSearchChange(event.target.value)}
            placeholder="Buscar por numero, usuario ou assunto"
            value={search}
          />
        </form>
        <div className="tickets-header-actions">
          <button className="ghost-button interactive-button" onClick={() => handleSearchChange(search)} type="button">
            Buscar
          </button>
          {canCreateTicket ? (
            <button className="primary-button interactive-button" onClick={handleOpenCreateModal} type="button">
              Abrir chamado
            </button>
          ) : null}
        </div>
      </section>

      <section className="ticket-overview-strip">
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
        <div className="insight-chip">
          <strong>{filteredTickets.length}</strong>
          <span>no filtro atual</span>
        </div>
      </section>

      <section className="board-card glpi-panel">
        <div className="glpi-toolbar ticket-list-toolbar">
          <div>
            <h2>Listagem operacional</h2>
            <span>Priorize a fila por impacto e acompanhe os chamados sem perder leitura da operacao.</span>
          </div>
          <div className="toolbar">
            <div className="view-toggle">
              <button className={`filter-pill interactive-button${viewMode === "list" ? " is-active" : ""}`} onClick={() => setViewMode("list")} type="button">
                Lista
              </button>
            </div>
            <button className="ghost-button interactive-button" onClick={() => setShowFilters((current) => !current)} type="button">
              {showFilters ? "Ocultar filtros" : "Mostrar filtros"}
            </button>
            <button className="ghost-button interactive-button" onClick={handleExportTickets} type="button">
              Exportar
            </button>
            {canCreateTicket ? (
              <button className="primary-button interactive-button" onClick={handleOpenCreateModal} type="button">
                Abrir chamado
              </button>
            ) : null}
          </div>
        </div>

        <div className="ticket-list-summary-bar">
          <div className="ticket-list-summary-copy">
            <strong>{filteredTickets.length} chamado(s)</strong>
            <span>{activeFilterCount ? `${activeFilterCount} filtro(s) ativo(s)` : "Sem filtros adicionais ativos"}</span>
          </div>
          <div className="ticket-list-summary-tags">
            {statusFilter !== "Todos" ? <span className="badge badge-neutral">{statusFilter}</span> : null}
            {priorityFilter !== "Todas" ? <span className="badge badge-neutral">{priorityFilter}</span> : null}
            {slaFilter !== "Todos" ? <span className="badge badge-neutral">{slaFilter}</span> : null}
            {search.trim() ? <span className="badge badge-neutral">Busca: {search}</span> : null}
          </div>
        </div>

                {showFilters ? (
          <div className="dashboard-filter-shell compact-filter-shell ticket-filters-panel">
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
            <div className="ticket-create-actions compact-actions">
              <input onChange={(event) => setSavedFilterName(event.target.value)} placeholder="Nome do filtro salvo" value={savedFilterName} />
              <button className="ghost-button interactive-button" onClick={handleSaveCurrentFilter} type="button">
                Salvar filtro
              </button>
              <button className="ghost-button interactive-button" onClick={handleResetFilters} type="button">
                Limpar filtros
              </button>
            </div>
            {savedFilters.length ? (
              <div className="ticket-create-actions compact-actions">
                {savedFilters.map((preset) => (
                  <div className="watcher-chip" key={preset.id}>
                    <button className="ghost-link interactive-button" onClick={() => handleApplySavedFilter(preset.id)} type="button">
                      {preset.name}
                    </button>
                    <button onClick={() => handleDeleteSavedFilter(preset.id)} type="button">
                      x
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="detail-grid">
              <label className="field-block">
                <span>Busca avancada</span>
                <input onChange={updateAdvancedFilter("query")} placeholder="Categoria, origem, local, descricao, solucao ou comentario" value={advancedFilters.query} />
              </label>
              <label className="field-block">
                <span>Solicitante</span>
                <input onChange={updateAdvancedFilter("requester")} placeholder="Nome do solicitante" value={advancedFilters.requester} />
              </label>
              <label className="field-block">
                <span>Tecnico</span>
                <select onChange={updateAdvancedFilter("assignee")} value={advancedFilters.assignee}>
                  {assigneeOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label className="field-block">
                <span>Departamento</span>
                <select onChange={updateAdvancedFilter("department")} value={advancedFilters.department}>
                  {departmentOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label className="field-block">
                <span>Categoria</span>
                <select onChange={updateAdvancedFilter("category")} value={advancedFilters.category}>
                  {categoryOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label className="field-block">
                <span>Fila</span>
                <select onChange={updateAdvancedFilter("queue")} value={advancedFilters.queue}>
                  {queueOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label className="field-block">
                <span>Origem</span>
                <select onChange={updateAdvancedFilter("source")} value={advancedFilters.source}>
                  {["Todas", "Portal", "E-mail", "Telefone", "Monitoramento"].map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label className="field-block">
                <span>Abertura de</span>
                <input onChange={updateAdvancedFilter("dateFrom")} type="date" value={advancedFilters.dateFrom} />
              </label>
              <label className="field-block">
                <span>Abertura ate</span>
                <input onChange={updateAdvancedFilter("dateTo")} type="date" value={advancedFilters.dateTo} />
              </label>
            </div>
          </div>
        ) : null}
        <div className="split-grid split-grid-wide">
          <section className="board-card compact-record-card">
            <div className="card-heading">
              <div>
                <h3>Indicadores por departamento</h3>
                <span>Volume, resolucao e criticidade no filtro atual.</span>
              </div>
            </div>
            <div className="dashboard-performance-table">
              <div className="dashboard-performance-head">
                <span>Departamento</span>
                <span>Total</span>
                <span>Resolvidos</span>
                <span>Criticos</span>
              </div>
              {departmentIndicators.map((item) => (
                <div className="dashboard-performance-row" key={item.label}>
                  <strong>{item.label}</strong>
                  <span>{item.total}</span>
                  <span>{item.resolved}</span>
                  <span>{item.critical}</span>
                </div>
              ))}
            </div>
          </section>
          <section className="board-card compact-record-card">
            <div className="card-heading">
              <div>
                <h3>Indicadores por tecnico</h3>
                <span>Carga, andamento e risco de SLA por responsavel.</span>
              </div>
            </div>
            <div className="dashboard-performance-table">
              <div className="dashboard-performance-head">
                <span>Tecnico</span>
                <span>Total</span>
                <span>Andamento</span>
                <span>Risco SLA</span>
              </div>
              {technicianIndicators.map((item) => (
                <div className="dashboard-performance-row" key={item.label}>
                  <strong>{item.label}</strong>
                  <span>{item.total}</span>
                  <span>{item.inProgress}</span>
                  <span>{item.overdue}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="ticket-rows ticket-rows-wide ticket-list-compact">
          {filteredTickets.length ? (
            filteredTickets.map((ticket) => (
              <button
                className={`ticket-row-card ticket-row-compact interactive-button ${getPriorityRowClass(ticket.priority)}${detailTicketId === ticket.id ? " is-selected" : ""}`}
                key={ticket.id}
                onClick={() => setDetailTicketId(ticket.id)}
                style={getDepartmentColorStyle(departmentDirectory[ticket.departmentId]?.color, { alpha: 0.06 })}
                type="button"
              >
                <div className="ticket-row-headerline">
                  <div className="ticket-row-ticketid">{ticket.id}</div>
                  <div className="ticket-row-badges ticket-row-badges-compact">
                    <span className={`badge ${getPriorityBadgeClass(ticket.priority)}`}>{ticket.priority}</span>
                    <span className={`badge badge-priority-harmony ${getStatusBadgeClass(ticket.status)}`}>{ticket.status}</span>
                    <span className={`badge badge-priority-harmony ${getSlaTone(ticket)}`}>{ticket.slaLabel}</span>
                  </div>
                </div>
                <div className="ticket-row-main ticket-row-main-compact">
                  <div className="ticket-row-title ticket-row-title-compact">
                    <h3>{ticket.title}</h3>
                    <p>{ticket.description}</p>
                  </div>
                  <div className="ticket-row-side-meta">
                    <span className="department-badge" style={getDepartmentColorStyle(departmentDirectory[ticket.departmentId]?.color, { alpha: 0.16 })}>
                      {ticket.department || ticket.queue}
                    </span>
                    <strong>{ticket.assignee || "Sem tecnico"}</strong>
                  </div>
                </div>
                <div className="ticket-row-meta ticket-row-meta-compact">
                  <span>Solicitante: {ticket.requester}</span>
                  <span>Email: {ticket.requesterEmail || "-"}</span>
                  <span>Categoria: {ticket.category || "Geral"}</span>
                  <span>Origem: {ticket.source || "Portal"}</span>
                  <span>Abertura: {ticket.openedAtLabel || "-"}</span>
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
                  <label className="field-block field-full">
                    <span>Departamento de destino</span>
                    <select
                      onChange={updateCreateField("departmentId")}
                      required
                      style={getDepartmentColorStyle(selectedCreateDepartment?.color, { alpha: 0.16 })}
                      value={createForm.departmentId}
                    >
                      <option value="">Selecione o departamento</option>
                      {requestableDepartments.map((department) => (
                        <option key={department.id} style={toDepartmentOptionStyle(department.color)} value={department.id}>
                          {department.name}{department.code ? ` | ${department.code}` : ""}
                        </option>
                      ))}
                    </select>
                    {!requestableDepartments.length ? (
                      <div className="empty-state">
                        <strong>Nenhum departamento disponivel.</strong>
                        <span>Ative departamentos com abertura habilitada em Configuracoes &gt; Central de Servicos.</span>
                      </div>
                    ) : null}
                  </label>
                ) : null}
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
                  <span>Categoria</span>
                  <input onChange={updateCreateField("category")} value={createForm.category} />
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

              <div className="ticket-create-actions compact-actions">
                {canAssignTicket ? (
                  <button className="ghost-button interactive-button" onClick={() => handleQuickAction("assignSelf")} type="button">
                    Assumir chamado
                  </button>
                ) : null}
                {canChangeStatus ? (
                  <button className="ghost-button interactive-button" onClick={() => handleQuickAction("start")} type="button">
                    Iniciar atendimento
                  </button>
                ) : null}
                {canChangeStatus ? (
                  <button className="ghost-button interactive-button" onClick={() => handleQuickAction("wait")} type="button">
                    Aguardar usuario
                  </button>
                ) : null}
                {canCloseTicket ? (
                  <button className="ghost-button interactive-button" onClick={() => handleQuickAction("resolve")} type="button">
                    Resolver agora
                  </button>
                ) : null}
              </div>

              <div className="glpi-info-strip">
                <div>
                  <span>Prioridade</span>
                  <strong className={`badge ${getPriorityBadgeClass(detailForm.priority)}`}>{detailForm.priority}</strong>
                </div>
                <div>
                  <span>Departamento</span>
                  <strong className="badge department-badge" style={getDepartmentColorStyle(detailDepartment?.color, { alpha: 0.16 })}>
                    {detailDepartment?.name || detailForm.department || detailForm.queue}
                  </strong>
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
                    {allowedDetailStatuses.map((status) => (
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
                  <input disabled readOnly value={detailTicket.openedAtLabel || "-"} />
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
                    onChange={(nextValue) =>
                      setDetailForm((current) => ({
                        ...current,
                        assignee: nextValue,
                        status:
                          nextValue && ["aberto", "reaberto"].includes(normalizeText(current.status)) ? "Em andamento" : current.status,
                      }))
                    }
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
                <span>Solucao tecnica</span>
                <textarea disabled={!canEditTicket} onChange={updateDetailField("resolutionNotes")} value={detailForm.resolutionNotes} />
              </label>

              <div className="detail-grid">
                <label className="field-block">
                  <span>Template de solucao</span>
                  <select disabled={!canEditTicket} onChange={(event) => handleApplySolutionTemplate(event.target.value)} value={selectedSolutionTemplateId}>
                    <option value="">Selecione</option>
                    {solutionTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </label>
                {normalizeText(detailForm.status) === "reaberto" ? (
                  <label className="field-block field-full">
                    <span>Motivo da reabertura</span>
                    <textarea disabled={!canEditTicket} onChange={updateDetailField("reopenReason")} value={detailForm.reopenReason || ""} />
                  </label>
                ) : null}
              </div>

              {normalizeText(detailForm.type) === "requisicao" ? (
                <section className="ticket-attachment-panel">
                  <div className="attachment-toolbar glpi-subbar">
                    <div>
                      <strong>Aprovacao da requisicao</strong>
                      <span>Solicite, aprove ou reprove sem remover o restante do fluxo do chamado.</span>
                    </div>
                  </div>
                  <label className="field-block field-full">
                    <span>Justificativa / parecer</span>
                    <textarea onChange={(event) => setApprovalReason(event.target.value)} value={approvalReason} />
                  </label>
                  <div className="ticket-create-actions compact-actions">
                    <button className="ghost-button interactive-button" onClick={() => handleApprovalAction("request")} type="button">
                      Solicitar aprovacao
                    </button>
                    <button className="ghost-button interactive-button" onClick={() => handleApprovalAction("approve")} type="button">
                      Aprovar
                    </button>
                    <button className="danger-button interactive-button" onClick={() => handleApprovalAction("reject")} type="button">
                      Reprovar
                    </button>
                  </div>
                </section>
              ) : null}

              <section className="ticket-attachment-panel">
                <div className="attachment-toolbar glpi-subbar">
                  <div>
                    <strong>Acompanhamentos</strong>
                    <span>Registre novas interacoes tecnicas sem sobrescrever o historico do chamado.</span>
                  </div>
                </div>
                <div className="detail-grid">
                  <label className="field-block">
                    <span>Template de resposta</span>
                    <select disabled={!canEditTicket} onChange={(event) => handleApplyResponseTemplate(event.target.value)} value={selectedResponseTemplateId}>
                      <option value="">Selecione</option>
                      {responseTemplates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field-block">
                    <span>Visibilidade</span>
                    <select disabled={!canEditTicket} onChange={(event) => setFollowUpVisibility(event.target.value)} value={followUpVisibility}>
                      <option value="public">Publico</option>
                      <option value="private">Privado</option>
                    </select>
                  </label>
                </div>
                <label className="field-block field-full">
                  <span>Novo acompanhamento</span>
                  <textarea
                    disabled={!canEditTicket}
                    onChange={(event) => setFollowUpDraft(event.target.value)}
                    placeholder="Descreva a analise, teste executado, retorno ao usuario ou proximo passo."
                    value={followUpDraft}
                  />
                </label>
                {canEditTicket ? (
                  <div className="ticket-create-actions compact-actions">
                    <button className="ghost-button interactive-button" onClick={handleAddFollowUp} type="button">
                      Incluir acompanhamento
                    </button>
                  </div>
                ) : null}
                {visibleFollowUps.length ? (
                  <div className="ticket-rows">
                    {visibleFollowUps.map((followUp) => (
                      <article className="ticket-row-card" key={followUp.id}>
                        <div className="ticket-row-main">
                          <div className="ticket-row-title">
                            <strong>{followUp.actorName || "Sistema"}</strong>
                            <h3>{followUp.message}</h3>
                          </div>
                          <div className="ticket-row-badges">
                            <span className="badge badge-neutral">{followUp.visibility === "public" ? "publico" : "privado"}</span>
                          </div>
                        </div>
                        <div className="ticket-row-meta">
                          <span>{followUp.createdAtLabel}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <strong>Nenhum acompanhamento registrado.</strong>
                    <span>Use o campo acima para documentar cada interacao tecnica deste chamado.</span>
                  </div>
                )}
              </section>

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
                    <strong>Timeline visual do ticket</strong>
                    <span>Auditoria, acompanhamentos publicos e privados em ordem cronologica unica.</span>
                  </div>
                </div>
                {detailTimeline.length ? (
                  <div className="ticket-rows">
                    {detailTimeline.map((entry) => (
                      <article className="ticket-row-card" key={entry.id}>
                        <div className="ticket-row-main">
                          <div className="ticket-row-title">
                            <strong>{entry.title}</strong>
                            <h3>{entry.actorName}</h3>
                          </div>
                          <div className="ticket-row-badges">
                            <span className={`badge ${entry.tone}`}>{entry.type}</span>
                            <span className="badge badge-neutral">{entry.visibility}</span>
                          </div>
                        </div>
                        <div className="ticket-row-meta">
                          <span>{entry.createdAtLabel}</span>
                          <span>{entry.source === "followUp" ? "acompanhamento" : "auditoria"}</span>
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
                {canCloseTicket ? (
                  <button className="ghost-button interactive-button" onClick={handleFinishTicket} type="button">
                    Finalizar chamado
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

























