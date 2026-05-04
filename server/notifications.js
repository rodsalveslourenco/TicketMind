import nodemailer from "nodemailer";
import { decryptSecret, encryptSecret } from "./security.js";

function safeDecryptSecret(value) {
  try {
    return decryptSecret(value || "");
  } catch {
    return "";
  }
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeTicketStatusForMerge(status) {
  const normalized = normalizeText(status);
  if (normalized === "em atendimento" || normalized === "em andamento" || normalized === "analise") {
    return "Em andamento";
  }
  if (normalized === "aguardando aprovacao" || normalized === "aguardando usuario") {
    return "Aguardando usuario";
  }
  if (normalized === "resolvido") return "Resolvido";
  if (normalized === "reaberto") return "Reaberto";
  return "Aberto";
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
  const password = String(smtpSettings?.password || "").trim();
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

async function sendWithResend(config, message) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.fromName ? `${config.fromName} <${config.fromEmail}>` : config.fromEmail,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Resend error: ${detail || response.status}`);
  }
}

async function sendWithSendGrid(config, message) {
  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: {
        email: config.fromEmail,
        name: config.fromName || undefined,
      },
      personalizations: [{ to: message.to.map((email) => ({ email })) }],
      subject: message.subject,
      content: [
        { type: "text/plain", value: message.text },
        { type: "text/html", value: message.html },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`SendGrid error: ${detail || response.status}`);
  }
}

function resolveServiceConfig(stateOrPayload = {}) {
  const settings = stateOrPayload?.emailServiceSettings || {};
  const provider = String(settings.provider || process.env.EMAIL_SERVICE_PROVIDER || "resend").trim().toLowerCase();
  const apiKey =
    safeDecryptSecret(settings.apiKey || "") ||
    String(process.env.EMAIL_SERVICE_API_KEY || process.env.RESEND_API_KEY || process.env.SENDGRID_API_KEY || "").trim();
  const fromEmail =
    String(settings.fromEmail || process.env.EMAIL_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || "").trim();
  const fromName =
    String(settings.fromName || process.env.EMAIL_FROM_NAME || process.env.RESEND_FROM_NAME || "TicketMind").trim();

  return {
    provider,
    apiKey,
    fromEmail,
    fromName,
    deliveryMode: String(settings.deliveryMode || "").trim().toLowerCase() === "service" ? "service" : "smtp",
  };
}

function resolveSmtpConfig(stateOrPayload = {}) {
  const settings = stateOrPayload?.smtpSettings || {};
  return {
    ...settings,
    password: safeDecryptSecret(settings.password || ""),
  };
}

function isSmtpConfigured(smtpSettings = {}) {
  return Boolean(String(smtpSettings.host || "").trim() && String(smtpSettings.fromEmail || "").trim() && String(smtpSettings.password || "").trim());
}

function isServiceConfigured(serviceSettings = {}) {
  return Boolean(String(serviceSettings.apiKey || "").trim() && String(serviceSettings.fromEmail || "").trim());
}

async function sendByService(serviceSettings, message) {
  const provider = normalizeText(serviceSettings.provider);
  if (provider === "sendgrid") {
    await sendWithSendGrid(serviceSettings, message);
    return "Servico: SendGrid";
  }

  await sendWithResend(serviceSettings, message);
  return "Servico: Resend";
}

async function deliverEmail(stateOrPayload, message) {
  const smtpSettings = resolveSmtpConfig(stateOrPayload);
  const serviceSettings = resolveServiceConfig(stateOrPayload);
  const preferredMode =
    String(stateOrPayload?.smtpSettings?.deliveryMode || stateOrPayload?.emailServiceSettings?.deliveryMode || "smtp")
      .trim()
      .toLowerCase();

  if (preferredMode === "smtp" && isSmtpConfigured(smtpSettings)) {
    const transport = createMailTransport(smtpSettings);
    await transport.verify();
    await transport.sendMail({
      from: smtpSettings.fromName ? `"${smtpSettings.fromName}" <${smtpSettings.fromEmail}>` : smtpSettings.fromEmail,
      to: message.to.join(", "),
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return "SMTP";
  }

  if (isServiceConfigured(serviceSettings)) {
    return sendByService(serviceSettings, message);
  }

  if (isSmtpConfigured(smtpSettings)) {
    const transport = createMailTransport(smtpSettings);
    await transport.verify();
    await transport.sendMail({
      from: smtpSettings.fromName ? `"${smtpSettings.fromName}" <${smtpSettings.fromEmail}>` : smtpSettings.fromEmail,
      to: message.to.join(", "),
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return "SMTP";
  }

  throw new Error("Nenhum metodo de envio configurado. Defina um SMTP ou um servico de envio.");
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

function buildNotificationLogEntry({ eventKey, ticketId, recipients, status, error = "", dedupeKey, subject, method = "" }) {
  return {
    id: `mail-log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    eventKey,
    ticketId,
    recipients,
    status,
    error,
    method,
    dedupeKey,
    subject: String(subject || ""),
    sentAt: new Date().toISOString(),
  };
}

