import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { createTicketRequest, loadAppState, persistAppState, sendNotificationTestRequest } from "../services/appStateClient";
import {
  buildEmptyPermissions,
  getRolePermissions,
  hydratePermissionProfiles,
  getUserPermissionProfile,
  canViewAllTickets,
  canViewOwnTickets,
  hasAnyPermission,
  listPermissionKeys,
  normalizeRoleName,
  normalizeUserPermissions,
} from "./permissions";
import {
  defaultEmailPlaceholders,
  defaultEmailServiceSettings,
  defaultNavigationSections,
  defaultNotificationEvents,
  defaultPermissionCatalog,
  defaultPermissionProfiles,
  defaultServiceCenterSettings,
  defaultSmtpSettings,
} from "./systemDefaults";
import { assetTypeOptions } from "./assetCatalog";
import {
  appendHistory,
  buildKnowledgeSearchText,
  buildTicketSearchText,
  computePriorityFromMatrix,
  createApprovalHistoryEntry,
  createFollowUpEntry,
  createHistoryEntry,
  formatDateLabel,
  formatTimestampLabel,
  getTicketStatusOptionsForType,
  getSlaPolicyMinutes,
  isOpenTicketStatus,
  normalizeKnowledgeArticle,
  normalizeFollowUps,
  normalizeTicketChecklist,
  normalizeTicketSubtasks,
  normalizePriorityLabel,
  normalizeText,
  normalizeTicketStatus,
  prepareTickets,
  resolveTicketSlaSettings,
  sanitizeKnowledgeArticlePayload,
  statusRequiresPauseReason,
  statusRequiresWaitingReason,
  syncHelpdeskState,
  toLocalDatetimeInput,
} from "./helpdesk";
import { normalizeDepartmentColor } from "./departments";
import {
  DEFAULT_WATCHER_EVENT_KEYS,
  applyAdvancedRoutingRules,
  buildWatchersLabel,
  normalizeWatcherDetails,
  parseInboundEmailTicket,
  progressApprovalWorkflow,
  resolveApprovalWorkflow,
} from "./ticketAutomation";

const AppDataContext = createContext(null);

function hydrateUsers(users, permissionCatalog, permissionProfiles) {
  const baseUsers = Array.isArray(users) ? users : [];
  return baseUsers.map((candidate) => {
    const permissionProfile =
      getUserPermissionProfile(
        {
          permissionProfileId: candidate.permissionProfileId,
          role: candidate.role,
        },
        permissionProfiles,
      ) || null;
    const normalizedRole = permissionProfile?.name || normalizeRoleName(candidate.role);
    return {
      ...candidate,
      password: String(candidate.password || ""),
      passwordReveal: String(candidate.passwordReveal || ""),
      mustChangePassword: Boolean(candidate.mustChangePassword),
      status: String(candidate.status || "Ativo").trim() || "Ativo",
      role: normalizedRole,
      permissionProfileId: String(permissionProfile?.id || candidate.permissionProfileId || "").trim(),
      additionalPermissions: sanitizePermissionOverridePayload(candidate.additionalPermissions, permissionCatalog),
      restrictedPermissions: sanitizePermissionOverridePayload(candidate.restrictedPermissions, permissionCatalog),
      permissions: normalizeUserPermissions(
        candidate.permissions || {},
        {
          ...candidate,
          role: normalizedRole,
          permissionProfileId: permissionProfile?.id || candidate.permissionProfileId,
        },
        permissionCatalog,
        permissionProfiles,
      ),
    };
  });
}

function nextId(prefix, list) {
  return `${prefix}-${list.length + 1}-${Date.now().toString(36)}`;
}

