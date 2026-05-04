import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useAppData } from "../data/AppDataContext";
import { hasAnyPermission, normalizeText } from "../data/permissions";

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

function UsersPage() {
  const { user } = useAuth();
  const {
    addUser,
    deleteUser,
    departments,
    duplicateUser,
    permissionCatalog,
    permissionProfiles,
    pushToast,
    setUserStatus,
    updateUser,
    users,
  } = useAppData();

  const [search, setSearch] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [detailUserId, setDetailUserId] = useState(null);
  const [editingUserId, setEditingUserId] = useState(null);
  const [revealedUserIds, setRevealedUserIds] = useState([]);
  const [form, setForm] = useState(() => createDefaultUserForm(permissionProfiles, permissionCatalog));

  const canRevealPasswords = normalizeText(user?.department) === "ti";
  const canViewUsers = hasAnyPermission(user, ["users_view", "users_admin"]);
  const canCreateUsers = hasAnyPermission(user, ["users_create", "users_admin"]);
  const canEditUsers = hasAnyPermission(user, ["users_edit", "users_admin"]);
  const canDeleteUsers = hasAnyPermission(user, ["users_delete", "users_admin"]);
  const canResetPasswords = hasAnyPermission(user, ["users_reset_password", "users_admin"]);
  const canManagePermissions = hasAnyPermission(user, ["users_manage_permissions", "users_admin"]);

  const activeProfiles = useMemo(
    () => permissionProfiles.filter((profile) => profile.status !== "Inativo" || profile.id === form.permissionProfileId),
    [permissionProfiles, form.permissionProfileId],
  );

  const availableDepartments = useMemo(
    () => departments.filter((department) => department.status === "Ativo" || department.id === form.departmentId),
    [departments, form.departmentId],
  );

  const orderedUsers = useMemo(() => {
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

  const detailUser = users.find((candidate) => candidate.id === detailUserId) || null;
  const selectedProfile = permissionProfiles.find((profile) => profile.id === form.permissionProfileId) || permissionProfiles[0] || null;

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
    setForm((current) => ({ ...current, [field]: event.target.value }));
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
      password: candidate.password || "",
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

  const handleSubmit = (event) => {
    event.preventDefault();
    if (editingUserId) {
      if (!(canEditUsers || canResetPasswords || canManagePermissions)) return;
    } else if (!canCreateUsers) {
      return;
    }

    if (!form.name.trim() || !form.team.trim()) {
      pushToast("Campos obrigatorios", "Preencha nome e equipe do usuario.", "warning");
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
      role: selectedPermissionProfile?.name || form.role,
      departmentId: selectedDepartment?.id || "",
      department: selectedDepartment?.name || "",
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
    pushToast("Usuario excluido", candidate.name);
  };

  const handleDuplicateUser = (candidate) => {
    if (!canCreateUsers) return;
    const duplicated = duplicateUser(candidate.id);
    if (!duplicated) return;
    pushToast("Usuario duplicado", `${duplicated.name} criado em modo inativo e sem senha definida.`);
    openDetailModal(duplicated);
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
            <strong>{orderedUsers.filter((candidate) => candidate.status === "Excluido").length}</strong>
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
            {canCreateUsers ? (
              <button className="primary-button interactive-button" onClick={openCreateModal} type="button">
                + Novo usuario
              </button>
            ) : null}
          </div>
        </div>

        <div className="user-list">
          {orderedUsers.map((candidate) => (
            <article className="table-row user-row user-card" key={candidate.id}>
              <button className="user-card-open interactive-button" onClick={() => openDetailModal(candidate)} type="button">
                <div className="user-row-main">
                  <div className="user-avatar user-avatar-list">
                    {candidate.avatar ? (
                      <img alt={candidate.name} className="user-avatar-image" src={candidate.avatar} />
                    ) : (
                      <span>{getInitials(candidate.name)}</span>
                    )}
                  </div>
                  <div className="user-identity">
                    <strong>{candidate.name}</strong>
                    <span>{candidate.email || "Sem email definido"}</span>
                  </div>
                  <div className="user-role-block">
                    <span className={`badge ${candidate.status === "Ativo" ? "status-badge-resolvido" : candidate.status === "Inativo" ? "status-badge-aguardando" : "status-badge-reaberto"}`}>
                      {candidate.status}
                    </span>
                    <span>{candidate.role || "Sem perfil"}</span>
                    <span>{candidate.team || "Sem equipe"} | {candidate.department || "Sem departamento"}</span>
                  </div>
                  <div className="user-summary-stats">
                    <div>
                      <strong>{activePermissionCount(candidate)}</strong>
                      <span>acessos efetivos</span>
                    </div>
                    <div>
                      <strong>{candidate.id}</strong>
                      <span>identificador</span>
                    </div>
                  </div>
                </div>
                <div className="user-row-footer">
                  <div className="user-password-row">
                    <strong>Senha:</strong>
                    <span>{maskPassword(candidate.password)}</span>
                  </div>
                  <span className="user-open-hint">Abrir detalhes</span>
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
          ))}
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
                <button className="ghost-button interactive-button" onClick={() => setShowCreateModal(false)} type="button">
                  Fechar
                </button>
              </div>
              <div className="glpi-form-grid">
                <label className="field-block field-span-2">
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
                <label className="field-block">
                  <span>Nome</span>
                  <input onChange={updateField("name")} value={form.name} />
                </label>
                <label className="field-block">
                  <span>Email / Login</span>
                  <input onChange={updateField("email")} type="email" value={form.email} />
                </label>
                <label className="field-block">
                  <span>Senha inicial</span>
                  <input onChange={updateField("password")} type="password" value={form.password} />
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
                  <select onChange={updateProfileField} value={form.permissionProfileId}>
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
                  <input onChange={updateField("team")} value={form.team} />
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
                  <input disabled={!canEditUsers} onChange={updateField("name")} value={form.name} />
                </label>
                <label className="field-block">
                  <span>Email / Login</span>
                  <input disabled={!canEditUsers} onChange={updateField("email")} type="email" value={form.email} />
                </label>
                <label className="field-block">
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
                        className="ghost-link"
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
                  </div>
                </label>
                <label className="field-block">
                  <span>Status</span>
                  <select disabled={!canEditUsers} onChange={updateField("status")} value={form.status}>
                    <option>Ativo</option>
                    <option>Inativo</option>
                    <option>Excluido</option>
                  </select>
                </label>
                <label className="field-block">
                  <span>Perfil de permissao</span>
                  <select disabled={!canManagePermissions} onChange={updateProfileField} value={form.permissionProfileId}>
                    <option value="">Selecione</option>
                    {permissionProfiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.name} {profile.status === "Inativo" ? "(Inativo)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-block">
                  <span>Equipe</span>
                  <input disabled={!canEditUsers} onChange={updateField("team")} value={form.team} />
                </label>
                <label className="field-block">
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
