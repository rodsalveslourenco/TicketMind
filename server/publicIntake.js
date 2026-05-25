import {
  buildEmptyPermissions,
  getRolePermissions,
} from "../src/data/permissions.js";
import {
  createApprovalHistoryEntry,
  createHistoryEntry,
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

const requesterPermissions = getRolePermissions("Solicitante Interno");
const emptyPermissions = buildEmptyPermissions();

const checklistByType = {
  incidente: ["Registrar impacto", "Validar ambiente afetado", "Executar diagnostico inicial", "Retornar proximo passo ao solicitante"],
  requisicao: ["Validar dados do solicitante", "Conferir aprovacao necessaria", "Executar atendimento solicitado", "Registrar evidencia de entrega"],
  problema: ["Relacionar causa raiz", "Mapear recorrencia", "Definir acao corretiva", "Documentar prevencao futura"],
};

function normalizeCollection(items = []) {
  return Array.isArray(items) ? items.filter(Boolean) : [];
}

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

function buildTypeCode(type) {
  const typeCodeMap = { incidente: "INC", requisicao: "REQ", problema: "PRB" };
  return typeCodeMap[normalizeText(type)] || "TCK";
}

function buildNextTicketId(tickets = [], type = "Incidente") {
  const nextNumber = (normalizeCollection(tickets).length + 2049).toString().padStart(4, "0");
  return `${buildTypeCode(type)}-${nextNumber}`;
}

function buildNextUserId(users = []) {
  return `u-ext-${normalizeCollection(users).length + 1}-${Date.now().toString(36)}`;
}

function deriveNameFromEmail(email = "") {
  const localPart = String(email || "").trim().split("@")[0] || "Solicitante externo";
  return localPart
    .replace(/[._-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Solicitante externo";
}

function toMinimalPreviousTicket(ticket = {}) {
  return {
    id: ticket.id || "",
    title: ticket.title || "",
    type: ticket.type || "",
    status: ticket.status || "",
    urgency: ticket.urgency || "",
    priority: ticket.priority || "",
    source: ticket.source || "",
    department: ticket.department || "",
    location: ticket.location || "",
    openedAtLabel: ticket.openedAtLabel || ticket.openedAt || "",
    updatedAt: ticket.updatedAt || ticket.updatedAtIso || "",
  };
}

function findRequesterUserByEmail(state = {}, email = "") {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) return null;
  return normalizeCollection(state.users).find((candidate) => String(candidate.email || "").trim().toLowerCase() === normalizedEmail) || null;
}

function resolveDepartmentById(departments = [], departmentId = "") {
  const normalizedDepartmentId = String(departmentId || "").trim();
  if (!normalizedDepartmentId) return null;
  return departments.find((department) => String(department.id || "").trim() === normalizedDepartmentId) || null;
}

function resolveDepartmentByName(departments = [], departmentName = "") {
  const normalizedDepartmentName = normalizeText(departmentName);
  if (!normalizedDepartmentName) return null;
  return departments.find((department) => normalizeText(department.name) === normalizedDepartmentName) || null;
}

function resolveDefaultDepartment(state = {}, user = null, preferredDepartmentId = "") {
  const publicDepartments = filterPublicDepartments(state);
  if (!publicDepartments.length) return null;

  const preferredDepartment = resolveDepartmentById(publicDepartments, preferredDepartmentId);
  if (preferredDepartment) return preferredDepartment;

  const configuredDepartmentId = String(state.serviceCenter?.publicIntake?.defaultDepartmentId || "").trim();
  if (configuredDepartmentId) {
    const configuredDepartment = resolveDepartmentById(publicDepartments, configuredDepartmentId);
    if (configuredDepartment) return configuredDepartment;
  }

  const requesterDepartmentId = String(user?.departmentId || "").trim();
  if (requesterDepartmentId) {
    const requesterDepartment = resolveDepartmentById(publicDepartments, requesterDepartmentId);
    if (requesterDepartment) return requesterDepartment;
  }

  const requesterDepartmentName = normalizeText(user?.department || "");
  if (requesterDepartmentName) {
    const requesterDepartment = resolveDepartmentByName(publicDepartments, requesterDepartmentName);
    if (requesterDepartment) return requesterDepartment;
  }

  return publicDepartments[0] || null;
}

function buildPreRegisteredUser(state = {}, email = "", department = null, requesterName = "") {
  const nowIso = new Date().toISOString();
  const normalizedEmail = String(email || "").trim().toLowerCase();
  return {
    id: buildNextUserId(state.users),
    name: String(requesterName || deriveNameFromEmail(normalizedEmail)).trim() || deriveNameFromEmail(normalizedEmail),
    email: normalizedEmail,
    role: "Solicitante Interno",
    team: "Portal externo",
    departmentId: String(department?.id || "").trim(),
    department: String(department?.name || "").trim(),
    status: "Pre-cadastro",
    password: "",
    passwordReveal: "",
    mustChangePassword: true,
    permissionProfileId: "profile-requester",
    permissions: { ...requesterPermissions },
    additionalPermissions: { ...emptyPermissions },
    restrictedPermissions: {},
    externalIntake: true,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export function sanitizePublicIntakeConfig(payload = {}, currentConfig = {}) {
  const nowIso = new Date().toISOString();
  return {
    enabled: payload.enabled !== undefined ? Boolean(payload.enabled) : Boolean(currentConfig.enabled),
    accessToken: String(payload.accessToken || currentConfig.accessToken || "").trim(),
    defaultDepartmentId: String(payload.defaultDepartmentId || currentConfig.defaultDepartmentId || "").trim(),
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
  const publicDepartments = filterPublicDepartments(state);
  const activeDepartments = normalizeCollection(state.departments)
    .filter((department) => normalizeText(department.status || "Ativo") === "ativo")
    .map((department) => ({
      id: String(department.id || "").trim(),
      name: String(department.name || "").trim(),
      code: String(department.code || "").trim(),
    }));
  const activeLocations = normalizeCollection(state.locations)
    .filter((location) => normalizeText(location.status || "Ativo") === "ativo")
    .map((location) => ({
      id: String(location.id || "").trim(),
      name: String(location.name || "").trim(),
      code: String(location.code || "").trim(),
      departmentId: String(location.departmentId || "").trim(),
      department: String(location.department || "").trim(),
    }));

  return {
    portal: {
      enabled: Boolean(config.enabled),
      portalTitle: config.portalTitle,
      portalDescription: config.portalDescription,
    },
    defaults: {
      defaultDepartmentId: String(config.defaultDepartmentId || "").trim(),
      defaultDepartmentName: publicDepartments.find((department) => department.id === String(config.defaultDepartmentId || "").trim())?.name || "",
    },
    requesterDepartments: activeDepartments,
    destinationDepartments: publicDepartments.map((department) => ({
      id: String(department.id || "").trim(),
      name: String(department.name || "").trim(),
      code: String(department.code || "").trim(),
    })),
    locations: activeLocations,
  };
}

export function lookupPublicRequester(state = {}, email = "") {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) {
    return {
      email: "",
      requesterName: "",
      requesterDepartmentId: "",
      requesterDepartment: "",
      requesterLocation: "",
      hasRegisteredUser: false,
      hasPreRegisteredUser: false,
      previousTickets: [],
    };
  }

  const matchedUser = findRequesterUserByEmail(state, normalizedEmail);
  const previousTickets = normalizeCollection(state.tickets)
    .filter((ticket) => String(ticket.requesterEmail || "").trim().toLowerCase() === normalizedEmail)
    .slice()
    .sort((left, right) => new Date(right.openedAt || 0).getTime() - new Date(left.openedAt || 0).getTime())
    .slice(0, 12)
    .map(toMinimalPreviousTicket);
  const latestPreviousTicket = previousTickets[0] || null;

  return {
    email: normalizedEmail,
    requesterName: String(matchedUser?.name || deriveNameFromEmail(normalizedEmail)).trim(),
    requesterDepartmentId: String(matchedUser?.departmentId || "").trim(),
    requesterDepartment: String(matchedUser?.department || "").trim(),
    requesterLocation: String(latestPreviousTicket?.location || "").trim(),
    hasRegisteredUser: Boolean(matchedUser && normalizeText(matchedUser.status || "Ativo") === "ativo"),
    hasPreRegisteredUser: Boolean(matchedUser && normalizeText(matchedUser.status || "") === "pre-cadastro"),
    previousTickets,
  };
}

export function createPublicTicket(state = {}, payload = {}) {
  const currentTickets = normalizeCollection(state.tickets);
  const currentUsers = normalizeCollection(state.users);
  const allDepartments = normalizeCollection(state.departments);
  const nowIso = new Date().toISOString();
  const openedAt = nowIso;
  const type = String(payload.type || "Incidente").trim() || "Incidente";
  const requesterEmail = String(payload.requesterEmail || "").trim().toLowerCase();
  const requesterName = String(payload.requesterName || "").trim();
  const requesterLocation = String(payload.requesterLocation || "").trim();
  const urgency = normalizePriorityLabel(payload.urgency || "Media");
  const impact = urgency;
  const priority = normalizePriorityLabel(payload.priority || urgency);
  const matchedUser = findRequesterUserByEmail(state, requesterEmail);
  const requesterDepartment =
    resolveDepartmentById(allDepartments, payload.requesterDepartmentId) ||
    resolveDepartmentByName(allDepartments, payload.requesterDepartment) ||
    resolveDepartmentById(allDepartments, matchedUser?.departmentId) ||
    resolveDepartmentByName(allDepartments, matchedUser?.department) ||
    null;
  const targetDepartment = resolveDefaultDepartment(state, matchedUser, payload.destinationDepartmentId);
  if (
    !requesterEmail ||
    !requesterName ||
    !requesterDepartment ||
    !requesterLocation ||
    !targetDepartment ||
    !String(payload.title || "").trim() ||
    !String(payload.description || "").trim()
  ) {
    throw new Error("Preencha nome, e-mail, departamento, local, departamento de destino, titulo e descricao para abrir o chamado.");
  }

  const requesterUser = matchedUser || buildPreRegisteredUser(state, requesterEmail, requesterDepartment, requesterName);
  const nextUsers = matchedUser
    ? currentUsers
    : [requesterUser, ...currentUsers];

  const watcherDetails = normalizeWatcherDetails(payload.watcherDetails || [], nextUsers, payload.watchers || "");
  const routedPayload = applyAdvancedRoutingRules(
    {
      ...payload,
      type,
      priority,
      urgency,
      impact,
      category: String(payload.category || "Geral").trim() || "Geral",
      location: requesterLocation,
      title: String(payload.title || "").trim(),
      description: String(payload.description || "").trim(),
      source: "Portal externo",
      departmentId: String(targetDepartment?.id || "").trim(),
      department: String(targetDepartment?.name || "").trim(),
      queue: String(payload.queue || targetDepartment?.name || "Service Desk").trim(),
    },
    state.serviceCenter?.routingRules || [],
    nextUsers,
    { hidden: state.serviceCenter?.triagePanelVisible === false },
  );

  const approvalBase = resolveApprovalWorkflow(
    {
      ...routedPayload,
      approvalAmount: 0,
    },
    state.serviceCenter?.approvalRules || [],
    state.serviceCenter?.approverDelegations || [],
    nextUsers,
    "",
  );

  const approval = approvalBase.required
    ? {
        ...approvalBase,
        requestedAt: nowIso,
        requestedById: requesterUser.id || "",
        requestedByName: requesterUser.name || "Portal externo",
        history: [
          createApprovalHistoryEntry({
            action: "requested",
            actorId: requesterUser.id || "",
            actorName: requesterUser.name || "Portal externo",
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
    dueDate: "",
    slaTargetMinutes: payload.slaTargetMinutes,
    fallbackMinutes: 240,
    nowIso,
  });
  const slaTargetMinutes = slaSettings.slaTargetMinutes;
  const initialResponseTargetMinutes = Math.max(15, Number(payload.initialResponseTargetMinutes) || Math.round(slaTargetMinutes * 0.25));
  const ticketId = buildNextTicketId(currentTickets, type);

  const ticket = {
    id: ticketId,
    title: String(payload.title || "").trim(),
    type,
    priority,
    urgency,
    impact,
    status: initialStatus,
    requester: requesterName || requesterUser.name || deriveNameFromEmail(requesterEmail),
    requesterId: requesterUser.id || "",
    requesterEmail,
    requesterDepartmentId: String(requesterDepartment?.id || "").trim(),
    requesterDepartment: String(requesterDepartment?.name || "").trim(),
    assignee: "",
    queue: routedPayload.queue,
    departmentId: String(routedPayload.departmentId || targetDepartment?.id || "").trim(),
    department: String(routedPayload.department || targetDepartment?.name || "").trim(),
    category: "Geral",
    source: "Portal externo",
    location: requesterLocation,
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
    dueDate: "",
    dueDateLabel: "",
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
    approvalAmount: 0,
    approval,
    triage: routedPayload.triage || {},
    history: [
      createHistoryEntry({
        type: "created",
        actorId: requesterUser.id || "",
        actorName: requesterUser.name || "Portal externo",
        message: matchedUser ? "Chamado aberto via portal externo" : "Chamado aberto via portal externo com pre-cadastro automatico",
        metadata: {
          status: initialStatus,
          departmentId: routedPayload.departmentId || targetDepartment?.id || "",
          department: routedPayload.department || targetDepartment?.name || "",
          queue: routedPayload.queue || "Service Desk",
          slaOrigin: "public_portal",
          channel: "external_request_portal",
          requesterEmail,
          requesterDepartmentId: requesterDepartment?.id || "",
          requesterDepartment: requesterDepartment?.name || "",
          requesterLocation,
          createdPreRegistration: !matchedUser,
        },
        createdAt: nowIso,
      }),
    ],
    knowledgeArticleIds: [],
    projectId: "",
    projectName: "",
    assetId: "",
    assetName: "",
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
    requesterUser,
    createdPreRegistration: !matchedUser,
    nextState: {
      ...state,
      users: nextUsers,
      tickets: [ticket, ...currentTickets],
    },
  };
}