function normalizeCode(value, fallback = "") {
  const baseValue = String(value || fallback || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim();
  const normalized = baseValue
    .split(/\s+/)
    .filter(Boolean)
    .join("-")
    .toUpperCase();
  return normalized || fallback || "SEM-CODIGO";
}

function findDepartmentMatch(departments, payload = {}) {
  const departmentId = String(payload.departmentId || "").trim();
  const departmentName = String(payload.department || payload.name || "").trim();
  if (departmentId) {
    const byId = departments.find((department) => department.id === departmentId);
    if (byId) return byId;
  }
  if (!departmentName) return null;
  return (
    departments.find(
      (department) =>
        normalizeText(department.name) === normalizeText(departmentName) ||
        normalizeText(department.code) === normalizeText(departmentName),
    ) || null
  );
}

function sanitizeDepartmentPayload(payload, currentDepartment = {}) {
  const nowIso = new Date().toISOString();
  const name = String(payload.name || payload.department || currentDepartment.name || "").trim();
  const code = normalizeCode(payload.code || currentDepartment.code || name, "DEP");
  return {
    code,
    name,
    color: normalizeDepartmentColor(payload.color || currentDepartment.color || ""),
    status: String(payload.status || currentDepartment.status || "Ativo").trim() || "Ativo",
    createdAt: payload.createdAt || currentDepartment.createdAt || nowIso,
    updatedAt: payload.updatedAt || currentDepartment.updatedAt || nowIso,
  };
}

function sanitizeServiceCenterDepartmentConfig(payload, currentConfig = {}) {
  const nowIso = new Date().toISOString();
  return {
    active: Boolean(payload.active),
    acceptsTickets: payload.acceptsTickets !== undefined ? Boolean(payload.acceptsTickets) : true,
    showInRequestPortal: Boolean(payload.showInRequestPortal),
    responsibleUserIds: Array.isArray(payload.responsibleUserIds) ? Array.from(new Set(payload.responsibleUserIds.filter(Boolean))) : [],
    createdAt: currentConfig.createdAt || payload.createdAt || nowIso,
    updatedAt: payload.updatedAt || nowIso,
  };
}

function sanitizeRoutingRulePayload(payload = {}, currentRule = {}) {
  return {
    id: String(payload.id || currentRule.id || "").trim(),
    name: String(payload.name || currentRule.name || "").trim(),
    active: payload.active !== false,
    type: String(payload.type || currentRule.type || "").trim(),
    priority: String(payload.priority || currentRule.priority || "").trim(),
    category: String(payload.category || currentRule.category || "").trim(),
    departmentId: String(payload.departmentId || currentRule.departmentId || "").trim(),
    department: String(payload.department || currentRule.department || "").trim(),
    queue: String(payload.queue || currentRule.queue || "").trim(),
    location: String(payload.location || currentRule.location || "").trim(),
    source: String(payload.source || currentRule.source || "").trim(),
    keyword: String(payload.keyword || currentRule.keyword || "").trim(),
    triageLabel: String(payload.triageLabel || currentRule.triageLabel || "").trim(),
    assigneeUserId: String(payload.assigneeUserId || currentRule.assigneeUserId || "").trim(),
    assigneeName: String(payload.assigneeName || currentRule.assigneeName || "").trim(),
    businessHoursOnly: Boolean(payload.businessHoursOnly ?? currentRule.businessHoursOnly),
    startHour: Number(payload.startHour ?? currentRule.startHour ?? 8) || 8,
    endHour: Number(payload.endHour ?? currentRule.endHour ?? 18) || 18,
    preserveManualAssignment: payload.preserveManualAssignment !== false,
  };
}

function sanitizeSlaPolicyPayload(payload = {}, currentPolicy = {}) {
  return {
    id: String(payload.id || currentPolicy.id || "").trim(),
    name: String(payload.name || currentPolicy.name || "").trim(),
    active: payload.active !== false,
    type: String(payload.type || currentPolicy.type || "").trim(),
    priority: String(payload.priority || currentPolicy.priority || "").trim(),
    category: String(payload.category || currentPolicy.category || "").trim(),
    departmentId: String(payload.departmentId || currentPolicy.departmentId || "").trim(),
    department: String(payload.department || currentPolicy.department || "").trim(),
    initialResponseMinutes: Number(payload.initialResponseMinutes ?? currentPolicy.initialResponseMinutes) || 60,
    resolutionMinutes: Number(payload.resolutionMinutes ?? currentPolicy.resolutionMinutes) || 240,
  };
}

function sanitizeApprovalStepPayload(payload = {}, currentStep = {}) {
  return {
    id: String(payload.id || currentStep.id || "").trim(),
    name: String(payload.name || currentStep.name || "").trim(),
    approverUserId: String(payload.approverUserId || currentStep.approverUserId || "").trim(),
    approverName: String(payload.approverName || currentStep.approverName || "").trim(),
    departmentId: String(payload.departmentId || currentStep.departmentId || "").trim(),
    department: String(payload.department || currentStep.department || "").trim(),
  };
}

function sanitizeApprovalRulePayload(payload = {}, currentRule = {}) {
  return {
    id: String(payload.id || currentRule.id || "").trim(),
    name: String(payload.name || currentRule.name || "").trim(),
    active: payload.active !== false,
    type: String(payload.type || currentRule.type || "Requisicao").trim() || "Requisicao",
    departmentId: String(payload.departmentId || currentRule.departmentId || "").trim(),
    department: String(payload.department || currentRule.department || "").trim(),
    minAmount: Number(payload.minAmount ?? currentRule.minAmount) || 0,
    maxAmount: Number(payload.maxAmount ?? currentRule.maxAmount) || 0,
    slaMinutes: Number(payload.slaMinutes ?? currentRule.slaMinutes) || 240,
    steps: (Array.isArray(payload.steps) ? payload.steps : Array.isArray(currentRule.steps) ? currentRule.steps : [])
      .map((step) => sanitizeApprovalStepPayload(step, step))
      .filter((step) => step.approverUserId || step.approverName),
  };
}

function sanitizeApproverDelegationPayload(payload = {}, currentDelegation = {}) {
  return {
    id: String(payload.id || currentDelegation.id || "").trim(),
    active: payload.active !== false,
    approverUserId: String(payload.approverUserId || currentDelegation.approverUserId || "").trim(),
    delegateUserId: String(payload.delegateUserId || currentDelegation.delegateUserId || "").trim(),
    startDate: String(payload.startDate || currentDelegation.startDate || "").trim(),
    endDate: String(payload.endDate || currentDelegation.endDate || "").trim(),
  };
}

function sanitizeEscalationRules(payload = {}, currentRules = {}) {
  return {
    enabled: payload.enabled !== undefined ? Boolean(payload.enabled) : Boolean(currentRules.enabled ?? defaultServiceCenterSettings.escalationRules.enabled),
    unassignedEnabled:
      payload.unassignedEnabled !== undefined ? Boolean(payload.unassignedEnabled) : Boolean(currentRules.unassignedEnabled ?? defaultServiceCenterSettings.escalationRules.unassignedEnabled),
    overdueEnabled:
      payload.overdueEnabled !== undefined ? Boolean(payload.overdueEnabled) : Boolean(currentRules.overdueEnabled ?? defaultServiceCenterSettings.escalationRules.overdueEnabled),
    unassignedMinutes: Math.max(5, Number(payload.unassignedMinutes ?? currentRules.unassignedMinutes ?? defaultServiceCenterSettings.escalationRules.unassignedMinutes) || defaultServiceCenterSettings.escalationRules.unassignedMinutes),
    maxEscalationLevel: Math.max(1, Number(payload.maxEscalationLevel ?? currentRules.maxEscalationLevel ?? defaultServiceCenterSettings.escalationRules.maxEscalationLevel) || defaultServiceCenterSettings.escalationRules.maxEscalationLevel),
  };
}

function sanitizeTicketStatusProfiles(payload = {}, currentProfiles = {}) {
  const fallbackProfiles = currentProfiles && typeof currentProfiles === "object" ? currentProfiles : defaultServiceCenterSettings.ticketStatusProfiles;
  return Object.entries(defaultServiceCenterSettings.ticketStatusProfiles).reduce((accumulator, [type, defaultStatuses]) => {
    const nextStatuses = Array.isArray(payload?.[type]) ? payload[type] : fallbackProfiles?.[type];
    const sanitizedStatuses = (Array.isArray(nextStatuses) ? nextStatuses : defaultStatuses)
      .map((status) => String(status || "").trim())
      .filter(Boolean);
    return {
      ...accumulator,
      [type]: sanitizedStatuses.length ? sanitizedStatuses : defaultStatuses,
    };
  }, {});
}

function sanitizeStatusReasonRules(payload = {}, currentRules = {}) {
  const fallbackRules = currentRules && typeof currentRules === "object" ? currentRules : defaultServiceCenterSettings.statusReasonRules;
  return {
    pauseStatuses: (Array.isArray(payload?.pauseStatuses) ? payload.pauseStatuses : fallbackRules?.pauseStatuses || defaultServiceCenterSettings.statusReasonRules.pauseStatuses)
      .map((status) => String(status || "").trim())
      .filter(Boolean),
    waitingStatuses: (Array.isArray(payload?.waitingStatuses) ? payload.waitingStatuses : fallbackRules?.waitingStatuses || defaultServiceCenterSettings.statusReasonRules.waitingStatuses)
      .map((status) => String(status || "").trim())
      .filter(Boolean),
  };
}

function sanitizeEmailIntakeConfig(payload = {}, currentConfig = {}) {
  const nextConfig = payload && typeof payload === "object" ? payload : {};
  return {
    enabled: Boolean(nextConfig.enabled ?? currentConfig.enabled),
    inboxAddress: String(nextConfig.inboxAddress || currentConfig.inboxAddress || "").trim().toLowerCase(),
    defaultDepartmentId: String(nextConfig.defaultDepartmentId || currentConfig.defaultDepartmentId || "").trim(),
    defaultPriority: String(nextConfig.defaultPriority || currentConfig.defaultPriority || "Media").trim() || "Media",
    categoryHints: (Array.isArray(nextConfig.categoryHints) ? nextConfig.categoryHints : Array.isArray(currentConfig.categoryHints) ? currentConfig.categoryHints : [])
      .map((hint) => ({
        keyword: String(hint.keyword || "").trim(),
        category: String(hint.category || "").trim(),
        type: String(hint.type || "Incidente").trim() || "Incidente",
        location: String(hint.location || "").trim(),
      }))
      .filter((hint) => hint.keyword && hint.category),
    priorityHints: (Array.isArray(nextConfig.priorityHints) ? nextConfig.priorityHints : Array.isArray(currentConfig.priorityHints) ? currentConfig.priorityHints : [])
      .map((hint) => ({
        keyword: String(hint.keyword || "").trim(),
        priority: String(hint.priority || "Media").trim() || "Media",
      }))
      .filter((hint) => hint.keyword),
  };
}

function hydrateDepartments(storedDepartments) {
  return (Array.isArray(storedDepartments) ? storedDepartments : [])
    .map((department) => ({
      id: String(department.id || "").trim(),
      ...sanitizeDepartmentPayload(department, department),
    }))
    .filter((department) => department.id && department.name)
    .sort((left, right) => left.name.localeCompare(right.name));
}

function sanitizeTeamPayload(payload, currentTeam = {}) {
  const nowIso = new Date().toISOString();
  const name = String(payload.name || payload.team || currentTeam.name || "").trim();
  return {
    name,
    status: String(payload.status || currentTeam.status || "Ativo").trim() || "Ativo",
    createdAt: payload.createdAt || currentTeam.createdAt || nowIso,
    updatedAt: payload.updatedAt || currentTeam.updatedAt || nowIso,
  };
}

function hydrateTeams(storedTeams, users = []) {
  const explicitTeams = (Array.isArray(storedTeams) ? storedTeams : [])
    .map((team) => ({
      id: String(team.id || "").trim(),
      ...sanitizeTeamPayload(team, team),
    }))
    .filter((team) => team.id && team.name);

  const usedTeamNames = Array.from(
    new Set(
      (Array.isArray(users) ? users : [])
        .map((candidate) => String(candidate.team || "").trim())
        .filter(Boolean),
    ),
  );

  const inferredTeams = usedTeamNames
    .filter((teamName) => !explicitTeams.some((team) => normalizeText(team.name) === normalizeText(teamName)))
    .map((teamName) => ({
      id: `team-${normalizeCode(teamName, "EQUIPE").toLowerCase()}`,
      ...sanitizeTeamPayload({ name: teamName, status: "Ativo" }),
    }));

  return [...explicitTeams, ...inferredTeams].sort((left, right) => left.name.localeCompare(right.name));
}

function hydrateServiceCenter(storedConfig, departments = []) {
  const rawConfig = storedConfig && typeof storedConfig === "object" ? storedConfig : {};
  const rawDepartments = rawConfig.departments && typeof rawConfig.departments === "object" ? rawConfig.departments : {};

  const departmentsConfig = departments.reduce((accumulator, department) => {
    const storedDepartmentConfig = rawDepartments[department.id] && typeof rawDepartments[department.id] === "object" ? rawDepartments[department.id] : {};
    return {
      ...accumulator,
      [department.id]: sanitizeServiceCenterDepartmentConfig(storedDepartmentConfig, storedDepartmentConfig),
    };
  }, {});

  return {
    ...defaultServiceCenterSettings,
    ...rawConfig,
    enabled: Boolean(rawConfig.enabled),
    departments: departmentsConfig,
    triagePanelVisible: rawConfig.triagePanelVisible !== false,
    routingRules: (Array.isArray(rawConfig.routingRules) ? rawConfig.routingRules : [])
      .map((rule) => sanitizeRoutingRulePayload(rule, rule))
      .filter((rule) => rule.id || rule.name),
    slaPolicies: (Array.isArray(rawConfig.slaPolicies) ? rawConfig.slaPolicies : [])
      .map((policy) => sanitizeSlaPolicyPayload(policy, policy))
      .filter((policy) => policy.id || policy.name),
    approvalRules: (Array.isArray(rawConfig.approvalRules) ? rawConfig.approvalRules : [])
      .map((rule) => sanitizeApprovalRulePayload(rule, rule))
      .filter((rule) => rule.id || rule.name || rule.steps.length),
    approverDelegations: (Array.isArray(rawConfig.approverDelegations) ? rawConfig.approverDelegations : [])
      .map((delegation) => sanitizeApproverDelegationPayload(delegation, delegation))
      .filter((delegation) => delegation.approverUserId && delegation.delegateUserId),
    escalationRules: sanitizeEscalationRules(rawConfig.escalationRules, defaultServiceCenterSettings.escalationRules),
    ticketStatusProfiles: sanitizeTicketStatusProfiles(rawConfig.ticketStatusProfiles, defaultServiceCenterSettings.ticketStatusProfiles),
    statusReasonRules: sanitizeStatusReasonRules(rawConfig.statusReasonRules, defaultServiceCenterSettings.statusReasonRules),
    emailIntake: sanitizeEmailIntakeConfig(rawConfig.emailIntake, defaultServiceCenterSettings.emailIntake),
    updatedAt: String(rawConfig.updatedAt || "").trim(),
  };
}

function syncUserDepartment(candidate, departments) {
  if (!candidate || typeof candidate !== "object") return null;
  const departmentMatch = findDepartmentMatch(departments, candidate);
  return {
    ...candidate,
    departmentId: departmentMatch?.id || String(candidate.departmentId || "").trim(),
    department: departmentMatch?.name || String(candidate.department || "").trim(),
  };
}

function sanitizeLocationPayload(payload, departments, currentLocation = {}) {
  const nowIso = new Date().toISOString();
  const name = String(payload.name || payload.location || currentLocation.name || "").trim();
  const departmentMatch = findDepartmentMatch(departments, {
    departmentId: payload.departmentId || currentLocation.departmentId,
    department: payload.department || currentLocation.department,
  });

  return {
    code: normalizeCode(payload.code || currentLocation.code || name, "LOC"),
    name,
    departmentId: departmentMatch?.id || String(payload.departmentId || currentLocation.departmentId || "").trim(),
    department: departmentMatch?.name || String(payload.department || currentLocation.department || "").trim(),
    status: String(payload.status || currentLocation.status || "Ativo").trim() || "Ativo",
    createdAt: payload.createdAt || currentLocation.createdAt || nowIso,
    updatedAt: payload.updatedAt || currentLocation.updatedAt || nowIso,
  };
}

function hydrateLocations(storedLocations, departments) {
  return (Array.isArray(storedLocations) ? storedLocations : [])
    .map((location) => ({
      id: String(location.id || "").trim(),
      ...sanitizeLocationPayload(location, departments, location),
    }))
    .filter((location) => location.id && location.name)
    .sort((left, right) => left.name.localeCompare(right.name));
}

function syncAssetLocation(asset, locations) {
  const locationId = String(asset.locationId || "").trim();
  const locationName = String(asset.location || "").trim();
  const locationMatch =
    (locationId ? locations.find((location) => location.id === locationId) : null) ||
    locations.find((location) => normalizeText(location.name) === normalizeText(locationName));

  return {
    ...asset,
    locationId: locationMatch?.id || locationId,
    location: locationMatch?.name || locationName,
    locationDepartmentId: locationMatch?.departmentId || String(asset.locationDepartmentId || "").trim(),
    locationDepartment: locationMatch?.department || String(asset.locationDepartment || "").trim(),
  };
}

function resolveAssetType(type) {
  const normalized = normalizeText(type).trim();
  return assetTypeOptions.find((item) => normalizeText(item).trim() === normalized) || "Outros";
}

function sanitizeUserPayload(payload, departments = [], permissionCatalog = defaultPermissionCatalog, permissionProfiles = defaultPermissionProfiles) {
  const departmentMatch = findDepartmentMatch(departments, payload);
  const permissionProfile =
    getUserPermissionProfile(
      {
        permissionProfileId: payload.permissionProfileId,
        role: payload.role,
      },
      permissionProfiles,
    ) || permissionProfiles[permissionProfiles.length - 1];
  return {
    name: String(payload.name || "").trim(),
    email: String(payload.email || "").trim().toLowerCase(),
    password: String(payload.password || ""),
    passwordReveal: String(payload.passwordReveal || payload.password || ""),
    mustChangePassword: Boolean(payload.mustChangePassword),
    status: String(payload.status || "Ativo").trim() || "Ativo",
    role: permissionProfile?.name || normalizeRoleName(payload.role),
    permissionProfileId: String(permissionProfile?.id || payload.permissionProfileId || "").trim(),
    team: String(payload.team || "").trim(),
    departmentId: departmentMatch?.id || String(payload.departmentId || "").trim(),
    department: departmentMatch?.name || String(payload.department || "").trim(),
    avatar: String(payload.avatar || "").trim(),
    additionalPermissions: sanitizePermissionOverridePayload(payload.additionalPermissions, permissionCatalog),
    restrictedPermissions: sanitizePermissionOverridePayload(payload.restrictedPermissions, permissionCatalog),
    permissions: normalizeUserPermissions(
      payload.permissions || getRolePermissions(permissionProfile?.name || payload.role, permissionProfiles, permissionCatalog),
      {
        ...payload,
        role: permissionProfile?.name || payload.role,
        permissionProfileId: permissionProfile?.id || payload.permissionProfileId,
      },
      permissionCatalog,
      permissionProfiles,
    ),
  };
}

function sanitizePermissionOverridePayload(rawOverrides = {}, permissionCatalog = defaultPermissionCatalog) {
  const validKeys = new Set(listPermissionKeys(permissionCatalog));
  return Object.entries(rawOverrides || {}).reduce((accumulator, [key, value]) => {
    if (!validKeys.has(key) || value === undefined || value === false) return accumulator;
    return { ...accumulator, [key]: true };
  }, {});
}

function sanitizePermissionProfilePayload(payload, permissionCatalog = defaultPermissionCatalog, currentProfile = {}) {
  return {
    name: String(payload.name || currentProfile.name || "").trim(),
    description: String(payload.description || currentProfile.description || "").trim(),
    status: String(payload.status || currentProfile.status || "Ativo").trim() || "Ativo",
    permissions:
      payload.permissions === "ALL" || currentProfile.permissions === "ALL"
        ? "ALL"
        : Object.keys(sanitizePermissionOverridePayload(payload.permissions || currentProfile.permissions || {}, permissionCatalog)),
  };
}

function sanitizeAssetPayload(payload, locations = []) {
  const locationId = String(payload.locationId || "").trim();
  const locationName = String(payload.location || "").trim();
  const locationMatch =
    (locationId ? locations.find((location) => location.id === locationId) : null) ||
    locations.find((location) => normalizeText(location.name) === normalizeText(locationName));

  return {
    ...payload,
    locationId: locationMatch?.id || locationId,
    location: locationMatch?.name || locationName,
    locationDepartmentId: locationMatch?.departmentId || String(payload.locationDepartmentId || "").trim(),
    locationDepartment: locationMatch?.department || String(payload.locationDepartment || "").trim(),
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

function hydratePermissionCatalog(storedCatalog) {
  const catalog = Array.isArray(storedCatalog) && storedCatalog.length ? storedCatalog : defaultPermissionCatalog;
  const normalizedDefaults = defaultPermissionCatalog.map((module) => ({
    ...module,
    module: String(module.module || "").trim(),
  }));
  const normalizedStored = catalog
    .map((module) => ({
      ...module,
      module: String(module.module || "").trim(),
      label: String(module.label || "").trim(),
      description: String(module.description || "").trim(),
      order: Number(module.order) || 0,
      departmentScope: String(module.departmentScope || "").trim(),
      accessKeys: Array.isArray(module.accessKeys) ? module.accessKeys.filter(Boolean) : [],
      permissions: (Array.isArray(module.permissions) ? module.permissions : []).map((permission) => ({
        key: String(permission.key || "").trim(),
        label: String(permission.label || "").trim(),
        action: String(permission.action || "view").trim(),
      })),
    }))
    .filter((module) => module.module && module.permissions.length && module.module !== "system_logs");

  return normalizedDefaults
    .map((defaultModule) => {
      const storedModule = normalizedStored.find((module) => module.module === defaultModule.module);
      if (!storedModule) return defaultModule;
      const mergedPermissions = defaultModule.permissions.map((defaultPermission) => {
        const storedPermission = storedModule.permissions.find((permission) => permission.key === defaultPermission.key);
        return storedPermission ? { ...defaultPermission, ...storedPermission } : defaultPermission;
      });
      const extraPermissions = storedModule.permissions.filter(
        (permission) => !mergedPermissions.some((candidate) => candidate.key === permission.key),
      );
      return {
        ...defaultModule,
        ...storedModule,
        permissions: [...mergedPermissions, ...extraPermissions],
        accessKeys: Array.from(new Set([...(defaultModule.accessKeys || []), ...(storedModule.accessKeys || [])])),
      };
    })
    .concat(normalizedStored.filter((module) => !normalizedDefaults.some((candidate) => candidate.module === module.module)))
    .sort((left, right) => (left.order || 0) - (right.order || 0));
}

function hydrateNavigationSections(storedSections) {
  const legacySectionKeys = new Set(["technicians", "settings"]);
  const dedupeNavigationItems = (items = []) => {
    const seenRoutes = new Set();
    const seenModuleLabels = new Set();
    return items.filter((item) => {
      const routeKey = String(item.to || "").trim();
      const moduleLabelKey = `${String(item.module || "").trim()}::${normalizeText(item.label)}`;
      if ((routeKey && seenRoutes.has(routeKey)) || seenModuleLabels.has(moduleLabelKey)) return false;
      if (routeKey) seenRoutes.add(routeKey);
      seenModuleLabels.add(moduleLabelKey);
      return true;
    });
  };

  const sections = Array.isArray(storedSections) && storedSections.length ? storedSections : defaultNavigationSections;
  const normalizedDefaults = defaultNavigationSections.map((section) => ({
    ...section,
    key: String(section.key || "").trim(),
    title: String(section.title || "").trim(),
    collapsible: Boolean(section.collapsible),
    order: Number(section.order) || 0,
    items: (Array.isArray(section.items) ? section.items : []).map((item) => ({
      to: String(item.to || "").trim(),
      label: String(item.label || "").trim(),
      module: String(item.module || "").trim(),
      icon: String(item.icon || "dashboard").trim(),
    })),
  }));
  const normalizedStored = sections
    .map((section) => ({
      ...section,
      key: String(section.key || "").trim(),
      title: String(section.title || "").trim(),
      collapsible: Boolean(section.collapsible),
      order: Number(section.order) || 0,
      items: (Array.isArray(section.items) ? section.items : []).map((item) => ({
        to: String(item.to || "").trim(),
        label: String(item.label || "").trim(),
        module: String(item.module || "").trim(),
        icon: String(item.icon || "dashboard").trim(),
      })),
    }))
    .filter((section) => section.key && section.items.length && !legacySectionKeys.has(section.key));

  return normalizedDefaults
    .map((defaultSection) => {
      const storedSection = normalizedStored.find((section) => section.key === defaultSection.key);
      if (!storedSection) return defaultSection;
      const mergedItems = defaultSection.items.map((defaultItem) => {
        const storedItem = storedSection.items.find((item) => item.to === defaultItem.to || item.module === defaultItem.module);
        return storedItem ? { ...defaultItem, ...storedItem } : defaultItem;
      });
      const extraItems = storedSection.items.filter(
        (item) => !mergedItems.some((candidate) => candidate.to === item.to || candidate.module === item.module),
      );
      return {
        ...defaultSection,
        ...storedSection,
        items: dedupeNavigationItems(
          [...mergedItems, ...extraItems].filter((item) => item.to !== "/app/locations" && item.to !== "/app/system-logs" && item.module !== "system_logs"),
        ),
      };
    })
    .concat(normalizedStored.filter((section) => !normalizedDefaults.some((candidate) => candidate.key === section.key)))
    .map((section) => ({
      ...section,
      items: dedupeNavigationItems((section.items || []).filter((item) => item.to !== "/app/system-logs" && item.module !== "system_logs")),
    }))
    .filter((section) => section.key && section.items.length)
    .sort((left, right) => left.order - right.order);
}

function hydrateNotificationEvents(storedEvents) {
  const normalizedDefaults = defaultNotificationEvents.map((event) => ({
    key: String(event.key || "").trim(),
    label: String(event.label || "").trim(),
    description: String(event.description || "").trim(),
  }));
  const normalizedStored = (Array.isArray(storedEvents) ? storedEvents : [])
    .map((event) => ({
      key: String(event.key || "").trim(),
      label: String(event.label || "").trim(),
      description: String(event.description || "").trim(),
    }))
    .filter((event) => event.key);
  return normalizedDefaults
    .map((defaultEvent) => {
      const storedEvent = normalizedStored.find((event) => event.key === defaultEvent.key);
      return storedEvent ? { ...defaultEvent, ...storedEvent } : defaultEvent;
    })
    .concat(normalizedStored.filter((event) => !normalizedDefaults.some((candidate) => candidate.key === event.key)));
}

function hydrateEmailPlaceholders(storedPlaceholders) {
  const normalizedDefaults = defaultEmailPlaceholders.map((placeholder) => ({
    key: String(placeholder.key || "").trim(),
    label: String(placeholder.label || "").trim(),
  }));
  const normalizedStored = (Array.isArray(storedPlaceholders) ? storedPlaceholders : [])
    .map((placeholder) => ({
      key: String(placeholder.key || "").trim(),
      label: String(placeholder.label || "").trim(),
    }))
    .filter((placeholder) => placeholder.key);
  return normalizedDefaults
    .map((defaultPlaceholder) => {
      const storedPlaceholder = normalizedStored.find((placeholder) => placeholder.key === defaultPlaceholder.key);
      return storedPlaceholder ? { ...defaultPlaceholder, ...storedPlaceholder } : defaultPlaceholder;
    })
    .concat(normalizedStored.filter((placeholder) => !normalizedDefaults.some((candidate) => candidate.key === placeholder.key)));
}

function hydrateEmailLayouts(storedLayouts, notificationEvents) {
  const validEventKeys = new Set(notificationEvents.map((event) => event.key));
  return (Array.isArray(storedLayouts) ? storedLayouts : [])
    .map((layout) => ({
      id: String(layout.id || "").trim(),
      name: String(layout.name || "").trim(),
      eventKey: validEventKeys.has(layout.eventKey) ? layout.eventKey : "",
      subject: String(layout.subject || "").trim(),
      body: String(layout.body || "").trim(),
      status: String(layout.status || "Ativo").trim() || "Ativo",
      createdAt: String(layout.createdAt || ""),
      updatedAt: String(layout.updatedAt || ""),
    }))
    .filter((layout) => layout.id && layout.name);
}

function hydrateNotificationRules(storedRules, notificationEvents) {
  const validEventKeys = new Set(notificationEvents.map((event) => event.key));
  return (Array.isArray(storedRules) ? storedRules : [])
    .map((rule) => ({
      id: String(rule.id || "").trim(),
      eventKey: validEventKeys.has(rule.eventKey) ? rule.eventKey : "",
      active: rule.active !== false,
      recipientUserIds: Array.isArray(rule.recipientUserIds) ? rule.recipientUserIds.filter(Boolean) : [],
      externalEmails: Array.isArray(rule.externalEmails)
        ? rule.externalEmails.filter(Boolean)
        : String(rule.externalEmails || "")
            .split(/[,\n;]/)
            .map((item) => item.trim())
            .filter(Boolean),
      layoutId: String(rule.layoutId || "").trim(),
      createdAt: String(rule.createdAt || ""),
      updatedAt: String(rule.updatedAt || ""),
    }))
    .filter((rule) => rule.id && rule.eventKey);
}

function hydrateNotificationLogs(storedLogs) {
  return (Array.isArray(storedLogs) ? storedLogs : [])
    .map((log) => ({
      id: String(log.id || "").trim(),
      eventKey: String(log.eventKey || "").trim(),
      ticketId: String(log.ticketId || "").trim(),
      recipients: Array.isArray(log.recipients) ? log.recipients.filter(Boolean) : [],
      status: String(log.status || "").trim(),
      error: String(log.error || "").trim(),
      dedupeKey: String(log.dedupeKey || "").trim(),
      sentAt: String(log.sentAt || "").trim(),
      subject: String(log.subject || "").trim(),
    }))
    .filter((log) => log.id);
}

function hydrateSmtpSettings(storedSettings) {
  return {
    ...defaultSmtpSettings,
    ...(storedSettings && typeof storedSettings === "object" ? storedSettings : {}),
    hasPassword: Boolean(storedSettings?.hasPassword),
    password: "",
  };
}

function hydrateEmailServiceSettings(storedSettings) {
  return {
    ...defaultEmailServiceSettings,
    ...(storedSettings && typeof storedSettings === "object" ? storedSettings : {}),
    hasApiKey: Boolean(storedSettings?.hasApiKey),
    apiKey: "",
    deliveryMode: "smtp",
  };
}

function getServiceCenterDepartmentConfig(serviceCenter = defaultServiceCenterSettings, departmentId = "") {
  const normalizedDepartmentId = String(departmentId || "").trim();
  if (!normalizedDepartmentId) return sanitizeServiceCenterDepartmentConfig({}, {});
  return sanitizeServiceCenterDepartmentConfig(serviceCenter?.departments?.[normalizedDepartmentId] || {}, serviceCenter?.departments?.[normalizedDepartmentId] || {});
}

function getLinkedServiceDepartmentIds(user, departments = [], serviceCenter = defaultServiceCenterSettings) {
  if (!user?.id) return [];
  return departments
    .filter((department) => {
      const config = getServiceCenterDepartmentConfig(serviceCenter, department.id);
      return config.active && config.responsibleUserIds.includes(user.id);
    })
    .map((department) => department.id);
}

function getScopedServiceDepartmentIds(user, departments = [], serviceCenter = defaultServiceCenterSettings) {
  if (!user || !serviceCenter?.enabled) return [];
  const scopedDepartmentIds = new Set(getLinkedServiceDepartmentIds(user, departments, serviceCenter));
  const userDepartmentId = String(user.departmentId || "").trim();

  if (userDepartmentId) {
    const department = departments.find((candidate) => candidate.id === userDepartmentId);
    if (department && normalizeText(department.status) === "ativo") {
      const config = getServiceCenterDepartmentConfig(serviceCenter, userDepartmentId);
      if (config.active) scopedDepartmentIds.add(userDepartmentId);
    }
  }

  return Array.from(scopedDepartmentIds);
}

function canViewAllTicketsForContext(user, departments = [], serviceCenter = defaultServiceCenterSettings) {
  if (!user) return false;
  if (!serviceCenter?.enabled) return canViewAllTickets(user);
  return hasAnyPermission(user, ["tickets_admin", "service_center_view_all_tickets"]);
}

function canViewDepartmentTicketsForContext(user, departments = [], serviceCenter = defaultServiceCenterSettings) {
  if (!user || !serviceCenter?.enabled) return false;
  if (!hasAnyPermission(user, ["service_center_view_department_tickets", "service_center_attend_linked_departments", "tickets_admin"])) {
    return false;
  }
  return getScopedServiceDepartmentIds(user, departments, serviceCenter).length > 0;
}

function filterTicketsForUser(tickets, user, departments = [], serviceCenter = defaultServiceCenterSettings) {
  if (!user) return [];
  if (canViewAllTicketsForContext(user, departments, serviceCenter)) return tickets;
  const scopedDepartmentIds = new Set(getScopedServiceDepartmentIds(user, departments, serviceCenter));
  const canViewDepartmentTickets = canViewDepartmentTicketsForContext(user, departments, serviceCenter);
  if (!canViewOwnTickets(user) && !canViewDepartmentTickets) return [];
  return tickets.filter((ticket) => {
    if (canViewOwnTickets(user) && ticket.requesterId === user.id) return true;
    if (!canViewDepartmentTickets) return false;
    return scopedDepartmentIds.has(String(ticket.departmentId || "").trim());
  });
}

function canAccessTicket(ticket, user, departments = [], serviceCenter = defaultServiceCenterSettings) {
  if (!ticket || !user) return false;
  if (canViewAllTicketsForContext(user, departments, serviceCenter)) return true;
  if (ticket.requesterId === user.id) return true;
  if (!canViewDepartmentTicketsForContext(user, departments, serviceCenter)) return false;
  return getScopedServiceDepartmentIds(user, departments, serviceCenter).includes(String(ticket.departmentId || "").trim());
}

function mergeCollections(stored) {
  const permissionCatalog = hydratePermissionCatalog(stored?.permissionCatalog);
  const permissionProfiles = hydratePermissionProfiles(stored?.permissionProfiles);
  const navigationSections = hydrateNavigationSections(stored?.navigationSections);
  const notificationEvents = hydrateNotificationEvents(stored?.notificationEvents);
  const emailPlaceholders = hydrateEmailPlaceholders(stored?.emailPlaceholders);
  const rawUsers = hydrateUsers(stored?.users, permissionCatalog, permissionProfiles);
  const baseCurrentUser = stored?.currentUser && typeof stored.currentUser === "object" ? stored.currentUser : null;
  const departments = hydrateDepartments(stored?.departments);
  const teams = hydrateTeams(stored?.teams, rawUsers);
  const users = rawUsers.map((candidate) => syncUserDepartment(candidate, departments));
  const currentUserFromUsers = baseCurrentUser?.id ? users.find((candidate) => candidate.id === baseCurrentUser.id) || null : null;
  const currentUser = currentUserFromUsers
    ? currentUserFromUsers
    : baseCurrentUser
      ? syncUserDepartment(
          {
            ...baseCurrentUser,
            permissions: normalizeUserPermissions(
              baseCurrentUser.permissions || {},
              baseCurrentUser,
              permissionCatalog,
              permissionProfiles,
            ),
          },
          departments,
        )
      : null;
  const locations = hydrateLocations(stored?.locations, departments);
  const assets = (Array.isArray(stored?.assets) ? stored.assets : []).map((asset) => syncAssetLocation(asset, locations));
  const emailLayouts = hydrateEmailLayouts(stored?.emailLayouts, notificationEvents);
  const notificationRules = hydrateNotificationRules(stored?.notificationRules, notificationEvents);
  const notificationLogs = hydrateNotificationLogs(stored?.notificationLogs);
  const smtpSettings = hydrateSmtpSettings(stored?.smtpSettings);
  const emailServiceSettings = hydrateEmailServiceSettings(stored?.emailServiceSettings);
  const serviceCenter = hydrateServiceCenter(stored?.serviceCenter, departments);

  const baseState = {
    ...stored,
    currentUser,
    permissionCatalog,
    permissionProfiles,
    navigationSections,
    notificationEvents,
    emailPlaceholders,
    emailLayouts,
    notificationRules,
    notificationLogs,
    smtpSettings,
    emailServiceSettings,
    serviceCenter,
    users,
    departments,
    teams,
    locations,
    queues: Array.isArray(stored?.queues) ? stored.queues : [],
    tickets: Array.isArray(stored?.tickets) ? stored.tickets : [],
    assets,
    brands: Array.isArray(stored?.brands) ? stored.brands : [],
    models: Array.isArray(stored?.models) ? stored.models : [],
    projects: (Array.isArray(stored?.projects) ? stored.projects : []).map(sanitizeProjectPayload),
    knowledgeArticles: (Array.isArray(stored?.knowledgeArticles) ? stored.knowledgeArticles : []).map(normalizeKnowledgeArticle),
    apiConfigs: Array.isArray(stored?.apiConfigs) ? stored.apiConfigs : [],
    reports: Array.isArray(stored?.reports) ? stored.reports : [],
  };

  return syncHelpdeskState(baseState, users);
}

const EMPTY_DATA = mergeCollections({});

function summarizeTicketsByQueue(queues, tickets) {
  const queueRegistry = new Map(
    (Array.isArray(queues) ? queues : []).map((queue) => [queue.name, queue]),
  );

  tickets.forEach((ticket) => {
    const queueName = String(ticket.queue || "").trim();
    if (!queueName || queueRegistry.has(queueName)) return;
    queueRegistry.set(queueName, {
      id: `queue-${normalizeCode(queueName, "QUEUE").toLowerCase()}`,
      name: queueName,
      assigned: 0,
    });
  });

  return Array.from(queueRegistry.values()).map((queue) => {
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

function buildTechnicianMetrics(tickets, users, departments = [], serviceCenter = defaultServiceCenterSettings, currentUser = null) {
  const canViewGlobalMetrics = canViewAllTicketsForContext(currentUser, departments, serviceCenter);
  const scopedDepartmentIds = new Set(
    canViewGlobalMetrics ? [] : getScopedServiceDepartmentIds(currentUser, departments, serviceCenter),
  );
  const visibleAssignedNames = new Set(
    (Array.isArray(tickets) ? tickets : [])
      .map((ticket) => normalizeText(ticket.assignee))
      .filter(Boolean),
  );
  const serviceCenterResponsibleIds = new Set(
    (departments || []).flatMap((department) => {
      const config = getServiceCenterDepartmentConfig(serviceCenter, department.id);
      if (!config.active) return [];
      if (scopedDepartmentIds.size && !scopedDepartmentIds.has(department.id)) return [];
      return config.responsibleUserIds || [];
    }),
  );
  const technicians = users.filter((candidate) => {
    const candidateName = normalizeText(candidate.name);
    const isTiTechnician = normalizeText(candidate.department) === "ti";
    if (normalizeText(candidate.status || "Ativo") === "inativo") return false;
    if (visibleAssignedNames.has(candidateName) || serviceCenterResponsibleIds.has(candidate.id)) return true;
    if (!serviceCenter?.enabled) return isTiTechnician;
    return canViewGlobalMetrics && isTiTechnician;
  });
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
  }).sort((left, right) => left.name.localeCompare(right.name));
}

function computeAverageResponseMinutes(tickets = []) {
  const withResponse = tickets.filter((ticket) => ticket.firstResponseAt && ticket.openedAt);
  if (!withResponse.length) return 0;
  const total = withResponse.reduce((sum, ticket) => {
    const opened = new Date(ticket.openedAt).getTime();
    const responded = new Date(ticket.firstResponseAt).getTime();
    if (!Number.isFinite(opened) || !Number.isFinite(responded) || responded < opened) return sum;
    return sum + Math.round((responded - opened) / 60000);
  }, 0);
  return Math.round(total / Math.max(withResponse.length, 1));
}

function computeAverageResolutionMinutes(tickets = []) {
  const resolved = tickets.filter((ticket) => Number.isFinite(Number(ticket.resolutionMinutes)));
  if (!resolved.length) return 0;
  const total = resolved.reduce((sum, ticket) => sum + (Number(ticket.resolutionMinutes) || 0), 0);
  return Math.round(total / Math.max(resolved.length, 1));
}

function buildOperationalReportRows(tickets = [], field, fallbackLabel) {
  const groups = tickets.reduce((accumulator, ticket) => {
    const label = String(ticket?.[field] || fallbackLabel).trim() || fallbackLabel;
    if (!accumulator[label]) {
      accumulator[label] = {
        label,
        total: 0,
        open: 0,
        resolved: 0,
        overdue: 0,
        critical: 0,
      };
    }
    accumulator[label].total += 1;
    if (isOpenTicketStatus(ticket.status)) accumulator[label].open += 1;
    if (normalizeText(ticket.status) === "resolvido") accumulator[label].resolved += 1;
    if (ticket.isOverdue || ticket.slaBreachedAt) accumulator[label].overdue += 1;
    if (normalizeText(ticket.priority) === "critica") accumulator[label].critical += 1;
    return accumulator;
  }, {});

  return Object.values(groups).sort((left, right) => right.total - left.total);
}

function buildApprovalReport(tickets = []) {
  const approvalTickets = tickets.filter((ticket) => ticket.approval?.required);
  return {
    summary: {
      pending: approvalTickets.filter((ticket) => normalizeText(ticket.approval?.status) === "pending").length,
      approved: approvalTickets.filter((ticket) => normalizeText(ticket.approval?.status) === "approved").length,
      rejected: approvalTickets.filter((ticket) => normalizeText(ticket.approval?.status) === "rejected").length,
    },
    rows: approvalTickets
      .map((ticket) => ({
        id: ticket.id,
        title: ticket.title,
        requester: ticket.requester,
        approver: ticket.approval?.currentApproverName || ticket.approval?.decidedByName || ticket.approval?.approverName || "Nao definido",
        status: ticket.approval?.status || "not_required",
        decisionReason: ticket.approval?.decisionReason || "",
        dueAt: ticket.approval?.dueAt || "",
        dueLabel: ticket.approval?.dueAt ? formatTimestampLabel(ticket.approval.dueAt) : "-",
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
}

function buildRecurrenceReport(tickets = []) {
  const recurrentTickets = tickets.filter((ticket) => (ticket.history || []).filter((entry) => normalizeText(entry.type) === "reopened").length > 0);
  const byField = (field, fallbackLabel, valueSelector = null) =>
    Object.values(
      recurrentTickets.reduce((accumulator, ticket) => {
        const baseValue = typeof valueSelector === "function" ? valueSelector(ticket) : ticket?.[field];
        const label = String(baseValue || fallbackLabel).trim() || fallbackLabel;
        const reopenCount = (ticket.history || []).filter((entry) => normalizeText(entry.type) === "reopened").length;
        if (!accumulator[label]) {
          accumulator[label] = { label, tickets: 0, recurrences: 0 };
        }
        accumulator[label].tickets += 1;
        accumulator[label].recurrences += reopenCount;
        return accumulator;
      }, {}),
    ).sort((left, right) => right.recurrences - left.recurrences);

  return {
    byRequester: byField("requester", "Sem solicitante"),
    byAsset: byField("assetName", "Sem ativo", (ticket) => ticket.assetName || ticket.assetId || ""),
    byCategory: byField("category", "Sem categoria"),
  };
}

function buildBacklogBySla(tickets = []) {
  const openTickets = tickets.filter((ticket) => isOpenTicketStatus(ticket.status));
  return [
    { label: "Critico sem tecnico", value: openTickets.filter((ticket) => ticket.criticalWaitingTechnician).length },
    { label: "Vencido", value: openTickets.filter((ticket) => ticket.isOverdue).length },
    { label: "Vence em 1h", value: openTickets.filter((ticket) => ticket.dueSoon).length },
    { label: "Sem responsavel", value: openTickets.filter((ticket) => ticket.unassigned).length },
    { label: "Aguardando aprovacao", value: openTickets.filter((ticket) => ticket.approvalPending).length },
    { label: "Dentro do prazo", value: openTickets.filter((ticket) => !ticket.isOverdue && !ticket.dueSoon).length },
  ];
}

function buildExecutiveAgenda({ tickets = [], projects = [] }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const criticalTickets = tickets
    .filter((ticket) => isOpenTicketStatus(ticket.status) && normalizeText(ticket.priority) === "critica")
    .slice(0, 6);
  const pendingApprovals = tickets
    .filter((ticket) => normalizeText(ticket.approval?.status) === "pending")
    .slice(0, 6);
  const pendingActions = tickets
    .filter((ticket) => isOpenTicketStatus(ticket.status) && (ticket.unassigned || ticket.isOverdue || ticket.dueSoon))
    .slice(0, 6);
  const projectAgenda = projects
    .filter((project) => normalizeText(project.status) !== "concluido" && project.dueDate)
    .map((project) => {
      const dueDate = new Date(`${project.dueDate}T00:00:00`);
      const diffDays = Math.round((dueDate.getTime() - today.getTime()) / 86400000);
      return {
        ...project,
        deadlineDays: diffDays,
      };
    })
    .filter((project) => project.deadlineDays <= 15)
    .sort((left, right) => left.deadlineDays - right.deadlineDays)
    .slice(0, 6);

  return {
    criticalTickets,
    pendingApprovals,
    pendingActions,
    projectAgenda,
  };
}

const TICKET_STATUS_TRANSITIONS = {
  Aberto: ["Em andamento", "Em espera", "Pausado", "Aguardando usuario", "Aguardando aprovacao", "Resolvido"],
  "Em andamento": ["Em espera", "Pausado", "Aguardando usuario", "Resolvido", "Reaberto"],
  "Em espera": ["Em andamento", "Pausado", "Aguardando usuario", "Resolvido", "Reaberto"],
  Pausado: ["Em andamento", "Em espera", "Aguardando usuario", "Resolvido", "Reaberto"],
  "Aguardando usuario": ["Em andamento", "Em espera", "Resolvido", "Reaberto"],
  "Aguardando aprovacao": ["Aberto", "Em andamento", "Em espera", "Aguardando usuario", "Resolvido"],
  Resolvido: ["Reaberto"],
  Reaberto: ["Em andamento", "Em espera", "Pausado", "Aguardando usuario", "Resolvido"],
};

function getAllowedTicketStatusesForTicket(ticket, serviceCenter = defaultServiceCenterSettings) {
  const statusOptions = getTicketStatusOptionsForType(ticket?.type || "Incidente", serviceCenter);
  const currentStatus = normalizeTicketStatus(ticket?.status || "Aberto", statusOptions);
  const configuredStatuses = statusOptions.length ? statusOptions : [currentStatus, ...(TICKET_STATUS_TRANSITIONS[currentStatus] || [])];
  return [currentStatus, ...configuredStatuses].filter(
    (status, index, list) => list.findIndex((candidate) => normalizeText(candidate) === normalizeText(status)) === index,
  );
}

function isStatusTransitionAllowed(currentStatus, nextStatus, ticket = {}, serviceCenter = defaultServiceCenterSettings) {
  if (normalizeText(currentStatus) === normalizeText(nextStatus)) return true;
  return getAllowedTicketStatusesForTicket({ ...ticket, status: currentStatus }, serviceCenter).some((status) => normalizeText(status) === normalizeText(nextStatus));
}

function resolveApprovalState(type, approval = null, action = "") {
  const approvalRequired = normalizeText(type) === "requisicao";
  const baseApproval = approval && typeof approval === "object" ? approval : {};
  if (!approvalRequired) {
    return {
      ...baseApproval,
      required: false,
      status: "not_required",
      approverId: String(baseApproval.approverId || "").trim(),
      approverName: String(baseApproval.approverName || "").trim(),
      history: Array.isArray(baseApproval.history) ? baseApproval.history : [],
    };
  }
  const currentStatus = String(baseApproval.status || "draft").trim() || "draft";
  const nextStatus = action === "approve" ? "approved" : action === "reject" ? "rejected" : action === "request" ? "pending" : currentStatus;
  return {
    ...baseApproval,
    required: true,
    status: nextStatus,
    approverId: String(baseApproval.approverId || "").trim(),
    approverName: String(baseApproval.approverName || "").trim(),
    history: Array.isArray(baseApproval.history) ? baseApproval.history : [],
  };
}

function applyRoutingRules(ticketLike = {}, serviceCenter = defaultServiceCenterSettings, users = []) {
  return applyAdvancedRoutingRules(ticketLike, serviceCenter?.routingRules || [], users, { hidden: serviceCenter?.triagePanelVisible === false });
}

export function AppDataProvider({ children }) {
  const { setSessionUser, user } = useAuth();
  const [data, setData] = useState(EMPTY_DATA);
  const [notifications, setNotifications] = useState([]);
  const [serverReady, setServerReady] = useState(false);
  const skipNextPersistenceRef = useRef(true);

  const applyState = (updater) => {
    setData((current) => {
      const candidate = typeof updater === "function" ? updater(current) : updater;
      return mergeCollections(candidate);
    });
  };

  const persistStateImmediately = async (nextState) => {
    const persistedState = await persistAppState(nextState);
    skipNextPersistenceRef.current = true;
    setData(mergeCollections(persistedState));
    return persistedState;
  };

  useEffect(() => {
    if (!user?.id) {
      setData(EMPTY_DATA);
      setServerReady(false);
      skipNextPersistenceRef.current = true;
      return undefined;
    }

    let cancelled = false;

    async function loadData() {
      try {
        const serverData = await loadAppState();
        if (cancelled) return;
        skipNextPersistenceRef.current = true;
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
  }, [user?.id]);

  useEffect(() => {
    if (!serverReady || !user?.id) return undefined;
    if (skipNextPersistenceRef.current) {
      skipNextPersistenceRef.current = false;
      return undefined;
    }

    let active = true;
    const timeoutId = window.setTimeout(async () => {
      try {
        await persistAppState(data);
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
  const visibleTickets = useMemo(
    () => filterTicketsForUser(allTickets, user, data.departments || [], data.serviceCenter || defaultServiceCenterSettings),
    [allTickets, data.departments, data.serviceCenter, user],
  );
  const operationalTickets = visibleTickets;
  const linkedServiceDepartmentIds = useMemo(
    () => getLinkedServiceDepartmentIds(user, data.departments || [], data.serviceCenter || defaultServiceCenterSettings),
    [data.departments, data.serviceCenter, user],
  );
  const canViewDepartmentTickets = useMemo(
    () => canViewDepartmentTicketsForContext(user, data.departments || [], data.serviceCenter || defaultServiceCenterSettings),
    [data.departments, data.serviceCenter, user],
  );
  const canViewGlobalTickets = useMemo(
    () => canViewAllTicketsForContext(user, data.departments || [], data.serviceCenter || defaultServiceCenterSettings),
    [data.departments, data.serviceCenter, user],
  );
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
    const firstResponseMinutes = computeAverageResponseMinutes(visibleTickets);
    const averageResolutionMinutes = computeAverageResolutionMinutes(visibleTickets);

    return {
      openTickets,
      criticalOpen,
      waitingApproval,
      solved,
      activeAssets,
      activeProjects,
      activeApis,
      firstResponseMinutes,
      averageResolutionMinutes,
      csat: 4.7,
      slaCompliance,
      backlogTrend: openTickets > 12 ? -8 : -3,
    };
  }, [data, visibleTickets]);

  const queueStats = useMemo(() => summarizeTicketsByQueue(data.queues, operationalTickets), [data.queues, operationalTickets]);
  const statusBuckets = useMemo(() => buildStatusBuckets(operationalTickets), [operationalTickets]);
  const priorityBuckets = useMemo(() => buildPriorityBuckets(operationalTickets), [operationalTickets]);
  const dailyOpenings = useMemo(() => buildDailyOpenings(operationalTickets, 5), [operationalTickets]);
  const technicianMetrics = useMemo(
    () => buildTechnicianMetrics(visibleTickets, data.users || [], data.departments || [], data.serviceCenter || defaultServiceCenterSettings, user),
    [data.departments, data.serviceCenter, data.users, user, visibleTickets],
  );
  const operationalReports = useMemo(
    () => ({
      byTechnician: buildOperationalReportRows(visibleTickets, "assignee", "Sem responsavel"),
      byDepartment: buildOperationalReportRows(visibleTickets, "department", "Sem departamento"),
      byCategory: buildOperationalReportRows(visibleTickets, "category", "Sem categoria"),
      byPriority: buildOperationalReportRows(visibleTickets, "priority", "Sem prioridade"),
      bySource: buildOperationalReportRows(visibleTickets, "source", "Sem origem"),
      productivity: {
        averageFirstResponseMinutes: computeAverageResponseMinutes(visibleTickets),
        averageResolutionMinutes: computeAverageResolutionMinutes(visibleTickets),
        technicians: technicianMetrics,
      },
      approvals: buildApprovalReport(visibleTickets),
      recurrence: buildRecurrenceReport(visibleTickets),
      backlogBySla: buildBacklogBySla(visibleTickets),
      executiveAgenda: buildExecutiveAgenda({ tickets: visibleTickets, projects: data.projects || [] }),
    }),
    [data.projects, technicianMetrics, visibleTickets],
  );

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

  const createTicket = async (payload) => {
    if (!hasAnyPermission(user, ["tickets_create", "tickets_admin"])) return null;
    let createdTicket = null;
    const current = data;
    const typeCodeMap = { incidente: "INC", requisicao: "REQ", problema: "PRB" };
    const nextNumber = (current.tickets.length + 2049).toString().padStart(4, "0");
    const nowIso = new Date().toISOString();
    const openedAt = nowIso;
    const priority = normalizePriorityLabel(payload.priority || computePriorityFromMatrix(payload.urgency, payload.impact));
    const serviceCenterEnabled = Boolean(current.serviceCenter?.enabled);
    const targetDepartment =
      serviceCenterEnabled
        ? (current.departments || []).find((department) => department.id === payload.departmentId) || null
        : null;
    const targetDepartmentConfig = targetDepartment
      ? getServiceCenterDepartmentConfig(current.serviceCenter, targetDepartment.id)
      : null;
    const requesterId = canViewGlobalTickets ? payload.requesterId || "" : user?.id || "";
    const requesterEmail = canViewGlobalTickets
      ? String(payload.requesterEmail || "").trim().toLowerCase()
      : String(user?.email || "").trim().toLowerCase();
    const requester = canViewGlobalTickets ? payload.requester : user?.name || payload.requester;

    if (
      serviceCenterEnabled &&
      (!targetDepartment ||
        normalizeText(targetDepartment.status) !== "ativo" ||
        !targetDepartmentConfig?.active ||
        !targetDepartmentConfig?.acceptsTickets ||
        !targetDepartmentConfig?.showInRequestPortal)
    ) {
      return null;
    }

    const watcherDetails = normalizeWatcherDetails(payload.watcherDetails || payload.watchers, current.users || [], payload.watchers || "");
    const routedPayload = applyRoutingRules({
      ...payload,
      type: payload.type,
      priority,
      category: String(payload.category || "Geral").trim(),
      location: String(payload.location || "").trim(),
      title: String(payload.title || "").trim(),
      description: String(payload.description || "").trim(),
      source: String(payload.source || "Portal").trim(),
      departmentId: String(targetDepartment?.id || payload.departmentId || "").trim(),
      department: String(targetDepartment?.name || payload.department || "").trim(),
      queue: String(payload.queue || targetDepartment?.name || "Service Desk").trim(),
    }, current.serviceCenter || defaultServiceCenterSettings, current.users || []);
    const approvalBase = resolveApprovalWorkflow(
      {
        ...routedPayload,
        approvalAmount: Number(payload.approvalAmount) || 0,
      },
      current.serviceCenter?.approvalRules || [],
      current.serviceCenter?.approverDelegations || [],
      current.users || [],
      String(payload.approval?.approverId || payload.approvalApproverId || "").trim(),
    );
    const approval = approvalBase.required
      ? {
          ...approvalBase,
          requestedAt: nowIso,
          requestedById: user?.id || "",
          requestedByName: user?.name || "Sistema",
          history: [
            createApprovalHistoryEntry({
              action: "requested",
              actorId: user?.id || "",
              actorName: user?.name || "Sistema",
              reason: String(payload.approval?.decisionReason || "").trim(),
              stepName: approvalBase.steps?.[0]?.name || "Etapa 1",
              approverName: approvalBase.currentApproverName || payload.approvalApproverName || "",
              createdAt: nowIso,
            }),
          ],
        }
      : resolveApprovalState(routedPayload.type, payload.approval);
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
    const history = [
      createHistoryEntry({
        type: "created",
        actorId: user?.id,
        actorName: user?.name || "Sistema",
        message: "Chamado aberto",
        metadata: {
          status: initialStatus,
          departmentId: targetDepartment?.id || "",
          department: targetDepartment?.name || "",
          queue: routedPayload.queue || "Service Desk",
          approvalAmount: Number(payload.approvalAmount) || 0,
          slaOrigin: "manual",
        },
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
        status: initialStatus,
        requester,
        requesterId,
        requesterEmail,
        assignee: String(payload.assignee || "").trim(),
        queue: routedPayload.queue,
        departmentId: String(targetDepartment?.id || payload.departmentId || "").trim(),
        department: routedPayload.department,
        category: routedPayload.category,
        source: String(payload.source || "Portal").trim(),
        location: String(payload.location || "").trim(),
        sla: `${computeSlaFromMinutes(slaTargetMinutes)}`,
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
        attachments: payload.attachments || [],
        followUps: normalizeFollowUps(payload.followUps),
        subtasks: normalizeTicketSubtasks(payload.subtasks),
        checklistItems: normalizeTicketChecklist(payload.checklistItems),
        approvalAmount: Number(payload.approvalAmount) || 0,
        approval,
        triage: routedPayload.triage || {},
        history,
        knowledgeArticleIds: Array.isArray(payload.knowledgeArticleIds) ? payload.knowledgeArticleIds : [],
        projectId: String(payload.projectId || "").trim(),
        projectName: String(payload.projectName || "").trim(),
        assetId: String(payload.assetId || "").trim(),
        assetName: String(payload.assetName || "").trim(),
        reopenCategory: String(payload.reopenCategory || "").trim(),
        pauseReason: String(payload.pauseReason || "").trim(),
        waitingReason: String(payload.waitingReason || "").trim(),
        parentTicketId: String(payload.parentTicketId || "").trim(),
        childTicketIds: [],
        parentTicketTitle: "",
        slaRuleScope: {
          source: "manual",
          technicianId: String(user?.id || "").trim(),
          technicianName: String(user?.name || "Sistema").trim(),
        },
    };

    try {
      const persistedTicket = await createTicketRequest(createdTicket);
      skipNextPersistenceRef.current = true;
      setData((latest) =>
        mergeCollections({
          ...latest,
          tickets: [persistedTicket || createdTicket, ...(latest.tickets || []).filter((ticket) => ticket.id !== createdTicket.id)],
        }),
      );
      return persistedTicket || createdTicket;
    } catch (error) {
      console.error(error);
      pushToast("Falha ao salvar chamado", error?.message || "O chamado foi exibido localmente, mas nao conseguiu ser persistido no servidor.", "warning");
      return null;
    }
  };

  const updateTicket = (ticketId, updates) => {
    if (!hasAnyPermission(user, ["tickets_edit", "tickets_admin"])) return;
    applyState((current) => ({
      ...current,
      tickets: current.tickets.map((ticket) => {
        if (ticket.id !== ticketId) return ticket;
        if (!canAccessTicket(ticket, user, current.departments || [], current.serviceCenter || defaultServiceCenterSettings)) return ticket;

        const assigneeChanged = updates.assignee !== undefined && String(updates.assignee || "").trim() !== String(ticket.assignee || "").trim();
        const requestedPriority =
          updates.priority !== undefined
            ? normalizePriorityLabel(updates.priority)
            : normalizePriorityLabel(computePriorityFromMatrix(updates.urgency ?? ticket.urgency, updates.impact ?? ticket.impact));
        const priorityChanged = normalizeText(requestedPriority) !== normalizeText(ticket.priority);
        const nextAssignee = String((updates.assignee ?? ticket.assignee) || "").trim();
        const approvalAction = normalizeText(updates.approvalAction);
        const isApprovalWorkflowAction = ["request", "approve", "reject"].includes(approvalAction);
        const requestedStatus = normalizeTicketStatus(
          updates.status ??
            (approvalAction === "approve"
              ? normalizeText(ticket.approval?.status) === "pending" && Array.isArray(ticket.approval?.steps) && ticket.approval.steps.length > 1
                ? "Aguardando aprovacao"
                : nextAssignee
                  ? "Em andamento"
                  : "Aberto"
              : approvalAction === "reject"
                ? "Aguardando usuario"
                : assigneeChanged && nextAssignee && ["aberto", "reaberto"].includes(normalizeText(ticket.status))
                  ? "Em andamento"
                  : ticket.status),
        );
        const statusChanged = normalizeTicketStatus(requestedStatus) !== normalizeTicketStatus(ticket.status);

        if (assigneeChanged && !hasAnyPermission(user, ["tickets_assign", "tickets_admin"])) {
          return ticket;
        }
        if (priorityChanged && !hasAnyPermission(user, ["tickets_change_priority", "tickets_admin"])) {
          return ticket;
        }
        const autoProgressFromAssignment =
          updates.status === undefined &&
          assigneeChanged &&
          nextAssignee &&
          normalizeText(requestedStatus) === "em andamento" &&
          ["aberto", "reaberto"].includes(normalizeText(ticket.status));

        if (statusChanged) {
          const canExecuteApprovalAction =
            approvalAction === "request"
              ? hasAnyPermission(user, ["tickets_edit", "tickets_admin"])
              : approvalAction === "approve" || approvalAction === "reject"
                ? hasAnyPermission(user, ["tickets_close", "tickets_admin"])
                : false;

          if (!autoProgressFromAssignment && !isApprovalWorkflowAction && !hasAnyPermission(user, ["tickets_change_status", "tickets_admin"])) {
            return ticket;
          }
          if (isApprovalWorkflowAction && !canExecuteApprovalAction) return ticket;
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
        const nextStatus = requestedStatus;
        const nextPriority = requestedPriority;
        const nextUrgency = updates.urgency ?? ticket.urgency;
        const nextImpact = updates.impact ?? ticket.impact;
        const nextDueDate = updates.dueDate ?? ticket.dueDate;
        const nextResolutionNotes = String((updates.resolutionNotes ?? ticket.resolutionNotes) || "").trim();
        const nextFollowUps = updates.followUps !== undefined ? normalizeFollowUps(updates.followUps) : normalizeFollowUps(ticket.followUps);
        const followUpsChanged = JSON.stringify(nextFollowUps) !== JSON.stringify(normalizeFollowUps(ticket.followUps));
        const nextSubtasks = updates.subtasks !== undefined ? normalizeTicketSubtasks(updates.subtasks) : normalizeTicketSubtasks(ticket.subtasks);
        const subtasksChanged = JSON.stringify(nextSubtasks) !== JSON.stringify(normalizeTicketSubtasks(ticket.subtasks));
        const nextChecklistItems = updates.checklistItems !== undefined ? normalizeTicketChecklist(updates.checklistItems) : normalizeTicketChecklist(ticket.checklistItems);
        const checklistChanged = JSON.stringify(nextChecklistItems) !== JSON.stringify(normalizeTicketChecklist(ticket.checklistItems));
        const nextDepartmentId = String(updates.departmentId ?? ticket.departmentId ?? "").trim();
        const nextDepartment =
          (current.departments || []).find((department) => department.id === nextDepartmentId)?.name ||
          String((updates.department ?? ticket.department) || "").trim();
        const nextKnowledgeArticleIds = Array.isArray(updates.knowledgeArticleIds)
          ? [...new Set(updates.knowledgeArticleIds.filter(Boolean))]
          : ticket.knowledgeArticleIds || [];
        const nextReopenReason = String((updates.reopenReason ?? ticket.reopenReason) || "").trim();
        const nextReopenCategory = String((updates.reopenCategory ?? ticket.reopenCategory) || "").trim();
        const nextPauseReason = String((updates.pauseReason ?? ticket.pauseReason) || "").trim();
        const nextWaitingReason = String((updates.waitingReason ?? ticket.waitingReason) || "").trim();
        const nextCategory = String((updates.category ?? ticket.category) || "").trim();
        const nextProjectId = String(updates.projectId ?? ticket.projectId ?? "").trim();
        const nextProjectName =
          (current.projects || []).find((project) => project.id === nextProjectId)?.name ||
          String((updates.projectName ?? ticket.projectName) || "").trim();
        const nextAssetId = String(updates.assetId ?? ticket.assetId ?? "").trim();
        const nextAssetName =
          (current.assets || []).find((asset) => asset.id === nextAssetId)?.tag ||
          (current.assets || []).find((asset) => asset.id === nextAssetId)?.name ||
          String((updates.assetName ?? ticket.assetName) || "").trim();
        const nextWatcherDetails = updates.watcherDetails !== undefined
          ? normalizeWatcherDetails(updates.watcherDetails, current.users || [], updates.watchers || "")
          : normalizeWatcherDetails(ticket.watcherDetails, current.users || [], ticket.watchers || "");
        const nextWatchersLabel = updates.watchers !== undefined && !Array.isArray(updates.watcherDetails)
          ? String(updates.watchers || "").trim()
          : buildWatchersLabel(nextWatcherDetails);
        const nextApprovalAmount = Number(updates.approvalAmount ?? ticket.approvalAmount) || 0;
        const nextParentTicketId = String(updates.parentTicketId ?? ticket.parentTicketId ?? "").trim();
        const approvalPayload = updates.approval && typeof updates.approval === "object" ? updates.approval : ticket.approval;
        const nextTicketShapeForRules = {
          ...ticket,
          ...updates,
          type: updates.type ?? ticket.type,
          category: nextCategory,
          priority: nextPriority,
          department: nextDepartment,
          departmentId: nextDepartmentId,
          location: updates.location ?? ticket.location,
          title: updates.title ?? ticket.title,
          description: updates.description ?? ticket.description,
          source: updates.source ?? ticket.source,
          approvalAmount: nextApprovalAmount,
        };
        const approvalWorkflowTemplate = resolveApprovalWorkflow(
          nextTicketShapeForRules,
          current.serviceCenter?.approvalRules || [],
          current.serviceCenter?.approverDelegations || [],
          current.users || [],
          String(updates.approval?.approverId || approvalPayload?.approverId || ticket.approval?.approverId || "").trim(),
        );
        let nextApproval =
          normalizeText(nextTicketShapeForRules.type) !== "requisicao"
            ? resolveApprovalState(nextTicketShapeForRules.type, approvalPayload, approvalAction)
            : {
                ...approvalWorkflowTemplate,
                ...ticket.approval,
                ...approvalPayload,
                decisionReason: String(updates.approval?.decisionReason ?? approvalPayload?.decisionReason ?? ticket.approval?.decisionReason ?? "").trim(),
              };
        if (normalizeText(nextTicketShapeForRules.type) === "requisicao" && approvalAction === "request") {
          nextApproval = {
            ...approvalWorkflowTemplate,
            decisionReason: String(updates.approval?.decisionReason ?? approvalPayload?.decisionReason ?? "").trim(),
            requestedAt: nowIso,
            requestedById: user?.id || "",
            requestedByName: user?.name || "Sistema",
            history: [
              createApprovalHistoryEntry({
                action: "requested",
                actorId: user?.id || "",
                actorName: user?.name || "Sistema",
                reason: String(updates.approval?.decisionReason ?? approvalPayload?.decisionReason ?? "").trim(),
                stepName: approvalWorkflowTemplate.steps?.[0]?.name || "Etapa 1",
                approverName: approvalWorkflowTemplate.currentApproverName || "",
                createdAt: nowIso,
              }),
              ...(Array.isArray(ticket.approval?.history) ? ticket.approval.history : []),
            ],
          };
        }
        if (normalizeText(nextTicketShapeForRules.type) === "requisicao" && (approvalAction === "approve" || approvalAction === "reject")) {
          nextApproval = {
            ...progressApprovalWorkflow(
              {
                ...nextApproval,
                decisionReason: String(updates.approval?.decisionReason ?? approvalPayload?.decisionReason ?? "").trim(),
              },
              approvalAction,
              { id: user?.id || "", name: user?.name || "Sistema" },
              current.users || [],
              current.serviceCenter?.approverDelegations || [],
            ),
            decisionReason: String(updates.approval?.decisionReason ?? approvalPayload?.decisionReason ?? "").trim(),
          };
        }
        const effectiveStatus =
          approvalAction === "approve"
            ? normalizeText(nextApproval.status) === "pending"
              ? "Aguardando aprovacao"
              : nextAssignee
                ? "Em andamento"
                : "Aberto"
            : approvalAction === "reject"
              ? "Aguardando usuario"
              : nextStatus;

        if (statusChanged && normalizeText(effectiveStatus) === "reaberto" && !nextReopenReason) {
          return ticket;
        }
        if (statusChanged && !isStatusTransitionAllowed(ticket.status, effectiveStatus, nextTicketShapeForRules, current.serviceCenter || defaultServiceCenterSettings)) {
          return ticket;
        }
        if (nextParentTicketId && nextParentTicketId === ticket.id) {
          return ticket;
        }
        if (statusRequiresPauseReason(effectiveStatus, current.serviceCenter || defaultServiceCenterSettings) && !nextPauseReason) {
          return ticket;
        }
        if (statusRequiresWaitingReason(effectiveStatus, current.serviceCenter || defaultServiceCenterSettings) && !nextWaitingReason) {
          return ticket;
        }

        let resolvedAt = ticket.resolvedAt || "";
        if (normalizeText(effectiveStatus) === "resolvido") {
          resolvedAt = resolvedAt || nowIso;
        }
        if (normalizeText(effectiveStatus) === "reaberto") {
          resolvedAt = "";
        }

        const historyEntries = [];
        if (statusChanged) {
          historyEntries.push(
            createHistoryEntry({
              type: "status_change",
              actorId: user?.id,
              actorName: user?.name || "Sistema",
              message: `Status alterado para ${effectiveStatus}`,
              metadata: { from: ticket.status, to: effectiveStatus },
              createdAt: nowIso,
            }),
          );
          if (normalizeText(effectiveStatus) === "resolvido") {
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
          if (normalizeText(effectiveStatus) === "reaberto") {
            historyEntries.push(
              createHistoryEntry({
                type: "reopened",
                actorId: user?.id,
                actorName: user?.name || "Sistema",
                message: nextReopenReason ? `Chamado reaberto: ${nextReopenReason}` : "Chamado reaberto",
                metadata: { reopenCategory: nextReopenCategory || "" },
                createdAt: nowIso,
              }),
            );
          }
          if (statusRequiresPauseReason(effectiveStatus, current.serviceCenter || defaultServiceCenterSettings) && nextPauseReason) {
            historyEntries.push(
              createHistoryEntry({
                type: "pause_reason",
                actorId: user?.id,
                actorName: user?.name || "Sistema",
                message: `Motivo de pausa registrado: ${nextPauseReason}`,
                createdAt: nowIso,
              }),
            );
          }
          if (statusRequiresWaitingReason(effectiveStatus, current.serviceCenter || defaultServiceCenterSettings) && nextWaitingReason) {
            historyEntries.push(
              createHistoryEntry({
                type: "waiting_reason",
                actorId: user?.id,
                actorName: user?.name || "Sistema",
                message: `Motivo de espera registrado: ${nextWaitingReason}`,
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
        if (followUpsChanged && nextFollowUps.length) {
          const latestFollowUp = nextFollowUps[0];
          historyEntries.push(
            createHistoryEntry({
              type: latestFollowUp.visibility === "public" ? "public_follow_up" : "private_follow_up",
              actorId: latestFollowUp.actorId || user?.id,
              actorName: latestFollowUp.actorName || user?.name || "Sistema",
              message: latestFollowUp.visibility === "public" ? "Comentario publico registrado" : "Comentario privado registrado",
              metadata: { followUpId: latestFollowUp.id, visibility: latestFollowUp.visibility || "private" },
              createdAt: latestFollowUp.createdAt || nowIso,
            }),
          );
        }
        if (subtasksChanged) {
          const previousPending = normalizeTicketSubtasks(ticket.subtasks).filter((item) => normalizeText(item.status) !== "concluida").length;
          const nextPending = nextSubtasks.filter((item) => normalizeText(item.status) !== "concluida").length;
          historyEntries.push(
            createHistoryEntry({
              type: "subtasks_updated",
              actorId: user?.id,
              actorName: user?.name || "Sistema",
              message:
                nextSubtasks.length > normalizeTicketSubtasks(ticket.subtasks).length
                  ? "Subtarefa vinculada ao chamado"
                  : previousPending !== nextPending
                    ? "Status de subtarefa atualizado"
                    : "Subtarefas ajustadas",
              metadata: { previousPending, nextPending, count: nextSubtasks.length },
              createdAt: nowIso,
            }),
          );
        }
        if (checklistChanged) {
          const completedCount = nextChecklistItems.filter((item) => item.checked).length;
          historyEntries.push(
            createHistoryEntry({
              type: "checklist_updated",
              actorId: user?.id,
              actorName: user?.name || "Sistema",
              message: `Checklist atualizado (${completedCount}/${nextChecklistItems.length})`,
              metadata: { completedCount, total: nextChecklistItems.length },
              createdAt: nowIso,
            }),
          );
        }
        if (approvalAction === "request") {
          historyEntries.push(createHistoryEntry({ type: "approval_requested", actorId: user?.id, actorName: user?.name || "Sistema", message: "Aprovacao solicitada", createdAt: nowIso }));
        }
        if (approvalAction === "approve") {
          historyEntries.push(createHistoryEntry({ type: "approval_approved", actorId: user?.id, actorName: user?.name || "Sistema", message: "Requisicao aprovada", createdAt: nowIso }));
        }
        if (approvalAction === "reject") {
          historyEntries.push(createHistoryEntry({ type: "approval_rejected", actorId: user?.id, actorName: user?.name || "Sistema", message: "Requisicao reprovada", createdAt: nowIso }));
        }

        const nextSlaSettings = resolveTicketSlaSettings({
          openedAt: ticket.openedAt,
          dueDate: nextDueDate || "",
          slaTargetMinutes: updates.slaTargetMinutes ?? ticket.slaTargetMinutes,
          fallbackMinutes: 240,
          nowIso,
        });
        const nextSlaTargetMinutes = nextSlaSettings.slaTargetMinutes;
        const nextInitialResponseTargetMinutes = Math.max(
          15,
          Number(updates.initialResponseTargetMinutes ?? ticket.initialResponseTargetMinutes) || Math.round(nextSlaTargetMinutes * 0.25),
        );
        const routedState = applyRoutingRules({
          type: updates.type ?? ticket.type,
          category: nextCategory,
          priority: nextPriority,
          departmentId: nextDepartmentId,
          department: nextDepartment,
          queue: updates.queue ?? ticket.queue,
          location: updates.location ?? ticket.location,
          title: updates.title ?? ticket.title,
          description: updates.description ?? ticket.description,
          source: updates.source ?? ticket.source,
          assignee: nextAssignee,
          triage: ticket.triage,
        }, current.serviceCenter || defaultServiceCenterSettings, current.users || []);
        const firstResponseAt =
          ticket.firstResponseAt ||
          (followUpsChanged && nextFollowUps.length
            ? nextFollowUps[0].createdAt || nowIso
            : assigneeChanged || (statusChanged && ["em andamento", "aguardando usuario", "aguardando aprovacao"].includes(normalizeText(effectiveStatus)))
              ? nowIso
              : "");

        return {
          ...ticket,
          ...updates,
          status: effectiveStatus,
          priority: nextPriority,
          urgency: nextUrgency,
          impact: nextImpact,
          category: nextCategory,
          sla: computeSlaFromMinutes(nextSlaTargetMinutes),
          slaTargetMinutes: nextSlaTargetMinutes,
          slaDeadlineAt: nextSlaSettings.slaDeadlineAt,
          initialResponseTargetMinutes: nextInitialResponseTargetMinutes,
          initialResponseDeadlineAt: new Date(new Date(ticket.openedAt).getTime() + nextInitialResponseTargetMinutes * 60 * 1000).toISOString(),
          firstResponseAt,
          openedAt: ticket.openedAt,
          openedAtLabel: formatTimestampLabel(ticket.openedAt),
          dueDate: nextDueDate,
          dueDateLabel: nextDueDate ? formatDateLabel(nextDueDate) : "",
          requester: canViewGlobalTickets ? updates.requester ?? ticket.requester : ticket.requester,
          requesterEmail: canViewGlobalTickets
            ? String(updates.requesterEmail ?? ticket.requesterEmail ?? "").trim().toLowerCase()
            : String(ticket.requesterEmail || "").trim().toLowerCase(),
          assignee: nextAssignee,
          departmentId: nextDepartmentId,
          department: nextDepartment,
          queue: String(routedState.queue ?? updates.queue ?? ticket.queue ?? nextDepartment).trim() || nextDepartment || "Service Desk",
          resolutionNotes: nextResolutionNotes,
          watchers: nextWatchersLabel,
          watcherDetails: nextWatcherDetails,
          followUps: nextFollowUps,
          subtasks: nextSubtasks,
          checklistItems: nextChecklistItems,
          reopenReason: nextReopenReason,
          reopenCategory: nextReopenCategory,
          pauseReason: nextPauseReason,
          waitingReason: nextWaitingReason,
          approvalAmount: nextApprovalAmount,
          approval: nextApproval,
          parentTicketId: nextParentTicketId,
          triage: routedState.triage || ticket.triage || {},
          resolvedAt,
          resolvedAtLabel: resolvedAt ? formatTimestampLabel(resolvedAt) : "",
          updatedAtIso: nowIso,
          updatedAt: formatTimestampLabel(nowIso),
          knowledgeArticleIds: nextKnowledgeArticleIds,
          projectId: nextProjectId,
          projectName: nextProjectName,
          assetId: nextAssetId,
          assetName: nextAssetName,
          slaRuleScope: {
            source: "manual",
            technicianId: String(user?.id || "").trim(),
            technicianName: String(user?.name || "Sistema").trim(),
          },
          history: appendHistory(ticket, historyEntries),
        };
      }),
    }));
  };

  const deleteTicket = (ticketId) => {
    if (!hasAnyPermission(user, ["tickets_delete", "tickets_admin"])) return;
    applyState((current) => ({
      ...current,
      tickets: current.tickets.filter(
        (ticket) =>
          ticket.id !== ticketId ||
          !canAccessTicket(ticket, user, current.departments || [], current.serviceCenter || defaultServiceCenterSettings),
      ),
    }));
  };

  const addTicketAttachments = (ticketId, attachments) => {
    if (!hasAnyPermission(user, ["tickets_edit", "tickets_admin"])) return;
    applyState((current) => ({
      ...current,
      tickets: current.tickets.map((ticket) =>
        ticket.id === ticketId &&
        canAccessTicket(ticket, user, current.departments || [], current.serviceCenter || defaultServiceCenterSettings)
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
        ticket.id === ticketId &&
        canAccessTicket(ticket, user, current.departments || [], current.serviceCenter || defaultServiceCenterSettings)
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
      createdUser = {
        id: nextId("u", current.users || []),
        ...sanitizeUserPayload(
          payload,
          current.departments || [],
          current.permissionCatalog || defaultPermissionCatalog,
          current.permissionProfiles || defaultPermissionProfiles,
        ),
      };
      return { ...current, users: [createdUser, ...(current.users || [])] };
    });
    return createdUser;
  };

  const duplicateUser = (userId) => {
    if (!hasAnyPermission(user, ["users_create", "users_admin"])) return null;
    let createdUser = null;
    applyState((current) => {
      const sourceUser = current.users.find((candidate) => candidate.id === userId);
      if (!sourceUser) return current;
      createdUser = {
        ...sourceUser,
        id: nextId("u", current.users || []),
        name: `${sourceUser.name} (Copia)`,
        email: "",
        status: "Inativo",
        password: "",
        passwordReveal: "",
        mustChangePassword: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      return { ...current, users: [createdUser, ...(current.users || [])] };
    });
    return createdUser;
  };

  const updateUser = (userId, payload) => {
    if (!hasAnyPermission(user, ["users_edit", "users_reset_password", "users_manage_permissions", "users_admin"])) return;
    applyState((current) => {
      let nextCurrentUser = null;
      const nextUsers = current.users.map((candidate) => {
        if (candidate.id !== userId) return candidate;
        const sanitizedPayload = sanitizeUserPayload(
          payload,
          current.departments || [],
          current.permissionCatalog || defaultPermissionCatalog,
          current.permissionProfiles || defaultPermissionProfiles,
        );
        const permissionsChanged =
          JSON.stringify(candidate.permissions || {}) !== JSON.stringify(sanitizedPayload.permissions || {});
        const passwordChanged = String(candidate.passwordReveal || "") !== String(sanitizedPayload.passwordReveal || "");
        const nextUser = {
          ...candidate,
          name: sanitizedPayload.name,
          email: sanitizedPayload.email,
          mustChangePassword:
            hasAnyPermission(user, ["users_reset_password", "users_admin"]) || !candidate.id
              ? sanitizedPayload.mustChangePassword
              : Boolean(candidate.mustChangePassword),
          status: sanitizedPayload.status,
          role: sanitizedPayload.role,
          permissionProfileId: sanitizedPayload.permissionProfileId,
          team: sanitizedPayload.team,
          departmentId: sanitizedPayload.departmentId,
          department: sanitizedPayload.department,
          avatar: sanitizedPayload.avatar,
          additionalPermissions: sanitizedPayload.additionalPermissions,
          restrictedPermissions: sanitizedPayload.restrictedPermissions,
          ...(passwordChanged && hasAnyPermission(user, ["users_reset_password", "users_admin"])
            ? { password: sanitizedPayload.password, passwordReveal: sanitizedPayload.passwordReveal }
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

  const setUserStatus = (userId, status) => {
    if (!hasAnyPermission(user, ["users_edit", "users_reset_password", "users_admin"])) return;
    applyState((current) => {
      let nextCurrentUser = null;
      const nextUsers = current.users.map((candidate) => {
        if (candidate.id !== userId) return candidate;
        const nextUser = {
          ...candidate,
          status: status === "Ativo" ? "Ativo" : "Inativo",
          updatedAt: new Date().toISOString(),
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
        nextCurrentUser = {
          ...candidate,
          avatar: String(payload.avatar || "").trim(),
          updatedAt: new Date().toISOString(),
        };
        return nextCurrentUser;
      });
      if (nextCurrentUser) setSessionUser(nextCurrentUser);
      return {
        ...current,
        users: nextUsers,
        currentUser:
          current.currentUser?.id === user.id
            ? { ...current.currentUser, ...nextCurrentUser }
            : current.currentUser,
      };
    });
  };

  const deleteUser = (userId) => {
    if (!hasAnyPermission(user, ["users_delete", "users_admin"])) return;
    applyState((current) => {
      let nextCurrentUser = null;
      const nextUsers = current.users.map((candidate) => {
        if (candidate.id !== userId) return candidate;
        const nextUser = {
          ...candidate,
          status: "Excluido",
          updatedAt: new Date().toISOString(),
        };
        if (nextUser.id === user?.id) nextCurrentUser = nextUser;
        return nextUser;
      });
      if (nextCurrentUser) setSessionUser(nextCurrentUser);
      return { ...current, users: nextUsers };
    });
  };

  const addDepartment = (payload) => {
    if (!hasAnyPermission(user, ["users_create", "users_admin", "service_center_departments_manage", "service_center_manage"])) return null;
    let createdDepartment = null;
    applyState((current) => {
      const nowIso = new Date().toISOString();
      createdDepartment = {
        id: nextId("dep", current.departments || []),
        ...sanitizeDepartmentPayload(
          {
            ...payload,
            createdAt: nowIso,
            updatedAt: nowIso,
          },
          payload,
        ),
      };
      return { ...current, departments: [createdDepartment, ...(current.departments || [])] };
    });
    return createdDepartment;
  };

  const updateDepartment = (departmentId, payload) => {
    if (!hasAnyPermission(user, ["users_edit", "users_admin", "service_center_departments_manage", "service_center_manage"])) return null;
    let updatedDepartment = null;
    applyState((current) => {
      const nowIso = new Date().toISOString();
      const nextDepartments = current.departments.map((department) =>
        department.id === departmentId
          ? (() => {
              updatedDepartment = {
                ...department,
                ...sanitizeDepartmentPayload(
                  {
                    ...department,
                    ...payload,
                    createdAt: department.createdAt,
                    updatedAt: nowIso,
                  },
                  department,
                ),
              };
              return updatedDepartment;
            })()
          : department,
      );
      if (!updatedDepartment) return current;
      const nextCurrentUser = syncUserDepartment(current.currentUser, nextDepartments);
      if (nextCurrentUser?.id === user?.id) {
        setSessionUser(nextCurrentUser);
      }
      return {
        ...current,
        departments: nextDepartments,
        users: current.users.map((candidate) => syncUserDepartment(candidate, nextDepartments)),
        currentUser: nextCurrentUser,
        locations: current.locations.map((location) =>
          location.departmentId === departmentId
            ? {
                ...location,
                ...sanitizeLocationPayload(
                  { ...location, departmentId, department: payload.name || location.department, updatedAt: nowIso },
                  nextDepartments,
                  location,
                ),
              }
            : location,
        ),
        tickets: current.tickets.map((ticket) =>
          String(ticket.departmentId || "").trim() === departmentId
            ? {
                ...ticket,
                department: updatedDepartment.name,
                queue:
                  String(ticket.queue || "").trim() === String(ticket.department || "").trim()
                    ? updatedDepartment.name
                    : ticket.queue,
              }
            : ticket,
        ),
      };
    });
    return updatedDepartment;
  };

  const deleteDepartment = (departmentId) => {
    if (!hasAnyPermission(user, ["users_delete", "users_admin", "service_center_departments_manage", "service_center_manage"])) return;
    applyState((current) => {
      const nextServiceCenterDepartments = { ...(current.serviceCenter?.departments || {}) };
      delete nextServiceCenterDepartments[departmentId];
      return {
        ...current,
        departments: current.departments.filter((department) => department.id !== departmentId),
        serviceCenter: {
          ...(current.serviceCenter || defaultServiceCenterSettings),
          departments: nextServiceCenterDepartments,
          updatedAt: new Date().toISOString(),
        },
      };
    });
  };

  const addTeam = (payload) => {
    if (!hasAnyPermission(user, ["users_create", "users_admin"])) return null;
    let createdTeam = null;
    applyState((current) => {
      createdTeam = {
        id: nextId("team", current.teams || []),
        ...sanitizeTeamPayload(payload),
      };
      return { ...current, teams: [createdTeam, ...(current.teams || [])] };
    });
    return createdTeam;
  };

  const updateTeam = (teamId, payload) => {
    if (!hasAnyPermission(user, ["users_edit", "users_admin"])) return null;
    let previousTeamName = "";
    let updatedTeam = null;
    applyState((current) => {
      const nowIso = new Date().toISOString();
      const nextTeams = (current.teams || []).map((team) =>
        team.id === teamId
          ? (() => {
              previousTeamName = team.name;
              updatedTeam = {
                ...team,
                ...sanitizeTeamPayload({ ...team, ...payload, createdAt: team.createdAt, updatedAt: nowIso }, team),
              };
              return updatedTeam;
            })()
          : team,
      );
      if (!updatedTeam) return current;
      return {
        ...current,
        teams: nextTeams,
        users: (current.users || []).map((candidate) =>
          normalizeText(candidate.team) === normalizeText(previousTeamName)
            ? { ...candidate, team: updatedTeam.name, updatedAt: nowIso }
            : candidate,
        ),
      };
    });
    return updatedTeam;
  };

  const deleteTeam = (teamId) => {
    if (!hasAnyPermission(user, ["users_delete", "users_admin"])) return;
    applyState((current) => ({
      ...current,
      teams: (current.teams || []).filter((team) => team.id !== teamId),
    }));
  };

  const updateServiceCenterSettings = (payload = {}) => {
    if (!hasAnyPermission(user, ["service_center_manage", "users_manage_permissions", "users_admin"])) return;
    applyState((current) => {
      const currentServiceCenter = current.serviceCenter || defaultServiceCenterSettings;
      return {
        ...current,
        serviceCenter: {
          ...currentServiceCenter,
          ...payload,
          enabled: payload.enabled !== undefined ? Boolean(payload.enabled) : Boolean(currentServiceCenter.enabled),
          triagePanelVisible: payload.triagePanelVisible !== undefined ? Boolean(payload.triagePanelVisible) : currentServiceCenter.triagePanelVisible !== false,
          escalationRules:
            payload.escalationRules !== undefined
              ? sanitizeEscalationRules(payload.escalationRules, currentServiceCenter.escalationRules)
              : currentServiceCenter.escalationRules,
          ticketStatusProfiles:
            payload.ticketStatusProfiles !== undefined
              ? sanitizeTicketStatusProfiles(payload.ticketStatusProfiles, currentServiceCenter.ticketStatusProfiles)
              : currentServiceCenter.ticketStatusProfiles,
          statusReasonRules:
            payload.statusReasonRules !== undefined
              ? sanitizeStatusReasonRules(payload.statusReasonRules, currentServiceCenter.statusReasonRules)
              : currentServiceCenter.statusReasonRules,
          emailIntake:
            payload.emailIntake !== undefined
              ? sanitizeEmailIntakeConfig(payload.emailIntake, currentServiceCenter.emailIntake)
              : currentServiceCenter.emailIntake,
          updatedAt: new Date().toISOString(),
        },
      };
    });
  };

  const saveServiceCenterAutomation = (payload = {}) => {
    if (!hasAnyPermission(user, ["service_center_manage", "users_manage_permissions", "users_admin"])) return null;
    const nowIso = new Date().toISOString();
    applyState((current) => {
      const currentServiceCenter = current.serviceCenter || defaultServiceCenterSettings;
      return {
        ...current,
        serviceCenter: {
          ...currentServiceCenter,
          triagePanelVisible:
            payload.triagePanelVisible !== undefined
              ? Boolean(payload.triagePanelVisible)
              : currentServiceCenter.triagePanelVisible !== false,
          routingRules:
            payload.routingRules !== undefined
              ? payload.routingRules.map((rule, index) =>
                  sanitizeRoutingRulePayload(
                    { ...rule, id: String(rule.id || `routing-${index + 1}`) },
                    rule,
                  ),
                )
              : currentServiceCenter.routingRules || [],
          slaPolicies:
            payload.slaPolicies !== undefined
              ? payload.slaPolicies.map((policy, index) =>
                  sanitizeSlaPolicyPayload(
                    { ...policy, id: String(policy.id || `sla-${index + 1}`) },
                    policy,
                  ),
                )
              : currentServiceCenter.slaPolicies || [],
          approvalRules:
            payload.approvalRules !== undefined
              ? payload.approvalRules.map((rule, index) =>
                  sanitizeApprovalRulePayload(
                    { ...rule, id: String(rule.id || `approval-${index + 1}`) },
                    rule,
                  ),
                )
              : currentServiceCenter.approvalRules || [],
          approverDelegations:
            payload.approverDelegations !== undefined
              ? payload.approverDelegations.map((delegation, index) =>
                  sanitizeApproverDelegationPayload(
                    { ...delegation, id: String(delegation.id || `delegation-${index + 1}`) },
                    delegation,
                  ),
                )
              : currentServiceCenter.approverDelegations || [],
          escalationRules:
            payload.escalationRules !== undefined
              ? sanitizeEscalationRules(payload.escalationRules, currentServiceCenter.escalationRules)
              : currentServiceCenter.escalationRules,
          ticketStatusProfiles:
            payload.ticketStatusProfiles !== undefined
              ? sanitizeTicketStatusProfiles(payload.ticketStatusProfiles, currentServiceCenter.ticketStatusProfiles)
              : currentServiceCenter.ticketStatusProfiles,
          statusReasonRules:
            payload.statusReasonRules !== undefined
              ? sanitizeStatusReasonRules(payload.statusReasonRules, currentServiceCenter.statusReasonRules)
              : currentServiceCenter.statusReasonRules,
          emailIntake:
            payload.emailIntake !== undefined
              ? sanitizeEmailIntakeConfig(payload.emailIntake, currentServiceCenter.emailIntake)
              : currentServiceCenter.emailIntake,
          updatedAt: nowIso,
        },
      };
    });
    return true;
  };

  const saveServiceCenterDepartmentConfig = (departmentId, payload = {}) => {
    if (!hasAnyPermission(user, ["service_center_departments_manage", "service_center_departments_toggle", "service_center_manage", "users_manage_permissions", "users_admin"])) return null;
    let savedConfig = null;
    applyState((current) => {
      const departmentExists = (current.departments || []).some((department) => department.id === departmentId);
      if (!departmentExists) return current;
      const currentConfig = getServiceCenterDepartmentConfig(current.serviceCenter, departmentId);
      savedConfig = sanitizeServiceCenterDepartmentConfig(
        {
          ...currentConfig,
          ...payload,
          updatedAt: new Date().toISOString(),
        },
        currentConfig,
      );
      return {
        ...current,
        serviceCenter: {
          ...(current.serviceCenter || defaultServiceCenterSettings),
          departments: {
            ...(current.serviceCenter?.departments || {}),
            [departmentId]: savedConfig,
          },
          updatedAt: new Date().toISOString(),
        },
      };
    });
    return savedConfig;
  };

  const saveServiceCenterDepartment = (departmentPayload = {}, servicePayload = {}, departmentId = null) => {
    if (!hasAnyPermission(user, ["service_center_departments_manage", "service_center_departments_toggle", "service_center_manage", "users_manage_permissions", "users_admin"])) {
      return null;
    }

    let savedDepartment = null;
    applyState((current) => {
      const nowIso = new Date().toISOString();
      const nextDepartmentId = departmentId || nextId("dep", current.departments || []);
      const currentDepartment = (current.departments || []).find((department) => department.id === nextDepartmentId) || null;
      const nextDepartments = currentDepartment
        ? (current.departments || []).map((department) =>
            department.id === nextDepartmentId
              ? {
                  ...department,
                  ...sanitizeDepartmentPayload(
                    {
                      ...department,
                      ...departmentPayload,
                      createdAt: department.createdAt,
                      updatedAt: nowIso,
                    },
                    department,
                  ),
                }
              : department,
          )
        : [
            {
              id: nextDepartmentId,
              ...sanitizeDepartmentPayload(
                {
                  ...departmentPayload,
                  createdAt: nowIso,
                  updatedAt: nowIso,
                },
                departmentPayload,
              ),
            },
            ...(current.departments || []),
          ];

      savedDepartment = nextDepartments.find((department) => department.id === nextDepartmentId) || null;
      if (!savedDepartment) return current;

      const currentConfig = getServiceCenterDepartmentConfig(current.serviceCenter, nextDepartmentId);
      const savedConfig = sanitizeServiceCenterDepartmentConfig(
        {
          ...currentConfig,
          ...servicePayload,
          updatedAt: nowIso,
        },
        currentConfig,
      );

      const nextCurrentUser = syncUserDepartment(current.currentUser, nextDepartments);
      if (nextCurrentUser?.id === user?.id) {
        setSessionUser(nextCurrentUser);
      }

      return {
        ...current,
        departments: nextDepartments,
        users: (current.users || []).map((candidate) => syncUserDepartment(candidate, nextDepartments)),
        currentUser: nextCurrentUser,
        locations: (current.locations || []).map((location) =>
          location.departmentId === nextDepartmentId
            ? {
                ...location,
                ...sanitizeLocationPayload(
                  { ...location, departmentId: nextDepartmentId, department: savedDepartment.name, updatedAt: nowIso },
                  nextDepartments,
                  location,
                ),
              }
            : location,
        ),
        tickets: (current.tickets || []).map((ticket) =>
          String(ticket.departmentId || "").trim() === nextDepartmentId
            ? {
                ...ticket,
                department: savedDepartment.name,
                queue:
                  String(ticket.queue || "").trim() === String(ticket.department || "").trim()
                    ? savedDepartment.name
                    : ticket.queue,
              }
            : ticket,
        ),
        serviceCenter: {
          ...(current.serviceCenter || defaultServiceCenterSettings),
          departments: {
            ...(current.serviceCenter?.departments || {}),
            [nextDepartmentId]: savedConfig,
          },
          updatedAt: nowIso,
        },
      };
    });

    return savedDepartment;
  };

  const addAsset = (payload) => {
    if (!hasAnyPermission(user, ["assets_create", "assets_admin"])) return;
    applyState((current) => ({
      ...current,
      assets: [
        {
          id: nextId("asset", current.assets || []),
          ...sanitizeAssetPayload(payload, current.locations || []),
        },
        ...(current.assets || []),
      ],
    }));
  };

  const updateAsset = (assetId, payload) => {
    if (!hasAnyPermission(user, ["assets_edit", "assets_admin"])) return;
    applyState((current) => ({
      ...current,
      assets: current.assets.map((asset) => {
        if (asset.id !== assetId) return asset;
        const sanitizedPayload = sanitizeAssetPayload(payload, current.locations || []);
        const nextOwner =
          sanitizedPayload.owner !== asset.owner && !hasAnyPermission(user, ["assets_link_users", "assets_admin"])
            ? asset.owner
            : sanitizedPayload.owner;
        const nextLocation =
          sanitizedPayload.location !== asset.location && !hasAnyPermission(user, ["assets_move", "assets_admin"])
            ? asset.location
            : sanitizedPayload.location;
        return {
          ...asset,
          ...sanitizedPayload,
          owner: nextOwner,
          location: nextLocation,
          locationId:
            nextLocation !== sanitizedPayload.location
              ? asset.locationId
              : sanitizedPayload.locationId,
          locationDepartmentId:
            nextLocation !== sanitizedPayload.location
              ? asset.locationDepartmentId
              : sanitizedPayload.locationDepartmentId,
          locationDepartment:
            nextLocation !== sanitizedPayload.location
              ? asset.locationDepartment
              : sanitizedPayload.locationDepartment,
        };
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

  const addLocation = (payload) => {
    if (!hasAnyPermission(user, ["assets_create", "assets_admin"])) return null;
    let createdLocation = null;
    applyState((current) => {
      const nowIso = new Date().toISOString();
      createdLocation = {
        id: nextId("loc", current.locations || []),
        ...sanitizeLocationPayload(
          {
            ...payload,
            createdAt: nowIso,
            updatedAt: nowIso,
          },
          current.departments || [],
          payload,
        ),
      };
      return { ...current, locations: [createdLocation, ...(current.locations || [])] };
    });
    return createdLocation;
  };

  const setLocationStatus = (locationId, status) => {
    if (!hasAnyPermission(user, ["assets_edit", "assets_admin"])) return;
    applyState((current) => {
      const nextLocations = current.locations.map((location) =>
        location.id === locationId
          ? {
              ...location,
              status: status === "Ativo" ? "Ativo" : "Inativo",
              updatedAt: new Date().toISOString(),
            }
          : location,
      );
      return {
        ...current,
        locations: nextLocations,
        assets: current.assets.map((asset) => syncAssetLocation(asset, nextLocations)),
      };
    });
  };

  const updateLocation = (locationId, payload) => {
    if (!hasAnyPermission(user, ["assets_edit", "assets_admin"])) return;
    applyState((current) => {
      const nowIso = new Date().toISOString();
      const nextLocations = current.locations.map((location) =>
        location.id === locationId
          ? {
              ...location,
              ...sanitizeLocationPayload(
                {
                  ...location,
                  ...payload,
                  createdAt: location.createdAt,
                  updatedAt: nowIso,
                },
                current.departments || [],
                location,
              ),
            }
          : location,
      );
      return {
        ...current,
        locations: nextLocations,
        assets: current.assets.map((asset) => syncAssetLocation(asset, nextLocations)),
      };
    });
  };

  const deleteLocation = (locationId) => {
    if (!hasAnyPermission(user, ["assets_delete", "assets_admin"])) return;
    applyState((current) => ({
      ...current,
      locations: current.locations.filter((location) => location.id !== locationId),
    }));
  };

  const savePermissionProfile = (payload, profileId = null) => {
    if (!hasAnyPermission(user, ["users_manage_permissions", "users_admin"])) return null;
    const nowIso = new Date().toISOString();
    let savedProfileId = profileId;
    applyState((current) => {
      const sanitizedPayload = sanitizePermissionProfilePayload(
        payload,
        current.permissionCatalog || defaultPermissionCatalog,
        current.permissionProfiles.find((profile) => profile.id === profileId) || {},
      );
      if (profileId) {
        const nextPermissionProfiles = current.permissionProfiles.map((profile) =>
          profile.id === profileId
            ? { ...profile, ...sanitizedPayload, updatedAt: nowIso }
            : profile,
        );
        let nextCurrentUser = current.currentUser;
        const nextUsers = current.users.map((candidate) => {
          if (candidate.permissionProfileId !== profileId) return candidate;
          const nextUser = {
            ...candidate,
            role: sanitizedPayload.name,
            permissions: normalizeUserPermissions(
              {},
              {
                ...candidate,
                role: sanitizedPayload.name,
                permissionProfileId: profileId,
              },
              current.permissionCatalog || defaultPermissionCatalog,
              nextPermissionProfiles,
            ),
            updatedAt: nowIso,
          };
          if (nextCurrentUser?.id === nextUser.id) nextCurrentUser = nextUser;
          return nextUser;
        });
        if (nextCurrentUser?.id === user?.id) setSessionUser(nextCurrentUser);
        return {
          ...current,
          permissionProfiles: nextPermissionProfiles,
          users: nextUsers,
          currentUser: nextCurrentUser,
        };
      }
      savedProfileId = nextId("profile", current.permissionProfiles || []);
      return {
        ...current,
        permissionProfiles: [
          {
            id: savedProfileId,
            ...sanitizedPayload,
            createdAt: nowIso,
            updatedAt: nowIso,
          },
          ...(current.permissionProfiles || []),
        ],
      };
    });
    return savedProfileId;
  };

  const duplicatePermissionProfile = (profileId) => {
    if (!hasAnyPermission(user, ["users_manage_permissions", "users_admin"])) return null;
    let duplicatedProfileId = null;
    applyState((current) => {
      const sourceProfile = current.permissionProfiles.find((profile) => profile.id === profileId);
      if (!sourceProfile) return current;
      duplicatedProfileId = nextId("profile", current.permissionProfiles || []);
      return {
        ...current,
        permissionProfiles: [
          {
            ...sourceProfile,
            id: duplicatedProfileId,
            name: `${sourceProfile.name} (Copia)`,
            status: "Inativo",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          ...(current.permissionProfiles || []),
        ],
      };
    });
    return duplicatedProfileId;
  };

  const setPermissionProfileStatus = (profileId, status) => {
    if (!hasAnyPermission(user, ["users_manage_permissions", "users_admin"])) return;
    applyState((current) => ({
      ...current,
      permissionProfiles: current.permissionProfiles.map((profile) =>
        profile.id === profileId
          ? { ...profile, status: status === "Ativo" ? "Ativo" : "Inativo", updatedAt: new Date().toISOString() }
          : profile,
      ),
    }));
  };

  const deletePermissionProfile = (profileId) => {
    if (!hasAnyPermission(user, ["users_manage_permissions", "users_admin"])) return;
    applyState((current) => ({
      ...current,
      permissionProfiles: current.permissionProfiles.filter((profile) => profile.id !== profileId),
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

  const deleteKnowledgeArticle = (articleId) => {
    if (!hasAnyPermission(user, ["knowledge_delete", "knowledge_admin"])) return;
    applyState((current) => ({
      ...current,
      knowledgeArticles: current.knowledgeArticles.filter((article) => article.id !== articleId),
      tickets: current.tickets.map((ticket) => ({
        ...ticket,
        knowledgeArticleIds: (ticket.knowledgeArticleIds || []).filter((linkedArticleId) => linkedArticleId !== articleId),
      })),
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

  const saveEmailLayout = (payload, layoutId) => {
    if (!hasAnyPermission(user, ["email_layouts_manage", "users_admin"])) return null;
    const nowIso = new Date().toISOString();
    let savedLayoutId = layoutId || null;

    applyState((current) => {
      const sanitizedPayload = {
        name: String(payload.name || "").trim(),
        eventKey: String(payload.eventKey || "").trim(),
        subject: String(payload.subject || "").trim(),
        body: String(payload.body || "").trim(),
        status: String(payload.status || "Ativo").trim() || "Ativo",
      };

      if (layoutId) {
        return {
          ...current,
          emailLayouts: current.emailLayouts.map((layout) =>
            layout.id === layoutId
              ? { ...layout, ...sanitizedPayload, updatedAt: nowIso }
              : layout,
          ),
        };
      }

      savedLayoutId = nextId("layout", current.emailLayouts || []);
      return {
        ...current,
        emailLayouts: [
          {
            id: savedLayoutId,
            ...sanitizedPayload,
            createdAt: nowIso,
            updatedAt: nowIso,
          },
          ...(current.emailLayouts || []),
        ],
      };
    });

    return savedLayoutId;
  };

  const deleteEmailLayout = (layoutId) => {
    if (!hasAnyPermission(user, ["email_layouts_delete", "users_admin"])) return;
    applyState((current) => ({
      ...current,
      emailLayouts: current.emailLayouts.filter((layout) => layout.id !== layoutId),
      notificationRules: current.notificationRules.map((rule) =>
        rule.layoutId === layoutId ? { ...rule, layoutId: "", updatedAt: new Date().toISOString() } : rule,
      ),
    }));
  };

  const saveNotificationRule = (payload, ruleId) => {
    if (!hasAnyPermission(user, ["notifications_manage", "users_admin"])) return null;
    const nowIso = new Date().toISOString();
    let savedRuleId = ruleId || null;

    applyState((current) => {
      const sanitizedPayload = {
        eventKey: String(payload.eventKey || "").trim(),
        active: payload.active !== false,
        recipientUserIds: Array.isArray(payload.recipientUserIds) ? payload.recipientUserIds.filter(Boolean) : [],
        externalEmails: Array.isArray(payload.externalEmails)
          ? payload.externalEmails.filter(Boolean)
          : String(payload.externalEmails || "")
              .split(/[,\n;]/)
              .map((item) => item.trim())
              .filter(Boolean),
        layoutId: String(payload.layoutId || "").trim(),
      };

      if (ruleId) {
        return {
          ...current,
          notificationRules: current.notificationRules.map((rule) =>
            rule.id === ruleId
              ? { ...rule, ...sanitizedPayload, updatedAt: nowIso }
              : rule,
          ),
        };
      }

      savedRuleId = nextId("notif", current.notificationRules || []);
      return {
        ...current,
        notificationRules: [
          {
            id: savedRuleId,
            ...sanitizedPayload,
            createdAt: nowIso,
            updatedAt: nowIso,
          },
          ...(current.notificationRules || []),
        ],
      };
    });

    return savedRuleId;
  };

  const saveSmtpSettings = async (payload) => {
    if (!hasAnyPermission(user, ["notifications_manage", "users_admin"])) return;
    const nextState = {
      ...data,
      smtpSettings: {
        ...data.smtpSettings,
        deliveryMode: "smtp",
        host: String(payload.host || "").trim(),
        port: Number(payload.port) || 587,
        secure: Boolean(payload.secure),
        requireTls: payload.requireTls !== false,
        username: String(payload.username || "").trim(),
        password: String(payload.password || ""),
        hasPassword: data.smtpSettings?.hasPassword || Boolean(payload.password),
        fromEmail: String(payload.fromEmail || "").trim(),
        fromName: String(payload.fromName || "").trim(),
      },
    };
    return persistStateImmediately(nextState);
  };

  const saveEmailServiceSettings = async (payload) => {
    if (!hasAnyPermission(user, ["notifications_manage", "users_admin"])) return;
    const nextState = {
      ...data,
      emailServiceSettings: {
        ...data.emailServiceSettings,
        provider: String(payload.provider || "").trim(),
        apiKey: String(payload.apiKey || ""),
        hasApiKey: data.emailServiceSettings?.hasApiKey || Boolean(payload.apiKey),
        fromEmail: String(payload.fromEmail || "").trim(),
        fromName: String(payload.fromName || "").trim(),
        deliveryMode: "smtp",
      },
    };
    return persistStateImmediately(nextState);
  };

  const requestNotificationTest = async (payload) => {
    if (!hasAnyPermission(user, ["notifications_manage", "users_admin"])) return;
    return sendNotificationTestRequest({
      recipients: payload?.recipients || "",
      subject: payload?.subject || "",
      body: payload?.body || "",
    });
  };

  const processInboundEmail = async (payload = {}) => {
    if (!hasAnyPermission(user, ["tickets_create", "tickets_admin"])) return null;
    const parsedPayload = parseInboundEmailTicket(payload, data.users || [], data.departments || [], data.serviceCenter || defaultServiceCenterSettings);
    return createTicket({
      ...parsedPayload,
      attachments: Array.isArray(payload.attachments) ? payload.attachments : [],
      watcherDetails: normalizeWatcherDetails(payload.watcherDetails, data.users || []),
    });
  };

  const value = useMemo(
    () => ({
      summary,
      queues: queueStats,
      permissionCatalog: data.permissionCatalog || [],
      permissionProfiles: data.permissionProfiles || [],
      navigationSections: data.navigationSections || [],
      notificationEvents: data.notificationEvents || [],
      emailPlaceholders: data.emailPlaceholders || [],
      emailLayouts: data.emailLayouts || [],
      notificationRules: data.notificationRules || [],
      notificationLogs: data.notificationLogs || [],
      smtpSettings: data.smtpSettings || defaultSmtpSettings,
      emailServiceSettings: data.emailServiceSettings || defaultEmailServiceSettings,
      serviceCenter: data.serviceCenter || defaultServiceCenterSettings,
      users: data.users || [],
      departments: data.departments || [],
      teams: data.teams || [],
      linkedServiceDepartmentIds,
      locations: data.locations || [],
      tickets: visibleTickets,
      allTickets,
      operationalTickets,
      getAllowedTicketStatuses: (ticket) => getAllowedTicketStatusesForTicket(ticket, data.serviceCenter || defaultServiceCenterSettings),
      canViewAllTickets: canViewGlobalTickets,
      canViewDepartmentTickets,
      assets: data.assets || [],
      brands: data.brands || [],
      models: data.models || [],
      projects: data.projects || [],
      knowledgeArticles,
      apiConfigs: data.apiConfigs || [],
      reports: data.reports,
      operationalReports,
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
      duplicateUser,
      updateUser,
      setUserStatus,
      updateOwnProfile,
      deleteUser,
      addDepartment,
      updateDepartment,
      deleteDepartment,
      addTeam,
      updateTeam,
      deleteTeam,
      updateServiceCenterSettings,
      saveServiceCenterAutomation,
      saveServiceCenterDepartmentConfig,
      saveServiceCenterDepartment,
      addAsset,
      updateAsset,
      deleteAsset,
      addLocation,
      updateLocation,
      setLocationStatus,
      deleteLocation,
      savePermissionProfile,
      duplicatePermissionProfile,
      setPermissionProfileStatus,
      deletePermissionProfile,
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
      deleteKnowledgeArticle,
      createKnowledgeArticleFromTicket,
      linkKnowledgeArticleToTicket,
      saveApiConfig,
      deleteApiConfig,
      saveEmailLayout,
      deleteEmailLayout,
      saveNotificationRule,
      saveSmtpSettings,
      saveEmailServiceSettings,
      requestNotificationTest,
      processInboundEmail,
      toLocalDatetimeInput,
    }),
    [
      summary,
      queueStats,
      data,
      visibleTickets,
      allTickets,
      operationalTickets,
      linkedServiceDepartmentIds,
      canViewDepartmentTickets,
      canViewGlobalTickets,
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
