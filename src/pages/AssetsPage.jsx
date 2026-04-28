import { useEffect, useMemo, useState } from "react";
import CatalogAutocomplete from "../components/CatalogAutocomplete";
import UserAutocomplete from "../components/UserAutocomplete";
import { useAuth } from "../auth/AuthContext";
import { hasAnyPermission } from "../data/permissions";
import { useAppData } from "../data/AppDataContext";
import { assetTypeOptions } from "../data/assetCatalog";

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

const defaultQuickCatalogForm = {
  assetType: "Notebook",
  brandName: "",
  modelName: "",
  status: "Ativo",
};

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function resolveAssetType(type) {
  const normalized = normalizeText(type);
  return assetTypeOptions.find((item) => normalizeText(item) === normalized) || "Outros";
}

function findBrandByTypeAndName(brands, assetType, brandId, manufacturer) {
  if (brandId) {
    const brandById = brands.find(
      (brand) => brand.id === brandId && brand.status === "Ativo" && brand.assetType === assetType,
    );
    if (brandById) return brandById;
  }

  return (
    brands.find(
      (brand) =>
        brand.status === "Ativo" &&
        brand.assetType === assetType &&
        normalizeText(brand.name) === normalizeText(manufacturer),
    ) || null
  );
}

function findModelByTypeBrandAndName(models, assetType, brandId, modelId, modelName) {
  if (modelId) {
    const modelById = models.find(
      (model) =>
        model.id === modelId &&
        model.status === "Ativo" &&
        model.assetType === assetType &&
        model.brandId === brandId,
    );
    if (modelById) return modelById;
  }

  return (
    models.find(
      (model) =>
        model.status === "Ativo" &&
        model.assetType === assetType &&
        model.brandId === brandId &&
        normalizeText(model.name) === normalizeText(modelName),
    ) || null
  );
}

function isComputerType(type) {
  const normalized = normalizeText(type);
  return normalized === "notebook" || normalized === "desktop";
}

