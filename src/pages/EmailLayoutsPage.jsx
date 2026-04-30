import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useAppData } from "../data/AppDataContext";
import { hasAnyPermission } from "../data/permissions";

const emptyForm = {
  name: "",
  eventKey: "",
  subject: "",
  body: "",
  status: "Ativo",
};

function EmailLayoutsPage() {
  const { user } = useAuth();
  const {
    emailLayouts,
    emailPlaceholders,
    notificationEvents,
    pushToast,
    saveEmailLayout,
    deleteEmailLayout,
  } = useAppData();
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const canView = hasAnyPermission(user, ["email_layouts_view", "email_layouts_manage", "users_admin"]);
  const canManage = hasAnyPermission(user, ["email_layouts_manage", "users_admin"]);
  const canDelete = hasAnyPermission(user, ["email_layouts_delete", "email_layouts_manage", "users_admin"]);

  const orderedLayouts = useMemo(
    () => emailLayouts.slice().sort((left, right) => left.name.localeCompare(right.name)),
    [emailLayouts],
  );

  if (!canView) {
    return <Navigate replace to="/app/dashboard" />;
  }

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (layout) => {
    setEditingId(layout.id);
    setForm({
      name: layout.name,
      eventKey: layout.eventKey,
      subject: layout.subject,
      body: layout.body,
      status: layout.status,
    });
    setShowModal(true);
  };

  const insertPlaceholder = (placeholderKey) => {
    setForm((current) => ({
      ...current,
      body: `${current.body}${current.body ? "\n" : ""}{{${placeholderKey}}}`,
    }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!canManage) return;
    if (!form.name || !form.subject || !form.body) return;
    saveEmailLayout(form, editingId || undefined);
    pushToast(editingId ? "Layout atualizado" : "Layout cadastrado", form.name);
    setShowModal(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleDelete = (layout) => {
    if (!canDelete) return;
    deleteEmailLayout(layout.id);
    pushToast("Layout removido", layout.name);
  };

  return (
    <div className="settings-page">
      <section className="module-hero board-card">
        <div>
          <span className="eyebrow">Configuracoes</span>
          <h2>Layouts de E-mail</h2>
        </div>
        <div className="insight-strip">
          <div className="insight-chip">
            <strong>{orderedLayouts.length}</strong>
            <span>layouts cadastrados</span>
          </div>
          <div className="insight-chip">
            <strong>{orderedLayouts.filter((layout) => layout.status === "Ativo").length}</strong>
            <span>layouts ativos</span>
          </div>
          <div className="insight-chip">
            <strong>{emailPlaceholders.length}</strong>
            <span>placeholders disponiveis</span>
          </div>
        </div>
      </section>

      <section className="board-card glpi-panel">
        <div className="glpi-toolbar">
          <div>
            <h2>Templates</h2>
            <span>Associe o assunto e o corpo do e-mail a cada evento configuravel.</span>
          </div>
          {canManage ? (
            <button className="primary-button interactive-button" onClick={openCreate} type="button">
              + Novo layout
            </button>
          ) : null}
        </div>

        <div className="settings-stack">
          {orderedLayouts.map((layout) => (
            <article className="board-card settings-card" key={layout.id}>
              <div className="settings-card-head">
                <div>
                  <strong>{layout.name}</strong>
                  <span>
                    {(notificationEvents.find((event) => event.key === layout.eventKey)?.label || "Sem evento")} | {layout.status}
                  </span>
                </div>
                <div className="ticket-detail-actions">
                  {canManage ? (
                    <button className="ghost-button interactive-button" onClick={() => openEdit(layout)} type="button">
                      Editar
                    </button>
                  ) : null}
                  {canDelete ? (
                    <button className="danger-button interactive-button" onClick={() => handleDelete(layout)} type="button">
                      Excluir
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="settings-template-preview">
                <strong>Assunto</strong>
                <p>{layout.subject}</p>
                <strong>Corpo</strong>
                <pre>{layout.body}</pre>
              </div>
            </article>
          ))}
          {!orderedLayouts.length ? (
            <div className="empty-state">
              <strong>Nenhum layout cadastrado.</strong>
              <span>Crie templates para usar nas notificacoes por evento.</span>
            </div>
          ) : null}
        </div>
      </section>

      {showModal ? (
        <div className="ticket-modal-backdrop" onClick={() => setShowModal(false)} role="presentation">
          <div className="ticket-modal ticket-modal-large board-card" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <form className="ticket-detail-form" onSubmit={handleSubmit}>
              <div className="ticket-modal-header">
                <div>
                  <h2>{editingId ? "Editar layout" : "Novo layout"}</h2>
                  <span className="modal-subtitle">Templates persistidos no banco e reutilizados nas notificacoes.</span>
                </div>
                <button className="ghost-button interactive-button" onClick={() => setShowModal(false)} type="button">
                  Fechar
                </button>
              </div>

              <div className="glpi-form-grid">
                <label className="field-block">
                  <span>Nome do layout</span>
                  <input onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} value={form.name} />
                </label>
                <label className="field-block">
                  <span>Evento vinculado</span>
                  <select onChange={(event) => setForm((current) => ({ ...current, eventKey: event.target.value }))} value={form.eventKey}>
                    <option value="">Sem evento</option>
                    {notificationEvents.map((eventItem) => (
                      <option key={eventItem.key} value={eventItem.key}>
                        {eventItem.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-block">
                  <span>Status</span>
                  <select onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} value={form.status}>
                    <option>Ativo</option>
                    <option>Inativo</option>
                  </select>
                </label>
                <label className="field-block field-span-2">
                  <span>Assunto</span>
                  <input onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))} value={form.subject} />
                </label>
                <label className="field-block field-span-2">
                  <span>Corpo do e-mail</span>
                  <textarea className="email-layout-body" onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))} value={form.body} />
                </label>
              </div>

              <div className="settings-placeholder-panel">
                <strong>Placeholders disponiveis</strong>
                <div className="placeholder-chip-list">
                  {emailPlaceholders.map((placeholder) => (
                    <button className="filter-pill interactive-button" key={placeholder.key} onClick={() => insertPlaceholder(placeholder.key)} type="button">
                      {`{{${placeholder.key}}}`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="ticket-create-actions">
                <button className="primary-button interactive-button" type="submit">
                  Salvar layout
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default EmailLayoutsPage;
