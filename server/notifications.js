import nodemailer from "nodemailer";
import { decryptSecret, encryptSecret } from "./security.js";

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function parseEmails(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean);
  }
  return String(value || "")
    .split(/[,\n;]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function buildTicketLink(baseUrl, ticketId) {
  const trimmedBaseUrl = String(baseUrl || process.env.APP_PUBLIC_URL || "").trim().replace(/\/+$/, "");
  if (!trimmedBaseUrl) return ticketId ? `#${ticketId}` : "";
  return `${trimmedBaseUrl}/#/app/tickets`;
}

function resolveDepartmentName(state, ticket) {
  const requester = (state.users || []).find((user) => user.id === ticket.requesterId);
  return requester?.department || "";
}

function resolveTicketComments(ticket) {
  const latestComment =
    (ticket.history || []).find((entry) => ["solution", "comment", "note"].includes(String(entry.type || "").trim())) || null;
  if (latestComment?.message) return latestComment.message;
  return String(ticket.resolutionNotes || "").trim();
}

function compileTemplate(template, placeholders) {
  return String(template || "").replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_match, key) => placeholders[key] ?? "");
}

function createMailTransport(smtpSettings) {
  const password = decryptSecret(smtpSettings?.password || "");
  return nodemailer.createTransport({
    host: smtpSettings?.host,
    port: Number(smtpSettings?.port) || 587,
    secure: Boolean(smtpSettings?.secure),
    requireTLS: smtpSettings?.requireTls !== false,
    auth:
      smtpSettings?.username || password
        ? {
            user: smtpSettings?.username || "",
            pass: password,
          }
        : undefined,
  });
}

function buildPlaceholders(state, ticket, eventLabel, baseUrl) {
  return {
    numero_chamado: String(ticket.id || ""),
    titulo: String(ticket.title || ""),
    descricao: String(ticket.description || ""),
    status: String(ticket.status || ""),
    prioridade: String(ticket.priority || ""),
    solicitante: String(ticket.requester || ""),
    departamento: resolveDepartmentName(state, ticket),
    localizacao: String(ticket.location || ""),
    tecnico: String(ticket.assignee || ""),
    data_abertura: String(ticket.openedAtLabel || ticket.openedAt || ""),
    data_atualizacao: String(ticket.updatedAt || ticket.updatedAtIso || ""),
    comentarios: resolveTicketComments(ticket),
    link_chamado: buildTicketLink(baseUrl, ticket.id),
    evento: String(eventLabel || ""),
  };
}

function getRecipients(rule, state) {
  const userEmails = (Array.isArray(rule?.recipientUserIds) ? rule.recipientUserIds : [])
    .map((userId) => (state.users || []).find((user) => user.id === userId)?.email || "")
    .filter(Boolean);
  return Array.from(new Set([...userEmails, ...parseEmails(rule?.externalEmails)]));
}

function resolveEventChanges(previousTicket, nextTicket) {
  const changes = [];
  if (!previousTicket && nextTicket) {
    changes.push({ key: "ticket_created", signature: nextTicket.openedAt || nextTicket.updatedAtIso || nextTicket.id });
  }
  if (!previousTicket || !nextTicket) return changes;

  if (normalizeText(previousTicket.status) !== normalizeText(nextTicket.status)) {
    changes.push({ key: "ticket_status_changed", signature: `${previousTicket.status}->${nextTicket.status}:${nextTicket.updatedAtIso}` });
  }
  if (normalizeText(previousTicket.priority) !== normalizeText(nextTicket.priority)) {
    changes.push({ key: "ticket_priority_changed", signature: `${previousTicket.priority}->${nextTicket.priority}:${nextTicket.updatedAtIso}` });
  }
  if (String(previousTicket.assignee || "").trim() !== String(nextTicket.assignee || "").trim()) {
    changes.push({ key: "ticket_assignment_changed", signature: `${previousTicket.assignee}->${nextTicket.assignee}:${nextTicket.updatedAtIso}` });
  }
  if (normalizeText(previousTicket.status) !== "resolvido" && normalizeText(nextTicket.status) === "resolvido") {
    changes.push({ key: "ticket_closed", signature: nextTicket.resolvedAt || nextTicket.updatedAtIso });
  }
  if (String(previousTicket.resolutionNotes || "").trim() !== String(nextTicket.resolutionNotes || "").trim() && String(nextTicket.resolutionNotes || "").trim()) {
    changes.push({ key: "ticket_commented", signature: `${nextTicket.updatedAtIso}:resolution` });
  }
  if (!previousTicket.slaBreachedAt && nextTicket.slaBreachedAt) {
    changes.push({ key: "ticket_sla_breached", signature: nextTicket.slaBreachedAt });
  }

  return changes;
}

