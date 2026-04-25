import { useAppData } from "../data/AppDataContext";

function ReportsPage() {
  const { reports, summary, tickets } = useAppData();

  return (
    <div className="page-grid">
      <div className="capabilities-grid">
        {reports.map((report) => (
          <article className="mini-card" key={report.id}>
            <strong>{report.label}</strong>
            <span>{report.value}</span>
            <small>{report.trend}</small>
          </article>
        ))}
      </div>

      <div className="board-card">
        <div className="card-heading">
          <div>
            <h2>Resumo operacional</h2>
            <span>Indicadores consolidados a partir dos dados registrados no ambiente.</span>
          </div>
        </div>

        <div className="table-list">
          <div className="table-row">
            <div>
              <strong>Total de chamados</strong>
              <span>Volume atual da operação</span>
            </div>
            <div className="row-stats">
              <span>{tickets.length}</span>
            </div>
          </div>
          <div className="table-row">
            <div>
              <strong>Chamados críticos</strong>
              <span>Itens com maior prioridade</span>
            </div>
            <div className="row-stats">
              <span>{summary.criticalOpen}</span>
            </div>
          </div>
          <div className="table-row">
            <div>
              <strong>Conformidade de SLA</strong>
              <span>Atendimentos dentro do prazo</span>
            </div>
            <div className="row-stats">
              <span>{summary.slaCompliance}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ReportsPage;
