import test from "node:test";
import assert from "node:assert/strict";

import { analyzeTicketWithAI } from "../server/aiTicketInsights.js";
import {
  buildPasswordRecoveryForwardMessage,
  buildTicketCreatedForwardMessage,
  resolveNotificationRecipients,
} from "../server/notifications.js";

test("password recovery always routes to TI and keeps submitted email in body", () => {
  const message = buildPasswordRecoveryForwardMessage({
    submittedEmail: "solicitante@externo.com",
    recipientName: "Rodrigo Alves",
    matchedUserEmail: "rodrigo@interno.local",
    resetUrl: "https://ticketmind.example/reset?token=abc",
  });

  assert.deepEqual(message.to, ["ti@wegamarine.com.br"]);
  assert.equal(message.subject, "Recuperacao de senha TicketMind - Rodrigo Alves");
  assert.match(message.text, /Email informado no formulario: solicitante@externo\.com/);
  assert.match(message.text, /Email cadastrado do usuario: rodrigo@interno\.local/);
  assert.doesNotMatch(message.to.join(","), /solicitante@externo\.com/);
  assert.doesNotMatch(message.to.join(","), /rodrigo@interno\.local/);
});

test("password recovery without matched user still notifies TI", () => {
  const message = buildPasswordRecoveryForwardMessage({
    submittedEmail: "naoexiste@externo.com",
    recipientName: "",
    matchedUserEmail: "",
    resetUrl: "",
  });

  assert.deepEqual(message.to, ["ti@wegamarine.com.br"]);
  assert.match(message.text, /naoexiste@externo\.com/);
  assert.match(message.text, /Nenhum usuario ativo correspondente foi localizado/);
});

test("ticket created forwarding contains the full operational form for TI", () => {
  const ticket = {
    id: "INC-2050",
    title: "Impressora sem comunicacao",
    description: "Equipamento da recepcao nao imprime etiquetas.",
    requester: "Marina",
    requesterEmail: "marina@empresa.com.br",
    type: "Incidente",
    status: "Aberto",
    priority: "Alta",
    urgency: "Alta",
    impact: "Media",
    department: "TI",
    queue: "Service Desk",
    category: "Infraestrutura",
    source: "Portal",
    location: "Recepcao",
    openedAt: "2026-05-19T20:00:00.000Z",
    openedAtLabel: "19/05/2026 17:00",
    sla: "8h",
    projectName: "Projeto Zebra",
    assetName: "Zebra ZD220",
    parentTicketId: "REQ-1001",
    approval: { approverName: "Carlos" },
    approvalAmount: 1200,
    watchers: "time@empresa.com.br",
    watcherDetails: [{ email: "time@empresa.com.br", name: "Time" }],
    attachments: [{ name: "foto.png" }],
    checklistItems: [{ id: "1", label: "Validar cabo" }],
    followUps: [{ id: "1", message: "Aberto pelo portal" }],
    aiAnalysis: {
      summary: "Solicitante relata falha de comunicacao em impressora critica da recepcao.",
      operationalRisk: "alto",
      suggestedPriority: "Alta",
      suggestedQueue: "Service Desk",
      requesterSentiment: "urgente",
      behaviorSignals: ["incidente recorrente em perifericos"],
      recommendedActions: ["Validar conectividade", "Checar fila de impressao"],
      confidence: 0.82,
    },
  };

  const message = buildTicketCreatedForwardMessage(ticket, { users: [] }, "https://ticketmind.example", ["gestor@empresa.com.br"]);

  assert.deepEqual(message.to, ["ti@wegamarine.com.br"]);
  assert.match(message.subject, /\[TicketMind\] Abertura de chamado - INC-2050/);
  assert.match(message.text, /Titulo: Impressora sem comunicacao/);
  assert.match(message.text, /Descricao: Equipamento da recepcao nao imprime etiquetas\./);
  assert.match(message.text, /Email do solicitante: marina@empresa\.com\.br/);
  assert.match(message.text, /Departamento: TI/);
  assert.match(message.text, /Categoria: Infraestrutura/);
  assert.match(message.text, /Projeto: Projeto Zebra/);
  assert.match(message.text, /Ativo: Zebra ZD220/);
  assert.match(message.text, /Anexos: 1/);
  assert.match(message.text, /Checklist inicial: 1/);
  assert.match(message.text, /Follow-ups iniciais: 1/);
  assert.match(message.text, /Analise da IA:/);
  assert.match(message.text, /Resumo: Solicitante relata falha de comunicacao/);
  assert.match(message.text, /Acoes recomendadas: Validar conectividade; Checar fila de impressao/);
  assert.match(message.text, /Destinatarios originais previstos: gestor@empresa\.com\.br/);
});

test("ticket created rule can include requester email", () => {
  const recipients = resolveNotificationRecipients(
    {
      requesterEmail: "solicitante@empresa.com.br",
      watcherDetails: [{ email: "observador@empresa.com.br", eventKeys: ["ticket_created"] }],
    },
    {
      includeRequesterEmail: true,
      externalEmails: ["gestor@empresa.com.br"],
      recipientUserIds: ["u1"],
    },
    {
      users: [{ id: "u1", email: "tecnico@empresa.com.br" }],
    },
    "ticket_created",
  );

  assert.deepEqual(recipients.sort(), ["gestor@empresa.com.br", "observador@empresa.com.br", "solicitante@empresa.com.br", "tecnico@empresa.com.br"].sort());
});

test("ticket created rule ignores requester email when disabled", () => {
  const recipients = resolveNotificationRecipients(
    { requesterEmail: "solicitante@empresa.com.br" },
    { includeRequesterEmail: false, externalEmails: ["gestor@empresa.com.br"], recipientUserIds: [] },
    { users: [] },
    "ticket_created",
  );

  assert.deepEqual(recipients, ["gestor@empresa.com.br"]);
});

test("AI ticket analysis is skipped without OpenAI key", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  try {
    const result = await analyzeTicketWithAI({ id: "INC-1", title: "Teste" }, { tickets: [] });
    assert.equal(result, null);
  } finally {
    if (previousKey) process.env.OPENAI_API_KEY = previousKey;
  }
});
