import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { hasAnyPermission } from "../data/permissions";
import { useAppData } from "../data/AppDataContext";

function HelpdeskOperationsPage() {
  const { dailyOpenings, operationalTickets, priorityBuckets, slaAlerts, statusBuckets } = useAppData();
  const { user } = useAuth();
  const canView = hasAnyPermission(user, ["helpdesk_indicators_view", "sla_alerts_view", "tickets_admin"]);

  if (!canView) {
    return <Navigate replace to="/app/tickets" />;
  }

  return (
    <div className="page-grid">
      <section className="board-card">
        <div className="card-heading">
          <div>
            <h2>Indicadores operacionais</h2>
            <span>Dados reais da fila atual, usando os chamados persistidos no sistema.</span>
          </div>
          <Link className="ghost-button interactive-button" to="/app/tickets">
            Ver chamados
          </Link>
        </div>

        <div className="dashboard-kpi-strip compact-kpi-strip">
          <div className="dashboard-kpi-card">
            <span>Total no recorte</span>
            <strong>{operationalTickets.length}</strong>
          </div>
          <div className="dashboard-kpi-card dashboard-kpi-card-warning">
            <span>Alertas SLA</span>
            <strong>{slaAlerts.length}</strong>
          </div>
        </div>
      </section>

      <section className="board-card">
        <div className="card-heading">
          <div>
            <h2>Chamados abertos nos ultimos 5 dias</h2>
            <span>Evolucao diaria da abertura de tickets.</span>
          </div>
        </div>
        <div className="dashboard-daily-chart">
          {dailyOpenings.map((item) => (
            <div className="dashboard-daily-column" key={item.key}>
              <strong>{item.value}</strong>
              <div className="dashboard-daily-bar-shell">
                <div className="dashboard-daily-bar" style={{ height: `${Math.max(item.value * 18, item.value ? 36 : 10)}px` }} />
              </div>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="board-card">
        <div className="card-heading">
          <div>
            <h2>Chamados por status</h2>
            <span>Status operacionais usados no fluxo real de atendimento.</span>
          </div>
        </div>
        <div className="dashboard-chart-list">
          {statusBuckets.map((item) => (
            <div className="dashboard-chart-row" key={item.label}>
              <div className="dashboard-chart-label">
                <strong>{item.label}</strong>
              </div>
              <div className="dashboard-bar-track">
                <div className="dashboard-bar-fill dashboard-bar-fill-queue" style={{ width: `${Math.max(item.value * 8, item.value ? 12 : 0)}%` }} />
              </div>
              <strong className="dashboard-chart-value">{item.value}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="board-card">
        <div className="card-heading">
          <div>
            <h2>Chamados por prioridade</h2>
            <span>Prioridade operacional com cores padronizadas no sistema.</span>
          </div>
        </div>
        <div className="dashboard-chart-list">
          {priorityBuckets.map((item) => (
            <div className="dashboard-chart-row" key={item.label}>
              <div className="dashboard-chart-label">
                <strong>{item.label}</strong>
              </div>
              <div className="dashboard-bar-track dashboard-bar-track-priority">
                <div className={`dashboard-bar-fill dashboard-bar-fill-${item.label.toLowerCase()}`} style={{ width: `${Math.max(item.value * 8, item.value ? 12 : 0)}%` }} />
              </div>
              <strong className="dashboard-chart-value">{item.value}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="board-card">
        <div className="card-heading">
          <div>
            <h2>Alertas de SLA</h2>
            <span>Itens que vencem em ate 1 hora, vencidos, criticos sem tecnico ou sem atribuicao.</span>
          </div>
        </div>
        <div className="dashboard-alert-list">
          {slaAlerts.length ? (
            slaAlerts.map((ticket) => (
              <article className={`dashboard-alert-card ${ticket.isOverdue || ticket.criticalWaitingTechnician ? "dashboard-alert-danger" : "dashboard-alert-warning"}`} key={ticket.id}>
                <strong>{ticket.id} | {ticket.title}</strong>
                <span>{ticket.requester} | {ticket.assignee || "Sem tecnico"} | {ticket.slaLabel}</span>
              </article>
            ))
          ) : (
            <div className="dashboard-empty-state">Nenhum alerta operacional de SLA no momento.</div>
          )}
        </div>
      </section>
    </div>
  );
}

export default HelpdeskOperationsPage;