function isPhoneType(type) {
  return normalizeText(type) === "celular";
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

function getAssetPriorityClass(criticality) {
  const normalized = normalizeText(criticality);
  if (normalized === "alta") return "priority-line-critica";
  if (normalized === "baixa") return "priority-line-baixa";
  return "priority-line-media";
}

function buildHierarchyRows(assets, level) {
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
  const { user } = useAuth();
  const {
    addAsset,
    addBrand,
    addModel,
    assets,
    brands,
    deleteAsset,
    models,
    pushToast,
    updateAsset,
    users,
  } = useAppData();
  const [search, setSearch] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showQuickCatalogModal, setShowQuickCatalogModal] = useState(false);
  const [detailAssetId, setDetailAssetId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [quickCatalogForm, setQuickCatalogForm] = useState(defaultQuickCatalogForm);
  const [path, setPath] = useState({ manufacturer: "", model: "", configuration: "" });
  const canCreateAsset = hasAnyPermission(user, ["assets_create", "assets_admin"]);
  const canEditAsset = hasAnyPermission(user, ["assets_edit", "assets_admin"]);
  const canDeleteAsset = hasAnyPermission(user, ["assets_delete", "assets_admin"]);
  const canMoveAsset = hasAnyPermission(user, ["assets_move", "assets_admin"]);
  const canLinkAssetUsers = hasAnyPermission(user, ["assets_link_users", "assets_admin"]);
  const canCreateBrandsModels = hasAnyPermission(user, ["brands_models_create", "brands_models_admin"]);

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
              brand.assetType === resolveAssetType(asset.type),
          )?.id ||
          "",
        modelId:
          asset.modelId ||
          models.find(
            (model) =>
              model.name === asset.model &&
              model.brandName === asset.manufacturer &&
              model.assetType === resolveAssetType(asset.type),
          )?.id ||
          "",
      })),
    [assets, brands, models],
  );

  const catalogAssetType = resolveAssetType(form.type);

  const availableBrands = useMemo(
    () =>
      brands.filter((brand) => brand.status === "Ativo" && brand.assetType === catalogAssetType),
    [brands, catalogAssetType],
  );

  const resolvedBrandId =
    form.brandId ||
    findBrandByTypeAndName(brands, catalogAssetType, "", form.manufacturer)?.id ||
    "";

  const availableModels = useMemo(
    () =>
      models.filter(
        (model) =>
          model.status === "Ativo" &&
          model.assetType === catalogAssetType &&
          model.brandId === resolvedBrandId,
      ),
    [catalogAssetType, models, resolvedBrandId],
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
    if (path.manufacturer) current = current.filter((asset) => asset.manufacturer === path.manufacturer);
    if (path.model) current = current.filter((asset) => asset.model === path.model);
    if (path.configuration) current = current.filter((asset) => getAssetConfiguration(asset) === path.configuration);
    return current;
  }, [filteredAssets, path]);

  const hierarchyLevel = !path.manufacturer
    ? "manufacturer"
    : !path.model
      ? "model"
      : !path.configuration
        ? "configuration"
        : "serial";

  const hierarchyRows = useMemo(() => {
    if (hierarchyLevel === "serial") return [];
    return buildHierarchyRows(currentAssets, hierarchyLevel);
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

  const resetQuickCatalogForm = (assetType = catalogAssetType) => {
    setQuickCatalogForm({
      ...defaultQuickCatalogForm,
      assetType: assetType || "Notebook",
    });
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
    const assetType = resolveAssetType(payload.type);
    const selectedBrand = findBrandByTypeAndName(
      brands,
      assetType,
      payload.brandId,
      payload.manufacturer,
    );
    if (!selectedBrand || selectedBrand.name !== payload.manufacturer) {
      pushToast("Marca invalida", "Selecione uma marca existente e compativel com o tipo do ativo.", "warning");
      return;
    }

    const selectedModel = findModelByTypeBrandAndName(
      models,
      assetType,
      selectedBrand.id,
      payload.modelId,
      payload.model,
    );
    if (!selectedModel || selectedModel.name !== payload.model) {
      pushToast("Modelo invalido", "Selecione um modelo existente e vinculado a marca escolhida.", "warning");
      return;
    }

    payload.brandId = selectedBrand.id;
    payload.manufacturer = selectedBrand.name;
    payload.modelId = selectedModel.id;
    payload.model = selectedModel.name;

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

  const handleQuickCatalogField = (field) => (event) => {
    setQuickCatalogForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const handleQuickCatalogSubmit = (event) => {
    event.preventDefault();
    const brandName = quickCatalogForm.brandName.trim();
    const modelName = quickCatalogForm.modelName.trim();

    if (!brandName || !modelName) {
      pushToast("Dados obrigatorios", "Informe tipo, marca e modelo.", "warning");
      return;
    }

    let resolvedBrand = brands.find(
      (brand) =>
        normalizeText(brand.name) === normalizeText(brandName) &&
        brand.assetType === quickCatalogForm.assetType,
    );

    if (!resolvedBrand) {
      resolvedBrand = addBrand({
        name: brandName,
        assetType: quickCatalogForm.assetType,
        status: quickCatalogForm.status,
      });
    }

    let resolvedModel = models.find(
      (model) =>
        model.brandId === resolvedBrand.id &&
        model.assetType === quickCatalogForm.assetType &&
        normalizeText(model.name) === normalizeText(modelName),
    );

    if (!resolvedModel) {
      resolvedModel = addModel({
        brandId: resolvedBrand.id,
        brandName: resolvedBrand.name,
        name: modelName,
        assetType: quickCatalogForm.assetType,
        status: quickCatalogForm.status,
      });
    }

    setForm((current) => ({
      ...current,
      type: quickCatalogForm.assetType,
      brandId: resolvedBrand.id,
      manufacturer: resolvedBrand.name,
      modelId: resolvedModel.id,
      model: resolvedModel.name,
    }));

    pushToast("Marca e modelo cadastrados", `${resolvedBrand.name} | ${resolvedModel.name}`);
    setShowQuickCatalogModal(false);
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
            <span>ativos individuais</span>
          </div>
          <div className="insight-chip">
            <strong>{currentAssets.length}</strong>
            <span>itens no recorte</span>
          </div>
          <div className="insight-chip">
            <strong>{hierarchyLevel === "serial" ? currentAssets.length : hierarchyRows.length}</strong>
            <span>linhas no nivel</span>
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
                placeholder="Buscar por tipo, marca, modelo, patrimonio ou serie"
                value={search}
              />
              {canCreateAsset ? (
                <button
                  className="primary-button compact-button interactive-button"
                  onClick={() => {
                    resetForm();
                    setShowCreateModal(true);
                  }}
                  type="button"
                >
                  + Novo ativo
                </button>
              ) : null}
            </div>
          </div>

          <div className="hierarchy-breadcrumb">
            <button className="ghost-link hierarchy-link" onClick={() => setPath({ manufacturer: "", model: "", configuration: "" })} type="button">
              Fabricantes
            </button>
            {path.manufacturer ? (
              <button className="ghost-link hierarchy-link" onClick={() => setPath((current) => ({ ...current, model: "", configuration: "" }))} type="button">
                {path.manufacturer}
              </button>
            ) : null}
            {path.model ? (
              <button className="ghost-link hierarchy-link" onClick={() => setPath((current) => ({ ...current, configuration: "" }))} type="button">
                {path.model}
              </button>
            ) : null}
            {path.configuration ? <span className="ghost-link hierarchy-link is-active">{path.configuration}</span> : null}
          </div>

          <div className="sheet-list">
            {hierarchyLevel !== "serial" ? (
              <>
                <div className="sheet-row sheet-row-header">
                  <strong>Nivel</strong>
                  <strong>Quantidade</strong>
                  <strong>Abrir</strong>
                </div>
                {hierarchyRows.map((row) => (
                  <button
                    className="sheet-row interactive-button"
                    key={row.key}
                    onClick={() => {
                      if (hierarchyLevel === "manufacturer") setPath({ manufacturer: row.key, model: "", configuration: "" });
                      if (hierarchyLevel === "model") setPath((current) => ({ ...current, model: row.key, configuration: "" }));
                      if (hierarchyLevel === "configuration") setPath((current) => ({ ...current, configuration: row.key }));
                    }}
                    type="button"
                  >
                    <strong>{row.key}</strong>
                    <span>{row.quantity} item(ns)</span>
                    <span>Visualizar</span>
                  </button>
                ))}
              </>
            ) : (
              <>
                <div className="sheet-row sheet-row-header">
                  <strong>Serie</strong>
                  <strong>Nome</strong>
                  <strong>Usuario</strong>
                  <strong>Status</strong>
                  <strong>Patrimonio</strong>
                  <strong>Abrir</strong>
                </div>
                {currentAssets.map((asset) => (
                  <button
                    className={`sheet-row interactive-button ${getAssetPriorityClass(asset.criticality)}`}
                    key={asset.id}
                    onDoubleClick={() => setDetailAssetId(asset.id)}
                    type="button"
                  >
                    <strong>{asset.serial}</strong>
                    <span>{asset.name}</span>
                    <span>{asset.owner}</span>
                    <span>{asset.status}</span>
                    <span>{asset.assetTag || "-"}</span>
                    <span>Detalhar</span>
                  </button>
                ))}
              </>
            )}
          </div>
        </section>

        <section className="board-card glpi-panel">
          <div className="glpi-toolbar">
            <div>
              <h2>Detalhamento do nivel</h2>
            </div>
          </div>

          <div className="sheet-list">
            <div className="sheet-row sheet-row-header">
              <strong>Tipo</strong>
              <strong>Marca</strong>
              <strong>Modelo</strong>
              <strong>Configuracao</strong>
              <strong>Serie</strong>
              <strong>Usuario</strong>
            </div>
            {currentAssets.map((asset) => (
              <button
                className={`sheet-row interactive-button ${getAssetPriorityClass(asset.criticality)}`}
                key={`detail-${asset.id}`}
                onDoubleClick={() => setDetailAssetId(asset.id)}
                type="button"
              >
                <span>{asset.type}</span>
                <span>{asset.manufacturer}</span>
                <span>{asset.model}</span>
                <span>{getAssetConfiguration(asset)}</span>
                <span>{asset.serial}</span>
                <span>{asset.owner}</span>
              </button>
            ))}
          </div>
        </section>
      </section>

      {(showCreateModal || detailAsset) ? (
        <div className="ticket-modal-backdrop" onClick={() => { setShowCreateModal(false); setDetailAssetId(null); }} role="presentation">
          <div className="ticket-modal ticket-modal-large board-card" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <form className="ticket-detail-form" onSubmit={handleSubmit}>
              <div className="ticket-modal-header">
                <div>
                  <h2>{editingId ? form.name || "Editar ativo" : "Novo ativo"}</h2>
                </div>
                <div className="ticket-detail-actions">
                  <button className="ghost-button compact-button interactive-button" onClick={() => { setShowCreateModal(false); setDetailAssetId(null); }} type="button">
                    Fechar
                  </button>
                  {editingId && canDeleteAsset ? (
                    <button
                      className="danger-button compact-button interactive-button"
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

              <div className="glpi-form-grid compact-form-grid">
                <label className="field-block">
                  <span>Tipo</span>
                  <select disabled={!canEditAsset && Boolean(editingId)} onChange={updateField("type")} value={form.type}>
                    {assetTypeOptions.filter((type) => type !== "Outros").map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                </label>
                <label className="field-block">
                  <span>Marca</span>
                  <div className="inline-field-actions">
                    <CatalogAutocomplete
                      disabled={!canEditAsset && Boolean(editingId)}
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
                    {canCreateBrandsModels ? (
                      <button
                        className="ghost-button compact-button interactive-button"
                        onClick={() => {
                          resetQuickCatalogForm(resolveAssetType(form.type));
                          setShowQuickCatalogModal(true);
                        }}
                        type="button"
                      >
                        +
                      </button>
                    ) : null}
                  </div>
                </label>
                <label className="field-block">
                  <span>Modelo</span>
                  <div className="inline-field-actions">
                    <CatalogAutocomplete
                      disabled={(!canEditAsset && Boolean(editingId)) || !resolvedBrandId}
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
                      placeholder={resolvedBrandId ? "Digite para buscar o modelo" : "Selecione a marca primeiro"}
                      value={form.model}
                    />
                    {canCreateBrandsModels ? (
                      <button
                        className="ghost-button compact-button interactive-button"
                        onClick={() => {
                          resetQuickCatalogForm(resolveAssetType(form.type));
                          setShowQuickCatalogModal(true);
                        }}
                        type="button"
                      >
                        +
                      </button>
                    ) : null}
                  </div>
                </label>
                <label className="field-block field-full">
                  <span>Nome</span>
                  <input disabled={!canEditAsset && Boolean(editingId)} onChange={updateField("name")} value={form.name} />
                </label>
                <label className="field-block">
                  <span>Usuario</span>
                  <UserAutocomplete
                    disabled={!canLinkAssetUsers && Boolean(editingId)}
                    onChange={(nextValue) => setForm((current) => ({ ...current, owner: nextValue }))}
                    placeholder="Comece a digitar um usuario"
                    users={users}
                    value={form.owner}
                  />
                </label>
                <label className="field-block">
                  <span>Status</span>
                  <select disabled={!canEditAsset && Boolean(editingId)} onChange={updateField("status")} value={form.status}>
                    {assetStatuses.map((status) => (
                      <option key={status}>{status}</option>
                    ))}
                  </select>
                </label>
                <label className="field-block">
                  <span>Criticidade</span>
                  <select disabled={!canEditAsset && Boolean(editingId)} onChange={updateField("criticality")} value={form.criticality}>
                    <option>Baixa</option>
                    <option>Media</option>
                    <option>Alta</option>
                  </select>
                </label>
                <label className="field-block">
                  <span>Localizacao</span>
                  <input disabled={!canMoveAsset && Boolean(editingId)} onChange={updateField("location")} value={form.location} />
                </label>
                <label className="field-block">
                  <span>Numero de serie</span>
                  <input disabled={!canEditAsset && Boolean(editingId)} onChange={updateField("serial")} value={form.serial} />
                </label>
                <label className="field-block">
                  <span>Patrimonio</span>
                  <input disabled={!canEditAsset && Boolean(editingId)} onChange={updateField("assetTag")} value={form.assetTag} />
                </label>

                {isComputerType(form.type) ? (
                  <>
                    <label className="field-block">
                      <span>Memoria RAM</span>
                      <input disabled={!canEditAsset && Boolean(editingId)} onChange={updateField("ram")} value={form.ram} />
                    </label>
                    <label className="field-block">
                      <span>Armazenamento</span>
                      <input disabled={!canEditAsset && Boolean(editingId)} onChange={updateField("storage")} value={form.storage} />
                    </label>
                    <label className="field-block">
                      <span>Processador</span>
                      <input disabled={!canEditAsset && Boolean(editingId)} onChange={updateField("processor")} value={form.processor} />
                    </label>
                  </>
                ) : null}

                {isPhoneType(form.type) ? (
                  <>
                    <label className="field-block">
                      <span>Memoria RAM</span>
                      <input disabled={!canEditAsset && Boolean(editingId)} onChange={updateField("ram")} value={form.ram} />
                    </label>
                    <label className="field-block">
                      <span>Armazenamento</span>
                      <input disabled={!canEditAsset && Boolean(editingId)} onChange={updateField("storage")} value={form.storage} />
                    </label>
                    <label className="field-block">
                      <span>IMEI</span>
                      <input disabled={!canEditAsset && Boolean(editingId)} onChange={updateField("imei")} value={form.imei} />
                    </label>
                    <label className="field-block">
                      <span>N da Linha</span>
                      <input disabled={!canEditAsset && Boolean(editingId)} onChange={updateField("phoneLine")} value={form.phoneLine} />
                    </label>
                  </>
                ) : null}

                {!isComputerType(form.type) && !isPhoneType(form.type) ? (
                  <label className="field-block field-span-2">
                    <span>Especificacao tecnica</span>
                    <input disabled={!canEditAsset && Boolean(editingId)} onChange={updateField("technicalSpec")} value={form.technicalSpec} />
                  </label>
                ) : null}
              </div>

              <div className="ticket-create-actions compact-actions">
                {(editingId ? canEditAsset : canCreateAsset) ? (
                  <button className="primary-button compact-button interactive-button" type="submit">
                    {editingId ? "Salvar ativo" : "Cadastrar ativo"}
                  </button>
                ) : null}
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {showQuickCatalogModal && canCreateBrandsModels ? (
        <div className="ticket-modal-backdrop" onClick={() => setShowQuickCatalogModal(false)} role="presentation">
          <div className="ticket-modal board-card compact-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <form className="glpi-ticket-form compact-form" onSubmit={handleQuickCatalogSubmit}>
              <div className="ticket-modal-header">
                <div>
                  <h2>Cadastro rapido de Marca e Modelo</h2>
                </div>
                <button className="ghost-button compact-button interactive-button" onClick={() => setShowQuickCatalogModal(false)} type="button">
                  Fechar
                </button>
              </div>
              <div className="glpi-form-grid compact-form-grid">
                <label className="field-block">
                  <span>Tipo de ativo</span>
                  <select onChange={handleQuickCatalogField("assetType")} value={quickCatalogForm.assetType}>
                    {assetTypeOptions.map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                </label>
                <label className="field-block">
                  <span>Marca</span>
                  <input onChange={handleQuickCatalogField("brandName")} value={quickCatalogForm.brandName} />
                </label>
                <label className="field-block">
                  <span>Modelo</span>
                  <input onChange={handleQuickCatalogField("modelName")} value={quickCatalogForm.modelName} />
                </label>
                <label className="field-block">
                  <span>Status</span>
                  <select onChange={handleQuickCatalogField("status")} value={quickCatalogForm.status}>
                    <option>Ativo</option>
                    <option>Inativo</option>
                  </select>
                </label>
              </div>
              <div className="ticket-create-actions compact-actions">
                <button className="primary-button compact-button interactive-button" type="submit">
                  Salvar
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
