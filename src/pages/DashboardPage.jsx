import { queues, reports, summary, tickets } from "../data/mockData";

function DashboardPage() {
  return (
    <div className="page-grid">
      <section className="hero-board">
        <div className="metric-grid">
          <article className="metric-card">
            <span>Chamados abertos</span>
            <strong>{summary.openTickets}</strong>
            <small>{summary.backlogTrend}% no backlog da semana</small>
          </article>
          <article className="metric-card">
            <span>Críticos ativos</span>
            <strong>{summary.criticalOpen}</strong>
            <small>Casos que exigem prioridade imediata</small>
          </article>
          <article className="metric-card">
            <span>Primeira resposta</span>
            <strong>{summary.firstResponseMinutes} min</strong>
            <small>Média do time de atendimento</small>
          </article>
          <article className="metric-card">
            <span>Satisfação</span>
            <strong>{summary.csat}/5</strong>
            <small>Baseado nos últimos 30 dias</small>
          </article>
        </div>

        <div className="board-card">
          <div className="card-heading">
            <h2>Filas e equilíbrio de operação</h2>
            <span>{summary.slaCompliance}% dentro do SLA</span>
          </div>
          <div className="table-list">
            {queues.map((queue) => (
              <div className="table-row" key={queue.name}>
                <div>
                  <strong>{queue.name}</strong>
                  <span>{queue.assigned} pessoas alocadas</span>
                </div>
                <div className="row-stats">
                  <span>{queue.open} abertos</span>
                  <span>{queue.overdue} vencidos</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="split-grid">
        <div className="board-card">
          <div className="card-heading">
            <h2>Chamados que merecem atenção</h2>
            <span>Atualização recente da operação</span>
          </div>
          <div className="ticket-stack">
            {tickets.map((ticket) => (
              <article className="ticket-card" key={ticket.id}>
                <div className="ticket-top">
                  <strong>{ticket.id}</strong>
                  <span className={`badge badge-${ticket.priority.toLowerCase()}`}>{ticket.priority}</span>
                </div>
                <h3>{ticket.title}</h3>
                <p>
                  {ticket.type} • {ticket.queue} • {ticket.assignee}
                </p>
                <div className="ticket-meta">
                  <span>{ticket.status}</span>
                  <span>{ticket.sla}</span>
                  <span>{ticket.updatedAt}</span>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="board-card">
          <div className="card-heading">
            <h2>Indicadores executivos</h2>
            <span>Leitura rápida da operação</span>
          </div>
          <div className="kpi-list">
            {reports.map((report) => (
              <div className="kpi-item" key={report.label}>
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
    </div>
  );
}

export default DashboardPage;
