export const permissionGroups = [
  {
    module: "dashboard",
    label: "Dashboard",
    viewPermissions: ["dashboard_view"],
    permissions: [{ key: "dashboard_view", label: "Visualizar" }],
  },
  {
    module: "tickets",
    label: "Chamados",
    viewPermissions: ["tickets_view_own", "tickets_view_all", "tickets_admin"],
    permissions: [
      { key: "tickets_view_own", label: "Visualizar próprios chamados" },
      { key: "tickets_view_all", label: "Visualizar todos chamados" },
      { key: "tickets_create", label: "Criar chamado" },
      { key: "tickets_edit", label: "Editar chamado" },
      { key: "tickets_delete", label: "Excluir chamado" },
      { key: "tickets_close", label: "Encerrar chamado" },
      { key: "tickets_reopen", label: "Reabrir chamado" },
      { key: "tickets_change_priority", label: "Alterar prioridade" },
      { key: "tickets_change_status", label: "Alterar status" },
      { key: "tickets_assign", label: "Atribuir chamado" },
      { key: "tickets_export", label: "Exportar chamados" },
      { key: "tickets_admin", label: "Administrar chamados" },
    ],
  },
  {
    module: "assets",
    label: "Ativos",
    viewPermissions: ["assets_view", "assets_admin"],
    permissions: [
      { key: "assets_view", label: "Visualizar" },
      { key: "assets_create", label: "Criar" },
      { key: "assets_edit", label: "Editar" },
      { key: "assets_delete", label: "Excluir" },
      { key: "assets_move", label: "Movimentar ativos" },
      { key: "assets_link_users", label: "Vincular usuários" },
      { key: "assets_export", label: "Exportar" },
      { key: "assets_admin", label: "Administrar" },
    ],
  },
  {
    module: "inventory",
    label: "Inventário",
    viewPermissions: ["inventory_view", "inventory_admin"],
    permissions: [
      { key: "inventory_view", label: "Visualizar" },
      { key: "inventory_create", label: "Criar inventário" },
      { key: "inventory_edit", label: "Editar inventário" },
      { key: "inventory_delete", label: "Excluir inventário" },
      { key: "inventory_move_stock", label: "Movimentar estoque" },
      { key: "inventory_export", label: "Exportar" },
      { key: "inventory_admin", label: "Administrar" },
    ],
  },
  {
    module: "brands_models",
    label: "Marcas e Modelos",
    viewPermissions: ["brands_models_view", "brands_models_admin"],
    permissions: [
      { key: "brands_models_view", label: "Visualizar" },
      { key: "brands_models_create", label: "Criar" },
      { key: "brands_models_edit", label: "Editar" },
      { key: "brands_models_delete", label: "Excluir" },
      { key: "brands_models_admin", label: "Administrar" },
    ],
  },
  {
    module: "projects",
    label: "Projetos",
    viewPermissions: ["projects_view", "projects_admin"],
    permissions: [
      { key: "projects_view", label: "Visualizar" },
      { key: "projects_create", label: "Criar" },
      { key: "projects_edit", label: "Editar" },
      { key: "projects_delete", label: "Excluir" },
      { key: "projects_manage_tasks", label: "Gerenciar tarefas" },
      { key: "projects_export", label: "Exportar" },
      { key: "projects_admin", label: "Administrar" },
    ],
  },
  {
    module: "knowledge",
    label: "Base de Conhecimento",
    viewPermissions: ["knowledge_view", "knowledge_admin"],
    permissions: [
      { key: "knowledge_view", label: "Visualizar" },
      { key: "knowledge_create", label: "Criar artigo" },
      { key: "knowledge_edit", label: "Editar artigo" },
      { key: "knowledge_delete", label: "Excluir artigo" },
      { key: "knowledge_admin", label: "Administrar base" },
    ],
  },
  {
    module: "api_rest",
    label: "API REST",
    viewPermissions: ["api_rest_view", "api_rest_admin"],
    permissions: [
      { key: "api_rest_view", label: "Visualizar" },
      { key: "api_rest_generate_tokens", label: "Gerar tokens" },
      { key: "api_rest_revoke_tokens", label: "Revogar tokens" },
      { key: "api_rest_configure_integrations", label: "Configurar integrações" },
      { key: "api_rest_admin", label: "Administrar API" },
    ],
  },
  {
    module: "users",
    label: "Usuários",
    viewPermissions: ["users_view", "users_admin"],
    permissions: [
      { key: "users_view", label: "Visualizar" },
      { key: "users_create", label: "Criar usuário" },
      { key: "users_edit", label: "Editar usuário" },
      { key: "users_delete", label: "Excluir usuário" },
      { key: "users_reset_password", label: "Resetar senha" },
      { key: "users_manage_permissions", label: "Gerenciar permissões" },
      { key: "users_admin", label: "Administrar usuários" },
    ],
  },
];

