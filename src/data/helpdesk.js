export const TICKET_STATUSES = ["Aberto", "Em andamento", "Em espera", "Pausado", "Aguardando usuario", "Aguardando aprovacao", "Resolvido", "Reaberto"];

export const DEFAULT_TICKET_STATUS_PROFILES = {
  incidente: ["Aberto", "Em andamento", "Em espera", "Pausado", "Aguardando usuario", "Resolvido", "Reaberto"],
  requisicao: ["Aberto", "Em andamento", "Em espera", "Pausado", "Aguardando usuario", "Aguardando aprovacao", "Resolvido", "Reaberto"],
  problema: ["Aberto", "Em andamento", "Em espera", "Pausado", "Aguardando usuario", "Resolvido", "Reaberto"],
};

export const DEFAULT_STATUS_REASON_RULES = {
  pauseStatuses: ["Pausado"],
  waitingStatuses: ["Em espera", "Aguardando usuario"],
};

export const PRIORITY_LEVELS = ["Baixa", "Media", "Alta", "Critica"];

export const KNOWLEDGE_STATUSES = ["Ativo", "Inativo"];

export const KNOWLEDGE_CATEGORIES = ["Procedimento", "Acesso", "Aplicacoes", "Infraestrutura", "Rede", "Seguranca"];

const SLA_POLICY_MINUTES = {
  critica: 15,
  alta: 60,
  media: 240,
  baixa: 480,
};

const OPEN_STATUS_SET = new Set(["aberto", "em andamento", "em espera", "pausado", "aguardando usuario", "aguardando aprovacao", "reaberto"]);

export function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function getTicketStatusProfiles(serviceCenter = {}) {
  const profiles = serviceCenter?.ticketStatusProfiles;
  if (!profiles || typeof profiles !== "object") return DEFAULT_TICKET_STATUS_PROFILES;

  return Object.entries(DEFAULT_TICKET_STATUS_PROFILES).reduce((accumulator, [type, fallbackStatuses]) => {
    const candidateStatuses = Array.isArray(profiles[type]) ? profiles[type] : fallbackStatuses;
    const normalizedStatuses = candidateStatuses
      .map((status) => String(status || "").trim())
      .filter(Boolean);
    return {
      ...accumulator,
      [type]: normalizedStatuses.length ? normalizedStatuses : fallbackStatuses,
    };
  }, {});
}

export function getTicketStatusOptionsForType(type, serviceCenter = {}) {
  const profiles = getTicketStatusProfiles(serviceCenter);
  return profiles[normalizeText(type)] || DEFAULT_TICKET_STATUS_PROFILES.incidente;
}

export function getStatusReasonRules(serviceCenter = {}) {
  const customRules = serviceCenter?.statusReasonRules;
  return {
    pauseStatuses: Array.isArray(customRules?.pauseStatuses) && customRules.pauseStatuses.length ? customRules.pauseStatuses : DEFAULT_STATUS_REASON_RULES.pauseStatuses,
    waitingStatuses: Array.isArray(customRules?.waitingStatuses) && customRules.waitingStatuses.length ? customRules.waitingStatuses : DEFAULT_STATUS_REASON_RULES.waitingStatuses,
  };
}

function findMatchingStatusLabel(status, statusOptions = []) {
  const normalizedStatus = normalizeText(status);
  return statusOptions.find((candidate) => normalizeText(candidate) === normalizedStatus) || "";
}

export function statusRequiresPauseReason(status, serviceCenter = {}) {
  const { pauseStatuses } = getStatusReasonRules(serviceCenter);
  return pauseStatuses.some((candidate) => normalizeText(candidate) === normalizeText(status));
}

export function statusRequiresWaitingReason(status, serviceCenter = {}) {
  const { waitingStatuses } = getStatusReasonRules(serviceCenter);
  return waitingStatuses.some((candidate) => normalizeText(candidate) === normalizeText(status));
}

