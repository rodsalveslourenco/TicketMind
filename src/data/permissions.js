import {
  defaultNavigationSections,
  defaultPermissionCatalog,
  defaultPermissionProfiles,
} from "./systemDefaults.js";

const roleAliases = {
  Administrador: "Administrador da Plataforma",
  Analista: "Analista de Service Desk",
  Especialista: "Especialista de Infraestrutura",
  Coordenador: "Gestor de Area",
  Coordenadora: "Gestor de Area",
  Solicitante: "Solicitante Interno",
};

const defaultProfilePermissionBackfills = {
  "profile-analyst": ["service_center_view_department_tickets", "service_center_attend_linked_departments"],
  "profile-infra": ["service_center_view_department_tickets", "service_center_attend_linked_departments"],
  "profile-area-manager": [
    "tickets_edit",
    "tickets_assign",
    "tickets_change_status",
    "tickets_close",
    "tickets_reopen",
    "service_center_view_department_tickets",
    "service_center_attend_linked_departments",
  ],
};

export function normalizeRoleName(role) {
  const sanitizedRole = String(role || "").trim();
  return roleAliases[sanitizedRole] || sanitizedRole || "Solicitante Interno";
}

export function listPermissionKeys(permissionCatalog = defaultPermissionCatalog) {
  return Array.from(
    new Set(
      (Array.isArray(permissionCatalog) ? permissionCatalog : []).flatMap((group) =>
        (Array.isArray(group.permissions) ? group.permissions : []).map((permission) => permission.key),
      ),
    ),
  );
}

export function buildEmptyPermissions(permissionCatalog = defaultPermissionCatalog) {
  return listPermissionKeys(permissionCatalog).reduce((accumulator, key) => ({ ...accumulator, [key]: false }), {});
}

export function buildPermissionsFromKeys(keys = [], permissionCatalog = defaultPermissionCatalog) {
  const permissionMap = buildEmptyPermissions(permissionCatalog);
  if (keys === "ALL") {
    return Object.keys(permissionMap).reduce((accumulator, key) => ({ ...accumulator, [key]: true }), {});
  }

  return (Array.isArray(keys) ? keys : []).reduce((accumulator, key) => {
    if (!(key in accumulator)) return accumulator;
    return { ...accumulator, [key]: true };
  }, permissionMap);
}

export function getRoleProfile(role, permissionProfiles = defaultPermissionProfiles) {
  const normalizedRole = normalizeRoleName(role);
  return (
    (Array.isArray(permissionProfiles) ? permissionProfiles : []).find((profile) => profile.name === normalizedRole) ||
    defaultPermissionProfiles[defaultPermissionProfiles.length - 1]
  );
}

export function getRolePermissions(
  role,
  permissionProfiles = defaultPermissionProfiles,
  permissionCatalog = defaultPermissionCatalog,
) {
  const profile = getRoleProfile(role, permissionProfiles);
  return buildPermissionsFromKeys(profile?.permissions || [], permissionCatalog);
}

export function getPermissionProfileById(profileId, permissionProfiles = defaultPermissionProfiles) {
  const normalizedProfileId = String(profileId || "").trim();
  if (!normalizedProfileId) return null;
  return (Array.isArray(permissionProfiles) ? permissionProfiles : []).find((profile) => profile.id === normalizedProfileId) || null;
}

export function getUserPermissionProfile(user = {}, permissionProfiles = defaultPermissionProfiles) {
  return (
    getPermissionProfileById(user.permissionProfileId, permissionProfiles) ||
    getRoleProfile(user.role, permissionProfiles)
  );
}

function applyProfilePermissionBackfill(profile = {}) {
  if (profile.permissions === "ALL") return profile;
  const requiredPermissions = defaultProfilePermissionBackfills[profile.id] || [];
  if (!requiredPermissions.length) return profile;
  return {
    ...profile,
    permissions: Array.from(new Set([...(Array.isArray(profile.permissions) ? profile.permissions : []), ...requiredPermissions])),
  };
}