function buildNotificationLogEntry({ eventKey, ticketId, recipients, status, error = "", dedupeKey, subject }) {
  return {
    id: `mail-log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    eventKey,
    ticketId,
    recipients,
    status,
    error,
    dedupeKey,
    subject: String(subject || ""),
    sentAt: new Date().toISOString(),
  };
}

export function prepareStateForClient(state) {
  const smtpSettings = state?.smtpSettings || {};
  return {
    ...state,
    smtpSettings: {
      ...smtpSettings,
      password: "",
      hasPassword: Boolean(String(smtpSettings.password || "").trim()),
    },
  };
}

export function mergeIncomingState(previousState = {}, nextState = {}) {
  const previousSmtp = previousState.smtpSettings || {};
  const incomingSmtp = nextState.smtpSettings || {};
  const nextPassword = String(incomingSmtp.password || "").trim()
    ? encryptSecret(incomingSmtp.password)
    : String(previousSmtp.password || "").trim();

  return {
    ...nextState,
    smtpSettings: {
      ...previousSmtp,
      ...incomingSmtp,
      password: nextPassword,
      hasPassword: Boolean(nextPassword),
    },
  };
}

export async function sendNotificationTest(payload = {}, persistedState = {}) {
  const mergedState = mergeIncomingState(persistedState, { smtpSettings: payload.smtpSettings || {} });
  const smtpSettings = mergedState.smtpSettings || {};
  const recipients = parseEmails(payload.recipients);
  if (!smtpSettings.host || !smtpSettings.fromEmail || !recipients.length) {
    throw new Error("Preencha SMTP, remetente e pelo menos um destinatario para testar.");
  }

  const transport = createMailTransport(smtpSettings);
  await transport.verify();
  await transport.sendMail({
    from: smtpSettings.fromName
      ? `"${smtpSettings.fromName}" <${smtpSettings.fromEmail}>`
      : smtpSettings.fromEmail,
    to: recipients.join(", "),
    subject: String(payload.subject || "Teste de notificacao TicketMind"),
    text: String(payload.body || "Teste de envio realizado com sucesso."),
    html: `<pre style="font-family:Arial,sans-serif;white-space:pre-wrap">${String(payload.body || "Teste de envio realizado com sucesso.")}</pre>`,
  });
}

export async function processTicketNotifications({ previousState, nextState, persistState, baseUrl }) {
  const smtpSettings = nextState?.smtpSettings || {};
  if (!smtpSettings.host || !smtpSettings.fromEmail || !String(smtpSettings.password || "").trim()) return;

  const rules = Array.isArray(nextState.notificationRules) ? nextState.notificationRules.filter((rule) => rule.active) : [];
  if (!rules.length) return;

  const eventsMap = new Map((nextState.notificationEvents || []).map((event) => [event.key, event]));
  const layoutsMap = new Map((nextState.emailLayouts || []).map((layout) => [layout.id, layout]));
  const previousTickets = new Map((previousState?.tickets || []).map((ticket) => [ticket.id, ticket]));
  const nextTickets = new Map((nextState?.tickets || []).map((ticket) => [ticket.id, ticket]));
  const existingLogKeys = new Set((nextState.notificationLogs || []).map((log) => log.dedupeKey).filter(Boolean));
  const nextLogs = [...(nextState.notificationLogs || [])];

  const transport = createMailTransport(smtpSettings);
  await transport.verify();

  for (const nextTicket of nextTickets.values()) {
    const previousTicket = previousTickets.get(nextTicket.id) || null;
    const changes = resolveEventChanges(previousTicket, nextTicket);

    for (const change of changes) {
      const rule = rules.find((candidate) => candidate.eventKey === change.key);
      if (!rule) continue;

      const recipients = getRecipients(rule, nextState);
      if (!recipients.length) continue;

      const eventLabel = eventsMap.get(change.key)?.label || change.key;
      const layout =
        layoutsMap.get(rule.layoutId) ||
        (nextState.emailLayouts || []).find(
          (candidate) => candidate.eventKey === change.key && normalizeText(candidate.status) === "ativo",
        ) ||
        null;
      const placeholders = buildPlaceholders(nextState, nextTicket, eventLabel, baseUrl);
      const subject = compileTemplate(layout?.subject || `[TicketMind] ${eventLabel} - {{numero_chamado}}`, placeholders);
      const body = compileTemplate(
        layout?.body || "Evento: {{evento}}\nChamado: {{numero_chamado}}\nTitulo: {{titulo}}\nStatus: {{status}}\nPrioridade: {{prioridade}}\nLink: {{link_chamado}}",
        placeholders,
      );
      const dedupeKey = `${change.key}:${nextTicket.id}:${change.signature}`;
      if (existingLogKeys.has(dedupeKey)) continue;

      try {
        await transport.sendMail({
          from: smtpSettings.fromName
            ? `"${smtpSettings.fromName}" <${smtpSettings.fromEmail}>`
            : smtpSettings.fromEmail,
          to: recipients.join(", "),
          subject,
          text: body,
          html: `<pre style="font-family:Arial,sans-serif;white-space:pre-wrap">${body}</pre>`,
        });
        nextLogs.unshift(
          buildNotificationLogEntry({
            eventKey: change.key,
            ticketId: nextTicket.id,
            recipients,
            status: "Enviado",
            dedupeKey,
            subject,
          }),
        );
      } catch (error) {
        nextLogs.unshift(
          buildNotificationLogEntry({
            eventKey: change.key,
            ticketId: nextTicket.id,
            recipients,
            status: "Falha",
            error: error instanceof Error ? error.message : "Falha ao enviar email.",
            dedupeKey,
            subject,
          }),
        );
      }

      existingLogKeys.add(dedupeKey);
    }
  }

  if (persistState && JSON.stringify(nextLogs) !== JSON.stringify(nextState.notificationLogs || [])) {
    await persistState({
      ...nextState,
      notificationLogs: nextLogs.slice(0, 200),
    });
  }
}
