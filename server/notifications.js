import nodemailer from "nodemailer";
import { hasAnyPermission } from "../src/data/permissions.js";
import { analyzeTicketWithAI } from "./aiTicketInsights.js";
import { decryptSecret, encryptSecret } from "./security.js";

const APPROVAL_REMINDER_INTERVAL_MS = Math.max(
  5 * 60 * 1000,
  Number(process.env.APPROVAL_REMINDER_INTERVAL_MS) || 60 * 60 * 1000,
);
const OPERATIONS_FORWARD_EMAIL = String(process.env.OPERATIONS_FORWARD_EMAIL || "ti@wegamarine.com.br").trim().toLowerCase();
const GRAPH_TOKEN_SCOPE = "https://graph.microsoft.com/.default";

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
  const latestFollowUp = Array.isArray(ticket.followUps) ? ticket.followUps[0] || null : null;
  if (latestFollowUp?.message) return latestFollowUp.message;
  const latestComment =
    (ticket.history || []).find((entry) =>
      ["solution", "comment", "note", "follow_up", "public_follow_up", "private_follow_up"].includes(String(entry.type || "").trim()),
    ) || null;
  if (latestComment?.message) return latestComment.message;
  return String(ticket.resolutionNotes || "").trim();
}

function compileTemplate(template, placeholders) {
  return String(template || "").replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_match, key) => placeholders[key] ?? "");
}

function getOperationsMailboxRecipients() {
  return OPERATIONS_FORWARD_EMAIL ? [OPERATIONS_FORWARD_EMAIL] : [];
}

function buildForwardingTextNotice(recipients = []) {
  const originalRecipients = parseEmails(recipients);
  if (!originalRecipients.length) return "";
  return `\n\nDestinatarios originais previstos: ${originalRecipients.join(", ")}\nEncaminhamento operacional: ${OPERATIONS_FORWARD_EMAIL}`;
}

function buildPreformattedHtml(text, extraHtml = "") {
  return `<pre style="font-family:Arial,sans-serif;white-space:pre-wrap">${String(text || "")}</pre>${extraHtml}`;
}

function escapeGraphUserId(value) {
  return encodeURIComponent(String(value || "").trim());
}

function formatAiAnalysisText(aiAnalysis = null) {
  if (!aiAnalysis || typeof aiAnalysis !== "object") return "";
  const actions = Array.isArray(aiAnalysis.recommendedActions) ? aiAnalysis.recommendedActions : [];
  const signals = Array.isArray(aiAnalysis.behaviorSignals) ? aiAnalysis.behaviorSignals : [];
  return [
    "",
    "Analise da IA:",
    `Resumo: ${aiAnalysis.summary || ""}`,
    `Risco operacional: ${aiAnalysis.operationalRisk || ""}`,
    `Prioridade sugerida: ${aiAnalysis.suggestedPriority || ""}`,
    `Fila sugerida: ${aiAnalysis.suggestedQueue || ""}`,
    `Sentimento do solicitante: ${aiAnalysis.requesterSentiment || ""}`,
    `Sinais de comportamento: ${signals.join("; ") || ""}`,
    `Acoes recomendadas: ${actions.join("; ") || ""}`,
    `Confianca: ${Math.round((Number(aiAnalysis.confidence) || 0) * 100)}%`,
  ].join("\n");
}

