import { useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { useAppData } from "../data/AppDataContext";

const permissionFields = [
  { key: "dashboard", label: "Dashboard" },
  { key: "tickets_view", label: "Ver chamados" },
  { key: "tickets_manage", label: "Gerenciar chamados" },
  { key: "users_view", label: "Ver usuarios" },
  { key: "users_manage", label: "Gerenciar usuarios" },
  { key: "assets_view", label: "Ver ativos" },
  { key: "assets_manage", label: "Gerenciar ativos" },
  { key: "projects_view", label: "Ver projetos" },
  { key: "projects_manage", label: "Gerenciar projetos" },
  { key: "api_view", label: "Ver API REST" },
  { key: "api_manage", label: "Gerenciar API REST" },
  { key: "reports_view", label: "Ver relatorios" },
  { key: "sla_manage", label: "Gerenciar SLA" },
];

const defaultPermissions = {
  dashboard: true,
  tickets_view: true,
  tickets_manage: false,
  users_view: false,
  users_manage: false,
  assets_view: true,
  assets_manage: false,
  projects_view: true,
  projects_manage: false,
  api_view: false,
  api_manage: false,
  reports_view: false,
  sla_manage: false,
};

const defaultUserForm = {
  name: "",
  email: "",
  password: "admin0123",
  role: "Analista",
  team: "",
  department: "TI",
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
      permissions: {
        ...defaultPermissions,
        ...(candidate.permissions || {}),
      },
    });
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!form.name || !form.email || !form.team || !form.password) return;

    const normalizedEmail = normalizeText(form.email);
    const duplicatedUser = users.find(
      (candidate) => normalizeText(candidate.email) === normalizedEmail && candidate.id !== editingUserId,
    );
    if (duplicatedUser) {
      pushToast("Email ja cadastrado", duplicatedUser.email, "warning");
      return;
    }

    if (editingUserId) {
      updateUser(editingUserId, form);
      pushToast("Usuario atualizado", form.name);
    } else {
      addUser(form);
      pushToast("Usuario cadastrado", form.name);
    }

    setShowCreateModal(false);
    setDetailUserId(null);
    resetForm();
  };

  const openCreateModal = () => {
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
    if (!candidate) return;
    if (candidate.id === user?.id) {
      pushToast("Operacao bloqueada", "Nao e permitido excluir o usuario logado.", "warning");
      return;
    }

    deleteUser(candidate.id);
    setDetailUserId(null);
    setShowCreateModal(false);
    resetForm();
    pushToast("Usuario removido", candidate.name);
  };

  return (
    <div className="users-page">
      <section className="module-hero board-card">
        <div>
          <span className="eyebrow">Usuarios</span>
          <h2>Usuarios</h2>
        </div>
        <div className="insight-strip">
          <div className="insight-chip">
            <strong>{orderedUsers.length}</strong>
            <span>usuarios no recorte</span>
          </div>
          <div className="insight-chip">
            <strong>{orderedUsers.filter((candidate) => candidate.department === "TI").length}</strong>
            <span>usuarios TI</span>
          </div>
          <div className="insight-chip">
            <strong>{orderedUsers.filter((candidate) => candidate.permissions?.users_manage).length}</strong>
            <span>gestores de acesso</span>
          </div>
        </div>
      </section>

      <section className="board-card glpi-panel">
        <div className="glpi-toolbar">
          <div>
            <h2>Usuarios cadastrados</h2>
          </div>
          <div className="toolbar">
            <input
              className="toolbar-search"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome, email, equipe ou perfil"
              value={search}
            />
            <button className="primary-button interactive-button" onClick={openCreateModal} type="button">
              + Novo usuario
            </button>
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
                  {permissionFields
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
                  <strong>Novo usuario</strong>
                </div>
                <button className="ghost-button interactive-button" onClick={() => setShowCreateModal(false)} type="button">
                  Fechar
                </button>
              </div>
              <div className="glpi-form-grid">
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
                    <option>Operacoes</option>
                    <option>Comercial</option>
                  </select>
                </label>
              </div>
              <div className="permissions-grid">
                {permissionFields.map((permission) => (
                  <label className="permission-card" key={permission.key}>
                    <input
                      checked={Boolean(form.permissions[permission.key])}
                      onChange={updatePermission(permission.key)}
                      type="checkbox"
                    />
                    <span>{permission.label}</span>
                  </label>
                ))}
              </div>
              <div className="ticket-create-actions">
                <button className="primary-button interactive-button" type="submit">
                  Cadastrar usuario
                </button>
              </div>
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
                  <button
                    className="danger-button interactive-button"
                    onClick={() => handleDeleteUser(detailUser)}
                    type="button"
                  >
                    Excluir
                  </button>
                </div>
              </div>
              <div className="glpi-form-grid">
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
                    <option>Operacoes</option>
                    <option>Comercial</option>
                  </select>
                </label>
              </div>
              <div className="permissions-grid">
                {permissionFields.map((permission) => (
                  <label className="permission-card" key={permission.key}>
                    <input
                      checked={Boolean(form.permissions[permission.key])}
                      onChange={updatePermission(permission.key)}
                      type="checkbox"
                    />
                    <span>{permission.label}</span>
                  </label>
                ))}
              </div>
              <div className="ticket-create-actions">
                <button className="primary-button interactive-button" type="submit">
                  Salvar usuario
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default UsersPage;
