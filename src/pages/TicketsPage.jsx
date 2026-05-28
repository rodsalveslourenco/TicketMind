import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import UserAutocomplete from "../components/UserAutocomplete";
import { useAuth } from "../auth/AuthContext";
import { getDepartmentColorStyle, normalizeDepartmentColor } from "../data/departments";
import { hasAnyPermission } from "../data/permissions";
import {
  PRIORITY_LEVELS,
  TICKET_STATUSES,
  createFollowUpEntry,
  getTicketStatusOptionsForType,
  normalizeText,
  resolveTicketSlaSettings,
  statusRequiresPauseReason,
  statusRequiresWaitingReason,
} from "../data/helpdesk";
import { useAppData } from "../data/AppDataContext";
import { downloadCsv } from "../lib/export";
import { useUiPreferences } from "../ui/UiPreferencesContext";
import { DEFAULT_WATCHER_EVENT_KEYS } from "../data/ticketAutomation";

const defaultCreateForm = {
  title: "",
  type: "Incidente",
  departmentId: "",
  projectId: "",
  assetId: "",
  approvalApproverId: "",
  approvalAmount: "",
  category: "Geral",
  location: "",
  priority: "Media",
  urgency: "Media",
  impact: "Media",
  slaTargetMinutes: "240",
  watchers: [],
  watcherEventKeys: [...DEFAULT_WATCHER_EVENT_KEYS],
  description: "",
  attachments: [],
  knowledgeArticleIds: [],
  parentTicketId: "",
};

