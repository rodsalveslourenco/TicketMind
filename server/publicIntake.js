import {
  computePriorityFromMatrix,
  createApprovalHistoryEntry,
  createHistoryEntry,
  formatDateLabel,
  formatTimestampLabel,
  normalizeFollowUps,
  normalizePriorityLabel,
  normalizeText,
  normalizeTicketChecklist,
  normalizeTicketSubtasks,
  resolveTicketSlaSettings,
} from "../src/data/helpdesk.js";
import {
  DEFAULT_WATCHER_EVENT_KEYS,
  applyAdvancedRoutingRules,
  buildWatchersLabel,
  normalizeWatcherDetails,
  resolveApprovalWorkflow,
} from "../src/data/ticketAutomation.js";

const checklistByType = {
  incidente: ["Registrar impacto", "Validar ambiente afetado", "Executar diagnostico inicial", "Retornar proximo passo ao solicitante"],
  requisicao: ["Validar dados do solicitante", "Conferir aprovacao necessaria", "Executar atendimento solicitado", "Registrar evidencia de entrega"],
  problema: ["Relacionar causa raiz", "Mapear recorrencia", "Definir acao corretiva", "Documentar prevencao futura"],
};

function computeSlaFromMinutes(minutes) {
  const normalized = Number(minutes) || 0;
  if (normalized < 60) return `${normalized} min`;
  return `${Math.round(normalized / 60)}h`;
}

function buildChecklistTemplate(type) {
  const labels = checklistByType[normalizeText(type)] || checklistByType.incidente;
  return labels.map((label, index) => ({
    id: `check-template-${normalizeText(type || "incidente")}-${index}`,
    label,
    checked: false,
  }));
}

function getServiceCenterDepartmentConfig(serviceCenter = {}, departmentId = "") {
  const normalizedDepartmentId = String(departmentId || "").trim();
  if (!normalizedDepartmentId) return {};
  return serviceCenter?.departments?.[normalizedDepartmentId] || {};
}

function buildTypeCode(type) {
  const typeCodeMap = { incidente: "INC", requisicao: "REQ", problema: "PRB" };
  return typeCodeMap[normalizeText(type)] || "TCK";
}

function buildNextTicketId(tickets = [], type = "Incidente") {
  const nextNumber = (normalizeCollection(tickets).length + 2049).toString().padStart(4, "0");
  return `${buildTypeCode(type)}-${nextNumber}`;
}

function normalizeCollection(items = []) {
  return Array.isArray(items) ? items.filter(Boolean) : [];
}

function filterPublicDepartments(state = {}) {
  return normalizeCollection(state.departments).filter((department) => {
    const config = getServiceCenterDepartmentConfig(state.serviceCenter || {}, department.id);
    return (
      normalizeText(department.status || "Ativo") === "ativo" &&
      Boolean(config.active) &&
      Boolean(config.acceptsTickets) &&
      Boolean(config.showInRequestPortal)
    );
  });
}

export function sanitizePublicIntakeConfig(payload = {}, currentConfig = {}) {
  const nowIso = new Date().toISOString();
  return {
    enabled: payload.enabled !== undefined ? Boolean(payload.enabled) : Boolean(currentConfig.enabled),
    accessToken: String(payload.accessToken || currentConfig.accessToken || "").trim(),
    portalTitle: String(payload.portalTitle || currentConfig.portalTitle || "Abrir chamado externo").trim() || "Abrir chamado externo",
    portalDescription:
      String(
        payload.portalDescription ||
          currentConfig.portalDescription ||
          "Canal controlado para abertura de chamados sem login no TicketMind.",
      ).trim() || "Canal controlado para abertura de chamados sem login no TicketMind.",
    updatedAt: String(payload.updatedAt || currentConfig.updatedAt || nowIso).trim() || nowIso,
  };
}

export function getPublicIntakeConfig(state = {}) {
  return sanitizePublicIntakeConfig(state.serviceCenter?.publicIntake || {}, state.serviceCenter?.publicIntake || {});
}

export function isValidPublicIntakeToken(state = {}, accessToken = "") {
  const config = getPublicIntakeConfig(state);
  return Boolean(config.enabled && config.accessToken && String(config.accessToken) === String(accessToken || "").trim());
}