export function buildPasswordRecoveryForwardMessage({
  submittedEmail = "",
  recipientName = "",
  matchedUserEmail = "",
  resetUrl = "",
} = {}) {
  const normalizedSubmittedEmail = String(submittedEmail || "").trim().toLowerCase();
  const normalizedMatchedUserEmail = String(matchedUserEmail || "").trim().toLowerCase();
  const safeName = String(recipientName || "").trim() || "usuario";
  const forwardingRecipients = getOperationsMailboxRecipients();
  const lines = [
    "Encaminhamento operacional de recuperacao de senha.",
    "",
    `Email informado no formulario: ${normalizedSubmittedEmail || "(nao informado)"}`,
    `Usuario vinculado encontrado: ${safeName}`,
  ];

  if (normalizedMatchedUserEmail) {
    lines.push(`Email cadastrado do usuario: ${normalizedMatchedUserEmail}`);
  }

  if (String(resetUrl || "").trim()) {
    lines.push(`Acesse o link para continuar: ${String(resetUrl).trim()}`);
  } else {
    lines.push("Nenhum usuario ativo correspondente foi localizado para gerar link de redefinicao.");
  }

  lines.push("", "Use este e-mail para encaminhamento automatizado ao usuario final.");

  const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">
        <h2 style="margin-bottom:12px">Encaminhamento operacional de recuperacao de senha</h2>
        <p><strong>Email informado no formulario:</strong> ${normalizedSubmittedEmail || "(nao informado)"}</p>
        <p><strong>Usuario vinculado encontrado:</strong> ${safeName}</p>
        ${normalizedMatchedUserEmail ? `<p><strong>Email cadastrado do usuario:</strong> ${normalizedMatchedUserEmail}</p>` : ""}
        ${
          String(resetUrl || "").trim()
            ? `<p><a href="${String(resetUrl).trim()}" style="display:inline-block;padding:12px 18px;background:#0f766e;color:#ffffff;text-decoration:none;border-radius:8px">Redefinir senha</a></p>
               <p>Se o botao nao abrir, use este link:</p>
               <p><a href="${String(resetUrl).trim()}">${String(resetUrl).trim()}</a></p>`
            : "<p>Nenhum usuario ativo correspondente foi localizado para gerar link de redefinicao.</p>"
        }
        <p>Use este e-mail para encaminhamento automatizado ao usuario final.</p>
      </div>
  `;

  return {
    to: forwardingRecipients,
    subject: `Recuperacao de senha TicketMind - ${safeName}`,
    text: lines.join("\n"),
    html,
  };
}

export function buildTicketCreatedForwardMessage(ticket = {}, state = {}, baseUrl = "", intendedRecipients = []) {
  const forwardingRecipients = getOperationsMailboxRecipients();
  const watchers = Array.isArray(ticket.watcherDetails) ? ticket.watcherDetails.map((watcher) => watcher.email || watcher.name || "").filter(Boolean) : [];
  const attachments = Array.isArray(ticket.attachments) ? ticket.attachments : [];
  const followUps = Array.isArray(ticket.followUps) ? ticket.followUps : [];
  const checklistItems = Array.isArray(ticket.checklistItems) ? ticket.checklistItems : [];
  const placeholders = buildPlaceholders(state, ticket, "Abertura de chamado", baseUrl);
  const lines = [
    "Encaminhamento operacional de abertura de chamado.",
    "",
    `Chamado: ${ticket.id || ""}`,
    `Titulo: ${ticket.title || ""}`,
    `Descricao: ${ticket.description || ""}`,
    `Solicitante: ${ticket.requester || ""}`,
    `Email do solicitante: ${ticket.requesterEmail || ""}`,
    `Tipo: ${ticket.type || ""}`,
    `Status inicial: ${ticket.status || ""}`,
    `Prioridade: ${ticket.priority || ""}`,
    `Urgencia: ${ticket.urgency || ""}`,
    `Impacto: ${ticket.impact || ""}`,
    `Departamento: ${ticket.department || placeholders.departamento || ""}`,
    `Fila: ${ticket.queue || ""}`,
    `Categoria: ${ticket.category || ""}`,
    `Origem: ${ticket.source || ""}`,
    `Localizacao: ${ticket.location || ""}`,
    `Data de abertura: ${ticket.openedAtLabel || ticket.openedAt || ""}`,
    `SLA: ${ticket.sla || ""}`,
    `Projeto: ${ticket.projectName || ""}`,
    `Ativo: ${ticket.assetName || ""}`,
    `Chamado pai: ${ticket.parentTicketId || ""}`,
    `Aprovador atual: ${ticket.approval?.currentApproverName || ticket.approval?.approverName || ""}`,
    `Valor para aprovacao: ${ticket.approvalAmount || 0}`,
    `Watchers: ${watchers.join(", ") || ticket.watchers || ""}`,
    `Anexos: ${attachments.length}`,
    `Checklist inicial: ${checklistItems.length}`,
    `Follow-ups iniciais: ${followUps.length}`,
    `Link do chamado: ${placeholders.link_chamado || ""}`,
  ];

  const aiAnalysisText = formatAiAnalysisText(ticket.aiAnalysis);
  if (aiAnalysisText) lines.push(aiAnalysisText);

  const forwardingNotice = buildForwardingTextNotice(intendedRecipients);
  const text = `${lines.join("\n")}${forwardingNotice}`;
  return {
    to: forwardingRecipients,
    subject: `[TicketMind] Abertura de chamado - ${ticket.id || ""}`,
    text,
    html: buildPreformattedHtml(text),
  };
}

function createMailTransport(smtpSettings) {
  const password = String(smtpSettings?.password || "").trim();
  return nodemailer.createTransport({
    host: smtpSettings?.host,
    port: Number(smtpSettings?.port) || 587,
    secure: Boolean(smtpSettings?.secure),
    requireTLS: smtpSettings?.requireTls !== false,
    family: Number(smtpSettings?.family) || 4,
    connectionTimeout: Number(smtpSettings?.connectionTimeoutMs) || 45000,
    greetingTimeout: Number(smtpSettings?.greetingTimeoutMs) || 30000,
    socketTimeout: Number(smtpSettings?.socketTimeoutMs) || 60000,
    auth:
      smtpSettings?.username || password
        ? {
            user: smtpSettings?.username || "",
            pass: password,
          }
        : undefined,
  });
}

function getEnvSmtpSettings() {
  const host = String(process.env.SMTP_HOST || "").trim();
  const fromEmail = String(process.env.SMTP_FROM_EMAIL || "").trim();
  const username = String(process.env.SMTP_USERNAME || "").trim();
  const password = String(process.env.SMTP_PASSWORD || "").trim();
  if (!host && !fromEmail && !username && !password) return {};
  return {
    deliveryMode: "smtp",
    host,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: String(process.env.SMTP_SECURE || "").trim().toLowerCase() === "true",
    requireTls: String(process.env.SMTP_REQUIRE_TLS || "true").trim().toLowerCase() !== "false",
    family: Number(process.env.SMTP_FAMILY) || 4,
    connectionTimeoutMs: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS) || 45000,
    greetingTimeoutMs: Number(process.env.SMTP_GREETING_TIMEOUT_MS) || 30000,
    socketTimeoutMs: Number(process.env.SMTP_SOCKET_TIMEOUT_MS) || 60000,
    username,
    password,
    fromEmail,
    fromName: String(process.env.SMTP_FROM_NAME || "").trim(),
    hasPassword: Boolean(password),
  };
}

function resolveSmtpConfig(stateOrPayload = {}) {
  const settings = stateOrPayload?.smtpSettings || {};
  const envSettings = getEnvSmtpSettings();
  return {
    ...envSettings,
    ...settings,
    host: String(settings.host || envSettings.host || "").trim(),
    port: Number(settings.port || envSettings.port) || 587,
    secure: settings.secure !== undefined ? Boolean(settings.secure) : Boolean(envSettings.secure),
    requireTls: settings.requireTls !== undefined ? settings.requireTls !== false : envSettings.requireTls !== false,
    family: Number(settings.family || envSettings.family) || 4,
    connectionTimeoutMs: Number(settings.connectionTimeoutMs || envSettings.connectionTimeoutMs) || 45000,
    greetingTimeoutMs: Number(settings.greetingTimeoutMs || envSettings.greetingTimeoutMs) || 30000,
    socketTimeoutMs: Number(settings.socketTimeoutMs || envSettings.socketTimeoutMs) || 60000,
    username: String(settings.username || envSettings.username || "").trim(),
    password: safeDecryptSecret(settings.password || "") || envSettings.password || "",
    fromEmail: String(settings.fromEmail || envSettings.fromEmail || "").trim(),
    fromName: String(settings.fromName || envSettings.fromName || "").trim(),
  };
}

function isSmtpConfigured(smtpSettings = {}) {
  return Boolean(String(smtpSettings.host || "").trim() && String(smtpSettings.fromEmail || "").trim() && String(smtpSettings.password || "").trim());
}

function getEnvGraphSettings() {
  const tenantId = String(process.env.GRAPH_TENANT_ID || process.env.MICROSOFT_GRAPH_TENANT_ID || "").trim();
  const clientId = String(process.env.GRAPH_CLIENT_ID || process.env.MICROSOFT_GRAPH_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.GRAPH_CLIENT_SECRET || process.env.MICROSOFT_GRAPH_CLIENT_SECRET || "").trim();
  const graphFromEmail = String(process.env.GRAPH_FROM_EMAIL || "").trim();
  const fromEmail = String(graphFromEmail || process.env.SMTP_FROM_EMAIL || "").trim();
  const fromName = String(process.env.GRAPH_FROM_NAME || process.env.SMTP_FROM_NAME || "").trim();
  const provider = String(process.env.EMAIL_DELIVERY_PROVIDER || "").trim().toLowerCase();
  if (!tenantId && !clientId && !clientSecret && !graphFromEmail && provider !== "graph" && provider !== "microsoft_graph") return {};
  return {
    provider: provider || "graph",
    tenantId,
    clientId,
    clientSecret,
    fromEmail,
    fromName,
    saveToSentItems: String(process.env.GRAPH_SAVE_TO_SENT_ITEMS || "true").trim().toLowerCase() !== "false",
    timeoutMs: Number(process.env.GRAPH_TIMEOUT_MS) || 30000,
  };
}

function resolveGraphConfig(stateOrPayload = {}) {
  const envSettings = getEnvGraphSettings();
  const settings = stateOrPayload?.emailServiceSettings || {};
  const provider = String(settings.provider || envSettings.provider || process.env.EMAIL_DELIVERY_PROVIDER || "").trim().toLowerCase();
  const fromEmail = String(settings.fromEmail || envSettings.fromEmail || "").trim();
  const clientSecret = safeDecryptSecret(settings.apiKey || "") || envSettings.clientSecret || "";
  return {
    provider,
    tenantId: String(settings.tenantId || envSettings.tenantId || "").trim(),
    clientId: String(settings.clientId || envSettings.clientId || "").trim(),
    clientSecret,
    fromEmail,
    fromName: String(settings.fromName || envSettings.fromName || "").trim(),
    saveToSentItems: settings.saveToSentItems !== undefined ? settings.saveToSentItems !== false : envSettings.saveToSentItems !== false,
    timeoutMs: Number(settings.timeoutMs || envSettings.timeoutMs) || 30000,
  };
}

function isGraphRequested(graphSettings = {}) {
  return ["graph", "microsoft_graph", "msgraph"].includes(String(graphSettings.provider || "").trim().toLowerCase());
}

function isGraphConfigured(graphSettings = {}) {
  return Boolean(
    String(graphSettings.tenantId || "").trim() &&
      String(graphSettings.clientId || "").trim() &&
      String(graphSettings.clientSecret || "").trim() &&
      String(graphSettings.fromEmail || "").trim(),
  );
}

export function buildMicrosoftGraphMailPayload(message = {}, graphSettings = {}) {
  const recipients = parseEmails(message.to).map((address) => ({
    emailAddress: { address },
  }));
  const content = String(message.html || message.text || "");
  return {
    message: {
      subject: String(message.subject || ""),
      body: {
        contentType: message.html ? "HTML" : "Text",
        content,
      },
      toRecipients: recipients,
    },
    saveToSentItems: graphSettings.saveToSentItems !== false,
  };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function getMicrosoftGraphAccessToken(graphSettings) {
  const params = new URLSearchParams({
    client_id: graphSettings.clientId,
    client_secret: graphSettings.clientSecret,
    scope: GRAPH_TOKEN_SCOPE,
    grant_type: "client_credentials",
  });
  const response = await fetchWithTimeout(
    `https://login.microsoftonline.com/${encodeURIComponent(graphSettings.tenantId)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    },
    graphSettings.timeoutMs,
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    const detail = body.error_description || body.error?.message || body.error || response.statusText || "falha desconhecida";
    throw new Error(`Falha ao autenticar no Microsoft Graph: ${detail}`);
  }
  return body.access_token;
}

