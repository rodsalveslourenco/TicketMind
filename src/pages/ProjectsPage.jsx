import { useMemo, useState } from "react";
import UserAutocomplete from "../components/UserAutocomplete";
import { useAuth } from "../auth/AuthContext";
import { hasAnyPermission } from "../data/permissions";
import { useAppData } from "../data/AppDataContext";

const defaultForm = {
  name: "",
  sponsor: "",
  manager: "",
  status: "Planejado",
  progress: 0,
  dueDate: "",
  summary: "",
};

function clampProgress(value) {
  return Math.min(100, Math.max(0, Number(value) || 0));
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T00:00:00`));
}

function getDeadlineState(project) {
  if (!project.dueDate) return { label: "Sem prazo", tone: "badge-neutral", days: null };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(`${project.dueDate}T00:00:00`);
  const diffDays = Math.round((dueDate.getTime() - today.getTime()) / 86400000);

  if (normalizeText(project.status) === "concluido") {
    return { label: "Concluido", tone: "badge-baixa", days: diffDays };
  }

  if (diffDays < 0) {
    return { label: `${Math.abs(diffDays)} dia(s) em atraso`, tone: "badge-critica", days: diffDays };
  }

  if (diffDays <= 7) {
    return { label: `${diffDays} dia(s) restantes`, tone: "badge-alta", days: diffDays };
  }

  return { label: `${diffDays} dia(s) restantes`, tone: "badge-neutral", days: diffDays };
}

function getProgressTone(progress) {
  if (progress >= 80) return "badge-baixa";
  if (progress >= 40) return "badge-neutral";
  return "badge-alta";
}

function ProjectsPage() {
  const { user } = useAuth();
  const { addProject, deleteProject, projects, pushToast, updateProject, users } = useAppData();
  const [form, setForm] = useState(defaultForm);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const canCreateProject = hasAnyPermission(user, ["projects_create", "projects_admin"]);
  const canEditProject = hasAnyPermission(user, ["projects_edit", "projects_admin"]);
  const canDeleteProject = hasAnyPermission(user, ["projects_delete", "projects_admin"]);
  const canManageTasks = hasAnyPermission(user, ["projects_manage_tasks", "projects_admin"]);

  const orderedProjects = useMemo(() => {
    const normalizedSearch = normalizeText(search);

    return projects
      .slice()
      .sort((left, right) => left.name.localeCompare(right.name))
      .filter((project) => {
        if (statusFilter !== "Todos" && project.status !== statusFilter) return false;
        if (!normalizedSearch) return true;
        return [project.name, project.sponsor, project.manager, project.status, project.summary]
          .some((field) => normalizeText(field).includes(normalizedSearch));
      });
  }, [projects, search, statusFilter]);

  const overdueProjects = useMemo(
    () => orderedProjects.filter((project) => getDeadlineState(project).days !== null && getDeadlineState(project).days < 0),
    [orderedProjects],
  );

  const updateField = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const resetForm = () => {
    setForm(defaultForm);
    setEditingId(null);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (editingId ? !canEditProject : !canCreateProject) return;
    if (!form.name || !form.manager || !form.dueDate) return;

    const payload = { ...form, progress: clampProgress(form.progress) };
    if (editingId) {
      updateProject(editingId, payload);
      pushToast("Projeto atualizado", form.name);
    } else {
      addProject(payload);
      pushToast("Projeto cadastrado", form.name);
    }
    resetForm();
  };

  return (
    <div className="users-page projects-page">
      <section className="module-hero board-card">
        <div>
          <span className="eyebrow">Projetos</span>
          <h2>Projetos</h2>
        </div>
        <div className="insight-strip">
          <div className="insight-chip">
            <strong>{orderedProjects.length}</strong>
            <span>frentes cadastradas</span>
          </div>
          <div className="insight-chip">
            <strong>{orderedProjects.filter((project) => project.status === "Em andamento").length}</strong>
            <span>em andamento</span>
          </div>
          <div className="insight-chip">
            <strong>{orderedProjects.filter((project) => Number(project.progress) >= 70).length}</strong>
            <span>fase final</span>
          </div>
          <div className="insight-chip">
            <strong>{overdueProjects.length}</strong>
            <span>atrasados</span>
          </div>
        </div>
      </section>

      <section className="module-grid">
        <section className="board-card glpi-panel">
          <div className="glpi-toolbar">
            <div>
              <h2>{editingId ? "Editar projeto" : "Cadastro operacional"}</h2>
            </div>
          </div>

          <form className="glpi-ticket-form user-form" onSubmit={handleSubmit}>
            <div className="glpi-form-grid">
              <label className="field-block field-span-2">
                <span>Projeto</span>
                <input disabled={editingId ? !canEditProject : !canCreateProject} onChange={updateField("name")} value={form.name} />
              </label>
              <label className="field-block">
                <span>Patrocinador</span>
                <input disabled={editingId ? !canEditProject : !canCreateProject} onChange={updateField("sponsor")} value={form.sponsor} />
              </label>
              <label className="field-block">
                <span>Responsavel</span>
                <UserAutocomplete
                  disabled={!canManageTasks && editingId}
                  onChange={(nextValue) => setForm((current) => ({ ...current, manager: nextValue }))}
                  placeholder="Comece a digitar um usuario"
                  users={users}
                  value={form.manager}
                />
              </label>
              <label className="field-block">
                <span>Status</span>
                <select disabled={!canManageTasks && editingId} onChange={updateField("status")} value={form.status}>
                  <option>Planejado</option>
                  <option>Em andamento</option>
                  <option>Em risco</option>
                  <option>Concluido</option>
                </select>
              </label>
              <label className="field-block">
                <span>Progresso (%)</span>
                <input disabled={!canManageTasks && editingId} max="100" min="0" onChange={updateField("progress")} type="number" value={form.progress} />
              </label>
              <label className="field-block">
                <span>Entrega</span>
                <input disabled={editingId ? !canEditProject : !canCreateProject} onChange={updateField("dueDate")} type="date" value={form.dueDate} />
              </label>
              <label className="field-block field-full">
                <span>Resumo</span>
                <textarea disabled={editingId ? !canEditProject : !canCreateProject} onChange={updateField("summary")} value={form.summary} />
              </label>
            </div>

            <div className="ticket-create-actions">
              {(editingId ? canEditProject : canCreateProject) ? (
                <button className="primary-button interactive-button" type="submit">
                  {editingId ? "Salvar projeto" : "Cadastrar projeto"}
                </button>
              ) : null}
              {editingId ? (
                <button className="ghost-button interactive-button" onClick={resetForm} type="button">
                  Cancelar
                </button>
              ) : null}
            </div>
          </form>
        </section>

        <section className="board-card glpi-panel projects-panel">
          <div className="glpi-toolbar projects-toolbar">
            <div>
              <h2>Carteira de projetos</h2>
            </div>
            <div className="toolbar">
              <button
                className={`filter-pill interactive-button${statusFilter === "Todos" ? " is-active" : ""}`}
                onClick={() => setStatusFilter("Todos")}
                type="button"
              >
                Todos
              </button>
              {["Planejado", "Em andamento", "Em risco", "Concluido"].map((status) => (
                <button
                  key={status}
                  className={`filter-pill interactive-button${statusFilter === status ? " is-active" : ""}`}
                  onClick={() => setStatusFilter(status)}
                  type="button"
                >
                  {status}
                </button>
              ))}
              <input
                className="toolbar-search"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por projeto, patrocinador, responsavel ou resumo"
                value={search}
              />
            </div>
          </div>

          <div className="sheet-list projects-sheet">
            <div className="sheet-row sheet-row-header projects-sheet-row projects-sheet-row-header">
              <strong>Projeto</strong>
              <strong>Status</strong>
              <strong>Progresso</strong>
              <strong>Responsavel</strong>
              <strong>Patrocinador</strong>
              <strong>Entrega</strong>
              <strong>Acoes</strong>
            </div>

            {orderedProjects.length ? (
              orderedProjects.map((project) => {
                const deadline = getDeadlineState(project);
                return (
                  <div className="sheet-row projects-sheet-row" key={project.id}>
                    <div className="project-row-main">
                      <strong>{project.name}</strong>
                      <span>{project.summary || "Resumo nao informado."}</span>
                    </div>
                    <div className="project-row-stack">
                      <span className="badge badge-neutral">{project.status}</span>
                      <span className={`badge ${deadline.tone}`}>{deadline.label}</span>
                    </div>
                    <div className="project-row-progress">
                      <div className="project-progress-top">
                        <strong>{project.progress}%</strong>
                        <span className={`badge ${getProgressTone(Number(project.progress))}`}>
                          {Number(project.progress) >= 80 ? "Avancado" : Number(project.progress) >= 40 ? "Em curso" : "Inicio"}
                        </span>
                      </div>
                      <div className="progress-shell project-progress-shell">
                        <div className="progress-bar" style={{ width: `${project.progress}%` }} />
                      </div>
                    </div>
                    <span>{project.manager || "-"}</span>
                    <span>{project.sponsor || "-"}</span>
                    <span>{formatDate(project.dueDate)}</span>
                    <div className="compact-row-actions">
                      {canEditProject ? (
                        <button
                          className="ghost-button compact-button interactive-button"
                          onClick={() => {
                            setEditingId(project.id);
                            setForm(project);
                          }}
                          type="button"
                        >
                          Editar
                        </button>
                      ) : null}
                      {canDeleteProject ? (
                        <button
                          className="danger-button compact-button interactive-button"
                          onClick={() => {
                            deleteProject(project.id);
                            pushToast("Projeto removido", project.name);
                          }}
                          type="button"
                        >
                          Excluir
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="empty-state">
                <strong>Nenhum projeto encontrado.</strong>
                <span>Ajuste os filtros ou cadastre uma nova frente.</span>
              </div>
            )}
          </div>
        </section>
      </section>
    </div>
  );
}

export default ProjectsPage;
