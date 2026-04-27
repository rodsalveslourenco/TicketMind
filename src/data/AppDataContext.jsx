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

function formatDate(isoValue) {
  if (!isoValue) {
    return "";
  }

  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(isoValue));
}

function formatTimestamp(isoValue) {
  if (!isoValue) {
    return "";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(isoValue));
}

function toLocalDatetimeInput(isoValue) {
  if (!isoValue) {
    return "";
  }

  const date = new Date(isoValue);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function nextId(prefix, list) {
  return `${prefix}-${list.length + 1}-${Date.now().toString(36)}`;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function computePriority(urgency, impact) {
  const scoreMap = { baixa: 1, media: 2, alta: 3, critica: 4 };
  const score = Math.max(scoreMap[normalizeText(urgency)] ?? 2, scoreMap[normalizeText(impact)] ?? 2);

  if (score >= 4) return "Critica";
  if (score === 3) return "Alta";
  if (score === 2) return "Media";
  return "Baixa";
}

function computeSla(priority) {
  const normalizedPriority = normalizeText(priority);
  if (normalizedPriority === "critica") return "15 min";
  if (normalizedPriority === "alta") return "1h";
  if (normalizedPriority === "media") return "4h";
  return "8h";
}

export function AppDataProvider({ children }) {
  const [data, setData] = useState(readInitialState);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  const summary = useMemo(() => {
    const openStatuses = ["Aberto", "Em atendimento", "Aguardando aprovacao", "Analise"];
    const openTickets = data.tickets.filter((ticket) => openStatuses.includes(ticket.status)).length;
    const criticalOpen = data.tickets.filter(
      (ticket) => normalizeText(ticket.priority) === "critica" && openStatuses.includes(ticket.status),
    ).length;
    const waitingApproval = data.tickets.filter(
      (ticket) => normalizeText(ticket.status) === "aguardando aprovacao",
    ).length;
    const solved = data.tickets.filter((ticket) => normalizeText(ticket.status) === "resolvido").length;
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
      const typeCodeMap = { incidente: "INC", requisicao: "REQ", problema: "PRB" };
      const nextNumber = (current.tickets.length + 2049).toString().padStart(4, "0");
      const openedAt = payload.openedAt || new Date().toISOString();
      const priority = computePriority(payload.urgency, payload.impact);

      createdTicket = {
        id: `${typeCodeMap[normalizeText(payload.type)] ?? "TCK"}-${nextNumber}`,
        title: payload.title,
        type: payload.type,
        priority,
        urgency: payload.urgency,
        impact: payload.impact,
        status: "Aberto",
        requester: payload.requester,
        assignee: payload.assignee || "Triagem TI",
        queue: payload.queue,
        category: payload.category,
        source: payload.source,
        location: payload.location,
        sla: computeSla(priority),
        updatedAt: "Agora",
        openedAt,
        openedAtLabel: formatTimestamp(openedAt),
        dueDate: payload.dueDate || "",
        dueDateLabel: payload.dueDate ? formatDate(payload.dueDate) : "",
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
      tickets: current.tickets.map((ticket) => {
        if (ticket.id !== ticketId) {
          return ticket;
        }

        const nextUrgency = updates.urgency ?? ticket.urgency;
        const nextImpact = updates.impact ?? ticket.impact;
        const priority = computePriority(nextUrgency, nextImpact);
        const openedAt = updates.openedAt ?? ticket.openedAt;
        const dueDate = updates.dueDate ?? ticket.dueDate;

        return {
          ...ticket,
          ...updates,
          urgency: nextUrgency,
          impact: nextImpact,
          priority,
          sla: computeSla(priority),
          openedAt,
          openedAtLabel: formatTimestamp(openedAt),
          dueDate,
          dueDateLabel: dueDate ? formatDate(dueDate) : "",
          updatedAt: "Agora",
        };
      }),
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

  const addUser = (payload) => {
    let createdUser = null;

    setData((current) => {
      createdUser = {
        id: nextId("u", current.users || []),
        name: payload.name,
        email: payload.email,
        role: payload.role,
        team: payload.team,
        department: payload.department,
      };

      return {
        ...current,
        users: [createdUser, ...(current.users || [])],
      };
    });

    return createdUser;
  };

  const value = useMemo(
    () => ({
      summary,
      queues: queueStats,
      users: data.users || [],
      tickets: data.tickets,
      knowledgeArticles: data.knowledgeArticles,
      reports: data.reports,
      createTicket,
      updateTicket,
      deleteTicket,
      addTicketAttachments,
      removeTicketAttachment,
      addUser,
      toLocalDatetimeInput,
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