const priorityLegend = [
  { label: "Crítico", value: "Critica", className: "priority-line-critica" },
  { label: "Alto", value: "Alta", className: "priority-line-alta" },
  { label: "Médio", value: "Media", className: "priority-line-media" },
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

const reopenReasonTemplates = [
  { id: "reopen-1", label: "Falha voltou a ocorrer", category: "Reincidencia", content: "O problema voltou a ocorrer apos o encerramento anterior." },
  { id: "reopen-2", label: "Solucao incompleta", category: "Correcao parcial", content: "A solucao aplicada anteriormente nao resolveu todo o escopo informado." },
  { id: "reopen-3", label: "Validacao do usuario reprovada", category: "Validacao", content: "O usuario validou e informou que o comportamento esperado nao foi atingido." },
];

const ticketMacros = [
  { id: "macro-1", label: "Assumir e iniciar", status: "Em andamento", assignSelf: true, followUpVisibility: "private", followUpMessage: "Chamado assumido e iniciado para analise tecnica." },
  { id: "macro-2", label: "Responder e aguardar", status: "Aguardando usuario", assignSelf: false, followUpVisibility: "public", followUpMessage: "Retorno enviado ao solicitante. Atendimento aguardando validacao do usuario." },
  { id: "macro-3", label: "Assumir e solicitar aprovacao", status: "Aguardando aprovacao", assignSelf: true, followUpVisibility: "public", followUpMessage: "Analise inicial concluida. Fluxo movido para aprovacao da requisicao." },
];

const checklistByType = {
  incidente: ["Registrar impacto", "Validar ambiente afetado", "Executar diagnostico inicial", "Retornar proximo passo ao solicitante"],
  requisicao: ["Validar dados do solicitante", "Conferir aprovacao necessaria", "Executar atendimento solicitado", "Registrar evidencia de entrega"],
  problema: ["Relacionar causa raiz", "Mapear recorrencia", "Definir acao corretiva", "Documentar prevencao futura"],
};

const requestTypeProfiles = {
  incidente: {
    category: "Infraestrutura",
    priority: "Alta",
    helper: "Use para indisponibilidade, falha operacional ou impacto técnico imediato.",
    suggestedFields: ["Localização", "Categoria", "Urgência"],
  },
  requisicao: {
    category: "Acesso",
    priority: "Media",
    helper: "Use para acesso, liberação, cadastro, compra ou qualquer entrega dependente de aprovação.",
    suggestedFields: ["Aprovador", "Projeto", "Observadores"],
  },
  problema: {
    category: "Análise de causa",
    priority: "Alta",
    helper: "Use para causa raiz, recorrência e correções estruturais.",
    suggestedFields: ["Projeto", "Ativo", "Descrição técnica"],
  },
};

const categoryFieldRules = [
  {
    match: ["acesso"],
    message: "Categoria de acesso exige e-mail do solicitante e aprovador para requisições.",
    validate: (form) =>
      Boolean(String(form.requesterEmail || "").trim()) &&
      (normalizeText(form.type) !== "requisicao" || Boolean(String(form.approvalApproverId || "").trim())),
  },
  {
    match: ["infraestrutura", "rede", "facilities"],
    message: "Categorias operacionais exigem localização informada.",
    validate: (form) => Boolean(String(form.location || "").trim()),
  },
  {
    match: ["hardware", "equipamento", "ativo"],
    message: "Categorias de ativo exigem vínculo com ativo ou localização.",
    validate: (form) => Boolean(String(form.assetId || "").trim() || String(form.location || "").trim()),
  },
  {
    match: ["projeto", "projetos", "demanda de projeto"],
    message: "Categorias de projeto exigem vínculo com um projeto.",
    validate: (form) => Boolean(String(form.projectId || "").trim()),
  },
];

const TICKET_GRID_COLUMNS = [
  { key: "requester", label: "Solicitante", defaultVisible: true },
  { key: "email", label: "E-mail", defaultVisible: false },
  { key: "category", label: "Categoria", defaultVisible: true },
  { key: "department", label: "Departamento", defaultVisible: true },
  { key: "queue", label: "Fila", defaultVisible: true },
  { key: "urgency", label: "Urgência", defaultVisible: true },
  { key: "openedAt", label: "Abertura", defaultVisible: true },
  { key: "source", label: "Origem", defaultVisible: false },
  { key: "assignee", label: "Técnico", defaultVisible: false },
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

function getOperationalPriorityRowClass(ticket) {
  if (ticket?.isOverdue || normalizeText(ticket?.priority) === "critica") return "priority-line-critica";
  return getPriorityRowClass(ticket?.priority);
}

function getPrioritySortRank(ticket) {
  if (ticket?.isOverdue) return 0;
  const normalized = normalizeText(ticket?.priority);
  if (normalized === "critica") return 1;
  if (normalized === "alta") return 2;
  if (normalized === "media") return 3;
  return 4;
}

function isTriageTicket(ticket) {
  const status = normalizeText(ticket?.status);
  return status === "aberto" || ticket?.unassigned || ticket?.criticalWaitingTechnician;
}

function isInAttendanceTicket(ticket) {
  const status = normalizeText(ticket?.status);
  return ["em andamento", "em atendimento", "aguardando usuario", "aguardando aprovacao", "reaberto"].includes(status);
}

function getStatusBadgeClass(status) {
  const normalized = normalizeText(status);
  if (normalized === "aberto") return "status-badge-aberto";
  if (normalized === "em andamento") return "status-badge-andamento";
  if (normalized === "em espera") return "status-badge-aguardando";
  if (normalized === "pausado") return "badge-neutral";
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

function getOperationalSla(ticket) {
  const deadlineValue = ticket?.slaDeadlineAt || ticket?.dueDate || "";
  const deadline = deadlineValue ? new Date(deadlineValue).getTime() : Number.NaN;
  if (!Number.isFinite(deadline)) {
    return {
      label: ticket?.slaLabel ? `SLA: ${ticket.slaLabel}` : "SLA: sem prazo",
      className: "status-badge-aguardando",
    };
  }
  const diffMs = deadline - Date.now();
  const absoluteHours = Math.abs(diffMs) / 3600000;
  const amount = absoluteHours < 24 ? `${Math.max(1, Math.round(absoluteHours))}h` : `${Math.max(1, Math.round(absoluteHours / 24))}d`;
  if (diffMs < 0) {
    return { label: `SLA: vencido há ${amount}`, className: "status-badge-reaberto" };
  }
  if (diffMs <= 4 * 3600000 || ticket?.dueSoon) {
    return { label: `SLA: vence em ${amount}`, className: "status-badge-aguardando" };
  }
  return { label: `SLA: vence em ${amount}`, className: "status-badge-resolvido" };
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

function buildChecklistTemplate(type) {
  const labels = checklistByType[normalizeText(type)] || checklistByType.incidente;
  return labels.map((label, index) => ({
    id: `check-template-${normalizeText(type || "incidente")}-${index}`,
    label,
    checked: false,
  }));
}

function formatSlaMinutesLabel(minutes) {
  const normalizedMinutes = Number(minutes) || 0;
  if (normalizedMinutes < 60) return `${normalizedMinutes} min`;
  if (normalizedMinutes % 60 === 0) return `${normalizedMinutes / 60}h`;
  return `${(normalizedMinutes / 60).toFixed(1)}h`;
}

function getTypeProfile(type) {
  return requestTypeProfiles[normalizeText(type)] || requestTypeProfiles.incidente;
}

function getDynamicCategoryValidation(formLike = {}) {
  const normalizedCategory = normalizeText(formLike.category);
  const matchedRule = categoryFieldRules.find((rule) => rule.match.some((item) => normalizedCategory.includes(normalizeText(item))));
  if (!matchedRule) return "";
  return matchedRule.validate(formLike) ? "" : matchedRule.message;
}

function TicketsPage() {
  const {
    addTicketAttachments,
    allTickets,
    assets,
    canViewAllTickets,
    createKnowledgeArticleFromTicket,
    createTicket,
    deleteTicket,
    departments,
    knowledgeArticles,
    linkKnowledgeArticleToTicket,
    projects,
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
  const { getModulePreference, setModulePreference } = useUiPreferences();
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
  const [showFilters, setShowFilters] = useState(false);
  const [showGridConfig, setShowGridConfig] = useState(false);
  const [activeQueueTab, setActiveQueueTab] = useState("triage");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState(getFreshCreateForm);
  const [watcherQuery, setWatcherQuery] = useState("");
  const [createKnowledgeQuery, setCreateKnowledgeQuery] = useState("");
  const [detailTicketId, setDetailTicketId] = useState(null);
  const [previewTicketId, setPreviewTicketId] = useState(null);
  const [detailForm, setDetailForm] = useState(null);
  const [followUpVisibility, setFollowUpVisibility] = useState("public");
  const [selectedResponseTemplateId, setSelectedResponseTemplateId] = useState("");
  const [selectedSolutionTemplateId, setSelectedSolutionTemplateId] = useState("");
  const [selectedReopenTemplateId, setSelectedReopenTemplateId] = useState("");
  const [selectedMacroId, setSelectedMacroId] = useState("");
  const [approvalReason, setApprovalReason] = useState("");
  const [followUpDraft, setFollowUpDraft] = useState("");
  const [followUpTeamIds, setFollowUpTeamIds] = useState([]);
  const [followUpFilter, setFollowUpFilter] = useState("all");
  const [knowledgeQuery, setKnowledgeQuery] = useState("");
  const [timelineFilter, setTimelineFilter] = useState("all");
  const [subtaskDraft, setSubtaskDraft] = useState("");
  const [progressNoteRequest, setProgressNoteRequest] = useState(null);
  const [progressNoteText, setProgressNoteText] = useState("");
  const [completionAttachments, setCompletionAttachments] = useState([]);
  const [activeDetailWorkspace, setActiveDetailWorkspace] = useState("");
  const [activeDetailTab, setActiveDetailTab] = useState("data");
  const [showTriagePanel, setShowTriagePanel] = useState(() => Boolean(getModulePreference("tickets", "showTriagePanel", true)));
  const [analystPreviewMode, setAnalystPreviewMode] = useState(() => Boolean(getModulePreference("tickets", "analystPreviewMode", true)));
  const [visibleColumns, setVisibleColumns] = useState(
    () => getModulePreference("tickets", "visibleColumns", TICKET_GRID_COLUMNS.filter((column) => column.defaultVisible).map((column) => column.key)),
  );
  const createInputRef = useRef(null);
  const detailInputRef = useRef(null);
  const completionInputRef = useRef(null);
  const watcherBoxRef = useRef(null);
  const canCreateTicket = hasAnyPermission(user, ["tickets_create", "tickets_admin"]);
  const canEditTicket = hasAnyPermission(user, ["tickets_edit", "tickets_admin"]);
  const canCloseTicket = hasAnyPermission(user, ["tickets_close", "tickets_admin"]);
  const canRecordResolution = hasAnyPermission(user, ["tickets_edit", "tickets_close", "tickets_admin"]);
  const canReopenTicket = hasAnyPermission(user, ["tickets_reopen", "tickets_admin"]);
  const canDeleteTicket = hasAnyPermission(user, ["tickets_delete", "tickets_admin"]);
  const canViewPrivateFollowUps = hasAnyPermission(user, ["tickets_admin", "tickets_edit", "tickets_assign", "tickets_change_status"]);
  const canAssignTicket = hasAnyPermission(user, ["tickets_assign", "tickets_admin"]);
  const canChangePriority = hasAnyPermission(user, ["tickets_change_priority", "tickets_admin"]);
  const canChangeStatus = hasAnyPermission(user, ["tickets_change_status", "tickets_admin"]);
  const canManageAttachments = hasAnyPermission(user, ["tickets_edit", "tickets_admin"]);
  const canCreateKnowledge = hasAnyPermission(user, ["knowledge_create", "knowledge_admin"]);
  const canRequestApproval = hasAnyPermission(user, ["tickets_edit", "tickets_admin"]);
  const canDecideApproval = hasAnyPermission(user, ["tickets_close", "tickets_admin"]);
  const canSeeAllTickets = Boolean(canViewAllTickets);
  const canUseAnalystPreview = hasAnyPermission(user, ["tickets_edit", "tickets_assign", "tickets_change_status", "tickets_admin"]);
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
  const activeProjectOptions = useMemo(
    () => (projects || []).filter((project) => normalizeText(project.status || "Ativo") !== "encerrado" && normalizeText(project.status || "") !== "excluido"),
    [projects],
  );
  const activeAssetOptions = useMemo(
    () => (assets || []).filter((asset) => !["baixado", "excluido"].includes(normalizeText(asset.status || ""))),
    [assets],
  );
  const createTypeProfile = useMemo(() => getTypeProfile(createForm.type), [createForm.type]);

  const detailTicket = tickets.find((ticket) => ticket.id === detailTicketId) ?? null;
  const previewTicket = tickets.find((ticket) => ticket.id === previewTicketId) ?? null;
  const isCurrentUserAssignedToDetailTicket =
    Boolean(detailTicket) && normalizeText(detailForm?.assignee || detailTicket?.assignee || "") === normalizeText(user?.name || "");
  const canManageManualSla = hasAnyPermission(user, ["tickets_admin"]) || isCurrentUserAssignedToDetailTicket;
  const isDetailResolved = normalizeText(detailTicket?.status) === "resolvido";
  const isDetailReopened = normalizeText(detailTicket?.status) === "reaberto";
  const isDetailLocked = isDetailResolved;
  const detailTypeProfile = useMemo(() => getTypeProfile(detailForm?.type), [detailForm?.type]);
  const detailStatusOptions = useMemo(
    () => getTicketStatusOptionsForType(detailForm?.type || detailTicket?.type || "Incidente", serviceCenter || {}),
    [detailForm?.type, detailTicket?.type, serviceCenter],
  );
  const parentTicketOptions = useMemo(
    () => tickets.filter((ticket) => ticket.id !== detailTicket?.id && normalizeText(ticket.status) !== "resolvido"),
    [detailTicket?.id, tickets],
  );
  const childTickets = useMemo(
    () => tickets.filter((ticket) => String(ticket.parentTicketId || "").trim() === String(detailTicket?.id || "").trim()),
    [detailTicket?.id, tickets],
  );
  const visibleFollowUps = (detailTicket?.followUps || []).filter((followUp) => {
    if (followUp.visibility === "public") return true;
    if (!canViewPrivateFollowUps) return false;
    const audienceTeamIds = Array.isArray(followUp.audienceTeamIds) ? followUp.audienceTeamIds : [];
    if (!audienceTeamIds.length) return true;
    return audienceTeamIds.includes(String(user?.departmentId || "").trim()) || hasAnyPermission(user, ["tickets_admin"]);
  });
  const filteredFollowUps = useMemo(() => {
    if (followUpFilter === "public") return visibleFollowUps.filter((followUp) => followUp.visibility === "public");
    if (followUpFilter === "private") return visibleFollowUps.filter((followUp) => followUp.visibility === "private");
    return visibleFollowUps;
  }, [followUpFilter, visibleFollowUps]);
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
      attachments: Array.isArray(entry.metadata?.attachments) ? entry.metadata.attachments : [],
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

    const approvalEntries = (detailTicket.approval?.history || []).map((entry) => ({
      id: `approval-${entry.id}`,
      source: "approval",
      tone: normalizeText(entry.action) === "rejected" ? "status-badge-reaberto" : "status-badge-resolvido",
      title:
        normalizeText(entry.action) === "requested"
          ? `Aprovacao solicitada${entry.reason ? `: ${entry.reason}` : ""}`
          : normalizeText(entry.action) === "approved"
            ? `Aprovacao aprovada${entry.reason ? `: ${entry.reason}` : ""}`
            : normalizeText(entry.action) === "rejected"
              ? `Aprovacao reprovada${entry.reason ? `: ${entry.reason}` : ""}`
              : `Atualizacao de aprovacao${entry.reason ? `: ${entry.reason}` : ""}`,
      actorName: entry.actorName || entry.approverName || "Sistema",
      visibility: "approval",
      type: `approval_${entry.action || "updated"}`,
      createdAt: entry.createdAt || "",
      createdAtLabel: entry.createdAtLabel || "",
    }));

    return [...followUpEntries, ...approvalEntries, ...historyEntries].sort((left, right) => {
      const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0;
      const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0;
      return rightTime - leftTime;
    });
  }, [detailTicket, visibleFollowUps]);
  const filteredDetailTimeline = useMemo(() => {
    if (timelineFilter === "comments") return detailTimeline.filter((entry) => entry.source === "followUp");
    if (timelineFilter === "audit") return detailTimeline.filter((entry) => entry.source === "history");
    if (timelineFilter === "approval") {
      return detailTimeline.filter((entry) => entry.source === "approval" || String(entry.type || "").startsWith("approval_") || normalizeText(entry.title).includes("aprov"));
    }
    return detailTimeline;
  }, [detailTimeline, timelineFilter]);
  const detailConversationEntries = useMemo(() => {
    if (!detailTicket) return [];
    const openedAt = detailTicket.openedAt || "";
    const openedLabel = detailTicket.openedAtLabel || "";
    const entries = [
      {
        id: `conversation-form-${detailTicket.id}`,
        source: "form",
        actorName: detailTicket.requester || "Solicitante",
        createdAt: openedAt,
        createdAtLabel: openedLabel,
        title: "Dados do formulário",
        message: detailTicket.description || "Chamado aberto sem descrição detalhada.",
        meta: [
          `Título: ${detailTicket.title || "-"}`,
          `Tipo: ${detailTicket.type || "-"}`,
          `Categoria: ${detailTicket.category || "-"}`,
          `Departamento: ${detailTicket.department || detailTicket.queue || "-"}`,
        ],
        tone: "conversation-form",
        visibility: "solicitante",
      },
      ...detailTimeline
        .filter((entry) => entry.source !== "history")
        .map((entry) => ({
          ...entry,
          message: entry.title,
          meta: [
            entry.source === "followUp" ? "Acompanhamento" : entry.source === "approval" ? "Aprovação" : "Movimentação",
            entry.visibility === "private" ? "Interno" : entry.visibility === "approval" ? "Aprovação" : "Público",
          ],
          tone: entry.source === "followUp" ? "conversation-followup" : entry.source === "approval" ? "conversation-approval" : "conversation-task",
        })),
      ...(detailTicket.subtasks || []).map((task) => ({
        id: `conversation-task-${task.id}`,
        source: "task",
        actorName: task.ownerName || detailTicket.assignee || "Equipe técnica",
        createdAt: task.completedAt || task.createdAt || openedAt,
        createdAtLabel: normalizeText(task.status) === "concluida" ? task.completedAtLabel || "Concluída" : task.createdAtLabel || "",
        title: normalizeText(task.status) === "concluida" ? "Tarefa concluída" : "Tarefa criada",
        message: task.title,
        meta: [`Status: ${task.status || "Pendente"}`],
        tone: normalizeText(task.status) === "concluida" ? "conversation-task-done" : "conversation-task",
        visibility: "tarefa",
      })),
    ];

    if (normalizeText(detailTicket.status) === "resolvido") {
      entries.push({
        id: `conversation-resolution-${detailTicket.id}`,
        source: "resolution",
        actorName: detailTicket.assignee || user?.name || "Equipe técnica",
        createdAt: detailTicket.resolvedAt || detailTicket.updatedAt || "",
        createdAtLabel: detailTicket.resolvedAtLabel || detailTicket.updatedAtLabel || "",
        title: "Chamado finalizado",
        message: detailTicket.resolutionNotes || "Chamado resolvido.",
        meta: ["Finalização"],
        tone: "conversation-resolution",
        visibility: "resolução",
      });
    }

    return entries.sort((left, right) => {
      const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0;
      const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0;
      return leftTime - rightTime;
    });
  }, [detailTicket, detailTimeline, user?.name]);
  const reopenCount = useMemo(
    () => (detailTicket?.history || []).filter((entry) => normalizeText(entry.type) === "reopened").length,
    [detailTicket?.history],
  );
  const recurrenceLabel = useMemo(() => {
    if (!detailTicket) return "Sem recorrencia";
    if (reopenCount >= 3) return "Recorrencia cronica";
    if (reopenCount === 2) return "Recorrencia alta";
    if (reopenCount === 1) return "Primeira recorrencia";
    return "Sem recorrencia";
  }, [detailTicket, reopenCount]);
  const currentDetailDepartmentId = detailForm?.departmentId || detailTicket?.departmentId || "";
  const detailDepartment = currentDetailDepartmentId ? serviceDepartmentDirectory[currentDetailDepartmentId] || null : null;
  const assigneeDepartment = serviceCenterEnabled ? detailDepartment?.serviceConfig || {} : null;
  const visibleGridColumns = useMemo(
    () => TICKET_GRID_COLUMNS.filter((column) => visibleColumns.includes(column.key)),
    [visibleColumns],
  );

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
  const approvalCandidates = useMemo(
    () =>
      users.filter(
        (candidate) =>
          normalizeText(candidate.status || "Ativo") !== "inativo" &&
          hasAnyPermission(candidate, ["tickets_close", "tickets_admin"]),
      ),
    [users],
  );
  const suggestedAssignees = useMemo(() => {
    if (!detailTicket) return [];
    const openStatuses = new Set(["aberto", "em andamento", "aguardando usuario", "aguardando aprovacao", "reaberto"]);
    const workloadByName = tickets.reduce((accumulator, ticket) => {
      const normalizedAssignee = normalizeText(ticket.assignee);
      if (!normalizedAssignee || !openStatuses.has(normalizeText(ticket.status))) return accumulator;
      return {
        ...accumulator,
        [normalizedAssignee]: (accumulator[normalizedAssignee] || 0) + 1,
      };
    }, {});
    return assigneeUsers
      .map((candidate) => {
        const departmentScore = candidate.departmentId && candidate.departmentId === currentDetailDepartmentId ? 2 : 0;
        const teamScore = normalizeText(candidate.team).includes(normalizeText(detailTicket.category)) ? 1 : 0;
        const workload = workloadByName[normalizeText(candidate.name)] || 0;
        return {
          id: candidate.id,
          name: candidate.name,
          team: candidate.team || candidate.department || "",
          workload,
          score: departmentScore + teamScore - workload * 0.15,
        };
      })
      .sort((left, right) => right.score - left.score)
      .slice(0, 4);
  }, [assigneeUsers, currentDetailDepartmentId, detailTicket, tickets]);

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
    setModulePreference("tickets", "visibleColumns", visibleColumns);
  }, [setModulePreference, visibleColumns]);

  useEffect(() => {
    setModulePreference("tickets", "showTriagePanel", showTriagePanel);
  }, [setModulePreference, showTriagePanel]);

  useEffect(() => {
    setModulePreference("tickets", "analystPreviewMode", analystPreviewMode);
  }, [analystPreviewMode, setModulePreference]);

  useEffect(() => {
    const nextVisibleColumns = getModulePreference(
      "tickets",
      "visibleColumns",
      TICKET_GRID_COLUMNS.filter((column) => column.defaultVisible).map((column) => column.key),
    );
    setVisibleColumns(Array.isArray(nextVisibleColumns) && nextVisibleColumns.length ? nextVisibleColumns : TICKET_GRID_COLUMNS.filter((column) => column.defaultVisible).map((column) => column.key));
    setShowTriagePanel(Boolean(getModulePreference("tickets", "showTriagePanel", true)));
    setAnalystPreviewMode(Boolean(getModulePreference("tickets", "analystPreviewMode", true)));
  }, [getModulePreference, user?.id]);

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
    if (normalizeText(slaFilter) === "critico sem tecnico") {
      currentTickets = currentTickets.filter((ticket) => ticket.criticalWaitingTechnician);
    }
    if (normalizeText(slaFilter) === "sem tecnico") {
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

    return currentTickets.slice().sort((left, right) => {
      const rankDelta = getPrioritySortRank(left) - getPrioritySortRank(right);
      if (rankDelta !== 0) return rankDelta;
      const leftOpenedAt = left.openedAt ? new Date(left.openedAt).getTime() : 0;
      const rightOpenedAt = right.openedAt ? new Date(right.openedAt).getTime() : 0;
      return rightOpenedAt - leftOpenedAt;
    });
  }, [advancedFilters, priorityFilter, search, searchTickets, slaFilter, statusFilter, tickets]);
  const triageTickets = useMemo(
    () => filteredTickets.filter(isTriageTicket),
    [filteredTickets],
  );
  const attendanceTickets = useMemo(() => filteredTickets.filter((ticket) => isInAttendanceTicket(ticket) && !isTriageTicket(ticket)), [filteredTickets]);
  const displayedTickets = useMemo(() => {
    if (activeQueueTab === "triage") return triageTickets;
    if (activeQueueTab === "attendance") return attendanceTickets;
    return filteredTickets;
  }, [activeQueueTab, attendanceTickets, filteredTickets, triageTickets]);

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

  const activeFilterCount = useMemo(() => {
    const advancedValues = Object.values(advancedFilters).filter((value) => {
      if (!value) return false;
      return !["Todos", "Todas"].includes(String(value));
    });

    return [
      statusFilter !== "Todos",
      priorityFilter !== "Todas",
      slaFilter !== "Todos",
      search.trim().length > 0,
      advancedValues.length > 0,
    ].filter(Boolean).length;
  }, [advancedFilters, priorityFilter, search, slaFilter, statusFilter]);

  const linkedArticles = useMemo(
    () =>
      detailTicket
        ? knowledgeArticles.filter((article) => (detailTicket.knowledgeArticleIds || []).includes(article.id))
        : [],
    [detailTicket, knowledgeArticles],
  );
  const articleSuggestions = useMemo(
    () => {
      const automaticQuery = [detailForm?.title, detailForm?.category, detailForm?.description, detailForm?.resolutionNotes].join(" ");
      const query = normalizeText(knowledgeQuery) ? knowledgeQuery : automaticQuery;
      return normalizeText(query)
        ? searchKnowledgeArticles(query, knowledgeArticles)
            .filter((article) => article.status === "Ativo")
            .filter((article) => !(detailTicket?.knowledgeArticleIds || []).includes(article.id))
            .slice(0, 6)
        : [];
    },
    [detailForm?.category, detailForm?.description, detailForm?.resolutionNotes, detailForm?.title, detailTicket?.knowledgeArticleIds, knowledgeArticles, knowledgeQuery, searchKnowledgeArticles],
  );
  const createArticleSuggestions = useMemo(
    () => {
      const automaticQuery = [createForm.title, createForm.category, createForm.description].join(" ");
      const query = normalizeText(createKnowledgeQuery) ? createKnowledgeQuery : automaticQuery;
      return normalizeText(query)
        ? searchKnowledgeArticles(query, knowledgeArticles)
            .filter((article) => article.status === "Ativo")
            .filter((article) => !(createForm.knowledgeArticleIds || []).includes(article.id))
            .slice(0, 6)
        : [];
    },
    [createForm.category, createForm.description, createForm.knowledgeArticleIds, createForm.title, createKnowledgeQuery, knowledgeArticles, searchKnowledgeArticles],
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
  const globalSearchResults = useMemo(() => {
    const normalizedQuery = normalizeText(search);
    if (normalizedQuery.length < 2) {
      return { tickets: [], users: [], assets: [], articles: [] };
    }
    return {
      tickets: filteredTickets.slice(0, 5),
      users: users
        .filter((candidate) => [candidate.name, candidate.email, candidate.team, candidate.department].some((value) => normalizeText(value).includes(normalizedQuery)))
        .slice(0, 4),
      assets: activeAssetOptions
        .filter((asset) => [asset.tag, asset.name, asset.serialNumber, asset.location].some((value) => normalizeText(value).includes(normalizedQuery)))
        .slice(0, 4),
      articles: searchKnowledgeArticles(search, knowledgeArticles).slice(0, 4),
    };
  }, [activeAssetOptions, filteredTickets, knowledgeArticles, search, searchKnowledgeArticles, users]);

  useEffect(() => {
    if (!detailTicket) {
      setDetailForm(null);
      setFollowUpDraft("");
      setSubtaskDraft("");
      setCompletionAttachments([]);
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
      pauseReason: detailTicket.pauseReason || "",
      waitingReason: detailTicket.waitingReason || "",
      reopenReason: detailTicket.reopenReason || "",
      reopenCategory: detailTicket.reopenCategory || "",
      priority: detailTicket.priority,
      urgency: detailTicket.urgency || detailTicket.priority,
      impact: detailTicket.impact || detailTicket.priority,
      slaTargetMinutes: String(detailTicket.slaTargetMinutes || 240),
      dueDate: detailTicket.dueDate ? detailTicket.dueDate.slice(0, 10) : "",
      watchers: detailTicket.watchers || "",
      approvalAmount: String(detailTicket.approvalAmount || ""),
      knowledgeArticleIds: detailTicket.knowledgeArticleIds || [],
      approvalApproverId: detailTicket.approval?.approverId || "",
      approvalApproverName: detailTicket.approval?.approverName || "",
      projectId: detailTicket.projectId || "",
      projectName: detailTicket.projectName || "",
      assetId: detailTicket.assetId || "",
      assetName: detailTicket.assetName || "",
      parentTicketId: detailTicket.parentTicketId || "",
      subtasks: detailTicket.subtasks || [],
      checklistItems: detailTicket.checklistItems || buildChecklistTemplate(detailTicket.type),
    });
    setFollowUpDraft("");
    setFollowUpVisibility("public");
    setFollowUpTeamIds([]);
    setFollowUpFilter("all");
    setSelectedResponseTemplateId("");
    setSelectedSolutionTemplateId("");
    setSelectedReopenTemplateId("");
    setSelectedMacroId("");
    setApprovalReason(detailTicket.approval?.decisionReason || "");
    setTimelineFilter("all");
    setSubtaskDraft("");
    setCompletionAttachments([]);
    setActiveDetailWorkspace("");
    setActiveDetailTab("data");
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

  useEffect(() => {
    if (!detailTicket || !detailForm) return undefined;

    const handleKeydown = (event) => {
      if (!event.altKey) return;
      if (event.target instanceof HTMLElement) {
        const tagName = event.target.tagName.toLowerCase();
        if (["input", "textarea", "select"].includes(tagName)) return;
      }

      const actionKey = event.key.toLowerCase();
      if (actionKey === "a" && canAssignTicket) {
        event.preventDefault();
        handleQuickAction("assignSelf");
      }
      if (actionKey === "i" && canChangeStatus) {
        event.preventDefault();
        handleQuickAction("start");
      }
      if (actionKey === "u" && canChangeStatus) {
        event.preventDefault();
        handleQuickAction("wait");
      }
      if (actionKey === "r" && canCloseTicket) {
        event.preventDefault();
        handleQuickAction("resolve");
      }
    };

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [canAssignTicket, canChangeStatus, canCloseTicket, detailForm, detailTicket]);

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
  const toggleDetailWorkspace = (workspace) => {
    setActiveDetailWorkspace((current) => (current === workspace ? "" : workspace));
    setActiveDetailTab("followup");
  };
  const updateDetailDueDateField = (event) => {
    const nextDueDate = event.target.value;
    setDetailForm((current) => {
      const slaSettings = resolveTicketSlaSettings({
        openedAt: detailTicket?.openedAt,
        dueDate: nextDueDate,
        slaTargetMinutes: current?.slaTargetMinutes || detailTicket?.slaTargetMinutes || 240,
      });
      return {
        ...current,
        dueDate: nextDueDate,
        slaTargetMinutes: String(slaSettings.slaTargetMinutes),
      };
    });
  };

  const handleCreateTypeChange = (event) => {
    const nextType = event.target.value;
    const profile = getTypeProfile(nextType);
    setCreateForm((current) => ({
      ...current,
      type: nextType,
      category: !current.category || current.category === "Geral" ? profile.category : current.category,
      priority: current.priority === "Media" ? profile.priority : current.priority,
      urgency: current.urgency === "Media" ? profile.priority : current.urgency,
      impact: current.impact === "Media" ? profile.priority : current.impact,
    }));
  };

  const handleDetailTypeChange = (event) => {
    const nextType = event.target.value;
    const profile = getTypeProfile(nextType);
    setDetailForm((current) => ({
      ...current,
      type: nextType,
      category: !current.category || current.category === "Geral" ? profile.category : current.category,
      checklistItems: current.checklistItems?.length ? current.checklistItems : buildChecklistTemplate(nextType),
    }));
  };

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

  const handleCompletionAttachments = async (event) => {
    const nextFiles = Array.from(event.target.files || []);
    if (!nextFiles.length) return;
    const attachments = await Promise.all(nextFiles.map(readFileAsDataUrl));
    setCompletionAttachments((current) => [...current, ...attachments]);
    event.target.value = "";
  };

  const handleOpenCreateModal = () => {
    setCreateForm(getFreshCreateForm());
    setWatcherQuery("");
    setCreateKnowledgeQuery("");
    setShowCreateForm(true);
  };

  const handleOpenTicketPreview = (ticketId) => {
    if (canUseAnalystPreview && analystPreviewMode) {
      setPreviewTicketId(ticketId);
      return;
    }
    setDetailTicketId(ticketId);
  };

  const handleOpenTicketDetail = (ticketId) => {
    setPreviewTicketId(ticketId);
    setDetailTicketId(ticketId);
  };

  const handleCloseTicketDetail = () => {
    setDetailTicketId(null);
    setPreviewTicketId(null);
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

  const handleCreateSubmit = async (event) => {
    event.preventDefault();
    if (!createForm.title || !user?.name || !createForm.description) return;
    if (serviceCenterEnabled && !createForm.departmentId) {
      pushToast("Departamento obrigatorio", "Selecione um departamento para abrir o chamado.", "warning");
      return;
    }
    const dynamicCreateValidation = getDynamicCategoryValidation({
      ...createForm,
      requesterEmail: user?.email || "",
    });
    if (dynamicCreateValidation) {
      pushToast("Campos obrigatorios da categoria", dynamicCreateValidation, "warning");
      return;
    }
    if (normalizeText(createForm.type) === "requisicao" && !String(createForm.approvalApproverId || "").trim()) {
      pushToast("Aprovador obrigatorio", "Selecione quem vai aprovar esta requisicao antes de registrar.", "warning");
      return;
    }
    const selectedApprover = approvalCandidates.find((candidate) => candidate.id === createForm.approvalApproverId) || null;

    const createdTicket = await createTicket({
      ...createForm,
      slaTargetMinutes: Math.max(15, Number(createForm.slaTargetMinutes) || 240),
      requester: user.name,
      requesterId: user.id,
      requesterEmail: user.email,
      queue: selectedCreateDepartment?.name || "Service Desk",
      departmentId: createForm.departmentId,
      department: selectedCreateDepartment?.name || "",
      category: createForm.category || "Geral",
      source: "Portal",
      watchers: createForm.watchers.map((watcher) => watcher.name).join(", "),
      watcherDetails: createForm.watchers.map((watcher) => ({
        userId: watcher.id,
        name: watcher.name,
        email: watcher.email,
        eventKeys: createForm.watcherEventKeys || DEFAULT_WATCHER_EVENT_KEYS,
      })),
      checklistItems: buildChecklistTemplate(createForm.type),
      approvalAmount: Number(createForm.approvalAmount) || 0,
      approval:
        normalizeText(createForm.type) === "requisicao"
          ? {
              required: true,
              status: "pending",
              approverId: selectedApprover?.id || "",
              approverName: selectedApprover?.name || "",
            }
          : undefined,
      projectName: activeProjectOptions.find((project) => project.id === createForm.projectId)?.name || "",
      assetName:
        activeAssetOptions.find((asset) => asset.id === createForm.assetId)?.tag ||
        activeAssetOptions.find((asset) => asset.id === createForm.assetId)?.name ||
        "",
      assignee: "",
      parentTicketId: String(createForm.parentTicketId || "").trim(),
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
    const dynamicDetailValidation = getDynamicCategoryValidation(detailForm);
    if (dynamicDetailValidation) {
      pushToast("Campos obrigatorios da categoria", dynamicDetailValidation, "warning");
      return;
    }
    if (normalizeText(detailForm.status) === "reaberto" && !String(detailForm.reopenReason || "").trim()) {
      pushToast("Motivo obrigatorio", "Informe o motivo da reabertura antes de salvar o chamado.", "warning");
      return;
    }
    if (statusRequiresPauseReason(detailForm.status, serviceCenter || {}) && !String(detailForm.pauseReason || "").trim()) {
      pushToast("Motivo obrigatorio", "Informe o motivo da pausa antes de salvar o chamado.", "warning");
      return;
    }
    if (statusRequiresWaitingReason(detailForm.status, serviceCenter || {}) && !String(detailForm.waitingReason || "").trim()) {
      pushToast("Motivo obrigatorio", "Informe o motivo de espera antes de salvar o chamado.", "warning");
      return;
    }
    if (String(detailForm.parentTicketId || "").trim() === String(detailTicket.id || "").trim()) {
      pushToast("Vinculo invalido", "Um chamado nao pode ser pai dele mesmo.", "warning");
      return;
    }

    const updates = {
      ...detailForm,
      slaTargetMinutes: Math.max(15, Number(detailForm.slaTargetMinutes) || Number(detailTicket.slaTargetMinutes) || 240),
      dueDate: detailForm.dueDate || "",
      approvalAmount: Number(detailForm.approvalAmount) || 0,
      approval: normalizeText(detailForm.type) === "requisicao"
        ? {
            ...(detailTicket.approval || {}),
            required: true,
            approverId: String(detailForm.approvalApproverId || "").trim(),
            approverName: String(detailForm.approvalApproverName || "").trim(),
          }
        : detailTicket.approval,
      checklistItems: detailForm.checklistItems || [],
      projectName: activeProjectOptions.find((project) => project.id === detailForm.projectId)?.name || detailForm.projectName || "",
      assetName:
        activeAssetOptions.find((asset) => asset.id === detailForm.assetId)?.tag ||
        activeAssetOptions.find((asset) => asset.id === detailForm.assetId)?.name ||
        detailForm.assetName ||
        "",
    };
    if (normalizeText(detailTicket.status) !== "em andamento" && normalizeText(updates.status) === "em andamento") {
      setProgressNoteRequest({ ticketId: detailTicket.id, updates, successTitle: "Chamado atualizado", successMessage: detailForm.title });
      setProgressNoteText("");
      return;
    }
    updateTicket(detailTicket.id, updates);
    pushToast("Chamado atualizado", detailForm.title);
    if (normalizeText(detailForm.status) === "resolvido") {
      handleCloseTicketDetail();
    }
  };

  const handleAddFollowUp = () => {
    if (!detailTicket || !followUpDraft.trim()) return;
    const nextFollowUp = createFollowUpEntry({
      visibility: followUpVisibility,
      message: followUpDraft,
      actorId: user?.id,
      actorName: user?.name || "Sistema",
      audienceTeamIds: followUpVisibility === "private" ? followUpTeamIds : [],
    });
    updateTicket(detailTicket.id, {
      followUps: [nextFollowUp, ...(detailTicket.followUps || [])],
    });
    setFollowUpDraft("");
    pushToast("Acompanhamento incluido", detailTicket.title);
  };

  const handleAddSubtask = () => {
    if (!detailTicket || !subtaskDraft.trim()) return;
    const nextSubtask = {
      id: `subtask-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      title: subtaskDraft.trim(),
      status: "Pendente",
      ownerName: detailForm?.assignee || user?.name || "",
      createdAt: new Date().toISOString(),
    };
    updateTicket(detailTicket.id, {
      subtasks: [nextSubtask, ...(detailTicket.subtasks || [])],
    });
    setSubtaskDraft("");
    pushToast("Subtarefa vinculada", nextSubtask.title);
  };

  const handleToggleSubtask = (subtaskId) => {
    if (!detailTicket) return;
    const nextSubtasks = (detailTicket.subtasks || []).map((subtask) =>
      subtask.id === subtaskId
        ? {
            ...subtask,
            status: normalizeText(subtask.status) === "concluida" ? "Pendente" : "Concluida",
            completedAt: normalizeText(subtask.status) === "concluida" ? "" : new Date().toISOString(),
          }
        : subtask,
    );
    updateTicket(detailTicket.id, { subtasks: nextSubtasks });
    pushToast("Subtarefa atualizada", detailTicket.title);
  };

  const handleFinishTicket = () => {
    if (!detailTicket || !detailForm) return;
    if (normalizeText(detailTicket.status) === "resolvido") {
      pushToast("Chamado ja resolvido", "Use a reabertura se precisar retomar o atendimento.", "warning");
      return;
    }
    if (!detailForm.resolutionNotes.trim()) {
      pushToast("Solucao obrigatoria", "Informe a solucao final antes de encerrar o chamado.", "warning");
      return;
    }

    const nextAttachments = completionAttachments.length ? [...(detailTicket.attachments || []), ...completionAttachments] : detailTicket.attachments || [];
    updateTicket(detailTicket.id, {
      status: "Resolvido",
      resolutionNotes: detailForm.resolutionNotes.trim(),
      slaTargetMinutes: Math.max(15, Number(detailForm.slaTargetMinutes) || Number(detailTicket.slaTargetMinutes) || 240),
      attachments: nextAttachments,
      completionAttachments,
    });
    pushToast("Chamado finalizado", detailForm.title);
    setCompletionAttachments([]);
    handleCloseTicketDetail();
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

  const handleApplyReopenTemplate = (templateId) => {
    setSelectedReopenTemplateId(templateId);
    const template = reopenReasonTemplates.find((item) => item.id === templateId);
    if (!template) return;
    setDetailForm((current) => ({
      ...current,
      reopenReason: template.content,
      reopenCategory: template.category,
    }));
  };

  const handleApplyMacro = (macroId) => {
    if (!detailTicket || !detailForm) return;
    const macro = ticketMacros.find((item) => item.id === macroId);
    setSelectedMacroId(macroId);
    if (!macro) return;
    const nextAssignee = macro.assignSelf ? user?.name || detailForm.assignee : detailForm.assignee;
    const nextFollowUp = createFollowUpEntry({
      visibility: macro.followUpVisibility,
      message: macro.followUpMessage,
      actorId: user?.id,
      actorName: user?.name || "Sistema",
    });
    updateTicket(detailTicket.id, {
      ...detailForm,
      assignee: nextAssignee,
      status: macro.status,
      followUps: [nextFollowUp, ...(detailTicket.followUps || [])],
    });
    setFollowUpDraft("");
    pushToast("Macro aplicada", macro.label);
  };

  const requestProgressNote = ({ ticketId, updates, successTitle = "Chamado atualizado", successMessage = "" }) => {
    setProgressNoteRequest({ ticketId, updates, successTitle, successMessage });
    setProgressNoteText("");
  };

  const handleConfirmProgressNote = () => {
    if (!progressNoteRequest) return;
    const trimmedNote = progressNoteText.trim();
    if (!trimmedNote) {
      pushToast("Observacao obrigatoria", "Informe uma observacao para mover o chamado para Em andamento.", "warning");
      return;
    }
    updateTicket(progressNoteRequest.ticketId, {
      ...progressNoteRequest.updates,
      progressNote: trimmedNote,
    });
    pushToast(progressNoteRequest.successTitle, progressNoteRequest.successMessage || "Status alterado para Em andamento.");
    setProgressNoteRequest(null);
    setProgressNoteText("");
  };

  const handleToggleChecklistItem = (checklistItemId) => {
    if (!detailTicket || !detailForm) return;
    const nextChecklistItems = (detailForm.checklistItems || []).map((item) =>
      item.id === checklistItemId ? { ...item, checked: !item.checked } : item,
    );
    setDetailForm((current) => ({ ...current, checklistItems: nextChecklistItems }));
    updateTicket(detailTicket.id, { checklistItems: nextChecklistItems });
  };

  const handleResetChecklistForType = () => {
    if (!detailForm) return;
    const nextChecklist = buildChecklistTemplate(detailForm.type);
    setDetailForm((current) => ({ ...current, checklistItems: nextChecklist }));
  };

  const handleApprovalAction = (action) => {
    if (!detailTicket || !detailForm) return;
    const selectedApprover = approvalCandidates.find((candidate) => candidate.id === detailForm.approvalApproverId) || null;
    const approvalOwnerId = String(detailTicket.approval?.approverId || detailForm.approvalApproverId || "").trim();
    const canCurrentUserDecide =
      canDecideApproval && (!approvalOwnerId || approvalOwnerId === String(user?.id || "").trim() || hasAnyPermission(user, ["tickets_admin"]));
    if (action === "request" && !selectedApprover) {
      pushToast("Aprovador obrigatorio", "Selecione um aprovador antes de solicitar a aprovacao.", "warning");
      return;
    }
    if ((action === "approve" || action === "reject") && !canCurrentUserDecide) {
      pushToast("Aprovador incorreto", "Somente o aprovador selecionado pode decidir esta requisicao.", "warning");
      return;
    }
    const nextApproval = {
      ...(detailTicket.approval || {}),
      required: true,
      status: action === "approve" ? "approved" : action === "reject" ? "rejected" : "pending",
      approverId: selectedApprover?.id || detailTicket.approval?.approverId || "",
      approverName: selectedApprover?.name || detailTicket.approval?.approverName || "",
      decisionReason: approvalReason,
      requestedAt: action === "request" ? new Date().toISOString() : detailTicket.approval?.requestedAt || "",
      requestedById: action === "request" ? user?.id || "" : detailTicket.approval?.requestedById || "",
      requestedByName: action === "request" ? user?.name || "Sistema" : detailTicket.approval?.requestedByName || "",
      decidedAt: action === "request" ? "" : new Date().toISOString(),
      decidedById: action === "request" ? "" : user?.id || "",
      decidedByName: action === "request" ? "" : user?.name || "Sistema",
    };
    updateTicket(detailTicket.id, {
      ...detailForm,
      approval: nextApproval,
      approvalAction: action,
      status: action === "approve" ? (detailTicket.assignee ? "Em andamento" : "Aberto") : action === "reject" ? "Aguardando usuario" : "Aguardando aprovacao",
    });
    pushToast("Aprovacao atualizada", detailTicket.title);
  };

  const handleDeleteTicket = () => {
    if (!detailTicket) return;
    const confirmed = window.confirm(`Excluir o chamado ${detailTicket.id}? Esta acao nao pode ser desfeita.`);
    if (!confirmed) return;
    deleteTicket(detailTicket.id);
    handleCloseTicketDetail();
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
    downloadCsv(`ticketmind-chamados-${new Date().toISOString().slice(0, 10)}.csv`, [
      ["ID", "Titulo", "Solicitante", "Email", "Tecnico", "Departamento", "Fila", "Status", "Prioridade", "Categoria", "Origem", "Abertura", "SLA"],
      ...filteredTickets.map((ticket) => [ticket.id, ticket.title, ticket.requester, ticket.requesterEmail || "", ticket.assignee || "", ticket.department || "", ticket.queue || "", ticket.status, ticket.priority, ticket.category || "", ticket.source || "", ticket.openedAtLabel || "", ticket.slaLabel || ticket.sla || ""]),
    ]);
    pushToast("Exportacao concluida", `${filteredTickets.length} chamado(s) exportado(s).`);
  };

  const handleQuickAction = (action) => {
    if (!detailTicket || !detailForm) return;
    const normalizedStatus = normalizeText(detailTicket.status);

    if (action === "reopen") {
      if (!canReopenTicket) return;
      if (normalizedStatus !== "resolvido") {
        pushToast("Reabertura indisponivel", "Somente chamados resolvidos podem ser reabertos.", "warning");
        return;
      }
      setDetailForm((current) => ({
        ...current,
        status: "Reaberto",
      }));
      pushToast("Chamado pronto para reabertura", "Informe o motivo e salve para reabrir.");
      return;
    }

    if (normalizedStatus === "resolvido") {
      pushToast("Acao bloqueada", "Chamados resolvidos nao aceitam essa interacao. Use reabrir se necessario.", "warning");
      return;
    }

    if (action === "assignSelf") {
      const updates = { ...detailForm, assignee: user?.name || detailForm.assignee, status: ["aberto", "reaberto"].includes(normalizeText(detailForm.status)) ? "Em andamento" : detailForm.status };
      if (normalizeText(detailTicket.status) !== "em andamento" && normalizeText(updates.status) === "em andamento") {
        requestProgressNote({ ticketId: detailTicket.id, updates, successTitle: "Atalho aplicado", successMessage: "Chamado assumido por voce." });
        return;
      }
      updateTicket(detailTicket.id, updates);
      pushToast("Atalho aplicado", "Chamado assumido por voce.");
      return;
    }
    if (action === "start") {
      requestProgressNote({
        ticketId: detailTicket.id,
        updates: { ...detailForm, status: "Em andamento" },
        successTitle: "Atalho aplicado",
        successMessage: "Chamado movido para em andamento.",
      });
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
      updateTicket(detailTicket.id, {
        status: "Resolvido",
        resolutionNotes: detailForm.resolutionNotes.trim(),
        slaTargetMinutes: Math.max(15, Number(detailForm.slaTargetMinutes) || Number(detailTicket.slaTargetMinutes) || 240),
      });
      pushToast("Atalho aplicado", "Chamado resolvido.");
      handleCloseTicketDetail();
    }
  };

  const toggleGridColumn = (columnKey) => {
    setVisibleColumns((current) => {
      if (current.includes(columnKey)) {
        return current.length > 1 ? current.filter((key) => key !== columnKey) : current;
      }
      return [...current, columnKey];
    });
  };

  const handleInlineTicketAction = (ticket, action) => {
    if (!ticket) return;
    if (normalizeText(ticket.status) === "resolvido") {
      pushToast("Acao bloqueada", `${ticket.id} ja esta resolvido. Reabra antes de continuar o atendimento.`, "warning");
      return;
    }

    if (action === "assignSelf" && canAssignTicket) {
      const updates = {
        assignee: user?.name || ticket.assignee,
        status: ["aberto", "reaberto"].includes(normalizeText(ticket.status)) ? "Em andamento" : ticket.status,
      };
      if (normalizeText(ticket.status) !== "em andamento" && normalizeText(updates.status) === "em andamento") {
        requestProgressNote({ ticketId: ticket.id, updates, successTitle: "Atalho aplicado", successMessage: `${ticket.id} assumido por voce.` });
        return;
      }
      updateTicket(ticket.id, updates);
      pushToast("Atalho aplicado", `${ticket.id} assumido por voce.`);
      return;
    }

    if (action === "start" && canChangeStatus) {
      requestProgressNote({
        ticketId: ticket.id,
        updates: { status: "Em andamento" },
        successTitle: "Atalho aplicado",
        successMessage: `${ticket.id} em andamento.`,
      });
      return;
    }

    if (action === "resolve" && canCloseTicket) {
      if (!String(ticket.resolutionNotes || "").trim()) {
        pushToast("Solucao obrigatoria", `Preencha a solucao de ${ticket.id} antes de resolver.`, "warning");
        return;
      }
      updateTicket(ticket.id, {
        status: "Resolvido",
        resolutionNotes: String(ticket.resolutionNotes || "").trim(),
        slaTargetMinutes: Math.max(15, Number(ticket.slaTargetMinutes) || 240),
      });
      pushToast("Atalho aplicado", `${ticket.id} resolvido.`);
    }
  };

  const detailDirtyFields = useMemo(() => {
    if (!detailTicket || !detailForm) return {};
    return {
      title: String(detailForm.title || "") !== String(detailTicket.title || ""),
      type: String(detailForm.type || "") !== String(detailTicket.type || ""),
      status: String(detailForm.status || "") !== String(detailTicket.status || ""),
      department: String(detailForm.departmentId || detailForm.queue || "") !== String(detailTicket.departmentId || detailTicket.queue || ""),
      requester: String(detailForm.requester || "") !== String(detailTicket.requester || ""),
      requesterEmail: String(detailForm.requesterEmail || "") !== String(detailTicket.requesterEmail || ""),
      source: String(detailForm.source || "") !== String(detailTicket.source || ""),
      category: String(detailForm.category || "") !== String(detailTicket.category || ""),
      parentTicketId: String(detailForm.parentTicketId || "") !== String(detailTicket.parentTicketId || ""),
      location: String(detailForm.location || "") !== String(detailTicket.location || ""),
      priority: String(detailForm.priority || "") !== String(detailTicket.priority || ""),
      urgency: String(detailForm.urgency || "") !== String(detailTicket.urgency || detailTicket.priority || ""),
      impact: String(detailForm.impact || "") !== String(detailTicket.impact || detailTicket.priority || ""),
      slaTargetMinutes: String(detailForm.slaTargetMinutes || "") !== String(detailTicket.slaTargetMinutes || ""),
      dueDate: String(detailForm.dueDate || "") !== String(detailTicket.dueDate ? detailTicket.dueDate.slice(0, 10) : ""),
      watchers: String(detailForm.watchers || "") !== String(detailTicket.watchers || ""),
      assignee: String(detailForm.assignee || "") !== String(detailTicket.assignee || ""),
      approvalApproverId: String(detailForm.approvalApproverId || "") !== String(detailTicket.approval?.approverId || ""),
      approvalAmount: String(detailForm.approvalAmount || "") !== String(detailTicket.approvalAmount || ""),
      projectId: String(detailForm.projectId || "") !== String(detailTicket.projectId || ""),
      assetId: String(detailForm.assetId || "") !== String(detailTicket.assetId || ""),
      checklistItems: JSON.stringify(detailForm.checklistItems || []) !== JSON.stringify(detailTicket.checklistItems || []),
      description: String(detailForm.description || "") !== String(detailTicket.description || ""),
      resolutionNotes: String(detailForm.resolutionNotes || "") !== String(detailTicket.resolutionNotes || ""),
      pauseReason: String(detailForm.pauseReason || "") !== String(detailTicket.pauseReason || ""),
      waitingReason: String(detailForm.waitingReason || "") !== String(detailTicket.waitingReason || ""),
      reopenReason: String(detailForm.reopenReason || "") !== String(detailTicket.reopenReason || ""),
      reopenCategory: String(detailForm.reopenCategory || "") !== String(detailTicket.reopenCategory || ""),
    };
  }, [detailForm, detailTicket]);

  return (
    <div className="ticket-page">
      <section className="board-card glpi-panel">
        <div className="glpi-toolbar ticket-list-toolbar">
          <div>
            <h2>Chamados</h2>
          </div>
          <div className="toolbar">
            <form
              className="tickets-inline-search"
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
            <div className="view-toggle">
              <button className={`filter-pill interactive-button${viewMode === "list" ? " is-active" : ""}`} onClick={() => setViewMode("list")} type="button">
                Lista
              </button>
            </div>
            <button className="ghost-button interactive-button" onClick={() => setShowGridConfig((current) => !current)} type="button">
              Grade
            </button>
            <button className="ghost-button interactive-button" onClick={() => setShowFilters((current) => !current)} type="button">
              {showFilters ? "Ocultar filtros" : "Mostrar filtros"}
            </button>
            {canUseAnalystPreview ? (
              <button className="ghost-button interactive-button" onClick={() => setAnalystPreviewMode((current) => !current)} type="button">
                {analystPreviewMode ? "Preview lateral ligado" : "Preview lateral desligado"}
              </button>
            ) : null}
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
            <strong>{displayedTickets.length} chamado(s)</strong>
            <span>{activeFilterCount ? `${activeFilterCount} filtro(s) ativo(s)` : "Sem filtros adicionais ativos"}</span>
          </div>
          <div className="ticket-list-summary-tags">
            {statusFilter !== "Todos" ? <span className="badge badge-neutral">{statusFilter}</span> : null}
            {priorityFilter !== "Todas" ? <span className="badge badge-neutral">{priorityFilter}</span> : null}
            {slaFilter !== "Todos" ? <span className="badge badge-neutral">{slaFilter}</span> : null}
            {search.trim() ? <span className="badge badge-neutral">Busca: {search}</span> : null}
          </div>
        </div>

        <div className="ticket-queue-tabs" role="tablist" aria-label="Filas de chamados">
          {[
            ["triage", "Triagem", triageTickets.length],
            ["attendance", "Em atendimento", attendanceTickets.length],
            ["all", "Todos", filteredTickets.length],
          ].map(([key, label, count]) => (
            <button
              className={`ticket-queue-tab interactive-button${activeQueueTab === key ? " is-active" : ""}`}
              key={key}
              onClick={() => setActiveQueueTab(key)}
              type="button"
            >
              <span>{label}</span>
              <strong>{count}</strong>
            </button>
          ))}
        </div>

        {normalizeText(search).length >= 2 ? (
          <div className="ticket-inline-panel ticket-global-search-panel">
            <div className="ticket-inline-panel-head">
              <strong>Pesquisa operacional unificada</strong>
              <span>Resultados locais por chamados, usuarios, ativos e base de conhecimento.</span>
            </div>
            <div className="ticket-global-search-grid">
              <div>
                <strong>Chamados</strong>
                {globalSearchResults.tickets.length ? (
                  globalSearchResults.tickets.map((ticket) => (
                  <button className="ticket-global-search-item interactive-button" key={ticket.id} onClick={() => handleOpenTicketDetail(ticket.id)} type="button">
                      <span>{ticket.id}</span>
                      <strong>{ticket.title}</strong>
                    </button>
                  ))
                ) : (
                  <span className="ticket-global-search-empty">Sem chamados</span>
                )}
              </div>
              <div>
                <strong>Usuarios</strong>
                {globalSearchResults.users.length ? (
                  globalSearchResults.users.map((candidate) => (
                    <div className="ticket-global-search-item" key={candidate.id}>
                      <span>{candidate.team || candidate.role || "Usuario"}</span>
                      <strong>{candidate.name}</strong>
                    </div>
                  ))
                ) : (
                  <span className="ticket-global-search-empty">Sem usuarios</span>
                )}
              </div>
              <div>
                <strong>Ativos</strong>
                {globalSearchResults.assets.length ? (
                  globalSearchResults.assets.map((asset) => (
                    <div className="ticket-global-search-item" key={asset.id}>
                      <span>{asset.location || asset.category || "Ativo"}</span>
                      <strong>{asset.tag || asset.name}</strong>
                    </div>
                  ))
                ) : (
                  <span className="ticket-global-search-empty">Sem ativos</span>
                )}
              </div>
              <div>
                <strong>Artigos</strong>
                {globalSearchResults.articles.length ? (
                  globalSearchResults.articles.map((article) => (
                    <div className="ticket-global-search-item" key={article.id}>
                      <span>{article.category}</span>
                      <strong>{article.title}</strong>
                    </div>
                  ))
                ) : (
                  <span className="ticket-global-search-empty">Sem artigos</span>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {false && serviceCenter?.triagePanelVisible !== false && showTriagePanel && triageTickets.length ? (
          <div className="ticket-inline-panel ticket-triage-panel">
            <div className="ticket-inline-panel-head">
              <strong>Fila de triagem</strong>
              <span>Chamados abertos, sem responsável ou com atenção imediata para despacho rápido.</span>
            </div>
            <div className="ticket-triage-list">
              {triageTickets.map((ticket) => (
                <article className="ticket-triage-item" key={ticket.id}>
                  <button className="ticket-triage-copy interactive-button" onClick={() => handleOpenTicketPreview(ticket.id)} type="button">
                    <span>{ticket.id} | {ticket.department || ticket.queue || "Sem departamento"}</span>
                    <strong>{ticket.title}</strong>
                  </button>
                  <div className="ticket-inline-actions">
                    {canAssignTicket ? (
                      <button className="ghost-button compact-button interactive-button" onClick={() => handleInlineTicketAction(ticket, "assignSelf")} type="button">
                        Assumir
                      </button>
                    ) : null}
                    {canChangeStatus ? (
                      <button className="ghost-button compact-button interactive-button" onClick={() => handleInlineTicketAction(ticket, "start")} type="button">
                        Iniciar
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : null}

        {showGridConfig ? (
          <div className="board-card compact-record-card ticket-grid-config-panel">
            <strong>Contexto visivel na lista</strong>
            <span>Escolha quais informacoes complementares aparecem em cada linha deste modulo.</span>
            <div className="permissions-inline users-grid-config">
              {TICKET_GRID_COLUMNS.filter((column) => column.key !== "email").map((column) => (
                <label className="inline-toggle" key={column.key}>
                  <input
                    checked={visibleColumns.includes(column.key)}
                    disabled={visibleColumns.length === 1 && visibleColumns.includes(column.key)}
                    onChange={() => toggleGridColumn(column.key)}
                    type="checkbox"
                  />
                  <span>{column.label}</span>
                </label>
              ))}
            </div>
          </div>
        ) : null}

                {showFilters ? (
          <div className="dashboard-filter-shell compact-filter-shell ticket-filters-panel">
            <div className="dashboard-filter-grid">
              <label>
                <span>Busca global</span>
                <input className="toolbar-search" onChange={(event) => handleSearchChange(event.target.value)} placeholder="Número, usuário, e-mail, técnico, status, prioridade, título ou descrição" value={search} />
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
                  <option>Crítico sem técnico</option>
                  <option>Sem técnico</option>
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
                <span>Técnico</span>
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
        <div className={`ticket-list-shell${analystPreviewMode && canUseAnalystPreview ? " has-analyst-preview" : ""}`}>
          <div className="ticket-rows ticket-rows-wide ticket-list-compact">
          {displayedTickets.length ? (
            displayedTickets.map((ticket) => {
              const operationalSla = getOperationalSla(ticket);
              return (
              <article
                className={`ticket-row-card ticket-row-compact ${getOperationalPriorityRowClass(ticket)}${(detailTicketId === ticket.id || previewTicketId === ticket.id) ? " is-selected" : ""}`}
                key={ticket.id}
                style={getDepartmentColorStyle(departmentDirectory[ticket.departmentId]?.color, { alpha: 0.06 })}
              >
                <button className="ticket-row-open interactive-button" onClick={() => handleOpenTicketPreview(ticket.id)} type="button">
                  <div className="ticket-row-main ticket-row-main-compact">
                    <div className="ticket-row-title ticket-row-title-compact">
                      <h3>
                        <span className="ticket-row-key-inline">{ticket.id}</span>
                        <span>{ticket.title}</span>
                      </h3>
                      <div className="ticket-row-summaryline">
                        <span>{ticket.requester}</span>
                        <span>{ticket.department || ticket.queue || "Sem departamento"}</span>
                        <span>{ticket.assignee || "Sem responsável"}</span>
                        <span>{ticket.openedAtLabel || "-"}</span>
                      </div>
                    </div>
                    <div className="ticket-row-inline-right">
                      <div className="ticket-row-badges ticket-row-badges-compact">
                        <span className={`badge ${getPriorityBadgeClass(ticket.priority)}`}>{ticket.priority}</span>
                        <span className={`badge badge-priority-harmony ${getStatusBadgeClass(ticket.status)}`}>{ticket.status}</span>
                        <span className={`badge badge-priority-harmony ${operationalSla.className}`}>{operationalSla.label}</span>
                      </div>
                    </div>
                  </div>
                  <div className="ticket-row-meta ticket-row-meta-compact">
                    {visibleColumns.includes("category") ? <span>{ticket.category || "Geral"}</span> : null}
                    {visibleColumns.includes("urgency") ? <span>Urgência {ticket.urgency || ticket.priority}</span> : null}
                    {visibleColumns.includes("source") ? <span>{ticket.source || "Portal"}</span> : null}
                    {ticket.parentTicketId ? <span>Pai {ticket.parentTicketId}</span> : null}
                    {ticket.childTicketIds?.length ? <span>{ticket.childTicketIds.length} filho(s)</span> : null}
                  </div>
                </button>
                <div className="compact-row-actions ticket-inline-actions">
                  {canAssignTicket && normalizeText(ticket.status) !== "resolvido" ? (
                    <button className="primary-button compact-button interactive-button" onClick={() => handleInlineTicketAction(ticket, "assignSelf")} title="Alt+A Assumir" type="button">
                      Assumir
                    </button>
                  ) : null}
                  {canChangeStatus && normalizeText(ticket.status) !== "resolvido" ? (
                    <button className="ghost-button compact-button interactive-button" onClick={() => handleInlineTicketAction(ticket, "start")} title="Alt+I Iniciar" type="button">
                      Iniciar
                    </button>
                  ) : null}
                  {canCloseTicket && normalizeText(ticket.status) !== "resolvido" ? (
                    <button className="ghost-button compact-button interactive-button" onClick={() => handleInlineTicketAction(ticket, "resolve")} title="Alt+R Resolver" type="button">
                      Resolver
                    </button>
                  ) : null}
                </div>
              </article>
            );
            })
          ) : (
            <div className="empty-state">
              <strong>Nenhum chamado encontrado.</strong>
              <span>Ajuste busca, filtros ou registre um novo chamado.</span>
              <div className="empty-state-actions">
                <button className="ghost-button interactive-button" onClick={handleResetFilters} type="button">
                  Limpar filtros
                </button>
                {canCreateTicket ? (
                  <button className="primary-button interactive-button" onClick={handleOpenCreateModal} type="button">
                    Abrir chamado
                  </button>
                ) : null}
              </div>
            </div>
          )}
          </div>
          {analystPreviewMode && canUseAnalystPreview && previewTicket ? (
            <aside className="ticket-analyst-preview board-card">
              <div className="ticket-inline-panel-head">
                <div>
                  <strong>{previewTicket.id}</strong>
                  <span>{previewTicket.department || previewTicket.queue || "Sem departamento"} | {previewTicket.openedAtLabel || "-"}</span>
                </div>
                <button className="primary-button compact-button interactive-button" onClick={() => handleOpenTicketDetail(previewTicket.id)} type="button">
                  <span aria-hidden="true">↗</span>
                  Abrir atendimento
                </button>
              </div>
              <div className="ticket-row-badges">
                <span className={`badge ${getPriorityBadgeClass(previewTicket.priority)}`}>{previewTicket.priority}</span>
                <span className={`badge ${getStatusBadgeClass(previewTicket.status)}`}>{previewTicket.status}</span>
                {previewTicket.escalation?.level ? <span className="badge badge-neutral">Escalonado N{previewTicket.escalation.level}</span> : null}
              </div>
              <div className="ticket-analyst-preview-body">
                <strong>{previewTicket.title}</strong>
                <p>{previewTicket.description || "Sem descrição detalhada."}</p>
                <div className="ticket-row-meta">
                  <span>Solicitante: {previewTicket.requester}</span>
                  <span>Responsável: {previewTicket.assignee || "Sem responsável"}</span>
                  <span>{getOperationalSla(previewTicket).label}</span>
                  {previewTicket.parentTicketId ? <span>Pai: {previewTicket.parentTicketId}</span> : null}
                  {previewTicket.childTicketIds?.length ? <span>Filhos: {previewTicket.childTicketIds.join(", ")}</span> : null}
                </div>
                {previewTicket.approval?.required ? (
                  <div className="settings-placeholder-panel">
                    <strong>Aprovação</strong>
                    <span>{previewTicket.approval.currentApproverName || previewTicket.approval.approverName || "Não definido"} | {previewTicket.approval.status}</span>
                  </div>
                ) : null}
                {previewTicket.followUps?.length ? (
                  <div className="sheet-list">
                    {previewTicket.followUps.slice(0, 3).map((followUp) => (
                      <div className="ticket-preview-followup" key={followUp.id}>
                        <strong>{followUp.actorName}</strong>
                        <span>{followUp.message}</span>
                        <small>{followUp.createdAtLabel}</small>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </aside>
          ) : null}
        </div>

      </section>

      {progressNoteRequest ? (
        <div className="ticket-modal-backdrop ticket-progress-note-backdrop" onClick={() => setProgressNoteRequest(null)} role="presentation">
          <div className="ticket-modal board-card compact-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <div className="ticket-modal-header">
              <div>
                <h2>Observação de andamento</h2>
                <span className="modal-subtitle">Registre o contexto antes de mover o chamado para Em andamento.</span>
              </div>
              <button className="ghost-button interactive-button" onClick={() => setProgressNoteRequest(null)} type="button">
                Fechar
              </button>
            </div>
            <label className="field-block field-full">
              <span>Observação</span>
              <textarea
                autoFocus
                onChange={(event) => setProgressNoteText(event.target.value)}
                placeholder="Ex.: chamado assumido, analise iniciada, aguardando validacao tecnica inicial."
                required
                value={progressNoteText}
              />
            </label>
            <div className="ticket-create-actions compact-actions">
              <button className="primary-button interactive-button" onClick={handleConfirmProgressNote} type="button">
                Salvar e mover
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showCreateForm ? (
        <div className="ticket-modal-backdrop" onClick={handleCloseCreateModal} role="presentation">
          <div className="ticket-modal board-card" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <form className="ticket-create-form glpi-ticket-form ticket-create-form-simplified" onSubmit={handleCreateSubmit}>
              <div className="ticket-modal-header">
                <div className="form-section-header">
                  <strong>Abertura de chamado</strong>
                  <span className="modal-subtitle">Preencha o essencial primeiro. Os demais dados ficam logo abaixo em blocos opcionais.</span>
                </div>
                <button className="ghost-button interactive-button" onClick={handleCloseCreateModal} type="button">
                  Fechar
                </button>
              </div>

              <div className="ticket-create-compact-note">
                <strong>{createTypeProfile.category}</strong>
                <span>{createTypeProfile.helper}</span>
              </div>

              <div className="glpi-form-grid ticket-create-grid-simplified">
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
                    {!createForm.departmentId ? <small className="field-error">Obrigatório para rotear o chamado.</small> : null}
                  </label>
                ) : null}
                <label className="field-block field-full">
                  <span>Título</span>
                  <input onChange={updateCreateField("title")} placeholder="Resuma o problema ou a solicitação em uma linha" required value={createForm.title} />
                  {!createForm.title.trim() ? <small className="field-error">Informe um título curto para identificar o chamado.</small> : null}
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
                  <span>Urgência</span>
                  <select onChange={updateCreateField("urgency")} value={createForm.urgency}>
                    {PRIORITY_LEVELS.map((priority) => (
                      <option key={priority}>{priority}</option>
                    ))}
                  </select>
                </label>
                <label className="field-block field-full">
                  <span>Descrição</span>
                  <textarea onChange={updateCreateField("description")} placeholder="Descreva o contexto, impacto e o que precisa ser feito." required value={createForm.description} />
                  {!createForm.description.trim() ? <small className="field-error">Descreva o contexto, impacto e necessidade.</small> : null}
                </label>
                <div className="field-block field-full">
                  <span>Anexos</span>
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
                </div>
                {getDynamicCategoryValidation({ ...createForm, requesterEmail: user?.email || "" }) ? (
                  <div className="field-block field-full">
                    <div className="ticket-rule-alert">
                      {getDynamicCategoryValidation({ ...createForm, requesterEmail: user?.email || "" })}
                    </div>
                  </div>
                ) : null}
              </div>

              <details className="ticket-create-section has-required-fields">
                <summary>Classificação e roteamento</summary>
                <div className="glpi-form-grid ticket-create-grid-simplified">
                  <label className="field-block">
                    <span>Tipo</span>
                    <select onChange={handleCreateTypeChange} value={createForm.type}>
                      <option>Incidente</option>
                      <option>Requisição</option>
                      <option>Problema</option>
                    </select>
                  </label>
                  <label className="field-block">
                    <span>Categoria</span>
                    <input onChange={updateCreateField("category")} value={createForm.category} />
                  </label>
                  <div className="field-block">
                    <span>Solicitante</span>
                    <div className="requester-stamp requester-stamp-compact">
                      <strong>{user?.name || "Usuario nao identificado"}</strong>
                      <small>{user ? `${user.email} | ${user.role}` : "Faca login para registrar o solicitante."}</small>
                    </div>
                  </div>
                  <label className="field-block">
                    <span>Localização</span>
                    <input onChange={updateCreateField("location")} value={createForm.location} />
                  </label>
                </div>
              </details>

              {normalizeText(createForm.type) === "requisicao" ? (
                <details className="ticket-create-section" open>
                  <summary>Fluxo de aprovação</summary>
                  <div className="glpi-form-grid ticket-create-grid-simplified">
                    <label className="field-block">
                      <span>Valor / alçada da requisição</span>
                      <input min="0" onChange={updateCreateField("approvalAmount")} step="0.01" type="number" value={createForm.approvalAmount || ""} />
                    </label>
                    <label className="field-block">
                      <span>Aprovador fallback</span>
                      <select onChange={updateCreateField("approvalApproverId")} required value={createForm.approvalApproverId || ""}>
                        <option value="">Selecione o aprovador</option>
                        {approvalCandidates.map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.name} {candidate.team ? `| ${candidate.team}` : ""}
                          </option>
                        ))}
                      </select>
                      {!createForm.approvalApproverId ? <small className="field-error">Obrigatório para requisições.</small> : null}
                    </label>
                  </div>
                </details>
              ) : null}

              <details className="ticket-create-section">
                <summary>Classificação avançada</summary>
                <div className="glpi-form-grid ticket-create-grid-simplified">
                  <label className="field-block">
                    <span>Impacto</span>
                    <select onChange={updateCreateField("impact")} value={createForm.impact}>
                      {PRIORITY_LEVELS.map((priority) => (
                        <option key={priority}>{priority}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field-block">
                    <span>Projeto vinculado</span>
                    <select onChange={updateCreateField("projectId")} value={createForm.projectId || ""}>
                      <option value="">Nao vincular</option>
                      {activeProjectOptions.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field-block">
                    <span>Ativo vinculado</span>
                    <select onChange={updateCreateField("assetId")} value={createForm.assetId || ""}>
                      <option value="">Nao vincular</option>
                      {activeAssetOptions.map((asset) => (
                        <option key={asset.id} value={asset.id}>
                          {asset.tag || asset.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field-block">
                    <span>Chamado pai</span>
                    <select onChange={updateCreateField("parentTicketId")} value={createForm.parentTicketId || ""}>
                      <option value="">Sem relacionamento</option>
                      {tickets
                        .filter((ticket) => normalizeText(ticket.status) !== "resolvido")
                        .slice(0, 80)
                        .map((ticket) => (
                          <option key={ticket.id} value={ticket.id}>
                            {ticket.id} | {ticket.title}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
              </details>

              <details className="ticket-create-section">
                <summary>Observadores e notificações</summary>
                <div className="field-block field-full" ref={watcherBoxRef}>
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
                  {createForm.watchers.length ? (
                    <div className="permissions-inline">
                      {DEFAULT_WATCHER_EVENT_KEYS.map((eventKey) => (
                        <label className="inline-toggle" key={eventKey}>
                          <input
                            checked={(createForm.watcherEventKeys || DEFAULT_WATCHER_EVENT_KEYS).includes(eventKey)}
                            onChange={(event) =>
                              setCreateForm((current) => ({
                                ...current,
                                watcherEventKeys: event.target.checked
                                  ? [...new Set([...(current.watcherEventKeys || []), eventKey])]
                                  : (current.watcherEventKeys || []).filter((item) => item !== eventKey),
                              }))
                            }
                            type="checkbox"
                          />
                          <span>{eventKey.replace("ticket_", "").replaceAll("_", " ")}</span>
                        </label>
                      ))}
                    </div>
                  ) : null}
                </div>
              </details>

              <details className="ticket-create-section">
                <summary>Base de conhecimento</summary>
                <div className="glpi-form-grid ticket-create-grid-simplified">
                  <label className="field-block field-full">
                    <span>Pesquisar artigo</span>
                    <input onChange={(event) => setCreateKnowledgeQuery(event.target.value)} placeholder="Pesquisar solucao existente" value={createKnowledgeQuery} />
                  </label>
                </div>

                {createArticleSuggestions.length ? (
                  <div className="ticket-suggestion-panel">
                    <div className="ticket-inline-panel-head">
                      <strong>Sugestões automáticas da base</strong>
                      <span>Artigos relacionados a título, categoria e descrição do novo chamado.</span>
                    </div>
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
                  </div>
                ) : null}

                {createForm.knowledgeArticleIds.length ? (
                  <div className="ticket-row-meta">
                    <span>{createForm.knowledgeArticleIds.length} artigo(s) vinculado(s) ao novo chamado</span>
                  </div>
                ) : null}
              </details>

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
        <div className="ticket-modal-backdrop" onClick={handleCloseTicketDetail} role="presentation">
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
                  {(canEditTicket || canRecordResolution) && !isDetailLocked ? (
                    <button className="primary-button interactive-button" type="submit">
                      Salvar alteracoes
                    </button>
                  ) : null}
                  {canCloseTicket && !isDetailResolved ? (
                    <button className="ghost-button interactive-button" onClick={handleFinishTicket} type="button">
                      Finalizar chamado
                    </button>
                  ) : null}
                  {canReopenTicket && isDetailResolved && !isDetailReopened ? (
                    <button className="ghost-button interactive-button" onClick={() => handleQuickAction("reopen")} type="button">
                      Reabrir chamado
                    </button>
                  ) : null}
                  <button className="ghost-button interactive-button" onClick={handleCloseTicketDetail} type="button">
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
                {canAssignTicket && !isDetailResolved ? (
                  <button className="primary-button interactive-button" onClick={() => handleQuickAction("assignSelf")} title="Alt+A Assumir" type="button">
                    Assumir chamado
                  </button>
                ) : null}
                {canChangeStatus && !isDetailResolved ? (
                  <button className="ghost-button interactive-button" onClick={() => handleQuickAction("start")} title="Alt+I Iniciar" type="button">
                    Iniciar atendimento
                  </button>
                ) : null}
                {canChangeStatus && !isDetailResolved ? (
                  <button className="ghost-button interactive-button" onClick={() => handleQuickAction("wait")} title="Alt+U Aguardar" type="button">
                    Aguardar usuário
                  </button>
                ) : null}
                {canEditTicket ? (
                  <button className={`ghost-button interactive-button${activeDetailWorkspace === "followup" ? " is-active" : ""}`} onClick={() => toggleDetailWorkspace("followup")} type="button">
                    Incluir acompanhamento
                  </button>
                ) : null}
                {canRecordResolution ? (
                  <button className={`ghost-button interactive-button${activeDetailWorkspace === "resolve" ? " is-active" : ""}`} onClick={() => toggleDetailWorkspace("resolve")} type="button">
                    Resolver chamado
                  </button>
                ) : null}
              </div>

              <div className="ticket-detail-tabs" role="tablist" aria-label="Detalhe do chamado">
                {[
                  ["data", "Dados do chamado"],
                  ["followup", "Acompanhamento"],
                  ["audit", "Auditoria"],
                ].map(([key, label]) => (
                  <button
                    className={`ticket-detail-tab interactive-button${activeDetailTab === key ? " is-active" : ""}`}
                    key={key}
                    onClick={() => setActiveDetailTab(key)}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>

              <fieldset disabled={isDetailLocked} style={{ border: 0, margin: 0, minInlineSize: 0, padding: 0 }}>
              <div className={`ticket-glpi-layout ticket-detail-tab-${activeDetailTab}`}>
              <aside className="ticket-glpi-sidebar">

              <section className="ticket-inline-panel">
                <div className="ticket-inline-panel-head">
                  <strong>Macro de atendimento</strong>
                  <span>Atribua, responda e mova o status em um clique.</span>
                </div>
                <div className="ticket-inline-compose">
                  <select onChange={(event) => setSelectedMacroId(event.target.value)} value={selectedMacroId}>
                    <option value="">Selecione uma macro</option>
                    {ticketMacros.map((macro) => (
                      <option key={macro.id} value={macro.id}>
                        {macro.label}
                      </option>
                    ))}
                  </select>
                  <button className="ghost-button interactive-button" disabled={!selectedMacroId} onClick={() => handleApplyMacro(selectedMacroId)} type="button">
                    Aplicar macro
                  </button>
                </div>
              </section>

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
                  <strong className={`badge ${getOperationalSla(detailTicket).className}`}>{getOperationalSla(detailTicket).label}</strong>
                </div>
                <div>
                  <span>Reincidencia</span>
                  <strong className="badge badge-neutral">{recurrenceLabel}</strong>
                </div>
              </div>

              <section className="ticket-inline-panel">
                <div className="ticket-inline-panel-head">
                  <strong>Vinculos operacionais</strong>
                  <span>Relacionamento direto com solicitante, departamento, projeto e ativo.</span>
                </div>
                <div className="ticket-row-meta ticket-link-strip">
                  <span>Usuario: {detailTicket.requester || "-"}</span>
                  <span>Departamento: {detailDepartment?.name || detailForm.department || detailForm.queue || "-"}</span>
                  <span>Projeto: {detailForm.projectName || "Nao vinculado"}</span>
                  <span>Ativo: {detailForm.assetName || "Nao vinculado"}</span>
                  {detailForm.parentTicketId ? <span>Pai: {detailForm.parentTicketId}</span> : null}
                  {childTickets.length ? <span>Filhos: {childTickets.map((ticket) => ticket.id).join(", ")}</span> : null}
                  {normalizeText(detailForm.type) === "requisicao" ? <span>Aprovador: {detailTicket.approval?.approverName || detailForm.approvalApproverName || "Nao definido"}</span> : null}
                </div>
              </section>

              <label className={`field-block field-full${detailDirtyFields.title ? " is-dirty" : ""}`}>
                <span>Titulo</span>
                <input disabled={!canEditTicket} onChange={updateDetailField("title")} required value={detailForm.title} />
              </label>

              <div className="detail-grid">
                <label className={`field-block${detailDirtyFields.type ? " is-dirty" : ""}`}>
                  <span>Tipo</span>
                  <select disabled={!canEditTicket} onChange={handleDetailTypeChange} value={detailForm.type}>
                    <option>Incidente</option>
                    <option>Requisicao</option>
                    <option>Problema</option>
                  </select>
                </label>
                <div className="field-block">
                  <span>Modelo do formulario</span>
                  <div className="requester-stamp">
                    <strong>{detailTypeProfile.category} | Prioridade sugerida {detailTypeProfile.priority}</strong>
                    <small>{detailTypeProfile.helper} Campos foco: {detailTypeProfile.suggestedFields.join(", ")}.</small>
                  </div>
                </div>
                <label className={`field-block${detailDirtyFields.status ? " is-dirty" : ""}`}>
                  <span>Status</span>
                  <select
                    disabled={!canChangeStatus}
                    onChange={(event) => {
                      const nextStatus = event.target.value;
                      setDetailForm((current) => ({ ...current, status: nextStatus }));
                      if (normalizeText(detailTicket.status) !== "em andamento" && normalizeText(nextStatus) === "em andamento") {
                        requestProgressNote({
                          ticketId: detailTicket.id,
                          updates: { ...detailForm, status: nextStatus },
                          successTitle: "Status atualizado",
                          successMessage: `${detailTicket.id} em andamento.`,
                        });
                      }
                    }}
                    required
                    value={detailForm.status}
                  >
                    {detailStatusOptions.map((status) => (
                      <option key={status}>{status}</option>
                    ))}
                  </select>
                </label>
                <label className={`field-block${detailDirtyFields.department ? " is-dirty" : ""}`}>
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
                      required={serviceCenterEnabled}
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
                <label className={`field-block${detailDirtyFields.requester ? " is-dirty" : ""}`}>
                  <span>Solicitante</span>
                  <input disabled={!canEditTicket || !canSeeAllTickets} onChange={updateDetailField("requester")} required value={detailForm.requester} />
                </label>
                <label className={`field-block${detailDirtyFields.requesterEmail ? " is-dirty" : ""}`}>
                  <span>Email solicitante</span>
                  <input disabled={!canEditTicket || !canSeeAllTickets} onChange={updateDetailField("requesterEmail")} value={detailForm.requesterEmail} />
                </label>
                <label className={`field-block${detailDirtyFields.source ? " is-dirty" : ""}`}>
                  <span>Origem</span>
                  <select disabled={!canEditTicket} onChange={updateDetailField("source")} value={detailForm.source}>
                    <option>Portal</option>
                    <option>E-mail</option>
                    <option>Telefone</option>
                    <option>Monitoramento</option>
                  </select>
                </label>
                <label className={`field-block${detailDirtyFields.category ? " is-dirty" : ""}`}>
                  <span>Categoria</span>
                  <input disabled={!canEditTicket} onChange={updateDetailField("category")} value={detailForm.category || ""} />
                </label>
                <label className={`field-block${detailDirtyFields.parentTicketId ? " is-dirty" : ""}`}>
                  <span>Chamado pai</span>
                  <select disabled={!canEditTicket} onChange={updateDetailField("parentTicketId")} value={detailForm.parentTicketId || ""}>
                    <option value="">Sem relacionamento</option>
                    {parentTicketOptions.map((ticket) => (
                      <option key={ticket.id} value={ticket.id}>
                        {ticket.id} | {ticket.title}
                      </option>
                    ))}
                  </select>
                </label>
                {getDynamicCategoryValidation(detailForm) ? (
                  <div className="field-block field-full">
                    <div className="ticket-rule-alert">
                      {getDynamicCategoryValidation(detailForm)}
                    </div>
                  </div>
                ) : null}
                <label className={`field-block${detailDirtyFields.location ? " is-dirty" : ""}`}>
                  <span>Localizacao</span>
                  <input disabled={!canEditTicket} onChange={updateDetailField("location")} value={detailForm.location || ""} />
                </label>
                <label className={`field-block${detailDirtyFields.priority ? " is-dirty" : ""}`}>
                  <span>Prioridade</span>
                  <select disabled={!canChangePriority} onChange={updateDetailField("priority")} value={detailForm.priority}>
                    {PRIORITY_LEVELS.map((priority) => (
                      <option key={priority}>{priority}</option>
                    ))}
                  </select>
                </label>
                <label className={`field-block${detailDirtyFields.urgency ? " is-dirty" : ""}`}>
                  <span>Urgência</span>
                  <select disabled={!canChangePriority} onChange={updateDetailField("urgency")} value={detailForm.urgency}>
                    {PRIORITY_LEVELS.map((priority) => (
                      <option key={priority}>{priority}</option>
                    ))}
                  </select>
                </label>
                <label className={`field-block${detailDirtyFields.impact ? " is-dirty" : ""}`}>
                  <span>Impacto</span>
                  <select disabled={!canChangePriority} onChange={updateDetailField("impact")} value={detailForm.impact}>
                    {PRIORITY_LEVELS.map((priority) => (
                      <option key={priority}>{priority}</option>
                    ))}
                  </select>
                </label>
                {false && canManageManualSla ? (
                  <label className={`field-block${detailDirtyFields.slaTargetMinutes ? " is-dirty" : ""}`}>
                    <span>SLA resolucao (minutos)</span>
                    <input disabled={!canEditTicket} min="15" onChange={updateDetailField("slaTargetMinutes")} step="15" type="number" value={detailForm.slaTargetMinutes || ""} />
                    <small>{formatSlaMinutesLabel(detailForm.slaTargetMinutes || detailTicket.slaTargetMinutes || 240)}</small>
                  </label>
                ) : null}
                <label className={`field-block${detailDirtyFields.dueDate ? " is-dirty" : ""}`}>
                  <span>Data limite</span>
                  <input disabled={!canEditTicket} onChange={updateDetailDueDateField} type="date" value={detailForm.dueDate || ""} />
                </label>
                <label className="field-block">
                  <span>Abertura</span>
                  <input disabled readOnly value={detailTicket.openedAtLabel || "-"} />
                </label>
                <label className={`field-block${detailDirtyFields.watchers ? " is-dirty" : ""}`}>
                  <span>Observadores</span>
                  <input disabled={!canEditTicket} onChange={updateDetailField("watchers")} value={detailForm.watchers || ""} />
                </label>
                <label className={`field-block${detailDirtyFields.assignee ? " is-dirty" : ""}`}>
                  <span>Técnico responsável</span>
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
                    placeholder={serviceCenterEnabled ? "Comece a digitar um responsável do departamento" : "Comece a digitar um técnico de TI"}
                    users={assigneeUsers}
                    value={detailForm.assignee || ""}
                  />
                </label>
                {suggestedAssignees.length ? (
                  <div className="field-block field-full">
                    <span>Sugestão de técnicos</span>
                    <div className="ticket-technician-suggestions">
                      {suggestedAssignees.map((candidate) => (
                        <button
                          className="ticket-technician-chip interactive-button"
                          key={candidate.id}
                          onClick={() =>
                            setDetailForm((current) => ({
                              ...current,
                              assignee: candidate.name,
                              status: ["aberto", "reaberto"].includes(normalizeText(current.status)) ? "Em andamento" : current.status,
                            }))
                          }
                          type="button"
                        >
                          <strong>{candidate.name}</strong>
                          <span>{candidate.team || "Técnico"} | {candidate.workload} chamado(s)</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {normalizeText(detailForm.type) === "requisicao" ? (
                  <label className={`field-block${detailDirtyFields.approvalApproverId ? " is-dirty" : ""}`}>
                    <span>Aprovador da requisicao</span>
                    <select
                      disabled={!canEditTicket}
                      onChange={(event) => {
                        const nextApproverId = event.target.value;
                        const nextApprover = approvalCandidates.find((candidate) => candidate.id === nextApproverId) || null;
                        setDetailForm((current) => ({
                          ...current,
                          approvalApproverId: nextApproverId,
                          approvalApproverName: nextApprover?.name || "",
                        }));
                      }}
                      value={detailForm.approvalApproverId || ""}
                    >
                      <option value="">Selecione o aprovador</option>
                      {approvalCandidates.map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {candidate.name} {candidate.team ? `| ${candidate.team}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {normalizeText(detailForm.type) === "requisicao" ? (
                  <label className="field-block">
                    <span>Valor / alcada</span>
                    <input disabled={!canEditTicket} onChange={updateDetailField("approvalAmount")} step="0.01" type="number" value={detailForm.approvalAmount || ""} />
                  </label>
                ) : null}
                <label className={`field-block${detailDirtyFields.projectId ? " is-dirty" : ""}`}>
                  <span>Projeto vinculado</span>
                  <select
                    disabled={!canEditTicket}
                    onChange={(event) => {
                      const nextProjectId = event.target.value;
                      const nextProject = activeProjectOptions.find((project) => project.id === nextProjectId) || null;
                      setDetailForm((current) => ({
                        ...current,
                        projectId: nextProjectId,
                        projectName: nextProject?.name || "",
                      }));
                    }}
                    value={detailForm.projectId || ""}
                  >
                    <option value="">Nao vincular</option>
                    {activeProjectOptions.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={`field-block${detailDirtyFields.assetId ? " is-dirty" : ""}`}>
                  <span>Ativo vinculado</span>
                  <select
                    disabled={!canEditTicket}
                    onChange={(event) => {
                      const nextAssetId = event.target.value;
                      const nextAsset = activeAssetOptions.find((asset) => asset.id === nextAssetId) || null;
                      setDetailForm((current) => ({
                        ...current,
                        assetId: nextAssetId,
                        assetName: nextAsset ? nextAsset.tag || nextAsset.name : "",
                      }));
                    }}
                    value={detailForm.assetId || ""}
                  >
                    <option value="">Nao vincular</option>
                    {activeAssetOptions.map((asset) => (
                      <option key={asset.id} value={asset.id}>
                        {asset.tag || asset.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className={`field-block field-full${detailDirtyFields.description ? " is-dirty" : ""}`}>
                <span>Descrição</span>
                <textarea disabled={!canEditTicket} onChange={updateDetailField("description")} required value={detailForm.description} />
              </label>

              {statusRequiresPauseReason(detailForm.status, serviceCenter || {}) ? (
                <label className={`field-block field-full${detailDirtyFields.pauseReason ? " is-dirty" : ""}`}>
                  <span>Motivo da pausa</span>
                  <textarea disabled={!canEditTicket} onChange={updateDetailField("pauseReason")} value={detailForm.pauseReason || ""} />
                </label>
              ) : null}
              {statusRequiresWaitingReason(detailForm.status, serviceCenter || {}) ? (
                <label className={`field-block field-full${detailDirtyFields.waitingReason ? " is-dirty" : ""}`}>
                  <span>Motivo de espera</span>
                  <textarea disabled={!canEditTicket} onChange={updateDetailField("waitingReason")} value={detailForm.waitingReason || ""} />
                </label>
              ) : null}

              <details className="ticket-glpi-disclosure" open>
                <summary>
                  <strong>Checklist operacional</strong>
                  <span>
                    {(detailForm.checklistItems || []).filter((item) => item.checked).length}/{(detailForm.checklistItems || []).length} etapa(s) concluida(s)
                  </span>
                </summary>
                <div className="ticket-inline-compose">
                  <button className="ghost-button interactive-button" disabled={!canEditTicket} onClick={handleResetChecklistForType} type="button">
                    Reaplicar checklist do tipo
                  </button>
                </div>
                {(detailForm.checklistItems || []).length ? (
                  <div className="ticket-subtask-list">
                    {(detailForm.checklistItems || []).map((item) => (
                      <label className="ticket-subtask-item" key={item.id}>
                        <input checked={Boolean(item.checked)} disabled={!canEditTicket} onChange={() => handleToggleChecklistItem(item.id)} type="checkbox" />
                        <div>
                          <strong>{item.label}</strong>
                          <span>{item.checked ? "Concluida" : "Pendente"}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <strong>Nenhum checklist carregado.</strong>
                    <span>Use o botao acima para reaplicar o checklist padrao do tipo atual.</span>
                  </div>
                )}
              </details>

              {normalizeText(detailForm.type) === "requisicao" ? (
                <details className="ticket-glpi-disclosure">
                  <summary>
                    <strong>Aprovacao da requisicao</strong>
                    <span>{detailTicket.approval?.currentApproverName || detailTicket.approval?.approverName || "Nao definido"}</span>
                  </summary>
                <section className="ticket-attachment-panel ticket-glpi-nested-panel">
                  <div className="attachment-toolbar glpi-subbar">
                    <div>
                      <strong>Aprovacao da requisicao</strong>
                      <span>Solicite, aprove ou reprove sem remover o restante do fluxo do chamado.</span>
                    </div>
                  </div>
                  <div className="glpi-info-strip">
                    <div>
                      <span>Etapa atual</span>
                      <strong>{(detailTicket.approval?.currentStepIndex || 0) + 1} / {detailTicket.approval?.steps?.length || 1}</strong>
                    </div>
                    <div>
                      <span>Aprovador atual</span>
                      <strong>{detailTicket.approval?.currentApproverName || detailTicket.approval?.approverName || "Nao definido"}</strong>
                    </div>
                    <div>
                      <span>SLA da aprovacao</span>
                      <strong>{detailTicket.approvalDueSoon || detailTicket.approvalOverdue ? detailTicket.slaLabel : detailTicket.approval?.dueAt ? new Date(detailTicket.approval.dueAt).toLocaleString("pt-BR") : "-"}</strong>
                    </div>
                  </div>
                  <label className="field-block field-full">
                    <span>Justificativa / parecer</span>
                    <textarea onChange={(event) => setApprovalReason(event.target.value)} value={approvalReason} />
                  </label>
                  <div className="ticket-create-actions compact-actions">
                    {canRequestApproval ? (
                      <button className="ghost-button interactive-button" onClick={() => handleApprovalAction("request")} type="button">
                        Solicitar aprovacao
                      </button>
                    ) : null}
                    {canDecideApproval ? (
                      <button className="ghost-button interactive-button" onClick={() => handleApprovalAction("approve")} type="button">
                        Aprovar
                      </button>
                    ) : null}
                    {canDecideApproval ? (
                      <button className="danger-button interactive-button" onClick={() => handleApprovalAction("reject")} type="button">
                        Reprovar
                      </button>
                    ) : null}
                  </div>
                  <div className="ticket-rows">
                    {(detailTicket.approval?.history || []).length ? (
                      detailTicket.approval.history.map((entry) => (
                        <article className="ticket-row-card" key={entry.id}>
                          <div className="ticket-row-main">
                            <div className="ticket-row-title">
                              <strong>{entry.actorName || entry.approverName || "Sistema"}</strong>
                              <h3>{entry.reason || "Sem justificativa informada."}</h3>
                            </div>
                            <div className="ticket-row-badges">
                              <span className={`badge ${normalizeText(entry.action) === "rejected" ? "status-badge-reaberto" : "status-badge-resolvido"}`}>{entry.action}</span>
                              {entry.stepName ? <span className="badge badge-neutral">{entry.stepName}</span> : null}
                            </div>
                          </div>
                          <div className="ticket-row-meta">
                            <span>{entry.createdAtLabel}</span>
                            <span>historico de aprovacao</span>
                          </div>
                        </article>
                      ))
                    ) : (
                      <div className="empty-state">
                        <strong>Sem decisoes registradas.</strong>
                        <span>As solicitacoes, aprovacoes e reprovacoes passam a aparecer separadas do historico tecnico.</span>
                      </div>
                    )}
                  </div>
                </section>
                </details>
              ) : null}

              </aside>
              <div className="ticket-glpi-main">

              <section className="ticket-attachment-panel ticket-conversation-panel">
                <div className="attachment-toolbar glpi-subbar">
                  <div>
                    <strong>Conversa do chamado</strong>
                    <span>Abertura, acompanhamentos, tarefas, aprovações, anexos e finalização em uma linha interativa.</span>
                  </div>
                  <div className="ticket-row-badges">
                    <span className={`badge ${getStatusBadgeClass(detailTicket.status)}`}>{detailTicket.status}</span>
                    <span className={`badge ${getOperationalSla(detailTicket).className}`}>{getOperationalSla(detailTicket).label}</span>
                  </div>
                </div>
                <div className="ticket-conversation-stream" aria-live="polite">
                  {detailConversationEntries.map((entry) => (
                    <article className={`ticket-chat-message ${entry.tone || ""}`} key={entry.id}>
                      <div className="ticket-chat-avatar" aria-hidden="true">
                        {String(entry.actorName || "S").trim().slice(0, 1).toUpperCase()}
                      </div>
                      <div className="ticket-chat-bubble">
                        <div className="ticket-chat-meta">
                          <strong>{entry.actorName || "Sistema"}</strong>
                          <span>{entry.createdAtLabel || "-"}</span>
                        </div>
                        <h3>{entry.title}</h3>
                        <p>{entry.message}</p>
                        {entry.meta?.length ? (
                          <div className="ticket-chat-tags">
                            {entry.meta.filter(Boolean).map((item) => (
                              <span key={`${entry.id}-${item}`}>{item}</span>
                            ))}
                          </div>
                        ) : null}
                        {entry.attachments?.length ? (
                          <div className="attachment-list timeline-attachment-list">
                            {entry.attachments.map((attachment) => (
                              <div className="attachment-item attachment-item-actions" key={attachment.id}>
                                <div>
                                  <strong>{attachment.name}</strong>
                                  <span>{formatBytes(attachment.size)}</span>
                                </div>
                                <a className="ghost-link" download={attachment.name} href={attachment.url}>
                                  Baixar
                                </a>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
                <div className="ticket-chat-composer">
                  <label className="field-block field-full">
                    <span>Responder no acompanhamento</span>
                    <textarea
                      disabled={!canEditTicket}
                      onChange={(event) => setFollowUpDraft(event.target.value)}
                      placeholder="Escreva uma orientação, dúvida ao solicitante, teste executado ou próximo passo."
                      value={followUpDraft}
                    />
                  </label>
                  <div className="ticket-create-actions compact-actions">
                    <select disabled={!canEditTicket} onChange={(event) => setFollowUpVisibility(event.target.value)} value={followUpVisibility}>
                      <option value="public">Público</option>
                      <option value="private">Interno</option>
                    </select>
                    {canEditTicket ? (
                      <button className="primary-button interactive-button" onClick={handleAddFollowUp} type="button">
                        Enviar acompanhamento
                      </button>
                    ) : null}
                  </div>
                </div>
              </section>

              {activeDetailWorkspace === "followup" ? (
              <section className="ticket-attachment-panel ticket-glpi-workspace">
                <div className="attachment-toolbar glpi-subbar">
                  <div>
                    <strong>Acompanhamentos</strong>
                    <span>Registre novas interacoes tecnicas sem sobrescrever o historico do chamado.</span>
                  </div>
                  <button className="ghost-button interactive-button" onClick={() => setActiveDetailWorkspace("")} type="button">
                    Fechar painel
                  </button>
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
                      <option value="private">Interno</option>
                    </select>
                  </label>
                  {followUpVisibility === "private" ? (
                    <label className="field-block">
                      <span>Equipes internas</span>
                      <select
                        multiple
                        onChange={(event) => setFollowUpTeamIds(Array.from(event.target.selectedOptions).map((option) => option.value))}
                        value={followUpTeamIds}
                      >
                        {departments.map((department) => (
                          <option key={department.id} value={department.id}>
                            {department.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>
                <div className="ticket-inline-filter-bar">
                  <button className={`filter-pill interactive-button${followUpFilter === "all" ? " is-active" : ""}`} onClick={() => setFollowUpFilter("all")} type="button">
                    Todos
                  </button>
                  <button className={`filter-pill interactive-button${followUpFilter === "public" ? " is-active" : ""}`} onClick={() => setFollowUpFilter("public")} type="button">
                    Publicos
                  </button>
                  {canViewPrivateFollowUps ? (
                    <button className={`filter-pill interactive-button${followUpFilter === "private" ? " is-active" : ""}`} onClick={() => setFollowUpFilter("private")} type="button">
                      Privados
                    </button>
                  ) : null}
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
                {filteredFollowUps.length ? (
                  <div className="ticket-rows">
                    {filteredFollowUps.map((followUp) => (
                      <article className="ticket-row-card" key={followUp.id}>
                        <div className="ticket-row-main">
                          <div className="ticket-row-title">
                            <strong>{followUp.actorName || "Sistema"}</strong>
                            <h3>{followUp.message}</h3>
                          </div>
                          <div className="ticket-row-badges">
                            <span className="badge badge-neutral">{followUp.visibility === "public" ? "publico" : "interno"}</span>
                            {followUp.audienceTeamIds?.length ? <span className="badge badge-neutral">{followUp.audienceTeamIds.length} equipe(s)</span> : null}
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
                    <strong>Nenhum acompanhamento neste filtro.</strong>
                    <span>Use o campo acima para documentar cada interacao tecnica deste chamado.</span>
                  </div>
                )}
              </section>
              ) : null}

              {activeDetailWorkspace === "resolve" ? (
              <section className="ticket-attachment-panel ticket-glpi-workspace">
                <div className="attachment-toolbar glpi-subbar">
                  <div>
                    <strong>Resolucao do chamado</strong>
                    <span>Monte a solucao, registre o encerramento e finalize o atendimento quando estiver pronto.</span>
                  </div>
                  <button className="ghost-button interactive-button" onClick={() => setActiveDetailWorkspace("")} type="button">
                    Fechar painel
                  </button>
                </div>
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
                    <>
                      <label className="field-block">
                        <span>Template de reabertura</span>
                        <select disabled={!canEditTicket} onChange={(event) => handleApplyReopenTemplate(event.target.value)} value={selectedReopenTemplateId}>
                          <option value="">Selecione</option>
                          {reopenReasonTemplates.map((template) => (
                            <option key={template.id} value={template.id}>
                              {template.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className={`field-block${detailDirtyFields.reopenCategory ? " is-dirty" : ""}`}>
                        <span>Classificacao da reabertura</span>
                        <select disabled={!canEditTicket} onChange={updateDetailField("reopenCategory")} value={detailForm.reopenCategory || ""}>
                          <option value="">Selecione</option>
                          <option>Reincidencia</option>
                          <option>Correcao parcial</option>
                          <option>Validacao</option>
                          <option>Novo escopo</option>
                        </select>
                      </label>
                    </>
                  ) : null}
                </div>
                {normalizeText(detailForm.status) === "reaberto" ? (
                  <label className={`field-block field-full${detailDirtyFields.reopenReason ? " is-dirty" : ""}`}>
                    <span>Motivo da reabertura</span>
                    <textarea disabled={!canEditTicket} onChange={updateDetailField("reopenReason")} value={detailForm.reopenReason || ""} />
                  </label>
                ) : null}
                <label className={`field-block field-full${detailDirtyFields.resolutionNotes ? " is-dirty" : ""}`}>
                  <span>Solucao tecnica</span>
                  <textarea disabled={!canRecordResolution} onChange={updateDetailField("resolutionNotes")} required value={detailForm.resolutionNotes} />
                </label>
                <div className="field-block field-full">
                  <span>Anexo de conclusao</span>
                  <div className="attachment-toolbar glpi-subbar">
                    <button className="ghost-button interactive-button" disabled={!canCloseTicket || isDetailResolved} onClick={() => completionInputRef.current?.click()} type="button">
                      Anexar evidencia
                    </button>
                    <input hidden multiple onChange={handleCompletionAttachments} ref={completionInputRef} type="file" />
                    <span>{completionAttachments.length ? `${completionAttachments.length} arquivo(s) para vincular ao finalizar` : "Opcional"}</span>
                  </div>
                  {completionAttachments.length ? (
                    <div className="attachment-list">
                      {completionAttachments.map((attachment) => (
                        <div className="attachment-item attachment-item-actions" key={attachment.id}>
                          <div>
                            <strong>{attachment.name}</strong>
                            <span>{formatBytes(attachment.size)}</span>
                          </div>
                          <button
                            className="ghost-link danger-link interactive-button"
                            onClick={() => setCompletionAttachments((current) => current.filter((item) => item.id !== attachment.id))}
                            type="button"
                          >
                            Remover
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="ticket-create-actions compact-actions">
                  {(canEditTicket || canRecordResolution) && !isDetailLocked ? (
                    <button className="primary-button interactive-button" type="submit">
                      Salvar alteracoes
                    </button>
                  ) : null}
                  {canCloseTicket && !isDetailResolved ? (
                    <button className="ghost-button interactive-button" onClick={handleFinishTicket} type="button">
                      Finalizar chamado
                    </button>
                  ) : null}
                </div>
              </section>
              ) : null}

              <details className="ticket-glpi-disclosure">
                <summary>
                  <strong>Base de conhecimento vinculada</strong>
                  <span>{linkedArticles.length ? `${linkedArticles.length} artigo(s)` : "Nenhum artigo vinculado"}</span>
                </summary>
              <section className="ticket-attachment-panel ticket-glpi-nested-panel">
                <div className="attachment-toolbar glpi-subbar">
                  <div>
                    <strong>Base de conhecimento vinculada</strong>
                    <span>Pesquise artigos existentes ou use as sugestoes automaticas a partir do conteudo do chamado.</span>
                  </div>
                </div>
                <input className="toolbar-search" onChange={(event) => setKnowledgeQuery(event.target.value)} placeholder="Pesquisar artigos por problema, solucao ou palavra-chave" value={knowledgeQuery} />
                {articleSuggestions.length ? (
                  <div className="ticket-suggestion-panel">
                    <div className="ticket-inline-panel-head">
                      <strong>{normalizeText(knowledgeQuery) ? "Resultados da pesquisa" : "Sugestoes automaticas da base"}</strong>
                      <span>{normalizeText(knowledgeQuery) ? "Artigos encontrados pela busca informada." : "Relacionados ao titulo, categoria, descricao e solucao do chamado."}</span>
                    </div>
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
              </details>

              <details className="ticket-glpi-disclosure">
                <summary>
                  <strong>Subtarefas tecnicas</strong>
                  <span>{detailTicket.subtasks?.length ? `${detailTicket.subtasks.length} vinculada(s)` : "Nenhuma subtarefa"}</span>
                </summary>
              <section className="ticket-attachment-panel ticket-glpi-nested-panel">
                <div className="attachment-toolbar glpi-subbar">
                  <div>
                    <strong>Subtarefas tecnicas</strong>
                    <span>Desdobre o atendimento em passos menores sem criar outro cadastro.</span>
                  </div>
                </div>
                <div className="ticket-inline-compose">
                  <input
                    className="toolbar-search"
                    disabled={!canEditTicket}
                    onChange={(event) => setSubtaskDraft(event.target.value)}
                    placeholder="Nova subtarefa tecnica"
                    value={subtaskDraft}
                  />
                  {canEditTicket ? (
                    <button className="ghost-button interactive-button" onClick={handleAddSubtask} type="button">
                      Vincular
                    </button>
                  ) : null}
                </div>
                {detailTicket.subtasks?.length ? (
                  <div className="ticket-subtask-list">
                    {detailTicket.subtasks.map((subtask) => (
                      <label className="ticket-subtask-item" key={subtask.id}>
                        <input
                          checked={normalizeText(subtask.status) === "concluida"}
                          onChange={() => handleToggleSubtask(subtask.id)}
                          type="checkbox"
                        />
                        <div>
                          <strong>{subtask.title}</strong>
                          <span>
                            {subtask.ownerName || "Sem responsavel"} | {normalizeText(subtask.status) === "concluida" ? subtask.completedAtLabel || "Concluida" : subtask.createdAtLabel}
                          </span>
                        </div>
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <strong>Nenhuma subtarefa vinculada.</strong>
                    <span>Use este bloco para quebrar o atendimento em etapas menores.</span>
                  </div>
                )}
              </section>
              </details>

              <details className="ticket-glpi-disclosure">
                <summary>
                  <strong>Anexos</strong>
                  <span>{detailTicket.attachments?.length ? `${detailTicket.attachments.length} arquivo(s)` : "Nenhum anexo vinculado"}</span>
                </summary>
              <section className="ticket-attachment-panel ticket-glpi-nested-panel">
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
              </details>

              <section className="ticket-attachment-panel ticket-audit-panel">
                <div className="attachment-toolbar glpi-subbar">
                  <div>
                    <strong>Timeline visual do ticket</strong>
                    <span>Eventos técnicos, alterações de status e aprovações para consulta interna.</span>
                  </div>
                </div>
                <div className="ticket-inline-filter-bar">
                  <button className={`filter-pill interactive-button${timelineFilter === "all" ? " is-active" : ""}`} onClick={() => setTimelineFilter("all")} type="button">
                    Tudo
                  </button>
                  <button className={`filter-pill interactive-button${timelineFilter === "comments" ? " is-active" : ""}`} onClick={() => setTimelineFilter("comments")} type="button">
                    Comentarios
                  </button>
                  <button className={`filter-pill interactive-button${timelineFilter === "audit" ? " is-active" : ""}`} onClick={() => setTimelineFilter("audit")} type="button">
                    Auditoria
                  </button>
                  <button className={`filter-pill interactive-button${timelineFilter === "approval" ? " is-active" : ""}`} onClick={() => setTimelineFilter("approval")} type="button">
                    Aprovacao
                  </button>
                </div>
                {filteredDetailTimeline.length ? (
                  <div className="ticket-rows">
                    {filteredDetailTimeline.map((entry) => (
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
                          <span>{entry.source === "followUp" ? "acompanhamento" : entry.source === "approval" ? "aprovacao" : "auditoria"}</span>
                        </div>
                        {entry.attachments?.length ? (
                          <div className="attachment-list timeline-attachment-list">
                            {entry.attachments.map((attachment) => (
                              <div className="attachment-item attachment-item-actions" key={attachment.id}>
                                <div>
                                  <strong>{attachment.name}</strong>
                                  <span>{formatBytes(attachment.size)}</span>
                                </div>
                                <a className="ghost-link" download={attachment.name} href={attachment.url}>
                                  Baixar
                                </a>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <strong>Nenhum evento neste filtro.</strong>
                    <span>Altere o filtro para visualizar comentarios, auditoria ou aprovacoes.</span>
                  </div>
                )}
              </section>

              </div>
              </div>
              </fieldset>

            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default TicketsPage;


























