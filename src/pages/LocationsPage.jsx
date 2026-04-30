import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { hasAnyPermission } from "../data/permissions";
import { useAppData } from "../data/AppDataContext";

const defaultForm = {
  code: "",
  name: "",
  departmentId: "",
  status: "Ativo",
};

function formatDateTime(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function LocationsPage() {
  const { user } = useAuth();
  const {
    addLocation,
    assets,
    departments,
    deleteLocation,
    locations,
    pushToast,
    updateLocation,
  } = useAppData();
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingLocationId, setEditingLocationId] = useState(null);
  const [form, setForm] = useState(defaultForm);

  const canViewLocations = hasAnyPermission(user, ["assets_view", "assets_admin"]);
  const canCreateLocations = hasAnyPermission(user, ["assets_create", "assets_admin"]);
  const canEditLocations = hasAnyPermission(user, ["assets_edit", "assets_admin"]);
  const canDeleteLocations = hasAnyPermission(user, ["assets_delete", "assets_admin"]);

  const activeDepartments = useMemo(
    () => departments.filter((department) => department.status === "Ativo"),
    [departments],
  );

  const orderedLocations = useMemo(() => {
    const normalizedSearch = normalizeText(search);
    return locations
      .slice()
      .sort((left, right) => left.name.localeCompare(right.name))
      .filter((location) =>
        !normalizedSearch
          ? true
          : [location.code, location.name, location.department, location.status].some((field) =>
              normalizeText(field).includes(normalizedSearch),
            ),
      );
  }, [locations, search]);

  if (!canViewLocations) {
    return <Navigate replace to="/app/dashboard" />;
  }

  const resetForm = () => {
    setForm(defaultForm);
    setEditingLocationId(null);
  };

  const openCreateModal = () => {
    if (!canCreateLocations) return;
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (location) => {
    if (!canEditLocations) return;
    setEditingLocationId(location.id);
    setForm({
      code: location.code || "",
      name: location.name || "",
      departmentId: location.departmentId || "",
      status: location.status || "Ativo",
    });
    setShowModal(true);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!form.name.trim()) {
      pushToast("Campos obrigatorios", "Informe o nome da localizacao.", "warning");
      return;
    }

    const duplicated = locations.find(
      (location) =>
        normalizeText(location.name) === normalizeText(form.name) && location.id !== editingLocationId,
    );
    if (duplicated) {
      pushToast("Localizacao duplicada", duplicated.name, "warning");
      return;
    }

    const selectedDepartment = departments.find((department) => department.id === form.departmentId);
    const payload = {
      ...form,
      departmentId: selectedDepartment?.id || "",
      department: selectedDepartment?.name || "",
    };

    if (editingLocationId) {
      updateLocation(editingLocationId, payload);
      pushToast("Localizacao atualizada", form.name);
    } else {
      addLocation(payload);
      pushToast("Localizacao cadastrada", form.name);
    }

    setShowModal(false);
    resetForm();
  };

  const handleDelete = (location) => {
    if (!canDeleteLocations) return;
    const linkedAssets = assets.filter((asset) => asset.locationId === location.id).length;
    if (linkedAssets) {
      pushToast("Exclusao bloqueada", `${linkedAssets} ativo(s) ainda usam esta localizacao.`, "warning");
      return;
    }
    deleteLocation(location.id);
    pushToast("Localizacao removida", location.name);
  };

  return (
    <div className="users-page">
      <section className="module-hero board-card">
        <div>
          <span className="eyebrow">Operacoes Helpdesk</span>
          <h2>Localizacoes</h2>
        </div>
        <div className="insight-strip">
          <div className="insight-chip">
            <strong>{locations.length}</strong>
            <span>localizacoes cadastradas</span>
          </div>
          <div className="insight-chip">
            <strong>{locations.filter((location) => location.departmentId).length}</strong>
            <span>com departamento vinculado</span>
          </div>
          <div className="insight-chip">
            <strong>{assets.filter((asset) => asset.locationId).length}</strong>
            <span>ativos vinculados</span>
          </div>
        </div>
      </section>

      <section className="board-card glpi-panel">
        <div className="glpi-toolbar">
          <div>
            <h2>Cadastro de localizacoes</h2>
            <span>Vincule cada localizacao a um departamento para padronizar os ativos.</span>
          </div>
          <div className="toolbar">
            <input
              className="toolbar-search"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por codigo, nome, departamento ou status"
              value={search}
            />
            {canCreateLocations ? (
              <button className="primary-button interactive-button" onClick={openCreateModal} type="button">
                + Nova localizacao
              </button>
            ) : null}
          </div>
        </div>

        <div className="sheet-list">
          <div className="sheet-row sheet-row-header">
            <strong>Codigo</strong>
            <strong>Localizacao</strong>
            <strong>Departamento</strong>
            <strong>Status</strong>
            <strong>Atualizado em</strong>
            <strong>Acoes</strong>
          </div>
          {orderedLocations.map((location) => {
            const linkedAssets = assets.filter((asset) => asset.locationId === location.id).length;
            return (
              <div className="sheet-row" key={location.id}>
                <strong>{location.code || "-"}</strong>
                <span>{location.name}</span>
                <span>{location.department || "-"}</span>
                <span>{location.status}</span>
                <span>{formatDateTime(location.updatedAt)}</span>
                <div className="compact-row-actions">
                  <span className="badge badge-neutral">{linkedAssets} ativos</span>
                  {canEditLocations ? (
                    <button className="ghost-button compact-button interactive-button" onClick={() => openEditModal(location)} type="button">
                      Editar
                    </button>
                  ) : null}
                  {canDeleteLocations ? (
                    <button className="danger-button compact-button interactive-button" onClick={() => handleDelete(location)} type="button">
                      Excluir
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {showModal ? (
        <div className="ticket-modal-backdrop" onClick={() => setShowModal(false)} role="presentation">
          <div className="ticket-modal board-card compact-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <form className="glpi-ticket-form compact-form" onSubmit={handleSubmit}>
              <div className="ticket-modal-header">
                <div>
                  <h2>{editingLocationId ? "Editar localizacao" : "Nova localizacao"}</h2>
                </div>
                <button className="ghost-button compact-button interactive-button" onClick={() => setShowModal(false)} type="button">
                  Fechar
                </button>
              </div>
              <div className="glpi-form-grid compact-form-grid">
                <label className="field-block">
                  <span>Codigo / ID</span>
                  <input onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} value={form.code} />
                </label>
                <label className="field-block">
                  <span>Status</span>
                  <select onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} value={form.status}>
                    <option>Ativo</option>
                    <option>Inativo</option>
                  </select>
                </label>
                <label className="field-block field-span-2">
                  <span>Nome da localizacao</span>
                  <input onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} value={form.name} />
                </label>
                <label className="field-block field-span-2">
                  <span>Departamento</span>
                  <select onChange={(event) => setForm((current) => ({ ...current, departmentId: event.target.value }))} value={form.departmentId}>
                    <option value="">Sem departamento</option>
                    {activeDepartments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="ticket-create-actions compact-actions">
                <button className="primary-button compact-button interactive-button" type="submit">
                  {editingLocationId ? "Salvar localizacao" : "Cadastrar localizacao"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default LocationsPage;
