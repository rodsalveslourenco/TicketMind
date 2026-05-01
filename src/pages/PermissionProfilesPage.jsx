import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useAppData } from "../data/AppDataContext";
import { hasAnyPermission, normalizeText } from "../data/permissions";

function createEmptyPermissions(permissionCatalog = []) {
  return Array.from(
    new Set(permissionCatalog.flatMap((group) => (Array.isArray(group.permissions) ? group.permissions : []).map((permission) => permission.key))),
  ).reduce((accumulator, key) => ({ ...accumulator, [key]: false }), {});
}

function createDefaultForm(permissionCatalog = []) {
  return {
    name: "",
    description: "",
    status: "Ativo",
    permissions: createEmptyPermissions(permissionCatalog),
  };
}

function PermissionProfilesPage() {
  const { user } = useAuth();
  const {
    deletePermissionProfile,
    duplicatePermissionProfile,
    permissionCatalog,
    permissionProfiles,
    pushToast,
    savePermissionProfile,
    setPermissionProfileStatus,
    users,
  } = useAppData();

  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState(null);
  const [form, setForm] = useState(() => createDefaultForm(permissionCatalog));

  const canManage = hasAnyPermission(user, ["users_manage_permissions", "users_admin"]);

  const orderedProfiles = useMemo(() => {
    const normalizedSearch = normalizeText(search);
    return permissionProfiles
      .slice()
      .sort((left, right) => left.name.localeCompare(right.name))
      .filter((profile) =>
        !normalizedSearch
          ? true
          : [profile.name, profile.description, profile.status].join(" ").toLowerCase().includes(normalizedSearch),
      );
  }, [permissionProfiles, search]);

  const profileUsageMap = useMemo(
    () =>
      orderedProfiles.reduce(
        (accumulator, profile) => ({
          ...accumulator,
          [profile.id]: users.filter((candidate) => candidate.permissionProfileId === profile.id && candidate.status !== "Excluido").length,
        }),
        {},
      ),
    [orderedProfiles, users],
  );

  if (!canManage) {
    return <Navigate replace to="/app/dashboard" />;
  }

  const permissionGroups = permissionCatalog.map((group) => ({
    ...group,
    permissions: (group.permissions || []).filter(
      (permission, index, collection) => collection.findIndex((candidate) => candidate.key === permission.key) === index,
    ),
  }));

  const openCreateModal = () => {
    setEditingProfileId(null);
    setForm(createDefaultForm(permissionCatalog));
    setShowModal(true);
  };

  const openEditModal = (profile) => {
    setEditingProfileId(profile.id);
    const nextPermissions = createEmptyPermissions(permissionCatalog);
    if (profile.permissions === "ALL") {
      Object.keys(nextPermissions).forEach((key) => {
        nextPermissions[key] = true;
      });
    } else {
      (profile.permissions || []).forEach((key) => {
        nextPermissions[key] = true;
      });
    }
    setForm({
      name: profile.name,
      description: profile.description,
      status: profile.status || "Ativo",
      permissions: nextPermissions,
    });
    setShowModal(true);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!form.name.trim()) {
      pushToast("Campos obrigatorios", "Informe o nome do perfil.", "warning");
      return;
    }
    const duplicated = permissionProfiles.find(
      (profile) => normalizeText(profile.name) === normalizeText(form.name) && profile.id !== editingProfileId,
    );
    if (duplicated) {
      pushToast("Perfil duplicado", duplicated.name, "warning");
      return;
    }
    savePermissionProfile(form, editingProfileId);
    pushToast(editingProfileId ? "Perfil atualizado" : "Perfil criado", form.name);
    setShowModal(false);
    setEditingProfileId(null);
  };

  const handleDelete = (profile) => {
    if (profileUsageMap[profile.id]) {
      pushToast("Exclusao bloqueada", "Existem usuarios vinculados a este perfil.", "warning");
      return;
    }
    if (!window.confirm(`Excluir o perfil ${profile.name}?`)) return;
    deletePermissionProfile(profile.id);
    pushToast("Perfil excluido", profile.name);
  };

  const handleDuplicate = (profile) => {
    const duplicatedId = duplicatePermissionProfile(profile.id);
    const duplicatedProfile = permissionProfiles.find((candidate) => candidate.id === duplicatedId);
    pushToast("Perfil duplicado", duplicatedProfile?.name || profile.name);
  };

  return (
    <div className="users-page">
      <section className="module-hero board-card">
        <div>
          <span className="eyebrow">Configuracoes</span>
          <h2>Perfis de Permissao</h2>
          <p className="module-caption">Organize acessos por perfil principal, com reutilizacao e governanca por modulo, menu e acao.</p>
        </div>
        <div className="insight-strip">
          <div className="insight-chip">
            <strong>{permissionProfiles.length}</strong>
            <span>perfis cadastrados</span>
          </div>
          <div className="insight-chip">
            <strong>{permissionProfiles.filter((profile) => profile.status === "Ativo").length}</strong>
            <span>perfis ativos</span>
          </div>
          <div className="insight-chip">
            <strong>{users.filter((candidate) => candidate.status !== "Excluido" && candidate.permissionProfileId).length}</strong>
            <span>usuarios vinculados</span>
          </div>
        </div>
      </section>

      <section className="board-card glpi-panel">
        <div className="glpi-toolbar">
          <div>
            <h2>Perfis cadastrados</h2>
            <span>Use perfis como base e deixe excecoes somente no override de usuario.</span>
          </div>
          <div className="toolbar">
            <input
              className="toolbar-search"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome, descricao ou status"
              value={search}
            />
            <button className="primary-button interactive-button" onClick={openCreateModal} type="button">
              + Novo perfil
            </button>
          </div>
        </div>

        <div className="sheet-list">
          <div className="sheet-row sheet-row-header">
            <strong>Perfil</strong>
            <strong>Status</strong>
            <strong>Permissoes</strong>
            <strong>Usuarios vinculados</strong>
            <strong>Acoes</strong>
          </div>
          {orderedProfiles.map((profile) => (
            <div className="sheet-row" key={profile.id}>
              <div>
                <strong>{profile.name}</strong>
                <span className="table-description">{profile.description || "Sem descricao"}</span>
              </div>
              <span>{profile.status}</span>
              <span>{profile.permissions === "ALL" ? "Acesso total" : `${(profile.permissions || []).length} permissoes`}</span>
              <span>{profileUsageMap[profile.id] || 0}</span>
              <div className="compact-row-actions">
                {profile.status === "Ativo" ? (
                  <button className="ghost-button compact-button interactive-button" onClick={() => setPermissionProfileStatus(profile.id, "Inativo")} type="button">
                    Inativar
                  </button>
                ) : (
                  <button className="ghost-button compact-button interactive-button" onClick={() => setPermissionProfileStatus(profile.id, "Ativo")} type="button">
                    Ativar
                  </button>
                )}
                <button className="ghost-button compact-button interactive-button" onClick={() => openEditModal(profile)} type="button">
                  Editar
                </button>
                <button className="ghost-button compact-button interactive-button" onClick={() => handleDuplicate(profile)} type="button">
                  Duplicar
                </button>
                <button className="danger-button compact-button interactive-button" onClick={() => handleDelete(profile)} type="button">
                  Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {showModal ? (
        <div className="ticket-modal-backdrop" onClick={() => setShowModal(false)} role="presentation">
          <div className="ticket-modal ticket-modal-large board-card" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <form className="ticket-create-form glpi-ticket-form" onSubmit={handleSubmit}>
              <div className="ticket-modal-header">
                <div className="form-section-header">
                  <strong>{editingProfileId ? "Editar perfil" : "Novo perfil"}</strong>
                </div>
                <button className="ghost-button interactive-button" onClick={() => setShowModal(false)} type="button">
                  Fechar
                </button>
              </div>
              <div className="glpi-form-grid">
                <label className="field-block">
                  <span>Nome</span>
                  <input onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} value={form.name} />
                </label>
                <label className="field-block">
                  <span>Status</span>
                  <select onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} value={form.status}>
                    <option>Ativo</option>
                    <option>Inativo</option>
                  </select>
                </label>
                <label className="field-block field-span-2">
                  <span>Descricao</span>
                  <textarea onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} value={form.description} />
                </label>
              </div>
              <div className="permissions-panel permissions-panel-refined">
                {permissionGroups.map((group) => (
                  <section className="permission-group permission-group-refined" key={group.module}>
                    <div className="permission-group-head">
                      <strong>{group.label}</strong>
                      <span>{group.description}</span>
                    </div>
                    <div className="permissions-list permissions-list-compact">
                      {group.permissions.map((permission) => (
                        <label className="permission-item permission-item-compact" key={permission.key}>
                          <input
                            checked={Boolean(form.permissions[permission.key])}
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                permissions: {
                                  ...current.permissions,
                                  [permission.key]: event.target.checked,
                                },
                              }))
                            }
                            type="checkbox"
                          />
                          <span>{permission.label}</span>
                          <small className="badge badge-neutral">{permission.action}</small>
                        </label>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
              <div className="ticket-create-actions">
                <button className="primary-button interactive-button" type="submit">
                  {editingProfileId ? "Salvar perfil" : "Cadastrar perfil"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default PermissionProfilesPage;
