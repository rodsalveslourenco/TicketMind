import { useEffect, useMemo, useRef, useState } from "react";
import { useAppData } from "../data/AppDataContext";

const defaultCreateForm = {
  title: "",
  type: "Incidente",
  requester: "",
  queue: "Service Desk",
  category: "",
  source: "Portal",
  location: "",
  urgency: "Média",
  impact: "Média",
  openedAt: new Date().toISOString(),
  dueDate: "",
  watchers: "",
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
  { key: "location", label: "Localização", kind: "input" },
  { key: "urgency", label: "Urgência", kind: "select" },
  { key: "impact", label: "Impacto", kind: "select" },
  { key: "dueDate", label: "Data limite", kind: "date" },
  { key: "openedAt", label: "Abertura", kind: "datetime" },
  { key: "watchers", label: "Observadores", kind: "input" },
  { key: "assignee", label: "Técnico responsável", kind: "input" },
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

function TicketsPage() {
  const {
    addTicketAttachments,
    createTicket,
    deleteTicket,
    removeTicketAttachment,
    tickets,
    toLocalDatetimeInput,
    updateTicket,
  } = useAppData();
  const [filter, setFilter] = useState("Todos");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState(defaultCreateForm);
  const [selectedTicketId, setSelectedTicketId] = useState(tickets[0]?.id ?? null);
  const [detailForm, setDetailForm] = useState(null);
  const createInputRef = useRef(null);
  const detailInputRef = useRef(null);

  const filteredTickets = useMemo(() => {
    if (filter === "Todos") {
      return tickets;
    }

    if (filter === "Próximos do SLA") {
      return tickets.filter((ticket) => ticket.sla.toLowerCase().includes("min"));
    }

    return tickets.filter((ticket) => ticket.type === filter || ticket.status === filter);
  }, [filter, tickets]);

  const selectedTicket =
    filteredTickets.find((ticket) => ticket.id === selectedTicketId) ??
    tickets.find((ticket) => ticket.id === selectedTicketId) ??
    filteredTickets[0] ??
    null;

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
        urgency: selectedTicket.urgency || "Média",
        impact: selectedTicket.impact || "Média",
        openedAt: toLocalDatetimeInput(selectedTicket.openedAt),
        dueDate: selectedTicket.dueDate ? selectedTicket.dueDate.slice(0, 10) : "",
        watchers: selectedTicket.watchers || "",
      });
    } else {
      setDetailForm(null);
    }
  }, [selectedTicket, filteredTickets, toLocalDatetimeInput]);

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

  const handleCreateSubmit = (event) => {
    event.preventDefault();

    if (!createForm.title || !createForm.requester || !createForm.description || !createForm.category) {
      return;
    }

    const createdTicket = createTicket({
      ...createForm,
      openedAt: toIsoOrEmpty(createForm.openedAt) || new Date().toISOString(),
      dueDate: createForm.dueDate || "",
    });

    setShowCreateForm(false);
    setCreateForm({
      ...defaultCreateForm,
      openedAt: new Date().toISOString(),
    });
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
          <button
            className="primary-button"
            onClick={() => setShowCreateForm((current) => !current)}
            type="button"
          >
            + Criar chamado
          </button>
        </div>

        {showCreateForm ? (
          <form className="ticket-create-form glpi-ticket-form" onSubmit={handleCreateSubmit}>
            <div className="form-section-header">
              <strong>Abertura de chamado</strong>
              <span>Preencha os campos principais antes de registrar o ticket.</span>
            </div>

            <div className="glpi-form-grid">
              <label className="field-block field-span-2">
                <span>Título</span>
                <input onChange={updateCreateField("title")} value={createForm.title} />
              </label>
              <label className="field-block">
                <span>Tipo</span>
                <select onChange={updateCreateField("type")} value={createForm.type}>
                  <option>Incidente</option>
                  <option>Requisição</option>
                  <option>Problema</option>
                </select>
              </label>
              <label className="field-block">
                <span>Categoria</span>
                <input onChange={updateCreateField("category")} value={createForm.category} />
              </label>
              <label className="field-block">
                <span>Solicitante</span>
                <input onChange={updateCreateField("requester")} value={createForm.requester} />
              </label>
              <label className="field-block">
                <span>Fila</span>
                <select onChange={updateCreateField("queue")} value={createForm.queue}>
                  <option>Service Desk</option>
                  <option>Infraestrutura</option>
                  <option>Aplicações</option>
                  <option>Segurança</option>
                </select>
              </label>
              <label className="field-block">
                <span>Origem</span>
                <select onChange={updateCreateField("source")} value={createForm.source}>
                  <option>Portal</option>
                  <option>E-mail</option>
                  <option>Telefone</option>
                  <option>Monitoramento</option>
                </select>
              </label>
              <label className="field-block">
                <span>Localização</span>
                <input onChange={updateCreateField("location")} value={createForm.location} />
              </label>
              <label className="field-block">
                <span>Urgência</span>
                <select onChange={updateCreateField("urgency")} value={createForm.urgency}>
                  <option>Baixa</option>
                  <option>Média</option>
                  <option>Alta</option>
                  <option>Crítica</option>
                </select>
              </label>
              <label className="field-block">
                <span>Impacto</span>
                <select onChange={updateCreateField("impact")} value={createForm.impact}>
                  <option>Baixa</option>
                  <option>Média</option>
                  <option>Alta</option>
                  <option>Crítica</option>
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
              <label className="field-block field-span-2">
                <span>Observadores</span>
                <input onChange={updateCreateField("watchers")} value={createForm.watchers} />
              </label>
              <label className="field-block field-full">
                <span>Descrição</span>
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
              <button
                className="ghost-button"
                onClick={() => {
                  setShowCreateForm(false);
                  setCreateForm({
                    ...defaultCreateForm,
                    openedAt: new Date().toISOString(),
                  });
                }}
                type="button"
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : null}

        <div className="toolbar glpi-filter-bar">
          {["Todos", "Incidente", "Requisição", "Aguardando aprovação", "Próximos do SLA"].map((item) => (
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
                  <span className={`badge badge-${ticket.priority.toLowerCase()}`}>{ticket.priority}</span>
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
                  Salvar alterações
                </button>
                <button className="danger-button" onClick={handleDeleteTicket} type="button">
                  Excluir chamado
                </button>
              </div>
            </div>

            <label className="field-block field-full">
              <span>Título</span>
              <input onChange={updateDetailField("title")} value={detailForm.title} />
            </label>

            <div className="detail-grid">
              {detailFields.map((field) => (
                <label className="field-block" key={field.key}>
                  <span>{field.label}</span>
                  {field.kind === "select" && field.key === "type" ? (
                    <select onChange={updateDetailField(field.key)} value={detailForm[field.key]}>
                      <option>Incidente</option>
                      <option>Requisição</option>
                      <option>Problema</option>
                    </select>
                  ) : null}
                  {field.kind === "select" && field.key === "status" ? (
                    <select onChange={updateDetailField(field.key)} value={detailForm[field.key]}>
                      <option>Aberto</option>
                      <option>Em atendimento</option>
                      <option>Aguardando aprovação</option>
                      <option>Análise</option>
                      <option>Resolvido</option>
                    </select>
                  ) : null}
                  {field.kind === "select" && field.key === "queue" ? (
                    <select onChange={updateDetailField(field.key)} value={detailForm[field.key]}>
                      <option>Service Desk</option>
                      <option>Infraestrutura</option>
                      <option>Aplicações</option>
                      <option>Segurança</option>
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
                      <option>Média</option>
                      <option>Alta</option>
                      <option>Crítica</option>
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
                <span>Última atualização</span>
                <strong>{selectedTicket.updatedAt}</strong>
              </div>
            </div>

            <label className="field-block field-full">
              <span>Descrição</span>
              <textarea onChange={updateDetailField("description")} value={detailForm.description} />
            </label>

            <label className="field-block field-full">
              <span>Solução / acompanhamento técnico</span>
              <textarea onChange={updateDetailField("resolutionNotes")} value={detailForm.resolutionNotes} />
            </label>

            <div className="ticket-attachment-panel">
              <div className="attachment-toolbar glpi-subbar">
                <div>
                  <strong>Anexos</strong>
                  <span>Prints, documentos e evidências vinculadas ao chamado.</span>
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
                  <span>Use o botão acima para anexar prints, PDFs, planilhas ou outros arquivos.</span>
                </div>
              )}
            </div>
          </form>
        ) : (
          <div className="empty-state empty-state-large">
            <strong>Nenhum chamado selecionado.</strong>
            <span>Escolha um item da fila para abrir o formulário completo do atendimento.</span>
          </div>
        )}
      </section>
    </div>
  );
}

export default TicketsPage;