export function normalizeTicketStatus(status, statusOptions = TICKET_STATUSES) {
  const matchedStatus = findMatchingStatusLabel(status, statusOptions);
  if (matchedStatus) return matchedStatus;
  const normalized = normalizeText(status);
  if (normalized === "em atendimento" || normalized === "em andamento" || normalized === "analise") {
    return "Em andamento";
  }
  if (normalized === "em espera" || normalized === "aguardando terceiro") {
    return "Em espera";
  }
  if (normalized === "pausado" || normalized === "pausa") {
    return "Pausado";
  }
  if (normalized === "aguardando aprovacao") {
    return "Aguardando aprovacao";
  }
  if (normalized === "aguardando usuario") {
    return "Aguardando usuario";
  }
  if (normalized === "resolvido") return "Resolvido";
  if (normalized === "reaberto") return "Reaberto";
  return "Aberto";
}

export function normalizePriorityLabel(priority) {
  const normalized = normalizeText(priority);
  if (normalized === "critica") return "Critica";
  if (normalized === "alta") return "Alta";
  if (normalized === "baixa") return "Baixa";
  return "Media";
}

export function normalizeCommentVisibility(value) {
  return normalizeText(value) === "publico" || normalizeText(value) === "public" ? "public" : "private";
}

export function computePriorityFromMatrix(urgency, impact) {
  const scoreMap = { baixa: 1, media: 2, alta: 3, critica: 4 };
  const score = Math.max(scoreMap[normalizeText(urgency)] ?? 2, scoreMap[normalizeText(impact)] ?? 2);
  if (score >= 4) return "Critica";
  if (score === 3) return "Alta";
  if (score === 2) return "Media";
  return "Baixa";
}

export function getSlaPolicyMinutes(priority) {
  return SLA_POLICY_MINUTES[normalizeText(priority)] ?? SLA_POLICY_MINUTES.media;
}

export function resolveTicketSlaSettings({ openedAt, dueDate, slaTargetMinutes, fallbackMinutes = SLA_POLICY_MINUTES.media, nowIso = new Date().toISOString() }) {
  const openedAtIso = String(openedAt || nowIso).trim() || nowIso;
  const openedAtMs = new Date(openedAtIso).getTime();
  const fallbackTargetMinutes = Math.max(15, Number(slaTargetMinutes) || Number(fallbackMinutes) || SLA_POLICY_MINUTES.media);

  if (!dueDate) {
    return {
      slaTargetMinutes: fallbackTargetMinutes,
      slaDeadlineAt: new Date(openedAtMs + fallbackTargetMinutes * 60 * 1000).toISOString(),
    };
  }

  const dueDateDeadlineMs = new Date(`${dueDate}T23:59:59.999`).getTime();
  if (Number.isNaN(openedAtMs) || Number.isNaN(dueDateDeadlineMs)) {
    return {
      slaTargetMinutes: fallbackTargetMinutes,
      slaDeadlineAt: new Date(openedAtMs + fallbackTargetMinutes * 60 * 1000).toISOString(),
    };
  }

  return {
    slaTargetMinutes: Math.max(15, Math.round((dueDateDeadlineMs - openedAtMs) / 60000)),
    slaDeadlineAt: new Date(dueDateDeadlineMs).toISOString(),
  };
}

export function formatDateLabel(isoValue) {
  if (!isoValue) return "";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(isoValue));
}

export function formatTimestampLabel(isoValue) {
  if (!isoValue) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(isoValue));
}

export function formatDurationLabel(minutes) {
  if (!Number.isFinite(minutes)) return "-";
  if (Math.abs(minutes) < 60) {
    return `${Math.round(minutes)} min`;
  }
  const hours = minutes / 60;
  if (Math.abs(hours) < 24) {
    return `${hours.toFixed(1)} h`;
  }
  return `${(hours / 24).toFixed(1)} d`;
}

