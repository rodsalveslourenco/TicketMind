import { useEffect, useMemo, useState } from "react";
import CatalogAutocomplete from "../components/CatalogAutocomplete";
import UserAutocomplete from "../components/UserAutocomplete";
import { useAppData } from "../data/AppDataContext";

const assetTypes = [
  "Notebook",
  "Desktop",
  "Celular",
  "Servidor",
  "Firewall",
  "Switch",
  "DVR",
  "NVR",
  "Camera",
  "Monitor",
  "Cabo de rede",
  "Suporte para notebook",
  "Aplicacao",
  "Com fio",
  "Sem fio",
];

const assetStatuses = ["Ativo", "Monitorado", "Manutencao", "Baixado"];

const defaultForm = {
  name: "",
  type: "Notebook",
  brandId: "",
  manufacturer: "",
  modelId: "",
  model: "",
  owner: "",
  status: "Ativo",
  criticality: "Media",
  location: "",
  serial: "",
  assetTag: "",
  ram: "",
  storage: "",
  processor: "",
  imei: "",
  phoneLine: "",
  technicalSpec: "",
};

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getAssetPriorityClass(criticality) {
  const normalized = normalizeText(criticality);
  if (normalized === "alta") return "priority-line-critica";
  if (normalized === "baixa") return "priority-line-baixa";
  return "priority-line-media";
}

function isComputerType(type) {
  const normalized = normalizeText(type);
  return normalized === "notebook" || normalized === "desktop";
}

function isPhoneType(type) {
  return normalizeText(type) === "celular";
}

function mapAssetTypeToCatalog(type) {
  const normalized = normalizeText(type);
  if (normalized === "notebook") return "Notebook";
  if (normalized === "desktop") return "Desktop";
  if (normalized === "celular") return "Celular";
  return "Outros";
}

function getAssetConfiguration(asset) {
  const ram = asset.ram ? `${asset.ram} RAM` : "";
  const storage = asset.storage || "";
  const processor = asset.processor || "";

  if (isComputerType(asset.type)) {
    return [ram, storage, processor].filter(Boolean).join(" / ") || "Configuracao nao informada";
  }

  if (isPhoneType(asset.type)) {
    return [asset.storage || "", ram].filter(Boolean).join(" / ") || "Configuracao nao informada";
  }

  return asset.technicalSpec || asset.type || "Configuracao nao informada";
}

function buildHierarchyGroups(assets, level) {
  const buckets = new Map();

  assets.forEach((asset) => {
    const key =
      level === "manufacturer"
        ? asset.manufacturer || "Nao informado"
        : level === "model"
          ? asset.model || "Nao informado"
          : getAssetConfiguration(asset);

    if (!buckets.has(key)) {
      buckets.set(key, { key, quantity: 0, assets: [] });
    }

    const bucket = buckets.get(key);
    bucket.quantity += 1;
    bucket.assets.push(asset);
  });

  return Array.from(buckets.values()).sort((left, right) => left.key.localeCompare(right.key));
}

