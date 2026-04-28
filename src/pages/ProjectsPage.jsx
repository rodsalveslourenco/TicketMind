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
  phases: [],
};

const defaultPhaseForm = {
  name: "",
  description: "",
  weight: "",
  completed: false,
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

function computeProjectProgress(phases) {
  return phases
    .filter((phase) => phase.completed)
    .reduce((total, phase) => total + (Number(phase.weight) || 0), 0);
}

function computePhaseDistribution(phases) {
  return phases.reduce((total, phase) => total + (Number(phase.weight) || 0), 0);
}

function ProjectsPage() {
  const { user } = useAuth();
  const { addProject, deleteProject, projects, pushToast, updateProject, users } = useAppData();
  const [form, setForm] = useState(defaultForm);
  const [phaseForm, setPhaseForm] = useState(defaultPhaseForm);
  const [editingPhaseId, setEditingPhaseId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [detailProjectId, setDetailProjectId] = useState(null);
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
  const detailProject = projects.find((project) => project.id === detailProjectId) ?? null;
  const phaseDistribution = useMemo(() => computePhaseDistribution(form.phases || []), [form.phases]);
  const phaseProgress = useMemo(() => computeProjectProgress(form.phases || []), [form.phases]);

  const updateField = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const updatePhaseField = (field) => (event) => {
    const value = field === "completed" ? event.target.checked : event.target.value;
    setPhaseForm((current) => ({ ...current, [field]: value }));
  };

  const resetForm = () => {
    setForm(defaultForm);
    setEditingId(null);
    setPhaseForm(defaultPhaseForm);
    setEditingPhaseId(null);
  };

  const openProjectEditor = (project) => {
    setEditingId(project.id);
    setForm(project);
    setDetailProjectId(null);
    setPhaseForm(defaultPhaseForm);
    setEditingPhaseId(null);
  };

  const handleAddOrUpdatePhase = () => {
    if (!phaseForm.name || phaseForm.weight === "") return;

    const nextPhase = {
      id: editingPhaseId || `phase-${Date.now().toString(36)}`,
      name: phaseForm.name.trim(),
      description: phaseForm.description.trim(),
      weight: Number(phaseForm.weight) || 0,
      completed: Boolean(phaseForm.completed),
    };

    setForm((current) => ({
      ...current,
      phases: editingPhaseId
        ? current.phases.map((phase) => (phase.id === editingPhaseId ? nextPhase : phase))
        : [...(current.phases || []), nextPhase],
    }));
    setPhaseForm(defaultPhaseForm);
    setEditingPhaseId(null);
  };

  const handleEditPhase = (phase) => {
    setEditingPhaseId(phase.id);
    setPhaseForm({
      name: phase.name,
      description: phase.description || "",
      weight: String(phase.weight),
      completed: Boolean(phase.completed),
    });
  };

  const handleDeletePhase = (phaseId) => {
    setForm((current) => ({
      ...current,
      phases: current.phases.filter((phase) => phase.id !== phaseId),
    }));
    if (editingPhaseId === phaseId) {
      setPhaseForm(defaultPhaseForm);
      setEditingPhaseId(null);
    }
  };

  const togglePhaseCompleted = (phaseId) => {
    setForm((current) => ({
      ...current,
      phases: current.phases.map((phase) =>
        phase.id === phaseId ? { ...phase, completed: !phase.completed } : phase,
      ),
    }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (editingId ? !canEditProject : !canCreateProject) return;
    if (!form.name || !form.manager || !form.dueDate) return;
    if (phaseDistribution > 100) {
      pushToast("Distribuicao invalida", "A soma dos percentuais das fases nao pode ultrapassar 100%.", "warning");
      return;
    }
    if (phaseDistribution < 100) {
      pushToast("Distribuicao incompleta", "O projeto foi salvo com fases abaixo de 100% de distribuicao.", "warning");
    }

    const payload = {
      ...form,
      progress: clampProgress(phaseProgress),
      phases: (form.phases || []).map((phase) => ({
        ...phase,
        weight: Number(phase.weight) || 0,
      })),
    };
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
                <input disabled value={phaseProgress} />
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

            <div className="glpi-ticket-form compact-form projects-phases-panel">
              <div className="compact-panel-heading">
                <strong>Fases do projeto</strong>
                <span>{phaseProgress}% concluido | distribuicao {phaseDistribution}%</span>
              </div>

              {phaseDistribution > 100 ? (
                <div className="form-alert">A soma dos percentuais das fases nao pode ultrapassar 100%.</div>
              ) : null}
              {phaseDistribution < 100 ? (
                <div className="projects-phase-note">A distribuicao atual esta abaixo de 100%. O projeto pode ser salvo assim mesmo.</div>
              ) : null}

              <div className="glpi-form-grid compact-form-grid">
                <label className="field-block">
                  <span>Nome da fase</span>
                  <input onChange={updatePhaseField("name")} value={phaseForm.name} />
                </label>
                <label className="field-block field-span-2">
                  <span>Descricao</span>
                  <input onChange={updatePhaseField("description")} value={phaseForm.description} />
                </label>
                <label className="field-block">
                  <span>Percentual</span>
                  <input min="0" onChange={updatePhaseField("weight")} type="number" value={phaseForm.weight} />
                </label>
                <label className="field-block projects-phase-checkbox">
                  <span>Concluida</span>
                  <input checked={phaseForm.completed} onChange={updatePhaseField("completed")} type="checkbox" />
                </label>
              </div>

              <div className="compact-row-actions">
                <button className="ghost-button compact-button interactive-button" onClick={handleAddOrUpdatePhase} type="button">
                  {editingPhaseId ? "Salvar fase" : "Adicionar fase"}
                </button>
                {editingPhaseId ? (
                  <button
                    className="ghost-button compact-button interactive-button"
                    onClick={() => {
                      setPhaseForm(defaultPhaseForm);
                      setEditingPhaseId(null);
                    }}
                    type="button"
                  >
                    Cancelar fase
                  </button>
                ) : null}
              </div>

              <div className="sheet-list projects-phase-list">
                <div className="sheet-row sheet-row-header projects-phase-row">
                  <strong>Concluida</strong>
                  <strong>Fase</strong>
                  <strong>Percentual</strong>
                  <strong>Acoes</strong>
                </div>
                {(form.phases || []).map((phase) => (
                  <div className="sheet-row projects-phase-row" key={phase.id}>
                    <input checked={Boolean(phase.completed)} onChange={() => togglePhaseCompleted(phase.id)} type="checkbox" />
                    <div className="project-row-main">
                      <strong>{phase.name}</strong>
                      <span>{phase.description || "Sem descricao adicional."}</span>
                    </div>
                    <span>{phase.weight}%</span>
                    <div className="compact-row-actions">
                      <button className="ghost-button compact-button interactive-button" onClick={() => handleEditPhase(phase)} type="button">
                        Editar
                      </button>
                      <button className="danger-button compact-button interactive-button" onClick={() => handleDeletePhase(phase.id)} type="button">
                        Excluir
                      </button>
                    </div>
                  </div>
                ))}
                {!form.phases?.length ? (
                  <div className="empty-state">
                    <strong>Nenhuma fase cadastrada.</strong>
                    <span>Adicione fases para o progresso ser calculado automaticamente.</span>
                  </div>
                ) : null}
              </div>
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
                  <button
                    className="sheet-row projects-sheet-row interactive-button"
                    key={project.id}
                    onClick={() => setDetailProjectId(project.id)}
                    type="button"
                  >
                    <div className="project-row-main">
                      <strong>{project.name}</strong>
                      <span>
                        {project.summary || "Resumo nao informado."}
                        {project.phases?.length ? ` | ${project.phases.filter((phase) => phase.completed).length}/${project.phases.length} fases concluidas` : ""}
                      </span>
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
                          onClick={(event) => {
                            event.stopPropagation();
                            openProjectEditor(project);
                          }}
                          type="button"
                        >
                          Editar
                        </button>
                      ) : null}
                      {canDeleteProject ? (
                        <button
                          className="danger-button compact-button interactive-button"
                          onClick={(event) => {
                            event.stopPropagation();
                            deleteProject(project.id);
                            pushToast("Projeto removido", project.name);
                          }}
                          type="button"
                        >
                          Excluir
                        </button>
                      ) : null}
                    </div>
                  </button>
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

      {detailProject ? (
        <div className="ticket-modal-backdrop" onClick={() => setDetailProjectId(null)} role="presentation">
          <div className="ticket-modal board-card compact-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <div className="ticket-modal-header">
              <div>
                <h2>{detailProject.name}</h2>
                <span className="modal-subtitle">
                  {detailProject.manager || "-"} | {detailProject.status} | entrega {formatDate(detailProject.dueDate)}
                </span>
              </div>
              <div className="ticket-detail-actions">
                <button className="ghost-button compact-button interactive-button" onClick={() => setDetailProjectId(null)} type="button">
                  Fechar
                </button>
                {canEditProject ? (
                  <button className="primary-button compact-button interactive-button" onClick={() => openProjectEditor(detailProject)} type="button">
                    Editar
                  </button>
                ) : null}
              </div>
            </div>

            <div className="glpi-ticket-form compact-form projects-detail-modal">
              <div className="glpi-info-strip">
                <div>
                  <span>Status</span>
                  <strong>{detailProject.status}</strong>
                </div>
                <div>
                  <span>Progresso</span>
                  <strong>{detailProject.progress}%</strong>
                </div>
                <div>
                  <span>Prazo</span>
                  <strong>{getDeadlineState(detailProject).label}</strong>
                </div>
              </div>

              <div className="detail-grid compact-form-grid">
                <div className="field-block">
                  <span>Responsavel</span>
                  <strong>{detailProject.manager || "-"}</strong>
                </div>
                <div className="field-block">
                  <span>Patrocinador</span>
                  <strong>{detailProject.sponsor || "-"}</strong>
                </div>
                <div className="field-block">
                  <span>Entrega prevista</span>
                  <strong>{formatDate(detailProject.dueDate)}</strong>
                </div>
              </div>

              <div className="project-row-progress">
                <div className="project-progress-top">
                  <strong>Andamento operacional</strong>
                  <span className={`badge ${getProgressTone(Number(detailProject.progress))}`}>{detailProject.progress}%</span>
                </div>
                <div className="progress-shell project-progress-shell">
                  <div className="progress-bar" style={{ width: `${detailProject.progress}%` }} />
                </div>
              </div>

              <div className="field-block field-full">
                <span>Resumo</span>
                <p className="project-summary">{detailProject.summary || "Resumo nao informado."}</p>
              </div>

              <div className="sheet-list projects-phase-list">
                <div className="sheet-row sheet-row-header projects-phase-row">
                  <strong>Status</strong>
                  <strong>Fase</strong>
                  <strong>Percentual</strong>
                  <strong>Descricao</strong>
                </div>
                {(detailProject.phases || []).map((phase) => (
                  <div className="sheet-row projects-phase-row" key={phase.id}>
                    <span className={`badge ${phase.completed ? "badge-baixa" : "badge-neutral"}`}>
                      {phase.completed ? "Concluida" : "Pendente"}
                    </span>
                    <strong>{phase.name}</strong>
                    <span>{phase.weight}%</span>
                    <span>{phase.description || "-"}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default ProjectsPage;
