import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useAppData } from "../data/AppDataContext";
import {
  defaultPermissions,
  hasAnyPermission,
  normalizeUserPermissions,
  permissionGroups,
} from "../data/permissions";

const defaultUserForm = {
  name: "",
  email: "",
  password: "admin0123",
  role: "Analista",
  team: "",
  department: "TI",
  avatar: "",
  permissions: defaultPermissions,
};

function maskPassword(password) {
  return "*".repeat(Math.max(String(password || "").length, 8));
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

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

function UsersPage() {
  const { user } = useAuth();
  const { addUser, deleteUser, pushToast, updateUser, users } = useAppData();
  const [search, setSearch] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [detailUserId, setDetailUserId] = useState(null);
  const [form, setForm] = useState(defaultUserForm);
  const [editingUserId, setEditingUserId] = useState(null);
  const [revealedUserIds, setRevealedUserIds] = useState([]);

  const canRevealPasswords = user?.department === "TI";
  const canViewUsers = hasAnyPermission(user, ["users_view", "users_admin"]);
  const canCreateUsers = hasAnyPermission(user, ["users_create", "users_admin"]);
  const canEditUsers = hasAnyPermission(user, ["users_edit", "users_admin"]);
  const canDeleteUsers = hasAnyPermission(user, ["users_delete", "users_admin"]);
  const canResetPasswords = hasAnyPermission(user, ["users_reset_password", "users_admin"]);
  const canManagePermissions = hasAnyPermission(user, ["users_manage_permissions", "users_admin"]);

  const orderedUsers = useMemo(() => {
    const normalizedSearch = search
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

    return users
      .slice()
      .sort((left, right) => left.name.localeCompare(right.name))
      .filter((candidate) =>
        !normalizedSearch
          ? true
          : [candidate.name, candidate.email, candidate.team, candidate.role, candidate.department]
              .join(" ")
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .toLowerCase()
              .includes(normalizedSearch),
      );
  }, [search, users]);

  const detailUser = users.find((candidate) => candidate.id === detailUserId) ?? null;

  const updateField = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const updatePermission = (permissionKey) => (event) => {
    setForm((current) => ({
      ...current,
      permissions: {
        ...current.permissions,
        [permissionKey]: event.target.checked,
      },
    }));
  };

  const resetForm = () => {
    setForm(defaultUserForm);
    setEditingUserId(null);
  };

  const populateForm = (candidate) => {
    setEditingUserId(candidate.id);
    setForm({
      name: candidate.name,
      email: candidate.email,
      password: candidate.password || "admin0123",
      role: candidate.role,
      team: candidate.team,
      department: candidate.department,
      avatar: candidate.avatar || "",
      permissions: normalizeUserPermissions(candidate.permissions || {}, candidate),
    });
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
    if (!form.name || !form.email || !form.team || !form.password) return;

    const normalizedEmail = normalizeText(form.email);
    const duplicatedUser = users.find(
      (candidate) => normalizeText(candidate.email) === normalizedEmail && candidate.id !== editingUserId,
    );
    if (duplicatedUser) {
      pushToast("Email já cadastrado", duplicatedUser.email, "warning");
      return;
    }

    if (editingUserId) {
      updateUser(editingUserId, form);
      pushToast("Usuário atualizado", form.name);
    } else {
      addUser(form);
      pushToast("Usuário cadastrado", form.name);
    }

    setShowCreateModal(false);
    setDetailUserId(null);
    resetForm();
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

  const togglePassword = (userId) => {
    if (!canRevealPasswords) return;
    setRevealedUserIds((current) =>
      current.includes(userId) ? current.filter((item) => item !== userId) : [...current, userId],
    );
  };

  const handleDeleteUser = (candidate) => {
    if (!canDeleteUsers) return;
    if (!candidate) return;
    if (candidate.id === user?.id) {
      pushToast("Operação bloqueada", "Não e permitido excluir o usuário logado.", "warning");
      return;
    }

    deleteUser(candidate.id);
    setDetailUserId(null);
    setShowCreateModal(false);
    resetForm();
    pushToast("Usuário removido", candidate.name);
  };

  if (!canViewUsers) {
    return <Navigate replace to="/app/dashboard" />;
  }

  return (
    <div className="users-page">
      <section className="module-hero board-card">
        <div>
          <span className="eyebrow">Usuários</span>
          <h2>Usuários</h2>
        </div>
        <div className="insight-strip">
          <div className="insight-chip">
            <strong>{orderedUsers.length}</strong>
            <span>usuários no recorte</span>
          </div>
          <div className="insight-chip">
            <strong>{orderedUsers.filter((candidate) => candidate.department === "TI").length}</strong>
            <span>usuários TI</span>
          </div>
          <div className="insight-chip">
            <strong>{orderedUsers.filter((candidate) => candidate.permissions?.users_admin).length}</strong>
            <span>gestores de acesso</span>
          </div>
        </div>
      </section>

      <section className="board-card glpi-panel">
        <div className="glpi-toolbar">
          <div>
            <h2>Usuários cadastrados</h2>
          </div>
          <div className="toolbar">
            <input
              className="toolbar-search"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome, email, equipe ou perfil"
              value={search}
            />
            {canCreateUsers ? (
              <button className="primary-button interactive-button" onClick={openCreateModal} type="button">
                + Novo usuário
              </button>
            ) : null}
          </div>
        </div>

        <div className="user-list">
          {orderedUsers.map((candidate) => (
            <button
              className="table-row user-row interactive-button"
              key={candidate.id}
              onDoubleClick={() => openDetailModal(candidate)}
              type="button"
            >
              <div className="user-row-main">
                <div className="user-avatar user-avatar-list">
                  {candidate.avatar ? (
                    <img alt={candidate.name} className="user-avatar-image" src={candidate.avatar} />
                  ) : (
                    <span>{getInitials(candidate.name)}</span>
                  )}
                </div>
                <div>
                  <strong>{candidate.name}</strong>
                  <span>{candidate.email}</span>
                </div>
                <div className="row-stats row-stats-wrap">
                  <span>{candidate.role}</span>
                  <span>{candidate.team}</span>
                  <span>{candidate.department}</span>
                </div>
              </div>
              <div className="user-row-footer">
                <div className="user-password-row">
                  <strong>Senha:</strong>
                  <span>
                    {canRevealPasswords && revealedUserIds.includes(candidate.id)
                      ? candidate.password
                      : maskPassword(candidate.password)}
                  </span>
                  {canRevealPasswords ? (
                    <button
                      className="ghost-link"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        togglePassword(candidate.id);
                      }}
                      type="button"
                    >
                      {revealedUserIds.includes(candidate.id) ? "Ocultar" : "Revelar"}
                    </button>
                  ) : null}
                </div>
                <div className="permissions-inline">
                  {permissionGroups
                    .flatMap((group) => group.permissions)
                    .filter((permission) => candidate.permissions?.[permission.key])
                    .slice(0, 4)
                    .map((permission) => (
                      <span className="badge badge-neutral" key={permission.key}>
                        {permission.label}
                      </span>
                    ))}
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      {showCreateModal ? (
        <div className="ticket-modal-backdrop" onClick={() => setShowCreateModal(false)} role="presentation">
          <div className="ticket-modal board-card" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <form className="ticket-create-form glpi-ticket-form" onSubmit={handleSubmit}>
              <div className="ticket-modal-header">
                <div className="form-section-header">
                  <strong>Novo usuário</strong>
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
                  <span>Email</span>
                  <input onChange={updateField("email")} type="email" value={form.email} />
                </label>
                <label className="field-block">
                  <span>Senha</span>
                  <input onChange={updateField("password")} type="password" value={form.password} />
                </label>
                <label className="field-block">
                  <span>Perfil</span>
                  <select onChange={updateField("role")} value={form.role}>
                    <option>Administrador</option>
                    <option>Analista</option>
                    <option>Especialista</option>
                    <option>Coordenador</option>
                    <option>Solicitante</option>
                  </select>
                </label>
                <label className="field-block">
                  <span>Equipe</span>
                  <input onChange={updateField("team")} value={form.team} />
                </label>
                <label className="field-block">
                  <span>Departamento</span>
                  <select onChange={updateField("department")} value={form.department}>
                    <option>TI</option>
                    <option>RH</option>
                    <option>Financeiro</option>
                    <option>Operações</option>
                    <option>Comercial</option>
                  </select>
                </label>
              </div>
              <div className="permissions-panel">
                {permissionGroups.map((group) => (
                  <section className="permission-group" key={group.module}>
                    <strong>{group.label}</strong>
                    <div className="permissions-list">
                      {group.permissions.map((permission) => (
                        <label className="permission-item" key={permission.key}>
                          <input
                            checked={Boolean(form.permissions[permission.key])}
                            disabled={!canManagePermissions}
                            onChange={updatePermission(permission.key)}
                            type="checkbox"
                          />
                          <span>{permission.label}</span>
                        </label>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
              {canCreateUsers ? (
                <div className="ticket-create-actions">
                  <button className="primary-button interactive-button" type="submit">
                    Cadastrar usuário
                  </button>
                </div>
              ) : null}
            </form>
          </div>
        </div>
      ) : null}

      {detailUser ? (
        <div className="ticket-modal-backdrop" onClick={() => setDetailUserId(null)} role="presentation">
          <div
            className="ticket-modal ticket-modal-large board-card"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <form className="ticket-detail-form" onSubmit={handleSubmit}>
              <div className="ticket-modal-header">
                <div>
                  <h2>{detailUser.name}</h2>
                  <span className="modal-subtitle">
                    {detailUser.email} | {detailUser.team}
                  </span>
                </div>
                <div className="ticket-detail-actions">
                  <button className="ghost-button interactive-button" onClick={() => setDetailUserId(null)} type="button">
                    Fechar
                  </button>
                  {canDeleteUsers ? (
                    <button
                      className="danger-button interactive-button"
                      onClick={() => handleDeleteUser(detailUser)}
                      type="button"
                    >
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
                  <span>Email</span>
                  <input disabled={!canEditUsers} onChange={updateField("email")} type="email" value={form.email} />
                </label>
                <label className="field-block">
                  <span>Senha</span>
                  <input disabled={!canResetPasswords} onChange={updateField("password")} type="password" value={form.password} />
                </label>
                <label className="field-block">
                  <span>Perfil</span>
                  <select disabled={!canEditUsers} onChange={updateField("role")} value={form.role}>
                    <option>Administrador</option>
                    <option>Analista</option>
                    <option>Especialista</option>
                    <option>Coordenador</option>
                    <option>Solicitante</option>
                  </select>
                </label>
                <label className="field-block">
                  <span>Equipe</span>
                  <input disabled={!canEditUsers} onChange={updateField("team")} value={form.team} />
                </label>
                <label className="field-block">
                  <span>Departamento</span>
                  <select disabled={!canEditUsers} onChange={updateField("department")} value={form.department}>
                    <option>TI</option>
                    <option>RH</option>
                    <option>Financeiro</option>
                    <option>Operações</option>
                    <option>Comercial</option>
                  </select>
                </label>
              </div>
              <div className="permissions-panel">
                {permissionGroups.map((group) => (
                  <section className="permission-group" key={group.module}>
                    <strong>{group.label}</strong>
                    <div className="permissions-list">
                      {group.permissions.map((permission) => (
                        <label className="permission-item" key={permission.key}>
                          <input
                            checked={Boolean(form.permissions[permission.key])}
                            disabled={!canManagePermissions}
                            onChange={updatePermission(permission.key)}
                            type="checkbox"
                          />
                          <span>{permission.label}</span>
                        </label>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
              {canEditUsers || canResetPasswords || canManagePermissions ? (
                <div className="ticket-create-actions">
                  <button className="primary-button interactive-button" type="submit">
                    Salvar usuário
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
