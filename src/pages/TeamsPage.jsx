import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { hasAnyPermission } from "../data/permissions";
import { useAppData } from "../data/AppDataContext";
import { exportRowsWithFormat, getExportFormatLabel } from "../lib/export";

const defaultForm = {
  name: "",
  status: "Ativo",
};

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function formatDateTime(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

function TeamsPage() {
  const { user } = useAuth();
  const { addTeam, deleteTeam, pushToast, teams, updateTeam, users } = useAppData();
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingTeamId, setEditingTeamId] = useState(null);
  const [form, setForm] = useState(defaultForm);

  const canViewTeams = hasAnyPermission(user, ["users_view", "users_admin"]);
  const canCreateTeams = hasAnyPermission(user, ["users_create", "users_admin"]);
  const canEditTeams = hasAnyPermission(user, ["users_edit", "users_admin"]);
  const canDeleteTeams = hasAnyPermission(user, ["users_delete", "users_admin"]);

  const orderedTeams = useMemo(() => {
    const normalizedSearch = normalizeText(search);
    return (teams || [])
      .slice()
      .sort((left, right) => left.name.localeCompare(right.name))
      .filter((team) =>
        !normalizedSearch
          ? true
          : [team.name, team.status].some((field) => normalizeText(field).includes(normalizedSearch)),
      );
  }, [search, teams]);

  if (!canViewTeams) {
    return <Navigate replace to="/app/dashboard" />;
  }

  const resetForm = () => {
    setForm(defaultForm);
    setEditingTeamId(null);
  };

  const openCreateModal = () => {
    if (!canCreateTeams) return;
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (team) => {
    if (!canEditTeams) return;
    setEditingTeamId(team.id);
    setForm({
      name: team.name || "",
      status: team.status || "Ativo",
    });
    setShowModal(true);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!form.name.trim()) {
      pushToast("Campos obrigatorios", "Informe o nome da equipe.", "warning");
      return;
    }

    const duplicated = (teams || []).find(
      (team) => normalizeText(team.name) === normalizeText(form.name) && team.id !== editingTeamId,
    );
    if (duplicated) {
      pushToast("Equipe duplicada", duplicated.name, "warning");
      return;
    }

    if (editingTeamId) {
      updateTeam(editingTeamId, form);
      pushToast("Equipe atualizada", form.name);
    } else {
      addTeam(form);
      pushToast("Equipe cadastrada", form.name);
    }

    setShowModal(false);
    resetForm();
  };

  const handleDelete = (team) => {
    if (!canDeleteTeams) return;
    const linkedUsers = (users || []).filter((candidate) => normalizeText(candidate.team) === normalizeText(team.name)).length;
    if (linkedUsers) {
      pushToast("Exclusao bloqueada", `${linkedUsers} usuario(s) ainda usam esta equipe.`, "warning");
      return;
    }
    deleteTeam(team.id);
    pushToast("Equipe removida", team.name);
  };

  const handleExport = (format = "csv") => {
    if (!orderedTeams.length) {
      pushToast("Sem dados", "Nao ha equipes para exportar.", "warning");
      return;
    }
    exportRowsWithFormat({
      format,
      fileName: `ticketmind-equipes-${new Date().toISOString().slice(0, 10)}.csv`,
      title: "Relatorio de equipes",
      columns: [
        { key: "name", label: "Equipe" },
        { key: "status", label: "Status" },
        { key: "createdAt", label: "Criado em" },
        { key: "updatedAt", label: "Atualizado em" },
      ],
      items: orderedTeams,
    });
    pushToast("Exportacao concluida", `${orderedTeams.length} equipe(s) preparadas em ${getExportFormatLabel(format)}.`);
  };

  return (
    <div className="users-page">
      <section className="module-hero board-card">
        <div>
          <span className="eyebrow">Configuracoes</span>
          <h2>Equipes</h2>
        </div>
        <div className="insight-strip">
          <div className="insight-chip">
            <strong>{teams.length}</strong>
            <span>equipes cadastradas</span>
          </div>
          <div className="insight-chip">
            <strong>{teams.filter((team) => team.status === "Ativo").length}</strong>
            <span>equipes ativas</span>
          </div>
          <div className="insight-chip">
            <strong>{users.filter((candidate) => candidate.team).length}</strong>
            <span>usuarios com equipe</span>
          </div>
        </div>
      </section>

      <section className="board-card glpi-panel">
        <div className="glpi-toolbar">
          <div>
            <h2>Cadastro de equipes</h2>
            <span>Lista base para selecao no cadastro de usuarios.</span>
          </div>
          <div className="toolbar">
            <input
              className="toolbar-search"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome ou status"
              value={search}
            />
            <button className="ghost-button interactive-button" onClick={() => handleExport("csv")} type="button">
              CSV
            </button>
            <button className="ghost-button interactive-button" onClick={() => handleExport("excel")} type="button">
              Excel
            </button>
            <button className="ghost-button interactive-button" onClick={() => handleExport("pdf")} type="button">
              PDF
            </button>
            {canCreateTeams ? (
              <button className="primary-button interactive-button" onClick={openCreateModal} type="button">
                + Nova equipe
              </button>
            ) : null}
          </div>
        </div>

        <div className="sheet-list">
          <div className="sheet-row sheet-row-header">
            <strong>Equipe</strong>
            <strong>Status</strong>
            <strong>Criado em</strong>
            <strong>Atualizado em</strong>
            <strong>Acoes</strong>
          </div>
          {orderedTeams.map((team) => {
            const linkedUsers = (users || []).filter((candidate) => normalizeText(candidate.team) === normalizeText(team.name)).length;
            return (
              <div className="sheet-row" key={team.id}>
                <strong>{team.name}</strong>
                <span>{team.status}</span>
                <span>{formatDateTime(team.createdAt)}</span>
                <span>{formatDateTime(team.updatedAt)}</span>
                <div className="compact-row-actions">
                  <span className="badge badge-neutral">{linkedUsers} usuarios</span>
                  {canEditTeams ? (
                    <button className="ghost-button compact-button interactive-button" onClick={() => openEditModal(team)} type="button">
                      Editar
                    </button>
                  ) : null}
                  {canDeleteTeams ? (
                    <button className="danger-button compact-button interactive-button" onClick={() => handleDelete(team)} type="button">
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
                  <h2>{editingTeamId ? "Editar equipe" : "Nova equipe"}</h2>
                </div>
                <button className="ghost-button compact-button interactive-button" onClick={() => setShowModal(false)} type="button">
                  Fechar
                </button>
              </div>
              <div className="glpi-form-grid compact-form-grid">
                <label className="field-block field-full">
                  <span>Nome da equipe</span>
                  <input onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} value={form.name} />
                </label>
                <label className="field-block">
                  <span>Status</span>
                  <select onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} value={form.status}>
                    <option>Ativo</option>
                    <option>Inativo</option>
                  </select>
                </label>
              </div>
              <div className="ticket-create-actions compact-actions">
                <button className="primary-button compact-button interactive-button" type="submit">
                  {editingTeamId ? "Salvar equipe" : "Cadastrar equipe"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default TeamsPage;
