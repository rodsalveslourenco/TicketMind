import { automations } from "../data/mockData";

function AutomationsPage() {
  return (
    <div className="board-card">
      <div className="card-heading">
        <div>
          <h2>SLAs, regras e automações</h2>
          <span>Escalonamento, alertas, gatilhos e fluxos que economizam tempo da equipe.</span>
        </div>
      </div>

      <div className="table-list">
        {automations.map((automation) => (
          <div className="table-row" key={automation.name}>
            <div>
              <strong>{automation.name}</strong>
              <span>{automation.trigger}</span>
            </div>
            <div className="row-stats">
              <span>{automation.action}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default AutomationsPage;