async function sendWithMicrosoftGraph(graphSettings, message) {
  const recipients = parseEmails(message.to);
  if (!recipients.length) throw new Error("Nenhum destinatario informado para envio pelo Microsoft Graph.");
  const accessToken = await getMicrosoftGraphAccessToken(graphSettings);
  const response = await fetchWithTimeout(
    `https://graph.microsoft.com/v1.0/users/${escapeGraphUserId(graphSettings.fromEmail)}/sendMail`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildMicrosoftGraphMailPayload({ ...message, to: recipients }, graphSettings)),
    },
    graphSettings.timeoutMs,
  );
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const detail = body.error?.message || response.statusText || "falha desconhecida";
    throw new Error(`Falha ao enviar e-mail pelo Microsoft Graph: ${detail}`);
  }
}

async function deliverEmail(stateOrPayload, message) {
  const graphSettings = resolveGraphConfig(stateOrPayload);
  if (isGraphConfigured(graphSettings)) {
    await sendWithMicrosoftGraph(graphSettings, message);
    return "Microsoft Graph";
  }
  if (isGraphRequested(graphSettings)) {
    throw new Error("Microsoft Graph incompleto. Defina GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET e GRAPH_FROM_EMAIL.");
  }

  const smtpSettings = resolveSmtpConfig(stateOrPayload);
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

  throw new Error("Nenhum canal de e-mail configurado. Defina Microsoft Graph ou SMTP.");
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
    aprovador_atual: String(ticket.approval?.currentApproverName || ticket.approval?.approverName || ""),
    sla_aprovacao: String(ticket.approval?.dueAt || "").trim(),
    ia_resumo: String(ticket.aiAnalysis?.summary || ""),
    ia_risco: String(ticket.aiAnalysis?.operationalRisk || ""),
    ia_prioridade_sugerida: String(ticket.aiAnalysis?.suggestedPriority || ""),
    ia_fila_sugerida: String(ticket.aiAnalysis?.suggestedQueue || ""),
    ia_acoes: Array.isArray(ticket.aiAnalysis?.recommendedActions) ? ticket.aiAnalysis.recommendedActions.join("; ") : "",
  };
}

