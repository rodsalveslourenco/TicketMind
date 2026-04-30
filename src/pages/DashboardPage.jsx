import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
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

function formatDayLabel(date) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(date);
}

function parseTicketDate(ticket) {
  const parsed = new Date(ticket.openedAt || Date.now());
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getPriorityTone(priority) {
  const normalized = normalizeText(priority);
  if (normalized === "critica") return "critica";
  if (normalized === "alta") return "alta";
  if (normalized === "media") return "media";
  return "baixa";
}

function formatHours(value) {
  if (!Number.isFinite(value) || value <= 0) return "0h";
  if (value < 24) return `${value.toFixed(1)}h`;
  return `${(value / 24).toFixed(1)}d`;
}

function DashboardPage() {
  const { apiConfigs, assets, knowledgeArticles, projects, reports, summary, tickets, users } = useAppData();
  const [periodFilter, setPeriodFilter] = useState("90");
  const [queueFilter, setQueueFilter] = useState("Todas");
  const [assigneeFilter, setAssigneeFilter] = useState("Todos");
  const [search, setSearch] = useState("");

  const activeProjects = useMemo(
    () => projects.filter((project) => normalizeText(project.status) !== "concluido").slice(0, 3),
    [projects],
  );

  const openStatuses = useMemo(
    () => new Set(["aberto", "em andamento", "em atendimento", "aguardando usuario", "aguardando aprovacao", "analise", "reaberto"]),
    [],
  );

  const queueOptions = useMemo(
    () => ["Todas", ...new Set(tickets.map((ticket) => String(ticket.queue || "Sem fila").trim() || "Sem fila"))],
    [tickets],
  );

  const assigneeOptions = useMemo(
    () => ["Todos", ...new Set(tickets.map((ticket) => String(ticket.assignee || "Nao atribuido").trim() || "Nao atribuido"))],
    [tickets],
  );

  const filteredTickets = useMemo(() => {
    const anchorDate = tickets.length
      ? tickets.reduce((latest, ticket) => {
          const openedAt = parseTicketDate(ticket);
          if (!openedAt) return latest;
          return openedAt > latest ? openedAt : latest;
        }, new Date(0))
      : new Date();

    const normalizedSearch = normalizeText(search);

    return tickets.filter((ticket) => {
      const queueName = String(ticket.queue || "Sem fila").trim() || "Sem fila";
      const assigneeName = String(ticket.assignee || "Nao atribuido").trim() || "Nao atribuido";

      if (queueFilter !== "Todas" && queueName !== queueFilter) return false;
      if (assigneeFilter !== "Todos" && assigneeName !== assigneeFilter) return false;

      if (periodFilter !== "all") {
        const openedAt = parseTicketDate(ticket);
        if (!openedAt) return false;
        const periodDays = Number(periodFilter);
        const threshold = new Date(anchorDate);
        threshold.setDate(anchorDate.getDate() - periodDays);
        if (openedAt < threshold) return false;
      }

      if (!normalizedSearch) return true;

      return [
        ticket.id,
        ticket.title,
        ticket.requester,
        ticket.requesterEmail,
        ticket.assignee,
        ticket.queue,
        ticket.status,
        ticket.priority,
        ticket.description,
      ].some((field) => normalizeText(field).includes(normalizedSearch));
    });
  }, [assigneeFilter, periodFilter, queueFilter, search, tickets]);

  const totalTickets = filteredTickets.length;
  const openTickets = filteredTickets.filter((ticket) => openStatuses.has(normalizeText(ticket.status))).length;
  const resolvedTickets = filteredTickets.filter((ticket) => normalizeText(ticket.status) === "resolvido").length;
  const inProgressTickets = filteredTickets.filter((ticket) => {
    const status = normalizeText(ticket.status);
    return status === "em atendimento" || status === "em andamento";
  }).length;
  const overdueTickets = filteredTickets.filter((ticket) => String(ticket.sla || "").toLowerCase().includes("min")).length;
  const criticalOpen = filteredTickets.filter(
    (ticket) => normalizeText(ticket.priority) === "critica" && openStatuses.has(normalizeText(ticket.status)),
  ).length;
  const waitingApproval = filteredTickets.filter(
    (ticket) => normalizeText(ticket.status) === "aguardando aprovacao" || normalizeText(ticket.status) === "aguardando usuario",
  ).length;
  const slaCompliance = openTickets
    ? Number((((openTickets - overdueTickets) / openTickets) * 100).toFixed(1))
    : 100;

  const statusSummary = useMemo(
    () => [
      { label: "Abertos", value: filteredTickets.filter((ticket) => normalizeText(ticket.status) === "aberto").length },
      {
        label: "Em andamento",
        value: filteredTickets.filter((ticket) => {
          const status = normalizeText(ticket.status);
          return status === "em atendimento" || status === "em andamento";
        }).length,
      },
      {
        label: "Aguardando usuario",
        value: filteredTickets.filter((ticket) => {
          const status = normalizeText(ticket.status);
          return status === "aguardando usuario" || status === "aguardando aprovacao";
        }).length,
      },
      { label: "Resolvidos", value: filteredTickets.filter((ticket) => normalizeText(ticket.status) === "resolvido").length },
      { label: "Reaberto", value: filteredTickets.filter((ticket) => normalizeText(ticket.status) === "reaberto").length },
    ],
    [filteredTickets],
  );

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
      label: "Em andamento",
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
      value: criticalOpen,
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
      { label: "Aberto", value: filteredTickets.filter((ticket) => normalizeText(ticket.status) === "aberto").length },
      {
        label: "Em andamento",
        value: filteredTickets.filter((ticket) => {
          const status = normalizeText(ticket.status);
          return status === "em atendimento" || status === "em andamento";
        }).length,
      },
      {
        label: "Aguardando usuario",
        value: filteredTickets.filter((ticket) => {
          const status = normalizeText(ticket.status);
          return status === "aguardando usuario" || status === "aguardando aprovacao";
        }).length,
      },
      { label: "Resolvido", value: filteredTickets.filter((ticket) => normalizeText(ticket.status) === "resolvido").length },
      { label: "Reaberto", value: filteredTickets.filter((ticket) => normalizeText(ticket.status) === "reaberto").length },
    ];
    const maxValue = Math.max(...items.map((item) => item.value), 1);
    return items.map((item) => ({
      ...item,
      percentage: percent(item.value, totalTickets),
      width: Math.max((item.value / maxValue) * 100, item.value ? 16 : 0),
    }));
  }, [filteredTickets, totalTickets]);

  const priorityItems = useMemo(() => {
    const items = [
      { label: "Critica", value: filteredTickets.filter((ticket) => normalizeText(ticket.priority) === "critica").length },
      { label: "Alta", value: filteredTickets.filter((ticket) => normalizeText(ticket.priority) === "alta").length },
      { label: "Media", value: filteredTickets.filter((ticket) => normalizeText(ticket.priority) === "media").length },
      { label: "Baixa", value: filteredTickets.filter((ticket) => normalizeText(ticket.priority) === "baixa").length },
    ];
    const maxValue = Math.max(...items.map((item) => item.value), 1);
    return items.map((item) => ({
      ...item,
      percentage: percent(item.value, totalTickets),
      width: Math.max((item.value / maxValue) * 100, item.value ? 16 : 0),
    }));
  }, [filteredTickets, totalTickets]);

  const queueBreakdown = useMemo(() => {
    const grouped = filteredTickets.reduce((accumulator, ticket) => {
      const queueName = String(ticket.queue || "Sem fila").trim() || "Sem fila";
      if (!accumulator[queueName]) {
        accumulator[queueName] = { label: queueName, total: 0, critical: 0, overdue: 0 };
      }
      accumulator[queueName].total += 1;
      if (normalizeText(ticket.priority) === "critica") accumulator[queueName].critical += 1;
      if (String(ticket.sla || "").toLowerCase().includes("min")) accumulator[queueName].overdue += 1;
      return accumulator;
    }, {});

    const items = Object.values(grouped).sort((left, right) => right.total - left.total);
    const maxValue = Math.max(...items.map((item) => item.total), 1);

    return items.map((item) => ({
      ...item,
      share: percent(item.total, totalTickets),
      width: Math.max((item.total / maxValue) * 100, item.total ? 18 : 0),
    }));
  }, [filteredTickets, totalTickets]);

  const lastFiveDaysSeries = useMemo(() => {
    const anchorDate = filteredTickets.length
      ? filteredTickets.reduce((latest, ticket) => {
          const openedAt = parseTicketDate(ticket);
          if (!openedAt) return latest;
          return openedAt > latest ? openedAt : latest;
        }, new Date(0))
      : new Date();

    const days = [];
    for (let index = 4; index >= 0; index -= 1) {
      const currentDate = new Date(anchorDate);
      currentDate.setHours(0, 0, 0, 0);
      currentDate.setDate(currentDate.getDate() - index);
      days.push({
        key: currentDate.toISOString().slice(0, 10),
        label: formatDayLabel(currentDate),
        total: 0,
      });
    }

    const map = new Map(days.map((day) => [day.key, day]));
    filteredTickets.forEach((ticket) => {
      const openedAt = parseTicketDate(ticket);
      if (!openedAt) return;
      const key = openedAt.toISOString().slice(0, 10);
      const entry = map.get(key);
      if (entry) entry.total += 1;
    });

    const maxValue = Math.max(...days.map((item) => item.total), 1);
    return days.map((item) => ({
      ...item,
      height: Math.max((item.total / maxValue) * 100, item.total ? 20 : 8),
    }));
  }, [filteredTickets]);

  const monthlyTrend = useMemo(() => {
    const monthMap = new Map();
    const anchorDate = filteredTickets.length
      ? filteredTickets.reduce((latest, ticket) => {
          const openedAt = parseTicketDate(ticket);
          if (!openedAt) return latest;
          return openedAt > latest ? openedAt : latest;
        }, new Date(0))
      : new Date();

    for (let index = 5; index >= 0; index -= 1) {
      const date = new Date(anchorDate.getFullYear(), anchorDate.getMonth() - index, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      monthMap.set(key, { key, label: formatMonthLabel(date), total: 0, resolved: 0 });
    }

    filteredTickets.forEach((ticket) => {
      const openedAt = parseTicketDate(ticket);
      if (!openedAt) return;
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
      height: Math.max((item.total / maxValue) * 100, item.total ? 14 : 8),
    }));
  }, [filteredTickets]);

  const assigneePerformance = useMemo(() => {
    const grouped = filteredTickets.reduce((accumulator, ticket) => {
      const assignee = String(ticket.assignee || "Nao atribuido").trim() || "Nao atribuido";
      if (!accumulator[assignee]) {
        accumulator[assignee] = {
          label: assignee,
          total: 0,
          resolved: 0,
          slaRisk: 0,
          openAgeHours: 0,
          openAgeCount: 0,
        };
      }
      const bucket = accumulator[assignee];
      bucket.total += 1;
      if (normalizeText(ticket.status) === "resolvido") bucket.resolved += 1;
      if (String(ticket.sla || "").toLowerCase().includes("min")) bucket.slaRisk += 1;
      const openedAt = parseTicketDate(ticket);
      if (openedAt) {
        bucket.openAgeHours += Math.max((Date.now() - openedAt.getTime()) / (1000 * 60 * 60), 0);
        bucket.openAgeCount += 1;
      }
      return accumulator;
    }, {});

    return Object.values(grouped)
      .sort((left, right) => right.total - left.total)
      .slice(0, 6)
      .map((item) => ({
        ...item,
        slaRate: item.total ? Math.max(100 - percent(item.slaRisk, item.total), 0) : 100,
        averageResolution: item.openAgeCount ? formatHours(item.openAgeHours / item.openAgeCount) : "0h",
      }));
  }, [filteredTickets]);

  const assigneeWorkload = useMemo(() => {
    const grouped = filteredTickets.reduce((accumulator, ticket) => {
      const assignee = String(ticket.assignee || "Nao atribuido").trim() || "Nao atribuido";
      if (!accumulator[assignee]) {
        accumulator[assignee] = { label: assignee, total: 0, critical: 0, inProgress: 0 };
      }
      accumulator[assignee].total += 1;
      if (normalizeText(ticket.priority) === "critica") accumulator[assignee].critical += 1;
      if (normalizeText(ticket.status) === "em atendimento" || normalizeText(ticket.status) === "em andamento") {
        accumulator[assignee].inProgress += 1;
      }
      return accumulator;
    }, {});

    const items = Object.values(grouped).sort((left, right) => right.total - left.total).slice(0, 6);
    const maxValue = Math.max(...items.map((item) => item.total), 1);

    return {
      technicians: items.length,
      total: items.reduce((sum, item) => sum + item.total, 0),
      items: items.map((item) => ({
        ...item,
        share: percent(item.total, totalTickets),
        width: Math.max((item.total / maxValue) * 100, item.total ? 18 : 0),
      })),
    };
  }, [filteredTickets, totalTickets]);

  const slaAlerts = useMemo(() => {
    const urgentAlerts = filteredTickets
      .filter((ticket) => {
        const normalizedSla = String(ticket.sla || "").toLowerCase();
        return normalizedSla.includes("1h") || normalizedSla.includes("min");
      })
      .slice(0, 4)
      .map((ticket) => ({
        id: `${ticket.id}-sla`,
        tone: "warning",
        title: `${ticket.id} estoura SLA em ${ticket.sla}`,
        detail: `${ticket.queue} | ${ticket.assignee || "Sem tecnico"} | ${ticket.title}`,
      }));

    const criticalUnassigned = filteredTickets
      .filter((ticket) => normalizeText(ticket.priority) === "critica")
      .filter((ticket) => {
        const assignee = normalizeText(ticket.assignee);
        return !assignee || assignee === "triagem ti" || assignee === "nao atribuido";
      })
      .slice(0, 4)
      .map((ticket) => ({
        id: `${ticket.id}-critical`,
        tone: "danger",
        title: `${ticket.id} critico aguardando tecnico`,
        detail: `${ticket.queue} | ${ticket.title}`,
      }));

    return [...urgentAlerts, ...criticalUnassigned].slice(0, 6);
  }, [filteredTickets]);

  const knowledgeInsights = useMemo(() => {
    const articles = (knowledgeArticles || []).slice(0, 3).map((article) => ({
      id: article.id,
      title: article.title,
      owner: article.owner || "Base de conhecimento",
      category: article.category || "Procedimento",
      summary: article.solutionApplied || article.problemDescription || "",
    }));
    const notes = filteredTickets
      .filter((ticket) => String(ticket.resolutionNotes || "").trim())
      .slice(0, 5)
      .map((ticket, index) => ({
        id: `${ticket.id}-${index}`,
        title: ticket.title,
        owner: ticket.assignee || "Sem responsavel",
        category: ticket.queue || "Operacao",
        summary: ticket.resolutionNotes,
      }));
    return [...articles, ...notes].slice(0, 5);
  }, [filteredTickets, knowledgeArticles]);

  const platformPulse = [
    { label: "Usuarios TI", value: users.filter((user) => normalizeText(user.department) === "ti").length },
    { label: "Filas ativas", value: queueBreakdown.length },
    { label: "Projetos em curso", value: summary.activeProjects },
    { label: "Integracoes ativas", value: summary.activeApis },
  ];

  const serviceDeskHealth = [
    { label: "SLA", value: `${slaCompliance}%`, note: "Conformidade atual" },
    { label: "CSAT", value: `${summary.csat}/5`, note: "Satisfacao media" },
    { label: "1 resposta", value: `${summary.firstResponseMinutes} min`, note: "Tempo medio" },
    { label: "Aguardando", value: waitingApproval, note: "Dependencia do usuario" },
  ];

  const resetFilters = () => {
    setPeriodFilter("90");
    setQueueFilter("Todas");
    setAssigneeFilter("Todos");
    setSearch("");
  };

  return (
    <div className="page-grid dashboard-grid">
      <section className="module-hero board-card dashboard-filter-shell">
        <div>
          <h2>Dashboard operacional</h2>
          <p>Filtre, busque e aja rapido sobre os chamados e a operacao do service desk.</p>
        </div>
        <div className="dashboard-action-row">
          <input
            className="toolbar-search"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por numero do chamado, usuario, tecnico, fila ou assunto"
            value={search}
          />
          <Link className="ghost-button interactive-button" to="/app/tickets">
            Ver chamados
          </Link>
        </div>
        <div className="glpi-form-grid dashboard-filter-grid">
          <label>
            <span>Periodo</span>
            <select onChange={(event) => setPeriodFilter(event.target.value)} value={periodFilter}>
              <option value="30">Ultimos 30 dias</option>
              <option value="90">Ultimos 90 dias</option>
              <option value="180">Ultimos 180 dias</option>
              <option value="all">Todo o historico</option>
            </select>
          </label>
          <label>
            <span>Fila</span>
            <select onChange={(event) => setQueueFilter(event.target.value)} value={queueFilter}>
              {queueOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Tecnico</span>
            <select onChange={(event) => setAssigneeFilter(event.target.value)} value={assigneeFilter}>
              {assigneeOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <button className="filter-pill interactive-button dashboard-reset-button" onClick={resetFilters} type="button">
            Limpar filtros
          </button>
        </div>
      </section>

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

      <section className="dashboard-status-strip">
        {statusSummary.map((item) => (
          <article className="dashboard-status-card" key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
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
              <h2>Alertas de SLA</h2>
              <span>Chamados mais proximos de impacto imediato</span>
            </div>
          </div>
          <div className="dashboard-alert-list">
            {slaAlerts.length ? (
              slaAlerts.map((alert) => (
                <article className={`dashboard-alert-card dashboard-alert-${alert.tone}`} key={alert.id}>
                  <strong>{alert.title}</strong>
                  <span>{alert.detail}</span>
                </article>
              ))
            ) : (
              <div className="dashboard-empty-state">Nenhum alerta critico no recorte atual.</div>
            )}
          </div>
        </div>
      </section>

      <section className="split-grid split-grid-wide">
        <div className="board-card">
          <div className="card-heading">
            <div>
              <h2>Distribuicao por status</h2>
              <span>Abertos, andamento, usuario, resolvidos e reabertos</span>
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
              <h2>Prioridades</h2>
              <span>Critico vermelho, alto laranja, medio amarelo, baixo verde</span>
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
              <h2>Chamados abertos nos ultimos 5 dias</h2>
              <span>Leitura diaria simples para abertura recente</span>
            </div>
          </div>
          <div className="dashboard-daily-chart">
            {lastFiveDaysSeries.map((item) => (
              <article className="dashboard-daily-column" key={item.key}>
                <div className="dashboard-daily-bar-shell">
                  <div className="dashboard-daily-bar" style={{ height: `${item.height}%` }} />
                </div>
                <strong>{item.total}</strong>
                <span>{item.label}</span>
              </article>
            ))}
          </div>
        </div>

        <div className="board-card">
          <div className="card-heading">
            <div>
              <h2>Chamados abertos por mes</h2>
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
      </section>

      <section className="split-grid split-grid-wide">
        <div className="board-card">
          <div className="card-heading">
            <div>
              <h2>Performance dos tecnicos</h2>
              <span>Chamados, SLA e media estimada com base no recorte atual</span>
            </div>
          </div>
          <div className="dashboard-performance-table">
            <div className="dashboard-performance-head">
              <span>Tecnico</span>
              <span>Chamados</span>
              <span>SLA</span>
              <span>Media</span>
              <span>Resolvidos</span>
            </div>
            {assigneePerformance.map((item) => (
              <div className="dashboard-performance-row" key={item.label}>
                <strong>{item.label}</strong>
                <span>{item.total}</span>
                <span>{item.slaRate}%</span>
                <span>{item.averageResolution}</span>
                <span>{item.resolved}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="board-card">
          <div className="card-heading">
            <div>
              <h2>Carga de trabalho dos tecnicos</h2>
              <span>
                {assigneeWorkload.total} chamados distribuidos entre {assigneeWorkload.technicians} tecnicos
              </span>
            </div>
          </div>
          <div className="dashboard-chart-list">
            {assigneeWorkload.items.map((item) => (
              <div className="dashboard-chart-row dashboard-chart-row-queue" key={item.label}>
                <div className="dashboard-chart-label">
                  <strong>{item.label}</strong>
                  <span>
                    {item.inProgress} em andamento | {item.critical} criticos
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
              <span>Volume real por area com risco de SLA e criticidade</span>
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
              <span>Fila mais quente no momento</span>
            </div>
          </div>
          <div className="ticket-stack">
            {filteredTickets
              .filter((ticket) => {
                const status = normalizeText(ticket.status);
                return normalizeText(ticket.priority) === "critica" || status === "em atendimento" || status === "em andamento";
              })
              .slice(0, 5)
              .map((ticket) => (
                <article className={`ticket-card priority-ticket-card priority-ticket-card-${getPriorityTone(ticket.priority)}`} key={ticket.id}>
                  <div className="ticket-top">
                    <strong>{ticket.id}</strong>
                    <span className={`badge badge-${getPriorityTone(ticket.priority)}`}>{ticket.priority}</span>
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
              <h2>Base de conhecimento aplicada</h2>
              <span>Artigos e solucoes reaproveitaveis a partir dos chamados resolvidos</span>
            </div>
          </div>
          <div className="dashboard-knowledge-list">
            {knowledgeInsights.length ? (
              knowledgeInsights.map((item) => (
                <article className="record-card" key={item.id}>
                  <strong>{item.title}</strong>
                  <span>{item.category} | {item.owner}</span>
                  <p>{item.summary}</p>
                </article>
              ))
            ) : (
              <div className="dashboard-empty-state">Nenhuma solucao aplicada foi registrada no recorte atual.</div>
            )}
          </div>
        </div>

        <div className="board-card">
          <div className="card-heading">
            <div>
              <h2>Projetos, integracoes e ativos</h2>
              <span>Contexto complementar para operacao e sustentacao</span>
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
            {assets.slice(0, 3).map((asset) => (
              <div className="integration-row" key={asset.id}>
                <div>
                  <strong>{asset.name}</strong>
                  <span>{asset.type} | {asset.location}</span>
                </div>
                <span className="badge badge-neutral">{asset.status}</span>
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
