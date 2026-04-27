import { useEffect, useMemo, useState } from "react";
import UserAutocomplete from "../components/UserAutocomplete";
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

const assetStatuses = ["Ativo", "Monitorado", "Manutencao", "Baixado"];

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function getAssetPriorityClass(criticality) {
  const normalized = normalizeText(criticality);
  if (normalized === "alta") return "priority-line-critica";
  if (normalized === "baixa") return "priority-line-baixa";
  return "priority-line-media";
}

function AssetsPage() {
  const { addAsset, assets, deleteAsset, pushToast, updateAsset, users } = useAppData();
  const [viewMode, setViewMode] = useState("list");
  const [search, setSearch] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [detailAssetId, setDetailAssetId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(defaultForm);

  const filteredAssets = useMemo(() => {
    const normalizedSearch = normalizeText(search);
    return assets
      .slice()
      .sort((left, right) => left.name.localeCompare(right.name))
      .filter((asset) =>
        !normalizedSearch
          ? true
          : [asset.name, asset.type, asset.owner, asset.status, asset.location, asset.serial]
              .some((field) => normalizeText(field).includes(normalizedSearch)),
      );
  }, [assets, search]);

  const kanbanColumns = useMemo(
    () =>
      assetStatuses.map((status) => ({
        status,
        assets: filteredAssets.filter((asset) => asset.status === status),
      })),
    [filteredAssets],
  );

  const detailAsset = assets.find((asset) => asset.id === detailAssetId) ?? null;

  useEffect(() => {
    if (!detailAsset) return;
    setEditingId(detailAsset.id);
    setForm(detailAsset);
  }, [detailAsset]);

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

    setShowCreateModal(false);
    setDetailAssetId(null);
    resetForm();
  };

  const openCreateModal = () => {
    resetForm();
    setShowCreateModal(true);
  };

  const openDetailModal = (asset) => {
    setDetailAssetId(asset.id);
  };

  return (
    <div className="users-page">
      <section className="module-hero board-card">
        <div>
          <span className="eyebrow">Ativos</span>
          <h2>Inventario com visao em lista ou kanban, criticidade destacada e cadastro completo em popup.</h2>
        </div>
        <div className="insight-strip">
          <div className="insight-chip">
            <strong>{filteredAssets.length}</strong>
            <span>ativos no recorte</span>
          </div>
          <div className="insight-chip">
            <strong>{filteredAssets.filter((asset) => asset.status === "Ativo").length}</strong>
            <span>em operacao</span>
          </div>
          <div className="insight-chip">
            <strong>{filteredAssets.filter((asset) => asset.criticality === "Alta").length}</strong>
            <span>alta criticidade</span>
          </div>
        </div>
      </section>

      <section className="board-card glpi-panel">
        <div className="glpi-toolbar">
          <div>
            <h2>Ativos cadastrados</h2>
            <span>Duplo clique abre o cadastro completo.</span>
          </div>
          <div className="toolbar">
            <div className="view-toggle">
              <button
                className={`filter-pill interactive-button${viewMode === "list" ? " is-active" : ""}`}
                onClick={() => setViewMode("list")}
                type="button"
              >
                Lista
              </button>
              <button
                className={`filter-pill interactive-button${viewMode === "kanban" ? " is-active" : ""}`}
                onClick={() => setViewMode("kanban")}
                type="button"
              >
                Kanban
              </button>
            </div>
            <button className="primary-button interactive-button" onClick={openCreateModal} type="button">
              + Novo ativo
            </button>
          </div>
        </div>

        <div className="toolbar glpi-filter-bar glpi-toolbar-stack">
          <input
            className="toolbar-search"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome, responsavel, localizacao ou serial"
            value={search}
          />
        </div>

        {viewMode === "list" ? (
          <div className="user-list">
            {filteredAssets.map((asset) => (
              <button
                className={`table-row asset-row interactive-button ${getAssetPriorityClass(asset.criticality)}`}
                key={asset.id}
                onDoubleClick={() => openDetailModal(asset)}
                type="button"
              >
                <div className="user-row-main">
                  <div>
                    <strong>{asset.name}</strong>
                    <span>
                      {asset.type} | {asset.location}
                    </span>
                  </div>
                  <div className="row-stats row-stats-wrap">
                    <span>{asset.owner}</span>
                    <span>{asset.status}</span>
                    <span>{asset.criticality}</span>
                    <span>{asset.serial}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="kanban-grid">
            {kanbanColumns.map((column) => (
              <section className="kanban-column" key={column.status}>
                <div className="kanban-column-header">
                  <strong>{column.status}</strong>
                  <span>{column.assets.length}</span>
                </div>
                <div className="kanban-column-body">
                  {column.assets.map((asset) => (
                    <button
                      className={`kanban-card interactive-button ${getAssetPriorityClass(asset.criticality)}`}
                      key={asset.id}
                      onDoubleClick={() => openDetailModal(asset)}
                      type="button"
                    >
                      <div className="ticket-top">
                        <strong>{asset.name}</strong>
                        <span className="badge badge-neutral">{asset.criticality}</span>
                      </div>
                      <h3>{asset.type}</h3>
                      <div className="ticket-meta">
                        <span>{asset.owner}</span>
                        <span>{asset.location}</span>
                        <span>{asset.serial}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </section>

      {showCreateModal ? (
        <div className="ticket-modal-backdrop" onClick={() => setShowCreateModal(false)} role="presentation">
          <div className="ticket-modal board-card" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <form className="ticket-create-form glpi-ticket-form" onSubmit={handleSubmit}>
              <div className="ticket-modal-header">
                <div className="form-section-header">
                  <strong>Novo ativo</strong>
                  <span>Cadastro de infraestrutura, software e itens de sustentacao.</span>
                </div>
                <button className="ghost-button interactive-button" onClick={() => setShowCreateModal(false)} type="button">
                  Fechar
                </button>
              </div>
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
                  <UserAutocomplete
                    onChange={(nextValue) => setForm((current) => ({ ...current, owner: nextValue }))}
                    placeholder="Comece a digitar um usuario"
                    users={users}
                    value={form.owner}
                  />
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
                  Cadastrar ativo
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {detailAsset ? (
        <div className="ticket-modal-backdrop" onClick={() => setDetailAssetId(null)} role="presentation">
          <div
            className="ticket-modal ticket-modal-large board-card"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <form className="ticket-detail-form" onSubmit={handleSubmit}>
              <div className="ticket-modal-header">
                <div>
                  <h2>{detailAsset.name}</h2>
                  <span className="modal-subtitle">
                    {detailAsset.type} | {detailAsset.location}
                  </span>
                </div>
                <div className="ticket-detail-actions">
                  <button className="ghost-button interactive-button" onClick={() => setDetailAssetId(null)} type="button">
                    Fechar
                  </button>
                  <button
                    className="danger-button interactive-button"
                    onClick={() => {
                      deleteAsset(detailAsset.id);
                      setDetailAssetId(null);
                      pushToast("Ativo removido", detailAsset.name);
                    }}
                    type="button"
                  >
                    Excluir
                  </button>
                </div>
              </div>
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
                  <UserAutocomplete
                    onChange={(nextValue) => setForm((current) => ({ ...current, owner: nextValue }))}
                    placeholder="Comece a digitar um usuario"
                    users={users}
                    value={form.owner}
                  />
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
                  Salvar ativo
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default AssetsPage;
