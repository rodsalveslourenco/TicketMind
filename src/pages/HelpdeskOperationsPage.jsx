import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { hasAnyPermission } from "../data/permissions";
import { useAppData } from "../data/AppDataContext";
import { exportRowsWithFormat, getExportFormatLabel } from "../lib/export";

function formatMinutes(minutes) {
  if (!minutes) return "0 min";
  if (minutes < 60) return `${minutes} min`;
  return `${(minutes / 60).toFixed(1)} h`;
}

function HelpdeskOperationsPage() {
  const { dailyOpenings, operationalReports, operationalTickets, priorityBuckets, slaAlerts, statusBuckets, pushToast } = useAppData();
  const { user } = useAuth();
  const canView = hasAnyPermission(user, ["helpdesk_indicators_view", "sla_alerts_view", "tickets_admin"]);
  const approvalQueue = operationalTickets.filter((ticket) => ticket.approvalPending);

  if (!canView) {
    return <Navigate replace to="/app/tickets" />;
  }

  const exportSection = (format, key, columns, items, title) => {
    if (!items.length) {
      pushToast("Sem dados", "Nao ha registros no recorte atual para exportar.", "warning");
      return;
    }
    exportRowsWithFormat({
      format,
      fileName: `ticketmind-${key}-${new Date().toISOString().slice(0, 10)}`,
      title,
      sheetName: title,
      columns,
      items,
    });
    pushToast("Exportacao concluida", `${items.length} registro(s) preparados em ${getExportFormatLabel(format)}.`);
  };

  const groupedSections = [
    { id: "tecnico", title: "Por tecnico", items: operationalReports.byTechnician },
    { id: "departamento", title: "Por departamento", items: operationalReports.byDepartment },
    { id: "categoria", title: "Por categoria", items: operationalReports.byCategory },
    { id: "prioridade", title: "Por prioridade", items: operationalReports.byPriority },
    { id: "origem", title: "Por origem", items: operationalReports.bySource },
  ];

  const groupedColumns = [
    { key: "label", label: "Recorte" },
    { key: "total", label: "Total" },
    { key: "open", label: "Abertos" },
    { key: "resolved", label: "Resolvidos" },
    { key: "overdue", label: "Fora SLA" },
    { key: "critical", label: "Criticos" },
  ];

  return (
    <div className="page-grid">
      <section className="board-card">
        <div className="card-heading">
          <div>
            <h2>Indicadores operacionais</h2>
            <span>Relatorios consolidados da fila, backlog, produtividade e aprovacoes.</span>
          </div>
          <div className="toolbar">
            <Link className="ghost-button interactive-button" to="/app/tickets">
              Ver chamados
            </Link>
            <button className="ghost-button interactive-button" onClick={() => exportSection("csv", "operacoes-helpdesk", [
              { key: "id", label: "Chamado" },
              { key: "title", label: "Titulo" },
              { key: "status", label: "Status" },
              { key: "priority", label: "Prioridade" },
              { key: "department", label: "Departamento" },
              { key: "category", label: "Categoria" },
              { key: "source", label: "Origem" },
              { key: "assignee", label: "Tecnico" },
              { key: "slaLabel", label: "SLA resolucao" },
              { key: "initialResponseLabel", label: "SLA 1a resposta" },
            ], operationalTickets, "Relatorio operacional de chamados")} type="button">
              CSV
            </button>
            <button className="ghost-button interactive-button" onClick={() => exportSection("excel", "operacoes-helpdesk", [
              { key: "id", label: "Chamado" },
              { key: "title", label: "Titulo" },
              { key: "status", label: "Status" },
              { key: "priority", label: "Prioridade" },
              { key: "department", label: "Departamento" },
              { key: "category", label: "Categoria" },
              { key: "source", label: "Origem" },
              { key: "assignee", label: "Tecnico" },
              { key: "slaLabel", label: "SLA resolucao" },
              { key: "initialResponseLabel", label: "SLA 1a resposta" },
            ], operationalTickets, "Relatorio operacional de chamados")} type="button">
              Excel
            </button>
          </div>
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
          <div className="dashboard-kpi-card">
            <span>Aprovacoes pendentes</span>
            <strong>{approvalQueue.length}</strong>
          </div>
          <div className="dashboard-kpi-card">
            <span>1a resposta media</span>
            <strong>{formatMinutes(operationalReports.productivity.averageFirstResponseMinutes)}</strong>
          </div>
          <div className="dashboard-kpi-card">
            <span>Resolucao media</span>
            <strong>{formatMinutes(operationalReports.productivity.averageResolutionMinutes)}</strong>
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
            <h2>Distribuicoes da fila</h2>
            <span>Status e prioridade para leitura imediata do backlog.</span>
          </div>
        </div>
        <div className="split-grid split-grid-wide">
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
        </div>
      </section>

      {groupedSections.map((section) => (
        <section className="board-card" key={section.id}>
          <div className="card-heading">
            <div>
              <h2>Relatorio {section.title.toLowerCase()}</h2>
              <span>Total, abertos, resolvidos, fora de SLA e criticos.</span>
            </div>
            <div className="toolbar">
              <button className="ghost-button compact-button interactive-button" onClick={() => exportSection("csv", `relatorio-${section.id}`, groupedColumns, section.items, `Relatorio ${section.title}`)} type="button">
                CSV
              </button>
              <button className="ghost-button compact-button interactive-button" onClick={() => exportSection("excel", `relatorio-${section.id}`, groupedColumns, section.items, `Relatorio ${section.title}`)} type="button">
                Excel
              </button>
            </div>
          </div>
          <div className="dashboard-performance-table">
            <div className="dashboard-performance-head">
              <span>Recorte</span>
              <span>Total</span>
              <span>Abertos</span>
              <span>Resolvidos</span>
              <span>Fora SLA</span>
              <span>Criticos</span>
            </div>
            {section.items.map((item) => (
              <div className="dashboard-performance-row" key={`${section.id}-${item.label}`}>
                <strong>{item.label}</strong>
                <span>{item.total}</span>
                <span>{item.open}</span>
                <span>{item.resolved}</span>
                <span>{item.overdue}</span>
                <span>{item.critical}</span>
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className="board-card">
        <div className="card-heading">
          <div>
            <h2>Produtividade tecnica</h2>
            <span>Tempo medio de resposta e resolucao por tecnico.</span>
          </div>
          <div className="toolbar">
            <button className="ghost-button compact-button interactive-button" onClick={() => exportSection("csv", "produtividade-tecnicos", [
              { key: "name", label: "Tecnico" },
              { key: "assignedCount", label: "Atribuidos" },
              { key: "resolvedCount", label: "Resolvidos" },
              { key: "averageResolutionMinutes", label: "Resolucao media", render: (item) => formatMinutes(item.averageResolutionMinutes) },
              { key: "slaRate", label: "% SLA", render: (item) => `${item.slaRate}%` },
            ], operationalReports.productivity.technicians, "Produtividade tecnica")} type="button">
              CSV
            </button>
            <button className="ghost-button compact-button interactive-button" onClick={() => exportSection("excel", "produtividade-tecnicos", [
              { key: "name", label: "Tecnico" },
              { key: "assignedCount", label: "Atribuidos" },
              { key: "resolvedCount", label: "Resolvidos" },
              { key: "averageResolutionMinutes", label: "Resolucao media", render: (item) => formatMinutes(item.averageResolutionMinutes) },
              { key: "slaRate", label: "% SLA", render: (item) => `${item.slaRate}%` },
            ], operationalReports.productivity.technicians, "Produtividade tecnica")} type="button">
              Excel
            </button>
          </div>
        </div>
        <div className="dashboard-performance-table">
          <div className="dashboard-performance-head">
            <span>Tecnico</span>
            <span>Atribuidos</span>
            <span>Resolvidos</span>
            <span>Dentro SLA</span>
            <span>Fora SLA</span>
            <span>Resolucao media</span>
            <span>% SLA</span>
          </div>
          {operationalReports.productivity.technicians.map((item) => (
            <div className="dashboard-performance-row" key={item.id}>
              <strong>{item.name}</strong>
              <span>{item.assignedCount}</span>
              <span>{item.resolvedCount}</span>
              <span>{item.withinSlaCount}</span>
              <span>{item.outSlaCount}</span>
              <span>{formatMinutes(item.averageResolutionMinutes)}</span>
              <span>{item.slaRate}%</span>
            </div>
          ))}
        </div>
      </section>

      <section className="board-card">
        <div className="card-heading">
          <div>
            <h2>Aprovacoes</h2>
            <span>Pendentes, aprovadas e reprovadas com trilha de decisao.</span>
          </div>
        </div>
        <div className="dashboard-kpi-strip compact-kpi-strip">
          <div className="dashboard-kpi-card"><span>Pendentes</span><strong>{operationalReports.approvals.summary.pending}</strong></div>
          <div className="dashboard-kpi-card"><span>Aprovadas</span><strong>{operationalReports.approvals.summary.approved}</strong></div>
          <div className="dashboard-kpi-card"><span>Reprovadas</span><strong>{operationalReports.approvals.summary.rejected}</strong></div>
        </div>
        <div className="dashboard-performance-table">
          <div className="dashboard-performance-head">
            <span>Chamado</span>
            <span>Solicitante</span>
            <span>Aprovador</span>
            <span>Status</span>
            <span>Prazo</span>
            <span>Justificativa</span>
          </div>
          {operationalReports.approvals.rows.map((item) => (
            <div className="dashboard-performance-row" key={`approval-${item.id}`}>
              <strong>{item.id}</strong>
              <span>{item.requester}</span>
              <span>{item.approver}</span>
              <span>{item.status}</span>
              <span>{item.dueLabel}</span>
              <span>{item.decisionReason || "-"}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="board-card">
        <div className="card-heading">
          <div>
            <h2>Reincidencia e backlog</h2>
            <span>Reaberturas por solicitante, ativo e categoria, com leitura por faixa de SLA.</span>
          </div>
        </div>
        <div className="split-grid split-grid-wide">
          <div className="dashboard-performance-table">
            <div className="dashboard-performance-head">
              <span>Solicitante</span>
              <span>Chamados</span>
              <span>Reincidencias</span>
            </div>
            {operationalReports.recurrence.byRequester.slice(0, 8).map((item) => (
              <div className="dashboard-performance-row" key={`recurrence-requester-${item.label}`}>
                <strong>{item.label}</strong>
                <span>{item.tickets}</span>
                <span>{item.recurrences}</span>
              </div>
            ))}
          </div>
          <div className="dashboard-performance-table">
            <div className="dashboard-performance-head">
              <span>Ativo</span>
              <span>Chamados</span>
              <span>Reincidencias</span>
            </div>
            {operationalReports.recurrence.byAsset.slice(0, 8).map((item) => (
              <div className="dashboard-performance-row" key={`recurrence-asset-${item.label}`}>
                <strong>{item.label}</strong>
                <span>{item.tickets}</span>
                <span>{item.recurrences}</span>
              </div>
            ))}
          </div>
          <div className="dashboard-performance-table">
            <div className="dashboard-performance-head">
              <span>Categoria / SLA</span>
              <span>Volume</span>
            </div>
            {operationalReports.recurrence.byCategory.slice(0, 4).map((item) => (
              <div className="dashboard-performance-row" key={`recurrence-category-${item.label}`}>
                <strong>{item.label}</strong>
                <span>{item.recurrences}</span>
              </div>
            ))}
            {operationalReports.backlogBySla.map((item) => (
              <div className="dashboard-performance-row" key={`backlog-${item.label}`}>
                <strong>{item.label}</strong>
                <span>{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

export default HelpdeskOperationsPage;
