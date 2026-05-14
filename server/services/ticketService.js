import { normalizeText } from "../../src/data/helpdesk.js";

function toPositiveInteger(value, fallback = 50, max = 250) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 1) return fallback;
  return Math.min(Math.floor(normalized), max);
}

function filterTickets(tickets = [], filters = {}) {
  const {
    status = "",
    priority = "",
    assignee = "",
    requesterId = "",
    departmentId = "",
    updatedSince = "",
    q = "",
  } = filters;
  const updatedSinceDate = updatedSince ? new Date(updatedSince) : null;
  const normalizedQuery = normalizeText(q);

  return tickets.filter((ticket) => {
    if (status && normalizeText(ticket.status) !== normalizeText(status)) return false;
    if (priority && normalizeText(ticket.priority) !== normalizeText(priority)) return false;
    if (assignee && normalizeText(ticket.assignee) !== normalizeText(assignee)) return false;
    if (requesterId && String(ticket.requesterId || "").trim() !== String(requesterId).trim()) return false;
    if (departmentId && String(ticket.departmentId || "").trim() !== String(departmentId).trim()) return false;
    if (updatedSinceDate && !Number.isNaN(updatedSinceDate.getTime())) {
      const updatedAt = new Date(ticket.updatedAtIso || ticket.openedAt || 0);
      if (Number.isNaN(updatedAt.getTime()) || updatedAt < updatedSinceDate) return false;
    }
    if (normalizedQuery) {
      const haystack = [
        ticket.id,
        ticket.title,
        ticket.description,
        ticket.requester,
        ticket.requesterEmail,
        ticket.assignee,
        ticket.status,
        ticket.priority,
        ticket.category,
        ticket.queue,
        ticket.department,
      ]
        .map((value) => normalizeText(value))
        .join(" ");
      if (!haystack.includes(normalizedQuery)) return false;
    }
    return true;
  });
}

export function createTicketService({ stateService }) {
  async function listTickets(filters = {}) {
    const state = await stateService.getState();
    const limit = toPositiveInteger(filters.limit, 100);
    const filteredItems = filterTickets(state.tickets || [], filters);

    return {
      items: filteredItems.slice(0, limit),
      total: filteredItems.length,
      limit,
      domainVersion: state.domainVersions?.tickets || 1,
      schemaVersion: state.schemaVersion,
      payloadVersion: state.payloadVersion,
    };
  }

  async function getTicketById(ticketId) {
    const state = await stateService.getState();
    return (state.tickets || []).find((ticket) => String(ticket.id || "").trim() === String(ticketId || "").trim()) || null;
  }

  return {
    listTickets,
    getTicketById,
  };
}