function AssetsPage() {
  const { addAsset, assets, brands, deleteAsset, models, pushToast, updateAsset, users } = useAppData();
  const [search, setSearch] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [detailAssetId, setDetailAssetId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [path, setPath] = useState({ manufacturer: "", model: "", configuration: "" });

  const normalizedAssets = useMemo(
    () =>
      assets.map((asset) => ({
        ...defaultForm,
        ...asset,
        brandId:
          asset.brandId ||
          brands.find(
            (brand) =>
              brand.name === asset.manufacturer &&
              brand.assetType === mapAssetTypeToCatalog(asset.type),
          )?.id ||
          "",
        modelId:
          asset.modelId ||
          models.find(
            (model) =>
              model.name === asset.model &&
              model.brandName === asset.manufacturer &&
              model.assetType === mapAssetTypeToCatalog(asset.type),
          )?.id ||
          "",
        manufacturer: asset.manufacturer || "",
        model: asset.model || "",
        ram: asset.ram || "",
        storage: asset.storage || "",
        processor: asset.processor || "",
        technicalSpec: asset.technicalSpec || "",
      })),
    [assets, brands, models],
  );

  const catalogAssetType = mapAssetTypeToCatalog(form.type);
  const availableBrands = useMemo(
    () =>
      brands.filter((brand) => brand.status === "Ativo" && brand.assetType === catalogAssetType),
    [brands, catalogAssetType],
  );

  const availableModels = useMemo(
    () =>
      models.filter(
        (model) =>
          model.status === "Ativo" &&
          model.assetType === catalogAssetType &&
          model.brandId === form.brandId,
      ),
    [catalogAssetType, form.brandId, models],
  );

  const filteredAssets = useMemo(() => {
    const normalizedSearch = normalizeText(search);
    return normalizedAssets
      .slice()
      .sort((left, right) => left.name.localeCompare(right.name))
      .filter((asset) =>
        !normalizedSearch
          ? true
          : [
              asset.name,
              asset.type,
              asset.manufacturer,
              asset.model,
              asset.owner,
              asset.status,
              asset.location,
              asset.serial,
              asset.assetTag,
              asset.imei,
              asset.phoneLine,
              getAssetConfiguration(asset),
            ].some((field) => normalizeText(field).includes(normalizedSearch)),
      );
  }, [normalizedAssets, search]);

  const detailAsset = filteredAssets.find((asset) => asset.id === detailAssetId) ?? null;

  useEffect(() => {
    if (!detailAsset) return;
    setEditingId(detailAsset.id);
    setForm({ ...defaultForm, ...detailAsset });
  }, [detailAsset]);

  const currentAssets = useMemo(() => {
    let current = filteredAssets;
    if (path.manufacturer) {
      current = current.filter(
        (asset) => (asset.manufacturer || "Nao informado") === path.manufacturer,
      );
    }
    if (path.model) {
      current = current.filter((asset) => (asset.model || "Nao informado") === path.model);
    }
    if (path.configuration) {
      current = current.filter((asset) => getAssetConfiguration(asset) === path.configuration);
    }
    return current;
  }, [filteredAssets, path]);

  const hierarchyLevel = !path.manufacturer
    ? "manufacturer"
    : !path.model
      ? "model"
      : !path.configuration
        ? "configuration"
        : "serial";

  const hierarchyGroups = useMemo(() => {
    if (hierarchyLevel === "serial") return [];
    return buildHierarchyGroups(currentAssets, hierarchyLevel);
  }, [currentAssets, hierarchyLevel]);

  const updateField = (field) => (event) => {
    const nextValue = event.target.value;
    setForm((current) => ({
      ...current,
      ...(field === "type" ? { brandId: "", manufacturer: "", modelId: "", model: "" } : {}),
      [field]: nextValue,
    }));
  };

  const resetForm = () => {
    setForm(defaultForm);
    setEditingId(null);
  };

  const buildPayload = () => {
    const payload = {
      ...form,
      name: form.name.trim(),
      brandId: form.brandId,
      manufacturer: form.manufacturer.trim(),
      modelId: form.modelId,
      model: form.model.trim(),
      owner: form.owner.trim(),
      location: form.location.trim(),
      serial: form.serial.trim(),
      assetTag: form.assetTag.trim(),
      ram: form.ram.trim(),
      storage: form.storage.trim(),
      processor: form.processor.trim(),
      imei: form.imei.trim(),
      phoneLine: form.phoneLine.trim(),
      technicalSpec: form.technicalSpec.trim(),
    };

    if (isComputerType(payload.type)) {
      payload.imei = "";
      payload.phoneLine = "";
    } else if (isPhoneType(payload.type)) {
      payload.processor = "";
    } else {
      payload.ram = "";
      payload.storage = "";
      payload.processor = "";
      payload.imei = "";
      payload.phoneLine = "";
    }

    return payload;
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!form.name || !form.type || !form.manufacturer || !form.model || !form.owner || !form.serial) {
      pushToast("Campos obrigatorios", "Preencha nome, tipo, marca, modelo, usuario e numero de serie.", "warning");
      return;
    }

    const payload = buildPayload();
    const selectedBrand = brands.find(
      (brand) =>
        brand.id === payload.brandId &&
        brand.status === "Ativo" &&
        brand.assetType === mapAssetTypeToCatalog(payload.type),
    );
    if (!selectedBrand || selectedBrand.name !== payload.manufacturer) {
      pushToast("Marca invalida", "Selecione uma marca existente e compativel com o tipo do ativo.", "warning");
      return;
    }

    const selectedModel = models.find(
      (model) =>
        model.id === payload.modelId &&
        model.status === "Ativo" &&
        model.assetType === mapAssetTypeToCatalog(payload.type) &&
        model.brandId === payload.brandId,
    );
    if (!selectedModel || selectedModel.name !== payload.model) {
      pushToast("Modelo invalido", "Selecione um modelo existente e vinculado a marca escolhida.", "warning");
      return;
    }

    const serialConflict = normalizedAssets.find(
      (asset) => normalizeText(asset.serial) === normalizeText(payload.serial) && asset.id !== editingId,
    );
    if (serialConflict) {
      pushToast("Numero de serie duplicado", serialConflict.serial, "warning");
      return;
    }

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

  const setManufacturer = (manufacturer) => setPath({ manufacturer, model: "", configuration: "" });
  const setModel = (model) => setPath((current) => ({ ...current, model, configuration: "" }));
  const setConfiguration = (configuration) => setPath((current) => ({ ...current, configuration }));

  const breadcrumb = [
    { label: "Fabricantes", action: () => setPath({ manufacturer: "", model: "", configuration: "" }), active: !path.manufacturer },
    path.manufacturer ? { label: path.manufacturer, action: () => setPath((current) => ({ ...current, model: "", configuration: "" })) } : null,
    path.model ? { label: path.model, action: () => setPath((current) => ({ ...current, configuration: "" })) } : null,
    path.configuration ? { label: path.configuration, action: () => setPath((current) => ({ ...current })) } : null,
  ].filter(Boolean);

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
            <span>ativos individuais</span>
          </div>
          <div className="insight-chip">
            <strong>{new Set(filteredAssets.map((asset) => asset.manufacturer || "Nao informado")).size}</strong>
            <span>fabricantes</span>
          </div>
          <div className="insight-chip">
            <strong>{currentAssets.length}</strong>
            <span>itens no nivel atual</span>
          </div>
        </div>
      </section>

      <section className="module-grid">
        <section className="board-card glpi-panel">
          <div className="glpi-toolbar">
            <div>
              <h2>Navegacao de ativos</h2>
            </div>
            <div className="toolbar">
              <input
                className="toolbar-search"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por fabricante, modelo, configuracao, patrimonio ou serie"
                value={search}
              />
              <button className="primary-button interactive-button" onClick={openCreateModal} type="button">
                + Novo ativo
              </button>
            </div>
          </div>

          <div className="hierarchy-breadcrumb">
            {breadcrumb.map((item, index) => (
              <button
                className={`ghost-link hierarchy-link${item.active ? " is-active" : ""}`}
                key={`${item.label}-${index}`}
                onClick={item.action}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>

          {hierarchyLevel !== "serial" ? (
            <div className="hierarchy-grid">
              {hierarchyGroups.map((group) => (
                <button
                  className="record-card hierarchy-card interactive-button"
                  key={group.key}
                  onClick={() => {
                    if (hierarchyLevel === "manufacturer") setManufacturer(group.key);
                    if (hierarchyLevel === "model") setModel(group.key);
                    if (hierarchyLevel === "configuration") setConfiguration(group.key);
                  }}
                  type="button"
                >
                  <strong>{group.key}</strong>
                  <span>{group.quantity} item(ns)</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="user-list">
              {currentAssets.map((asset) => (
                <button
                  className={`table-row asset-row interactive-button ${getAssetPriorityClass(asset.criticality)}`}
                  key={asset.id}
                  onDoubleClick={() => openDetailModal(asset)}
                  type="button"
                >
                  <div className="user-row-main">
                    <div>
                      <strong>{asset.serial}</strong>
                      <span>{asset.name} | {asset.location}</span>
                    </div>
                    <div className="row-stats row-stats-wrap">
                      <span>{asset.owner}</span>
                      <span>{asset.status}</span>
                      <span>{asset.assetTag || "-"}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="board-card glpi-panel">
          <div className="glpi-toolbar">
            <div>
              <h2>Detalhamento do nivel</h2>
            </div>
          </div>

          <div className="insight-strip insight-strip-single">
            <div className="insight-chip">
              <strong>{currentAssets.length}</strong>
              <span>quantidade total do agrupamento</span>
            </div>
          </div>

          <div className="user-list">
            {currentAssets.map((asset) => (
              <button
                className={`table-row asset-row interactive-button ${getAssetPriorityClass(asset.criticality)}`}
                key={asset.id}
                onDoubleClick={() => openDetailModal(asset)}
                type="button"
              >
                <div className="user-row-main">
                  <div>
                    <strong>{asset.manufacturer} | {asset.model}</strong>
                    <span>{getAssetConfiguration(asset)}</span>
                  </div>
                  <div className="row-stats row-stats-wrap">
                    <span>{asset.type}</span>
                    <span>{asset.owner}</span>
                    <span>{asset.serial}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
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
                <label className="field-block">
                  <span>Marca</span>
                  <CatalogAutocomplete
                    getDescription={(item) => item.assetType}
                    getLabel={(item) => item.name}
                    items={availableBrands}
                    onChange={(nextValue) =>
                      setForm((current) => ({
                        ...current,
                        manufacturer: nextValue,
                        brandId: "",
                        model: "",
                        modelId: "",
                      }))
                    }
                    onSelect={(item) =>
                      setForm((current) => ({
                        ...current,
                        brandId: item.id,
                        manufacturer: item.name,
                        model: "",
                        modelId: "",
                      }))
                    }
                    placeholder="Digite para buscar a marca"
                    value={form.manufacturer}
                  />
                </label>
                <label className="field-block">
                  <span>Modelo</span>
                  <CatalogAutocomplete
                    disabled={!form.brandId}
                    getDescription={(item) => `${item.brandName} | ${item.assetType}`}
                    getLabel={(item) => item.name}
                    items={availableModels}
                    onChange={(nextValue) =>
                      setForm((current) => ({
                        ...current,
                        model: nextValue,
                        modelId: "",
                      }))
                    }
                    onSelect={(item) =>
                      setForm((current) => ({
                        ...current,
                        modelId: item.id,
                        model: item.name,
                      }))
                    }
                    placeholder={form.brandId ? "Digite para buscar o modelo" : "Selecione a marca primeiro"}
                    value={form.model}
                  />
                </label>
                <label className="field-block field-full">
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
                    {assetStatuses.map((status) => (
                      <option key={status}>{status}</option>
                    ))}
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
                  <span>Numero de serie</span>
                  <input onChange={updateField("serial")} value={form.serial} />
                </label>
                <label className="field-block">
                  <span>Patrimonio</span>
                  <input onChange={updateField("assetTag")} value={form.assetTag} />
                </label>

                {isComputerType(form.type) ? (
                  <>
                    <label className="field-block">
                      <span>Memoria RAM</span>
                      <input onChange={updateField("ram")} value={form.ram} />
                    </label>
                    <label className="field-block">
                      <span>Armazenamento</span>
                      <input onChange={updateField("storage")} value={form.storage} />
                    </label>
                    <label className="field-block">
                      <span>Processador</span>
                      <input onChange={updateField("processor")} value={form.processor} />
                    </label>
                  </>
                ) : null}

                {isPhoneType(form.type) ? (
                  <>
                    <label className="field-block">
                      <span>Memoria RAM</span>
                      <input onChange={updateField("ram")} value={form.ram} />
                    </label>
                    <label className="field-block">
                      <span>Armazenamento</span>
                      <input onChange={updateField("storage")} value={form.storage} />
                    </label>
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

                {!isComputerType(form.type) && !isPhoneType(form.type) ? (
                  <label className="field-block field-span-2">
                    <span>Especificacao tecnica</span>
                    <input onChange={updateField("technicalSpec")} value={form.technicalSpec} />
                  </label>
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
