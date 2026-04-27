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
  const { addAsset, assets, deleteAsset, updateAsset } = useAppData();
  const [form, setForm] = useState(defaultForm);
  const [editingId, setEditingId] = useState(null);
  const [notice, setNotice] = useState("");

  const orderedAssets = useMemo(() => assets.slice().sort((left, right) => left.name.localeCompare(right.name)), [assets]);

  const updateField = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const resetForm = () => {
    setForm(defaultForm);
    setEditingId(null);
  };

  const flashNotice = (message) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 1800);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!form.name || !form.owner || !form.location) return;

    if (editingId) {
      updateAsset(editingId, form);
      flashNotice("Ativo atualizado.");
    } else {
      addAsset(form);
      flashNotice("Ativo cadastrado.");
    }
    resetForm();
  };

  return (
    <div className="users-page">
      <section className="board-card glpi-panel">
        <div className="glpi-toolbar">
          <div>
            <h2>{editingId ? "Editar ativo" : "Cadastro de ativos"}</h2>
            <span>Controle tecnico de infraestrutura, software e componentes criticos.</span>
          </div>
          {notice ? <span className="status-pill status-pill-success">{notice}</span> : null}
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

      <section className="board-card glpi-panel">
        <div className="glpi-toolbar">
          <div>
            <h2>Ativos cadastrados</h2>
            <span>Edicao e acompanhamento dos itens monitorados.</span>
          </div>
        </div>
        <div className="table-list">
          {orderedAssets.map((asset) => (
            <div className="table-row table-row-stack" key={asset.id}>
              <div>
                <strong>{asset.name}</strong>
                <span>{asset.type} • {asset.location}</span>
              </div>
              <div className="row-stats row-stats-wrap">
                <span>{asset.owner}</span>
                <span>{asset.status}</span>
                <span>{asset.criticality}</span>
                <span>{asset.serial}</span>
              </div>
              <div className="ticket-create-actions">
                <button className="ghost-button interactive-button" onClick={() => { setEditingId(asset.id); setForm(asset); }} type="button">
                  Editar
                </button>
                <button className="danger-button interactive-button" onClick={() => { deleteAsset(asset.id); flashNotice("Ativo removido."); }} type="button">
                  Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default AssetsPage;
