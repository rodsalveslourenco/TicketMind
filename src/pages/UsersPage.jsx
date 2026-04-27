import { useMemo, useState } from "react";
import { useAppData } from "../data/AppDataContext";

const permissionFields = [
  { key: "dashboard", label: "Dashboard" },
  { key: "tickets_view", label: "Ver chamados" },
  { key: "tickets_manage", label: "Gerenciar chamados" },
  { key: "users_view", label: "Ver usuarios" },
  { key: "users_manage", label: "Gerenciar usuarios" },
  { key: "reports_view", label: "Ver relatorios" },
  { key: "sla_manage", label: "Gerenciar SLA" },
];

const defaultPermissions = {
  dashboard: true,
  tickets_view: true,
  tickets_manage: false,
  users_view: false,
  users_manage: false,
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

function UsersPage() {
  const { addUser, deleteUser, updateUser, users } = useAppData();
  const [form, setForm] = useState(defaultUserForm);
  const [editingUserId, setEditingUserId] = useState(null);

  const orderedUsers = useMemo(() => users.slice().sort((left, right) => left.name.localeCompare(right.name)), [users]);

  const updateField = (field) => (event) => {
    setForm((current) => ({
      ...current,
      [field]: event.target.value,
    }));
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

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!form.name || !form.email || !form.team || !form.password) {
      return;
    }

    if (editingUserId) {
      updateUser(editingUserId, form);
    } else {
      addUser(form);
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

  return (
    <div className="users-page">
      <section className="board-card glpi-panel">
        <div className="glpi-toolbar">
          <div>
            <h2>{editingUserId ? "Editar usuario" : "Cadastro de usuarios"}</h2>
            <span>Inclui senha, permissoes detalhadas e manutencao do cadastro.</span>
          </div>
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
              <input onChange={updateField("password")} type="text" value={form.password} />
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
            <button className="primary-button" type="submit">
              {editingUserId ? "Salvar usuario" : "Cadastrar usuario"}
            </button>
            {editingUserId ? (
              <button className="ghost-button" onClick={resetForm} type="button">
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
            <span>Edite ou exclua usuarios e revise as permissoes por modulo.</span>
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
                <span>{candidate.password}</span>
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
                <button className="ghost-button" onClick={() => handleEdit(candidate)} type="button">
                  Editar
                </button>
                <button className="danger-button" onClick={() => deleteUser(candidate.id)} type="button">
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
