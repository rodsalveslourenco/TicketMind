import { adminModules } from "../data/mockData";

function AdminPage() {
  return (
    <div className="board-card">
      <div className="card-heading">
        <div>
          <h2>Administração da plataforma</h2>
          <span>Configurações centrais para manter a operação consistente e bem governada.</span>
        </div>
      </div>

      <div className="capabilities-grid">
        {adminModules.map((module) => (
          <article className="mini-card" key={module}>
            <strong>{module}</strong>
            <span>Componente previsto para a próxima evolução do produto.</span>
          </article>
        ))}
      </div>
    </div>
  );
}

export default AdminPage;