export const moduleNavigation = [
  { to: "/app/dashboard", label: "Dashboard", module: "dashboard" },
  { to: "/app/tickets", label: "Chamados", module: "tickets" },
  { to: "/app/assets", label: "Ativos", module: "assets" },
  { to: "/app/inventory", label: "Inventário", module: "inventory" },
  { to: "/app/brands-models", label: "Marcas e Modelos", module: "brands_models" },
  { to: "/app/projects", label: "Projetos", module: "projects" },
  { to: "/app/knowledge", label: "Base de Conhecimento", module: "knowledge" },
  { to: "/app/api-rest", label: "API REST", module: "api_rest" },
  { to: "/app/users", label: "Usuários", module: "users" },
];

const allPermissionKeys = permissionGroups.flatMap((group) => group.permissions.map((permission) => permission.key));

function buildPermissionMap() {
  return allPermissionKeys.reduce((accumulator, key) => ({ ...accumulator, [key]: false }), {});
}

export const emptyPermissions = buildPermissionMap();

function setPermissions(keys) {
  return keys.reduce((accumulator, key) => ({ ...accumulator, [key]: true }), { ...emptyPermissions });
}

const roleAliases = {
  Administrador: "Administrador da Plataforma",
  Analista: "Analista de Service Desk",
  Especialista: "Especialista de Infraestrutura",
  Coordenador: "Gestor de Area",
  Coordenadora: "Gestor de Area",
  Solicitante: "Solicitante Interno",
};

export function normalizeRoleName(role) {
  const sanitizedRole = String(role || "").trim();
  return roleAliases[sanitizedRole] || sanitizedRole || "Solicitante Interno";
}

export const roleProfiles = [
  {
    name: "Administrador da Plataforma",
    description: "Controle total da plataforma, acessos, configuracoes e operacao.",
    permissions: setPermissions(allPermissionKeys),
  },
  {
    name: "Gestor de TI",
    description: "Acompanha a operacao, gerencia chamados, ativos, projetos e usuarios.",
    permissions: setPermissions([
      "dashboard_view",
      "tickets_view_own",
      "tickets_view_all",
      "tickets_create",
      "tickets_edit",
      "tickets_close",
      "tickets_reopen",
      "tickets_change_priority",
      "tickets_change_status",
      "tickets_assign",
      "tickets_export",
      "assets_view",
      "assets_create",
      "assets_edit",
      "assets_move",
      "assets_link_users",
      "assets_export",
      "inventory_view",
      "inventory_create",
      "inventory_edit",
      "inventory_move_stock",
      "inventory_export",
      "brands_models_view",
      "brands_models_create",
      "brands_models_edit",
      "projects_view",
      "projects_create",
      "projects_edit",
      "projects_manage_tasks",
      "projects_export",
      "knowledge_view",
      "knowledge_create",
      "knowledge_edit",
      "knowledge_delete",
      "api_rest_view",
      "api_rest_generate_tokens",
      "api_rest_revoke_tokens",
      "users_view",
      "users_create",
      "users_edit",
      "users_reset_password",
    ]),
  },
  {
    name: "Analista de Service Desk",
    description: "Opera a fila de atendimento, tratamento, atribuicao e fechamento de chamados.",
    permissions: setPermissions([
      "dashboard_view",
      "tickets_view_own",
      "tickets_view_all",
      "tickets_create",
      "tickets_edit",
      "tickets_close",
      "tickets_reopen",
      "tickets_change_priority",
      "tickets_change_status",
      "tickets_assign",
      "tickets_export",
      "assets_view",
      "inventory_view",
      "knowledge_view",
      "knowledge_create",
      "projects_view",
    ]),
  },
  {
    name: "Especialista de Infraestrutura",
    description: "Atua em incidentes tecnicos e administra ativos, inventario e catalogo tecnico.",
    permissions: setPermissions([
      "dashboard_view",
      "tickets_view_own",
      "tickets_view_all",
      "tickets_create",
      "tickets_edit",
      "tickets_close",
      "tickets_reopen",
      "tickets_change_priority",
      "tickets_change_status",
      "tickets_assign",
      "assets_view",
      "assets_create",
      "assets_edit",
      "assets_move",
      "assets_link_users",
      "assets_export",
      "inventory_view",
      "inventory_create",
      "inventory_edit",
      "inventory_move_stock",
      "inventory_export",
      "brands_models_view",
      "brands_models_create",
      "brands_models_edit",
      "knowledge_view",
      "projects_view",
    ]),
  },
  {
    name: "Gestor de Area",
    description: "Acompanha chamados da area, indicadores e projetos, sem administracao tecnica.",
    permissions: setPermissions([
      "dashboard_view",
      "tickets_view_own",
      "tickets_create",
      "knowledge_view",
      "projects_view",
    ]),
  },
  {
    name: "Solicitante Interno",
    description: "Abre e acompanha os proprios chamados.",
    permissions: setPermissions(["dashboard_view", "tickets_view_own", "tickets_create"]),
  },
];

