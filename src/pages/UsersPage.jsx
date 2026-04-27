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
  password: "",
  role: "Analista",
  team: "",
  department: "TI",
  permissions: defaultPermissions,
};

function maskPassword(password) {
  return "*".repeat(Math.max(String(password || "").length, 8));
}

function UsersPage() {
  const { user } = useAuth();
  const { addUser, deleteUser, updateUser, users } = useAppData();
  const [form, setForm] = useState(defaultUserForm);
  const [editingUserId, setEditingUserId] = useState(null);
  const [notice, setNotice] = useState("");
  const [revealedUserIds, setRevealedUserIds] = useState([]);

  const canRevealPasswords = user?.department === "TI";
  const orderedUsers = useMemo(() => users.slice().sort((left, right) => left.name.localeCompare(right.name)), [users]);

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

  const flashNotice = (message) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 1800);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!form.name || !form.email || !form.team || !form.password) return;

    if (editingUserId) {
      updateUser(editingUserId, form);
      flashNotice("Usuario atualizado.");
    } else {
      addUser(form);
      flashNotice("Usuario cadastrado.");
    }
    resetForm();
  };

  const handleEdit = (candidate) => {
    setEditingUserId(candidate.id);
    setForm({
      name: candidate.name,
      email: candidate.email,
      password: candidate.password || "",
      role: candidate.role,
      team: candidate.team,
      department: candidate.department,
      permissions: {
        ...defaultPermissions,
        ...(candidate.permissions || {}),
      },
    });
  };

  const togglePassword = (userId) => {
    if (!canRevealPasswords) return;
    setRevealedUserIds((current) =>
      current.includes(userId) ? current.filter((item) => item !== userId) : [...current, userId],
    );
  };

  return (
    <div className="users-page">
      <section className="board-card glpi-panel">
        <div className="glpi-toolbar">
          <div>
            <h2>{editingUserId ? "Editar usuario" : "Cadastro de usuarios"}</h2>
            <span>Administracao de contas, perfis e acessos por modulo.</span>
          </div>
          {notice ? <span className="status-pill status-pill-success">{notice}</span> : null}
        </div>

        <form className="glpi-ticket-form user-form" onSubmit={handleSubmit}>
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
              {editingUserId ? "Salvar usuario" : "Cadastrar usuario"}
            </button>
            {editingUserId ? (
              <button className="ghost-button interactive-button" onClick={resetForm} type="button">
                Cancelar edicao
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="board-card glpi-panel">
        <div className="glpi-toolbar">
          <div>
            <h2>Usuarios cadastrados</h2>
            <span>Revise acessos, perfis e manutencao de contas.</span>
          </div>
        </div>

        <div className="table-list">
          {orderedUsers.map((candidate) => (
            <div className="table-row table-row-stack" key={candidate.id}>
              <div>
                <strong>{candidate.name}</strong>
                <span>{candidate.email}</span>
              </div>
              <div className="row-stats row-stats-wrap">
                <span>{candidate.role}</span>
                <span>{candidate.team}</span>
                <span>{candidate.department}</span>
              </div>
              <div className="user-password-row">
                <strong>Senha:</strong>
                <span>
                  {canRevealPasswords && revealedUserIds.includes(candidate.id)
                    ? candidate.password
                    : maskPassword(candidate.password)}
                </span>
                {canRevealPasswords ? (
                  <button className="ghost-link interactive-button" onClick={() => togglePassword(candidate.id)} type="button">
                    {revealedUserIds.includes(candidate.id) ? "Ocultar" : "Revelar"}
                  </button>
                ) : null}
              </div>
              <div className="permissions-inline">
                {permissionFields
                  .filter((permission) => candidate.permissions?.[permission.key])
                  .map((permission) => (
                    <span className="badge badge-neutral" key={permission.key}>
                      {permission.label}
                    </span>
                  ))}
              </div>
              <div className="ticket-create-actions">
                <button className="ghost-button interactive-button" onClick={() => handleEdit(candidate)} type="button">
                  Editar
                </button>
                <button
                  className="danger-button interactive-button"
                  onClick={() => {
                    deleteUser(candidate.id);
                    flashNotice("Usuario removido.");
                  }}
                  type="button"
                >
                  Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default UsersPage;
