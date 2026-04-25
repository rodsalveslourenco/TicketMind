import { useAppData } from "../data/AppDataContext";

function DashboardPage() {
  const { queues, reports, summary, tickets } = useAppData();
  const spotlightTickets = tickets.slice(0, 5);

  return (
    <div className="page-grid">
      <section className="metric-grid">
        <article className="metric-card">
          <span>Chamados abertos</span>
          <strong>{summary.openTickets}</strong>
          <small>{summary.backlogTrend}% no backlog da semana</small>
        </article>
        <article className="metric-card">
          <span>Críticos ativos</span>
          <strong>{summary.criticalOpen}</strong>
          <small>Casos que exigem tratamento imediato</small>
        </article>
        <article className="metric-card">
          <span>Primeira resposta</span>
          <strong>{summary.firstResponseMinutes} min</strong>
          <small>Média operacional atual</small>
        </article>
        <article className="metric-card">
          <span>Resolvidos</span>
          <strong>{summary.solved}</strong>
          <small>Encerrados no período recente</small>
        </article>
      </section>

      <section className="split-grid split-grid-wide">
        <div className="board-card">
          <div className="card-heading">
            <div>
              <h2>Fila por equipe</h2>
              <span>Distribuição atual dos chamados em atendimento</span>
            </div>
          </div>
          <div className="table-list">
            {queues.map((queue) => (
              <div className="table-row" key={queue.id}>
                <div>
                  <strong>{queue.name}</strong>
                  <span>{queue.assigned} agentes alocados</span>
                </div>
                <div className="row-stats">
                  <span>{queue.open} chamados</span>
                  <span>{queue.overdue} próximos do SLA</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="board-card">
          <div className="card-heading">
            <div>
              <h2>Indicadores</h2>
              <span>Visão executiva da operação</span>
            </div>
          </div>
          <div className="kpi-list">
            {reports.map((report) => (
              <div className="kpi-item" key={report.id}>
                <div>
                  <strong>{report.label}</strong>
                  <span>Tendência no período</span>
                </div>
                <div className="kpi-value">
                  <strong>{report.value}</strong>
                  <span>{report.trend}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="board-card">
        <div className="card-heading">
          <div>
            <h2>Chamados recentes</h2>
            <span>Itens que exigem acompanhamento de agente</span>
          </div>
        </div>
        <div className="ticket-stack">
          {spotlightTickets.map((ticket) => (
            <article className="ticket-card" key={ticket.id}>
              <div className="ticket-top">
                <strong>{ticket.id}</strong>
                <span className={`badge badge-${ticket.priority.toLowerCase()}`}>{ticket.priority}</span>
              </div>
              <h3>{ticket.title}</h3>
              <p>
                {ticket.queue} • {ticket.assignee} • {ticket.status}
              </p>
              <div className="ticket-meta">
                <span>{ticket.requester}</span>
                <span>{ticket.sla}</span>
                <span>{ticket.updatedAt}</span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

export default DashboardPage;