export function hydratePermissionProfiles(storedProfiles) {
  const profiles = Array.isArray(storedProfiles) && storedProfiles.length ? storedProfiles : defaultPermissionProfiles;
  const normalizedDefaults = defaultPermissionProfiles.map((profile) => ({
    ...profile,
    id: String(profile.id || profile.name || "").trim(),
    name: String(profile.name || "").trim(),
    description: String(profile.description || "").trim(),
    status: String(profile.status || "Ativo").trim() || "Ativo",
    permissions: profile.permissions === "ALL" ? "ALL" : Array.isArray(profile.permissions) ? profile.permissions.filter(Boolean) : [],
  }));
  const normalizedStored = profiles.map((profile) => ({
    ...profile,
    id: String(profile.id || profile.name || "").trim(),
    name: String(profile.name || "").trim(),
    description: String(profile.description || "").trim(),
    status: String(profile.status || "Ativo").trim() || "Ativo",
    permissions: profile.permissions === "ALL" ? "ALL" : Array.isArray(profile.permissions) ? profile.permissions.filter(Boolean) : [],
  }));

  return normalizedDefaults
    .map((defaultProfile) => {
      const storedProfile =
        normalizedStored.find((profile) => profile.id === defaultProfile.id) ||
        normalizedStored.find((profile) => profile.name === defaultProfile.name) ||
        null;
      if (!storedProfile) return applyProfilePermissionBackfill(defaultProfile);
      return applyProfilePermissionBackfill({
        ...defaultProfile,
        ...storedProfile,
        permissions: storedProfile.permissions === "ALL" ? "ALL" : [...(storedProfile.permissions || [])],
      });
    })
    .concat(normalizedStored.filter((profile) => !normalizedDefaults.some((candidate) => candidate.id === profile.id)))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function normalizePermissionOverrideMap(rawMap = {}, permissionCatalog = defaultPermissionCatalog) {
  const validKeys = new Set(listPermissionKeys(permissionCatalog));
  return Object.entries(rawMap || {}).reduce((accumulator, [key, value]) => {
    if (!validKeys.has(key) || value === undefined) return accumulator;
    return { ...accumulator, [key]: Boolean(value) };
  }, {});
}

export function normalizeUserPermissions(
  rawPermissions = {},
  user = {},
  permissionCatalog = defaultPermissionCatalog,
  permissionProfiles = defaultPermissionProfiles,
) {
  const profile = getUserPermissionProfile(user, permissionProfiles);
  const nextPermissions = {
    ...buildPermissionsFromKeys(profile?.permissions || [], permissionCatalog),
  };
  const permissionKeys = listPermissionKeys(permissionCatalog);
  const hasProfileLink = Boolean(String(user.permissionProfileId || "").trim());
  const hasUserOverrides =
    Object.keys(user.additionalPermissions || {}).length > 0 || Object.keys(user.restrictedPermissions || {}).length > 0;
  const shouldApplyExplicitPermissionMap = !hasProfileLink && !hasUserOverrides;

  if (shouldApplyExplicitPermissionMap) {
    let hasExplicitPermission = false;
    permissionKeys.forEach((key) => {
      if (rawPermissions[key] !== undefined) {
        nextPermissions[key] = Boolean(rawPermissions[key]);
        hasExplicitPermission = true;
      }
    });

    if (hasExplicitPermission) {
      return nextPermissions;
    }
  }

  if (!Object.keys(rawPermissions || {}).length) {
    return nextPermissions;
  }

  if (rawPermissions.dashboard) nextPermissions.dashboard_view = true;

  if (rawPermissions.helpdesk_view) {
    nextPermissions.helpdesk_indicators_view = true;
    nextPermissions.sla_alerts_view = true;
  }

  if (rawPermissions.technicians_view) {
    nextPermissions.technicians_performance_view = true;
    nextPermissions.technicians_workload_view = true;
  }

  if (rawPermissions.tickets_view) {
    nextPermissions.tickets_view_own = true;
    if (isTechnologyDepartment(user)) nextPermissions.tickets_view_all = true;
  }

  if (rawPermissions.tickets_manage) {
    [
      "tickets_create",
      "tickets_edit",
      "tickets_delete",
      "tickets_close",
      "tickets_reopen",
      "tickets_change_priority",
      "tickets_change_status",
      "tickets_assign",
      "tickets_export",
    ].forEach((key) => {
      if (key in nextPermissions) nextPermissions[key] = true;
    });
  }

  if (rawPermissions.users_view) nextPermissions.users_view = true;

  if (rawPermissions.users_manage) {
    [
      "users_view",
      "users_create",
      "users_edit",
      "users_delete",
      "users_reset_password",
      "users_manage_permissions",
      "users_admin",
    ].forEach((key) => {
      if (key in nextPermissions) nextPermissions[key] = true;
    });
  }

  if (rawPermissions.assets_view) {
    if ("assets_view" in nextPermissions) nextPermissions.assets_view = true;
    if ("inventory_view" in nextPermissions) nextPermissions.inventory_view = true;
  }

  if (rawPermissions.assets_manage) {
    [
      "assets_view",
      "assets_create",
      "assets_edit",
      "assets_delete",
      "assets_move",
      "assets_link_users",
      "assets_export",
      "assets_admin",
      "inventory_view",
      "inventory_create",
      "inventory_edit",
      "inventory_delete",
      "inventory_move_stock",
      "inventory_export",
      "inventory_admin",
      "brands_models_view",
      "brands_models_create",
      "brands_models_edit",
      "brands_models_delete",
      "brands_models_admin",
    ].forEach((key) => {
      if (key in nextPermissions) nextPermissions[key] = true;
    });
  }

  if (rawPermissions.projects_view && "projects_view" in nextPermissions) nextPermissions.projects_view = true;

  if (rawPermissions.projects_manage) {
    [
      "projects_view",
      "projects_create",
      "projects_edit",
      "projects_delete",
      "projects_manage_tasks",
      "projects_export",
      "projects_admin",
    ].forEach((key) => {
      if (key in nextPermissions) nextPermissions[key] = true;
    });
  }

  if (rawPermissions.knowledge_view && "knowledge_view" in nextPermissions) nextPermissions.knowledge_view = true;

  if (rawPermissions.knowledge_manage) {
    [
      "knowledge_view",
      "knowledge_create",
      "knowledge_edit",
      "knowledge_inactivate",
      "knowledge_delete",
      "knowledge_admin",
    ].forEach((key) => {
      if (key in nextPermissions) nextPermissions[key] = true;
    });
  }

  if (rawPermissions.api_view && "api_rest_view" in nextPermissions) nextPermissions.api_rest_view = true;

  if (rawPermissions.api_manage) {
    [
      "api_rest_view",
      "api_rest_generate_tokens",
      "api_rest_revoke_tokens",
      "api_rest_configure_integrations",
      "api_rest_admin",
    ].forEach((key) => {
      if (key in nextPermissions) nextPermissions[key] = true;
    });
  }

  const additionalPermissions = normalizePermissionOverrideMap(user.additionalPermissions, permissionCatalog);
  Object.entries(additionalPermissions).forEach(([key, value]) => {
    if (value) nextPermissions[key] = true;
  });

  const restrictedPermissions = normalizePermissionOverrideMap(user.restrictedPermissions, permissionCatalog);
  Object.entries(restrictedPermissions).forEach(([key, value]) => {
    if (value) nextPermissions[key] = false;
  });

  return nextPermissions;
}

export function hasPermission(user, permissionKey) {
  if (normalizeText(user?.status || "Ativo") !== "ativo") return false;
  return Boolean(user?.permissions?.[permissionKey]);
}

export function hasAnyPermission(user, permissionKeys = []) {
  return (Array.isArray(permissionKeys) ? permissionKeys : []).some((permissionKey) => hasPermission(user, permissionKey));
}

export function getModuleConfig(moduleKey, permissionCatalog = defaultPermissionCatalog) {
  return (Array.isArray(permissionCatalog) ? permissionCatalog : []).find((module) => module.module === moduleKey) || null;
}

export function canAccessModule(user, moduleConfigOrKey, permissionCatalog = defaultPermissionCatalog) {
  const moduleConfig =
    typeof moduleConfigOrKey === "string"
      ? getModuleConfig(moduleConfigOrKey, permissionCatalog)
      : moduleConfigOrKey;
  if (!moduleConfig) return false;
  if (moduleConfig.departmentScope === "ti" && !isTechnologyDepartment(user)) return false;
  return hasAnyPermission(user, moduleConfig.accessKeys || []);
}

export function canViewOwnTickets(user) {
  return hasAnyPermission(user, ["tickets_view_own", "tickets_view_all", "tickets_admin"]);
}

export function canViewAllTickets(user) {
  return isTechnologyDepartment(user) && hasAnyPermission(user, ["tickets_view_all", "tickets_admin"]);
}

export function isTechnologyDepartment(user) {
  return normalizeText(user?.department) === "ti";
}

export function getUserHomePath(user, navigationSections = defaultNavigationSections, permissionCatalog = defaultPermissionCatalog) {
  const availableItem =
    (Array.isArray(navigationSections) ? navigationSections : [])
      .flatMap((section) => (Array.isArray(section.items) ? section.items : []))
      .find((item) => canAccessModule(user, item.module, permissionCatalog)) || null;
  return availableItem?.to || "/app/dashboard";
}

export function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
