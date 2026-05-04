import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { getDepartmentColorStyle, normalizeDepartmentColor } from "../data/departments";
import { hasAnyPermission } from "../data/permissions";
import { useAppData } from "../data/AppDataContext";

const defaultForm = {
  code: "",
  name: "",
  color: "",
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

function DepartmentsPage() {
  const { user } = useAuth();
  const {
    addDepartment,
    deleteDepartment,
    departments,
    locations,
    pushToast,
    updateDepartment,
    users,
  } = useAppData();
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingDepartmentId, setEditingDepartmentId] = useState(null);
  const [form, setForm] = useState(defaultForm);

  const canViewDepartments = hasAnyPermission(user, ["users_view", "users_admin"]);
  const canCreateDepartments = hasAnyPermission(user, ["users_create", "users_admin"]);
  const canEditDepartments = hasAnyPermission(user, ["users_edit", "users_admin"]);
  const canDeleteDepartments = hasAnyPermission(user, ["users_delete", "users_admin"]);

  const orderedDepartments = useMemo(() => {
    const normalizedSearch = normalizeText(search);
    return departments
      .slice()
      .sort((left, right) => left.name.localeCompare(right.name))
      .filter((department) =>
        !normalizedSearch
          ? true
          : [department.code, department.name, department.status].some((field) =>
              normalizeText(field).includes(normalizedSearch),
            ),
      );
  }, [departments, search]);

  if (!canViewDepartments) {
    return <Navigate replace to="/app/dashboard" />;
  }

  const resetForm = () => {
    setForm(defaultForm);
    setEditingDepartmentId(null);
  };

  const openCreateModal = () => {
    if (!canCreateDepartments) return;
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (department) => {
    if (!canEditDepartments) return;
    setEditingDepartmentId(department.id);
    setForm({
      code: department.code || "",
      name: department.name || "",
      color: department.color || "",
      status: department.status || "Ativo",
    });
    setShowModal(true);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!form.name.trim()) {
      pushToast("Campos obrigatorios", "Informe pelo menos o nome do departamento.", "warning");
      return;
    }

    const duplicated = departments.find(
      (department) =>
        normalizeText(department.name) === normalizeText(form.name) && department.id !== editingDepartmentId,
    );
    if (duplicated) {
      pushToast("Departamento duplicado", duplicated.name, "warning");
      return;
    }

    if (editingDepartmentId) {
      updateDepartment(editingDepartmentId, form);
      pushToast("Departamento atualizado", form.name);
    } else {
      addDepartment(form);
      pushToast("Departamento cadastrado", form.name);
    }

    setShowModal(false);
    resetForm();
  };

  const handleDelete = (department) => {
    if (!canDeleteDepartments) return;
    const linkedUsers = users.filter((candidate) => candidate.departmentId === department.id).length;
    const linkedLocations = locations.filter((location) => location.departmentId === department.id).length;
    if (linkedUsers || linkedLocations) {
      pushToast(
        "Exclusao bloqueada",
        `${linkedUsers} usuario(s) e ${linkedLocations} localizacao(oes) ainda usam este departamento.`,
        "warning",
      );
      return;
    }
    deleteDepartment(department.id);
    pushToast("Departamento removido", department.name);
  };

  return (
    <div className="users-page">
      <section className="module-hero board-card">
        <div>
          <span className="eyebrow">Configuracoes</span>
          <h2>Departamentos</h2>
        </div>
        <div className="insight-strip">
          <div className="insight-chip">
            <strong>{departments.length}</strong>
            <span>departamentos cadastrados</span>
          </div>
          <div className="insight-chip">
            <strong>{departments.filter((department) => department.status === "Ativo").length}</strong>
            <span>departamentos ativos</span>
          </div>
          <div className="insight-chip">
            <strong>{users.filter((candidate) => candidate.departmentId).length}</strong>
            <span>usuarios vinculados</span>
          </div>
        </div>
      </section>

      <section className="board-card glpi-panel">
        <div className="glpi-toolbar">
          <div>
            <h2>Cadastro de departamentos</h2>
            <span>Base central para usuarios e localizacoes do sistema.</span>
          </div>
          <div className="toolbar">
            <input
              className="toolbar-search"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por codigo, nome ou status"
              value={search}
            />
            {canCreateDepartments ? (
              <button className="primary-button interactive-button" onClick={openCreateModal} type="button">
                + Novo departamento
              </button>
            ) : null}
          </div>
        </div>

        <div className="sheet-list">
          <div className="sheet-row sheet-row-header">
            <strong>Codigo</strong>
            <strong>Departamento</strong>
            <strong>Cor</strong>
            <strong>Status</strong>
            <strong>Criado em</strong>
            <strong>Atualizado em</strong>
            <strong>Acoes</strong>
          </div>
          {orderedDepartments.map((department) => {
            const linkedUsers = users.filter((candidate) => candidate.departmentId === department.id).length;
            const linkedLocations = locations.filter((location) => location.departmentId === department.id).length;
            return (
              <div className="sheet-row" key={department.id}>
                <strong>{department.code || "-"}</strong>
                <span className="department-name-cell">
                  <span className="department-color-swatch" style={getDepartmentColorStyle(department.color, { alpha: 0.35 })} />
                  {department.name}
                </span>
                <span>{normalizeDepartmentColor(department.color) || "-"}</span>
                <span>{department.status}</span>
                <span>{formatDateTime(department.createdAt)}</span>
                <span>{formatDateTime(department.updatedAt)}</span>
                <div className="compact-row-actions">
                  <span className="badge badge-neutral">{linkedUsers} usuarios</span>
                  <span className="badge badge-neutral">{linkedLocations} localizacoes</span>
                  {canEditDepartments ? (
                    <button className="ghost-button compact-button interactive-button" onClick={() => openEditModal(department)} type="button">
                      Editar
                    </button>
                  ) : null}
                  {canDeleteDepartments ? (
                    <button className="danger-button compact-button interactive-button" onClick={() => handleDelete(department)} type="button">
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
                  <h2>{editingDepartmentId ? "Editar departamento" : "Novo departamento"}</h2>
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
                <label className="field-block">
                  <span>Cor do departamento</span>
                  <div className="department-color-field">
                    <input
                      aria-label="Selecionar cor do departamento"
                      className="department-color-picker"
                      onChange={(event) => setForm((current) => ({ ...current, color: normalizeDepartmentColor(event.target.value) }))}
                      type="color"
                      value={normalizeDepartmentColor(form.color) || "#94A3B8"}
                    />
                    <span className="department-color-swatch" style={getDepartmentColorStyle(form.color, { alpha: 0.35 })} />
                    <strong className="department-color-value">{normalizeDepartmentColor(form.color) || "Neutra"}</strong>
                  </div>
                </label>
                <label className="field-block field-full">
                  <span>Nome do departamento</span>
                  <input onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} value={form.name} />
                </label>
              </div>
              <div className="ticket-create-actions compact-actions">
                <button className="primary-button compact-button interactive-button" type="submit">
                  {editingDepartmentId ? "Salvar departamento" : "Cadastrar departamento"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default DepartmentsPage;
