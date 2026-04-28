import { useMemo } from "react";
import { useAppData } from "../data/AppDataContext";

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function DashboardPage() {
  const { apiConfigs, assets, projects, queues, reports, summary, tickets, users } = useAppData();

  const activeProjects = useMemo(
    () => projects.filter((project) => normalizeText(project.status) !== "concluido").slice(0, 3),
    [projects],
  );

  const criticalTickets = useMemo(
    () =>
      tickets
        .filter(
          (ticket) =>
            normalizeText(ticket.priority) === "critica" ||
            normalizeText(ticket.status) === "em atendimento",
        )
        .slice(0, 4),
    [tickets],
  );

  const technologyPulse = [
    { label: "Usuários TI", value: users.filter((user) => normalizeText(user.department) === "ti").length },
    { label: "Ativos ativos", value: summary.activeAssets },
    { label: "Projetos em curso", value: summary.activeProjects },
    { label: "APIs ativas", value: summary.activeApis },
  ];

  const statusBoard = [
    {
      label: "Em atendimento",
      value: tickets.filter((ticket) => normalizeText(ticket.status) === "em atendimento").length,
    },
    { label: "Aguardando aprova\u00e7\u00e3o", value: summary.waitingApproval },
    { label: "Resolvidos", value: summary.solved },
    { label: "Resposta inicial", value: `${summary.firstResponseMinutes} min` },
  ];

  return (
    <div className="page-grid dashboard-grid">
      <section className="metric-grid metric-grid-hero">
        <article className="metric-card metric-card-highlight">
          <span>Fila operacional</span>
          <strong>{summary.openTickets}</strong>
          <small>{summary.backlogTrend}% no backlog recente</small>
        </article>
        <article className="metric-card">
          <span>Chamados criticos</span>
          <strong>{summary.criticalOpen}</strong>
          <small>Itens com maior risco para a operação</small>
        </article>
        <article className="metric-card">
          <span>SLA</span>
          <strong>{summary.slaCompliance}%</strong>
          <small>Conformidade da fila ativa</small>
        </article>
        <article className="metric-card">
          <span>CSAT</span>
          <strong>{summary.csat}/5</strong>
          <small>Percepção média do atendimento</small>
        </article>
      </section>

      <section className="split-grid split-grid-wide">
        <div className="board-card">
          <div className="card-heading">
            <div>
              <h2>Capacidade por fila</h2>
            </div>
          </div>
          <div className="table-list">
            {queues.map((queue) => (
              <div className="table-row" key={queue.id}>
                <div>
                  <strong>{queue.name}</strong>
                  <span>{queue.assigned} técnicos alocados</span>
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
              <h2>Pulso da plataforma</h2>
            </div>
          </div>
          <div className="mini-grid">
            {technologyPulse.map((item) => (
              <article className="mini-card" key={item.label}>
                <strong>{item.value}</strong>
                <span>{item.label}</span>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="split-grid split-grid-wide">
        <div className="board-card">
          <div className="card-heading">
            <div>
              <h2>Chamados que exigem ação</h2>
            </div>
          </div>
          <div className="ticket-stack">
            {criticalTickets.map((ticket) => (
              <article className="ticket-card" key={ticket.id}>
                <div className="ticket-top">
                  <strong>{ticket.id}</strong>
                  <span
                    className={`badge ${
                      normalizeText(ticket.priority) === "critica" ? "badge-critica" : "badge-alta"
                    }`}
                  >
                    {ticket.priority}
                  </span>
                </div>
                <h3>{ticket.title}</h3>
                <p>{ticket.queue} | {ticket.assignee} | {ticket.status}</p>
                <div className="ticket-meta">
                  <span>{ticket.requester}</span>
                  <span>{ticket.sla}</span>
                  <span>{ticket.updatedAt}</span>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="board-card">
          <div className="card-heading">
            <div>
              <h2>Projetos e integrações</h2>
            </div>
          </div>
          <div className="dashboard-column">
            {activeProjects.map((project) => (
              <div className="project-snapshot" key={project.id}>
                <div>
                  <strong>{project.name}</strong>
                  <span>{project.manager} | entrega {project.dueDate}</span>
                </div>
                <div className="progress-shell">
                  <div className="progress-bar" style={{ width: `${project.progress}%` }} />
                </div>
              </div>
            ))}
            {apiConfigs.map((config) => (
              <div className="integration-row" key={config.id}>
                <div>
                  <strong>{config.name}</strong>
                  <span>{config.baseUrl}</span>
                </div>
                <span className="badge badge-neutral">{config.status}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="split-grid split-grid-wide">
        <div className="board-card">
          <div className="card-heading">
            <div>
              <h2>Status operacional</h2>
            </div>
          </div>
          <div className="mini-grid">
            {statusBoard.map((item) => (
              <article className="mini-card" key={item.label}>
                <strong>{item.value}</strong>
                <span>{item.label}</span>
              </article>
            ))}
          </div>
        </div>

        <div className="board-card">
          <div className="card-heading">
            <div>
              <h2>Ativos monitorados</h2>
            </div>
          </div>
          <div className="table-list">
            {assets.slice(0, 4).map((asset) => (
              <div className="table-row" key={asset.id}>
                <div>
                  <strong>{asset.name}</strong>
                  <span>{asset.type} | {asset.location}</span>
                </div>
                <div className="row-stats">
                  <span>{asset.owner}</span>
                  <span>{asset.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="board-card">
        <div className="card-heading">
          <div>
            <h2>Indicadores executivos</h2>
          </div>
        </div>
        <div className="kpi-list kpi-list-wide">
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
      </section>
    </div>
  );
}

export default DashboardPage;
