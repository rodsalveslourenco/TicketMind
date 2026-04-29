import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { requestJson } from "../lib/api";
import {
  canViewAllTickets,
  canViewOwnTickets,
  defaultPermissions as defaultUserPermissions,
  hasAnyPermission,
  normalizeRoleName,
  normalizeUserPermissions,
} from "./permissions";
import { seedData } from "./seedData";
import { assetTypeOptions } from "./assetCatalog";
import {
  appendHistory,
  buildKnowledgeSearchText,
  buildTicketSearchText,
  computePriorityFromMatrix,
  createHistoryEntry,
  formatDateLabel,
  formatTimestampLabel,
  getSlaPolicyMinutes,
  isOpenTicketStatus,
  normalizeKnowledgeArticle,
  normalizePriorityLabel,
  normalizeText,
  normalizeTicketStatus,
  prepareTickets,
  sanitizeKnowledgeArticlePayload,
  syncHelpdeskState,
  toLocalDatetimeInput,
} from "./helpdesk";

const AppDataContext = createContext(null);

function buildDefaultUsers() {
  return seedData.users.map((candidate) => ({ ...candidate, password: "admin0123" }));
}

function hydrateUsers(users) {
  const baseUsers = Array.isArray(users) ? users : buildDefaultUsers();
  return baseUsers.map((candidate) => ({
    ...candidate,
    password: candidate.password || "admin0123",
    role: normalizeRoleName(candidate.role),
    permissions: normalizeUserPermissions(candidate.permissions || {}, candidate),
  }));
}

function nextId(prefix, list) {
  return `${prefix}-${list.length + 1}-${Date.now().toString(36)}`;
}

function resolveAssetType(type) {
  const normalized = normalizeText(type).trim();
  return assetTypeOptions.find((item) => normalizeText(item).trim() === normalized) || "Outros";
}

function sanitizeUserPayload(payload) {
  return {
    name: String(payload.name || "").trim(),
    email: String(payload.email || "").trim().toLowerCase(),
    password: payload.password || "admin0123",
    role: normalizeRoleName(payload.role),
    team: String(payload.team || "").trim(),
    department: String(payload.department || "").trim(),
    avatar: String(payload.avatar || "").trim(),
    permissions: normalizeUserPermissions(payload.permissions || defaultUserPermissions, payload),
  };
}

function sanitizeBrandPayload(payload) {
  return {
    name: String(payload.name || "").trim(),
    assetType: String(payload.assetType || "").trim(),
    status: String(payload.status || "Ativo").trim(),
  };
}

function sanitizeModelPayload(payload) {
  return {
    brandId: String(payload.brandId || "").trim(),
    brandName: String(payload.brandName || "").trim(),
    name: String(payload.name || "").trim(),
    assetType: String(payload.assetType || "").trim(),
    status: String(payload.status || "Ativo").trim(),
  };
}

function normalizeProjectPhases(phases) {
  return (Array.isArray(phases) ? phases : []).map((phase, index) => ({
    id: phase.id || `phase-${index + 1}-${Date.now().toString(36)}`,
    name: String(phase.name || "").trim(),
    description: String(phase.description || "").trim(),
    weight: Math.max(0, Number(phase.weight) || 0),
    completed: Boolean(phase.completed),
  }));
}

function computeProjectProgress(phases) {
  return normalizeProjectPhases(phases)
    .filter((phase) => phase.completed)
    .reduce((total, phase) => total + phase.weight, 0);
}

function sanitizeProjectPayload(payload) {
  const phases = normalizeProjectPhases(payload.phases);
  return {
    name: String(payload.name || "").trim(),
    sponsor: String(payload.sponsor || "").trim(),
    manager: String(payload.manager || "").trim(),
    status: String(payload.status || "").trim(),
    dueDate: String(payload.dueDate || "").trim(),
    summary: String(payload.summary || "").trim(),
    phases,
    progress: computeProjectProgress(phases),
  };
}

function filterTicketsForUser(tickets, user) {
  if (!user) return [];
  if (canViewAllTickets(user)) return tickets;
  if (!canViewOwnTickets(user)) return [];
  return tickets.filter((ticket) => ticket.requesterId === user.id);
}

function canAccessTicket(ticket, user) {
  if (!ticket || !user) return false;
  return canViewAllTickets(user) || ticket.requesterId === user.id;
}

