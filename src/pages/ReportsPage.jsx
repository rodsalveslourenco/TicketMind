import { reports } from "../data/mockData";

function ReportsPage() {
  return (
    <div className="board-card">
      <div className="card-heading">
        <div>
          <h2>Relatórios e indicadores</h2>
          <span>Volume, SLA, produtividade, satisfação, backlog e auditoria.</span>
        </div>
      </div>

      <div className="capabilities-grid">
        {reports.map((report) => (
          <article className="mini-card" key={report.label}>
            <strong>{report.label}</strong>
            <span>{report.value}</span>
            <small>{report.trend}</small>
          </article>
        ))}
      </div>
    </div>
  );
}

export default ReportsPage;
