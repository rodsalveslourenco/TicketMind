import { adminModules } from "../data/mockData";

function AdminPage() {
  return (
    <div className="board-card">
      <div className="card-heading">
        <div>
          <h2>Administração da plataforma</h2>
          <span>Parâmetros centrais para operação enterprise e governança do service desk.</span>
        </div>
      </div>

      <div className="capabilities-grid">
        {adminModules.map((module) => (
          <article className="mini-card" key={module}>
            <strong>{module}</strong>
            <span>Módulo previsto na arquitetura inicial do produto.</span>
          </article>
        ))}
      </div>
    </div>
  );
}

export default AdminPage;
