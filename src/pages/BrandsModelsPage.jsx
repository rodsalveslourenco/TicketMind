import { useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { hasAnyPermission } from "../data/permissions";
import { useAppData } from "../data/AppDataContext";
import { assetTypeOptions } from "../data/assetCatalog";

const defaultForm = {
  assetType: "Notebook",
  brandId: "",
  brandName: "",
  modelId: "",
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

function matchesAssetType(asset, assetType) {
  return normalizeText(asset.type) === normalizeText(assetType);
}

function BrandsModelsPage() {
  const { user } = useAuth();
  const {
    addBrand,
    addModel,
    assets,
    brands,
    deleteBrand,
    deleteModel,
    models,
    pushToast,
    updateBrand,
    updateModel,
  } = useAppData();
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [editingMode, setEditingMode] = useState("create");
  const canCreate = hasAnyPermission(user, ["brands_models_create", "brands_models_admin"]);
  const canEdit = hasAnyPermission(user, ["brands_models_edit", "brands_models_admin"]);
  const canDelete = hasAnyPermission(user, ["brands_models_delete", "brands_models_admin"]);

  const unifiedRows = useMemo(() => {
    const brandRows = brands.map((brand) => ({
      rowKey: `brand-${brand.id}`,
      rowType: "Marca",
      assetType: brand.assetType,
      brandId: brand.id,
      brandName: brand.name,
      modelId: "",
      modelName: "",
      status: brand.status,
    }));

    const modelRows = models.map((model) => ({
      rowKey: `model-${model.id}`,
      rowType: "Modelo",
      assetType: model.assetType,
      brandId: model.brandId,
      brandName: model.brandName,
      modelId: model.id,
      modelName: model.name,
      status: model.status,
    }));

    return [...brandRows, ...modelRows].sort((left, right) =>
      `${left.assetType} ${left.brandName} ${left.modelName || left.rowType}`.localeCompare(
        `${right.assetType} ${right.brandName} ${right.modelName || right.rowType}`,
      ),
    );
  }, [brands, models]);

  const availableBrandsByType = useMemo(
    () => brands.filter((brand) => brand.assetType === form.assetType && brand.status === "Ativo"),
    [brands, form.assetType],
  );

  const updateField = (field) => (event) => {
    const nextValue = event.target.value;
    setForm((current) => {
      if (field === "assetType") {
        return {
          ...current,
          assetType: nextValue,
          brandId: "",
          brandName: "",
          modelId: "",
          modelName: "",
        };
      }

      if (field === "brandId") {
        const selectedBrand = availableBrandsByType.find((brand) => brand.id === nextValue);
        return {
          ...current,
          brandId: nextValue,
          brandName: selectedBrand?.name || "",
          modelId: "",
          modelName: "",
        };
      }

      return { ...current, [field]: nextValue };
    });
  };

  const resetForm = () => {
    setForm(defaultForm);
    setEditingMode("create");
  };

  const openCreateModal = () => {
    if (!canCreate) return;
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (row) => {
    if (!canEdit) return;
    setEditingMode(row.rowType === "Marca" ? "brand" : "model");
    setForm({
      assetType: row.assetType,
      brandId: row.brandId,
      brandName: row.brandName,
      modelId: row.modelId,
      modelName: row.modelName,
      status: row.status,
    });
    setShowModal(true);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!assetTypeOptions.includes(form.assetType)) {
      pushToast("Tipo invalido", "Selecione um tipo de ativo existente.", "warning");
      return;
    }

    const brandName = form.brandName.trim();
    const modelName = form.modelName.trim();
    if (!brandName) {
      pushToast("Marca obrigatoria", "Informe a marca.", "warning");
      return;
    }

    const duplicatedBrand = brands.find(
      (brand) =>
        normalizeText(brand.name) === normalizeText(brandName) &&
        brand.assetType === form.assetType &&
        brand.id !== form.brandId,
    );

    let resolvedBrand = brands.find((brand) => brand.id === form.brandId);

    if (editingMode === "brand") {
      if (duplicatedBrand) {
        pushToast("Marca duplicada", "Ja existe uma marca com esse nome para esse tipo.", "warning");
        return;
      }
      const previousBrand = brands.find((brand) => brand.id === form.brandId);
      updateBrand(form.brandId, {
        name: brandName,
        assetType: form.assetType,
        status: form.status,
        previousName: previousBrand?.name || brandName,
      });
      pushToast("Marca atualizada", brandName);
      setShowModal(false);
      resetForm();
      return;
    }

    if (!resolvedBrand) {
      if (duplicatedBrand) {
        resolvedBrand = duplicatedBrand;
      } else {
        resolvedBrand = addBrand({
          name: brandName,
          assetType: form.assetType,
          status: form.status,
        });
      }
    }

    if (!modelName) {
      pushToast("Modelo obrigatorio", "Informe o modelo no mesmo formulario.", "warning");
      return;
    }

    const duplicatedModel = models.find(
      (model) =>
        model.brandId === resolvedBrand.id &&
        model.assetType === form.assetType &&
        normalizeText(model.name) === normalizeText(modelName) &&
        model.id !== form.modelId,
    );

    if (duplicatedModel) {
      pushToast("Modelo duplicado", "Ja existe esse modelo para a mesma marca e tipo.", "warning");
      return;
    }

    if (editingMode === "model") {
      const previousModel = models.find((model) => model.id === form.modelId);
      updateModel(form.modelId, {
        brandId: resolvedBrand.id,
        brandName: resolvedBrand.name,
        name: modelName,
        assetType: form.assetType,
        status: form.status,
        previousName: previousModel?.name || modelName,
      });
      pushToast("Modelo atualizado", modelName);
    } else {
      addModel({
        brandId: resolvedBrand.id,
        brandName: resolvedBrand.name,
        name: modelName,
        assetType: form.assetType,
        status: form.status,
      });
      pushToast("Marca e modelo cadastrados", `${brandName} | ${modelName}`);
    }

    setShowModal(false);
    resetForm();
  };

  const handleDelete = (row) => {
    if (!canDelete) return;
    if (row.rowType === "Marca") {
      const hasModels = models.some((model) => model.brandId === row.brandId);
      const hasAssets = assets.some(
        (asset) => asset.manufacturer === row.brandName && matchesAssetType(asset, row.assetType),
      );
      if (hasModels || hasAssets) {
        pushToast("Exclusao bloqueada", "A marca possui modelos ou ativos vinculados.", "warning");
        return;
      }
      deleteBrand(row.brandId);
      pushToast("Marca removida", row.brandName);
      return;
    }

    const hasAssets = assets.some(
      (asset) =>
        asset.manufacturer === row.brandName &&
        asset.model === row.modelName &&
        matchesAssetType(asset, row.assetType),
    );
    if (hasAssets) {
      pushToast("Exclusao bloqueada", "O modelo possui ativos vinculados.", "warning");
      return;
    }
    deleteModel(row.modelId);
    pushToast("Modelo removido", row.modelName);
  };

  return (
    <div className="users-page">
      <section className="module-hero board-card">
        <div>
          <span className="eyebrow">Marcas e Modelos</span>
          <h2>Marcas e Modelos</h2>
        </div>
        <div className="insight-strip">
          <div className="insight-chip">
            <strong>{brands.length}</strong>
            <span>marcas</span>
          </div>
          <div className="insight-chip">
            <strong>{models.length}</strong>
            <span>modelos</span>
          </div>
          <div className="insight-chip">
            <strong>{unifiedRows.length}</strong>
            <span>registros na lista</span>
          </div>
        </div>
      </section>

      <section className="board-card glpi-panel">
        <div className="glpi-toolbar">
          <div>
            <h2>Lista de Marcas e Modelos</h2>
          </div>
          <div className="toolbar">
            {canCreate ? (
              <button className="primary-button compact-button interactive-button" onClick={openCreateModal} type="button">
                + Novo
              </button>
            ) : null}
          </div>
        </div>

        <div className="sheet-list">
          <div className="sheet-row sheet-row-header">
            <strong>Tipo</strong>
            <strong>Marca</strong>
            <strong>Modelo</strong>
            <strong>Status</strong>
            <strong>Registro</strong>
            <strong>Acoes</strong>
          </div>
          {unifiedRows.map((row) => (
            <div className="sheet-row" key={row.rowKey}>
              <span>{row.assetType}</span>
              <span>{row.brandName}</span>
              <span>{row.modelName || "-"}</span>
              <span>{row.status}</span>
              <span>{row.rowType}</span>
              <div className="compact-row-actions">
                {canEdit ? (
                  <button className="ghost-button compact-button interactive-button" onClick={() => openEditModal(row)} type="button">
                    Editar
                  </button>
                ) : null}
                {canDelete ? (
                  <button className="danger-button compact-button interactive-button" onClick={() => handleDelete(row)} type="button">
                    Excluir
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </section>

      {showModal ? (
        <div className="ticket-modal-backdrop" onClick={() => setShowModal(false)} role="presentation">
          <div className="ticket-modal board-card compact-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <form className="glpi-ticket-form compact-form" onSubmit={handleSubmit}>
              <div className="ticket-modal-header">
                <div>
                  <h2>Cadastro unificado</h2>
                </div>
                <button className="ghost-button compact-button interactive-button" onClick={() => setShowModal(false)} type="button">
                  Fechar
                </button>
              </div>

              <div className="glpi-form-grid compact-form-grid">
                <label className="field-block">
                  <span>Tipo de ativo</span>
                  <select disabled={!canEdit && editingMode !== "create"} onChange={updateField("assetType")} value={form.assetType}>
                    {assetTypeOptions.map((assetType) => (
                      <option key={assetType}>{assetType}</option>
                    ))}
                  </select>
                </label>
                <label className="field-block">
                  <span>Marca</span>
                  <input disabled={!canEdit && editingMode !== "create"} onChange={updateField("brandName")} value={form.brandName} />
                </label>
                <label className="field-block">
                  <span>Modelo</span>
                  <input disabled={!canEdit && editingMode !== "create"} onChange={updateField("modelName")} value={form.modelName} />
                </label>
                <label className="field-block">
                  <span>Status</span>
                  <select disabled={!canEdit && editingMode !== "create"} onChange={updateField("status")} value={form.status}>
                    <option>Ativo</option>
                    <option>Inativo</option>
                  </select>
                </label>
                {editingMode === "model" ? (
                  <label className="field-block">
                    <span>Marca vinculada</span>
                    <select disabled={!canEdit} onChange={updateField("brandId")} value={form.brandId}>
                      <option value="">Selecione</option>
                      {availableBrandsByType.map((brand) => (
                        <option key={brand.id} value={brand.id}>
                          {brand.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>

              <div className="ticket-create-actions compact-actions">
                {(editingMode === "create" ? canCreate : canEdit) ? (
                  <button className="primary-button compact-button interactive-button" type="submit">
                    Salvar
                  </button>
                ) : null}
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default BrandsModelsPage;