export function getRoleProfile(role) {
  const normalizedRole = normalizeRoleName(role);
  return roleProfiles.find((profile) => profile.name === normalizedRole) || roleProfiles[roleProfiles.length - 1];
}

export function getRolePermissions(role) {
  return { ...getRoleProfile(role).permissions };
}

export function hasPermission(user, permissionKey) {
  return Boolean(user?.permissions?.[permissionKey]);
}

export function hasAnyPermission(user, permissionKeys) {
  return permissionKeys.some((permissionKey) => hasPermission(user, permissionKey));
}

export function canAccessModule(user, moduleKey) {
  const permissionGroup = permissionGroups.find((group) => group.module === moduleKey);
  if (!permissionGroup) return false;
  return hasAnyPermission(user, permissionGroup.viewPermissions);
}

export function canViewOwnTickets(user) {
  return hasAnyPermission(user, ["tickets_view_own", "tickets_view_all", "tickets_admin"]);
}

export function canViewAllTickets(user) {
  return user?.department === "TI" && hasAnyPermission(user, ["tickets_view_all", "tickets_admin"]);
}

export function getUserHomePath(user) {
  return moduleNavigation.find((item) => canAccessModule(user, item.module))?.to || "/app/dashboard";
}

export function normalizeUserPermissions(rawPermissions = {}, user = {}) {
  const nextPermissions = { ...getRolePermissions(user.role) };
  let hasExplicitPermission = false;

  allPermissionKeys.forEach((key) => {
    if (rawPermissions[key] !== undefined) {
      nextPermissions[key] = Boolean(rawPermissions[key]);
      hasExplicitPermission = true;
    }
  });

  if (!hasExplicitPermission && !Object.keys(rawPermissions || {}).length) {
    return nextPermissions;
  }

  if (rawPermissions.dashboard) nextPermissions.dashboard_view = true;

  if (rawPermissions.tickets_view) {
    nextPermissions.tickets_view_own = true;
    if (user.department === "TI") {
      nextPermissions.tickets_view_all = true;
    }
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
      nextPermissions[key] = true;
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
      nextPermissions[key] = true;
    });
  }

  if (rawPermissions.assets_view) {
    nextPermissions.assets_view = true;
    nextPermissions.inventory_view = true;
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
      nextPermissions[key] = true;
    });
  }

  if (rawPermissions.projects_view) nextPermissions.projects_view = true;

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
      nextPermissions[key] = true;
    });
  }

  if (rawPermissions.knowledge_view) nextPermissions.knowledge_view = true;

  if (rawPermissions.knowledge_manage) {
    [
      "knowledge_view",
      "knowledge_create",
      "knowledge_edit",
      "knowledge_delete",
      "knowledge_admin",
    ].forEach((key) => {
      nextPermissions[key] = true;
    });
  }

  if (rawPermissions.api_view) nextPermissions.api_rest_view = true;

  if (rawPermissions.api_manage) {
    [
      "api_rest_view",
      "api_rest_generate_tokens",
      "api_rest_revoke_tokens",
      "api_rest_configure_integrations",
      "api_rest_admin",
    ].forEach((key) => {
      nextPermissions[key] = true;
    });
  }

  return nextPermissions;
}

export const defaultPermissions = setPermissions(["dashboard_view", "tickets_view_own"]);

export const analystPermissions = setPermissions([
  "dashboard_view",
  "tickets_view_own",
  "tickets_view_all",
  "tickets_create",
  "tickets_edit",
  "tickets_delete",
  "tickets_close",
  "tickets_reopen",
  "tickets_change_priority",
  "tickets_change_status",
  "tickets_assign",
  "tickets_export",
  "assets_view",
  "inventory_view",
  "knowledge_view",
  "projects_view",
]);

export const adminPermissions = setPermissions(allPermissionKeys);
