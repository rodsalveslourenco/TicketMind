import { useMemo, useState } from "react";
import { useAppData } from "../data/AppDataContext";

const defaultForm = {
  name: "",
  type: "Servidor",
  owner: "",
  status: "Ativo",
  criticality: "Media",
  location: "",
  serial: "",
};

function AssetsPage() {
  const { addAsset, assets, deleteAsset, pushToast, updateAsset } = useAppData();
  const [form, setForm] = useState(defaultForm);
  const [editingId, setEditingId] = useState(null);

  const orderedAssets = useMemo(() => assets.slice().sort((left, right) => left.name.localeCompare(right.name)), [assets]);

  const updateField = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const resetForm = () => {
    setForm(defaultForm);
    setEditingId(null);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!form.name || !form.owner || !form.location) return;

    if (editingId) {
      updateAsset(editingId, form);
      pushToast("Ativo atualizado", form.name);
    } else {
      addAsset(form);
      pushToast("Ativo cadastrado", form.name);
    }
    resetForm();
  };

  return (
    <div className="users-page">
      <section className="module-hero board-card">
        <div>
          <span className="eyebrow">Ativos</span>
          <h2>Cadastro mais limpo para infraestrutura, software e itens criticos de sustentacao.</h2>
        </div>
        <div className="insight-strip">
          <div className="insight-chip">
            <strong>{orderedAssets.length}</strong>
            <span>ativos registrados</span>
          </div>
          <div className="insight-chip">
            <strong>{orderedAssets.filter((asset) => asset.status === "Ativo").length}</strong>
            <span>em operacao</span>
          </div>
          <div className="insight-chip">
            <strong>{orderedAssets.filter((asset) => asset.criticality === "Alta").length}</strong>
            <span>alta criticidade</span>
          </div>
        </div>
      </section>

      <section className="module-grid">
        <section className="board-card glpi-panel">
          <div className="glpi-toolbar">
            <div>
              <h2>{editingId ? "Editar ativo" : "Cadastro de ativos"}</h2>
              <span>Controle tecnico de infraestrutura, software e componentes criticos.</span>
            </div>
          </div>

          <form className="glpi-ticket-form user-form" onSubmit={handleSubmit}>
            <div className="glpi-form-grid">
              <label className="field-block">
                <span>Nome</span>
                <input onChange={updateField("name")} value={form.name} />
              </label>
              <label className="field-block">
                <span>Tipo</span>
                <select onChange={updateField("type")} value={form.type}>
                  <option>Servidor</option>
                  <option>Firewall</option>
                  <option>Switch</option>
                  <option>Aplicacao</option>
                  <option>Notebook</option>
                </select>
              </label>
              <label className="field-block">
                <span>Responsavel</span>
                <input onChange={updateField("owner")} value={form.owner} />
              </label>
              <label className="field-block">
                <span>Status</span>
                <select onChange={updateField("status")} value={form.status}>
                  <option>Ativo</option>
                  <option>Monitorado</option>
                  <option>Manutencao</option>
                  <option>Baixado</option>
                </select>
              </label>
              <label className="field-block">
                <span>Criticidade</span>
                <select onChange={updateField("criticality")} value={form.criticality}>
                  <option>Baixa</option>
                  <option>Media</option>
                  <option>Alta</option>
                </select>
              </label>
              <label className="field-block">
                <span>Localizacao</span>
                <input onChange={updateField("location")} value={form.location} />
              </label>
              <label className="field-block field-span-2">
                <span>Serial</span>
                <input onChange={updateField("serial")} value={form.serial} />
              </label>
            </div>

            <div className="ticket-create-actions">
              <button className="primary-button interactive-button" type="submit">
                {editingId ? "Salvar ativo" : "Cadastrar ativo"}
              </button>
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
              <h2>Ativos cadastrados</h2>
              <span>Edicao e acompanhamento dos itens monitorados.</span>
            </div>
          </div>

          <div className="record-grid">
            {orderedAssets.map((asset) => (
              <article className="record-card" key={asset.id}>
                <div>
                  <strong>{asset.name}</strong>
                  <span>{asset.type} | {asset.location}</span>
                </div>
                <div className="row-stats row-stats-wrap">
                  <span>{asset.owner}</span>
                  <span>{asset.status}</span>
                  <span>{asset.criticality}</span>
                  <span>{asset.serial}</span>
                </div>
                <div className="ticket-create-actions">
                  <button
                    className="ghost-button interactive-button"
                    onClick={() => {
                      setEditingId(asset.id);
                      setForm(asset);
                    }}
                    type="button"
                  >
                    Editar
                  </button>
                  <button
                    className="danger-button interactive-button"
                    onClick={() => {
                      deleteAsset(asset.id);
                      pushToast("Ativo removido", asset.name);
                    }}
                    type="button"
                  >
                    Excluir
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>
    </div>
  );
}

export default AssetsPage;
