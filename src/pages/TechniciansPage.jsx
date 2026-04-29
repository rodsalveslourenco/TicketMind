import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { hasAnyPermission } from "../data/permissions";
import { useAppData } from "../data/AppDataContext";

function formatAverage(minutes) {
  if (!minutes) return "0 min";
  if (minutes < 60) return `${minutes} min`;
  return `${(minutes / 60).toFixed(1)} h`;
}

function TechniciansPage() {
  const { technicianMetrics } = useAppData();
  const { user } = useAuth();
  const canView = hasAnyPermission(user, ["technicians_performance_view", "technicians_workload_view", "tickets_admin"]);

  if (!canView) {
    return <Navigate replace to="/app/tickets" />;
  }

  return (
    <div className="page-grid">
      <section className="board-card">
        <div className="card-heading">
          <div>
            <h2>Gestao de tecnicos</h2>
            <span>Performance e carga de trabalho calculadas com os chamados reais do sistema.</span>
          </div>
        </div>

        <div className="dashboard-performance-table">
          <div className="dashboard-performance-head">
            <span>Tecnico</span>
            <span>Atribuidos</span>
            <span>Resolvidos</span>
            <span>Dentro SLA</span>
            <span>Fora SLA</span>
            <span>Media resolucao</span>
            <span>% SLA</span>
          </div>
          {technicianMetrics.map((item) => (
            <div className="dashboard-performance-row" key={item.id}>
              <strong>{item.name}</strong>
              <span>{item.assignedCount}</span>
              <span>{item.resolvedCount}</span>
              <span>{item.withinSlaCount}</span>
              <span>{item.outSlaCount}</span>
              <span>{formatAverage(item.averageResolutionMinutes)}</span>
              <span>{item.slaRate}%</span>
            </div>
          ))}
        </div>
      </section>

      <section className="board-card">
        <div className="card-heading">
          <div>
            <h2>Carga de trabalho por tecnico</h2>
            <span>Visao para redistribuicao de fila entre analistas e especialistas.</span>
          </div>
        </div>

        <div className="dashboard-performance-table">
          <div className="dashboard-performance-head">
            <span>Tecnico</span>
            <span>Total</span>
            <span>Abertos</span>
            <span>Em andamento</span>
            <span>Aguardando usuario</span>
            <span>Criticos</span>
          </div>
          {technicianMetrics.map((item) => (
            <div className="dashboard-performance-row" key={`${item.id}-workload`}>
              <strong>{item.name}</strong>
              <span>{item.assignedCount}</span>
              <span>{item.openAssigned}</span>
              <span>{item.inProgress}</span>
              <span>{item.waitingUser}</span>
              <span>{item.critical}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default TechniciansPage;
