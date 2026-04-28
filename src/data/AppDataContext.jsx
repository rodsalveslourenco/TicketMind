import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import {
  canViewAllTickets,
  canViewOwnTickets,
  defaultPermissions as defaultUserPermissions,
  hasAnyPermission,
  normalizeUserPermissions,
} from "./permissions";
import { seedData } from "./seedData";
import { assetTypeOptions } from "./assetCatalog";

const STORAGE_KEY = "ticketmind-data";
const AppDataContext = createContext(null);

function buildDefaultUsers() {
  return seedData.users.map((candidate) => ({ ...candidate, password: "admin0123" }));
}

function hydrateUsers(users) {
  const baseUsers = Array.isArray(users) && users.length ? users : buildDefaultUsers();
  return baseUsers.map((candidate) => ({
    ...candidate,
    password: candidate.password || "admin0123",
    permissions: normalizeUserPermissions(candidate.permissions || {}, candidate),
  }));
}

function mergeCatalogItems(storedItems, seedItems, identityBuilder) {
  const currentItems = Array.isArray(storedItems) ? storedItems : [];
  const identities = new Set(currentItems.map(identityBuilder));
  const missingSeedItems = seedItems.filter((item) => !identities.has(identityBuilder(item)));
  return [...currentItems, ...missingSeedItems];
}

function mergeCollections(stored) {
  const users = hydrateUsers(stored?.users);
  const currentUser =
    users.find((candidate) => candidate.email === seedData.currentUser.email) ??
    { ...seedData.currentUser, password: "admin0123" };

  const brands = mergeCatalogItems(
    stored?.brands,
    seedData.brands,
    (brand) => `${normalizeText(brand.assetType)}::${normalizeText(brand.name)}`,
  );
  const models = mergeCatalogItems(
    stored?.models,
    seedData.models,
    (model) => `${normalizeText(model.assetType)}::${normalizeText(model.brandName)}::${normalizeText(model.name)}`,
  );

  return {
    ...seedData,
    ...stored,
    currentUser,
    users,
    queues: Array.isArray(stored?.queues) && stored.queues.length ? stored.queues : seedData.queues,
    tickets: prepareTickets(Array.isArray(stored?.tickets) ? stored.tickets : seedData.tickets, users),
    assets: Array.isArray(stored?.assets) ? stored.assets : seedData.assets,
    brands,
    models,
    projects: (Array.isArray(stored?.projects) ? stored.projects : seedData.projects).map(sanitizeProjectPayload),
    apiConfigs: Array.isArray(stored?.apiConfigs) ? stored.apiConfigs : seedData.apiConfigs,
    reports: Array.isArray(stored?.reports) && stored.reports.length ? stored.reports : seedData.reports,
  };
}

function readInitialState() {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) return mergeCollections({});

  try {
    return mergeCollections(JSON.parse(stored));
  } catch {
    return mergeCollections({});
  }
}

function formatDate(isoValue) {
  if (!isoValue) return "";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(isoValue));
}

function formatTimestamp(isoValue) {
  if (!isoValue) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(isoValue));
}

