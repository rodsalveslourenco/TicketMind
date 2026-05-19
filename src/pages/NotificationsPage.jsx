import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useAppData } from "../data/AppDataContext";
import { hasAnyPermission } from "../data/permissions";
import { exportRowsWithFormat, getExportFormatLabel } from "../lib/export";

function buildRuleDraft(eventKey, existingRule) {
  return {
    id: existingRule?.id || "",
    eventKey,
    active: existingRule?.active !== false,
    recipientUserIds: Array.isArray(existingRule?.recipientUserIds) ? existingRule.recipientUserIds : [],
    externalEmails: Array.isArray(existingRule?.externalEmails)
      ? existingRule.externalEmails.join(", ")
      : String(existingRule?.externalEmails || ""),
    layoutId: String(existingRule?.layoutId || ""),
  };
}

function resolveRuleStatus(ruleDraft) {
  const hasRecipients = Boolean(ruleDraft.recipientUserIds.length || String(ruleDraft.externalEmails || "").trim());
  const hasLayout = Boolean(String(ruleDraft.layoutId || "").trim());
  if (!ruleDraft.active) return "Pausada";
  if (hasRecipients && hasLayout) return "Pronta";
  if (hasRecipients) return "Sem layout";
  return "Sem destinatarios";
}

function resolveSmtpHealth(settings) {
  const hasCoreFields = Boolean(String(settings.host || "").trim() && String(settings.fromEmail || "").trim());
  if (!hasCoreFields) return { label: "Incompleto", tone: "warning", detail: "Faltam host e remetente." };
  if (!settings.hasPassword && !String(settings.password || "").trim()) {
    return { label: "Credencial pendente", tone: "warning", detail: "Defina a senha do SMTP para validar o envio." };
  }
  return { label: "Configurado", tone: "success", detail: `${settings.host}:${settings.port || 587}` };
}

