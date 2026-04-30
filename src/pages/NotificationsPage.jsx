import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useAppData } from "../data/AppDataContext";
import { hasAnyPermission } from "../data/permissions";

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

function NotificationsPage() {
  const { user } = useAuth();
  const {
    emailServiceSettings,
    emailLayouts,
    notificationEvents,
    notificationLogs,
    notificationRules,
    pushToast,
    requestNotificationTest,
    saveEmailServiceSettings,
    saveNotificationRule,
    saveSmtpSettings,
    smtpSettings,
    users,
  } = useAppData();
  const [ruleDrafts, setRuleDrafts] = useState({});
  const [smtpDraft, setSmtpDraft] = useState(smtpSettings);
  const [serviceDraft, setServiceDraft] = useState(emailServiceSettings);
  const [testDraft, setTestDraft] = useState({
    recipients: "",
    subject: "Teste de notificacao TicketMind",
    body: "Teste de envio realizado com sucesso.",
  });
  const [testing, setTesting] = useState(false);

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

  useEffect(() => {
    setServiceDraft(emailServiceSettings);
  }, [emailServiceSettings]);

  const sortedUsers = useMemo(
    () => users.slice().sort((left, right) => left.name.localeCompare(right.name)),
    [users],
  );

  const availableLayouts = useMemo(
    () => emailLayouts.filter((layout) => layout.status === "Ativo"),
    [emailLayouts],
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
    pushToast("Notificacao atualizada", notificationEvents.find((event) => event.key === eventKey)?.label || eventKey);
  };

  const handleSaveSmtp = (event) => {
    event.preventDefault();
    saveSmtpSettings(smtpDraft);
    pushToast("SMTP atualizado", smtpDraft.host || "Configuracao salva");
  };

  const handleSaveService = (event) => {
    event.preventDefault();
    saveEmailServiceSettings(serviceDraft);
    saveSmtpSettings({ ...smtpDraft, deliveryMode: serviceDraft.deliveryMode || smtpDraft.deliveryMode || "smtp" });
    pushToast("Servico de e-mail atualizado", serviceDraft.provider || "Servico de envio");
  };

  const handleTestEmail = async () => {
    setTesting(true);
    try {
      await requestNotificationTest({
        smtpSettings: smtpDraft,
        emailServiceSettings: serviceDraft,
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

  return (
    <div className="settings-page">
      <section className="module-hero board-card">
        <div>
          <span className="eyebrow">Configuracoes</span>
          <h2>Notificacoes</h2>
        </div>
        <div className="insight-strip">
          <div className="insight-chip">
            <strong>{notificationEvents.length}</strong>
            <span>eventos disponiveis</span>
          </div>
          <div className="insight-chip">
            <strong>{notificationRules.filter((rule) => rule.active).length}</strong>
            <span>regras ativas</span>
          </div>
          <div className="insight-chip">
            <strong>{notificationLogs.filter((log) => log.status === "Falha").length}</strong>
            <span>falhas registradas</span>
          </div>
        </div>
      </section>

      <section className="board-card glpi-panel">
        <div className="glpi-toolbar">
          <div>
            <h2>Regras por evento</h2>
            <span>Defina usuarios individuais, e-mails externos e layout para cada disparo.</span>
          </div>
        </div>
        <div className="settings-stack">
          {notificationEvents.map((eventItem) => {
            const draft = ruleDrafts[eventItem.key] || buildRuleDraft(eventItem.key);
            return (
              <article className="board-card settings-card" key={eventItem.key}>
                <div className="settings-card-head">
                  <div>
                    <strong>{eventItem.label}</strong>
                    <span>{eventItem.description}</span>
                  </div>
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
                  <strong>Quem recebe</strong>
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
            );
          })}
        </div>
      </section>

      <section className="board-card glpi-panel">
        <div className="glpi-toolbar">
          <div>
            <h2>Entrega de e-mail</h2>
            <span>Selecione o metodo principal. O padrao agora e SMTP, sem depender de API.</span>
          </div>
        </div>
        <div className="glpi-form-grid">
          <label className="field-block">
            <span>Tipo de envio</span>
            <select
              disabled={!canManage}
              onChange={(event) => {
                const deliveryMode = event.target.value === "service" ? "service" : "smtp";
                setSmtpDraft((current) => ({ ...current, deliveryMode }));
                setServiceDraft((current) => ({ ...current, deliveryMode }));
              }}
              value={smtpDraft.deliveryMode || "smtp"}
            >
              <option value="smtp">SMTP padrao (sem API)</option>
              <option value="service">Servico com API</option>
            </select>
          </label>
        </div>

        <div className="settings-divider" />

        <div className="glpi-toolbar">
          <div>
            <h2>Servico de envio</h2>
            <span>Opcional. Use Resend ou SendGrid se quiser um fallback por provedor externo.</span>
          </div>
        </div>
        <form className="glpi-ticket-form" onSubmit={handleSaveService}>
          <div className="glpi-form-grid">
            <label className="field-block">
              <span>Provedor</span>
              <select
                disabled={!canManage}
                onChange={(event) => setServiceDraft((current) => ({ ...current, provider: event.target.value }))}
                value={serviceDraft.provider || "resend"}
              >
                <option value="resend">Resend</option>
                <option value="sendgrid">SendGrid</option>
              </select>
            </label>
            <label className="field-block">
              <span>API key {serviceDraft.hasApiKey ? "(mantida se vazio)" : ""}</span>
              <input
                disabled={!canManage}
                onChange={(event) => setServiceDraft((current) => ({ ...current, apiKey: event.target.value }))}
                type="password"
                value={serviceDraft.apiKey || ""}
              />
            </label>
            <label className="field-block">
              <span>E-mail remetente</span>
              <input
                disabled={!canManage}
                onChange={(event) => setServiceDraft((current) => ({ ...current, fromEmail: event.target.value }))}
                type="email"
                value={serviceDraft.fromEmail || ""}
              />
            </label>
            <label className="field-block">
              <span>Nome do remetente</span>
              <input
                disabled={!canManage}
                onChange={(event) => setServiceDraft((current) => ({ ...current, fromName: event.target.value }))}
                value={serviceDraft.fromName || ""}
              />
            </label>
          </div>
          {canManage ? (
            <div className="ticket-create-actions compact-actions">
              <button className="primary-button interactive-button" type="submit">
                Salvar servico
              </button>
            </div>
          ) : null}
        </form>

        <div className="settings-divider" />

        <div className="glpi-toolbar">
          <div>
            <h2>SMTP padrao</h2>
            <span>Metodo principal de envio. Funciona com contas SMTP comuns, sem API key.</span>
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

        <div className="settings-divider" />

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

      <section className="board-card glpi-panel">
        <div className="glpi-toolbar">
          <div>
            <h2>Logs de envio</h2>
            <span>Falhas nao bloqueiam o sistema; ficam registradas aqui para auditoria.</span>
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
              <span>Os disparos e testes aparecerão aqui.</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export default NotificationsPage;