function toLocalDatetimeInput(isoValue) {
  if (!isoValue) return "";
  const date = new Date(isoValue);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function nextId(prefix, list) {
  return `${prefix}-${list.length + 1}-${Date.now().toString(36)}`;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function resolveAssetType(type) {
  const normalized = normalizeText(type).trim();
  return assetTypeOptions.find((item) => normalizeText(item).trim() === normalized) || "Outros";
}

function computePriority(urgency, impact) {
  const scoreMap = { baixa: 1, media: 2, alta: 3, critica: 4 };
  const score = Math.max(scoreMap[normalizeText(urgency)] ?? 2, scoreMap[normalizeText(impact)] ?? 2);
  if (score >= 4) return "Crítica";
  if (score === 3) return "Alta";
  if (score === 2) return "Média";
  return "Baixa";
}

function computeSla(priority) {
  const normalizedPriority = normalizeText(priority);
  if (normalizedPriority === "critica") return "15 min";
  if (normalizedPriority === "alta") return "1h";
  if (normalizedPriority === "media") return "4h";
  return "8h";
}

function sanitizeUserPayload(payload) {
  return {
    name: String(payload.name || "").trim(),
    email: String(payload.email || "").trim().toLowerCase(),
    password: payload.password || "admin0123",
    role: String(payload.role || "").trim(),
    team: String(payload.team || "").trim(),
    department: String(payload.department || "").trim(),
    permissions: normalizeUserPermissions(payload.permissions || defaultUserPermissions, payload),
  };
}

function resolveTicketRequesterId(ticket, users) {
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

function prepareTickets(tickets, users) {
  const sourceTickets = Array.isArray(tickets) ? tickets : [];
  return sourceTickets.map((ticket) => ({
    ...ticket,
    requesterId: resolveTicketRequesterId(ticket, users),
    requesterEmail: String(ticket.requesterEmail || "").trim().toLowerCase(),
  }));
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

export function AppDataProvider({ children }) {
  const { user } = useAuth();
  const [data, setData] = useState(readInitialState);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

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

  const visibleTickets = useMemo(() => filterTicketsForUser(data.tickets, user), [data.tickets, user]);

  const summary = useMemo(() => {
    const openStatuses = ["Aberto", "Em atendimento", "Aguardando aprovação", "Análise"];
    const openTickets = visibleTickets.filter((ticket) => openStatuses.includes(ticket.status)).length;
    const criticalOpen = visibleTickets.filter(
      (ticket) => normalizeText(ticket.priority) === "critica" && openStatuses.includes(ticket.status),
    ).length;
    const waitingApproval = visibleTickets.filter(
      (ticket) => normalizeText(ticket.status) === "aguardando aprovacao",
    ).length;
    const solved = visibleTickets.filter((ticket) => normalizeText(ticket.status) === "resolvido").length;
    const activeAssets = data.assets.filter((asset) => normalizeText(asset.status) !== "baixado").length;
    const activeProjects = data.projects.filter((project) => normalizeText(project.status) !== "concluido").length;
    const activeApis = data.apiConfigs.filter((config) => normalizeText(config.status) === "ativa").length;
    const slaCompliance = openTickets
      ? Number((((openTickets - waitingApproval) / openTickets) * 100).toFixed(1))
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

  const queueStats = useMemo(
    () =>
      data.queues.map((queue) => {
        const queueTickets = visibleTickets.filter((ticket) => ticket.queue === queue.name);
        return {
          ...queue,
          open: queueTickets.length,
          overdue: queueTickets.filter((ticket) => ticket.sla.toLowerCase().includes("min")).length,
        };
      }),
    [data.queues, visibleTickets],
  );

  const createTicket = (payload) => {
    if (!hasAnyPermission(user, ["tickets_create", "tickets_admin"])) return null;
    let createdTicket = null;

    setData((current) => {
      const typeCodeMap = { incidente: "INC", requisicao: "REQ", problema: "PRB" };
      const nextNumber = (current.tickets.length + 2049).toString().padStart(4, "0");
      const openedAt = payload.openedAt || new Date().toISOString();
      const priority = computePriority(payload.urgency, payload.impact);
      const ticketRequesterId = canViewAllTickets(user) ? payload.requesterId || "" : user?.id || "";
      const ticketRequesterEmail = canViewAllTickets(user)
        ? String(payload.requesterEmail || "").trim().toLowerCase()
        : String(user?.email || "").trim().toLowerCase();
      const ticketRequester = canViewAllTickets(user) ? payload.requester : user?.name || payload.requester;

      createdTicket = {
        id: `${typeCodeMap[normalizeText(payload.type)] ?? "TCK"}-${nextNumber}`,
        title: payload.title,
        type: payload.type,
        priority,
        urgency: payload.urgency,
        impact: payload.impact,
        status: "Aberto",
        requester: ticketRequester,
        requesterId: ticketRequesterId,
        requesterEmail: ticketRequesterEmail,
        assignee: payload.assignee || "Triagem TI",
        queue: payload.queue,
        category: payload.category,
        source: payload.source,
        location: payload.location,
        sla: computeSla(priority),
        updatedAt: "Agora",
        openedAt,
        openedAtLabel: formatTimestamp(openedAt),
        dueDate: payload.dueDate || "",
        dueDateLabel: payload.dueDate ? formatDate(payload.dueDate) : "",
        description: payload.description,
        resolutionNotes: "",
        watchers: payload.watchers || "",
        attachments: payload.attachments || [],
      };

      return { ...current, tickets: [createdTicket, ...current.tickets] };
    });

    return createdTicket;
  };

  const updateTicket = (ticketId, updates) => {
    if (!hasAnyPermission(user, ["tickets_edit", "tickets_admin"])) return;
    setData((current) => ({
      ...current,
      tickets: current.tickets.map((ticket) => {
        if (ticket.id !== ticketId) return ticket;
        if (!canAccessTicket(ticket, user)) return ticket;
        if (updates.assignee !== undefined && updates.assignee !== ticket.assignee && !hasAnyPermission(user, ["tickets_assign", "tickets_admin"])) {
          return ticket;
        }
        if (
          (updates.urgency !== undefined || updates.impact !== undefined) &&
          !hasAnyPermission(user, ["tickets_change_priority", "tickets_admin"])
        ) {
          return ticket;
        }
        if (updates.status !== undefined && updates.status !== ticket.status) {
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
        const nextUrgency = updates.urgency ?? ticket.urgency;
        const nextImpact = updates.impact ?? ticket.impact;
        const priority = computePriority(nextUrgency, nextImpact);
        const openedAt = updates.openedAt ?? ticket.openedAt;
        const dueDate = updates.dueDate ?? ticket.dueDate;
        const nextRequester = canViewAllTickets(user) ? updates.requester ?? ticket.requester : ticket.requester;
        const nextRequesterEmail = canViewAllTickets(user)
          ? String(updates.requesterEmail ?? ticket.requesterEmail ?? "").trim().toLowerCase()
          : String(ticket.requesterEmail || "").trim().toLowerCase();

        return {
          ...ticket,
          ...updates,
          requester: nextRequester,
          urgency: nextUrgency,
          impact: nextImpact,
          priority,
          sla: computeSla(priority),
          openedAt,
          openedAtLabel: formatTimestamp(openedAt),
          dueDate,
          dueDateLabel: dueDate ? formatDate(dueDate) : "",
          requesterId: canViewAllTickets(user)
            ? resolveTicketRequesterId({ ...ticket, ...updates, requester: nextRequester }, current.users || [])
            : ticket.requesterId,
          requesterEmail: nextRequesterEmail,
          updatedAt: "Agora",
        };
      }),
    }));
  };

  const deleteTicket = (ticketId) => {
    if (!hasAnyPermission(user, ["tickets_delete", "tickets_admin"])) return;
    setData((current) => ({
      ...current,
      tickets: current.tickets.filter((ticket) => ticket.id !== ticketId || !canAccessTicket(ticket, user)),
    }));
  };

  const addTicketAttachments = (ticketId, attachments) => {
    if (!hasAnyPermission(user, ["tickets_edit", "tickets_admin"])) return;
    setData((current) => ({
      ...current,
      tickets: current.tickets.map((ticket) =>
        ticket.id === ticketId && canAccessTicket(ticket, user)
          ? { ...ticket, attachments: [...(ticket.attachments || []), ...attachments], updatedAt: "Agora" }
          : ticket,
      ),
    }));
  };

  const removeTicketAttachment = (ticketId, attachmentId) => {
    if (!hasAnyPermission(user, ["tickets_edit", "tickets_admin"])) return;
    setData((current) => ({
      ...current,
      tickets: current.tickets.map((ticket) =>
        ticket.id === ticketId && canAccessTicket(ticket, user)
          ? {
              ...ticket,
              attachments: (ticket.attachments || []).filter((attachment) => attachment.id !== attachmentId),
              updatedAt: "Agora",
            }
          : ticket,
      ),
    }));
  };

  const addUser = (payload) => {
    if (!hasAnyPermission(user, ["users_create", "users_admin"])) return null;
    let createdUser = null;
    setData((current) => {
      createdUser = { id: nextId("u", current.users || []), ...sanitizeUserPayload(payload) };
      return { ...current, users: [createdUser, ...(current.users || [])] };
    });
    return createdUser;
  };

  const updateUser = (userId, payload) => {
    if (!hasAnyPermission(user, ["users_edit", "users_admin"])) return;
    setData((current) => ({
      ...current,
      users: current.users.map((candidate) => {
        if (candidate.id !== userId) return candidate;
        const sanitizedPayload = sanitizeUserPayload(payload);
        const permissionsChanged =
          JSON.stringify(candidate.permissions || {}) !== JSON.stringify(sanitizedPayload.permissions || {});
        const passwordChanged = String(candidate.password || "") !== String(sanitizedPayload.password || "");
        return {
          ...candidate,
          ...(hasAnyPermission(user, ["users_edit", "users_admin"])
            ? {
                name: sanitizedPayload.name,
                email: sanitizedPayload.email,
                role: sanitizedPayload.role,
                team: sanitizedPayload.team,
                department: sanitizedPayload.department,
              }
            : {}),
          ...(passwordChanged && hasAnyPermission(user, ["users_reset_password", "users_admin"])
            ? { password: sanitizedPayload.password }
            : {}),
          ...(permissionsChanged && hasAnyPermission(user, ["users_manage_permissions", "users_admin"])
            ? { permissions: sanitizedPayload.permissions }
            : {}),
        };
      }),
    }));
  };

  const deleteUser = (userId) => {
    if (!hasAnyPermission(user, ["users_delete", "users_admin"])) return;
    setData((current) => ({
      ...current,
      users: current.users.filter((candidate) => candidate.id !== userId),
    }));
  };

  const addAsset = (payload) => {
    if (!hasAnyPermission(user, ["assets_create", "assets_admin"])) return;
    setData((current) => ({
      ...current,
      assets: [{ id: nextId("asset", current.assets || []), ...payload }, ...(current.assets || [])],
    }));
  };

  const updateAsset = (assetId, payload) => {
    if (!hasAnyPermission(user, ["assets_edit", "assets_admin"])) return;
    setData((current) => ({
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
    setData((current) => ({
      ...current,
      assets: current.assets.filter((asset) => asset.id !== assetId),
    }));
  };

  const addBrand = (payload) => {
    if (!hasAnyPermission(user, ["brands_models_create", "brands_models_admin"])) return null;
    let createdBrand = null;
    setData((current) => {
      createdBrand = { id: nextId("brand", current.brands || []), ...sanitizeBrandPayload(payload) };
      return {
        ...current,
        brands: [createdBrand, ...(current.brands || [])],
      };
    });
    return createdBrand;
  };

  const updateBrand = (brandId, payload) => {
    if (!hasAnyPermission(user, ["brands_models_edit", "brands_models_admin"])) return;
    setData((current) => ({
      ...current,
      brands: current.brands.map((brand) =>
        brand.id === brandId ? { ...brand, ...sanitizeBrandPayload(payload) } : brand,
      ),
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
    setData((current) => ({
      ...current,
      brands: current.brands.filter((brand) => brand.id !== brandId),
      models: current.models.filter((model) => model.brandId !== brandId),
    }));
  };

  const addModel = (payload) => {
    if (!hasAnyPermission(user, ["brands_models_create", "brands_models_admin"])) return null;
    let createdModel = null;
    setData((current) => {
      createdModel = { id: nextId("model", current.models || []), ...sanitizeModelPayload(payload) };
      return {
        ...current,
        models: [createdModel, ...(current.models || [])],
      };
    });
    return createdModel;
  };

  const updateModel = (modelId, payload) => {
    if (!hasAnyPermission(user, ["brands_models_edit", "brands_models_admin"])) return;
    setData((current) => ({
      ...current,
      models: current.models.map((model) =>
        model.id === modelId ? { ...model, ...sanitizeModelPayload(payload) } : model,
      ),
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
    setData((current) => ({
      ...current,
      models: current.models.filter((model) => model.id !== modelId),
    }));
  };

  const addProject = (payload) => {
    if (!hasAnyPermission(user, ["projects_create", "projects_admin"])) return;
    setData((current) => ({
      ...current,
      projects: [{ id: nextId("project", current.projects || []), ...sanitizeProjectPayload(payload) }, ...(current.projects || [])],
    }));
  };

  const updateProject = (projectId, payload) => {
    if (!hasAnyPermission(user, ["projects_edit", "projects_admin"])) return;
    setData((current) => ({
      ...current,
      projects: current.projects.map((project) =>
        project.id === projectId ? { ...project, ...sanitizeProjectPayload({ ...project, ...payload }) } : project,
      ),
    }));
  };

  const deleteProject = (projectId) => {
    if (!hasAnyPermission(user, ["projects_delete", "projects_admin"])) return;
    setData((current) => ({
      ...current,
      projects: current.projects.filter((project) => project.id !== projectId),
    }));
  };

  const saveApiConfig = (payload, configId) => {
    if (!hasAnyPermission(user, ["api_rest_configure_integrations", "api_rest_admin"])) return;
    if (configId) {
      setData((current) => ({
        ...current,
        apiConfigs: current.apiConfigs.map((config) =>
          config.id === configId ? { ...config, ...payload } : config,
        ),
      }));
      return;
    }

    setData((current) => ({
      ...current,
      apiConfigs: [{ id: nextId("api", current.apiConfigs || []), ...payload }, ...(current.apiConfigs || [])],
    }));
  };

  const deleteApiConfig = (configId) => {
    if (!hasAnyPermission(user, ["api_rest_configure_integrations", "api_rest_admin"])) return;
    setData((current) => ({
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
      canViewAllTickets: canViewAllTickets(user),
      assets: data.assets || [],
      brands: data.brands || [],
      models: data.models || [],
      projects: data.projects || [],
      apiConfigs: data.apiConfigs || [],
      reports: data.reports,
      notifications,
      pushToast,
      dismissToast,
      createTicket,
      updateTicket,
      deleteTicket,
      addTicketAttachments,
      removeTicketAttachment,
      addUser,
      updateUser,
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
      saveApiConfig,
      deleteApiConfig,
      toLocalDatetimeInput,
    }),
    [summary, queueStats, data, notifications, visibleTickets, user],
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const context = useContext(AppDataContext);
  if (!context) throw new Error("useAppData must be used within AppDataProvider");
  return context;
}

