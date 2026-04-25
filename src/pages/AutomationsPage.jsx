import { useState } from "react";
import { useAppData } from "../data/AppDataContext";

function AutomationsPage() {
  const { addAutomation, automations, toggleAutomation } = useAppData();
  const [form, setForm] = useState({
    name: "",
    trigger: "",
    action: "",
  });

  const updateField = (field) => (event) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!form.name || !form.trigger || !form.action) {
      return;
    }

    addAutomation(form);
    setForm({
      name: "",
      trigger: "",
      action: "",
    });
  };

  return (
    <div className="page-grid">
      <div className="board-card">
        <div className="card-heading">
          <div>
            <h2>SLAs, regras e automações</h2>
            <span>Defina gatilhos de atendimento e mantenha o fluxo operacional padronizado.</span>
          </div>
        </div>

        <form className="data-form compact-form" onSubmit={handleSubmit}>
          <input onChange={updateField("name")} placeholder="Nome da regra" value={form.name} />
          <input onChange={updateField("trigger")} placeholder="Gatilho" value={form.trigger} />
          <textarea onChange={updateField("action")} placeholder="Ação executada" value={form.action} />
          <button className="ghost-button" type="submit">
            Criar regra
          </button>
        </form>
      </div>

      <div className="board-card">
        <div className="table-list">
          {automations.map((automation) => (
            <div className="table-row" key={automation.id}>
              <div>
                <strong>{automation.name}</strong>
                <span>{automation.trigger}</span>
              </div>
              <div className="row-stats">
                <span>{automation.action}</span>
                <button
                  className={`filter-pill${automation.enabled ? " is-active" : ""}`}
                  onClick={() => toggleAutomation(automation.id)}
                  type="button"
                >
                  {automation.enabled ? "Ativa" : "Inativa"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default AutomationsPage;
