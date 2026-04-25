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

function formatDateTime() {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date());
}

function formatDate() {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
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
    const openStatuses = ["Aberto", "Em atendimento", "Aguardando aprovação", "Análise"];
    const openTickets = data.tickets.filter((ticket) => openStatuses.includes(ticket.status)).length;
    const criticalOpen = data.tickets.filter(
      (ticket) => ticket.priority === "Crítica" && openStatuses.includes(ticket.status),
    ).length;
    const waitingApproval = data.tickets.filter(
      (ticket) => ticket.status === "Aguardando aprovação",
    ).length;
    const solved = data.tickets.filter((ticket) => ticket.status === "Resolvido").length;
    const slaCompliance = openTickets
      ? Number((((openTickets - waitingApproval) / openTickets) * 100).toFixed(1))
      : 100;

    return {
      openTickets,
      criticalOpen,
      waitingApproval,
      solved,
      firstResponseMinutes: 11,
      csat: 4.7,
      slaCompliance,
      backlogTrend: openTickets > 12 ? -8 : -3,
    };
  }, [data.tickets]);

  const queueStats = useMemo(
    () =>
      data.queues.map((queue) => {
        const queueTickets = data.tickets.filter((ticket) => ticket.queue === queue.name);

        return {
          ...queue,
          open: queueTickets.length,
          overdue: queueTickets.filter((ticket) => ticket.sla.toLowerCase().includes("min")).length,
        };
      }),
    [data.queues, data.tickets],
  );

  const createTicket = (payload) => {
    let createdTicket = null;

    setData((current) => {
      const typeCodeMap = {
        Incidente: "INC",
        Requisição: "REQ",
        Problema: "PRB",
      };
      const nextNumber = (current.tickets.length + 2049).toString().padStart(4, "0");
      createdTicket = {
        id: `${typeCodeMap[payload.type] ?? "TCK"}-${nextNumber}`,
        title: payload.title,
        type: payload.type,
        priority: payload.priority,
        status: "Aberto",
        requester: payload.requester,
        assignee: payload.assignee || "Triagem",
        queue: payload.queue,
        category: payload.category,
        source: payload.source,
        sla: payload.priority === "Crítica" ? "15 min" : payload.priority === "Alta" ? "1h" : "4h",
        updatedAt: "Agora",
        createdAt: formatDateTime(),
        dueDate: payload.dueDate || formatDate(),
        description: payload.description,
        resolutionNotes: "",
        watchers: payload.watchers || "",
        attachments: payload.attachments || [],
      };

      return {
        ...current,
        tickets: [createdTicket, ...current.tickets],
      };
    });

    return createdTicket;
  };

  const updateTicket = (ticketId, updates) => {
    setData((current) => ({
      ...current,
      tickets: current.tickets.map((ticket) =>
        ticket.id === ticketId
          ? {
              ...ticket,
              ...updates,
              updatedAt: "Agora",
            }
          : ticket,
      ),
    }));
  };

  const deleteTicket = (ticketId) => {
    setData((current) => ({
      ...current,
      tickets: current.tickets.filter((ticket) => ticket.id !== ticketId),
    }));
  };

  const addTicketAttachments = (ticketId, attachments) => {
    setData((current) => ({
      ...current,
      tickets: current.tickets.map((ticket) =>
        ticket.id === ticketId
          ? {
              ...ticket,
              attachments: [...(ticket.attachments || []), ...attachments],
              updatedAt: "Agora",
            }
          : ticket,
      ),
    }));
  };

  const removeTicketAttachment = (ticketId, attachmentId) => {
    setData((current) => ({
      ...current,
      tickets: current.tickets.map((ticket) =>
        ticket.id === ticketId
          ? {
              ...ticket,
              attachments: (ticket.attachments || []).filter(
                (attachment) => attachment.id !== attachmentId,
              ),
              updatedAt: "Agora",
            }
          : ticket,
      ),
    }));
  };

  const addKnowledgeArticle = (payload) => {
    setData((current) => ({
      ...current,
      knowledgeArticles: [
        {
          id: nextId("kb", current.knowledgeArticles),
          lastUpdate: formatDate(),
          ...payload,
        },
        ...current.knowledgeArticles,
      ],
    }));
  };

  const value = useMemo(
    () => ({
      summary,
      queues: queueStats,
      tickets: data.tickets,
      knowledgeArticles: data.knowledgeArticles,
      reports: data.reports,
      createTicket,
      updateTicket,
      deleteTicket,
      addTicketAttachments,
      removeTicketAttachment,
      addKnowledgeArticle,
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
