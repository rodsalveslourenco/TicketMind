import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { createPublicTicketRequest, loadPublicIntake } from "../services/appStateClient";

const defaultForm = {
  requesterName: "",
  requesterEmail: "",
  departmentId: "",
  title: "",
  type: "Incidente",
  priority: "Media",
  urgency: "Media",
  impact: "Media",
  category: "Geral",
  location: "",
  description: "",
  approvalAmount: "",
  projectId: "",
  assetId: "",
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
  const [bootstrap, setBootstrap] = useState({ portal: null, departments: [], projects: [], assets: [] });
  const [form, setForm] = useState(defaultForm);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapPortal() {
      setLoading(true);
      setError("");
      try {
        const payload = await loadPublicIntake(accessToken);
        if (cancelled) return;
        const nextBootstrap = payload?.data || { portal: null, departments: [], projects: [], assets: [] };
        setBootstrap(nextBootstrap);
        setForm((current) => ({
          ...current,
          departmentId: current.departmentId || nextBootstrap.departments?.[0]?.id || "",
        }));
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

  const activeProjects = useMemo(
    () => (Array.isArray(bootstrap.projects) ? bootstrap.projects : []).filter((project) => normalizeText(project.status) !== "encerrado"),
    [bootstrap.projects],
  );

  const activeAssets = useMemo(
    () => (Array.isArray(bootstrap.assets) ? bootstrap.assets : []).filter((asset) => !["baixado", "excluido"].includes(normalizeText(asset.status))),
    [bootstrap.assets],
  );

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
        ...form,
        approvalAmount: Number(form.approvalAmount) || 0,
      });
      setSuccessTicket(ticket);
      setForm({
        ...defaultForm,
        departmentId: bootstrap.departments?.[0]?.id || "",
      });
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
            <span>Guarde esse numero para acompanhamento interno da equipe.</span>
          </div>
        ) : null}

        {error ? <div className="form-alert">{error}</div> : null}

        <form className="glpi-ticket-form public-ticket-form" onSubmit={handleSubmit}>
          <div className="glpi-form-grid public-ticket-grid">
            <label className="field-block">
              <span>Seu nome</span>
              <input onChange={updateField("requesterName")} required value={form.requesterName} />
            </label>
            <label className="field-block">
              <span>Seu e-mail</span>
              <input onChange={updateField("requesterEmail")} required type="email" value={form.requesterEmail} />
            </label>
            <label className="field-block">
              <span>Departamento</span>
              <select disabled={!bootstrap.departments.length} onChange={updateField("departmentId")} required={bootstrap.departments.length > 0} value={form.departmentId}>
                <option value="">{bootstrap.departments.length ? "Selecione" : "Canal geral"}</option>
                {bootstrap.departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field-block field-full">
              <span>Titulo</span>
              <input onChange={updateField("title")} placeholder="Resuma o problema ou solicitacao" required value={form.title} />
            </label>

            <label className="field-block">
              <span>Tipo</span>
              <select onChange={updateField("type")} value={form.type}>
                <option>Incidente</option>
                <option>Requisicao</option>
                <option>Problema</option>
              </select>
            </label>
            <label className="field-block">
              <span>Prioridade</span>
              <select onChange={updateField("priority")} value={form.priority}>
                <option>Baixa</option>
                <option>Media</option>
                <option>Alta</option>
                <option>Critica</option>
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
              <span>Impacto</span>
              <select onChange={updateField("impact")} value={form.impact}>
                <option>Baixa</option>
                <option>Media</option>
                <option>Alta</option>
                <option>Critica</option>
              </select>
            </label>
            <label className="field-block">
              <span>Categoria</span>
              <input onChange={updateField("category")} value={form.category} />
            </label>
            <label className="field-block">
              <span>Localizacao</span>
              <input onChange={updateField("location")} value={form.location} />
            </label>

            {normalizeText(form.type) === "requisicao" ? (
              <label className="field-block">
                <span>Valor para aprovacao</span>
                <input min="0" onChange={updateField("approvalAmount")} step="0.01" type="number" value={form.approvalAmount} />
              </label>
            ) : null}

            <label className="field-block">
              <span>Projeto vinculado</span>
              <select onChange={updateField("projectId")} value={form.projectId}>
                <option value="">Nao vincular</option>
                {activeProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-block">
              <span>Ativo vinculado</span>
              <select onChange={updateField("assetId")} value={form.assetId}>
                <option value="">Nao vincular</option>
                {activeAssets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.assetTag ? `${asset.assetTag} - ${asset.name}` : asset.name}
                  </option>
                ))}
              </select>
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
      </div>
    </div>
  );
}

export default PublicTicketRequestPage;
