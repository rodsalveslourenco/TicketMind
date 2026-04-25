import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { seedData } from "./seedData";

const STORAGE_KEY = "ticketmind-data";
const AppDataContext = createContext(null);

function readInitialState() {
  const stored = window.localStorage.getItem(STORAGE_KEY);

  if (!stored) {
    return seedData;
  }

  try {
    return JSON.parse(stored);
  } catch {
    return seedData;
  }
}

function formatNow() {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());
}

function nextId(prefix, list) {
  return `${prefix}-${list.length + 1}-${Date.now().toString(36)}`;
}

export function AppDataProvider({ children }) {
  const [data, setData] = useState(readInitialState);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  const summary = useMemo(() => {
    const openTickets = data.tickets.length;
    const criticalOpen = data.tickets.filter((ticket) => ticket.priority === "Crítica").length;
    const waitingApproval = data.tickets.filter(
      (ticket) => ticket.status === "Aguardando aprovação",
    ).length;
    const firstResponseMinutes = Math.max(8, 14 - data.automations.filter((item) => item.enabled).length);
    const csat = 4.7;
    const slaCompliance = openTickets
      ? Number((((openTickets - waitingApproval) / openTickets) * 100).toFixed(1))
      : 100;
    const backlogTrend = openTickets > 12 ? -8 : -2;

    return {
      openTickets,
      criticalOpen,
      waitingApproval,
      firstResponseMinutes,
      csat,
      slaCompliance,
      backlogTrend,
    };
  }, [data]);

  const queueStats = useMemo(
    () =>
      data.queues.map((queue) => {
        const queueTickets = data.tickets.filter((ticket) => ticket.queue === queue.name);
        const overdue = queueTickets.filter(
          (ticket) =>
            ticket.status === "Aguardando aprovação" ||
            ticket.priority === "Crítica" ||
            ticket.sla.toLowerCase().includes("min"),
        ).length;

        return {
          ...queue,
          open: queueTickets.length,
          overdue,
        };
      }),
    [data.queues, data.tickets],
  );

  const createTicket = (payload) => {
    setData((current) => {
      const typeCodeMap = {
        Incidente: "INC",
        Requisição: "REQ",
        Problema: "PRB",
        Mudança: "CHG",
      };
      const nextNumber = (current.tickets.length + 2049).toString().padStart(4, "0");
      const ticket = {
        id: `${typeCodeMap[payload.type] ?? "TCK"}-${nextNumber}`,
        title: payload.title,
        type: payload.type,
        priority: payload.priority,
        status: "Aberto",
        requester: payload.requester,
        assignee: payload.assignee || "Triagem",
        queue: payload.queue,
        sla: payload.priority === "Crítica" ? "15 min" : payload.priority === "Alta" ? "1h" : "4h",
        updatedAt: "Agora",
        description: payload.description,
      };

      return {
        ...current,
        tickets: [ticket, ...current.tickets],
      };
    });
  };

  const updateTicketStatus = (ticketId, status) => {
    setData((current) => ({
      ...current,
      tickets: current.tickets.map((ticket) =>
        ticket.id === ticketId ? { ...ticket, status, updatedAt: "Agora" } : ticket,
      ),
    }));
  };

  const addKnowledgeArticle = (payload) => {
    setData((current) => ({
      ...current,
      knowledgeArticles: [
        {
          id: nextId("kb", current.knowledgeArticles),
          lastUpdate: formatNow(),
          ...payload,
        },
        ...current.knowledgeArticles,
      ],
    }));
  };

  const addAsset = (payload) => {
    setData((current) => ({
      ...current,
      assets: [
        {
          id: nextId("at", current.assets),
          ...payload,
        },
        ...current.assets,
      ],
    }));
  };

  const addAutomation = (payload) => {
    setData((current) => ({
      ...current,
      automations: [
        {
          id: nextId("au", current.automations),
          enabled: true,
          ...payload,
        },
        ...current.automations,
      ],
    }));
  };

  const toggleAutomation = (automationId) => {
    setData((current) => ({
      ...current,
      automations: current.automations.map((automation) =>
        automation.id === automationId
          ? { ...automation, enabled: !automation.enabled }
          : automation,
      ),
    }));
  };

  const addUser = (payload) => {
    setData((current) => ({
      ...current,
      users: [
        {
          id: nextId("usr", current.users),
          status: "Ativo",
          ...payload,
        },
        ...current.users,
      ],
    }));
  };

  const value = useMemo(
    () => ({
      summary,
      queues: queueStats,
      tickets: data.tickets,
      knowledgeArticles: data.knowledgeArticles,
      assets: data.assets,
      automations: data.automations,
      reports: data.reports,
      serviceCatalog: data.serviceCatalog,
      users: data.users,
      createTicket,
      updateTicketStatus,
      addKnowledgeArticle,
      addAsset,
      addAutomation,
      toggleAutomation,
      addUser,
    }),
    [summary, queueStats, data],
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const context = useContext(AppDataContext);

  if (!context) {
    throw new Error("useAppData must be used within AppDataProvider");
  }

  return context;
}