export function buildPublicIntakeBootstrap(state = {}) {
  const config = getPublicIntakeConfig(state);
  const departments = filterPublicDepartments(state);
  const projects = normalizeCollection(state.projects).filter(
    (project) => !["encerrado", "excluido"].includes(normalizeText(project.status || "")),
  );
  const assets = normalizeCollection(state.assets).filter(
    (asset) => !["baixado", "excluido"].includes(normalizeText(asset.status || "")),
  );

  return {
    portal: {
      enabled: Boolean(config.enabled),
      portalTitle: config.portalTitle,
      portalDescription: config.portalDescription,
    },
    departments: departments.map((department) => ({
      id: department.id,
      code: department.code || "",
      name: department.name || "",
      color: department.color || "",
    })),
    projects: projects.map((project) => ({
      id: project.id,
      name: project.name || "",
      status: project.status || "",
    })),
    assets: assets.map((asset) => ({
      id: asset.id,
      name: asset.name || "",
      assetTag: asset.assetTag || "",
      serial: asset.serial || "",
      status: asset.status || "",
    })),
  };
}

export function createPublicTicket(state = {}, payload = {}) {
  const currentTickets = normalizeCollection(state.tickets);
  const nowIso = new Date().toISOString();
  const openedAt = nowIso;
  const type = String(payload.type || "Incidente").trim() || "Incidente";
  const priority = normalizePriorityLabel(payload.priority || computePriorityFromMatrix(payload.urgency, payload.impact));
  const serviceCenterEnabled = Boolean(state.serviceCenter?.enabled);
  const publicDepartments = filterPublicDepartments(state);
  const targetDepartment = publicDepartments.find((department) => department.id === String(payload.departmentId || "").trim()) || null;

  if (serviceCenterEnabled && !targetDepartment) {
    throw new Error("Selecione um departamento habilitado para abertura externa.");
  }

  const watcherDetails = normalizeWatcherDetails(payload.watcherDetails || [], state.users || [], payload.watchers || "");
  const routedPayload = applyAdvancedRoutingRules(
    {
      ...payload,
      type,
      priority,
      category: String(payload.category || "Geral").trim() || "Geral",
      location: String(payload.location || "").trim(),
      title: String(payload.title || "").trim(),
      description: String(payload.description || "").trim(),
      source: "Portal externo",
      departmentId: String(targetDepartment?.id || payload.departmentId || "").trim(),
      department: String(targetDepartment?.name || payload.department || "").trim(),
      queue: String(payload.queue || targetDepartment?.name || "Service Desk").trim(),
    },
    state.serviceCenter?.routingRules || [],
    state.users || [],
    { hidden: state.serviceCenter?.triagePanelVisible === false },
  );

  const approvalBase = resolveApprovalWorkflow(
    {
      ...routedPayload,
      approvalAmount: Number(payload.approvalAmount) || 0,
    },
    state.serviceCenter?.approvalRules || [],
    state.serviceCenter?.approverDelegations || [],
    state.users || [],
    String(payload.approvalApproverId || "").trim(),
  );

  const approval = approvalBase.required
    ? {
        ...approvalBase,
        requestedAt: nowIso,
        requestedById: "",
        requestedByName: String(payload.requesterName || "").trim() || "Portal externo",
        history: [
          createApprovalHistoryEntry({
            action: "requested",
            actorId: "",
            actorName: String(payload.requesterName || "").trim() || "Portal externo",
            reason: "",
            stepName: approvalBase.steps?.[0]?.name || "Etapa 1",
            approverName: approvalBase.currentApproverName || "",
            createdAt: nowIso,
          }),
        ],
      }
    : {
        required: false,
        status: "not_required",
        steps: [],
        currentStepIndex: -1,
        currentApproverId: "",
        currentApproverName: "",
        approverId: "",
        approverName: "",
        history: [],
      };

  const initialStatus = approval.required && approval.status === "pending" ? "Aguardando aprovacao" : "Aberto";
  const slaSettings = resolveTicketSlaSettings({
    openedAt,
    dueDate: payload.dueDate || "",
    slaTargetMinutes: payload.slaTargetMinutes,
    fallbackMinutes: 240,
    nowIso,
  });
  const slaTargetMinutes = slaSettings.slaTargetMinutes;
  const initialResponseTargetMinutes = Math.max(15, Number(payload.initialResponseTargetMinutes) || Math.round(slaTargetMinutes * 0.25));
  const project = normalizeCollection(state.projects).find((candidate) => candidate.id === String(payload.projectId || "").trim()) || null;
  const asset = normalizeCollection(state.assets).find((candidate) => candidate.id === String(payload.assetId || "").trim()) || null;
  const ticketId = buildNextTicketId(currentTickets, type);
  const requesterName = String(payload.requesterName || payload.requester || "").trim();
  const requesterEmail = String(payload.requesterEmail || "").trim().toLowerCase();

  if (!requesterName || !requesterEmail || !String(payload.title || "").trim() || !String(payload.description || "").trim()) {
    throw new Error("Preencha nome, email, titulo e descricao para abrir o chamado.");
  }

  const ticket = {
    id: ticketId,
    title: String(payload.title || "").trim(),
    type,
    priority,
    urgency: String(payload.urgency || priority).trim() || priority,
    impact: String(payload.impact || priority).trim() || priority,
    status: initialStatus,
    requester: requesterName,
    requesterId: "",
    requesterEmail,
    assignee: "",
    queue: routedPayload.queue,
    departmentId: String(targetDepartment?.id || "").trim(),
    department: routedPayload.department,
    category: routedPayload.category,
    source: "Portal externo",
    location: String(payload.location || "").trim(),
    sla: computeSlaFromMinutes(slaTargetMinutes),
    slaTargetMinutes,
    slaDeadlineAt: slaSettings.slaDeadlineAt,
    initialResponseTargetMinutes,
    initialResponseDeadlineAt: new Date(new Date(openedAt).getTime() + initialResponseTargetMinutes * 60 * 1000).toISOString(),
    firstResponseAt: "",
    updatedAt: formatTimestampLabel(nowIso),
    updatedAtIso: nowIso,
    openedAt,
    openedAtLabel: formatTimestampLabel(openedAt),
    dueDate: payload.dueDate || "",
    dueDateLabel: payload.dueDate ? formatDateLabel(payload.dueDate) : "",
    description: String(payload.description || "").trim(),
    resolutionNotes: "",
    reopenReason: "",
    resolvedAt: "",
    resolvedAtLabel: "",
    watchers: buildWatchersLabel(watcherDetails),
    watcherDetails,
    attachments: Array.isArray(payload.attachments) ? payload.attachments : [],
    followUps: normalizeFollowUps(payload.followUps),
    subtasks: normalizeTicketSubtasks(payload.subtasks),
    checklistItems: normalizeTicketChecklist(payload.checklistItems?.length ? payload.checklistItems : buildChecklistTemplate(type)),
    approvalAmount: Number(payload.approvalAmount) || 0,
    approval,
    triage: routedPayload.triage || {},
    history: [
      createHistoryEntry({
        type: "created",
        actorId: "",
        actorName: requesterName || "Portal externo",
        message: "Chamado aberto via portal externo",
        metadata: {
          status: initialStatus,
          departmentId: targetDepartment?.id || "",
          department: targetDepartment?.name || "",
          queue: routedPayload.queue || "Service Desk",
          approvalAmount: Number(payload.approvalAmount) || 0,
          slaOrigin: "public_portal",
          channel: "external_request_portal",
        },
        createdAt: nowIso,
      }),
    ],
    knowledgeArticleIds: Array.isArray(payload.knowledgeArticleIds) ? payload.knowledgeArticleIds : [],
    projectId: project?.id || "",
    projectName: project?.name || "",
    assetId: asset?.id || "",
    assetName: asset?.assetTag || asset?.name || "",
    reopenCategory: "",
    pauseReason: "",
    waitingReason: "",
    parentTicketId: "",
    childTicketIds: [],
    parentTicketTitle: "",
    watcherEventKeys: [...DEFAULT_WATCHER_EVENT_KEYS],
    slaRuleScope: {
      source: "public_portal",
      technicianId: "",
      technicianName: "Portal externo",
    },
  };

  return {
    ticket,
    nextState: {
      ...state,
      tickets: [ticket, ...currentTickets],
    },
  };
}