function mergeCollections(stored) {
  const users = hydrateUsers(stored?.users);
  const currentUser =
    (stored?.currentUser && typeof stored.currentUser === "object" ? stored.currentUser : null) ??
    users.find((candidate) => candidate.email === seedData.currentUser.email) ??
    { ...seedData.currentUser, password: "admin0123" };

  const baseState = {
    ...seedData,
    ...stored,
    currentUser,
    users,
    queues: Array.isArray(stored?.queues) ? stored.queues : seedData.queues,
    tickets: Array.isArray(stored?.tickets) ? stored.tickets : seedData.tickets,
    assets: Array.isArray(stored?.assets) ? stored.assets : seedData.assets,
    brands: Array.isArray(stored?.brands) ? stored.brands : seedData.brands,
    models: Array.isArray(stored?.models) ? stored.models : seedData.models,
    projects: (Array.isArray(stored?.projects) ? stored.projects : seedData.projects).map(sanitizeProjectPayload),
    knowledgeArticles: (Array.isArray(stored?.knowledgeArticles) ? stored.knowledgeArticles : seedData.knowledgeArticles).map(normalizeKnowledgeArticle),
    apiConfigs: Array.isArray(stored?.apiConfigs) ? stored.apiConfigs : seedData.apiConfigs,
    reports: Array.isArray(stored?.reports) ? stored.reports : seedData.reports,
  };

  return syncHelpdeskState(baseState, users);
}

const EMPTY_DATA = mergeCollections({});

function summarizeTicketsByQueue(queues, tickets) {
  return queues.map((queue) => {
    const queueTickets = tickets.filter((ticket) => ticket.queue === queue.name);
    return {
      ...queue,
      open: queueTickets.filter((ticket) => isOpenTicketStatus(ticket.status)).length,
      overdue: queueTickets.filter((ticket) => ticket.isOverdue).length,
    };
  });
}

function buildStatusBuckets(tickets) {
  return [
    { label: "Aberto", value: tickets.filter((ticket) => normalizeText(ticket.status) === "aberto").length },
    { label: "Em andamento", value: tickets.filter((ticket) => normalizeText(ticket.status) === "em andamento").length },
    { label: "Aguardando usuario", value: tickets.filter((ticket) => normalizeText(ticket.status) === "aguardando usuario").length },
    { label: "Resolvido", value: tickets.filter((ticket) => normalizeText(ticket.status) === "resolvido").length },
    { label: "Reaberto", value: tickets.filter((ticket) => normalizeText(ticket.status) === "reaberto").length },
  ];
}

function buildPriorityBuckets(tickets) {
  return [
    { label: "Critica", value: tickets.filter((ticket) => normalizeText(ticket.priority) === "critica").length },
    { label: "Alta", value: tickets.filter((ticket) => normalizeText(ticket.priority) === "alta").length },
    { label: "Media", value: tickets.filter((ticket) => normalizeText(ticket.priority) === "media").length },
    { label: "Baixa", value: tickets.filter((ticket) => normalizeText(ticket.priority) === "baixa").length },
  ];
}

function buildDailyOpenings(tickets, days = 5) {
  const buckets = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - offset);
    const key = date.toISOString().slice(0, 10);
    buckets.push({
      key,
      label: new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(date),
      value: tickets.filter((ticket) => String(ticket.openedAt || "").slice(0, 10) === key).length,
    });
  }
  return buckets;
}

function buildTechnicianMetrics(tickets, users) {
  const technicians = users.filter((candidate) => normalizeText(candidate.department) === "ti");
  return technicians.map((technician) => {
    const assigned = tickets.filter((ticket) => normalizeText(ticket.assignee) === normalizeText(technician.name));
    const resolved = assigned.filter((ticket) => normalizeText(ticket.status) === "resolvido");
    const withinSla = assigned.filter((ticket) => !ticket.isOverdue && !ticket.slaBreachedAt).length;
    const outSla = assigned.filter((ticket) => ticket.isOverdue || Boolean(ticket.slaBreachedAt)).length;
    const averageResolutionMinutes = resolved.length
      ? Math.round(
          resolved.reduce((total, ticket) => total + (ticket.resolutionMinutes || 0), 0) / Math.max(resolved.length, 1),
        )
      : 0;
    const openAssigned = assigned.filter((ticket) => isOpenTicketStatus(ticket.status)).length;
    const inProgress = assigned.filter((ticket) => normalizeText(ticket.status) === "em andamento").length;
    const waitingUser = assigned.filter((ticket) => normalizeText(ticket.status) === "aguardando usuario").length;
    const critical = assigned.filter((ticket) => normalizeText(ticket.priority) === "critica" && isOpenTicketStatus(ticket.status)).length;
    return {
      id: technician.id,
      name: technician.name,
      team: technician.team,
      assignedCount: assigned.length,
      resolvedCount: resolved.length,
      withinSlaCount: withinSla,
      outSlaCount: outSla,
      averageResolutionMinutes,
      slaRate: assigned.length ? Number(((withinSla / assigned.length) * 100).toFixed(1)) : 100,
      openAssigned,
      inProgress,
      waitingUser,
      critical,
    };
  });
}

