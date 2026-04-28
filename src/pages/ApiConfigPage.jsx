import { useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { hasAnyPermission } from "../data/permissions";
import { useAppData } from "../data/AppDataContext";

const defaultForm = {
  name: "",
  baseUrl: "",
  method: "GET",
  authType: "Bearer",
  status: "Ativa",
  timeout: 30,
  resource: "",
};

function normalizeResource(resource) {
  const trimmed = String(resource || "").trim();
  if (!trimmed) return "";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function ApiConfigPage() {
  const { user } = useAuth();
  const { apiConfigs, deleteApiConfig, pushToast, saveApiConfig } = useAppData();
  const [form, setForm] = useState(defaultForm);
  const [editingId, setEditingId] = useState(null);
  const canConfigureApi = hasAnyPermission(user, ["api_rest_configure_integrations", "api_rest_admin"]);

  const orderedConfigs = useMemo(
    () => apiConfigs.slice().sort((left, right) => left.name.localeCompare(right.name)),
    [apiConfigs],
  );

  const updateField = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const resetForm = () => {
    setForm(defaultForm);
    setEditingId(null);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!canConfigureApi) return;
    if (!form.name || !form.baseUrl || !form.resource) return;

    saveApiConfig(
      {
        ...form,
        name: form.name.trim(),
        baseUrl: form.baseUrl.trim(),
        resource: normalizeResource(form.resource),
        timeout: Math.max(1, Number(form.timeout) || 1),
      },
      editingId,
    );
    pushToast(editingId ? "Configuracao atualizada" : "Configuracao criada", form.name);
    resetForm();
  };

  return (
    <div className="users-page">
      <section className="module-hero board-card">
        <div>
          <span className="eyebrow">API REST</span>
          <h2>API REST</h2>
        </div>
        <div className="insight-strip">
          <div className="insight-chip">
            <strong>{orderedConfigs.length}</strong>
            <span>integracoes</span>
          </div>
          <div className="insight-chip">
            <strong>{orderedConfigs.filter((config) => config.status === "Ativa").length}</strong>
            <span>ativas</span>
          </div>
          <div className="insight-chip">
            <strong>{orderedConfigs.filter((config) => config.method === "POST").length}</strong>
            <span>rotas POST</span>
          </div>
        </div>
      </section>

      <section className="module-grid">
        <section className="board-card glpi-panel">
          <div className="glpi-toolbar">
            <div>
              <h2>{editingId ? "Editar integracao" : "Configuracao de API REST"}</h2>
            </div>
          </div>

          <form className="glpi-ticket-form user-form" onSubmit={handleSubmit}>
            <div className="glpi-form-grid">
              <label className="field-block">
                <span>Nome</span>
                <input disabled={!canConfigureApi} onChange={updateField("name")} value={form.name} />
              </label>
              <label className="field-block field-span-2">
                <span>Base URL</span>
                <input disabled={!canConfigureApi} onChange={updateField("baseUrl")} value={form.baseUrl} />
              </label>
              <label className="field-block">
                <span>Metodo</span>
                <select disabled={!canConfigureApi} onChange={updateField("method")} value={form.method}>
                  <option>GET</option>
                  <option>POST</option>
                  <option>PUT</option>
                  <option>PATCH</option>
                  <option>DELETE</option>
                </select>
              </label>
              <label className="field-block">
                <span>Autenticacao</span>
                <select disabled={!canConfigureApi} onChange={updateField("authType")} value={form.authType}>
                  <option>Bearer</option>
                  <option>Basic</option>
                  <option>API Key</option>
                  <option>Nenhuma</option>
                </select>
              </label>
              <label className="field-block">
                <span>Status</span>
                <select disabled={!canConfigureApi} onChange={updateField("status")} value={form.status}>
                  <option>Ativa</option>
                  <option>Em homologacao</option>
                  <option>Pausada</option>
                </select>
              </label>
              <label className="field-block">
                <span>Timeout (s)</span>
                <input disabled={!canConfigureApi} min="1" onChange={updateField("timeout")} type="number" value={form.timeout} />
              </label>
              <label className="field-block field-span-2">
                <span>Recurso</span>
                <input disabled={!canConfigureApi} onChange={updateField("resource")} value={form.resource} />
              </label>
            </div>

            <div className="ticket-create-actions">
              {canConfigureApi ? (
                <button className="primary-button interactive-button" type="submit">
                  {editingId ? "Salvar configuracao" : "Cadastrar configuracao"}
                </button>
              ) : null}
              {editingId ? (
                <button className="ghost-button interactive-button" onClick={resetForm} type="button">
                  Cancelar
                </button>
              ) : null}
            </div>
          </form>
        </section>

        <section className="board-card glpi-panel record-grid-shell">
          <div className="glpi-toolbar">
            <div>
              <h2>Integracoes registradas</h2>
            </div>
          </div>
          <div className="record-grid">
            {orderedConfigs.map((config) => (
              <article className="record-card" key={config.id}>
                <div>
                  <strong>{config.name}</strong>
                  <span>
                    {config.baseUrl}
                    {config.resource}
                  </span>
                </div>
                <div className="row-stats row-stats-wrap">
                  <span>{config.method}</span>
                  <span>{config.authType}</span>
                  <span>{config.timeout}s</span>
                  <span>{config.status}</span>
                </div>
                <div className="ticket-create-actions">
                  {canConfigureApi ? (
                    <>
                      <button
                        className="ghost-button interactive-button"
                        onClick={() => {
                          setEditingId(config.id);
                          setForm(config);
                        }}
                        type="button"
                      >
                        Editar
                      </button>
                      <button
                        className="danger-button interactive-button"
                        onClick={() => {
                          deleteApiConfig(config.id);
                          pushToast("Configuracao removida", config.name);
                        }}
                        type="button"
                      >
                        Excluir
                      </button>
                    </>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>
    </div>
  );
}

export default ApiConfigPage;
