import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { getDepartmentColorStyle } from "../data/departments";
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

function formatDelta(currentValue, previousValue) {
  const delta = Number(currentValue || 0) - Number(previousValue || 0);
  if (delta === 0) return "estavel";
  return `${delta > 0 ? "+" : ""}${delta}`;
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

function getDashboardStorageKey(userId = "") {
  return `ticketmind.dashboard.hidden.${userId || "anon"}`;
}

function DashboardPage() {
  const { user } = useAuth();
  const { departments, knowledgeArticles, operationalReports, summary, tickets } = useAppData();
  const [periodFilter, setPeriodFilter] = useState("90");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [queueFilter, setQueueFilter] = useState("Todas");
  const [assigneeFilter, setAssigneeFilter] = useState("Todos");
  const [search, setSearch] = useState("");
  const [hiddenWidgets, setHiddenWidgets] = useState([]);

  useEffect(() => {
    try {
      const storedValue = window.localStorage.getItem(getDashboardStorageKey(user?.id));
      setHiddenWidgets(storedValue ? JSON.parse(storedValue) : []);
    } catch {
      setHiddenWidgets([]);
    }
  }, [user?.id]);

  useEffect(() => {
    window.localStorage.setItem(getDashboardStorageKey(user?.id), JSON.stringify(hiddenWidgets));
  }, [hiddenWidgets, user?.id]);

  const openStatuses = useMemo(
    () => new Set(["aberto", "em andamento", "em atendimento", "aguardando usuario", "aguardando aprovacao", "analise", "reaberto"]),
    [],
  );

  const departmentDirectory = useMemo(
    () =>
      departments.reduce(
        (accumulator, department) => ({
          ...accumulator,
          [department.id]: department,
        }),
        {},
      ),
    [departments],
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

      if (periodFilter === "custom") {
        const openedAt = parseTicketDate(ticket);
        if (!openedAt) return false;
        const startDate = customStartDate ? new Date(`${customStartDate}T00:00:00`) : null;
        const endDate = customEndDate ? new Date(`${customEndDate}T23:59:59.999`) : null;
        if (startDate && openedAt < startDate) return false;
        if (endDate && openedAt > endDate) return false;
      } else if (periodFilter !== "all") {
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
        ticket.department,
        ticket.status,
        ticket.priority,
        ticket.description,
      ].some((field) => normalizeText(field).includes(normalizedSearch));
    });
  }, [assigneeFilter, customEndDate, customStartDate, periodFilter, queueFilter, search, tickets]);

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
  const waitingApproval = filteredTickets.filter((ticket) => {
    const status = normalizeText(ticket.status);
    return status === "aguardando aprovacao" || status === "aguardando usuario";
  }).length;
  const slaCompliance = openTickets ? Number((((openTickets - overdueTickets) / openTickets) * 100).toFixed(1)) : 100;

  const dashboardKpis = [
    { label: "Total", value: totalTickets, detail: `${openTickets} em fluxo | ${resolvedTickets} resolvidos`, tone: "neutral" },
    { label: "Abertos", value: openTickets, detail: `${summary.backlogTrend}% de backlog recente`, tone: "highlight" },
    { label: "Em andamento", value: inProgressTickets, detail: "Tratamento ativo", tone: "neutral" },
    { label: "SLA sob risco", value: overdueTickets, detail: "Prioridade operacional", tone: "warning" },
    { label: "Criticos", value: criticalOpen, detail: "Maior impacto", tone: "danger" },
    { label: "Aguardando usuario", value: waitingApproval, detail: "Dependencia externa", tone: "neutral" },
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
      days.push({ key: currentDate.toISOString().slice(0, 10), label: formatDayLabel(currentDate), total: 0 });
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

  const departmentBreakdown = useMemo(() => {
    const grouped = filteredTickets.reduce((accumulator, ticket) => {
      const departmentId = String(ticket.departmentId || "").trim();
      const departmentName = String(ticket.department || ticket.queue || "Sem departamento").trim() || "Sem departamento";
      const department = departmentDirectory[departmentId] || null;
      const key = departmentId || departmentName;
      if (!accumulator[key]) {
        accumulator[key] = {
          key,
          id: departmentId,
          label: department?.name || departmentName,
          color: department?.color || "",
          total: 0,
          open: 0,
          critical: 0,
        };
      }
      accumulator[key].total += 1;
      if (openStatuses.has(normalizeText(ticket.status))) accumulator[key].open += 1;
      if (normalizeText(ticket.priority) === "critica") accumulator[key].critical += 1;
      return accumulator;
    }, {});

    const items = Object.values(grouped).sort((left, right) => right.total - left.total);
    const maxValue = Math.max(...items.map((item) => item.total), 1);
    return items.map((item) => ({
      ...item,
      share: percent(item.total, totalTickets),
      width: Math.max((item.total / maxValue) * 100, item.total ? 18 : 0),
    }));
  }, [departmentDirectory, filteredTickets, openStatuses, totalTickets]);

  const assigneePerformance = useMemo(() => {
    const grouped = filteredTickets.reduce((accumulator, ticket) => {
      const assignee = String(ticket.assignee || "Nao atribuido").trim() || "Nao atribuido";
      if (!accumulator[assignee]) {
        accumulator[assignee] = {
          label: assignee,
          total: 0,
          resolved: 0,
          slaRisk: 0,
          critical: 0,
          inProgress: 0,
          openAgeHours: 0,
          openAgeCount: 0,
        };
      }
      const bucket = accumulator[assignee];
      bucket.total += 1;
      if (normalizeText(ticket.status) === "resolvido") bucket.resolved += 1;
      if (String(ticket.sla || "").toLowerCase().includes("min")) bucket.slaRisk += 1;
      if (normalizeText(ticket.priority) === "critica") bucket.critical += 1;
      if (normalizeText(ticket.status) === "em atendimento" || normalizeText(ticket.status) === "em andamento") {
        bucket.inProgress += 1;
      }
      const openedAt = parseTicketDate(ticket);
      if (openedAt) {
        bucket.openAgeHours += Math.max((Date.now() - openedAt.getTime()) / (1000 * 60 * 60), 0);
        bucket.openAgeCount += 1;
      }
      return accumulator;
    }, {});

    return Object.values(grouped)
      .sort((left, right) => right.total - left.total)
      .slice(0, 8)
      .map((item) => ({
        ...item,
        slaRate: item.total ? Math.max(100 - percent(item.slaRisk, item.total), 0) : 100,
        averageResolution: item.openAgeCount ? formatHours(item.openAgeHours / item.openAgeCount) : "0h",
      }));
  }, [filteredTickets]);

  const actionTickets = useMemo(
    () =>
      filteredTickets
        .filter((ticket) => {
          const status = normalizeText(ticket.status);
          return normalizeText(ticket.priority) === "critica" || status === "em atendimento" || status === "em andamento";
        })
        .slice(0, 5),
    [filteredTickets],
  );

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
        title: `${ticket.id} com risco de SLA`,
        detail: `${ticket.department || ticket.queue} | ${ticket.assignee || "Sem tecnico"} | ${ticket.title}`,
      }));

    const criticalUnassigned = filteredTickets
      .filter((ticket) => normalizeText(ticket.priority) === "critica" && (!normalizeText(ticket.assignee) || normalizeText(ticket.assignee) === "nao atribuido"))
      .slice(0, 4)
      .map((ticket) => ({
        id: `${ticket.id}-critical`,
        tone: "danger",
        title: `${ticket.id} critico sem tecnico`,
        detail: `${ticket.department || ticket.queue} | ${ticket.title}`,
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
        category: ticket.department || ticket.queue || "Operacao",
        summary: ticket.resolutionNotes,
      }));
    return [...articles, ...notes].slice(0, 5);
  }, [filteredTickets, knowledgeArticles]);

  const periodComparison = useMemo(() => {
    const periodDays = periodFilter === "custom" || periodFilter === "all" ? 30 : Number(periodFilter) || 30;
    const endDate = customEndDate ? new Date(`${customEndDate}T23:59:59.999`) : new Date();
    const currentStart = customStartDate && periodFilter === "custom"
      ? new Date(`${customStartDate}T00:00:00`)
      : new Date(endDate.getTime() - periodDays * 86400000);
    const previousStart = new Date(currentStart.getTime() - periodDays * 86400000);
    const previousEnd = new Date(currentStart.getTime() - 1);

    const byRange = (start, end) =>
      tickets.filter((ticket) => {
        const openedAt = parseTicketDate(ticket);
        return openedAt && openedAt >= start && openedAt <= end;
      });

    const currentTickets = byRange(currentStart, endDate);
    const previousTickets = byRange(previousStart, previousEnd);
    return {
      current: {
        total: currentTickets.length,
        resolved: currentTickets.filter((ticket) => normalizeText(ticket.status) === "resolvido").length,
        critical: currentTickets.filter((ticket) => normalizeText(ticket.priority) === "critica").length,
      },
      previous: {
        total: previousTickets.length,
        resolved: previousTickets.filter((ticket) => normalizeText(ticket.status) === "resolvido").length,
        critical: previousTickets.filter((ticket) => normalizeText(ticket.priority) === "critica").length,
      },
    };
  }, [customEndDate, customStartDate, periodFilter, tickets]);

  const widgets = [
    { id: "overview", title: "Visao geral dos chamados", category: "Visao geral dos chamados" },
    { id: "department", title: "Chamados por departamento", category: "Chamados por departamento" },
    { id: "alerts", title: "SLA e criticidade", category: "SLA e criticidade" },
    { id: "status", title: "Distribuicao por status", category: "SLA e criticidade" },
    { id: "priority", title: "Distribuicao por prioridade", category: "SLA e criticidade" },
    { id: "volume", title: "Volume por periodo", category: "Volume por periodo" },
    { id: "performance", title: "Performance dos tecnicos", category: "Performance dos tecnicos" },
    { id: "departmentIndicators", title: "Indicadores por departamento", category: "Performance dos tecnicos" },
    { id: "technicianIndicators", title: "Indicadores por tecnico", category: "Performance dos tecnicos" },
    { id: "actions", title: "Chamados que exigem acao", category: "Visao geral dos chamados" },
    { id: "knowledge", title: "Base de conhecimento", category: "Base de conhecimento" },
    { id: "comparison", title: "Comparativo por periodo", category: "Visao geral dos chamados" },
    { id: "executiveAgenda", title: "Agenda executiva", category: "Visao geral dos chamados" },
  ];

  const visibleWidgets = widgets.filter((widget) => !hiddenWidgets.includes(widget.id));
  const hiddenWidgetDefs = widgets.filter((widget) => hiddenWidgets.includes(widget.id));
  const widgetCategories = [...new Set(visibleWidgets.map((widget) => widget.category))];

  const hideWidget = (widgetId) => {
    setHiddenWidgets((current) => (current.includes(widgetId) ? current : [...current, widgetId]));
  };

  const showWidget = (widgetId) => {
    setHiddenWidgets((current) => current.filter((item) => item !== widgetId));
  };

  const resetFilters = () => {
    setPeriodFilter("90");
    setQueueFilter("Todas");
    setAssigneeFilter("Todos");
    setSearch("");
    setCustomStartDate("");
    setCustomEndDate("");
  };

  const renderWidget = (widgetId) => {
    if (widgetId === "overview") {
      return (
        <section className="board-card" key={widgetId}>
          <div className="card-heading dashboard-widget-heading">
            <div>
              <h2>Visao geral dos chamados</h2>
              <span>Resumo objetivo da operacao filtrada</span>
            </div>
            <button className="ghost-button compact-button interactive-button" onClick={() => hideWidget(widgetId)} type="button">
              Ocultar
            </button>
          </div>
          <div className="dashboard-kpi-strip">
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
          </div>
          <div className="dashboard-status-strip">
            <article className="dashboard-status-card">
              <span>SLA atual</span>
              <strong>{slaCompliance}%</strong>
            </article>
            <article className="dashboard-status-card">
              <span>CSAT</span>
              <strong>{summary.csat}/5</strong>
            </article>
            <article className="dashboard-status-card">
              <span>1 resposta</span>
              <strong>{summary.firstResponseMinutes} min</strong>
            </article>
          </div>
        </section>
      );
    }

    if (widgetId === "department") {
      return (
        <section className="board-card" key={widgetId}>
          <div className="card-heading dashboard-widget-heading">
            <div>
              <h2>Chamados por departamento</h2>
              <span>Volume, abertos e criticos por area atendida</span>
            </div>
            <button className="ghost-button compact-button interactive-button" onClick={() => hideWidget(widgetId)} type="button">
              Ocultar
            </button>
          </div>
          <div className="dashboard-chart-list">
            {departmentBreakdown.length ? (
              departmentBreakdown.map((item) => (
                <div className="dashboard-chart-row dashboard-chart-row-queue" key={item.key}>
                  <div className="dashboard-chart-label">
                    <strong className="department-badge" style={getDepartmentColorStyle(item.color, { alpha: 0.16 })}>
                      {item.label}
                    </strong>
                    <span>
                      {item.open} abertos | {item.critical} criticos
                    </span>
                  </div>
                  <div className="dashboard-bar-track">
                    <div className="dashboard-bar-fill dashboard-bar-fill-queue" style={{ width: `${item.width}%`, background: item.color || undefined }} />
                  </div>
                  <strong className="dashboard-chart-value">
                    {item.total} <span>{item.share}%</span>
                  </strong>
                </div>
              ))
            ) : (
              <div className="dashboard-empty-state">Nenhum chamado no recorte atual.</div>
            )}
          </div>
        </section>
      );
    }

    if (widgetId === "alerts") {
      return (
        <section className="board-card" key={widgetId}>
          <div className="card-heading dashboard-widget-heading">
            <div>
              <h2>SLA e criticidade</h2>
              <span>Itens que exigem atencao imediata</span>
            </div>
            <button className="ghost-button compact-button interactive-button" onClick={() => hideWidget(widgetId)} type="button">
              Ocultar
            </button>
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
        </section>
      );
    }

    if (widgetId === "status") {
      return (
        <section className="board-card" key={widgetId}>
          <div className="card-heading dashboard-widget-heading">
            <div>
              <h2>Distribuicao por status</h2>
              <span>Leitura direta do fluxo atual</span>
            </div>
            <button className="ghost-button compact-button interactive-button" onClick={() => hideWidget(widgetId)} type="button">
              Ocultar
            </button>
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
        </section>
      );
    }

    if (widgetId === "priority") {
      return (
        <section className="board-card" key={widgetId}>
          <div className="card-heading dashboard-widget-heading">
            <div>
              <h2>Distribuicao por prioridade</h2>
              <span>Criticidade do backlog filtrado</span>
            </div>
            <button className="ghost-button compact-button interactive-button" onClick={() => hideWidget(widgetId)} type="button">
              Ocultar
            </button>
          </div>
          <div className="dashboard-chart-list">
            {priorityItems.map((item) => (
              <div className="dashboard-chart-row" key={item.label}>
                <div className="dashboard-chart-label">
                  <strong>{item.label}</strong>
                  <span>{item.value} chamados</span>
                </div>
                <div className="dashboard-bar-track dashboard-bar-track-priority">
                  <div className={`dashboard-bar-fill dashboard-bar-fill-${normalizeText(item.label)}`} style={{ width: `${item.width}%` }} />
                </div>
                <strong className="dashboard-chart-value">{item.percentage}%</strong>
              </div>
            ))}
          </div>
        </section>
      );
    }

    if (widgetId === "volume") {
      return (
        <section className="board-card" key={widgetId}>
          <div className="card-heading dashboard-widget-heading">
            <div>
              <h2>Volume por periodo</h2>
              <span>Abertura recente e comportamento mensal</span>
            </div>
            <button className="ghost-button compact-button interactive-button" onClick={() => hideWidget(widgetId)} type="button">
              Ocultar
            </button>
          </div>
          <div className="split-grid split-grid-wide">
            <div>
              <strong className="dashboard-section-title">Ultimos 5 dias</strong>
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
            <div>
              <strong className="dashboard-section-title">Ultimos 6 meses</strong>
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
                        <div className="dashboard-month-bar-resolved" style={{ height: `${item.total ? (item.resolved / item.total) * item.height : 0}%` }} />
                      </div>
                    </div>
                    <span className="dashboard-month-label">{item.label}</span>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>
      );
    }

    if (widgetId === "performance") {
      return (
        <section className="board-card" key={widgetId}>
          <div className="card-heading dashboard-widget-heading">
            <div>
              <h2>Performance dos tecnicos</h2>
              <span>Volume, SLA, criticidade e media de atendimento</span>
            </div>
            <button className="ghost-button compact-button interactive-button" onClick={() => hideWidget(widgetId)} type="button">
              Ocultar
            </button>
          </div>
          <div className="dashboard-performance-table">
            <div className="dashboard-performance-head">
              <span>Tecnico</span>
              <span>Chamados</span>
              <span>SLA</span>
              <span>Criticos</span>
              <span>Andamento</span>
              <span>Media</span>
            </div>
            {assigneePerformance.map((item) => (
              <div className="dashboard-performance-row" key={item.label}>
                <strong>{item.label}</strong>
                <span>{item.total}</span>
                <span>{item.slaRate}%</span>
                <span>{item.critical}</span>
                <span>{item.inProgress}</span>
                <span>{item.averageResolution}</span>
              </div>
            ))}
          </div>
        </section>
      );
    }

    if (widgetId === "departmentIndicators") {
      return (
        <section className="board-card" key={widgetId}>
          <div className="card-heading dashboard-widget-heading">
            <div>
              <h2>Indicadores por departamento</h2>
              <span>Leitura executiva de volume, abertos e criticidade por area.</span>
            </div>
            <button className="ghost-button compact-button interactive-button" onClick={() => hideWidget(widgetId)} type="button">
              Ocultar
            </button>
          </div>
          <div className="dashboard-performance-table">
            <div className="dashboard-performance-head">
              <span>Departamento</span>
              <span>Total</span>
              <span>Abertos</span>
              <span>Criticos</span>
              <span>Share</span>
            </div>
            {departmentBreakdown.map((item) => (
              <div className="dashboard-performance-row" key={item.key}>
                <strong>{item.label}</strong>
                <span>{item.total}</span>
                <span>{item.open}</span>
                <span>{item.critical}</span>
                <span>{item.share}%</span>
              </div>
            ))}
          </div>
        </section>
      );
    }

    if (widgetId === "technicianIndicators") {
      return (
        <section className="board-card" key={widgetId}>
          <div className="card-heading dashboard-widget-heading">
            <div>
              <h2>Indicadores por tecnico</h2>
              <span>Volume, SLA, criticidade e idade media por responsavel.</span>
            </div>
            <button className="ghost-button compact-button interactive-button" onClick={() => hideWidget(widgetId)} type="button">
              Ocultar
            </button>
          </div>
          <div className="dashboard-performance-table">
            <div className="dashboard-performance-head">
              <span>Tecnico</span>
              <span>Total</span>
              <span>SLA</span>
              <span>Criticos</span>
              <span>Media</span>
            </div>
            {assigneePerformance.map((item) => (
              <div className="dashboard-performance-row" key={item.label}>
                <strong>{item.label}</strong>
                <span>{item.total}</span>
                <span>{item.slaRate}%</span>
                <span>{item.critical}</span>
                <span>{item.averageResolution}</span>
              </div>
            ))}
          </div>
        </section>
      );
    }

    if (widgetId === "actions") {
      return (
        <section className="board-card" key={widgetId}>
          <div className="card-heading dashboard-widget-heading">
            <div>
              <h2>Chamados que exigem acao</h2>
              <span>Criticos ou em tratamento no momento</span>
            </div>
            <button className="ghost-button compact-button interactive-button" onClick={() => hideWidget(widgetId)} type="button">
              Ocultar
            </button>
          </div>
          <div className="ticket-stack">
            {actionTickets.length ? (
              actionTickets.map((ticket) => (
                <article className={`ticket-card priority-ticket-card priority-ticket-card-${getPriorityTone(ticket.priority)}`} key={ticket.id}>
                  <div className="ticket-top">
                    <strong>{ticket.id}</strong>
                    <span className={`badge badge-${getPriorityTone(ticket.priority)}`}>{ticket.priority}</span>
                  </div>
                  <h3>{ticket.title}</h3>
                  <p>{ticket.department || ticket.queue} | {ticket.assignee || "Sem tecnico"} | {ticket.status}</p>
                  <div className="ticket-meta">
                    <span>{ticket.requester}</span>
                    <span>{ticket.sla}</span>
                    <span>{ticket.updatedAt}</span>
                  </div>
                </article>
              ))
            ) : (
              <div className="dashboard-empty-state">Nenhum chamado exige acao imediata no recorte atual.</div>
            )}
          </div>
        </section>
      );
    }

    if (widgetId === "knowledge") {
      return (
        <section className="board-card" key={widgetId}>
          <div className="card-heading dashboard-widget-heading">
            <div>
              <h2>Base de conhecimento</h2>
              <span>Artigos e solucoes reaproveitaveis do atendimento</span>
            </div>
            <button className="ghost-button compact-button interactive-button" onClick={() => hideWidget(widgetId)} type="button">
              Ocultar
            </button>
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
        </section>
      );
    }

    if (widgetId === "comparison") {
      return (
        <section className="board-card" key={widgetId}>
          <div className="card-heading dashboard-widget-heading">
            <div>
              <h2>Comparativo por periodo</h2>
              <span>Leitura entre periodo atual e janela imediatamente anterior.</span>
            </div>
            <button className="ghost-button compact-button interactive-button" onClick={() => hideWidget(widgetId)} type="button">
              Ocultar
            </button>
          </div>
          <div className="dashboard-performance-table">
            <div className="dashboard-performance-head">
              <span>Indicador</span>
              <span>Atual</span>
              <span>Anterior</span>
              <span>Delta</span>
            </div>
            {[
              { label: "Chamados", current: periodComparison.current.total, previous: periodComparison.previous.total },
              { label: "Resolvidos", current: periodComparison.current.resolved, previous: periodComparison.previous.resolved },
              { label: "Criticos", current: periodComparison.current.critical, previous: periodComparison.previous.critical },
            ].map((item) => (
              <div className="dashboard-performance-row" key={`comparison-${item.label}`}>
                <strong>{item.label}</strong>
                <span>{item.current}</span>
                <span>{item.previous}</span>
                <span>{formatDelta(item.current, item.previous)}</span>
              </div>
            ))}
          </div>
        </section>
      );
    }

    if (widgetId === "executiveAgenda") {
      return (
        <section className="board-card" key={widgetId}>
          <div className="card-heading dashboard-widget-heading">
            <div>
              <h2>Agenda executiva</h2>
              <span>Projetos, chamados criticos e pendencias operacionais prioritarias.</span>
            </div>
            <button className="ghost-button compact-button interactive-button" onClick={() => hideWidget(widgetId)} type="button">
              Ocultar
            </button>
          </div>
          <div className="split-grid split-grid-wide">
            <div className="dashboard-performance-table">
              <div className="dashboard-performance-head">
                <span>Projetos</span>
                <span>Status</span>
                <span>Prazo</span>
              </div>
              {operationalReports.executiveAgenda.projectAgenda.length ? operationalReports.executiveAgenda.projectAgenda.map((project) => (
                <div className="dashboard-performance-row" key={`dashboard-project-${project.id}`}>
                  <strong>{project.name}</strong>
                  <span>{project.status}</span>
                  <span>{project.deadlineDays < 0 ? `${Math.abs(project.deadlineDays)} dia(s) em atraso` : `${project.deadlineDays} dia(s)`}</span>
                </div>
              )) : <div className="dashboard-empty-state">Nenhum projeto critico no horizonte imediato.</div>}
            </div>
            <div className="dashboard-performance-table">
              <div className="dashboard-performance-head">
                <span>Acoes</span>
                <span>Tipo</span>
                <span>Responsavel</span>
              </div>
              {[...operationalReports.executiveAgenda.pendingActions.slice(0, 3), ...operationalReports.executiveAgenda.pendingApprovals.slice(0, 3)].map((ticket) => (
                <div className="dashboard-performance-row" key={`dashboard-agenda-${ticket.id}`}>
                  <strong>{ticket.id}</strong>
                  <span>{ticket.approvalPending ? "Aprovacao" : "Backlog"}</span>
                  <span>{ticket.assignee || ticket.approval?.currentApproverName || "Sem responsavel"}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      );
    }

    return null;
  };

  return (
    <div className="page-grid dashboard-grid">
      <section className="module-hero board-card dashboard-filter-shell">
        <div>
          <h2>Dashboard operacional</h2>
          <p>Leitura objetiva da operacao do helpdesk, com widgets personalizaveis por usuario.</p>
        </div>
        <div className="dashboard-action-row">
          <input
            className="toolbar-search"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por chamado, usuario, tecnico, departamento ou assunto"
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
              <option value="custom">Periodo personalizado</option>
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
          {periodFilter === "custom" ? (
            <>
              <label>
                <span>Data inicial</span>
                <input onChange={(event) => setCustomStartDate(event.target.value)} type="date" value={customStartDate} />
              </label>
              <label>
                <span>Data final</span>
                <input onChange={(event) => setCustomEndDate(event.target.value)} type="date" value={customEndDate} />
              </label>
            </>
          ) : null}
          <button className="filter-pill interactive-button dashboard-reset-button" onClick={resetFilters} type="button">
            Limpar filtros
          </button>
        </div>
        {hiddenWidgetDefs.length ? (
          <div className="board-card compact-record-card">
            <strong>Widgets ocultos</strong>
            <span>Reexiba qualquer bloco ocultado neste dashboard.</span>
            <div className="permissions-inline users-grid-config">
              {hiddenWidgetDefs.map((widget) => (
                <button className="ghost-button compact-button interactive-button" key={widget.id} onClick={() => showWidget(widget.id)} type="button">
                  Mostrar {widget.title}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {widgetCategories.map((category) => (
        <section className="dashboard-category-section" key={category}>
          <div className="card-heading">
            <div>
              <h2>{category}</h2>
              <span>Painel organizado por contexto operacional.</span>
            </div>
          </div>
          <div className="split-grid split-grid-wide">
            {visibleWidgets.filter((widget) => widget.category === category).map((widget) => renderWidget(widget.id))}
          </div>
        </section>
      ))}
    </div>
  );
}

export default DashboardPage;













