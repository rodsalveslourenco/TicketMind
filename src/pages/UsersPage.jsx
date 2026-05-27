import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useAppData } from "../data/AppDataContext";
import { hasAnyPermission, normalizeText } from "../data/permissions";
import { exportRowsWithFormat, getExportFormatLabel } from "../lib/export";
import { useUiPreferences } from "../ui/UiPreferencesContext";

function getInitials(name) {
  return String(name || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "U";
}

function readImageFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Nao foi possivel ler a imagem selecionada."));
    reader.readAsDataURL(file);
  });
}

function maskPassword(password) {
  const normalizedPassword = String(password || "");
  if (!normalizedPassword) return "Sem senha definida";
  return "*".repeat(Math.max(normalizedPassword.length, 8));
}

function normalizePasswordSeed(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .trim();
}

function generatePasswordFromName(name) {
  const normalized = normalizePasswordSeed(name);
  const [firstName = "usuario", lastName = "ticketmind"] = normalized.split(/\s+/).filter(Boolean);
  const base = `${firstName.slice(0, 1).toUpperCase()}${firstName.slice(1).toLowerCase()}${lastName.slice(0, 1).toUpperCase()}${lastName.slice(1).toLowerCase()}`;
  const suffix = new Date().getFullYear().toString().slice(-2);
  return `${base}${suffix}#`;
}

function createOverrideMap(permissionCatalog) {
  const uniqueKeys = Array.from(
    new Set(
      permissionCatalog.flatMap((group) => (Array.isArray(group.permissions) ? group.permissions : []).map((permission) => permission.key)),
    ),
  );
  return uniqueKeys.reduce((accumulator, key) => ({ ...accumulator, [key]: false }), {});
}

function createDefaultUserForm(permissionProfiles, permissionCatalog) {
  const defaultProfile =
    permissionProfiles.find((profile) => normalizeText(profile.name) === "solicitante interno") ||
    permissionProfiles.find((profile) => profile.status !== "Inativo") ||
    permissionProfiles[0] ||
    null;

  return {
    name: "",
    email: "",
    password: "",
    passwordReveal: "",
    mustChangePassword: false,
    status: "Ativo",
    role: defaultProfile?.name || "Solicitante Interno",
    permissionProfileId: defaultProfile?.id || "",
    team: "",
    departmentId: "",
    department: "",
    avatar: "",
    additionalPermissions: createOverrideMap(permissionCatalog),
    restrictedPermissions: createOverrideMap(permissionCatalog),
  };
}

function buildOverrideForm(rawMap = {}, permissionCatalog = []) {
  return {
    ...createOverrideMap(permissionCatalog),
    ...(rawMap || {}),
  };
}

const USER_GRID_COLUMNS = [
  { key: "name", label: "Usuario", defaultVisible: true, render: (candidate) => candidate.name || "-" },
  { key: "email", label: "Login", defaultVisible: true, render: (candidate) => candidate.email || "Sem email definido" },
  { key: "status", label: "Status", defaultVisible: true, render: (candidate) => candidate.status || "-" },
  { key: "role", label: "Perfil", defaultVisible: true, render: (candidate) => candidate.role || "Sem perfil" },
  { key: "team", label: "Equipe", defaultVisible: true, render: (candidate) => candidate.team || "Sem equipe" },
  { key: "department", label: "Departamento", defaultVisible: true, render: (candidate) => candidate.department || "Sem departamento" },
  { key: "permissionCount", label: "Acessos", defaultVisible: false, render: (_candidate, activePermissionCount) => activePermissionCount },
  { key: "id", label: "Identificador", defaultVisible: false, render: (candidate) => candidate.id || "-" },
];

function loadUserGridColumns() {
  return USER_GRID_COLUMNS.filter((column) => column.defaultVisible).map((column) => column.key);
}

