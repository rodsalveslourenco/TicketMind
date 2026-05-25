import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { createPublicTicketRequest, loadPublicIntake, lookupPublicRequester } from "../services/appStateClient";

const defaultForm = {
  requesterEmail: "",
  requesterName: "",
  requesterDepartmentId: "",
  requesterLocation: "",
  destinationDepartmentId: "",
  title: "",
  type: "Incidente",
  urgency: "Media",
  description: "",
  attachments: [],
};

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function formatBytes(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

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

function PublicTicketRequestPage() {
  const { accessToken = "" } = useParams();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successTicket, setSuccessTicket] = useState(null);
  const [bootstrap, setBootstrap] = useState({
    portal: null,
    defaults: {},
    requesterDepartments: [],
    destinationDepartments: [],
    locations: [],
  });
  const [form, setForm] = useState(defaultForm);
  const [requesterSnapshot, setRequesterSnapshot] = useState({
    requesterName: "",
    requesterDepartmentId: "",
    requesterDepartment: "",
    requesterLocation: "",
    hasRegisteredUser: false,
    hasPreRegisteredUser: false,
    previousTickets: [],
  });
  const [requesterLookupLoading, setRequesterLookupLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapPortal() {
      setLoading(true);
      setError("");
      try {
        const payload = await loadPublicIntake(accessToken);
        if (cancelled) return;
        setBootstrap(payload?.data || { portal: null, defaults: {} });
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : "Nao foi possivel carregar o canal externo.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    bootstrapPortal();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    const normalizedEmail = String(form.requesterEmail || "").trim().toLowerCase();
    if (!normalizedEmail.includes("@")) {
      setRequesterSnapshot({
        requesterName: "",
        requesterDepartmentId: "",
        requesterDepartment: "",
        requesterLocation: "",
        hasRegisteredUser: false,
        hasPreRegisteredUser: false,
        previousTickets: [],
      });
      setRequesterLookupLoading(false);
      return undefined;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      try {
        setRequesterLookupLoading(true);
        const payload = await lookupPublicRequester(accessToken, normalizedEmail);
        if (!cancelled) {
          setRequesterSnapshot(payload?.data || {
            requesterName: "",
            requesterDepartmentId: "",
            requesterDepartment: "",
            requesterLocation: "",
            hasRegisteredUser: false,
            hasPreRegisteredUser: false,
            previousTickets: [],
          });
        }
      } catch {
        if (!cancelled) {
          setRequesterSnapshot({
            requesterName: "",
            requesterDepartmentId: "",
            requesterDepartment: "",
            requesterLocation: "",
            hasRegisteredUser: false,
            hasPreRegisteredUser: false,
            previousTickets: [],
          });
        }
      } finally {
        if (!cancelled) setRequesterLookupLoading(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [accessToken, form.requesterEmail]);

  useEffect(() => {
    setForm((current) => {
      const nextDestinationDepartmentId =
        current.destinationDepartmentId ||
        bootstrap.defaults?.defaultDepartmentId ||
        bootstrap.destinationDepartments?.[0]?.id ||
        "";
      if (nextDestinationDepartmentId === current.destinationDepartmentId) return current;
      return {
        ...current,
        destinationDepartmentId: nextDestinationDepartmentId,
      };
    });
  }, [bootstrap.defaults, bootstrap.destinationDepartments]);

  useEffect(() => {
    if (!String(form.requesterEmail || "").trim().includes("@")) return;
    setForm((current) => ({
      ...current,
      requesterName: current.requesterName || requesterSnapshot.requesterName || "",
      requesterDepartmentId: current.requesterDepartmentId || requesterSnapshot.requesterDepartmentId || "",
      requesterLocation: current.requesterLocation || requesterSnapshot.requesterLocation || "",
    }));
  }, [form.requesterEmail, requesterSnapshot]);

  const knownRequesterLabel = useMemo(() => {
    if (!requesterSnapshot.requesterName) return "";
    if (requesterSnapshot.hasRegisteredUser) {
      return `Cadastro encontrado para ${requesterSnapshot.requesterName}.`;
    }
    if (requesterSnapshot.hasPreRegisteredUser) {
      return `Pre-cadastro ja existente para ${requesterSnapshot.requesterName}.`;
    }
    return `Nao encontramos cadastro para esse e-mail. Um pre-cadastro sera criado automaticamente.`;
  }, [requesterSnapshot]);

  const updateField = (field) => (event) => {
    const value = event?.target?.value ?? "";
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleAttachments = async (event) => {
    const selectedFiles = Array.from(event.target.files || []);
    if (!selectedFiles.length) return;
    try {
      const attachments = await Promise.all(selectedFiles.map(readFileAsDataUrl));
      setForm((current) => ({ ...current, attachments: [...current.attachments, ...attachments] }));
    } catch (attachmentError) {
      setError(attachmentError instanceof Error ? attachmentError.message : "Nao foi possivel anexar os arquivos.");
    } finally {
      event.target.value = "";
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const ticket = await createPublicTicketRequest(accessToken, {
        requesterEmail: form.requesterEmail,
        requesterName: form.requesterName,
        requesterDepartmentId: form.requesterDepartmentId,
        requesterLocation: form.requesterLocation,
        destinationDepartmentId: form.destinationDepartmentId,
        title: form.title,
        type: form.type,
        urgency: form.urgency,
        description: form.description,
        attachments: form.attachments,
      });
      setSuccessTicket(ticket);
      setForm((current) => ({
        ...defaultForm,
        requesterEmail: current.requesterEmail,
        requesterName: current.requesterName,
        requesterDepartmentId: current.requesterDepartmentId,
        requesterLocation: current.requesterLocation,
        destinationDepartmentId: current.destinationDepartmentId || bootstrap.defaults?.defaultDepartmentId || bootstrap.destinationDepartments?.[0]?.id || "",
      }));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Nao foi possivel abrir o chamado.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="public-ticket-shell">
        <div className="public-ticket-card board-card">
          <strong>Carregando canal externo...</strong>
        </div>
      </div>
    );
  }

  if (error && !bootstrap.portal) {
    return (
      <div className="public-ticket-shell">
        <div className="public-ticket-card board-card">
          <strong>Canal externo indisponivel</strong>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="public-ticket-shell">
      <div className="public-ticket-card board-card">
        <div className="public-ticket-hero">
          <span className="eyebrow">Canal externo</span>
          <h1>{bootstrap.portal?.portalTitle || "Abrir chamado externo"}</h1>
          <p>{bootstrap.portal?.portalDescription || "Use este formulario para registrar uma solicitacao sem login."}</p>
        </div>

        {successTicket ? (
          <div className="public-ticket-success">
            <strong>Chamado aberto com sucesso: {successTicket.id}</strong>
            <span>
              {successTicket.requesterDirectoryStatus === "pre_registered"
                ? "O e-mail informado foi pre-cadastrado automaticamente para acompanhamento futuro."
                : "O chamado foi vinculado ao cadastro ja existente desse e-mail."}
            </span>
          </div>
        ) : null}

        {error ? <div className="form-alert">{error}</div> : null}

        <div className="public-ticket-grid-layout">
          <form className="glpi-ticket-form public-ticket-form" onSubmit={handleSubmit}>
            <div className="glpi-form-grid public-ticket-grid">
              <label className="field-block field-full">
                <span>Seu e-mail</span>
                <input onChange={updateField("requesterEmail")} required type="email" value={form.requesterEmail} />
              </label>

              {requesterLookupLoading ? <div className="public-ticket-lookup-note">Consultando historico desse e-mail...</div> : null}
              {!requesterLookupLoading && knownRequesterLabel ? <div className="public-ticket-lookup-note">{knownRequesterLabel}</div> : null}

              <label className="field-block">
                <span>Nome do solicitante</span>
                <input onChange={updateField("requesterName")} placeholder="Nome completo" required value={form.requesterName} />
              </label>

              <label className="field-block">
                <span>Departamento</span>
                <select onChange={updateField("requesterDepartmentId")} required value={form.requesterDepartmentId}>
                  <option value="">Selecione</option>
                  {(bootstrap.requesterDepartments || []).map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field-block">
                <span>Local</span>
                <input
                  list="public-request-locations"
                  onChange={updateField("requesterLocation")}
                  placeholder="Ex.: Matriz"
                  required
                  value={form.requesterLocation}
                />
                <datalist id="public-request-locations">
                  {(bootstrap.locations || []).map((location) => (
                    <option key={location.id || location.name} value={location.name} />
                  ))}
                </datalist>
              </label>

              <label className="field-block">
                <span>Departamento de destino</span>
                <select onChange={updateField("destinationDepartmentId")} required value={form.destinationDepartmentId}>
                  <option value="">Selecione</option>
                  {(bootstrap.destinationDepartments || []).map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field-block">
                <span>Urgencia</span>
                <select onChange={updateField("urgency")} value={form.urgency}>
                  <option>Baixa</option>
                  <option>Media</option>
                  <option>Alta</option>
                  <option>Critica</option>
                </select>
              </label>

              <label className="field-block">
                <span>Tipo</span>
                <select onChange={updateField("type")} value={form.type}>
                  <option>Incidente</option>
                  <option>Requisicao</option>
                  <option>Problema</option>
                </select>
              </label>

              <label className="field-block field-full">
                <span>Titulo</span>
                <input onChange={updateField("title")} placeholder="Resuma o problema ou solicitacao" required value={form.title} />
              </label>

              <label className="field-block field-full">
                <span>Descricao</span>
                <textarea onChange={updateField("description")} placeholder="Descreva o contexto, impacto e o que precisa ser feito." required value={form.description} />
              </label>

              <label className="field-block field-full">
                <span>Anexos</span>
                <input multiple onChange={handleAttachments} type="file" />
              </label>
            </div>

            {form.attachments.length ? (
              <div className="attachment-list">
                {form.attachments.map((attachment) => (
                  <div className="attachment-item" key={attachment.id}>
                    <div>
                      <strong>{attachment.name}</strong>
                      <span>{formatBytes(attachment.size)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="ticket-create-actions">
              <button className="primary-button interactive-button" disabled={submitting} type="submit">
                {submitting ? "Abrindo..." : "Abrir chamado"}
              </button>
            </div>
          </form>

          <section className="board-card public-ticket-history-panel">
            <div className="public-ticket-history-head">
              <strong>Chamados anteriores desse e-mail</strong>
              <span>{requesterSnapshot.previousTickets?.length ? `${requesterSnapshot.previousTickets.length} encontrado(s)` : "Nenhum chamado encontrado ainda"}</span>
            </div>
            {requesterSnapshot.previousTickets?.length ? (
              <div className="public-ticket-history-list">
                {requesterSnapshot.previousTickets.map((ticket) => (
                  <article className="public-ticket-history-item" key={ticket.id}>
                    <div>
                      <strong>{ticket.id}</strong>
                      <h3>{ticket.title}</h3>
                    </div>
                    <div className="ticket-row-badges">
                      <span className="badge badge-neutral">{ticket.status}</span>
                      <span className="badge badge-neutral">{ticket.urgency || ticket.priority}</span>
                    </div>
                    <div className="ticket-row-meta">
                      <span>{ticket.type} | {ticket.department || "Sem departamento"}</span>
                      <span>{ticket.location || "Sem local"}</span>
                      <span>{ticket.openedAtLabel}</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <strong>Nenhum historico para esse e-mail.</strong>
                <span>Assim que houver chamados anteriores, eles aparecerao aqui para consulta rapida.</span>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export default PublicTicketRequestPage;
