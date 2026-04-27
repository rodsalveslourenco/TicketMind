import { useEffect, useMemo, useState } from "react";
import UserAutocomplete from "../components/UserAutocomplete";
import { useAppData } from "../data/AppDataContext";

const assetTypes = [
  "Servidor",
  "Firewall",
  "Switch",
  "Aplicacao",
  "Notebook",
  "Celular",
  "DVR",
  "NVR",
  "Camera",
  "Cabo de rede",
  "Monitor",
  "Suporte para notebook",
  "Mouse com fio",
  "Mouse sem fio",
  "Teclado com fio",
  "Teclado sem fio",
];

const defaultForm = {
  name: "",
  type: "Servidor",
  owner: "",
  status: "Ativo",
  criticality: "Media",
  location: "",
  serial: "",
  assetTag: "",
  stockQuantity: 1,
  availableQuantity: 1,
  movementStatus: "Em estoque",
  entryDate: "",
  deliveryDate: "",
  imei: "",
  phoneLine: "",
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
          : [
              asset.name,
              asset.type,
              asset.owner,
              asset.status,
              asset.location,
              asset.serial,
              asset.imei,
              asset.phoneLine,
            ].some((field) => normalizeText(field).includes(normalizedSearch)),
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
  const isPhoneType = form.type === "Celular";

  useEffect(() => {
    if (!detailAsset) return;
    setEditingId(detailAsset.id);
    setForm({
      ...defaultForm,
      ...detailAsset,
      stockQuantity: detailAsset.stockQuantity ?? 1,
      availableQuantity: detailAsset.availableQuantity ?? 1,
      movementStatus: detailAsset.movementStatus || "Em estoque",
      entryDate: detailAsset.entryDate || "",
      deliveryDate: detailAsset.deliveryDate || "",
      imei: detailAsset.imei || "",
      phoneLine: detailAsset.phoneLine || "",
    });
  }, [detailAsset]);

  const updateField = (field) => (event) => {
    const nextValue = event.target.value;
    setForm((current) => ({
      ...current,
      [field]:
        field === "stockQuantity" || field === "availableQuantity" ? Number(nextValue || 0) : nextValue,
    }));
  };

  const resetForm = () => {
    setForm(defaultForm);
    setEditingId(null);
  };

  const buildPayload = () => ({
    ...form,
    imei: isPhoneType ? form.imei : "",
    phoneLine: isPhoneType ? form.phoneLine : "",
  });

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!form.name || !form.owner || !form.location) return;

    const payload = buildPayload();
    if (editingId) {
      updateAsset(editingId, payload);
      pushToast("Ativo atualizado", form.name);
    } else {
      addAsset(payload);
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
          <h2>Ativos</h2>
        </div>
        <div className="insight-strip">
          <div className="insight-chip">
            <strong>{filteredAssets.length}</strong>
            <span>ativos</span>
          </div>
          <div className="insight-chip">
            <strong>{filteredAssets.filter((asset) => asset.status === "Ativo").length}</strong>
            <span>em operacao</span>
          </div>
          <div className="insight-chip">
            <strong>{filteredAssets.reduce((total, asset) => total + Number(asset.availableQuantity || 0), 0)}</strong>
            <span>em estoque</span>
          </div>
        </div>
      </section>

      <section className="board-card glpi-panel">
        <div className="glpi-toolbar">
          <div>
            <h2>Cadastro de ativos</h2>
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
            placeholder="Buscar por nome, usuario, localizacao, serial, IMEI ou linha"
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
                    <span>{asset.assetTag || "-"}</span>
                    <span>{asset.serial}</span>
                  </div>
                </div>
                <div className="user-row-footer">
                  <div className="row-stats row-stats-wrap">
                    <span>Estoque {asset.stockQuantity || 0}</span>
                    <span>Disponivel {asset.availableQuantity || 0}</span>
                    <span>{asset.movementStatus || "Em estoque"}</span>
                  </div>
                  <div className="row-stats row-stats-wrap">
                    <span>Entrada {asset.entryDate || "-"}</span>
                    <span>Entrega {asset.deliveryDate || "-"}</span>
                    {asset.imei ? <span>IMEI {asset.imei}</span> : null}
                    {asset.phoneLine ? <span>Linha {asset.phoneLine}</span> : null}
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
                        <span>{asset.assetTag || "-"}</span>
                        <span>{asset.availableQuantity || 0} disp.</span>
                        <span>{asset.movementStatus || "Em estoque"}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </section>

      {(showCreateModal || detailAsset) ? (
        <div
          className="ticket-modal-backdrop"
          onClick={() => {
            setShowCreateModal(false);
            setDetailAssetId(null);
          }}
          role="presentation"
        >
          <div
            className="ticket-modal ticket-modal-large board-card"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <form className="ticket-detail-form" onSubmit={handleSubmit}>
              <div className="ticket-modal-header">
                <div>
                  <h2>{editingId ? form.name || "Editar ativo" : "Novo ativo"}</h2>
                </div>
                <div className="ticket-detail-actions">
                  <button
                    className="ghost-button interactive-button"
                    onClick={() => {
                      setShowCreateModal(false);
                      setDetailAssetId(null);
                    }}
                    type="button"
                  >
                    Fechar
                  </button>
                  {editingId ? (
                    <button
                      className="danger-button interactive-button"
                      onClick={() => {
                        deleteAsset(editingId);
                        setDetailAssetId(null);
                        pushToast("Ativo removido", form.name);
                      }}
                      type="button"
                    >
                      Excluir
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="glpi-form-grid">
                <label className="field-block">
                  <span>Tipo</span>
                  <select onChange={updateField("type")} value={form.type}>
                    {assetTypes.map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                </label>
                <label className="field-block field-span-2">
                  <span>Nome</span>
                  <input onChange={updateField("name")} value={form.name} />
                </label>
                <label className="field-block">
                  <span>Usuario</span>
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
                <label className="field-block">
                  <span>Serial</span>
                  <input onChange={updateField("serial")} value={form.serial} />
                </label>
                <label className="field-block">
                  <span>Patrimonio</span>
                  <input onChange={updateField("assetTag")} value={form.assetTag} />
                </label>
                <label className="field-block">
                  <span>Estoque total</span>
                  <input min="0" onChange={updateField("stockQuantity")} type="number" value={form.stockQuantity} />
                </label>
                <label className="field-block">
                  <span>Disponivel</span>
                  <input
                    min="0"
                    onChange={updateField("availableQuantity")}
                    type="number"
                    value={form.availableQuantity}
                  />
                </label>
                <label className="field-block">
                  <span>Movimentacao</span>
                  <select onChange={updateField("movementStatus")} value={form.movementStatus}>
                    <option>Em estoque</option>
                    <option>Entregue</option>
                    <option>Em manutencao</option>
                    <option>Retornado</option>
                  </select>
                </label>
                <label className="field-block">
                  <span>Data de entrada</span>
                  <input onChange={updateField("entryDate")} type="date" value={form.entryDate} />
                </label>
                <label className="field-block">
                  <span>Data de entrega</span>
                  <input onChange={updateField("deliveryDate")} type="date" value={form.deliveryDate} />
                </label>
                {isPhoneType ? (
                  <>
                    <label className="field-block">
                      <span>IMEI</span>
                      <input onChange={updateField("imei")} value={form.imei} />
                    </label>
                    <label className="field-block">
                      <span>N da Linha</span>
                      <input onChange={updateField("phoneLine")} value={form.phoneLine} />
                    </label>
                  </>
                ) : null}
              </div>
              <div className="ticket-create-actions">
                <button className="primary-button interactive-button" type="submit">
                  {editingId ? "Salvar ativo" : "Cadastrar ativo"}
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
