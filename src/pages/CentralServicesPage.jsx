import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import UserAutocomplete from "../components/UserAutocomplete";
import { getDepartmentColorStyle, normalizeDepartmentColor } from "../data/departments";
import { hasAnyPermission } from "../data/permissions";
import { useAppData } from "../data/AppDataContext";
import { exportRowsWithFormat, getExportFormatLabel } from "../lib/export";
import { toQrCodeDataUrl } from "../lib/qrcode";

const defaultForm = {
  code: "",
  name: "",
  color: "",
  status: "Ativo",
  active: true,
  acceptsTickets: true,
  showInRequestPortal: false,
  responsibleUserIds: [],
};

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function formatDateTime(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

function generateAccessToken() {
  const bytes = new Uint8Array(24);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function CentralServicesPage() {
  const { user } = useAuth();
  const {
    departments,
    pushToast,
    savePublicIntakeSettings,
    saveServiceCenterAutomation,
    saveServiceCenterDepartment,
    serviceCenter,
    updateServiceCenterSettings,
    users,
  } = useAppData();
  const [search, setSearch] = useState("");
  const [editingDepartmentId, setEditingDepartmentId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [responsibleQuery, setResponsibleQuery] = useState("");
  const [form, setForm] = useState(defaultForm);
  const [automationDraft, setAutomationDraft] = useState({
    triagePanelVisible: true,
    routingRules: "[]",
    slaPolicies: "[]",
    approvalRules: "[]",
    approverDelegations: "[]",
    escalationRules: "{}",
    ticketStatusProfiles: "{}",
    statusReasonRules: "{}",
    emailIntake: "{}",
  });
  const [publicIntakeDraft, setPublicIntakeDraft] = useState({
    enabled: false,
    accessToken: "",
    portalTitle: "Abrir chamado externo",
    portalDescription: "Canal controlado para abertura de chamados sem login no TicketMind.",
  });
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState("");

  const canView = hasAnyPermission(user, ["service_center_manage", "service_center_departments_manage", "users_manage_permissions", "users_admin"]);
  const canManage = hasAnyPermission(user, ["service_center_departments_manage", "service_center_departments_toggle", "service_center_manage", "users_manage_permissions", "users_admin"]);
  const canToggleCentral = hasAnyPermission(user, ["service_center_manage", "users_manage_permissions", "users_admin"]);

  const activeUsers = useMemo(
    () =>
      users
        .filter((candidate) => normalizeText(candidate.status) === "ativo")
        .slice()
        .sort((left, right) => left.name.localeCompare(right.name)),
    [users],
  );

  const departmentRows = useMemo(() => {
    const normalizedSearch = normalizeText(search);
    return departments
      .map((department) => {
        const serviceConfig = serviceCenter?.departments?.[department.id] || {};
        const responsibleUsers = activeUsers.filter((candidate) => (serviceConfig.responsibleUserIds || []).includes(candidate.id));
        return {
          ...department,
          active: Boolean(serviceConfig.active),
          acceptsTickets: serviceConfig.acceptsTickets !== undefined ? Boolean(serviceConfig.acceptsTickets) : true,
          showInRequestPortal: Boolean(serviceConfig.showInRequestPortal),
          responsibleUserIds: serviceConfig.responsibleUserIds || [],
          responsibleUsers,
          serviceUpdatedAt: serviceConfig.updatedAt || "",
        };
      })
      .filter((department) =>
        !normalizedSearch
          ? true
          : [
              department.code,
              department.name,
              department.status,
              department.active ? "ativo" : "inativo",
              department.acceptsTickets ? "abertura" : "sem abertura",
            ].some((field) => normalizeText(field).includes(normalizedSearch)),
      )
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [activeUsers, departments, search, serviceCenter]);

  const selectedResponsibleUsers = useMemo(
    () => activeUsers.filter((candidate) => form.responsibleUserIds.includes(candidate.id)),
    [activeUsers, form.responsibleUserIds],
  );

  useEffect(() => {
    setAutomationDraft({
      triagePanelVisible: serviceCenter?.triagePanelVisible !== false,
      routingRules: JSON.stringify(serviceCenter?.routingRules || [], null, 2),
      slaPolicies: JSON.stringify(serviceCenter?.slaPolicies || [], null, 2),
      approvalRules: JSON.stringify(serviceCenter?.approvalRules || [], null, 2),
      approverDelegations: JSON.stringify(serviceCenter?.approverDelegations || [], null, 2),
      escalationRules: JSON.stringify(serviceCenter?.escalationRules || {}, null, 2),
      ticketStatusProfiles: JSON.stringify(serviceCenter?.ticketStatusProfiles || {}, null, 2),
      statusReasonRules: JSON.stringify(serviceCenter?.statusReasonRules || {}, null, 2),
      emailIntake: JSON.stringify(serviceCenter?.emailIntake || {}, null, 2),
    });
  }, [serviceCenter]);

  useEffect(() => {
    setPublicIntakeDraft({
      enabled: Boolean(serviceCenter?.publicIntake?.enabled),
      accessToken: String(serviceCenter?.publicIntake?.accessToken || "").trim(),
      portalTitle: String(serviceCenter?.publicIntake?.portalTitle || "Abrir chamado externo").trim() || "Abrir chamado externo",
      portalDescription:
        String(
          serviceCenter?.publicIntake?.portalDescription ||
            "Canal controlado para abertura de chamados sem login no TicketMind.",
        ).trim() || "Canal controlado para abertura de chamados sem login no TicketMind.",
    });
  }, [serviceCenter?.publicIntake]);

  const publicRequestLink = useMemo(() => {
    if (!publicIntakeDraft.accessToken) return "";
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/#/public/request/${publicIntakeDraft.accessToken}`;
  }, [publicIntakeDraft.accessToken]);

  useEffect(() => {
    let cancelled = false;
    async function renderQrCode() {
      if (!publicRequestLink) {
        setQrCodeDataUrl("");
        return;
      }
      try {
        const dataUrl = await toQrCodeDataUrl(publicRequestLink);
        if (!cancelled) setQrCodeDataUrl(dataUrl);
      } catch {
        if (!cancelled) setQrCodeDataUrl("");
      }
    }
    renderQrCode();
    return () => {
      cancelled = true;
    };
  }, [publicRequestLink]);

  if (!canView) {
    return <Navigate replace to="/app/dashboard" />;
  }

  const resetForm = () => {
    setForm(defaultForm);
    setEditingDepartmentId(null);
    setResponsibleQuery("");
  };

  const openCreateModal = () => {
    if (!canManage) return;
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (department) => {
    if (!canManage) return;
    setEditingDepartmentId(department.id);
    setForm({
      code: department.code || "",
      name: department.name || "",
      color: department.color || "",
      status: department.status || "Ativo",
      active: department.active !== false,
      acceptsTickets: department.acceptsTickets !== false,
      showInRequestPortal: Boolean(department.showInRequestPortal),
      responsibleUserIds: department.responsibleUserIds || [],
    });
    setResponsibleQuery("");
    setShowModal(true);
  };

  const toggleResponsibleUser = (userId) => {
    setForm((current) => ({
      ...current,
      responsibleUserIds: current.responsibleUserIds.includes(userId)
        ? current.responsibleUserIds.filter((currentUserId) => currentUserId !== userId)
        : [...current.responsibleUserIds, userId],
    }));
  };

  const addResponsibleUser = (candidate) => {
    if (!candidate?.id) return;
    setForm((current) =>
      current.responsibleUserIds.includes(candidate.id)
        ? current
        : { ...current, responsibleUserIds: [...current.responsibleUserIds, candidate.id] },
    );
    setResponsibleQuery("");
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!form.name.trim()) {
      pushToast("Campos obrigatorios", "Informe o nome do departamento.", "warning");
      return;
    }

    const duplicated = departments.find(
      (department) =>
        normalizeText(department.name) === normalizeText(form.name) && department.id !== editingDepartmentId,
    );
    if (duplicated) {
      pushToast("Departamento duplicado", duplicated.name, "warning");
      return;
    }

    const servicePayload = {
      active: form.active,
      acceptsTickets: form.acceptsTickets,
      showInRequestPortal: form.showInRequestPortal,
      responsibleUserIds: form.responsibleUserIds,
    };

    if (editingDepartmentId) {
      const updatedDepartment = saveServiceCenterDepartment(
        {
          code: form.code,
          name: form.name,
          color: form.color,
          status: form.status,
        },
        servicePayload,
        editingDepartmentId,
      );
      if (!updatedDepartment) {
        pushToast("Falha ao atualizar", "Revise as permissoes e tente novamente.", "warning");
        return;
      }
      pushToast("Central atualizada", form.name);
    } else {
      const createdDepartment = saveServiceCenterDepartment(
        {
          code: form.code,
          name: form.name,
          color: form.color,
          status: form.status,
        },
        servicePayload,
      );
      if (!createdDepartment?.id) {
        pushToast("Falha ao criar", "Revise as permissoes e tente novamente.", "warning");
        return;
      }
      pushToast("Departamento criado", form.name);
    }

    setShowModal(false);
    resetForm();
  };

  const handleSaveAutomation = () => {
    try {
      saveServiceCenterAutomation({
        triagePanelVisible: automationDraft.triagePanelVisible,
        routingRules: JSON.parse(automationDraft.routingRules || "[]"),
        slaPolicies: JSON.parse(automationDraft.slaPolicies || "[]"),
        approvalRules: JSON.parse(automationDraft.approvalRules || "[]"),
        approverDelegations: JSON.parse(automationDraft.approverDelegations || "[]"),
        escalationRules: JSON.parse(automationDraft.escalationRules || "{}"),
        ticketStatusProfiles: JSON.parse(automationDraft.ticketStatusProfiles || "{}"),
        statusReasonRules: JSON.parse(automationDraft.statusReasonRules || "{}"),
        emailIntake: JSON.parse(automationDraft.emailIntake || "{}"),
      });
      pushToast("Automacao salva", "Regras de triagem, SLA, aprovacao e intake atualizadas.");
    } catch (error) {
      pushToast("JSON invalido", error instanceof Error ? error.message : "Revise a configuracao.", "warning");
    }
  };

  const handleGenerateAccessToken = () => {
    setPublicIntakeDraft((current) => ({
      ...current,
      enabled: true,
      accessToken: generateAccessToken(),
    }));
  };

  const handleCopyPublicLink = async () => {
    if (!publicRequestLink) {
      pushToast("Link indisponivel", "Gere ou informe um token para o canal externo.", "warning");
      return;
    }
    try {
      await navigator.clipboard.writeText(publicRequestLink);
      pushToast("Link copiado", "O link externo foi copiado para a area de transferencia.");
    } catch {
      pushToast("Falha ao copiar", "Copie o link manualmente pelo campo abaixo.", "warning");
    }
  };

  const handleSavePublicIntake = () => {
    const accessToken = String(publicIntakeDraft.accessToken || "").trim();
    if (publicIntakeDraft.enabled && !accessToken) {
      pushToast("Token obrigatorio", "Gere um token antes de habilitar o canal externo.", "warning");
      return;
    }
    savePublicIntakeSettings({
      enabled: publicIntakeDraft.enabled,
      accessToken,
      portalTitle: publicIntakeDraft.portalTitle,
      portalDescription: publicIntakeDraft.portalDescription,
    });
    pushToast("Canal externo salvo", "Link privado e QR Code atualizados.");
  };

  const handleExportCentral = (format = "csv") => {
    exportRowsWithFormat({
      format,
      fileName: `ticketmind-central-servicos-${new Date().toISOString().slice(0, 10)}.csv`,
      title: "Relatorio da central de servicos",
      columns: [
        { key: "name", label: "Departamento" },
        { key: "code", label: "Codigo" },
        { key: "status", label: "Cadastro" },
        { key: "active", label: "Na Central", render: (item) => (item.active ? "Sim" : "Nao") },
        { key: "acceptsTickets", label: "Aceita chamados", render: (item) => (item.acceptsTickets ? "Sim" : "Nao") },
        { key: "showInRequestPortal", label: "Portal", render: (item) => (item.showInRequestPortal ? "Sim" : "Nao") },
        { key: "responsibleUsers", label: "Responsaveis", render: (item) => item.responsibleUsers.map((candidate) => candidate.name).join(", ") },
      ],
      items: departmentRows,
    });
    pushToast("Exportacao concluida", `${departmentRows.length} departamento(s) preparados em ${getExportFormatLabel(format)}.`);
  };

  return (
    <div className="users-page">
      <section className="module-hero board-card">
        <div>
          <span className="eyebrow">Configuracoes</span>
          <h2>Central de Servicos</h2>
        </div>
        <div className="insight-strip">
          <div className="insight-chip">
            <strong>{serviceCenter?.enabled ? "Ativa" : "Desativada"}</strong>
            <span>status da central</span>
          </div>
          <div className="insight-chip">
            <strong>{departmentRows.filter((department) => department.active).length}</strong>
            <span>departamentos habilitados</span>
          </div>
          <div className="insight-chip">
            <strong>{departmentRows.filter((department) => department.showInRequestPortal && department.acceptsTickets && department.active).length}</strong>
            <span>canais de abertura</span>
          </div>
        </div>
      </section>

      <section className="board-card glpi-panel settings-stack">
        <div className="settings-card-head">
          <div>
            <h2>Ativacao da Central</h2>
            <span>Quando desativada, o fluxo atual do Helpdesk permanece intacto. Quando ativada, libera abertura e atendimento por departamentos configurados.</span>
          </div>
          {canToggleCentral ? (
            <button
              className={`interactive-button ${serviceCenter?.enabled ? "danger-button" : "primary-button"}`}
              onClick={() => updateServiceCenterSettings({ enabled: !serviceCenter?.enabled })}
              type="button"
            >
              {serviceCenter?.enabled ? "Desativar Central" : "Ativar Central de Servicos"}
            </button>
          ) : null}
        </div>
        <div className="settings-placeholder-panel">
          <strong>Estado atual: {serviceCenter?.enabled ? "Central compartilhada ativa" : "Fluxo padrao de Helpdesk"}</strong>
          <span>Ultima atualizacao: {formatDateTime(serviceCenter?.updatedAt)}</span>
        </div>
      </section>

      <section className="board-card glpi-panel">
        <div className="glpi-toolbar">
          <div>
            <h2>Departamentos participantes</h2>
            <span>Cadastre setores, controle abertura de chamados e vincule tecnicos/responsaveis por departamento.</span>
          </div>
          <div className="toolbar">
            <input
              className="toolbar-search"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome, codigo, status ou abertura"
              value={search}
            />
            <button className="ghost-button interactive-button" onClick={() => handleExportCentral("csv")} type="button">
              CSV
            </button>
            <button className="ghost-button interactive-button" onClick={() => handleExportCentral("excel")} type="button">
              Excel
            </button>
            <button className="ghost-button interactive-button" onClick={() => handleExportCentral("pdf")} type="button">
              PDF
            </button>
            {canManage ? (
              <button className="primary-button interactive-button" onClick={openCreateModal} type="button">
                + Novo departamento
              </button>
            ) : null}
          </div>
        </div>

        <div className="service-center-grid">
          {departmentRows.map((department) => (
            <article className="service-center-card" key={department.id}>
              <div className="service-center-card-head" style={getDepartmentColorStyle(department.color, { alpha: 0.12 })}>
                <div>
                  <strong>{department.name}</strong>
                  <span>{department.code || "SEM-CODIGO"} | cadastro {department.status}</span>
                </div>
                <div className="ticket-row-badges">
                  <span className={`badge ${department.active ? "status-badge-resolvido" : "badge-neutral"}`}>
                    {department.active ? "Na Central" : "Fora da Central"}
                  </span>
                  <span className={`badge ${department.acceptsTickets ? "status-badge-aberto" : "badge-neutral"}`}>
                    {department.acceptsTickets ? "Aceita chamados" : "Sem abertura"}
                  </span>
                </div>
              </div>

              <div className="service-center-card-body">
                <p>{department.showInRequestPortal ? "Disponivel no botao de abertura de chamados." : "Oculto do portal de abertura."}</p>
                <div className="ticket-row-meta">
                  <span>{department.responsibleUsers.length} responsavel(is)</span>
                  <span>Atualizado em {formatDateTime(department.serviceUpdatedAt || department.updatedAt)}</span>
                </div>
                <div className="permissions-inline">
                  {department.responsibleUsers.length ? (
                    department.responsibleUsers.map((candidate) => (
                      <span className="badge badge-neutral" key={candidate.id}>
                        {candidate.name}
                      </span>
                    ))
                  ) : (
                    <span className="badge badge-neutral">Sem responsaveis vinculados</span>
                  )}
                </div>
              </div>

              {canManage ? (
                <div className="ticket-create-actions">
                  <button className="ghost-button compact-button interactive-button" onClick={() => openEditModal(department)} type="button">
                    Configurar
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="board-card glpi-panel settings-stack">
        <div className="settings-card-head">
          <div>
            <h2>Automacao operacional</h2>
            <span>Regras opcionais e retrocompativeis. Nada aqui remove cadastros existentes; apenas adiciona comportamento.</span>
          </div>
        </div>
        <div className="toggle-row">
          <label className="inline-toggle">
            <input
              checked={automationDraft.triagePanelVisible}
              onChange={(event) => setAutomationDraft((current) => ({ ...current, triagePanelVisible: event.target.checked }))}
              type="checkbox"
            />
            <span>Fila de triagem visivel por padrao</span>
          </label>
        </div>
        <div className="glpi-form-grid">
          <label className="field-block field-full">
            <span>Roteamento automatico</span>
            <textarea onChange={(event) => setAutomationDraft((current) => ({ ...current, routingRules: event.target.value }))} rows={10} value={automationDraft.routingRules} />
          </label>
          <label className="field-block field-full">
            <span>Politicas avancadas de SLA</span>
            <textarea onChange={(event) => setAutomationDraft((current) => ({ ...current, slaPolicies: event.target.value }))} rows={10} value={automationDraft.slaPolicies} />
          </label>
          <label className="field-block field-full">
            <span>Regras de aprovacao multi-etapa</span>
            <textarea onChange={(event) => setAutomationDraft((current) => ({ ...current, approvalRules: event.target.value }))} rows={10} value={automationDraft.approvalRules} />
          </label>
          <label className="field-block field-full">
            <span>Delegacoes de aprovador</span>
            <textarea onChange={(event) => setAutomationDraft((current) => ({ ...current, approverDelegations: event.target.value }))} rows={8} value={automationDraft.approverDelegations} />
          </label>
          <label className="field-block field-full">
            <span>Escalonamento automatico</span>
            <textarea onChange={(event) => setAutomationDraft((current) => ({ ...current, escalationRules: event.target.value }))} rows={8} value={automationDraft.escalationRules} />
          </label>
          <label className="field-block field-full">
            <span>Status por tipo de processo</span>
            <textarea onChange={(event) => setAutomationDraft((current) => ({ ...current, ticketStatusProfiles: event.target.value }))} rows={8} value={automationDraft.ticketStatusProfiles} />
          </label>
          <label className="field-block field-full">
            <span>Motivos obrigatorios por status</span>
            <textarea onChange={(event) => setAutomationDraft((current) => ({ ...current, statusReasonRules: event.target.value }))} rows={8} value={automationDraft.statusReasonRules} />
          </label>
          <label className="field-block field-full">
            <span>Intake de e-mail</span>
            <textarea onChange={(event) => setAutomationDraft((current) => ({ ...current, emailIntake: event.target.value }))} rows={8} value={automationDraft.emailIntake} />
          </label>
        </div>
        {canManage ? (
          <div className="ticket-create-actions compact-actions">
            <button className="primary-button interactive-button" onClick={handleSaveAutomation} type="button">
              Salvar automacao
            </button>
          </div>
        ) : null}
      </section>

      <section className="board-card glpi-panel settings-stack">
        <div className="settings-card-head">
          <div>
            <h2>Canal externo de chamados</h2>
            <span>Gera um link privado com token longo e QR Code para abertura sem autenticacao.</span>
          </div>
        </div>
        <div className="glpi-form-grid public-intake-settings-grid">
          <label className="field-block field-full">
            <span>Titulo do portal</span>
            <input
              onChange={(event) => setPublicIntakeDraft((current) => ({ ...current, portalTitle: event.target.value }))}
              value={publicIntakeDraft.portalTitle}
            />
          </label>
          <label className="field-block field-full">
            <span>Descricao do portal</span>
            <textarea
              onChange={(event) => setPublicIntakeDraft((current) => ({ ...current, portalDescription: event.target.value }))}
              rows={4}
              value={publicIntakeDraft.portalDescription}
            />
          </label>
          <label className="field-block field-span-2">
            <span>Token secreto</span>
            <input
              onChange={(event) => setPublicIntakeDraft((current) => ({ ...current, accessToken: event.target.value.trim() }))}
              value={publicIntakeDraft.accessToken}
            />
          </label>
          <div className="field-block">
            <span>Estado</span>
            <label className="inline-toggle settings-inline-box">
              <input
                checked={publicIntakeDraft.enabled}
                onChange={(event) => setPublicIntakeDraft((current) => ({ ...current, enabled: event.target.checked }))}
                type="checkbox"
              />
              <span>{publicIntakeDraft.enabled ? "Canal externo ativo" : "Canal externo pausado"}</span>
            </label>
          </div>
        </div>

        <div className="ticket-create-actions compact-actions">
          <button className="ghost-button interactive-button" onClick={handleGenerateAccessToken} type="button">
            Gerar novo token
          </button>
          <button className="ghost-button interactive-button" onClick={handleCopyPublicLink} type="button">
            Copiar link
          </button>
          <button className="primary-button interactive-button" onClick={handleSavePublicIntake} type="button">
            Salvar canal externo
          </button>
        </div>

        <div className="public-intake-preview">
          <div className="settings-placeholder-panel">
            <strong>Link privado do formulario</strong>
            <input readOnly value={publicRequestLink || "Gere um token para montar o link externo."} />
            <span>Esse link nao aparece na navegacao. Ele so funciona para quem receber a URL com o token correto.</span>
          </div>
          <div className="public-intake-qr-card">
            <strong>QR Code</strong>
            {qrCodeDataUrl ? <img alt="QR Code do canal externo" className="public-intake-qr" src={qrCodeDataUrl} /> : <span>Gere um token para visualizar o QR Code.</span>}
          </div>
        </div>
      </section>

      {showModal ? (
        <div className="ticket-modal-backdrop" onClick={() => setShowModal(false)} role="presentation">
          <div className="ticket-modal board-card compact-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <form className="glpi-ticket-form compact-form" onSubmit={handleSubmit}>
              <div className="ticket-modal-header">
                <div>
                  <h2>{editingDepartmentId ? "Configurar departamento" : "Novo departamento na central"}</h2>
                </div>
                <button className="ghost-button compact-button interactive-button" onClick={() => setShowModal(false)} type="button">
                  Fechar
                </button>
              </div>

              <div className="glpi-form-grid compact-form-grid">
                <label className="field-block">
                  <span>Codigo</span>
                  <input onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} value={form.code} />
                </label>
                <label className="field-block">
                  <span>Status do cadastro</span>
                  <select onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} value={form.status}>
                    <option>Ativo</option>
                    <option>Inativo</option>
                  </select>
                </label>
                <label className="field-block">
                  <span>Cor do departamento</span>
                  <div className="department-color-field">
                    <input
                      aria-label="Selecionar cor do departamento"
                      className="department-color-picker"
                      onChange={(event) => setForm((current) => ({ ...current, color: normalizeDepartmentColor(event.target.value) }))}
                      type="color"
                      value={normalizeDepartmentColor(form.color) || "#94A3B8"}
                    />
                    <span className="department-color-swatch" style={getDepartmentColorStyle(form.color, { alpha: 0.35 })} />
                    <strong className="department-color-value">{normalizeDepartmentColor(form.color) || "Neutra"}</strong>
                  </div>
                </label>
                <label className="field-block field-full">
                  <span>Nome do departamento</span>
                  <input onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} value={form.name} />
                </label>
              </div>

              <div className="settings-placeholder-panel">
                <div className="toggle-row">
                  <label className="inline-toggle">
                    <input checked={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} type="checkbox" />
                    <span>Departamento ativo na Central</span>
                  </label>
                  <label className="inline-toggle">
                    <input checked={form.acceptsTickets} onChange={(event) => setForm((current) => ({ ...current, acceptsTickets: event.target.checked }))} type="checkbox" />
                    <span>Aceita abertura de chamados</span>
                  </label>
                  <label className="inline-toggle">
                    <input checked={form.showInRequestPortal} onChange={(event) => setForm((current) => ({ ...current, showInRequestPortal: event.target.checked }))} type="checkbox" />
                    <span>Exibir no botao de abertura</span>
                  </label>
                </div>
              </div>

              <div className="settings-card">
                <div className="form-section-header">
                  <strong>Responsaveis e tecnicos do departamento</strong>
                  <span>Somente usuarios ativos podem ser vinculados para atendimento do setor.</span>
                </div>
                <div className="recipient-picker">
                  <UserAutocomplete
                    emptyMessage="Nenhum usuario ativo encontrado."
                    filterFn={(candidate) => !form.responsibleUserIds.includes(candidate.id)}
                    onChange={setResponsibleQuery}
                    onSelect={addResponsibleUser}
                    placeholder="Digite nome, email ou equipe para buscar um responsavel"
                    users={activeUsers}
                    value={responsibleQuery}
                  />
                  <div className="recipient-grid">
                    {selectedResponsibleUsers.length ? (
                      selectedResponsibleUsers.map((candidate) => (
                        <div className="recipient-option recipient-option-selected" key={candidate.id}>
                          <span>
                            <strong>{candidate.name}</strong>
                            <small>{candidate.email || "Sem email"} | {candidate.department || "Sem departamento"}</small>
                          </span>
                          <button className="ghost-button compact-button interactive-button" onClick={() => toggleResponsibleUser(candidate.id)} type="button">
                            Remover
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="empty-state">
                        <strong>Nenhum responsavel vinculado.</strong>
                        <span>Pesquise por nome ou email para adicionar tecnicos e responsaveis ao departamento.</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="ticket-create-actions compact-actions">
                <button className="primary-button compact-button interactive-button" type="submit">
                  {editingDepartmentId ? "Salvar configuracao" : "Cadastrar departamento"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default CentralServicesPage;