function getRecipients(rule, state) {
  const userEmails = (Array.isArray(rule?.recipientUserIds) ? rule.recipientUserIds : [])
    .map((userId) => (state.users || []).find((user) => user.id === userId)?.email || "")
    .filter(Boolean);
  return Array.from(new Set([...userEmails, ...parseEmails(rule?.externalEmails)]));
}

function getRequesterRecipient(ticket, rule) {
  if (!rule?.includeRequesterEmail) return [];
  const requesterEmail = String(ticket?.requesterEmail || "").trim().toLowerCase();
  return requesterEmail ? [requesterEmail] : [];
}

function getWatcherRecipients(ticket, eventKey) {
  return Array.from(
    new Set(
      (Array.isArray(ticket?.watcherDetails) ? ticket.watcherDetails : [])
        .filter((watcher) => Array.isArray(watcher?.eventKeys) && watcher.eventKeys.includes(eventKey))
        .map((watcher) => String(watcher.email || "").trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

export function resolveNotificationRecipients(ticket, rule, state, eventKey) {
  return Array.from(new Set([...getRequesterRecipient(ticket, rule), ...getRecipients(rule, state), ...getWatcherRecipients(ticket, eventKey)]));
}

function getApprovalReminderRecipients(ticket, rule, state) {
  const currentApproverId = String(ticket?.approval?.currentApproverId || ticket?.approval?.approverId || "").trim();
  const currentApprover = currentApproverId ? (state.users || []).find((user) => user.id === currentApproverId) || null : null;
  const currentApproverEmail = String(currentApprover?.email || "").trim().toLowerCase();
  return Array.from(
    new Set([
      currentApproverEmail,
      ...getRecipients(rule, state),
      ...getWatcherRecipients(ticket, "ticket_approval_reminder"),
    ].filter(Boolean)),
  );
}

function buildApprovalReminderChange(ticket, existingLogKeys, now = new Date()) {
  if (normalizeText(ticket?.approval?.status) !== "pending") return null;
  const requestedAt = new Date(ticket?.approval?.requestedAt || ticket?.updatedAtIso || ticket?.updatedAt || ticket?.openedAt || now.toISOString());
  if (Number.isNaN(requestedAt.getTime())) return null;
  const elapsedMs = now.getTime() - requestedAt.getTime();
  if (elapsedMs < APPROVAL_REMINDER_INTERVAL_MS) return null;
  const reminderBucket = Math.floor(elapsedMs / APPROVAL_REMINDER_INTERVAL_MS);
  const dedupeKey = `ticket_approval_reminder:${ticket.id}:${ticket?.approval?.currentApproverId || ticket?.approval?.approverId || "sem-aprovador"}:${reminderBucket}`;
  if (existingLogKeys.has(dedupeKey)) return null;
  return {
    key: "ticket_approval_reminder",
    signature: dedupeKey,
    dedupeKey,
  };
}

function resolveEventChanges(previousTicket, nextTicket) {
  const changes = [];
  const previousFollowUpsSignature = JSON.stringify(previousTicket?.followUps || []);
  const nextFollowUpsSignature = JSON.stringify(nextTicket?.followUps || []);
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
  if (previousFollowUpsSignature !== nextFollowUpsSignature && Array.isArray(nextTicket.followUps) && nextTicket.followUps.length) {
    const latestFollowUp = nextTicket.followUps[0];
    changes.push({ key: "ticket_commented", signature: `${latestFollowUp.id || nextTicket.updatedAtIso}:followup` });
  }
  if (String(previousTicket.resolutionNotes || "").trim() !== String(nextTicket.resolutionNotes || "").trim() && String(nextTicket.resolutionNotes || "").trim()) {
    changes.push({ key: "ticket_commented", signature: `${nextTicket.updatedAtIso}:resolution` });
  }
  if (!previousTicket.slaBreachedAt && nextTicket.slaBreachedAt) {
    changes.push({ key: "ticket_sla_breached", signature: nextTicket.slaBreachedAt });
  }
  if (normalizeText(previousTicket.approval?.status) !== "pending" && normalizeText(nextTicket.approval?.status) === "pending") {
    changes.push({ key: "ticket_approval_pending", signature: `${nextTicket.id}:${nextTicket.approval?.requestedAt || nextTicket.updatedAtIso}` });
  }
  if (normalizeText(previousTicket.approval?.currentApproverId) !== normalizeText(nextTicket.approval?.currentApproverId) && normalizeText(nextTicket.approval?.status) === "pending") {
    changes.push({ key: "ticket_approval_pending", signature: `${nextTicket.id}:${nextTicket.approval?.currentApproverId}:${nextTicket.approval?.dueAt || nextTicket.updatedAtIso}` });
  }
  if (!previousTicket.approvalOverdueAt && nextTicket.approvalOverdueAt) {
    changes.push({ key: "ticket_approval_overdue", signature: `${nextTicket.id}:${nextTicket.approvalOverdueAt}` });
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

function canExposePasswordReveal(requestUser) {
  return hasAnyPermission(requestUser, ["users_reset_password", "users_admin"]) || normalizeText(requestUser?.department) === "ti";
}

export function prepareStateForClient(state, requestUser = null) {
  const smtpSettings = state?.smtpSettings || {};
  const envSmtpSettings = getEnvSmtpSettings();
  const emailServiceSettings = state?.emailServiceSettings || {};
  const envGraphSettings = getEnvGraphSettings();
  const exposePasswordReveal = canExposePasswordReveal(requestUser);
  const users = Array.isArray(state?.users)
    ? state.users.map((user) => ({
        ...user,
        password: "",
        passwordReveal: exposePasswordReveal ? String(user?.passwordReveal || "") : "",
        hasPassword: Boolean(String(user?.password || "").trim()),
      }))
    : [];
  return {
    ...state,
    users,
    smtpSettings: {
      ...envSmtpSettings,
      ...smtpSettings,
      host: smtpSettings.host || envSmtpSettings.host || "",
      port: smtpSettings.port || envSmtpSettings.port || 587,
      secure: smtpSettings.secure !== undefined ? Boolean(smtpSettings.secure) : Boolean(envSmtpSettings.secure),
      requireTls: smtpSettings.requireTls !== undefined ? smtpSettings.requireTls !== false : envSmtpSettings.requireTls !== false,
      username: smtpSettings.username || envSmtpSettings.username || "",
      fromEmail: smtpSettings.fromEmail || envSmtpSettings.fromEmail || "",
      fromName: smtpSettings.fromName || envSmtpSettings.fromName || "",
      password: "",
      hasPassword: Boolean(String(smtpSettings.password || envSmtpSettings.password || "").trim()),
    },
    emailServiceSettings: {
      ...envGraphSettings,
      ...emailServiceSettings,
      apiKey: "",
      clientSecret: "",
      hasApiKey: Boolean(String(emailServiceSettings.apiKey || envGraphSettings.clientSecret || "").trim()),
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

export async function sendPasswordRecoveryEmail(
  {
    submittedEmail = "",
    recipientEmail = "",
    recipientName = "",
    resetUrl = "",
  } = {},
  persistedState = {},
) {
  const normalizedSubmittedEmail = String(submittedEmail || "").trim().toLowerCase();
  if (!normalizedSubmittedEmail) {
    throw new Error("Dados insuficientes para enviar a recuperacao de senha.");
  }
  const message = buildPasswordRecoveryForwardMessage({
    submittedEmail: normalizedSubmittedEmail,
    recipientName,
    matchedUserEmail: recipientEmail,
    resetUrl,
  });
  if (!message.to.length) {
    throw new Error("Caixa operacional de encaminhamento nao configurada.");
  }
  await deliverEmail(persistedState, message);
}

export async function processTicketNotifications({ previousState, nextState, persistState, baseUrl }) {
  const rules = Array.isArray(nextState.notificationRules) ? nextState.notificationRules.filter((rule) => rule.active) : [];
  const shouldForwardCreatedTickets = Boolean(getOperationsMailboxRecipients().length);
  if (!rules.length && !shouldForwardCreatedTickets) return;

  const eventsMap = new Map((nextState.notificationEvents || []).map((event) => [event.key, event]));
  const layoutsMap = new Map((nextState.emailLayouts || []).map((layout) => [layout.id, layout]));
  const previousTickets = new Map((previousState?.tickets || []).map((ticket) => [ticket.id, ticket]));
  const nextTickets = new Map((nextState?.tickets || []).map((ticket) => [ticket.id, ticket]));
  const successfulLogKeys = new Set(
    (nextState.notificationLogs || [])
      .filter((log) => normalizeText(log.status) === "enviado")
      .map((log) => log.dedupeKey)
      .filter(Boolean),
  );
  const nextLogs = [...(nextState.notificationLogs || [])];
  const nextTicketsList = Array.isArray(nextState.tickets) ? [...nextState.tickets] : [];
  let ticketsChanged = false;

  const replaceTicket = (ticket) => {
    const index = nextTicketsList.findIndex((candidate) => String(candidate.id || "") === String(ticket.id || ""));
    if (index !== -1) {
      nextTicketsList[index] = ticket;
      ticketsChanged = true;
    }
  };

  for (const originalNextTicket of nextTickets.values()) {
    let nextTicket = originalNextTicket;
    const previousTicket = previousTickets.get(nextTicket.id) || null;
    const changes = resolveEventChanges(previousTicket, nextTicket);
    const createdDeliveryKey = `ticket_created_operational:${nextTicket.id}:${nextTicket.openedAt || nextTicket.updatedAtIso || nextTicket.id}`;
    const failedCreatedDelivery = nextLogs.some(
      (log) => log.dedupeKey === createdDeliveryKey && normalizeText(log.status) === "falha",
    );

    if (!previousTicket && !nextTicket.aiAnalysis) {
      try {
        const aiAnalysis = await analyzeTicketWithAI(nextTicket, nextState);
        if (aiAnalysis) {
          nextTicket = { ...nextTicket, aiAnalysis };
          replaceTicket(nextTicket);
        }
      } catch (error) {
        console.error("ticket AI analysis failed", error);
      }
    }

    if (((!previousTicket && !successfulLogKeys.has(createdDeliveryKey)) || failedCreatedDelivery) && shouldForwardCreatedTickets) {
      try {
        const method = await deliverEmail(nextState, buildTicketCreatedForwardMessage(nextTicket, nextState, baseUrl));
        nextLogs.unshift(
          buildNotificationLogEntry({
            eventKey: "ticket_created",
            ticketId: nextTicket.id,
            recipients: getOperationsMailboxRecipients(),
            status: "Enviado",
            dedupeKey: createdDeliveryKey,
            subject: `[TicketMind] Abertura de chamado - ${nextTicket.id || ""}`,
            method,
          }),
        );
      } catch (error) {
        nextLogs.unshift(
          buildNotificationLogEntry({
            eventKey: "ticket_created",
            ticketId: nextTicket.id,
            recipients: getOperationsMailboxRecipients(),
            status: "Falha",
            error: error instanceof Error ? error.message : "Falha ao enviar email operacional de abertura.",
            dedupeKey: createdDeliveryKey,
            subject: `[TicketMind] Abertura de chamado - ${nextTicket.id || ""}`,
            method: "Falha",
          }),
        );
      }
      successfulLogKeys.add(createdDeliveryKey);
    }

    for (const change of changes) {
      const rule = rules.find((candidate) => candidate.eventKey === change.key);
      if (!rule) continue;

      const recipients = resolveNotificationRecipients(nextTicket, rule, nextState, change.key);
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
      if (successfulLogKeys.has(dedupeKey)) continue;

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

      successfulLogKeys.add(dedupeKey);
    }
  }

  if (persistState && (ticketsChanged || JSON.stringify(nextLogs) !== JSON.stringify(nextState.notificationLogs || []))) {
    await persistState({
      ...nextState,
      tickets: ticketsChanged ? nextTicketsList : nextState.tickets,
      notificationLogs: nextLogs.slice(0, 200),
    });
  }
}

export async function processRecurringApprovalReminders({ state, persistState, baseUrl, now = new Date() }) {
  const activeRules = Array.isArray(state.notificationRules) ? state.notificationRules.filter((rule) => rule.active) : [];
  const approvalReminderRule = activeRules.find((rule) => rule.eventKey === "ticket_approval_reminder") || null;
  const eventsMap = new Map((state.notificationEvents || []).map((event) => [event.key, event]));
  const layoutsMap = new Map((state.emailLayouts || []).map((layout) => [layout.id, layout]));
  const existingLogKeys = new Set((state.notificationLogs || []).map((log) => log.dedupeKey).filter(Boolean));
  const nextLogs = [...(state.notificationLogs || [])];
  let changed = false;

  for (const ticket of Array.isArray(state.tickets) ? state.tickets : []) {
    const reminderChange = buildApprovalReminderChange(ticket, existingLogKeys, now);
    if (!reminderChange) continue;

    const recipients = getApprovalReminderRecipients(ticket, approvalReminderRule, state);
    if (!recipients.length) continue;

    const eventLabel = eventsMap.get(reminderChange.key)?.label || "Lembrete de aprovacao";
    const layout =
      (approvalReminderRule?.layoutId ? layoutsMap.get(approvalReminderRule.layoutId) : null) ||
      (state.emailLayouts || []).find(
        (candidate) => candidate.eventKey === reminderChange.key && normalizeText(candidate.status) === "ativo",
      ) ||
      null;
    const placeholders = buildPlaceholders(state, ticket, eventLabel, baseUrl);
    const subject = compileTemplate(layout?.subject || `[TicketMind] ${eventLabel} - {{numero_chamado}}`, placeholders);
    const body = compileTemplate(
      layout?.body ||
        "Existe uma aprovacao pendente aguardando sua decisao.\nChamado: {{numero_chamado}}\nTitulo: {{titulo}}\nSolicitante: {{solicitante}}\nAprovador atual: {{aprovador_atual}}\nSLA da aprovacao: {{sla_aprovacao}}\nLink: {{link_chamado}}",
      placeholders,
    );

    try {
      const method = await deliverEmail(state, {
        to: recipients,
        subject,
        text: body,
        html: `<pre style="font-family:Arial,sans-serif;white-space:pre-wrap">${body}</pre>`,
      });
      nextLogs.unshift(
        buildNotificationLogEntry({
          eventKey: reminderChange.key,
          ticketId: ticket.id,
          recipients,
          status: "Enviado",
          dedupeKey: reminderChange.dedupeKey,
          subject,
          method,
        }),
      );
    } catch (error) {
      nextLogs.unshift(
        buildNotificationLogEntry({
          eventKey: reminderChange.key,
          ticketId: ticket.id,
          recipients,
          status: "Falha",
          error: error instanceof Error ? error.message : "Falha ao enviar email.",
          dedupeKey: reminderChange.dedupeKey,
          subject,
          method: "Falha",
        }),
      );
    }

    existingLogKeys.add(reminderChange.dedupeKey);
    changed = true;
  }

  if (changed && persistState) {
    await persistState({
      ...state,
      notificationLogs: nextLogs.slice(0, 200),
    });
  }
}