export function AppDataProvider({ children }) {
  const { setSessionUser, user } = useAuth();
  const [data, setData] = useState(EMPTY_DATA);
  const [notifications, setNotifications] = useState([]);
  const [serverReady, setServerReady] = useState(false);

  const applyState = (updater) => {
    setData((current) => {
      const candidate = typeof updater === "function" ? updater(current) : updater;
      return mergeCollections(candidate);
    });
  };

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        const serverData = await requestJson("/api/state");
        if (cancelled) return;
        setData(mergeCollections(serverData));
      } catch (error) {
        console.error(error);
      } finally {
        if (!cancelled) setServerReady(true);
      }
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!serverReady) return undefined;

    let active = true;
    const timeoutId = window.setTimeout(async () => {
      try {
        await requestJson("/api/state", {
          method: "PUT",
          body: JSON.stringify(data),
        });
      } catch (error) {
        if (active) console.error(error);
      }
    }, 150);

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [data, serverReady]);

  const pushToast = (title, detail = "", tone = "success") => {
    const toastId = `toast-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    setNotifications((current) => [...current, { id: toastId, title, detail, tone }]);
    window.setTimeout(() => {
      setNotifications((current) => current.filter((toast) => toast.id !== toastId));
    }, 2600);
  };

  const dismissToast = (toastId) => {
    setNotifications((current) => current.filter((toast) => toast.id !== toastId));
  };

  const allTickets = useMemo(() => prepareTickets(data.tickets, data.users || []), [data.tickets, data.users]);
  const visibleTickets = useMemo(() => filterTicketsForUser(allTickets, user), [allTickets, user]);
  const operationalTickets = canViewAllTickets(user) ? allTickets : visibleTickets;
  const knowledgeArticles = useMemo(
    () => (data.knowledgeArticles || []).map((article) => normalizeKnowledgeArticle(article)),
    [data.knowledgeArticles],
  );

  const summary = useMemo(() => {
    const openTickets = visibleTickets.filter((ticket) => isOpenTicketStatus(ticket.status)).length;
    const criticalOpen = visibleTickets.filter(
      (ticket) => normalizeText(ticket.priority) === "critica" && isOpenTicketStatus(ticket.status),
    ).length;
    const waitingApproval = visibleTickets.filter((ticket) => normalizeText(ticket.status) === "aguardando usuario").length;
    const solved = visibleTickets.filter((ticket) => normalizeText(ticket.status) === "resolvido").length;
    const activeAssets = data.assets.filter((asset) => normalizeText(asset.status) !== "baixado").length;
    const activeProjects = data.projects.filter((project) => normalizeText(project.status) !== "concluido").length;
    const activeApis = data.apiConfigs.filter((config) => normalizeText(config.status) === "ativa").length;
    const breachedTickets = visibleTickets.filter((ticket) => ticket.isOverdue || ticket.slaBreachedAt).length;
    const slaCompliance = visibleTickets.length
      ? Number((((visibleTickets.length - breachedTickets) / visibleTickets.length) * 100).toFixed(1))
      : 100;

    return {
      openTickets,
      criticalOpen,
      waitingApproval,
      solved,
      activeAssets,
      activeProjects,
      activeApis,
      firstResponseMinutes: 11,
      csat: 4.7,
      slaCompliance,
      backlogTrend: openTickets > 12 ? -8 : -3,
    };
  }, [data, visibleTickets]);

  const queueStats = useMemo(() => summarizeTicketsByQueue(data.queues, operationalTickets), [data.queues, operationalTickets]);
  const statusBuckets = useMemo(() => buildStatusBuckets(operationalTickets), [operationalTickets]);
  const priorityBuckets = useMemo(() => buildPriorityBuckets(operationalTickets), [operationalTickets]);
  const dailyOpenings = useMemo(() => buildDailyOpenings(operationalTickets, 5), [operationalTickets]);
  const technicianMetrics = useMemo(() => buildTechnicianMetrics(allTickets, data.users || []), [allTickets, data.users]);

  const slaAlerts = useMemo(
    () =>
      operationalTickets
        .filter(
          (ticket) =>
            ticket.dueSoon || ticket.isOverdue || ticket.criticalWaitingTechnician || ticket.unassigned,
        )
        .sort((left, right) => left.slaRemainingMinutes - right.slaRemainingMinutes)
        .slice(0, 20),
    [operationalTickets],
  );

  const searchTickets = (query, scope = operationalTickets) => {
    const normalizedQuery = normalizeText(query);
    if (!normalizedQuery) return scope;
    return scope.filter((ticket) => buildTicketSearchText(ticket).includes(normalizedQuery));
  };

  const searchKnowledgeArticles = (query, articles = knowledgeArticles) => {
    const normalizedQuery = normalizeText(query);
    if (!normalizedQuery) return articles;
    return articles.filter((article) => buildKnowledgeSearchText(article).includes(normalizedQuery));
  };

  const createTicket = (payload) => {
    if (!hasAnyPermission(user, ["tickets_create", "tickets_admin"])) return null;
    let createdTicket = null;

    applyState((current) => {
      const typeCodeMap = { incidente: "INC", requisicao: "REQ", problema: "PRB" };
      const nextNumber = (current.tickets.length + 2049).toString().padStart(4, "0");
      const nowIso = new Date().toISOString();
      const openedAt = payload.openedAt || nowIso;
      const priority = normalizePriorityLabel(payload.priority || computePriorityFromMatrix(payload.urgency, payload.impact));
      const slaTargetMinutes = getSlaPolicyMinutes(priority);
      const requesterId = canViewAllTickets(user) ? payload.requesterId || "" : user?.id || "";
      const requesterEmail = canViewAllTickets(user)
        ? String(payload.requesterEmail || "").trim().toLowerCase()
        : String(user?.email || "").trim().toLowerCase();
      const requester = canViewAllTickets(user) ? payload.requester : user?.name || payload.requester;
      const history = [
        createHistoryEntry({
          type: "created",
          actorId: user?.id,
          actorName: user?.name || "Sistema",
          message: "Chamado aberto",
          metadata: { status: "Aberto" },
          createdAt: nowIso,
        }),
      ];

      createdTicket = {
        id: `${typeCodeMap[normalizeText(payload.type)] ?? "TCK"}-${nextNumber}`,
        title: String(payload.title || "").trim(),
        type: payload.type,
        priority,
        urgency: payload.urgency || priority,
        impact: payload.impact || priority,
        status: normalizeTicketStatus(payload.status || "Aberto"),
        requester,
        requesterId,
        requesterEmail,
        assignee: String(payload.assignee || "Triagem TI").trim(),
        queue: String(payload.queue || "Service Desk").trim(),
        category: String(payload.category || "Geral").trim(),
        source: String(payload.source || "Portal").trim(),
        location: String(payload.location || "").trim(),
        sla: `${computeSlaFromMinutes(slaTargetMinutes)}`,
        slaTargetMinutes,
        slaDeadlineAt: new Date(new Date(openedAt).getTime() + slaTargetMinutes * 60 * 1000).toISOString(),
        updatedAt: formatTimestampLabel(nowIso),
        updatedAtIso: nowIso,
        openedAt,
        openedAtLabel: formatTimestampLabel(openedAt),
        dueDate: payload.dueDate || "",
        dueDateLabel: payload.dueDate ? formatDateLabel(payload.dueDate) : "",
        description: String(payload.description || "").trim(),
        resolutionNotes: "",
        resolvedAt: "",
        resolvedAtLabel: "",
        watchers: payload.watchers || "",
        attachments: payload.attachments || [],
        history,
        knowledgeArticleIds: Array.isArray(payload.knowledgeArticleIds) ? payload.knowledgeArticleIds : [],
      };

      return { ...current, tickets: [createdTicket, ...current.tickets] };
    });

    return createdTicket;
  };

  const updateTicket = (ticketId, updates) => {
    if (!hasAnyPermission(user, ["tickets_edit", "tickets_admin"])) return;
    applyState((current) => ({
      ...current,
      tickets: current.tickets.map((ticket) => {
        if (ticket.id !== ticketId) return ticket;
        if (!canAccessTicket(ticket, user)) return ticket;

        const statusChanged = updates.status !== undefined && normalizeTicketStatus(updates.status) !== normalizeTicketStatus(ticket.status);
        const assigneeChanged = updates.assignee !== undefined && String(updates.assignee || "").trim() !== String(ticket.assignee || "").trim();
        const requestedPriority =
          updates.priority !== undefined
            ? normalizePriorityLabel(updates.priority)
            : normalizePriorityLabel(computePriorityFromMatrix(updates.urgency ?? ticket.urgency, updates.impact ?? ticket.impact));
        const priorityChanged = normalizeText(requestedPriority) !== normalizeText(ticket.priority);

        if (assigneeChanged && !hasAnyPermission(user, ["tickets_assign", "tickets_admin"])) {
          return ticket;
        }
        if (priorityChanged && !hasAnyPermission(user, ["tickets_change_priority", "tickets_admin"])) {
          return ticket;
        }
        if (statusChanged) {
          if (!hasAnyPermission(user, ["tickets_change_status", "tickets_admin"])) {
            return ticket;
          }
          if (normalizeText(updates.status) === "resolvido" && !hasAnyPermission(user, ["tickets_close", "tickets_admin"])) {
            return ticket;
          }
          if (
            normalizeText(ticket.status) === "resolvido" &&
            normalizeText(updates.status) !== "resolvido" &&
            !hasAnyPermission(user, ["tickets_reopen", "tickets_admin"])
          ) {
            return ticket;
          }
        }

        const nowIso = new Date().toISOString();
        const nextStatus = normalizeTicketStatus(updates.status ?? ticket.status);
        const nextPriority = requestedPriority;
        const nextUrgency = updates.urgency ?? ticket.urgency;
        const nextImpact = updates.impact ?? ticket.impact;
        const nextOpenedAt = updates.openedAt ?? ticket.openedAt;
        const nextDueDate = updates.dueDate ?? ticket.dueDate;
        const nextAssignee = String((updates.assignee ?? ticket.assignee) || "").trim();
        const nextResolutionNotes = String((updates.resolutionNotes ?? ticket.resolutionNotes) || "").trim();
        const nextKnowledgeArticleIds = Array.isArray(updates.knowledgeArticleIds)
          ? [...new Set(updates.knowledgeArticleIds.filter(Boolean))]
          : ticket.knowledgeArticleIds || [];
        let resolvedAt = ticket.resolvedAt || "";
        if (normalizeText(nextStatus) === "resolvido") {
          resolvedAt = resolvedAt || nowIso;
        }
        if (normalizeText(nextStatus) === "reaberto") {
          resolvedAt = "";
        }

        const historyEntries = [];
        if (statusChanged) {
          historyEntries.push(
            createHistoryEntry({
              type: "status_change",
              actorId: user?.id,
              actorName: user?.name || "Sistema",
              message: `Status alterado para ${nextStatus}`,
              metadata: { from: ticket.status, to: nextStatus },
              createdAt: nowIso,
            }),
          );
          if (normalizeText(nextStatus) === "resolvido") {
            historyEntries.push(
              createHistoryEntry({
                type: "resolved",
                actorId: user?.id,
                actorName: user?.name || "Sistema",
                message: "Chamado resolvido",
                createdAt: nowIso,
              }),
            );
          }
          if (normalizeText(nextStatus) === "reaberto") {
            historyEntries.push(
              createHistoryEntry({
                type: "reopened",
                actorId: user?.id,
                actorName: user?.name || "Sistema",
                message: "Chamado reaberto",
                createdAt: nowIso,
              }),
            );
          }
        }
        if (priorityChanged) {
          historyEntries.push(
            createHistoryEntry({
              type: "priority_change",
              actorId: user?.id,
              actorName: user?.name || "Sistema",
              message: `Prioridade alterada para ${nextPriority}`,
              metadata: { from: ticket.priority, to: nextPriority },
              createdAt: nowIso,
            }),
          );
        }
        if (assigneeChanged) {
          historyEntries.push(
            createHistoryEntry({
              type: "assignment_change",
              actorId: user?.id,
              actorName: user?.name || "Sistema",
              message: `Tecnico responsavel alterado para ${nextAssignee || "Sem tecnico"}`,
              metadata: { from: ticket.assignee, to: nextAssignee },
              createdAt: nowIso,
            }),
          );
        }
        if (nextResolutionNotes && nextResolutionNotes !== String(ticket.resolutionNotes || "").trim()) {
          historyEntries.push(
            createHistoryEntry({
              type: "solution",
              actorId: user?.id,
              actorName: user?.name || "Sistema",
              message: "Solucao aplicada registrada",
              createdAt: nowIso,
            }),
          );
        }

        const nextTicket = {
          ...ticket,
          ...updates,
          status: nextStatus,
          priority: nextPriority,
          urgency: nextUrgency,
          impact: nextImpact,
          sla: computeSlaFromMinutes(getSlaPolicyMinutes(nextPriority)),
          slaTargetMinutes: getSlaPolicyMinutes(nextPriority),
          slaDeadlineAt: new Date(new Date(nextOpenedAt).getTime() + getSlaPolicyMinutes(nextPriority) * 60 * 1000).toISOString(),
          openedAt: nextOpenedAt,
          openedAtLabel: formatTimestampLabel(nextOpenedAt),
          dueDate: nextDueDate,
          dueDateLabel: nextDueDate ? formatDateLabel(nextDueDate) : "",
          requester: canViewAllTickets(user) ? updates.requester ?? ticket.requester : ticket.requester,
          requesterEmail: canViewAllTickets(user)
            ? String(updates.requesterEmail ?? ticket.requesterEmail ?? "").trim().toLowerCase()
            : String(ticket.requesterEmail || "").trim().toLowerCase(),
          assignee: nextAssignee,
          resolutionNotes: nextResolutionNotes,
          resolvedAt,
          resolvedAtLabel: resolvedAt ? formatTimestampLabel(resolvedAt) : "",
          updatedAtIso: nowIso,
          updatedAt: formatTimestampLabel(nowIso),
          knowledgeArticleIds: nextKnowledgeArticleIds,
          history: appendHistory(ticket, historyEntries),
        };

        return nextTicket;
      }),
    }));
  };

  const deleteTicket = (ticketId) => {
    if (!hasAnyPermission(user, ["tickets_delete", "tickets_admin"])) return;
    applyState((current) => ({
      ...current,
      tickets: current.tickets.filter((ticket) => ticket.id !== ticketId || !canAccessTicket(ticket, user)),
    }));
  };

  const addTicketAttachments = (ticketId, attachments) => {
    if (!hasAnyPermission(user, ["tickets_edit", "tickets_admin"])) return;
    applyState((current) => ({
      ...current,
      tickets: current.tickets.map((ticket) =>
        ticket.id === ticketId && canAccessTicket(ticket, user)
          ? {
              ...ticket,
              attachments: [...(ticket.attachments || []), ...attachments],
              updatedAtIso: new Date().toISOString(),
              updatedAt: formatTimestampLabel(new Date().toISOString()),
            }
          : ticket,
      ),
    }));
  };

  const removeTicketAttachment = (ticketId, attachmentId) => {
    if (!hasAnyPermission(user, ["tickets_edit", "tickets_admin"])) return;
    applyState((current) => ({
      ...current,
      tickets: current.tickets.map((ticket) =>
        ticket.id === ticketId && canAccessTicket(ticket, user)
          ? {
              ...ticket,
              attachments: (ticket.attachments || []).filter((attachment) => attachment.id !== attachmentId),
              updatedAtIso: new Date().toISOString(),
              updatedAt: formatTimestampLabel(new Date().toISOString()),
            }
          : ticket,
      ),
    }));
  };

  const addUser = (payload) => {
    if (!hasAnyPermission(user, ["users_create", "users_admin"])) return null;
    let createdUser = null;
    applyState((current) => {
      createdUser = { id: nextId("u", current.users || []), ...sanitizeUserPayload(payload) };
      return { ...current, users: [createdUser, ...(current.users || [])] };
    });
    return createdUser;
  };

  const updateUser = (userId, payload) => {
    if (!hasAnyPermission(user, ["users_edit", "users_admin"])) return;
    applyState((current) => {
      let nextCurrentUser = null;
      const nextUsers = current.users.map((candidate) => {
        if (candidate.id !== userId) return candidate;
        const sanitizedPayload = sanitizeUserPayload(payload);
        const permissionsChanged =
          JSON.stringify(candidate.permissions || {}) !== JSON.stringify(sanitizedPayload.permissions || {});
        const passwordChanged = String(candidate.password || "") !== String(sanitizedPayload.password || "");
        const nextUser = {
          ...candidate,
          name: sanitizedPayload.name,
          email: sanitizedPayload.email,
          role: sanitizedPayload.role,
          team: sanitizedPayload.team,
          department: sanitizedPayload.department,
          avatar: sanitizedPayload.avatar,
          ...(passwordChanged && hasAnyPermission(user, ["users_reset_password", "users_admin"])
            ? { password: sanitizedPayload.password }
            : {}),
          ...(permissionsChanged && hasAnyPermission(user, ["users_manage_permissions", "users_admin"])
            ? { permissions: sanitizedPayload.permissions }
            : {}),
        };
        if (nextUser.id === user?.id) nextCurrentUser = nextUser;
        return nextUser;
      });
      if (nextCurrentUser) setSessionUser(nextCurrentUser);
      return { ...current, users: nextUsers };
    });
  };

  const updateOwnProfile = (payload) => {
    if (!user?.id) return;
    applyState((current) => {
      let nextCurrentUser = null;
      const nextUsers = current.users.map((candidate) => {
        if (candidate.id !== user.id) return candidate;
        nextCurrentUser = { ...candidate, avatar: String(payload.avatar || "").trim() };
        return nextCurrentUser;
      });
      if (nextCurrentUser) setSessionUser(nextCurrentUser);
      return { ...current, users: nextUsers };
    });
  };

  const deleteUser = (userId) => {
    if (!hasAnyPermission(user, ["users_delete", "users_admin"])) return;
    applyState((current) => ({
      ...current,
      users: current.users.filter((candidate) => candidate.id !== userId),
    }));
  };

  const addAsset = (payload) => {
    if (!hasAnyPermission(user, ["assets_create", "assets_admin"])) return;
    applyState((current) => ({
      ...current,
      assets: [{ id: nextId("asset", current.assets || []), ...payload }, ...(current.assets || [])],
    }));
  };

  const updateAsset = (assetId, payload) => {
    if (!hasAnyPermission(user, ["assets_edit", "assets_admin"])) return;
    applyState((current) => ({
      ...current,
      assets: current.assets.map((asset) => {
        if (asset.id !== assetId) return asset;
        const nextOwner =
          payload.owner !== asset.owner && !hasAnyPermission(user, ["assets_link_users", "assets_admin"])
            ? asset.owner
            : payload.owner;
        const nextLocation =
          payload.location !== asset.location && !hasAnyPermission(user, ["assets_move", "assets_admin"])
            ? asset.location
            : payload.location;
        return { ...asset, ...payload, owner: nextOwner, location: nextLocation };
      }),
    }));
  };

  const deleteAsset = (assetId) => {
    if (!hasAnyPermission(user, ["assets_delete", "assets_admin"])) return;
    applyState((current) => ({
      ...current,
      assets: current.assets.filter((asset) => asset.id !== assetId),
    }));
  };

  const addBrand = (payload) => {
    if (!hasAnyPermission(user, ["brands_models_create", "brands_models_admin"])) return null;
    let createdBrand = null;
    applyState((current) => {
      createdBrand = { id: nextId("brand", current.brands || []), ...sanitizeBrandPayload(payload) };
      return { ...current, brands: [createdBrand, ...(current.brands || [])] };
    });
    return createdBrand;
  };

  const updateBrand = (brandId, payload) => {
    if (!hasAnyPermission(user, ["brands_models_edit", "brands_models_admin"])) return;
    applyState((current) => ({
      ...current,
      brands: current.brands.map((brand) => (brand.id === brandId ? { ...brand, ...sanitizeBrandPayload(payload) } : brand)),
      models: current.models.map((model) =>
        model.brandId === brandId
          ? {
              ...model,
              brandName: payload.name,
              assetType: payload.assetType,
              status: payload.status === "Inativo" ? "Inativo" : model.status,
            }
          : model,
      ),
      assets: current.assets.map((asset) =>
        asset.manufacturer === payload.previousName && resolveAssetType(asset.type) === payload.assetType
          ? { ...asset, manufacturer: payload.name, brandId }
          : asset,
      ),
    }));
  };

  const deleteBrand = (brandId) => {
    if (!hasAnyPermission(user, ["brands_models_delete", "brands_models_admin"])) return;
    applyState((current) => ({
      ...current,
      brands: current.brands.filter((brand) => brand.id !== brandId),
      models: current.models.filter((model) => model.brandId !== brandId),
    }));
  };

  const addModel = (payload) => {
    if (!hasAnyPermission(user, ["brands_models_create", "brands_models_admin"])) return null;
    let createdModel = null;
    applyState((current) => {
      createdModel = { id: nextId("model", current.models || []), ...sanitizeModelPayload(payload) };
      return { ...current, models: [createdModel, ...(current.models || [])] };
    });
    return createdModel;
  };

  const updateModel = (modelId, payload) => {
    if (!hasAnyPermission(user, ["brands_models_edit", "brands_models_admin"])) return;
    applyState((current) => ({
      ...current,
      models: current.models.map((model) => (model.id === modelId ? { ...model, ...sanitizeModelPayload(payload) } : model)),
      assets: current.assets.map((asset) =>
        asset.manufacturer === payload.brandName &&
        asset.model === payload.previousName &&
        resolveAssetType(asset.type) === payload.assetType
          ? { ...asset, model: payload.name, modelId, brandId: payload.brandId }
          : asset,
      ),
    }));
  };

  const deleteModel = (modelId) => {
    if (!hasAnyPermission(user, ["brands_models_delete", "brands_models_admin"])) return;
    applyState((current) => ({
      ...current,
      models: current.models.filter((model) => model.id !== modelId),
    }));
  };

  const addProject = (payload) => {
    if (!hasAnyPermission(user, ["projects_create", "projects_admin"])) return;
    applyState((current) => ({
      ...current,
      projects: [{ id: nextId("project", current.projects || []), ...sanitizeProjectPayload(payload) }, ...(current.projects || [])],
    }));
  };

  const updateProject = (projectId, payload) => {
    if (!hasAnyPermission(user, ["projects_edit", "projects_admin"])) return;
    applyState((current) => ({
      ...current,
      projects: current.projects.map((project) =>
        project.id === projectId ? { ...project, ...sanitizeProjectPayload({ ...project, ...payload }) } : project,
      ),
    }));
  };

  const deleteProject = (projectId) => {
    if (!hasAnyPermission(user, ["projects_delete", "projects_admin"])) return;
    applyState((current) => ({
      ...current,
      projects: current.projects.filter((project) => project.id !== projectId),
    }));
  };

  const addKnowledgeArticle = (payload) => {
    if (!hasAnyPermission(user, ["knowledge_create", "knowledge_admin"])) return null;
    let createdArticle = null;
    applyState((current) => {
      createdArticle = {
        id: nextId("kb", current.knowledgeArticles || []),
        ...sanitizeKnowledgeArticlePayload(payload),
        owner: payload.owner || user?.name || "",
      };
      return {
        ...current,
        knowledgeArticles: [createdArticle, ...(current.knowledgeArticles || [])],
      };
    });
    return createdArticle;
  };

  const updateKnowledgeArticle = (articleId, payload) => {
    if (!hasAnyPermission(user, ["knowledge_edit", "knowledge_admin"])) return;
    applyState((current) => ({
      ...current,
      knowledgeArticles: current.knowledgeArticles.map((article) =>
        article.id === articleId
          ? {
              ...article,
              ...sanitizeKnowledgeArticlePayload({ ...article, ...payload }),
              owner: payload.owner || article.owner,
            }
          : article,
      ),
    }));
  };

  const toggleKnowledgeArticleStatus = (articleId) => {
    if (!hasAnyPermission(user, ["knowledge_inactivate", "knowledge_admin"])) return;
    applyState((current) => ({
      ...current,
      knowledgeArticles: current.knowledgeArticles.map((article) =>
        article.id === articleId
          ? {
              ...article,
              status: article.status === "Ativo" ? "Inativo" : "Ativo",
              lastUpdate: new Date().toISOString(),
            }
          : article,
      ),
    }));
  };

  const createKnowledgeArticleFromTicket = (ticketId, payload = {}) => {
    if (!hasAnyPermission(user, ["knowledge_create", "knowledge_admin"])) return null;
    let articleId = null;
    applyState((current) => {
      const sourceTicket = current.tickets.find((ticket) => ticket.id === ticketId);
      if (!sourceTicket) return current;
      articleId = nextId("kb", current.knowledgeArticles || []);
      const article = {
        id: articleId,
        ...sanitizeKnowledgeArticlePayload({
          title: payload.title || sourceTicket.title,
          category: payload.category || sourceTicket.queue || "Procedimento",
          problemDescription: payload.problemDescription || sourceTicket.description,
          solutionApplied: payload.solutionApplied || sourceTicket.resolutionNotes,
          keywords: payload.keywords || `${sourceTicket.category || ""}, ${sourceTicket.priority || ""}`,
          owner: payload.owner || user?.name || sourceTicket.assignee || "",
          sourceTicketId: sourceTicket.id,
          status: payload.status || "Ativo",
        }),
      };

      return {
        ...current,
        knowledgeArticles: [article, ...(current.knowledgeArticles || [])],
        tickets: current.tickets.map((ticket) =>
          ticket.id === ticketId
            ? {
                ...ticket,
                knowledgeArticleIds: [...new Set([...(ticket.knowledgeArticleIds || []), articleId])],
                history: appendHistory(ticket, [
                  createHistoryEntry({
                    type: "knowledge_created",
                    actorId: user?.id,
                    actorName: user?.name || "Sistema",
                    message: `Artigo ${article.title} criado a partir do chamado`,
                    metadata: { articleId },
                  }),
                ]),
              }
            : ticket,
        ),
      };
    });
    return articleId;
  };

  const linkKnowledgeArticleToTicket = (ticketId, articleId) => {
    if (!hasAnyPermission(user, ["tickets_edit", "tickets_admin"])) return;
    applyState((current) => ({
      ...current,
      tickets: current.tickets.map((ticket) =>
        ticket.id === ticketId
          ? {
              ...ticket,
              knowledgeArticleIds: [...new Set([...(ticket.knowledgeArticleIds || []), articleId])],
              history: appendHistory(ticket, [
                createHistoryEntry({
                  type: "knowledge_linked",
                  actorId: user?.id,
                  actorName: user?.name || "Sistema",
                  message: "Artigo da base vinculado ao chamado",
                  metadata: { articleId },
                }),
              ]),
            }
          : ticket,
      ),
    }));
  };

  const saveApiConfig = (payload, configId) => {
    if (!hasAnyPermission(user, ["api_rest_configure_integrations", "api_rest_admin"])) return;
    if (configId) {
      applyState((current) => ({
        ...current,
        apiConfigs: current.apiConfigs.map((config) => (config.id === configId ? { ...config, ...payload } : config)),
      }));
      return;
    }

    applyState((current) => ({
      ...current,
      apiConfigs: [{ id: nextId("api", current.apiConfigs || []), ...payload }, ...(current.apiConfigs || [])],
    }));
  };

  const deleteApiConfig = (configId) => {
    if (!hasAnyPermission(user, ["api_rest_configure_integrations", "api_rest_admin"])) return;
    applyState((current) => ({
      ...current,
      apiConfigs: current.apiConfigs.filter((config) => config.id !== configId),
    }));
  };

  const value = useMemo(
    () => ({
      summary,
      queues: queueStats,
      users: data.users || [],
      tickets: visibleTickets,
      allTickets,
      operationalTickets,
      canViewAllTickets: canViewAllTickets(user),
      assets: data.assets || [],
      brands: data.brands || [],
      models: data.models || [],
      projects: data.projects || [],
      knowledgeArticles,
      apiConfigs: data.apiConfigs || [],
      reports: data.reports,
      statusBuckets,
      priorityBuckets,
      dailyOpenings,
      technicianMetrics,
      slaAlerts,
      notifications,
      pushToast,
      dismissToast,
      createTicket,
      updateTicket,
      deleteTicket,
      addTicketAttachments,
      removeTicketAttachment,
      searchTickets,
      searchKnowledgeArticles,
      addUser,
      updateUser,
      updateOwnProfile,
      deleteUser,
      addAsset,
      updateAsset,
      deleteAsset,
      addBrand,
      updateBrand,
      deleteBrand,
      addModel,
      updateModel,
      deleteModel,
      addProject,
      updateProject,
      deleteProject,
      addKnowledgeArticle,
      updateKnowledgeArticle,
      toggleKnowledgeArticleStatus,
      createKnowledgeArticleFromTicket,
      linkKnowledgeArticleToTicket,
      saveApiConfig,
      deleteApiConfig,
      toLocalDatetimeInput,
    }),
    [
      summary,
      queueStats,
      data,
      visibleTickets,
      allTickets,
      operationalTickets,
      knowledgeArticles,
      statusBuckets,
      priorityBuckets,
      dailyOpenings,
      technicianMetrics,
      slaAlerts,
      notifications,
      user,
    ],
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

function computeSlaFromMinutes(minutes) {
  if (minutes < 60) return `${minutes} min`;
  return `${Math.round(minutes / 60)}h`;
}

export function useAppData() {
  const context = useContext(AppDataContext);
  if (!context) throw new Error("useAppData must be used within AppDataProvider");
  return context;
}
