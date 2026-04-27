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
  { key: "assignee", label: "Tecnico responsavel", kind: "input" },
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
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

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

  if (normalized === "critica") {
    return "badge-crítica";
  }

  if (normalized === "alta") {
    return "badge-alta";
  }

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
  const [selectedTicketId, setSelectedTicketId] = useState(tickets[0]?.id ?? null);
  const [detailForm, setDetailForm] = useState(null);
  const createInputRef = useRef(null);
  const detailInputRef = useRef(null);
  const watcherBoxRef = useRef(null);

  const filteredTickets = useMemo(() => {
    if (filter === "Todos") {
      return tickets;
    }

    if (filter === "Proximos do SLA") {
      return tickets.filter((ticket) => ticket.sla.toLowerCase().includes("min"));
    }

    const normalizedFilter = normalizeText(filter);
    return tickets.filter(
      (ticket) =>
        normalizeText(ticket.type) === normalizedFilter || normalizeText(ticket.status) === normalizedFilter,
    );
  }, [filter, tickets]);

  const selectedTicket =
    filteredTickets.find((ticket) => ticket.id === selectedTicketId) ??
    tickets.find((ticket) => ticket.id === selectedTicketId) ??
    filteredTickets[0] ??
    null;

  const watcherSuggestions = useMemo(() => {
    const query = normalizeText(watcherQuery);
    if (!query) {
      return [];
    }

    return users
      .filter((candidate) => candidate.id !== user?.id)
      .filter((candidate) => !createForm.watchers.some((watcher) => watcher.id === candidate.id))
      .filter((candidate) =>
        [candidate.name, candidate.email, candidate.team].some((value) =>
          normalizeText(value).includes(query),
        ),
      )
      .slice(0, 6);
  }, [createForm.watchers, user?.id, users, watcherQuery]);

  useEffect(() => {
    if (!selectedTicket && filteredTickets[0]) {
      setSelectedTicketId(filteredTickets[0].id);
      return;
    }

    if (selectedTicket) {
      setDetailForm({
        title: selectedTicket.title,
        description: selectedTicket.description,
        resolutionNotes: selectedTicket.resolutionNotes || "",
        type: selectedTicket.type,
        status: selectedTicket.status,
        queue: selectedTicket.queue,
        requester: selectedTicket.requester,
        assignee: selectedTicket.assignee,
        source: selectedTicket.source,
        category: selectedTicket.category,
        location: selectedTicket.location || "",
        urgency: selectedTicket.urgency || "Media",
        impact: selectedTicket.impact || "Media",
        openedAt: toLocalDatetimeInput(selectedTicket.openedAt),
        dueDate: selectedTicket.dueDate ? selectedTicket.dueDate.slice(0, 10) : "",
        watchers: selectedTicket.watchers || "",
      });
    } else {
      setDetailForm(null);
    }
  }, [selectedTicket, filteredTickets, toLocalDatetimeInput]);

  useEffect(() => {
    if (!showCreateForm) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (watcherBoxRef.current && !watcherBoxRef.current.contains(event.target)) {
        setWatcherQuery("");
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        handleCloseCreateModal();
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showCreateForm]);

  const updateCreateField = (field) => (event) =>
    setCreateForm((current) => ({ ...current, [field]: event.target.value }));

  const updateDetailField = (field) => (event) =>
    setDetailForm((current) => ({ ...current, [field]: event.target.value }));

  const handleCreateAttachments = async (event) => {
    const nextFiles = Array.from(event.target.files || []);
    if (!nextFiles.length) {
      return;
    }

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

    if (!createForm.title || !user?.name || !createForm.description) {
      return;
    }

    const createdTicket = createTicket({
      ...createForm,
      requester: user.name,
      queue: "Service Desk",
      category: "Geral",
      source: "Portal",
      watchers: createForm.watchers.map((watcher) => watcher.name).join(", "),
      openedAt: toIsoOrEmpty(createForm.openedAt) || new Date().toISOString(),
      dueDate: createForm.dueDate || "",
    });

    handleCloseCreateModal();
    setSelectedTicketId(createdTicket?.id ?? null);
  };

  const handleSaveTicket = (event) => {
    event.preventDefault();

    if (!selectedTicket || !detailForm?.title || !detailForm?.requester) {
      return;
    }

    updateTicket(selectedTicket.id, {
      ...detailForm,
      openedAt: toIsoOrEmpty(detailForm.openedAt),
      dueDate: detailForm.dueDate || "",
    });
  };

  const handleDeleteTicket = () => {
    if (!selectedTicket) {
      return;
    }

    const currentIndex = tickets.findIndex((ticket) => ticket.id === selectedTicket.id);
    const fallbackTicket = tickets[currentIndex + 1] || tickets[currentIndex - 1] || null;
    deleteTicket(selectedTicket.id);
    setSelectedTicketId(fallbackTicket?.id ?? null);
  };

  const handleDetailAttachments = async (event) => {
    const nextFiles = Array.from(event.target.files || []);
    if (!nextFiles.length || !selectedTicket) {
      return;
    }

    const attachments = await Promise.all(nextFiles.map(readFileAsDataUrl));
    addTicketAttachments(selectedTicket.id, attachments);
    event.target.value = "";
  };

  return (
    <div className="ticket-workspace">
      <section className="ticket-list-panel board-card glpi-panel">
        <div className="glpi-toolbar">
          <div>
            <h2>Fila de chamados</h2>
            <span>Painel operacional com abertura, triagem e acompanhamento.</span>
          </div>
          <button className="primary-button" onClick={handleOpenCreateModal} type="button">
            + Criar chamado
          </button>
        </div>

        <div className="toolbar glpi-filter-bar">
          {["Todos", "Incidente", "Requisicao", "Aguardando aprovacao", "Proximos do SLA"].map((item) => (
            <button
              key={item}
              className={`filter-pill${filter === item ? " is-active" : ""}`}
              onClick={() => setFilter(item)}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>

        <div className="ticket-rows">
          {filteredTickets.map((ticket) => (
            <button
              className={`ticket-row-card${ticket.id === selectedTicket?.id ? " is-selected" : ""}`}
              key={ticket.id}
              onClick={() => setSelectedTicketId(ticket.id)}
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
            aria-labelledby="ticket-create-title"
          >
            <form className="ticket-create-form glpi-ticket-form" onSubmit={handleCreateSubmit}>
              <div className="ticket-modal-header">
                <div className="form-section-header">
                  <strong id="ticket-create-title">Abertura de chamado</strong>
                  <span>Formulario em pop-up com solicitante travado no usuario logado.</span>
                </div>
                <button className="ghost-button" onClick={handleCloseCreateModal} type="button">
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
                    <small>
                      {user ? `${user.email} • ${user.role}` : "Faca login para registrar o solicitante."}
                    </small>
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
                            className="watcher-suggestion"
                            key={candidate.id}
                            onClick={() => handleAddWatcher(candidate)}
                            type="button"
                          >
                            <strong>{candidate.name}</strong>
                            <small>
                              {candidate.email} • {candidate.team}
                            </small>
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
                <button className="ghost-button" onClick={() => createInputRef.current?.click()} type="button">
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
                <button className="primary-button" type="submit">
                  Registrar chamado
                </button>
                <button className="ghost-button" onClick={handleCloseCreateModal} type="button">
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <section className="ticket-detail-panel board-card glpi-panel">
        {selectedTicket && detailForm ? (
          <form className="ticket-detail-form" onSubmit={handleSaveTicket}>
            <div className="glpi-toolbar">
              <div>
                <h2>{selectedTicket.id}</h2>
                <span>
                  Aberto em {selectedTicket.openedAtLabel}
                  {selectedTicket.dueDateLabel ? ` • limite ${selectedTicket.dueDateLabel}` : ""}
                </span>
              </div>
              <div className="ticket-detail-actions">
                <button className="ghost-button" type="submit">
                  Salvar alteracoes
                </button>
                <button className="danger-button" onClick={handleDeleteTicket} type="button">
                  Excluir chamado
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
                <strong>{selectedTicket.priority}</strong>
              </div>
              <div>
                <span>SLA</span>
                <strong>{selectedTicket.sla}</strong>
              </div>
              <div>
                <span>Ultima atualizacao</span>
                <strong>{selectedTicket.updatedAt}</strong>
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
                <button className="ghost-button" onClick={() => detailInputRef.current?.click()} type="button">
                  Adicionar anexos
                </button>
                <input hidden multiple onChange={handleDetailAttachments} ref={detailInputRef} type="file" />
              </div>

              {selectedTicket.attachments?.length ? (
                <div className="attachment-list">
                  {selectedTicket.attachments.map((attachment) => (
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
                          className="ghost-link danger-link"
                          onClick={() => removeTicketAttachment(selectedTicket.id, attachment.id)}
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
          </form>
        ) : (
          <div className="empty-state empty-state-large">
            <strong>Nenhum chamado selecionado.</strong>
            <span>Escolha um item da fila para abrir o formulario completo do atendimento.</span>
          </div>
        )}
      </section>
    </div>
  );
}

export default TicketsPage;
