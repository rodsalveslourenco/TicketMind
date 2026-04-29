export const TICKET_STATUSES = ["Aberto", "Em andamento", "Aguardando usuario", "Resolvido", "Reaberto"];

export const PRIORITY_LEVELS = ["Baixa", "Media", "Alta", "Critica"];

export const KNOWLEDGE_STATUSES = ["Ativo", "Inativo"];

export const KNOWLEDGE_CATEGORIES = ["Procedimento", "Acesso", "Aplicacoes", "Infraestrutura", "Rede", "Seguranca"];

const SLA_POLICY_MINUTES = {
  critica: 15,
  alta: 60,
  media: 240,
  baixa: 480,
};

const OPEN_STATUS_SET = new Set(["aberto", "em andamento", "aguardando usuario", "reaberto"]);

export function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function normalizeTicketStatus(status) {
  const normalized = normalizeText(status);
  if (normalized === "em atendimento" || normalized === "em andamento" || normalized === "analise") {
    return "Em andamento";
  }
  if (normalized === "aguardando aprovacao" || normalized === "aguardando usuario") {
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
    ticket.category,
    ticket.resolutionNotes,
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

export function syncTicketRecord(ticket, users, nowIso = new Date().toISOString()) {
  const openedAt = ticket.openedAt || nowIso;
  const status = normalizeTicketStatus(ticket.status);
  const priority =
    ticket.priority && String(ticket.priority).trim()
      ? normalizePriorityLabel(ticket.priority)
      : computePriorityFromMatrix(ticket.urgency, ticket.impact);
  const slaTargetMinutes = Number(ticket.slaTargetMinutes) || getSlaPolicyMinutes(priority);
  const slaDeadlineAt =
    ticket.slaDeadlineAt || new Date(new Date(openedAt).getTime() + slaTargetMinutes * 60 * 1000).toISOString();
  const history = normalizeHistory(ticket.history);
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

  return {
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
    attachments: Array.isArray(ticket.attachments) ? ticket.attachments : [],
    history: nextHistory,
    slaTargetMinutes,
    slaDeadlineAt,
    slaBreachedAt,
    resolvedAt,
    resolvedAtLabel: resolvedAt ? formatTimestampLabel(resolvedAt) : "",
    knowledgeArticleIds: Array.isArray(ticket.knowledgeArticleIds) ? ticket.knowledgeArticleIds : [],
    searchText: buildTicketSearchText(ticket),
  };
}

export function enrichTicketRuntime(ticket, nowIso = new Date().toISOString()) {
  const now = new Date(nowIso).getTime();
  const deadline = new Date(ticket.slaDeadlineAt).getTime();
  const remainingMinutes = Math.round((deadline - now) / 60000);
  const isResolved = normalizeText(ticket.status) === "resolvido";
  const isOverdue = !isResolved && remainingMinutes < 0;
  const dueSoon = !isResolved && remainingMinutes >= 0 && remainingMinutes <= 60;
  const unassigned = isTicketUnassigned(ticket);
  const criticalWaitingTechnician = normalizeText(ticket.priority) === "critica" && unassigned && isOpenTicketStatus(ticket.status);
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
    resolutionMinutes,
  };
}

export function syncHelpdeskState(state, users) {
  const nowIso = new Date().toISOString();
  return {
    ...state,
    knowledgeArticles: (Array.isArray(state.knowledgeArticles) ? state.knowledgeArticles : []).map(normalizeKnowledgeArticle),
    tickets: (Array.isArray(state.tickets) ? state.tickets : []).map((ticket) => syncTicketRecord(ticket, users, nowIso)),
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
