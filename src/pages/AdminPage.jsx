import { useState } from "react";
import { useAppData } from "../data/AppDataContext";

function AdminPage() {
  const { addUser, serviceCatalog, users } = useAppData();
  const [form, setForm] = useState({
    name: "",
    role: "Analista",
    team: "",
  });

  const updateField = (field) => (event) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!form.name || !form.team) {
      return;
    }

    addUser(form);
    setForm({
      name: "",
      role: "Analista",
      team: "",
    });
  };

  return (
    <div className="page-grid">
      <div className="split-grid">
        <div className="board-card">
          <div className="card-heading">
            <div>
              <h2>Administração da plataforma</h2>
              <span>Cadastre usuários internos e mantenha a governança do ambiente.</span>
            </div>
          </div>

          <form className="data-form compact-form" onSubmit={handleSubmit}>
            <input onChange={updateField("name")} placeholder="Nome do usuário" value={form.name} />
            <select onChange={updateField("role")} value={form.role}>
              <option>Administrador</option>
              <option>Analista</option>
              <option>Aprovador</option>
            </select>
            <input onChange={updateField("team")} placeholder="Equipe" value={form.team} />
            <button className="ghost-button" type="submit">
              Adicionar usuário
            </button>
          </form>
        </div>

        <div className="board-card">
          <div className="card-heading">
            <div>
              <h2>Usuários e acessos</h2>
              <span>Perfis ativos para atendimento e aprovação.</span>
            </div>
          </div>
          <div className="table-list">
            {users.map((user) => (
              <div className="table-row" key={user.id}>
                <div>
                  <strong>{user.name}</strong>
                  <span>{user.team}</span>
                </div>
                <div className="row-stats">
                  <span>{user.role}</span>
                  <span>{user.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="capabilities-grid">
        {serviceCatalog.map((module) => (
          <article className="mini-card" key={module}>
            <strong>{module}</strong>
            <span>Componente disponível para estruturar a operação e a governança.</span>
          </article>
        ))}
      </div>
    </div>
  );
}

export default AdminPage;