export function toLocalDatetimeInput(isoValue) {
  if (!isoValue) return "";
  const date = new Date(isoValue);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function isTicketUnassigned(ticket) {
  const normalizedAssignee = normalizeText(ticket.assignee);
  return !normalizedAssignee || normalizedAssignee === "triagem ti" || normalizedAssignee === "nao atribuido";
}

export function isOpenTicketStatus(status) {
  return OPEN_STATUS_SET.has(normalizeText(status));
}

export function createHistoryEntry({ type, actorId = "", actorName = "Sistema", message, metadata = {}, createdAt }) {
  return {
    id: `hist-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    type: String(type || "update").trim(),
    actorId,
    actorName,
    message: String(message || "").trim(),
    metadata,
    createdAt: createdAt || new Date().toISOString(),
    createdAtLabel: formatTimestampLabel(createdAt || new Date().toISOString()),
  };
}

export function normalizeHistory(history) {
  return (Array.isArray(history) ? history : [])
    .map((item) => ({
      id: item.id || `hist-${Math.random().toString(36).slice(2, 8)}`,
      type: String(item.type || "update").trim(),
      actorId: String(item.actorId || "").trim(),
      actorName: String(item.actorName || "Sistema").trim(),
      message: String(item.message || "").trim(),
      metadata: item.metadata && typeof item.metadata === "object" ? item.metadata : {},
      createdAt: item.createdAt || new Date().toISOString(),
      createdAtLabel: formatTimestampLabel(item.createdAt || new Date().toISOString()),
    }))
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

export function createFollowUpEntry({ message, actorId = "", actorName = "Sistema", createdAt, visibility = "private", kind = "follow_up", audienceTeamIds = [] }) {
  const timestamp = createdAt || new Date().toISOString();
  return {
    id: `follow-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    message: String(message || "").trim(),
    actorId: String(actorId || "").trim(),
    actorName: String(actorName || "Sistema").trim(),
    visibility: normalizeCommentVisibility(visibility),
    kind: String(kind || "follow_up").trim() || "follow_up",
    audienceTeamIds: Array.isArray(audienceTeamIds) ? audienceTeamIds.filter(Boolean) : [],
    createdAt: timestamp,
    createdAtLabel: formatTimestampLabel(timestamp),
  };
}

export function createApprovalHistoryEntry({
  action,
  actorId = "",
  actorName = "Sistema",
  reason = "",
  stepName = "",
  approverName = "",
  metadata = {},
  createdAt,
}) {
  const timestamp = createdAt || new Date().toISOString();
  return {
    id: `approval-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    action: String(action || "updated").trim(),
    actorId: String(actorId || "").trim(),
    actorName: String(actorName || "Sistema").trim(),
    reason: String(reason || "").trim(),
    stepName: String(stepName || "").trim(),
    approverName: String(approverName || actorName || "Sistema").trim(),
    metadata: metadata && typeof metadata === "object" ? metadata : {},
    createdAt: timestamp,
    createdAtLabel: formatTimestampLabel(timestamp),
  };
}

function normalizeApprovalHistory(history) {
  return (Array.isArray(history) ? history : [])
    .map((entry) => {
      const timestamp = entry?.createdAt || new Date().toISOString();
      return {
        id: entry?.id || `approval-${Math.random().toString(36).slice(2, 8)}`,
        action: String(entry?.action || "updated").trim(),
        actorId: String(entry?.actorId || "").trim(),
        actorName: String(entry?.actorName || "Sistema").trim(),
        reason: String(entry?.reason || "").trim(),
        stepName: String(entry?.stepName || "").trim(),
        approverName: String(entry?.approverName || entry?.actorName || "Sistema").trim(),
        metadata: entry?.metadata && typeof entry.metadata === "object" ? entry.metadata : {},
        createdAt: timestamp,
        createdAtLabel: formatTimestampLabel(timestamp),
      };
    })
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

export function normalizeFollowUps(followUps) {
  return (Array.isArray(followUps) ? followUps : [])
    .map((item) => {
      const timestamp = item?.createdAt || new Date().toISOString();
      return {
        id: item?.id || `follow-${Math.random().toString(36).slice(2, 8)}`,
        message: String(item?.message || "").trim(),
        actorId: String(item?.actorId || "").trim(),
        actorName: String(item?.actorName || "Sistema").trim(),
        visibility: normalizeCommentVisibility(item?.visibility),
        kind: String(item?.kind || "follow_up").trim() || "follow_up",
        audienceTeamIds: Array.isArray(item?.audienceTeamIds) ? item.audienceTeamIds.filter(Boolean) : [],
        createdAt: timestamp,
        createdAtLabel: formatTimestampLabel(timestamp),
      };
    })
    .filter((item) => item.message)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

export function normalizeTicketSubtasks(subtasks) {
  return (Array.isArray(subtasks) ? subtasks : [])
    .map((item) => {
      const createdAt = item?.createdAt || new Date().toISOString();
      const completed = normalizeText(item?.status) === "concluida";
      const completedAt = completed ? String(item?.completedAt || createdAt).trim() : "";
      return {
        id: item?.id || `subtask-${Math.random().toString(36).slice(2, 8)}`,
        title: String(item?.title || "").trim(),
        status: completed ? "Concluida" : "Pendente",
        ownerName: String(item?.ownerName || "").trim(),
        createdAt,
        createdAtLabel: formatTimestampLabel(createdAt),
        completedAt,
        completedAtLabel: completedAt ? formatTimestampLabel(completedAt) : "",
      };
    })
    .filter((item) => item.title);
}

export function normalizeTicketChecklist(checklistItems) {
  return (Array.isArray(checklistItems) ? checklistItems : [])
    .map((item) => ({
      id: item?.id || `check-${Math.random().toString(36).slice(2, 8)}`,
      label: String(item?.label || "").trim(),
      checked: Boolean(item?.checked),
    }))
    .filter((item) => item.label);
}

export function resolveTicketRequesterId(ticket, users) {
  if (ticket.requesterId && users.some((candidate) => candidate.id === ticket.requesterId)) {
    return ticket.requesterId;
  }

  const requesterName = normalizeText(ticket.requester);
  const requesterEmail = normalizeText(ticket.requesterEmail);
  const matchedUser = users.find(
    (candidate) =>
      normalizeText(candidate.name) === requesterName ||
      (requesterEmail && normalizeText(candidate.email) === requesterEmail),
  );

  return matchedUser?.id || "";
}

export function buildTicketSearchText(ticket) {
  return [
    ticket.id,
    ticket.requester,
    ticket.requesterEmail,
    ticket.assignee,
    ticket.status,
    ticket.priority,
    ticket.title,
    ticket.description,
    ticket.queue,
    ticket.department,
    ticket.category,
    ticket.projectName,
    ticket.assetName,
    ...(Array.isArray(ticket.checklistItems) ? ticket.checklistItems.map((item) => item.label) : []),
    ticket.resolutionNotes,
    ...(Array.isArray(ticket.followUps) ? ticket.followUps.map((followUp) => followUp.message) : []),
    ...(Array.isArray(ticket.subtasks) ? ticket.subtasks.map((subtask) => subtask.title) : []),
  ]
    .map((item) => normalizeText(item))
    .join(" ");
}

export function buildKnowledgeSearchText(article) {
  return [
    article.title,
    article.category,
    article.problemDescription,
    article.solutionApplied,
    article.keywords,
    article.status,
  ]
    .map((item) => normalizeText(item))
    .join(" ");
}

export function sanitizeKnowledgeArticlePayload(payload) {
  return {
    title: String(payload.title || "").trim(),
    category: String(payload.category || "Procedimento").trim(),
    problemDescription: String(payload.problemDescription || payload.summary || "").trim(),
    solutionApplied: String(payload.solutionApplied || payload.summary || "").trim(),
    keywords: String(payload.keywords || "").trim(),
    owner: String(payload.owner || "").trim(),
    status: KNOWLEDGE_STATUSES.includes(String(payload.status || "")) ? String(payload.status) : "Ativo",
    sourceTicketId: String(payload.sourceTicketId || "").trim(),
    lastUpdate: payload.lastUpdate || new Date().toISOString(),
  };
}

export function normalizeKnowledgeArticle(article) {
  const normalized = sanitizeKnowledgeArticlePayload(article || {});
  return {
    id: article?.id || `kb-${Date.now().toString(36)}`,
    ...normalized,
    searchText: buildKnowledgeSearchText(normalized),
    lastUpdateLabel: formatTimestampLabel(normalized.lastUpdate),
  };
}

function normalizeApproval(ticket) {
  const approval = ticket?.approval && typeof ticket.approval === "object" ? ticket.approval : {};
  return {
    required: Boolean(approval.required),
    status: String(approval.status || "not_required").trim() || "not_required",
    ruleId: String(approval.ruleId || "").trim(),
    ruleName: String(approval.ruleName || "").trim(),
    approverId: String(approval.approverId || "").trim(),
    approverName: String(approval.approverName || "").trim(),
    currentApproverId: String(approval.currentApproverId || approval.approverId || "").trim(),
    currentApproverName: String(approval.currentApproverName || approval.approverName || "").trim(),
    currentStepIndex: Number.isFinite(Number(approval.currentStepIndex)) ? Number(approval.currentStepIndex) : 0,
    slaMinutes: Number(approval.slaMinutes) || 0,
    dueAt: String(approval.dueAt || "").trim(),
    amount: Number(approval.amount) || 0,
    steps: Array.isArray(approval.steps) ? approval.steps : [],
    requestedAt: String(approval.requestedAt || "").trim(),
    decidedAt: String(approval.decidedAt || "").trim(),
    requestedById: String(approval.requestedById || "").trim(),
    requestedByName: String(approval.requestedByName || "").trim(),
    decidedById: String(approval.decidedById || "").trim(),
    decidedByName: String(approval.decidedByName || "").trim(),
    decisionReason: String(approval.decisionReason || "").trim(),
    history: normalizeApprovalHistory(approval.history),
  };
}

export function syncTicketRecord(ticket, users, nowIso = new Date().toISOString(), serviceCenter = {}) {
  const openedAt = ticket.openedAt || nowIso;
  const statusOptions = getTicketStatusOptionsForType(ticket.type, serviceCenter);
  const status = normalizeTicketStatus(ticket.status, statusOptions);
  const priority =
    ticket.priority && String(ticket.priority).trim()
      ? normalizePriorityLabel(ticket.priority)
      : computePriorityFromMatrix(ticket.urgency, ticket.impact);
  const slaSettings = resolveTicketSlaSettings({
    openedAt,
    dueDate: ticket.dueDate || "",
    slaTargetMinutes: ticket.slaTargetMinutes,
    fallbackMinutes: getSlaPolicyMinutes(priority),
    nowIso,
  });
  const slaTargetMinutes = slaSettings.slaTargetMinutes;
  const slaDeadlineAt = slaSettings.slaDeadlineAt;
  const history = normalizeHistory(ticket.history);
  const followUps = normalizeFollowUps(ticket.followUps);
  const subtasks = normalizeTicketSubtasks(ticket.subtasks);
  const checklistItems = normalizeTicketChecklist(ticket.checklistItems);
  const approval = normalizeApproval(ticket);
  const approvalOverdueAt =
    normalizeText(approval.status) === "pending" &&
    approval.dueAt &&
    !ticket.approvalOverdueAt &&
    new Date(nowIso).getTime() > new Date(approval.dueAt).getTime()
      ? nowIso
      : String(ticket.approvalOverdueAt || "").trim();
  const watcherDetails = Array.isArray(ticket.watcherDetails) ? ticket.watcherDetails : [];
  const isResolved = normalizeText(status) === "resolvido";
  let resolvedAt = ticket.resolvedAt || "";
  if (isResolved && !resolvedAt) {
    resolvedAt = ticket.updatedAtIso || nowIso;
  }
  if (!isResolved && normalizeText(status) === "reaberto") {
    resolvedAt = "";
  }

  let slaBreachedAt = ticket.slaBreachedAt || "";
  let nextHistory = history;
  if (!isResolved && new Date(nowIso).getTime() > new Date(slaDeadlineAt).getTime() && !slaBreachedAt) {
    slaBreachedAt = nowIso;
    nextHistory = [
      createHistoryEntry({
        type: "sla_breach",
        actorName: "Sistema",
        message: "SLA excedido",
        metadata: { slaDeadlineAt },
        createdAt: nowIso,
      }),
      ...history,
    ];
  }

  const normalizedTicket = {
    ...ticket,
    status,
    priority,
    requesterId: resolveTicketRequesterId(ticket, users),
    requesterEmail: String(ticket.requesterEmail || "").trim().toLowerCase(),
    openedAt,
    openedAtLabel: formatTimestampLabel(openedAt),
    dueDate: ticket.dueDate || "",
    dueDateLabel: ticket.dueDate ? formatDateLabel(ticket.dueDate) : "",
    updatedAtIso: ticket.updatedAtIso || openedAt,
    updatedAt: ticket.updatedAt && ticket.updatedAt !== "Agora" ? ticket.updatedAt : formatTimestampLabel(ticket.updatedAtIso || openedAt),
    resolutionNotes: String(ticket.resolutionNotes || "").trim(),
    reopenReason: String(ticket.reopenReason || "").trim(),
    followUps,
    subtasks,
    checklistItems,
    attachments: Array.isArray(ticket.attachments) ? ticket.attachments : [],
    history: nextHistory,
    approval,
    approvalAmount: Number(ticket.approvalAmount) || 0,
    watcherDetails,
    approvalOverdueAt,
    triage: ticket?.triage && typeof ticket.triage === "object" ? ticket.triage : {},
    escalation: ticket?.escalation && typeof ticket.escalation === "object" ? ticket.escalation : {},
    slaTargetMinutes,
    slaDeadlineAt,
    initialResponseTargetMinutes: Number(ticket.initialResponseTargetMinutes) || Math.max(15, Math.round(slaTargetMinutes * 0.25)),
    initialResponseDeadlineAt:
      String(ticket.initialResponseDeadlineAt || "").trim() ||
      new Date(new Date(openedAt).getTime() + Math.max(15, Math.round(slaTargetMinutes * 0.25)) * 60 * 1000).toISOString(),
    firstResponseAt: String(ticket.firstResponseAt || "").trim(),
    firstResponseAtLabel: ticket.firstResponseAt ? formatTimestampLabel(ticket.firstResponseAt) : "",
    slaBreachedAt,
    resolvedAt,
    resolvedAtLabel: resolvedAt ? formatTimestampLabel(resolvedAt) : "",
    knowledgeArticleIds: Array.isArray(ticket.knowledgeArticleIds) ? ticket.knowledgeArticleIds : [],
    projectId: String(ticket.projectId || "").trim(),
    projectName: String(ticket.projectName || "").trim(),
    assetId: String(ticket.assetId || "").trim(),
    assetName: String(ticket.assetName || "").trim(),
    reopenCategory: String(ticket.reopenCategory || "").trim(),
    pauseReason: String(ticket.pauseReason || "").trim(),
    waitingReason: String(ticket.waitingReason || "").trim(),
    parentTicketId: String(ticket.parentTicketId || "").trim(),
    childTicketIds: Array.isArray(ticket.childTicketIds) ? ticket.childTicketIds.filter(Boolean) : [],
    parentTicketTitle: String(ticket.parentTicketTitle || "").trim(),
  };

  return {
    ...normalizedTicket,
    searchText: buildTicketSearchText(normalizedTicket),
  };
}

export function enrichTicketRuntime(ticket, nowIso = new Date().toISOString()) {
  const now = new Date(nowIso).getTime();
  const deadline = new Date(ticket.slaDeadlineAt).getTime();
  const firstResponseDeadline = new Date(ticket.initialResponseDeadlineAt || ticket.slaDeadlineAt).getTime();
  const remainingMinutes = Math.round((deadline - now) / 60000);
  const initialResponseRemainingMinutes = Math.round((firstResponseDeadline - now) / 60000);
  const isResolved = normalizeText(ticket.status) === "resolvido";
  const isOverdue = !isResolved && remainingMinutes < 0;
  const initialResponseOverdue = !ticket.firstResponseAt && !isResolved && initialResponseRemainingMinutes < 0;
  const dueSoon = !isResolved && remainingMinutes >= 0 && remainingMinutes <= 60;
  const unassigned = isTicketUnassigned(ticket);
  const criticalWaitingTechnician = normalizeText(ticket.priority) === "critica" && unassigned && isOpenTicketStatus(ticket.status);
  const approvalDueAt = ticket.approval?.dueAt ? new Date(ticket.approval.dueAt).getTime() : null;
  const approvalPending = normalizeText(ticket.approval?.status) === "pending";
  const approvalRemainingMinutes = approvalDueAt ? Math.round((approvalDueAt - now) / 60000) : null;
  const approvalDueSoon = approvalPending && Number.isFinite(approvalRemainingMinutes) && approvalRemainingMinutes >= 0 && approvalRemainingMinutes <= 60;
  const approvalOverdue = approvalPending && Number.isFinite(approvalRemainingMinutes) && approvalRemainingMinutes < 0;
  const slaLabel = isResolved
    ? ticket.resolvedAt
      ? `Resolvido em ${ticket.resolvedAtLabel}`
      : "Resolvido"
    : isOverdue
      ? `SLA vencido ha ${formatDurationLabel(Math.abs(remainingMinutes))}`
      : `Vence em ${formatDurationLabel(remainingMinutes)}`;
  const resolutionMinutes = ticket.resolvedAt
    ? Math.max(0, Math.round((new Date(ticket.resolvedAt).getTime() - new Date(ticket.openedAt).getTime()) / 60000))
    : null;

  return {
    ...ticket,
    slaRemainingMinutes: remainingMinutes,
    slaState: isResolved ? "resolved" : isOverdue ? "overdue" : dueSoon ? "due_soon" : "within_sla",
    slaLabel,
    isOverdue,
    dueSoon,
    unassigned,
    criticalWaitingTechnician,
    initialResponseRemainingMinutes,
    initialResponseOverdue,
    initialResponseLabel: ticket.firstResponseAt
      ? `1a resposta em ${ticket.firstResponseAtLabel}`
      : initialResponseOverdue
        ? `1a resposta vencida ha ${formatDurationLabel(Math.abs(initialResponseRemainingMinutes))}`
        : `1a resposta em ${formatDurationLabel(initialResponseRemainingMinutes)}`,
    approvalPending,
    approvalRemainingMinutes,
    approvalDueSoon,
    approvalOverdue,
    resolutionMinutes,
  };
}

export function syncHelpdeskState(state, users) {
  const nowIso = new Date().toISOString();
  const serviceCenter = state?.serviceCenter || {};
  const syncedTickets = (Array.isArray(state.tickets) ? state.tickets : []).map((ticket) => syncTicketRecord(ticket, users, nowIso, serviceCenter));
  const ticketsMap = new Map(syncedTickets.map((ticket) => [ticket.id, ticket]));
  const childIdsByParent = syncedTickets.reduce((accumulator, ticket) => {
    if (!ticket.parentTicketId) return accumulator;
    return {
      ...accumulator,
      [ticket.parentTicketId]: [...(accumulator[ticket.parentTicketId] || []), ticket.id],
    };
  }, {});
  return {
    ...state,
    knowledgeArticles: (Array.isArray(state.knowledgeArticles) ? state.knowledgeArticles : []).map(normalizeKnowledgeArticle),
    tickets: syncedTickets.map((ticket) => ({
      ...ticket,
      childTicketIds: childIdsByParent[ticket.id] || [],
      parentTicketTitle: ticket.parentTicketId ? ticketsMap.get(ticket.parentTicketId)?.title || "" : "",
    })),
  };
}

export function prepareTickets(tickets, users) {
  const nowIso = new Date().toISOString();
  return (Array.isArray(tickets) ? tickets : []).map((ticket) => enrichTicketRuntime(syncTicketRecord(ticket, users, nowIso), nowIso));
}

export function appendHistory(ticket, entries) {
  const nextEntries = Array.isArray(entries) ? entries : [entries];
  return normalizeHistory([...(nextEntries.filter(Boolean) || []), ...(ticket.history || [])]);
}