export function prepareStateForClient(state) {
  const smtpSettings = state?.smtpSettings || {};
  const emailServiceSettings = state?.emailServiceSettings || {};
  return {
    ...state,
    smtpSettings: {
      ...smtpSettings,
      password: "",
      hasPassword: Boolean(String(smtpSettings.password || "").trim()),
    },
    emailServiceSettings: {
      ...emailServiceSettings,
      apiKey: "",
      hasApiKey: Boolean(String(emailServiceSettings.apiKey || "").trim()),
    },
  };
}

export function mergeIncomingState(previousState = {}, nextState = {}) {
  const previousSmtp = previousState.smtpSettings || {};
  const previousService = previousState.emailServiceSettings || {};
  const incomingSmtp = nextState.smtpSettings || {};
  const incomingService = nextState.emailServiceSettings || {};
  const nextPassword = String(incomingSmtp.password || "").trim()
    ? encryptSecret(incomingSmtp.password)
    : String(previousSmtp.password || "").trim();
  const nextApiKey = String(incomingService.apiKey || "").trim()
    ? encryptSecret(incomingService.apiKey)
    : String(previousService.apiKey || "").trim();

  const previousTicketsMap = new Map((previousState.tickets || []).map((ticket) => [ticket.id, ticket]));
  const mergedTickets = Array.isArray(nextState.tickets)
    ? nextState.tickets.map((ticket) => {
        const previousTicket = previousTicketsMap.get(ticket.id) || null;
        if (!previousTicket) {
          const openedAt = new Date().toISOString();
          return {
            ...ticket,
            status: "Aberto",
            openedAt,
          };
        }
        return {
          ...ticket,
          status: normalizeTicketStatusForMerge(ticket.status ?? previousTicket.status),
          openedAt: previousTicket.openedAt,
        };
      })
    : nextState.tickets;

  return {
    ...nextState,
    tickets: mergedTickets,
    smtpSettings: {
      ...previousSmtp,
      ...incomingSmtp,
      password: nextPassword,
      hasPassword: Boolean(nextPassword),
    },
    emailServiceSettings: {
      ...previousService,
      ...incomingService,
      apiKey: nextApiKey,
      hasApiKey: Boolean(nextApiKey),
    },
  };
}

export async function sendNotificationTest(payload = {}, persistedState = {}) {
  const mergedState = mergeIncomingState(persistedState, {
    smtpSettings: payload.smtpSettings || {},
    emailServiceSettings: payload.emailServiceSettings || {},
  });
  const recipients = parseEmails(payload.recipients);
  if (!recipients.length) {
    throw new Error("Informe pelo menos um destinatario para testar.");
  }
  await deliverEmail(mergedState, {
    to: recipients,
    subject: String(payload.subject || "Teste de notificacao TicketMind"),
    text: String(payload.body || "Teste de envio realizado com sucesso."),
    html: `<pre style="font-family:Arial,sans-serif;white-space:pre-wrap">${String(payload.body || "Teste de envio realizado com sucesso.")}</pre>`,
  });
}

export async function processTicketNotifications({ previousState, nextState, persistState, baseUrl }) {
  const rules = Array.isArray(nextState.notificationRules) ? nextState.notificationRules.filter((rule) => rule.active) : [];
  if (!rules.length) return;

  const eventsMap = new Map((nextState.notificationEvents || []).map((event) => [event.key, event]));
  const layoutsMap = new Map((nextState.emailLayouts || []).map((layout) => [layout.id, layout]));
  const previousTickets = new Map((previousState?.tickets || []).map((ticket) => [ticket.id, ticket]));
  const nextTickets = new Map((nextState?.tickets || []).map((ticket) => [ticket.id, ticket]));
  const existingLogKeys = new Set((nextState.notificationLogs || []).map((log) => log.dedupeKey).filter(Boolean));
  const nextLogs = [...(nextState.notificationLogs || [])];

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
        const method = await deliverEmail(nextState, {
          to: recipients,
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
            method,
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
            method: "Falha",
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
