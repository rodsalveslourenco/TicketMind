import { useState } from "react";
import { useAppData } from "../data/AppDataContext";

const defaultUserForm = {
  name: "",
  email: "",
  role: "Analista",
  team: "",
  department: "TI",
};

function UsersPage() {
  const { addUser, users } = useAppData();
  const [form, setForm] = useState(defaultUserForm);

  const updateField = (field) => (event) => {
    setForm((current) => ({
      ...current,
      [field]: event.target.value,
    }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!form.name || !form.email || !form.team) {
      return;
    }

    addUser(form);
    setForm(defaultUserForm);
  };

  return (
    <div className="users-page">
      <section className="board-card glpi-panel">
        <div className="glpi-toolbar">
          <div>
            <h2>Cadastro de usuarios</h2>
            <span>Cadastre perfis e departamentos para uso no atendimento.</span>
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

          <div className="ticket-create-actions">
            <button className="primary-button" type="submit">
              Cadastrar usuario
            </button>
          </div>
        </form>
      </section>

      <section className="board-card glpi-panel">
        <div className="glpi-toolbar">
          <div>
            <h2>Usuarios cadastrados</h2>
            <span>Perfis disponiveis para observadores e tecnico responsavel.</span>
          </div>
        </div>

        <div className="table-list">
          {users.map((candidate) => (
            <div className="table-row" key={candidate.id}>
              <div>
                <strong>{candidate.name}</strong>
                <span>{candidate.email}</span>
              </div>
              <div className="row-stats">
                <span>{candidate.role}</span>
                <span>{candidate.team}</span>
                <span>{candidate.department}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default UsersPage;