function NotificationsPage() {
  const { user } = useAuth();
  const {
    emailLayouts,
    notificationEvents,
    notificationLogs,
    notificationRules,
    processInboundEmail,
    pushToast,
    requestNotificationTest,
    saveNotificationRule,
    saveSmtpSettings,
    smtpSettings,
    users,
  } = useAppData();
  const [activeSection, setActiveSection] = useState("overview");
  const [ruleDrafts, setRuleDrafts] = useState({});
  const [smtpDraft, setSmtpDraft] = useState(smtpSettings);
  const [testDraft, setTestDraft] = useState({
    recipients: "",
    subject: "Teste de notificacao TicketMind",
    body: "Teste de envio realizado com sucesso.",
  });
  const [testing, setTesting] = useState(false);
  const [intakeDraft, setIntakeDraft] = useState({
    fromEmail: "",
    subject: "",
    body: "",
  });

  const canView = hasAnyPermission(user, ["notifications_view", "notifications_manage", "users_admin"]);
  const canManage = hasAnyPermission(user, ["notifications_manage", "users_admin"]);

  useEffect(() => {
    const nextDrafts = {};
    notificationEvents.forEach((event) => {
      nextDrafts[event.key] = buildRuleDraft(
        event.key,
        notificationRules.find((rule) => rule.eventKey === event.key),
      );
    });
    setRuleDrafts(nextDrafts);
  }, [notificationEvents, notificationRules]);

  useEffect(() => {
    setSmtpDraft(smtpSettings);
  }, [smtpSettings]);

  const sortedUsers = useMemo(
    () =>
      users
        .filter((candidate) => candidate.email && candidate.status !== "Inativo")
        .slice()
        .sort((left, right) => left.name.localeCompare(right.name)),
    [users],
  );

  const availableLayouts = useMemo(
    () => emailLayouts.filter((layout) => layout.status === "Ativo"),
    [emailLayouts],
  );

  const ruleSummaries = useMemo(
    () =>
      notificationEvents.map((eventItem) => {
        const draft = ruleDrafts[eventItem.key] || buildRuleDraft(eventItem.key);
        return {
          eventItem,
          draft,
          status: resolveRuleStatus(draft),
        };
      }),
    [notificationEvents, ruleDrafts],
  );

  const smtpHealth = useMemo(() => resolveSmtpHealth(smtpDraft), [smtpDraft]);
  const failedLogs = useMemo(
    () => notificationLogs.filter((log) => log.status === "Falha"),
    [notificationLogs],
  );

  if (!canView) {
    return <Navigate replace to="/app/dashboard" />;
  }

  const updateRuleDraft = (eventKey, updater) => {
    setRuleDrafts((current) => ({
      ...current,
      [eventKey]: typeof updater === "function" ? updater(current[eventKey] || buildRuleDraft(eventKey)) : updater,
    }));
  };

  const toggleRecipient = (eventKey, userId) => {
    updateRuleDraft(eventKey, (current) => ({
      ...current,
      recipientUserIds: current.recipientUserIds.includes(userId)
        ? current.recipientUserIds.filter((item) => item !== userId)
        : [...current.recipientUserIds, userId],
    }));
  };

  const handleSaveRule = (eventKey) => {
    const draft = ruleDrafts[eventKey];
    if (!draft) return;
    saveNotificationRule(
      {
        ...draft,
        externalEmails: draft.externalEmails,
      },
      draft.id || undefined,
    );
    pushToast("Regra atualizada", notificationEvents.find((event) => event.key === eventKey)?.label || eventKey);
  };

  const handleSaveSmtp = async (event) => {
    event.preventDefault();
    setSmtpDraft((current) => ({ ...current, deliveryMode: "smtp" }));
    try {
      await saveSmtpSettings({ ...smtpDraft, deliveryMode: "smtp" });
      pushToast("SMTP atualizado", smtpDraft.host || "Configuracao salva");
    } catch (error) {
      pushToast("Falha ao salvar SMTP", error.message, "warning");
    }
  };

  const handleTestEmail = async () => {
    setTesting(true);
    try {
      await requestNotificationTest({
        recipients: testDraft.recipients,
        subject: testDraft.subject,
        body: testDraft.body,
      });
      pushToast("Teste enviado", testDraft.recipients);
    } catch (error) {
      pushToast("Falha no teste", error.message, "warning");
    } finally {
      setTesting(false);
    }
  };

  const handleInboundEmail = () => {
    const createdTicket = processInboundEmail(intakeDraft);
    if (!createdTicket?.id) {
      pushToast("Falha ao processar e-mail", "Revise o remetente, assunto ou permissoes.", "warning");
      return;
    }
    pushToast("E-mail processado", createdTicket.id);
    setIntakeDraft({ fromEmail: "", subject: "", body: "" });
  };

  const handleExportNotifications = (format = "csv") => {
    exportRowsWithFormat({
      format,
      fileName: `ticketmind-notificacoes-${new Date().toISOString().slice(0, 10)}.csv`,
      title: "Relatorio de notificacoes",
      columns: [
        { key: "eventKey", label: "Evento" },
        { key: "ticketId", label: "Chamado" },
        { key: "status", label: "Status" },
        { key: "method", label: "Metodo" },
        { key: "sentAt", label: "Data" },
        { key: "recipients", label: "Destinatarios", render: (item) => item.recipients.join(", ") },
        { key: "error", label: "Erro" },
      ],
      items: notificationLogs,
    });
    pushToast("Exportacao concluida", `${notificationLogs.length} log(s) preparados em ${getExportFormatLabel(format)}.`);
  };

  const sectionOptions = [
    { key: "overview", label: "Visao geral" },
    { key: "rules", label: "Regras" },
    { key: "delivery", label: "Entrega" },
    { key: "intake", label: "Entrada por e-mail" },
    { key: "logs", label: "Logs" },
  ];

  return (
    <div className="settings-page">
      <section className="module-hero board-card">
        <div>
          <span className="eyebrow">Mensageria</span>
          <h2>Notificacoes e e-mail</h2>
        </div>
        <div className="insight-strip">
          <div className="insight-chip">
            <strong>{ruleSummaries.filter((item) => item.status === "Pronta").length}</strong>
            <span>regras prontas</span>
          </div>
          <div className="insight-chip">
            <strong>{smtpHealth.label === "Configurado" ? "OK" : "Pendente"}</strong>
            <span>canal de envio</span>
          </div>
          <div className="insight-chip">
            <strong>{failedLogs.length}</strong>
            <span>falhas recentes</span>
          </div>
        </div>
      </section>

      <section className="board-card">
        <div className="toolbar">
          {sectionOptions.map((option) => (
            <button
              className={`filter-pill interactive-button${activeSection === option.key ? " is-active" : ""}`}
              key={option.key}
              onClick={() => setActiveSection(option.key)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      {activeSection === "overview" ? (
        <div className="page-grid">
          <section className="board-card">
            <div className="card-heading">
              <div>
                <h2>Saude do envio</h2>
                <span>Resumo rapido do que esta pronto e do que ainda bloqueia notificacoes e recuperacao de senha.</span>
              </div>
            </div>
            <div className="dashboard-kpi-strip compact-kpi-strip">
              <div className="dashboard-kpi-card">
                <span>SMTP</span>
                <strong>{smtpHealth.label}</strong>
                <small>{smtpHealth.detail}</small>
              </div>
              <div className="dashboard-kpi-card">
                <span>Recuperacao de senha</span>
                <strong>{smtpHealth.label === "Configurado" ? "Disponivel" : "Bloqueada"}</strong>
                <small>Depende do SMTP configurado.</small>
              </div>
              <div className="dashboard-kpi-card">
                <span>Canal ativo</span>
                <strong>SMTP</strong>
                <small>O sistema envia somente por SMTP.</small>
              </div>
            </div>
          </section>

          <section className="board-card">
            <div className="card-heading">
              <div>
                <h2>Eventos monitorados</h2>
                <span>O que ja esta ativo e o que ainda precisa de destinatarios ou layout.</span>
              </div>
            </div>
            <div className="ticket-rows">
              {ruleSummaries.map(({ eventItem, status, draft }) => (
                <article className="ticket-row-card" key={eventItem.key}>
                  <div className="ticket-row-main">
                    <div className="ticket-row-title">
                      <strong>{eventItem.label}</strong>
                      <h3>{eventItem.description}</h3>
                    </div>
                    <div className="ticket-row-badges">
                      <span className={`badge ${status === "Pronta" ? "status-badge-resolvido" : status === "Pausada" ? "badge-neutral" : "status-badge-aguardando"}`}>{status}</span>
                      <span className="badge badge-neutral">{draft.recipientUserIds.length} usuario(s)</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {activeSection === "rules" ? (
        <section className="board-card glpi-panel">
          <div className="glpi-toolbar">
            <div>
              <h2>Regras por evento</h2>
              <span>Cada card ficou independente para reduzir o volume de configuracao por tela.</span>
            </div>
          </div>
          <div className="settings-stack">
            {ruleSummaries.map(({ eventItem, draft, status }) => (
              <article className="board-card settings-card" key={eventItem.key}>
                <div className="settings-card-head">
                  <div>
                    <strong>{eventItem.label}</strong>
                    <span>{eventItem.description}</span>
                  </div>
                  <div className="ticket-row-badges">
                    <span className={`badge ${status === "Pronta" ? "status-badge-resolvido" : status === "Pausada" ? "badge-neutral" : "status-badge-aguardando"}`}>{status}</span>
                    <label className="inline-toggle">
                      <input
                        checked={draft.active}
                        disabled={!canManage}
                        onChange={(event) => updateRuleDraft(eventItem.key, (current) => ({ ...current, active: event.target.checked }))}
                        type="checkbox"
                      />
                      <span>Ativo</span>
                    </label>
                  </div>
                </div>

                <div className="glpi-form-grid">
                  <label className="field-block field-span-2">
                    <span>Layout de e-mail</span>
                    <select
                      disabled={!canManage}
                      onChange={(event) => updateRuleDraft(eventItem.key, (current) => ({ ...current, layoutId: event.target.value }))}
                      value={draft.layoutId}
                    >
                      <option value="">Sem layout especifico</option>
                      {availableLayouts
                        .filter((layout) => !layout.eventKey || layout.eventKey === eventItem.key)
                        .map((layout) => (
                          <option key={layout.id} value={layout.id}>
                            {layout.name}
                          </option>
                        ))}
                    </select>
                  </label>

                  <label className="field-block field-span-2">
                    <span>E-mails adicionais</span>
                    <textarea
                      disabled={!canManage}
                      onChange={(event) => updateRuleDraft(eventItem.key, (current) => ({ ...current, externalEmails: event.target.value }))}
                      placeholder="email1@dominio.com, email2@dominio.com"
                      value={draft.externalEmails}
                    />
                  </label>
                </div>

                <div className="recipient-picker">
                  <strong>Usuarios destinatarios</strong>
                  <div className="recipient-grid">
                    {sortedUsers.map((candidate) => (
                      <label className="recipient-option" key={candidate.id}>
                        <input
                          checked={draft.recipientUserIds.includes(candidate.id)}
                          disabled={!canManage}
                          onChange={() => toggleRecipient(eventItem.key, candidate.id)}
                          type="checkbox"
                        />
                        <span>
                          <strong>{candidate.name}</strong>
                          <small>{candidate.email}</small>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {canManage ? (
                  <div className="ticket-create-actions compact-actions">
                    <button className="primary-button interactive-button" onClick={() => handleSaveRule(eventItem.key)} type="button">
                      Salvar regra
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {activeSection === "delivery" ? (
        <div className="page-grid">
          <section className="board-card glpi-panel">
            <div className="glpi-toolbar">
              <div>
                <h2>Entrega de e-mail</h2>
                <span>O sistema usa apenas SMTP para notificacoes e recuperacao de senha.</span>
              </div>
            </div>

            <div className="card-heading">
              <div>
                <h2>SMTP</h2>
                <span>{smtpHealth.detail}</span>
              </div>
            </div>
            <form className="glpi-ticket-form" onSubmit={handleSaveSmtp}>
              <div className="glpi-form-grid">
                <label className="field-block">
                  <span>Servidor SMTP</span>
                  <input disabled={!canManage} onChange={(event) => setSmtpDraft((current) => ({ ...current, host: event.target.value }))} value={smtpDraft.host || ""} />
                </label>
                <label className="field-block">
                  <span>Porta</span>
                  <input disabled={!canManage} onChange={(event) => setSmtpDraft((current) => ({ ...current, port: event.target.value }))} type="number" value={smtpDraft.port || 587} />
                </label>
                <label className="field-block">
                  <span>Usuario</span>
                  <input disabled={!canManage} onChange={(event) => setSmtpDraft((current) => ({ ...current, username: event.target.value }))} value={smtpDraft.username || ""} />
                </label>
                <label className="field-block">
                  <span>Senha {smtpDraft.hasPassword ? "(mantida se vazio)" : ""}</span>
                  <input disabled={!canManage} onChange={(event) => setSmtpDraft((current) => ({ ...current, password: event.target.value }))} type="password" value={smtpDraft.password || ""} />
                </label>
                <label className="field-block">
                  <span>E-mail remetente</span>
                  <input disabled={!canManage} onChange={(event) => setSmtpDraft((current) => ({ ...current, fromEmail: event.target.value }))} type="email" value={smtpDraft.fromEmail || ""} />
                </label>
                <label className="field-block">
                  <span>Nome do remetente</span>
                  <input disabled={!canManage} onChange={(event) => setSmtpDraft((current) => ({ ...current, fromName: event.target.value }))} value={smtpDraft.fromName || ""} />
                </label>
              </div>
              <div className="toggle-row">
                <label className="inline-toggle">
                  <input checked={Boolean(smtpDraft.secure)} disabled={!canManage} onChange={(event) => setSmtpDraft((current) => ({ ...current, secure: event.target.checked }))} type="checkbox" />
                  <span>SSL/TLS</span>
                </label>
                <label className="inline-toggle">
                  <input checked={smtpDraft.requireTls !== false} disabled={!canManage} onChange={(event) => setSmtpDraft((current) => ({ ...current, requireTls: event.target.checked }))} type="checkbox" />
                  <span>Exigir TLS</span>
                </label>
              </div>
              {canManage ? (
                <div className="ticket-create-actions compact-actions">
                  <button className="primary-button interactive-button" type="submit">
                    Salvar SMTP
                  </button>
                </div>
              ) : null}
            </form>
          </section>

          <section className="board-card glpi-panel">
            <div className="card-heading">
              <div>
                <h2>Teste de envio</h2>
                <span>Valida a configuracao SMTP ja salva no servidor. Se alterar SMTP, salve antes de testar.</span>
              </div>
            </div>
            <div className="glpi-form-grid">
              <label className="field-block field-span-2">
                <span>Destinatarios do teste</span>
                <input onChange={(event) => setTestDraft((current) => ({ ...current, recipients: event.target.value }))} placeholder="email1@dominio.com, email2@dominio.com" value={testDraft.recipients} />
              </label>
              <label className="field-block field-span-2">
                <span>Assunto</span>
                <input onChange={(event) => setTestDraft((current) => ({ ...current, subject: event.target.value }))} value={testDraft.subject} />
              </label>
              <label className="field-block field-span-2">
                <span>Corpo</span>
                <textarea onChange={(event) => setTestDraft((current) => ({ ...current, body: event.target.value }))} value={testDraft.body} />
              </label>
            </div>
            {canManage ? (
              <div className="ticket-create-actions compact-actions">
                <button className="ghost-button interactive-button" disabled={testing} onClick={handleTestEmail} type="button">
                  {testing ? "Testando..." : "Testar envio"}
                </button>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {activeSection === "intake" ? (
        <section className="board-card glpi-panel">
          <div className="glpi-toolbar">
            <div>
              <h2>Abertura de chamado por e-mail</h2>
              <span>Simule a entrada da mensagem e confirme se o roteamento esta coerente.</span>
            </div>
          </div>
          <div className="glpi-form-grid">
            <label className="field-block">
              <span>Remetente</span>
              <input onChange={(event) => setIntakeDraft((current) => ({ ...current, fromEmail: event.target.value }))} type="email" value={intakeDraft.fromEmail} />
            </label>
            <label className="field-block field-span-2">
              <span>Assunto</span>
              <input onChange={(event) => setIntakeDraft((current) => ({ ...current, subject: event.target.value }))} value={intakeDraft.subject} />
            </label>
            <label className="field-block field-span-2">
              <span>Corpo</span>
              <textarea onChange={(event) => setIntakeDraft((current) => ({ ...current, body: event.target.value }))} value={intakeDraft.body} />
            </label>
          </div>
          {canManage ? (
            <div className="ticket-create-actions compact-actions">
              <button className="primary-button interactive-button" onClick={handleInboundEmail} type="button">
                Processar e abrir chamado
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {activeSection === "logs" ? (
        <section className="board-card glpi-panel">
          <div className="glpi-toolbar">
            <div>
              <h2>Logs de envio</h2>
              <span>Falhas nao param o sistema, mas precisam ficar visiveis para correcoes rapidas.</span>
            </div>
            <div className="toolbar">
              <button className="ghost-button interactive-button" onClick={() => handleExportNotifications("csv")} type="button">
                CSV
              </button>
              <button className="ghost-button interactive-button" onClick={() => handleExportNotifications("excel")} type="button">
                Excel
              </button>
              <button className="ghost-button interactive-button" onClick={() => handleExportNotifications("pdf")} type="button">
                PDF
              </button>
            </div>
          </div>
          <div className="settings-log-list">
            {notificationLogs.length ? (
              notificationLogs.slice(0, 40).map((log) => (
                <article className="table-row settings-log-row" key={log.id}>
                  <div>
                    <strong>{log.eventKey}</strong>
                    <span>{log.ticketId || "Sem chamado"} | {log.sentAt}</span>
                  </div>
                  <div className="row-stats row-stats-wrap">
                    <span>{log.recipients.join(", ") || "-"}</span>
                    <span>{log.method || "-"}</span>
                    <span>{log.status}</span>
                    <span>{log.error || "-"}</span>
                  </div>
                </article>
              ))
            ) : (
              <div className="empty-state">
                <strong>Nenhum envio registrado.</strong>
                <span>Os disparos e testes aparecerao aqui.</span>
              </div>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export default NotificationsPage;
