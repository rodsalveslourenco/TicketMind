import { useMemo, useState } from "react";
import { useAppData } from "../data/AppDataContext";
import { assetTypeOptions } from "../data/assetCatalog";

const defaultBrandForm = {
  name: "",
  assetType: "Notebook",
  status: "Ativo",
};

const defaultModelForm = {
  brandId: "",
  brandName: "",
  name: "",
  assetType: "Notebook",
  status: "Ativo",
};

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function BrandsModelsPage() {
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
  const [brandForm, setBrandForm] = useState(defaultBrandForm);
  const [modelForm, setModelForm] = useState(defaultModelForm);
  const [editingBrandId, setEditingBrandId] = useState(null);
  const [editingModelId, setEditingModelId] = useState(null);

  const orderedBrands = useMemo(
    () =>
      brands
        .slice()
        .sort((left, right) => `${left.assetType} ${left.name}`.localeCompare(`${right.assetType} ${right.name}`)),
    [brands],
  );

  const orderedModels = useMemo(
    () =>
      models
        .slice()
        .sort((left, right) =>
          `${left.assetType} ${left.brandName} ${left.name}`.localeCompare(
            `${right.assetType} ${right.brandName} ${right.name}`,
          ),
        ),
    [models],
  );

  const activeBrandsByType = useMemo(
    () => orderedBrands.filter((brand) => brand.status === "Ativo" && brand.assetType === modelForm.assetType),
    [modelForm.assetType, orderedBrands],
  );

  const updateBrandField = (field) => (event) => {
    setBrandForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const updateModelField = (field) => (event) => {
    const nextValue = event.target.value;
    setModelForm((current) => {
      const nextForm = { ...current, [field]: nextValue };
      if (field === "assetType") {
        nextForm.brandId = "";
        nextForm.brandName = "";
      }
      return nextForm;
    });
  };

  const resetBrandForm = () => {
    setBrandForm(defaultBrandForm);
    setEditingBrandId(null);
  };

  const resetModelForm = () => {
    setModelForm(defaultModelForm);
    setEditingModelId(null);
  };

  const handleBrandSubmit = (event) => {
    event.preventDefault();
    if (!brandForm.name) return;

    const normalizedName = normalizeText(brandForm.name);
    const duplicatedBrand = brands.find(
      (brand) =>
        normalizeText(brand.name) === normalizedName &&
        brand.assetType === brandForm.assetType &&
        brand.id !== editingBrandId,
    );
    if (duplicatedBrand) {
      pushToast("Marca duplicada", `${duplicatedBrand.name} ja existe para ${duplicatedBrand.assetType}.`, "warning");
      return;
    }

    if (editingBrandId) {
      const previousBrand = brands.find((brand) => brand.id === editingBrandId);
      updateBrand(editingBrandId, { ...brandForm, previousName: previousBrand?.name || brandForm.name });
      pushToast("Marca atualizada", brandForm.name);
    } else {
      addBrand(brandForm);
      pushToast("Marca cadastrada", brandForm.name);
    }

    resetBrandForm();
  };

  const handleModelSubmit = (event) => {
    event.preventDefault();
    if (!modelForm.brandId || !modelForm.name) return;

    const linkedBrand = brands.find((brand) => brand.id === modelForm.brandId);
    if (!linkedBrand) {
      pushToast("Marca obrigatoria", "Selecione uma marca valida.", "warning");
      return;
    }

    const normalizedModel = normalizeText(modelForm.name);
    const duplicatedModel = models.find(
      (model) =>
        model.brandId === modelForm.brandId &&
        model.assetType === modelForm.assetType &&
        normalizeText(model.name) === normalizedModel &&
        model.id !== editingModelId,
    );
    if (duplicatedModel) {
      pushToast("Modelo duplicado", `${duplicatedModel.name} ja existe para essa marca e tipo.`, "warning");
      return;
    }

    const payload = { ...modelForm, brandName: linkedBrand.name };
    if (editingModelId) {
      const previousModel = models.find((model) => model.id === editingModelId);
      updateModel(editingModelId, { ...payload, previousName: previousModel?.name || payload.name });
      pushToast("Modelo atualizado", payload.name);
    } else {
      addModel(payload);
      pushToast("Modelo cadastrado", payload.name);
    }

    resetModelForm();
  };

  const handleDeleteBrand = (brand) => {
    const hasModels = models.some((model) => model.brandId === brand.id);
    const hasAssets = assets.some((asset) => asset.manufacturer === brand.name);
    if (hasModels || hasAssets) {
      pushToast("Exclusao bloqueada", "A marca possui modelos ou ativos vinculados.", "warning");
      return;
    }

    deleteBrand(brand.id);
    if (editingBrandId === brand.id) resetBrandForm();
    pushToast("Marca removida", brand.name);
  };

  const handleDeleteModel = (model) => {
    const hasAssets = assets.some(
      (asset) => asset.manufacturer === model.brandName && asset.model === model.name,
    );
    if (hasAssets) {
      pushToast("Exclusao bloqueada", "O modelo possui ativos vinculados.", "warning");
      return;
    }

    deleteModel(model.id);
    if (editingModelId === model.id) resetModelForm();
    pushToast("Modelo removido", model.name);
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
            <span>marcas cadastradas</span>
          </div>
          <div className="insight-chip">
            <strong>{models.length}</strong>
            <span>modelos cadastrados</span>
          </div>
          <div className="insight-chip">
            <strong>{assetTypeOptions.length}</strong>
            <span>tipos disponiveis</span>
          </div>
        </div>
      </section>

      <section className="board-card glpi-panel">
        <div className="glpi-toolbar">
          <div>
            <h2>Cadastro unificado</h2>
          </div>
        </div>

        <div className="module-grid compact-module-grid">
          <section className="compact-panel">
            <div className="compact-panel-heading">
              <strong>{editingBrandId ? "Editar marca" : "Nova marca"}</strong>
            </div>
            <form className="glpi-ticket-form compact-form" onSubmit={handleBrandSubmit}>
              <div className="glpi-form-grid compact-form-grid">
                <label className="field-block">
                  <span>ID</span>
                  <input disabled value={editingBrandId || "Automatico"} />
                </label>
                <label className="field-block field-span-2">
                  <span>Marca</span>
                  <input onChange={updateBrandField("name")} value={brandForm.name} />
                </label>
                <label className="field-block">
                  <span>Tipo de ativo</span>
                  <select onChange={updateBrandField("assetType")} value={brandForm.assetType}>
                    {assetTypeOptions.map((assetType) => (
                      <option key={assetType}>{assetType}</option>
                    ))}
                  </select>
                </label>
                <label className="field-block">
                  <span>Status</span>
                  <select onChange={updateBrandField("status")} value={brandForm.status}>
                    <option>Ativo</option>
                    <option>Inativo</option>
                  </select>
                </label>
              </div>
              <div className="ticket-create-actions compact-actions">
                <button className="primary-button compact-button interactive-button" type="submit">
                  {editingBrandId ? "Salvar marca" : "Cadastrar marca"}
                </button>
                {editingBrandId ? (
                  <button className="ghost-button compact-button interactive-button" onClick={resetBrandForm} type="button">
                    Cancelar
                  </button>
                ) : null}
              </div>
            </form>
          </section>

          <section className="compact-panel">
            <div className="compact-panel-heading">
              <strong>{editingModelId ? "Editar modelo" : "Novo modelo"}</strong>
            </div>
            <form className="glpi-ticket-form compact-form" onSubmit={handleModelSubmit}>
              <div className="glpi-form-grid compact-form-grid">
                <label className="field-block">
                  <span>ID</span>
                  <input disabled value={editingModelId || "Automatico"} />
                </label>
                <label className="field-block">
                  <span>Tipo de ativo</span>
                  <select onChange={updateModelField("assetType")} value={modelForm.assetType}>
                    {assetTypeOptions.map((assetType) => (
                      <option key={assetType}>{assetType}</option>
                    ))}
                  </select>
                </label>
                <label className="field-block">
                  <span>Marca</span>
                  <select
                    onChange={(event) => {
                      const selectedBrand = activeBrandsByType.find((brand) => brand.id === event.target.value);
                      setModelForm((current) => ({
                        ...current,
                        brandId: event.target.value,
                        brandName: selectedBrand?.name || "",
                      }));
                    }}
                    value={modelForm.brandId}
                  >
                    <option value="">Selecione</option>
                    {activeBrandsByType.map((brand) => (
                      <option key={brand.id} value={brand.id}>
                        {brand.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-block field-span-2">
                  <span>Modelo</span>
                  <input onChange={updateModelField("name")} value={modelForm.name} />
                </label>
                <label className="field-block">
                  <span>Status</span>
                  <select onChange={updateModelField("status")} value={modelForm.status}>
                    <option>Ativo</option>
                    <option>Inativo</option>
                  </select>
                </label>
              </div>
              <div className="ticket-create-actions compact-actions">
                <button className="primary-button compact-button interactive-button" type="submit">
                  {editingModelId ? "Salvar modelo" : "Cadastrar modelo"}
                </button>
                {editingModelId ? (
                  <button className="ghost-button compact-button interactive-button" onClick={resetModelForm} type="button">
                    Cancelar
                  </button>
                ) : null}
              </div>
            </form>
          </section>
        </div>
      </section>

      <section className="board-card glpi-panel">
        <div className="glpi-toolbar">
          <div>
            <h2>Tabela unificada</h2>
          </div>
        </div>
        <div className="record-grid compact-record-grid">
          {orderedModels.map((model) => (
            <article className="record-card compact-record-card" key={model.id}>
              <div>
                <strong>{model.assetType}</strong>
                <span>{model.brandName}</span>
              </div>
              <div>
                <strong>{model.name}</strong>
                <span>{model.status}</span>
              </div>
              <div className="compact-row-actions">
                <button
                  className="ghost-button compact-button interactive-button"
                  onClick={() => {
                    setEditingModelId(model.id);
                    setModelForm({
                      brandId: model.brandId,
                      brandName: model.brandName,
                      name: model.name,
                      assetType: model.assetType,
                      status: model.status,
                    });
                  }}
                  type="button"
                >
                  Editar modelo
                </button>
                <button className="danger-button compact-button interactive-button" onClick={() => handleDeleteModel(model)} type="button">
                  Excluir modelo
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="board-card glpi-panel">
        <div className="glpi-toolbar">
          <div>
            <h2>Marcas por tipo</h2>
          </div>
        </div>
        <div className="record-grid compact-record-grid">
          {orderedBrands.map((brand) => (
            <article className="record-card compact-record-card" key={brand.id}>
              <div>
                <strong>{brand.assetType}</strong>
                <span>{brand.name}</span>
              </div>
              <div>
                <strong>{brand.status}</strong>
                <span>{brand.id}</span>
              </div>
              <div className="compact-row-actions">
                <button
                  className="ghost-button compact-button interactive-button"
                  onClick={() => {
                    setEditingBrandId(brand.id);
                    setBrandForm({ name: brand.name, assetType: brand.assetType, status: brand.status });
                  }}
                  type="button"
                >
                  Editar marca
                </button>
                <button className="danger-button compact-button interactive-button" onClick={() => handleDeleteBrand(brand)} type="button">
                  Excluir marca
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

export default BrandsModelsPage;
