import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { useAppData } from "../data/AppDataContext";

const defaultCreateForm = {
  title: "",
  type: "Incidente",
  location: "",
  urgency: "Media",
  impact: "Media",
  openedAt: new Date().toISOString(),
  dueDate: "",
  watchers: [],
  description: "",
  attachments: [],
};

const detailFields = [
  { key: "type", label: "Tipo", kind: "select" },
  { key: "status", label: "Status", kind: "select" },
  { key: "queue", label: "Fila", kind: "select" },
  { key: "requester", label: "Solicitante", kind: "input" },
  { key: "source", label: "Origem", kind: "select" },
  { key: "category", label: "Categoria", kind: "input" },
  { key: "location", label: "Localizacao", kind: "input" },
  { key: "urgency", label: "Urgencia", kind: "select" },
  { key: "impact", label: "Impacto", kind: "select" },
  { key: "dueDate", label: "Data limite", kind: "date" },
  { key: "openedAt", label: "Abertura", kind: "datetime" },
  { key: "watchers", label: "Observadores", kind: "input" },
  { key: "assignee", label: "Tecnico responsavel", kind: "assignee" },
];

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve({
        id: `att-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        size: file.size,
        type: file.type || "application/octet-stream",
        url: reader.result,
      });
    reader.onerror = () => reject(new Error(`Falha ao anexar ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function formatBytes(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function toIsoOrEmpty(value) {
  return value ? new Date(value).toISOString() : "";
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function getPriorityBadgeClass(priority) {
  const normalized = normalizeText(priority);
  if (normalized === "critica") return "badge-critica";
  if (normalized === "alta") return "badge-alta";
  if (normalized === "baixa") return "badge-baixa";
  return "badge-neutral";
}

function getFreshCreateForm() {
  return {
    ...defaultCreateForm,
    openedAt: new Date().toISOString(),
    watchers: [],
    attachments: [],
  };
}

function TicketsPage() {
  const {
    addTicketAttachments,
    createTicket,
    deleteTicket,
    pushToast,
    removeTicketAttachment,
    tickets,
    toLocalDatetimeInput,
    updateTicket,
    users,
  } = useAppData();
  const { user } = useAuth();
  const [filter, setFilter] = useState("Todos");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState(getFreshCreateForm);
  const [watcherQuery, setWatcherQuery] = useState("");
  const [detailTicketId, setDetailTicketId] = useState(null);
  const [detailForm, setDetailForm] = useState(null);
  const createInputRef = useRef(null);
  const detailInputRef = useRef(null);
  const watcherBoxRef = useRef(null);

  const tiUsers = useMemo(
    () => users.filter((candidate) => normalizeText(candidate.department) === "ti"),
    [users],
  );

  const filteredTickets = useMemo(() => {
    if (filter === "Todos") return tickets;
    if (filter === "Proximos do SLA") {
      return tickets.filter((ticket) => ticket.sla.toLowerCase().includes("min"));
    }

    const normalizedFilter = normalizeText(filter);
    return tickets.filter(
      (ticket) =>
        normalizeText(ticket.type) === normalizedFilter || normalizeText(ticket.status) === normalizedFilter,
    );
  }, [filter, tickets]);

  const detailTicket = tickets.find((ticket) => ticket.id === detailTicketId) ?? null;

  const watcherSuggestions = useMemo(() => {
    const query = normalizeText(watcherQuery);
    if (!query) return [];

    return users
      .filter((candidate) => candidate.id !== user?.id)
      .filter((candidate) => !createForm.watchers.some((watcher) => watcher.id === candidate.id))
      .filter((candidate) =>
        [candidate.name, candidate.email, candidate.team, candidate.department].some((value) =>
          normalizeText(value).includes(query),
        ),
      )
      .slice(0, 6);
  }, [createForm.watchers, user?.id, users, watcherQuery]);

  useEffect(() => {
    if (!detailTicket) {
      setDetailForm(null);
      return;
    }

    setDetailForm({
      title: detailTicket.title,
      description: detailTicket.description,
      resolutionNotes: detailTicket.resolutionNotes || "",
      type: detailTicket.type,
      status: detailTicket.status,
      queue: detailTicket.queue,
      requester: detailTicket.requester,
      assignee: detailTicket.assignee,
      source: detailTicket.source,
      category: detailTicket.category,
      location: detailTicket.location || "",
      urgency: detailTicket.urgency || "Media",
      impact: detailTicket.impact || "Media",
      openedAt: toLocalDatetimeInput(detailTicket.openedAt),
      dueDate: detailTicket.dueDate ? detailTicket.dueDate.slice(0, 10) : "",
      watchers: detailTicket.watchers || "",
    });
  }, [detailTicket, toLocalDatetimeInput]);

  useEffect(() => {
    if (!showCreateForm) return undefined;

    const handlePointerDown = (event) => {
      if (watcherBoxRef.current && !watcherBoxRef.current.contains(event.target)) {
        setWatcherQuery("");
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setShowCreateForm(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showCreateForm]);

  useEffect(() => {
    if (!detailTicketId) return undefined;

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setDetailTicketId(null);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [detailTicketId]);

  const updateCreateField = (field) => (event) =>
    setCreateForm((current) => ({ ...current, [field]: event.target.value }));

  const updateDetailField = (field) => (event) =>
    setDetailForm((current) => ({ ...current, [field]: event.target.value }));

  const handleCreateAttachments = async (event) => {
    const nextFiles = Array.from(event.target.files || []);
    if (!nextFiles.length) return;

    const attachments = await Promise.all(nextFiles.map(readFileAsDataUrl));
    setCreateForm((current) => ({
      ...current,
      attachments: [...current.attachments, ...attachments],
    }));
    event.target.value = "";
  };

  const handleOpenCreateModal = () => {
    setCreateForm(getFreshCreateForm());
    setWatcherQuery("");
    setShowCreateForm(true);
  };

  const handleCloseCreateModal = () => {
    setShowCreateForm(false);
    setWatcherQuery("");
    setCreateForm(getFreshCreateForm());
  };

  const handleAddWatcher = (candidate) => {
    setCreateForm((current) => ({
      ...current,
      watchers: [...current.watchers, candidate],
    }));
    setWatcherQuery("");
  };

  const handleRemoveWatcher = (watcherId) => {
    setCreateForm((current) => ({
      ...current,
      watchers: current.watchers.filter((watcher) => watcher.id !== watcherId),
    }));
  };

  const handleCreateSubmit = (event) => {
    event.preventDefault();
    if (!createForm.title || !user?.name || !createForm.description) return;

    createTicket({
      ...createForm,
      requester: user.name,
      queue: "Service Desk",
      category: "Geral",
      source: "Portal",
      watchers: createForm.watchers.map((watcher) => watcher.name).join(", "),
      assignee: "Triagem TI",
      openedAt: toIsoOrEmpty(createForm.openedAt) || new Date().toISOString(),
      dueDate: createForm.dueDate || "",
    });

    pushToast("Chamado aberto", createForm.title);
    handleCloseCreateModal();
  };

  const handleSaveTicket = (event) => {
    event.preventDefault();
    if (!detailTicket || !detailForm?.title || !detailForm?.requester) return;

    updateTicket(detailTicket.id, {
      ...detailForm,
      openedAt: toIsoOrEmpty(detailForm.openedAt),
      dueDate: detailForm.dueDate || "",
    });
    pushToast("Chamado atualizado", detailForm.title);
  };

  const handleDeleteTicket = () => {
    if (!detailTicket) return;
    deleteTicket(detailTicket.id);
    setDetailTicketId(null);
    pushToast("Chamado removido", detailTicket.title);
  };

  const handleDetailAttachments = async (event) => {
    const nextFiles = Array.from(event.target.files || []);
    if (!nextFiles.length || !detailTicket) return;

    const attachments = await Promise.all(nextFiles.map(readFileAsDataUrl));
    addTicketAttachments(detailTicket.id, attachments);
    pushToast("Anexos adicionados", `${attachments.length} arquivo(s) vinculados`);
    event.target.value = "";
  };

  return (
    <div className="ticket-page">
      <section className="module-hero board-card">
        <div>
          <span className="eyebrow">Chamados</span>
          <h2>Operacao de incidentes, requisicoes e problemas com abertura rapida e tratativa completa.</h2>
        </div>
        <div className="insight-strip">
          <div className="insight-chip">
            <strong>{tickets.length}</strong>
            <span>tickets registrados</span>
          </div>
          <div className="insight-chip">
            <strong>{tiUsers.length}</strong>
            <span>tecnicos de TI</span>
          </div>
          <div className="insight-chip">
            <strong>{filteredTickets.length}</strong>
            <span>itens no filtro atual</span>
          </div>
        </div>
      </section>

      <section className="ticket-list-panel board-card glpi-panel">
        <div className="glpi-toolbar">
          <div>
            <h2>Fila de chamados</h2>
            <span>Duplo clique para abrir o registro completo.</span>
          </div>
          <button className="primary-button interactive-button" onClick={handleOpenCreateModal} type="button">
            + Criar chamado
          </button>
        </div>

        <div className="toolbar glpi-filter-bar">
          {["Todos", "Incidente", "Requisicao", "Aguardando aprovacao", "Proximos do SLA"].map((item) => (
            <button
              key={item}
              className={`filter-pill interactive-button${filter === item ? " is-active" : ""}`}
              onClick={() => setFilter(item)}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>

        <div className="ticket-rows ticket-rows-wide">
          {filteredTickets.map((ticket) => (
            <button
              className="ticket-row-card interactive-button"
              key={ticket.id}
              onDoubleClick={() => setDetailTicketId(ticket.id)}
              type="button"
            >
              <div className="ticket-row-main">
                <div className="ticket-row-title">
                  <strong>{ticket.id}</strong>
                  <h3>{ticket.title}</h3>
                </div>
                <div className="ticket-row-badges">
                  <span className={`badge ${getPriorityBadgeClass(ticket.priority)}`}>{ticket.priority}</span>
                  <span className="badge badge-neutral">{ticket.status}</span>
                </div>
              </div>
              <div className="ticket-row-meta">
                <span>{ticket.requester}</span>
                <span>{ticket.queue}</span>
                <span>{ticket.assignee}</span>
                <span>{ticket.openedAtLabel}</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      {showCreateForm ? (
        <div className="ticket-modal-backdrop" onClick={handleCloseCreateModal} role="presentation">
          <div
            className="ticket-modal board-card"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <form className="ticket-create-form glpi-ticket-form" onSubmit={handleCreateSubmit}>
              <div className="ticket-modal-header">
                <div className="form-section-header">
                  <strong>Abertura de chamado</strong>
                  <span>Registro de incidente, requisicao ou problema.</span>
                </div>
                <button className="ghost-button interactive-button" onClick={handleCloseCreateModal} type="button">
                  Fechar
                </button>
              </div>

              <div className="glpi-form-grid">
                <label className="field-block field-span-2">
                  <span>Titulo</span>
                  <input onChange={updateCreateField("title")} value={createForm.title} />
                </label>
                <label className="field-block">
                  <span>Tipo</span>
                  <select onChange={updateCreateField("type")} value={createForm.type}>
                    <option>Incidente</option>
                    <option>Requisicao</option>
                    <option>Problema</option>
                  </select>
                </label>
                <div className="field-block">
                  <span>Solicitante</span>
                  <div className="requester-stamp">
                    <strong>{user?.name || "Usuario nao identificado"}</strong>
                    <small>{user ? `${user.email} | ${user.role}` : "Faca login para registrar o solicitante."}</small>
                  </div>
                </div>
                <label className="field-block">
                  <span>Localizacao</span>
                  <input onChange={updateCreateField("location")} value={createForm.location} />
                </label>
                <label className="field-block">
                  <span>Urgencia</span>
                  <select onChange={updateCreateField("urgency")} value={createForm.urgency}>
                    <option>Baixa</option>
                    <option>Media</option>
                    <option>Alta</option>
                    <option>Critica</option>
                  </select>
                </label>
                <label className="field-block">
                  <span>Impacto</span>
                  <select onChange={updateCreateField("impact")} value={createForm.impact}>
                    <option>Baixa</option>
                    <option>Media</option>
                    <option>Alta</option>
                    <option>Critica</option>
                  </select>
                </label>
                <label className="field-block">
                  <span>Data e hora da abertura</span>
                  <input
                    onChange={updateCreateField("openedAt")}
                    type="datetime-local"
                    value={toLocalDatetimeInput(createForm.openedAt)}
                  />
                </label>
                <label className="field-block">
                  <span>Data limite</span>
                  <input onChange={updateCreateField("dueDate")} type="date" value={createForm.dueDate} />
                </label>
                <div className="field-block field-span-2" ref={watcherBoxRef}>
                  <span>Observadores</span>
                  <div className="watcher-picker">
                    <div className="watcher-chip-list">
                      {createForm.watchers.map((watcher) => (
                        <span className="watcher-chip" key={watcher.id}>
                          {watcher.name}
                          <button onClick={() => handleRemoveWatcher(watcher.id)} type="button">
                            x
                          </button>
                        </span>
                      ))}
                    </div>
                    <input
                      onChange={(event) => setWatcherQuery(event.target.value)}
                      placeholder="Comece a digitar nome, email ou equipe"
                      value={watcherQuery}
                    />
                    {watcherSuggestions.length ? (
                      <div className="watcher-suggestions">
                        {watcherSuggestions.map((candidate) => (
                          <button
                            className="watcher-suggestion interactive-button"
                            key={candidate.id}
                            onClick={() => handleAddWatcher(candidate)}
                            type="button"
                          >
                            <strong>{candidate.name}</strong>
                            <small>{candidate.email} | {candidate.team}</small>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
                <label className="field-block field-full">
                  <span>Descricao</span>
                  <textarea onChange={updateCreateField("description")} value={createForm.description} />
                </label>
              </div>

              <div className="attachment-toolbar glpi-subbar">
                <button
                  className="ghost-button interactive-button"
                  onClick={() => createInputRef.current?.click()}
                  type="button"
                >
                  Anexar arquivos
                </button>
                <input hidden multiple onChange={handleCreateAttachments} ref={createInputRef} type="file" />
                <span>{createForm.attachments.length} arquivo(s) selecionado(s)</span>
              </div>

              {createForm.attachments.length ? (
                <div className="attachment-list">
                  {createForm.attachments.map((attachment) => (
                    <div className="attachment-item" key={attachment.id}>
                      <strong>{attachment.name}</strong>
                      <span>{formatBytes(attachment.size)}</span>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="ticket-create-actions">
                <button className="primary-button interactive-button" type="submit">
                  Registrar chamado
                </button>
                <button className="ghost-button interactive-button" onClick={handleCloseCreateModal} type="button">
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {detailTicket && detailForm ? (
        <div className="ticket-modal-backdrop" onClick={() => setDetailTicketId(null)} role="presentation">
          <div
            className="ticket-modal ticket-modal-large board-card"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <form className="ticket-detail-form" onSubmit={handleSaveTicket}>
              <div className="ticket-modal-header">
                <div>
                  <h2>{detailTicket.id}</h2>
                  <span className="modal-subtitle">
                    Aberto em {detailTicket.openedAtLabel}
                    {detailTicket.dueDateLabel ? ` | limite ${detailTicket.dueDateLabel}` : ""}
                  </span>
                </div>
                <div className="ticket-detail-actions">
                  <button
                    className="ghost-button interactive-button"
                    onClick={() => setDetailTicketId(null)}
                    type="button"
                  >
                    Fechar
                  </button>
                  <button className="danger-button interactive-button" onClick={handleDeleteTicket} type="button">
                    Excluir
                  </button>
                </div>
              </div>

              <label className="field-block field-full">
                <span>Titulo</span>
                <input onChange={updateDetailField("title")} value={detailForm.title} />
              </label>

              <div className="detail-grid">
                {detailFields.map((field) => (
                  <label className="field-block" key={field.key}>
                    <span>{field.label}</span>
                    {field.kind === "select" && field.key === "type" ? (
                      <select onChange={updateDetailField(field.key)} value={detailForm[field.key]}>
                        <option>Incidente</option>
                        <option>Requisicao</option>
                        <option>Problema</option>
                      </select>
                    ) : null}
                    {field.kind === "select" && field.key === "status" ? (
                      <select onChange={updateDetailField(field.key)} value={detailForm[field.key]}>
                        <option>Aberto</option>
                        <option>Em atendimento</option>
                        <option>Aguardando aprovacao</option>
                        <option>Analise</option>
                        <option>Resolvido</option>
                      </select>
                    ) : null}
                    {field.kind === "select" && field.key === "queue" ? (
                      <select onChange={updateDetailField(field.key)} value={detailForm[field.key]}>
                        <option>Service Desk</option>
                        <option>Infraestrutura</option>
                        <option>Aplicacoes</option>
                        <option>Seguranca</option>
                      </select>
                    ) : null}
                    {field.kind === "select" && field.key === "source" ? (
                      <select onChange={updateDetailField(field.key)} value={detailForm[field.key]}>
                        <option>Portal</option>
                        <option>E-mail</option>
                        <option>Telefone</option>
                        <option>Monitoramento</option>
                      </select>
                    ) : null}
                    {field.kind === "select" && (field.key === "urgency" || field.key === "impact") ? (
                      <select onChange={updateDetailField(field.key)} value={detailForm[field.key]}>
                        <option>Baixa</option>
                        <option>Media</option>
                        <option>Alta</option>
                        <option>Critica</option>
                      </select>
                    ) : null}
                    {field.kind === "assignee" ? (
                      <select onChange={updateDetailField(field.key)} value={detailForm[field.key] || ""}>
                        <option value="">Selecione um tecnico de TI</option>
                        {tiUsers.map((candidate) => (
                          <option key={candidate.id} value={candidate.name}>
                            {candidate.name} | {candidate.team}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    {field.kind === "input" ? (
                      <input onChange={updateDetailField(field.key)} value={detailForm[field.key] || ""} />
                    ) : null}
                    {field.kind === "date" ? (
                      <input onChange={updateDetailField(field.key)} type="date" value={detailForm[field.key] || ""} />
                    ) : null}
                    {field.kind === "datetime" ? (
                      <input
                        onChange={updateDetailField(field.key)}
                        type="datetime-local"
                        value={detailForm[field.key] || ""}
                      />
                    ) : null}
                  </label>
                ))}
              </div>

              <div className="glpi-info-strip">
                <div>
                  <span>Prioridade calculada</span>
                  <strong>{detailTicket.priority}</strong>
                </div>
                <div>
                  <span>SLA</span>
                  <strong>{detailTicket.sla}</strong>
                </div>
                <div>
                  <span>Ultima atualizacao</span>
                  <strong>{detailTicket.updatedAt}</strong>
                </div>
              </div>

              <label className="field-block field-full">
                <span>Descricao</span>
                <textarea onChange={updateDetailField("description")} value={detailForm.description} />
              </label>

              <label className="field-block field-full">
                <span>Solucao / acompanhamento tecnico</span>
                <textarea onChange={updateDetailField("resolutionNotes")} value={detailForm.resolutionNotes} />
              </label>

              <div className="ticket-attachment-panel">
                <div className="attachment-toolbar glpi-subbar">
                  <div>
                    <strong>Anexos</strong>
                    <span>Prints, documentos e evidencias vinculadas ao chamado.</span>
                  </div>
                  <button
                    className="ghost-button interactive-button"
                    onClick={() => detailInputRef.current?.click()}
                    type="button"
                  >
                    Adicionar anexos
                  </button>
                  <input hidden multiple onChange={handleDetailAttachments} ref={detailInputRef} type="file" />
                </div>

                {detailTicket.attachments?.length ? (
                  <div className="attachment-list">
                    {detailTicket.attachments.map((attachment) => (
                      <div className="attachment-item attachment-item-actions" key={attachment.id}>
                        <div>
                          <strong>{attachment.name}</strong>
                          <span>{formatBytes(attachment.size)}</span>
                        </div>
                        <div className="attachment-actions">
                          <a className="ghost-link" download={attachment.name} href={attachment.url}>
                            Baixar
                          </a>
                          <button
                            className="ghost-link danger-link interactive-button"
                            onClick={() => {
                              removeTicketAttachment(detailTicket.id, attachment.id);
                              pushToast("Anexo removido", attachment.name);
                            }}
                            type="button"
                          >
                            Remover
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <strong>Nenhum anexo vinculado.</strong>
                    <span>Use o botao acima para anexar prints, PDFs, planilhas ou outros arquivos.</span>
                  </div>
                )}
              </div>

              <div className="ticket-create-actions">
                <button className="primary-button interactive-button" type="submit">
                  Salvar alteracoes
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default TicketsPage;
