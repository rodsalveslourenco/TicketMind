const DEFAULT_AI_MODEL = process.env.OPENAI_TICKET_MODEL || process.env.OPENAI_MODEL || "gpt-5-mini";
const OPENAI_RESPONSES_URL = process.env.OPENAI_RESPONSES_URL || "https://api.openai.com/v1/responses";

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function compactTicket(ticket = {}) {
  return {
    id: ticket.id || "",
    title: ticket.title || "",
    description: ticket.description || "",
    requester: ticket.requester || "",
    requesterEmail: ticket.requesterEmail || "",
    department: ticket.department || "",
    queue: ticket.queue || "",
    category: ticket.category || "",
    type: ticket.type || "",
    priority: ticket.priority || "",
    urgency: ticket.urgency || "",
    impact: ticket.impact || "",
    source: ticket.source || "",
    location: ticket.location || "",
    status: ticket.status || "",
    subtasks: (Array.isArray(ticket.subtasks) ? ticket.subtasks : []).map((task) => ({
      title: task.title || "",
      status: task.status || "",
      ownerName: task.ownerName || "",
    })),
    checklistItems: (Array.isArray(ticket.checklistItems) ? ticket.checklistItems : []).map((item) => ({
      label: item.label || "",
      checked: Boolean(item.checked),
    })),
  };
}

function summarizeBehaviorContext(state = {}, currentTicket = {}) {
  const currentDepartment = normalizeText(currentTicket.department);
  const recentTickets = (Array.isArray(state.tickets) ? state.tickets : [])
    .filter((ticket) => String(ticket.id || "") !== String(currentTicket.id || ""))
    .slice(0, 80);
  const sameDepartment = recentTickets.filter((ticket) => currentDepartment && normalizeText(ticket.department) === currentDepartment);
  const openTickets = recentTickets.filter((ticket) => !["resolvido", "fechado"].includes(normalizeText(ticket.status))).length;
  const criticalTickets = recentTickets.filter((ticket) => ["critica", "alta"].includes(normalizeText(ticket.priority))).length;

  return {
    recentTickets: recentTickets.length,
    sameDepartmentTickets: sameDepartment.length,
    openTickets,
    criticalTickets,
    commonCategories: topCounts(recentTickets.map((ticket) => ticket.category || ticket.queue || "Sem categoria")),
    commonDepartments: topCounts(recentTickets.map((ticket) => ticket.department || "Sem departamento")),
  };
}

function topCounts(values = []) {
  const counts = values.reduce((accumulator, value) => {
    const label = String(value || "").trim();
    if (!label) return accumulator;
    accumulator[label] = (accumulator[label] || 0) + 1;
    return accumulator;
  }, {});
  return Object.entries(counts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([label, count]) => ({ label, count }));
}

function extractOutputText(payload = {}) {
  if (payload.output_text) return String(payload.output_text);
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    const content = Array.isArray(item.content) ? item.content : [];
    for (const part of content) {
      if (part.type === "output_text" && part.text) return String(part.text);
      if (part.text) return String(part.text);
    }
  }
  return "";
}

function normalizeAiAnalysis(payload = {}) {
  const actions = Array.isArray(payload.recommendedActions) ? payload.recommendedActions : [];
  const behaviorSignals = Array.isArray(payload.behaviorSignals) ? payload.behaviorSignals : [];
  return {
    summary: String(payload.summary || "").trim().slice(0, 700),
    operationalRisk: ["baixo", "medio", "alto", "critico"].includes(normalizeText(payload.operationalRisk))
      ? normalizeText(payload.operationalRisk)
      : "medio",
    suggestedPriority: String(payload.suggestedPriority || "").trim().slice(0, 80),
    suggestedQueue: String(payload.suggestedQueue || "").trim().slice(0, 120),
    requesterSentiment: String(payload.requesterSentiment || "").trim().slice(0, 80),
    behaviorSignals: behaviorSignals.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 5),
    recommendedActions: actions.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 6),
    confidence: Math.min(Math.max(Number(payload.confidence) || 0, 0), 1),
    generatedAt: new Date().toISOString(),
    model: DEFAULT_AI_MODEL,
  };
}

export function isTicketAiConfigured() {
  return Boolean(String(process.env.OPENAI_API_KEY || "").trim());
}

export async function analyzeTicketWithAI(ticket = {}, state = {}) {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) return null;

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: DEFAULT_AI_MODEL,
      input: [
        {
          role: "system",
          content:
            "Voce e uma IA operacional de service desk. Leia chamados em portugues, identifique risco, comportamento recorrente, prioridade sugerida, fila sugerida e proximas acoes. Responda somente JSON valido no schema solicitado.",
        },
        {
          role: "user",
          content: JSON.stringify({
            ticket: compactTicket(ticket),
            behaviorContext: summarizeBehaviorContext(state, ticket),
          }),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "ticket_ai_analysis",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: [
              "summary",
              "operationalRisk",
              "suggestedPriority",
              "suggestedQueue",
              "requesterSentiment",
              "behaviorSignals",
              "recommendedActions",
              "confidence",
            ],
            properties: {
              summary: { type: "string" },
              operationalRisk: { type: "string", enum: ["baixo", "medio", "alto", "critico"] },
              suggestedPriority: { type: "string" },
              suggestedQueue: { type: "string" },
              requesterSentiment: { type: "string" },
              behaviorSignals: { type: "array", items: { type: "string" } },
              recommendedActions: { type: "array", items: { type: "string" } },
              confidence: { type: "number" },
            },
          },
        },
      },
    }),
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI ticket analysis failed with HTTP ${response.status}: ${responseText}`);
  }

  const parsedResponse = responseText ? JSON.parse(responseText) : {};
  const outputText = extractOutputText(parsedResponse);
  if (!outputText) return null;
  return normalizeAiAnalysis(JSON.parse(outputText));
}