function UsersPage() {
  const { user } = useAuth();
  const { getModulePreference, setModulePreference } = useUiPreferences();
  const {
    addUser,
    deleteUser,
    departments,
    duplicateUser,
    permissionCatalog,
    permissionProfiles,
    pushToast,
    setUserStatus,
    teams,
    updateUser,
    users,
  } = useAppData();

  const [search, setSearch] = useState(() => getModulePreference("users", "search", ""));
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [detailUserId, setDetailUserId] = useState(null);
  const [editingUserId, setEditingUserId] = useState(null);
  const [revealedUserIds, setRevealedUserIds] = useState([]);
  const [showGridConfig, setShowGridConfig] = useState(false);
  const [showExcluded, setShowExcluded] = useState(() => Boolean(getModulePreference("users", "showExcluded", false)));
  const [visibleColumns, setVisibleColumns] = useState(() => getModulePreference("users", "visibleColumns", loadUserGridColumns()));
  const [form, setForm] = useState(() => createDefaultUserForm(permissionProfiles, permissionCatalog));

  const canRevealPasswords = normalizeText(user?.department) === "ti";
  const canViewUsers = hasAnyPermission(user, ["users_view", "users_admin"]);
  const canCreateUsers = hasAnyPermission(user, ["users_create", "users_admin"]);
  const canEditUsers = hasAnyPermission(user, ["users_edit", "users_admin"]);
  const canDeleteUsers = hasAnyPermission(user, ["users_delete", "users_admin"]);
  const canResetPasswords = hasAnyPermission(user, ["users_reset_password", "users_admin"]);
  const canManagePermissions = hasAnyPermission(user, ["users_manage_permissions", "users_admin"]);

  useEffect(() => {
    setModulePreference("users", "visibleColumns", visibleColumns);
  }, [setModulePreference, visibleColumns]);

  useEffect(() => {
    setModulePreference("users", "search", search);
  }, [search, setModulePreference]);

  useEffect(() => {
    setModulePreference("users", "showExcluded", showExcluded);
  }, [setModulePreference, showExcluded]);

  useEffect(() => {
    const nextVisibleColumns = getModulePreference("users", "visibleColumns", loadUserGridColumns());
    setVisibleColumns(Array.isArray(nextVisibleColumns) && nextVisibleColumns.length ? nextVisibleColumns : loadUserGridColumns());
    setSearch(String(getModulePreference("users", "search", "")));
    setShowExcluded(Boolean(getModulePreference("users", "showExcluded", false)));
  }, [getModulePreference, user?.id]);

  const activeProfiles = useMemo(
    () => permissionProfiles.filter((profile) => profile.status !== "Inativo" || profile.id === form.permissionProfileId),
    [permissionProfiles, form.permissionProfileId],
  );

  const availableDepartments = useMemo(
    () => departments.filter((department) => department.status === "Ativo" || department.id === form.departmentId),
    [departments, form.departmentId],
  );
  const availableTeams = useMemo(
    () =>
      (teams || []).filter((team) => team.status === "Ativo" || normalizeText(team.name) === normalizeText(form.team)),
    [form.team, teams],
  );

  const matchingUsers = useMemo(() => {
    const normalizedSearch = normalizeText(search);
    return users
      .slice()
      .sort((left, right) => left.name.localeCompare(right.name))
      .filter((candidate) =>
        !normalizedSearch
          ? true
          : [candidate.name, candidate.email, candidate.team, candidate.role, candidate.department, candidate.status]
              .join(" ")
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .toLowerCase()
              .includes(normalizedSearch),
      );
  }, [search, users]);

  const orderedUsers = useMemo(
    () => matchingUsers.filter((candidate) => showExcluded || candidate.status !== "Excluido"),
    [matchingUsers, showExcluded],
  );

  const detailUser = users.find((candidate) => candidate.id === detailUserId) || null;
  const selectedProfile = permissionProfiles.find((profile) => profile.id === form.permissionProfileId) || permissionProfiles[0] || null;
  const visibleGridColumns = useMemo(
    () => USER_GRID_COLUMNS.filter((column) => visibleColumns.includes(column.key)),
    [visibleColumns],
  );
  const detailDirtyFields = useMemo(() => {
    if (!detailUser) return {};
    return {
      name: String(form.name || "") !== String(detailUser.name || ""),
      email: String(form.email || "") !== String(detailUser.email || ""),
      password: String(form.password || "") !== String(detailUser.passwordReveal || ""),
      mustChangePassword: Boolean(form.mustChangePassword) !== Boolean(detailUser.mustChangePassword),
      status: String(form.status || "") !== String(detailUser.status || ""),
      permissionProfileId: String(form.permissionProfileId || "") !== String(detailUser.permissionProfileId || ""),
      team: String(form.team || "") !== String(detailUser.team || ""),
      departmentId: String(form.departmentId || "") !== String(detailUser.departmentId || ""),
      avatar: String(form.avatar || "") !== String(detailUser.avatar || ""),
    };
  }, [detailUser, form]);

  const permissionGroups = useMemo(
    () =>
      permissionCatalog.map((group) => ({
        ...group,
        permissions: (group.permissions || []).filter(
          (permission, index, collection) => collection.findIndex((candidate) => candidate.key === permission.key) === index,
        ),
      })),
    [permissionCatalog],
  );

  const updateField = (field) => (event) => {
    const nextValue = event.target.type === "checkbox" ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [field]: nextValue }));
  };

  const updateDepartmentField = (event) => {
    const nextDepartment = departments.find((department) => department.id === event.target.value);
    setForm((current) => ({
      ...current,
      departmentId: nextDepartment?.id || "",
      department: nextDepartment?.name || "",
    }));
  };

  const updateProfileField = (event) => {
    const nextProfile = permissionProfiles.find((profile) => profile.id === event.target.value) || null;
    setForm((current) => ({
      ...current,
      permissionProfileId: nextProfile?.id || "",
      role: nextProfile?.name || current.role,
    }));
  };

  const updateOverrideField = (overrideField, permissionKey) => (event) => {
    setForm((current) => ({
      ...current,
      [overrideField]: {
        ...current[overrideField],
        [permissionKey]: event.target.checked,
      },
    }));
  };

  const resetForm = () => {
    setForm(createDefaultUserForm(permissionProfiles, permissionCatalog));
    setEditingUserId(null);
  };

  const populateForm = (candidate) => {
    setEditingUserId(candidate.id);
    setForm({
      name: candidate.name || "",
      email: candidate.email || "",
      password: candidate.passwordReveal || "",
      passwordReveal: candidate.passwordReveal || "",
      mustChangePassword: Boolean(candidate.mustChangePassword),
      status: candidate.status || "Ativo",
      role: candidate.role || "",
      permissionProfileId: candidate.permissionProfileId || "",
      team: candidate.team || "",
      departmentId: candidate.departmentId || "",
      department: candidate.department || "",
      avatar: candidate.avatar || "",
      additionalPermissions: buildOverrideForm(candidate.additionalPermissions, permissionCatalog),
      restrictedPermissions: buildOverrideForm(candidate.restrictedPermissions, permissionCatalog),
    });
  };

  const handleExport = (format = "csv") => {
    if (!orderedUsers.length) {
      pushToast("Sem dados", "Nao ha usuarios para exportar.", "warning");
      return;
    }
    exportRowsWithFormat({
      format,
      fileName: `ticketmind-usuarios-${new Date().toISOString().slice(0, 10)}.csv`,
      title: "Relatorio de usuarios",
      columns: [
        { key: "name", label: "Usuario" },
        { key: "email", label: "Email" },
        { key: "status", label: "Status" },
        { key: "role", label: "Perfil" },
        { key: "team", label: "Equipe" },
        { key: "department", label: "Departamento" },
      ],
      items: orderedUsers,
    });
    pushToast("Exportacao concluida", `${orderedUsers.length} usuario(s) preparados em ${getExportFormatLabel(format)}.`);
  };

  const openCreateModal = () => {
    if (!canCreateUsers) return;
    resetForm();
    setShowCreateModal(true);
  };

  const openDetailModal = (candidate) => {
    populateForm(candidate);
    setDetailUserId(candidate.id);
  };

  const handleAvatarChange = async (event) => {
    const [file] = Array.from(event.target.files || []);
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      pushToast("Arquivo invalido", "Selecione uma imagem valida para a foto do usuario.", "warning");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      pushToast("Arquivo muito grande", "Use uma imagem com ate 2 MB.", "warning");
      return;
    }

    try {
      const avatar = await readImageFileAsDataUrl(file);
      setForm((current) => ({ ...current, avatar }));
    } catch (error) {
      pushToast("Falha ao carregar foto", error.message, "warning");
    }
  };

  const handleGeneratePassword = () => {
    const generatedPassword = generatePasswordFromName(form.name || form.email || "usuario");
    setForm((current) => ({
      ...current,
      password: generatedPassword,
      passwordReveal: generatedPassword,
      mustChangePassword: true,
    }));
    pushToast("Senha gerada", "Senha inicial criada com base no nome do usuario.");
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (editingUserId) {
      if (!(canEditUsers || canResetPasswords || canManagePermissions)) return;
    } else if (!canCreateUsers) {
      return;
    }

    if (!form.name.trim()) {
      pushToast("Campos obrigatorios", "Preencha o nome do usuario.", "warning");
      return;
    }

    if (!editingUserId && !String(form.password || "").trim()) {
      pushToast("Senha obrigatoria", "Informe uma senha inicial para o novo usuario.", "warning");
      return;
    }

    if (!form.permissionProfileId) {
      pushToast("Perfil obrigatorio", "Selecione um perfil de permissao para o usuario.", "warning");
      return;
    }

    const normalizedEmail = normalizeText(form.email);
    const duplicatedUser = users.find(
      (candidate) => normalizedEmail && normalizeText(candidate.email) === normalizedEmail && candidate.id !== editingUserId,
    );
    if (duplicatedUser) {
      pushToast("Email ja cadastrado", duplicatedUser.email, "warning");
      return;
    }

    const selectedDepartment = departments.find((department) => department.id === form.departmentId);
    const selectedPermissionProfile = permissionProfiles.find((profile) => profile.id === form.permissionProfileId) || null;
    const payload = {
      ...form,
      passwordReveal: String(form.password || ""),
      role: selectedPermissionProfile?.name || form.role,
      departmentId: selectedDepartment?.id || "",
      department: selectedDepartment?.name || "",
      mustChangePassword: Boolean(form.mustChangePassword),
    };

    if (editingUserId) {
      updateUser(editingUserId, payload);
      pushToast("Usuario atualizado", form.name);
    } else {
      addUser(payload);
      pushToast("Usuario cadastrado", form.name);
    }

    setShowCreateModal(false);
    setDetailUserId(null);
    resetForm();
  };

  const togglePassword = (userId) => {
    if (!canRevealPasswords) return;
    setRevealedUserIds((current) =>
      current.includes(userId) ? current.filter((item) => item !== userId) : [...current, userId],
    );
  };

  const handleDeleteUser = (candidate) => {
    if (!canDeleteUsers || !candidate) return;
    if (candidate.id === user?.id) {
      pushToast("Operacao bloqueada", "Nao e permitido excluir o usuario logado.", "warning");
      return;
    }
    if (!window.confirm(`Confirma a exclusao logica de ${candidate.name}?`)) return;
    deleteUser(candidate.id);
    setDetailUserId(null);
    pushToast("Usuario excluido", `${candidate.name} movido para exclusao logica.`);
  };

  const handleDuplicateUser = (candidate) => {
    if (!canCreateUsers) return;
    const duplicated = duplicateUser(candidate.id);
    if (!duplicated) return;
    pushToast("Usuario duplicado", `${duplicated.name} criado em modo inativo e sem senha definida.`);
    openDetailModal(duplicated);
  };

  const toggleGridColumn = (columnKey) => {
    setVisibleColumns((current) => {
      if (current.includes(columnKey)) {
        return current.length > 1 ? current.filter((key) => key !== columnKey) : current;
      }
      return [...current, columnKey];
    });
  };

  const activePermissionCount = (candidate) =>
    permissionCatalog.flatMap((group) => group.permissions).filter((permission) => candidate.permissions?.[permission.key]).length;

  if (!canViewUsers) {
    return <Navigate replace to="/app/dashboard" />;
  }

  const renderOverrideSection = (title, field, toneClass = "badge-neutral") => (
    <section className="permission-override-card board-card">
      <div className="permission-group-head">
        <strong>{title}</strong>
        <span>{field === "additionalPermissions" ? "Concede acessos extras ao perfil principal." : "Bloqueia acessos herdados do perfil principal."}</span>
      </div>
      <div className="permissions-panel permissions-panel-refined">
        {permissionGroups.map((group) => (
          <section className="permission-group permission-group-refined" key={`${field}-${group.module}`}>
            <div className="permission-group-head">
              <strong>{group.label}</strong>
              <span>{group.description}</span>
            </div>
            <div className="permissions-list permissions-list-compact">
              {group.permissions.map((permission) => (
                <label className="permission-item permission-item-compact" key={`${field}-${permission.key}`}>
                  <input
                    checked={Boolean(form[field][permission.key])}
                    disabled={!canManagePermissions}
                    onChange={updateOverrideField(field, permission.key)}
                    type="checkbox"
                  />
                  <span>{permission.label}</span>
                  <small className={`badge ${toneClass}`}>{permission.action}</small>
                </label>
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );

  return (
    <div className="users-page">
      <section className="module-hero board-card">
        <div>
          <span className="eyebrow">Configuracoes</span>
          <h2>Usuarios</h2>
          <p className="module-caption">Gestao de contas, status operacionais, perfil principal e excecoes de acesso.</p>
        </div>
        <div className="insight-strip">
          <div className="insight-chip">
            <strong>{orderedUsers.length}</strong>
            <span>usuarios no recorte</span>
          </div>
          <div className="insight-chip">
            <strong>{orderedUsers.filter((candidate) => candidate.status === "Ativo").length}</strong>
            <span>usuarios ativos</span>
          </div>
          <div className="insight-chip">
            <strong>{orderedUsers.filter((candidate) => candidate.status === "Inativo").length}</strong>
            <span>usuarios inativos</span>
          </div>
          <div className="insight-chip">
            <strong>{matchingUsers.filter((candidate) => candidate.status === "Excluido").length}</strong>
            <span>exclusoes logicas</span>
          </div>
        </div>
      </section>

      <section className="board-card glpi-panel">
        <div className="glpi-toolbar">
          <div>
            <h2>Usuarios cadastrados</h2>
            <span>Clique em um usuario para abrir detalhes, perfil vinculado, overrides e redefinicao de senha.</span>
          </div>
          <div className="toolbar">
            <input
              className="toolbar-search"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome, email, equipe, perfil ou status"
              value={search}
            />
            <label className="inline-toggle">
              <input checked={showExcluded} onChange={(event) => setShowExcluded(event.target.checked)} type="checkbox" />
              <span>Mostrar excluidos</span>
            </label>
            <button className="ghost-button interactive-button" onClick={() => setShowGridConfig((current) => !current)} type="button">
              Configurar grade
            </button>
            <button className="ghost-button interactive-button" onClick={() => handleExport("csv")} type="button">
              CSV
            </button>
            <button className="ghost-button interactive-button" onClick={() => handleExport("excel")} type="button">
              Excel
            </button>
            <button className="ghost-button interactive-button" onClick={() => handleExport("pdf")} type="button">
              PDF
            </button>
            {canCreateUsers ? (
              <button className="primary-button interactive-button" onClick={openCreateModal} type="button">
                + Novo usuario
              </button>
            ) : null}
          </div>
        </div>

        {showGridConfig ? (
          <div className="board-card compact-record-card">
            <strong>Colunas visiveis</strong>
            <span>Escolha quais informacoes aparecem na lista unica. A configuracao fica salva neste navegador.</span>
            <div className="permissions-inline users-grid-config">
              {USER_GRID_COLUMNS.map((column) => (
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

        <div className="user-list">
          {orderedUsers.length ? (
            <div className="user-grid-header">
              <span>Usuario</span>
              <div className="user-grid-header-columns">
                {visibleGridColumns.map((column) => (
                  <span key={column.key}>{column.label}</span>
                ))}
              </div>
              <span>Acoes</span>
            </div>
          ) : null}
          {orderedUsers.length ? (
            orderedUsers.map((candidate) => (
              <article className="table-row user-row user-grid-row" key={candidate.id}>
                <button className="user-card-open user-grid-open interactive-button" onClick={() => openDetailModal(candidate)} type="button">
                  <div className="user-row-main user-grid-main">
                    <div className="user-avatar user-avatar-list">
                      {candidate.avatar ? (
                        <img alt={candidate.name} className="user-avatar-image" src={candidate.avatar} />
                      ) : (
                        <span>{getInitials(candidate.name)}</span>
                      )}
                    </div>
                    <div className="user-grid-columns">
                      {visibleGridColumns.map((column) => (
                        <div className="user-grid-cell" key={`${candidate.id}-${column.key}`}>
                          <small>{column.label}</small>
                          <span>
                            {column.key === "status" ? (
                              <span className={`badge ${candidate.status === "Ativo" ? "status-badge-resolvido" : candidate.status === "Inativo" ? "status-badge-aguardando" : "status-badge-reaberto"}`}>
                                {column.render(candidate, activePermissionCount(candidate))}
                              </span>
                            ) : (
                              column.render(candidate, activePermissionCount(candidate))
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </button>
                <div className="compact-row-actions user-quick-actions">
                  {candidate.status === "Ativo" ? (
                    <button className="ghost-button compact-button interactive-button" onClick={() => setUserStatus(candidate.id, "Inativo")} type="button">
                      Desativar
                    </button>
                  ) : (
                    <button className="ghost-button compact-button interactive-button" onClick={() => setUserStatus(candidate.id, "Ativo")} type="button">
                      Ativar
                    </button>
                  )}
                  {canCreateUsers ? (
                    <button className="ghost-button compact-button interactive-button" onClick={() => handleDuplicateUser(candidate)} type="button">
                      Duplicar
                    </button>
                  ) : null}
                  {canDeleteUsers ? (
                    <button className="danger-button compact-button interactive-button" onClick={() => handleDeleteUser(candidate)} type="button">
                      Excluir
                    </button>
                  ) : null}
                </div>
              </article>
            ))
          ) : (
            <div className="empty-state">
              <strong>Nenhum usuario encontrado.</strong>
              <span>Revise o filtro atual ou cadastre um novo usuario para iniciar a operacao.</span>
              <div className="empty-state-actions">
                <button className="ghost-button interactive-button" onClick={() => setSearch("")} type="button">
                  Limpar busca
                </button>
                {canCreateUsers ? (
                  <button className="primary-button interactive-button" onClick={openCreateModal} type="button">
                    Novo usuario
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </section>

      {showCreateModal ? (
        <div className="ticket-modal-backdrop" onClick={() => setShowCreateModal(false)} role="presentation">
          <div className="ticket-modal ticket-modal-large board-card" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <form className="ticket-create-form glpi-ticket-form" onSubmit={handleSubmit}>
              <div className="ticket-modal-header">
                <div className="form-section-header">
                  <strong>Novo usuario</strong>
                </div>
                <div className="ticket-detail-actions">
                  {canCreateUsers ? (
                    <button className="primary-button interactive-button" type="submit">
                      Cadastrar usuario
                    </button>
                  ) : null}
                  <button className="ghost-button interactive-button" onClick={() => setShowCreateModal(false)} type="button">
                    Fechar
                  </button>
                </div>
              </div>
              <div className="glpi-form-grid">
                <label className={`field-block field-span-2${detailDirtyFields.avatar ? " is-dirty" : ""}`}>
                  <span>Foto do usuario</span>
                  <div className="profile-avatar-panel">
                    <div className="user-avatar profile-avatar">
                      {form.avatar ? (
                        <img alt={form.name || "Novo usuario"} className="user-avatar-image" src={form.avatar} />
                      ) : (
                        <span>{getInitials(form.name)}</span>
                      )}
                    </div>
                    <input accept="image/*" onChange={handleAvatarChange} type="file" />
                  </div>
                </label>
                <label className={`field-block${detailDirtyFields.name ? " is-dirty" : ""}`}>
                  <span>Nome</span>
                  <input onChange={updateField("name")} required value={form.name} />
                </label>
                <label className={`field-block${detailDirtyFields.email ? " is-dirty" : ""}`}>
                  <span>Email / Login</span>
                  <input onChange={updateField("email")} type="email" value={form.email} />
                </label>
                <label className="field-block">
                  <span>Senha inicial</span>
                  <div className="user-password-row">
                    <input onChange={updateField("password")} required type={canRevealPasswords && revealedUserIds.includes("new-user") ? "text" : "password"} value={form.password} />
                    {canRevealPasswords ? (
                      <button
                        className="ghost-link interactive-button"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          togglePassword("new-user");
                        }}
                        type="button"
                      >
                        {revealedUserIds.includes("new-user") ? "Ocultar" : "Revelar"}
                      </button>
                    ) : null}
                    <button className="ghost-link interactive-button" onClick={handleGeneratePassword} type="button">
                      Gerar senha
                    </button>
                  </div>
                </label>
                <label className="field-block">
                  <span>Seguranca de acesso</span>
                  <label className="inline-toggle">
                    <input checked={Boolean(form.mustChangePassword)} onChange={updateField("mustChangePassword")} type="checkbox" />
                    <span>Solicitar alteracao de senha no proximo login</span>
                  </label>
                </label>
                <label className="field-block">
                  <span>Status</span>
                  <select onChange={updateField("status")} value={form.status}>
                    <option>Ativo</option>
                    <option>Inativo</option>
                  </select>
                </label>
                <label className="field-block">
                  <span>Perfil de permissao</span>
                  <select onChange={updateProfileField} required value={form.permissionProfileId}>
                    <option value="">Selecione</option>
                    {activeProfiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-block">
                  <span>Equipe</span>
                  <select onChange={updateField("team")} value={form.team}>
                    <option value="">Sem equipe</option>
                    {availableTeams.map((team) => (
                      <option key={team.id} value={team.name}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-block">
                  <span>Departamento</span>
                  <select onChange={updateDepartmentField} value={form.departmentId}>
                    <option value="">Sem departamento</option>
                    {availableDepartments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="board-card compact-record-card">
                <strong>Perfil principal</strong>
                <span>{selectedProfile?.description || "Selecione um perfil para herdar as permissoes base."}</span>
              </div>
              {renderOverrideSection("Permissoes adicionais do usuario", "additionalPermissions")}
              {renderOverrideSection("Restricoes especificas do usuario", "restrictedPermissions", "status-badge-reaberto")}
              {canCreateUsers ? (
                <div className="ticket-create-actions">
                  <button className="primary-button interactive-button" type="submit">
                    Cadastrar usuario
                  </button>
                </div>
              ) : null}
            </form>
          </div>
        </div>
      ) : null}

      {detailUser ? (
        <div className="ticket-modal-backdrop" onClick={() => setDetailUserId(null)} role="presentation">
          <div className="ticket-modal ticket-modal-large board-card" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <form className="ticket-detail-form" onSubmit={handleSubmit}>
              <div className="ticket-modal-header">
                <div>
                  <h2>{detailUser.name}</h2>
                  <span className="modal-subtitle">
                    {detailUser.email || "Sem email"} | {detailUser.team}
                  </span>
                </div>
                <div className="ticket-detail-actions">
                  {canEditUsers || canResetPasswords || canManagePermissions ? (
                    <button className="primary-button interactive-button" type="submit">
                      Salvar usuario
                    </button>
                  ) : null}
                  <button className="ghost-button interactive-button" onClick={() => setDetailUserId(null)} type="button">
                    Fechar
                  </button>
                  {detailUser.status === "Ativo" ? (
                    <button className="ghost-button interactive-button" onClick={() => setUserStatus(detailUser.id, "Inativo")} type="button">
                      Desativar
                    </button>
                  ) : (
                    <button className="ghost-button interactive-button" onClick={() => setUserStatus(detailUser.id, "Ativo")} type="button">
                      Ativar
                    </button>
                  )}
                  {canDeleteUsers ? (
                    <button className="danger-button interactive-button" onClick={() => handleDeleteUser(detailUser)} type="button">
                      Excluir
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="glpi-form-grid">
                <label className="field-block field-span-2">
                  <span>Foto do usuario</span>
                  <div className="profile-avatar-panel">
                    <div className="user-avatar profile-avatar">
                      {form.avatar ? (
                        <img alt={form.name || detailUser.name} className="user-avatar-image" src={form.avatar} />
                      ) : (
                        <span>{getInitials(form.name || detailUser.name)}</span>
                      )}
                    </div>
                    <input accept="image/*" disabled={!canEditUsers} onChange={handleAvatarChange} type="file" />
                  </div>
                </label>
                <label className="field-block">
                  <span>Nome</span>
                  <input disabled={!canEditUsers} onChange={updateField("name")} required value={form.name} />
                </label>
                <label className="field-block">
                  <span>Email / Login</span>
                  <input disabled={!canEditUsers} onChange={updateField("email")} type="email" value={form.email} />
                </label>
                <label className={`field-block${detailDirtyFields.password ? " is-dirty" : ""}`}>
                  <span>Senha</span>
                  <div className="user-password-row">
                    <input
                      disabled={!canResetPasswords}
                      onChange={updateField("password")}
                      type={canRevealPasswords && revealedUserIds.includes(detailUser.id) ? "text" : "password"}
                      value={form.password}
                    />
                    {canRevealPasswords ? (
                      <button
                        className="ghost-link interactive-button"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          togglePassword(detailUser.id);
                        }}
                        type="button"
                      >
                        {revealedUserIds.includes(detailUser.id) ? "Ocultar" : "Revelar"}
                      </button>
                    ) : null}
                    {canResetPasswords ? (
                      <button className="ghost-link interactive-button" onClick={handleGeneratePassword} type="button">
                        Gerar senha
                      </button>
                    ) : null}
                  </div>
                </label>
                <label className={`field-block${detailDirtyFields.mustChangePassword ? " is-dirty" : ""}`}>
                  <span>Seguranca de acesso</span>
                  <label className="inline-toggle">
                    <input checked={Boolean(form.mustChangePassword)} disabled={!canResetPasswords} onChange={updateField("mustChangePassword")} type="checkbox" />
                    <span>Solicitar alteracao de senha no proximo login</span>
                  </label>
                </label>
                <label className={`field-block${detailDirtyFields.status ? " is-dirty" : ""}`}>
                  <span>Status</span>
                  <select disabled={!canEditUsers} onChange={updateField("status")} value={form.status}>
                    <option>Ativo</option>
                    <option>Inativo</option>
                    <option>Excluido</option>
                  </select>
                </label>
                <label className={`field-block${detailDirtyFields.permissionProfileId ? " is-dirty" : ""}`}>
                  <span>Perfil de permissao</span>
                  <select disabled={!canManagePermissions} onChange={updateProfileField} required value={form.permissionProfileId}>
                    <option value="">Selecione</option>
                    {permissionProfiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.name} {profile.status === "Inativo" ? "(Inativo)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={`field-block${detailDirtyFields.team ? " is-dirty" : ""}`}>
                  <span>Equipe</span>
                  <select disabled={!canEditUsers} onChange={updateField("team")} value={form.team}>
                    <option value="">Sem equipe</option>
                    {availableTeams.map((team) => (
                      <option key={team.id} value={team.name}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={`field-block${detailDirtyFields.departmentId ? " is-dirty" : ""}`}>
                  <span>Departamento</span>
                  <select disabled={!canEditUsers} onChange={updateDepartmentField} value={form.departmentId}>
                    <option value="">Sem departamento</option>
                    {availableDepartments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="board-card compact-record-card">
                <strong>Perfil principal</strong>
                <span>{selectedProfile?.description || "Este usuario precisa de um perfil de permissao valido."}</span>
              </div>
              {renderOverrideSection("Permissoes adicionais do usuario", "additionalPermissions")}
              {renderOverrideSection("Restricoes especificas do usuario", "restrictedPermissions", "status-badge-reaberto")}
              {canEditUsers || canResetPasswords || canManagePermissions ? (
                <div className="ticket-create-actions">
                  <button className="primary-button interactive-button" type="submit">
                    Salvar usuario
                  </button>
                </div>
              ) : null}
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default UsersPage;
