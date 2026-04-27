import { useMemo, useState } from "react";
import UserAutocomplete from "../components/UserAutocomplete";
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

function ProjectsPage() {
  const { addProject, deleteProject, projects, pushToast, updateProject, users } = useAppData();
  const [form, setForm] = useState(defaultForm);
  const [editingId, setEditingId] = useState(null);

  const orderedProjects = useMemo(
    () => projects.slice().sort((left, right) => left.name.localeCompare(right.name)),
    [projects],
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
    <div className="users-page">
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
        </div>
      </section>

      <section className="module-grid">
        <section className="board-card glpi-panel">
          <div className="glpi-toolbar">
            <div>
              <h2>{editingId ? "Editar projeto" : "Projetos"}</h2>
            </div>
          </div>

          <form className="glpi-ticket-form user-form" onSubmit={handleSubmit}>
            <div className="glpi-form-grid">
              <label className="field-block field-span-2">
                <span>Projeto</span>
                <input onChange={updateField("name")} value={form.name} />
              </label>
              <label className="field-block">
                <span>Patrocinador</span>
                <input onChange={updateField("sponsor")} value={form.sponsor} />
              </label>
              <label className="field-block">
                <span>Responsavel</span>
                <UserAutocomplete
                  onChange={(nextValue) => setForm((current) => ({ ...current, manager: nextValue }))}
                  placeholder="Comece a digitar um usuario"
                  users={users}
                  value={form.manager}
                />
              </label>
              <label className="field-block">
                <span>Status</span>
                <select onChange={updateField("status")} value={form.status}>
                  <option>Planejado</option>
                  <option>Em andamento</option>
                  <option>Em risco</option>
                  <option>Concluido</option>
                </select>
              </label>
              <label className="field-block">
                <span>Progresso (%)</span>
                <input max="100" min="0" onChange={updateField("progress")} type="number" value={form.progress} />
              </label>
              <label className="field-block">
                <span>Entrega</span>
                <input onChange={updateField("dueDate")} type="date" value={form.dueDate} />
              </label>
              <label className="field-block field-full">
                <span>Resumo</span>
                <textarea onChange={updateField("summary")} value={form.summary} />
              </label>
            </div>

            <div className="ticket-create-actions">
              <button className="primary-button interactive-button" type="submit">
                {editingId ? "Salvar projeto" : "Cadastrar projeto"}
              </button>
              {editingId ? (
                <button className="ghost-button interactive-button" onClick={resetForm} type="button">
                  Cancelar
                </button>
              ) : null}
            </div>
          </form>
        </section>

        <section className="dashboard-column">
          {orderedProjects.map((project) => (
            <article className="board-card project-card" key={project.id}>
              <div className="card-heading">
                <div>
                  <h2>{project.name}</h2>
                  <span>{project.manager} | {project.status}</span>
                </div>
                <span className="badge badge-neutral">{project.progress}%</span>
              </div>
              <p className="project-summary">{project.summary}</p>
              <div className="progress-shell progress-shell-spaced">
                <div className="progress-bar" style={{ width: `${project.progress}%` }} />
              </div>
              <div className="row-stats row-stats-wrap">
                <span>{project.sponsor}</span>
                <span>Entrega {project.dueDate}</span>
              </div>
              <div className="ticket-create-actions">
                <button
                  className="ghost-button interactive-button"
                  onClick={() => {
                    setEditingId(project.id);
                    setForm(project);
                  }}
                  type="button"
                >
                  Editar
                </button>
                <button
                  className="danger-button interactive-button"
                  onClick={() => {
                    deleteProject(project.id);
                    pushToast("Projeto removido", project.name);
                  }}
                  type="button"
                >
                  Excluir
                </button>
              </div>
            </article>
          ))}
        </section>
      </section>
    </div>
  );
}

export default ProjectsPage;
