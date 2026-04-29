import { useMemo } from "react";
import { useAppData } from "../data/AppDataContext";

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function percent(value, total) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function formatMonthLabel(date) {
  return new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date).replace(".", "");
}

function DashboardPage() {
  const { apiConfigs, assets, projects, reports, summary, tickets, users } = useAppData();

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
        .slice(0, 5),
    [tickets],
  );

  const openStatuses = useMemo(
    () => new Set(["aberto", "em atendimento", "aguardando aprovacao", "analise"]),
    [],
  );

  const totalTickets = tickets.length;
  const openTickets = tickets.filter((ticket) => openStatuses.has(normalizeText(ticket.status))).length;
  const resolvedTickets = tickets.filter((ticket) => normalizeText(ticket.status) === "resolvido").length;
  const inProgressTickets = tickets.filter((ticket) => normalizeText(ticket.status) === "em atendimento").length;
  const overdueTickets = tickets.filter((ticket) => ticket.sla.toLowerCase().includes("min")).length;

  const dashboardKpis = [
    {
      label: "Total de chamados",
      value: totalTickets,
      detail: `${openTickets} em fluxo | ${resolvedTickets} resolvidos`,
      tone: "neutral",
    },
    {
      label: "Chamados abertos",
      value: openTickets,
      detail: `${summary.backlogTrend}% no backlog recente`,
      tone: "highlight",
    },
    {
      label: "Em atendimento",
      value: inProgressTickets,
      detail: "Chamados em tratamento ativo",
      tone: "neutral",
    },
    {
      label: "SLA sob risco",
      value: overdueTickets,
      detail: "Itens com prazo mais sensivel",
      tone: "warning",
    },
    {
      label: "Criticos",
      value: summary.criticalOpen,
      detail: "Maior impacto para a operacao",
      tone: "danger",
    },
    {
      label: "Ativos monitorados",
      value: summary.activeAssets,
      detail: `${summary.activeProjects} projetos | ${summary.activeApis} APIs ativas`,
      tone: "neutral",
    },
  ];

  const statusItems = useMemo(() => {
    const items = [
      { label: "Aberto", value: tickets.filter((ticket) => normalizeText(ticket.status) === "aberto").length },
      {
        label: "Em atendimento",
        value: tickets.filter((ticket) => normalizeText(ticket.status) === "em atendimento").length,
      },
      {
        label: "Aguardando aprovacao",
        value: tickets.filter((ticket) => normalizeText(ticket.status) === "aguardando aprovacao").length,
      },
      { label: "Analise", value: tickets.filter((ticket) => normalizeText(ticket.status) === "analise").length },
      { label: "Resolvido", value: tickets.filter((ticket) => normalizeText(ticket.status) === "resolvido").length },
    ];
    const maxValue = Math.max(...items.map((item) => item.value), 1);
    return items.map((item) => ({
      ...item,
      percentage: percent(item.value, totalTickets),
      width: Math.max((item.value / maxValue) * 100, item.value ? 16 : 0),
    }));
  }, [tickets, totalTickets]);

  const priorityItems = useMemo(() => {
    const items = [
      { label: "Critica", value: tickets.filter((ticket) => normalizeText(ticket.priority) === "critica").length },
      { label: "Alta", value: tickets.filter((ticket) => normalizeText(ticket.priority) === "alta").length },
      { label: "Media", value: tickets.filter((ticket) => normalizeText(ticket.priority) === "media").length },
      { label: "Baixa", value: tickets.filter((ticket) => normalizeText(ticket.priority) === "baixa").length },
    ];
    const maxValue = Math.max(...items.map((item) => item.value), 1);
    return items.map((item) => ({
      ...item,
      percentage: percent(item.value, totalTickets),
      width: Math.max((item.value / maxValue) * 100, item.value ? 16 : 0),
    }));
  }, [tickets, totalTickets]);

  const queueBreakdown = useMemo(() => {
    const grouped = tickets.reduce((accumulator, ticket) => {
      const queueName = String(ticket.queue || "Sem fila").trim() || "Sem fila";
      if (!accumulator[queueName]) {
        accumulator[queueName] = {
          label: queueName,
          total: 0,
          critical: 0,
          overdue: 0,
        };
      }
      accumulator[queueName].total += 1;
      if (normalizeText(ticket.priority) === "critica") accumulator[queueName].critical += 1;
      if (ticket.sla.toLowerCase().includes("min")) accumulator[queueName].overdue += 1;
      return accumulator;
    }, {});

    const items = Object.values(grouped).sort((left, right) => right.total - left.total);
    const maxValue = Math.max(...items.map((item) => item.total), 1);

    return items.map((item) => ({
      ...item,
      share: percent(item.total, totalTickets),
      width: Math.max((item.total / maxValue) * 100, item.total ? 18 : 0),
    }));
  }, [tickets, totalTickets]);

  const platformPulse = [
    { label: "Usuarios TI", value: users.filter((user) => normalizeText(user.department) === "ti").length },
    { label: "Filas ativas", value: queueBreakdown.length },
    { label: "Projetos em curso", value: summary.activeProjects },
    { label: "Integracoes ativas", value: summary.activeApis },
  ];

  const monthlyTrend = useMemo(() => {
    const monthMap = new Map();
    const anchorDate = tickets.length
      ? tickets.reduce((latest, ticket) => {
          const openedAt = new Date(ticket.openedAt || Date.now());
          return openedAt > latest ? openedAt : latest;
        }, new Date(0))
      : new Date();

    for (let index = 5; index >= 0; index -= 1) {
      const date = new Date(anchorDate.getFullYear(), anchorDate.getMonth() - index, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      monthMap.set(key, {
        key,
        label: formatMonthLabel(date),
        total: 0,
        resolved: 0,
      });
    }

    tickets.forEach((ticket) => {
      const openedAt = new Date(ticket.openedAt || Date.now());
      if (Number.isNaN(openedAt.getTime())) return;
      const key = `${openedAt.getFullYear()}-${String(openedAt.getMonth() + 1).padStart(2, "0")}`;
      const monthEntry = monthMap.get(key);
      if (!monthEntry) return;
      monthEntry.total += 1;
      if (normalizeText(ticket.status) === "resolvido") monthEntry.resolved += 1;
    });

    const items = [...monthMap.values()];
    const maxValue = Math.max(...items.map((item) => item.total), 1);
    return items.map((item) => ({
      ...item,
      open: Math.max(item.total - item.resolved, 0),
      height: Math.max((item.total / maxValue) * 100, item.total ? 14 : 8),
    }));
  }, [tickets]);

  const assigneeLoad = useMemo(() => {
    const grouped = tickets.reduce((accumulator, ticket) => {
      const assignee = String(ticket.assignee || "Nao atribuido").trim() || "Nao atribuido";
      if (!accumulator[assignee]) {
        accumulator[assignee] = {
          label: assignee,
          total: 0,
          inProgress: 0,
          critical: 0,
        };
      }
      accumulator[assignee].total += 1;
      if (normalizeText(ticket.status) === "em atendimento") accumulator[assignee].inProgress += 1;
      if (normalizeText(ticket.priority) === "critica") accumulator[assignee].critical += 1;
      return accumulator;
    }, {});

    const items = Object.values(grouped)
      .sort((left, right) => right.total - left.total)
      .slice(0, 6);
    const maxValue = Math.max(...items.map((item) => item.total), 1);

    return items.map((item) => ({
      ...item,
      share: percent(item.total, totalTickets),
      width: Math.max((item.total / maxValue) * 100, item.total ? 18 : 0),
    }));
  }, [tickets, totalTickets]);

  const serviceDeskHealth = [
    { label: "SLA", value: `${summary.slaCompliance}%`, note: "Conformidade atual" },
    { label: "CSAT", value: `${summary.csat}/5`, note: "Satisfacao media" },
    { label: "1 resposta", value: `${summary.firstResponseMinutes} min`, note: "Tempo medio" },
    { label: "Aprovacao", value: summary.waitingApproval, note: "Aguardando retorno" },
  ];

  return (
    <div className="page-grid dashboard-grid">
      <section className="dashboard-kpi-strip">
        {dashboardKpis.map((item) => (
          <article
            className={`dashboard-kpi-card ${
              item.tone === "highlight"
                ? "dashboard-kpi-card-highlight"
                : item.tone === "warning"
                  ? "dashboard-kpi-card-warning"
                  : item.tone === "danger"
                    ? "dashboard-kpi-card-danger"
                    : ""
            }`}
            key={item.label}
          >
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.detail}</small>
          </article>
        ))}
      </section>

      <section className="split-grid split-grid-wide">
        <div className="board-card dashboard-overview-card">
          <div className="card-heading">
            <div>
              <h2>Visao executiva do atendimento</h2>
              <span>Leitura rapida do volume e da qualidade operacional</span>
            </div>
          </div>

          <div className="dashboard-overview-grid">
            <div className="dashboard-overview-main">
              <strong>{openTickets}</strong>
              <span>chamados ativos na operacao</span>
            </div>
            <div className="dashboard-overview-list">
              {serviceDeskHealth.map((item) => (
                <article className="dashboard-stat-card" key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                  <small>{item.note}</small>
                </article>
              ))}
            </div>
          </div>
        </div>

        <div className="board-card">
          <div className="card-heading">
            <div>
              <h2>Pulso da plataforma</h2>
              <span>Base operacional e capacidade instalada</span>
            </div>
          </div>
          <div className="mini-grid">
            {platformPulse.map((item) => (
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
              <h2>Distribuicao por status</h2>
              <span>Como o volume esta espalhado no fluxo de atendimento</span>
            </div>
          </div>
          <div className="dashboard-chart-list">
            {statusItems.map((item) => (
              <div className="dashboard-chart-row" key={item.label}>
                <div className="dashboard-chart-label">
                  <strong>{item.label}</strong>
                  <span>{item.value} chamados</span>
                </div>
                <div className="dashboard-bar-track">
                  <div className="dashboard-bar-fill" style={{ width: `${item.width}%` }} />
                </div>
                <strong className="dashboard-chart-value">{item.percentage}%</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="board-card">
          <div className="card-heading">
            <div>
              <h2>Distribuicao por prioridade</h2>
              <span>Pressao de risco e urgencia da fila atual</span>
            </div>
          </div>
          <div className="dashboard-chart-list">
            {priorityItems.map((item) => (
              <div className="dashboard-chart-row" key={item.label}>
                <div className="dashboard-chart-label">
                  <strong>{item.label}</strong>
                  <span>{item.value} chamados</span>
                </div>
                <div className="dashboard-bar-track dashboard-bar-track-priority">
                  <div
                    className={`dashboard-bar-fill dashboard-bar-fill-${normalizeText(item.label)}`}
                    style={{ width: `${item.width}%` }}
                  />
                </div>
                <strong className="dashboard-chart-value">{item.percentage}%</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="split-grid split-grid-wide">
        <div className="board-card">
          <div className="card-heading">
            <div>
              <h2>Tendencia dos chamados</h2>
              <span>Ultimos 6 meses de abertura e resolucao</span>
            </div>
          </div>
          <div className="dashboard-monthly-chart">
            {monthlyTrend.map((item) => (
              <article className="dashboard-month-column" key={item.key}>
                <div className="dashboard-month-metrics">
                  <strong>{item.total}</strong>
                  <span>{item.resolved} resolvidos</span>
                </div>
                <div className="dashboard-month-bar-shell">
                  <div className="dashboard-month-bar-track">
                    <div className="dashboard-month-bar-open" style={{ height: `${item.height}%` }} />
                    <div
                      className="dashboard-month-bar-resolved"
                      style={{ height: `${item.total ? (item.resolved / item.total) * item.height : 0}%` }}
                    />
                  </div>
                </div>
                <span className="dashboard-month-label">{item.label}</span>
              </article>
            ))}
          </div>
        </div>

        <div className="board-card">
          <div className="card-heading">
            <div>
              <h2>Carga por tecnico</h2>
              <span>Distribuicao atual entre os responsaveis</span>
            </div>
          </div>
          <div className="dashboard-chart-list">
            {assigneeLoad.map((item) => (
              <div className="dashboard-chart-row dashboard-chart-row-queue" key={item.label}>
                <div className="dashboard-chart-label">
                  <strong>{item.label}</strong>
                  <span>
                    {item.inProgress} em atendimento | {item.critical} criticos
                  </span>
                </div>
                <div className="dashboard-bar-track">
                  <div className="dashboard-bar-fill dashboard-bar-fill-assignee" style={{ width: `${item.width}%` }} />
                </div>
                <strong className="dashboard-chart-value">
                  {item.total} <span>{item.share}%</span>
                </strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="split-grid split-grid-wide">
        <div className="board-card">
          <div className="card-heading">
            <div>
              <h2>Backlog por fila</h2>
              <span>Volume real por area, sem a visao artificial de capacidade</span>
            </div>
          </div>
          <div className="dashboard-chart-list">
            {queueBreakdown.map((item) => (
              <div className="dashboard-chart-row dashboard-chart-row-queue" key={item.label}>
                <div className="dashboard-chart-label">
                  <strong>{item.label}</strong>
                  <span>
                    {item.critical} criticos | {item.overdue} sob risco de SLA
                  </span>
                </div>
                <div className="dashboard-bar-track">
                  <div className="dashboard-bar-fill dashboard-bar-fill-queue" style={{ width: `${item.width}%` }} />
                </div>
                <strong className="dashboard-chart-value">
                  {item.total} <span>{item.share}%</span>
                </strong>
              </div>
            ))}
          </div>
        </div>

        <div className="board-card">
          <div className="card-heading">
            <div>
              <h2>Chamados que exigem acao</h2>
              <span>Itens mais proximos de impacto operacional</span>
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
      </section>

      <section className="split-grid split-grid-wide">
        <div className="board-card">
          <div className="card-heading">
            <div>
              <h2>Projetos e integracoes</h2>
              <span>Visibilidade de entregas e dependencias externas</span>
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

        <div className="board-card">
          <div className="card-heading">
            <div>
              <h2>Ativos monitorados</h2>
              <span>Itens relevantes para a operacao corrente</span>
            </div>
          </div>
          <div className="table-list">
            {assets.slice(0, 5).map((asset) => (
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
            <span>Leitura consolidada de performance do service desk</span>
          </div>
        </div>
        <div className="kpi-list kpi-list-wide">
          {reports.map((report) => (
            <div className="kpi-item" key={report.id}>
              <div>
                <strong>{report.label}</strong>
                <span>Tendencia no periodo</span>
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
