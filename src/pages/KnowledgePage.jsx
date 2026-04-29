import { useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { hasAnyPermission } from "../data/permissions";
import { KNOWLEDGE_CATEGORIES } from "../data/helpdesk";
import { useAppData } from "../data/AppDataContext";

const defaultForm = {
  title: "",
  category: "Procedimento",
  problemDescription: "",
  solutionApplied: "",
  keywords: "",
  status: "Ativo",
};

function KnowledgePage() {
  const { addKnowledgeArticle, knowledgeArticles, searchKnowledgeArticles, toggleKnowledgeArticleStatus, updateKnowledgeArticle } = useAppData();
  const { user } = useAuth();
  const [form, setForm] = useState(defaultForm);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState("");

  const canCreateArticle = hasAnyPermission(user, ["knowledge_create", "knowledge_admin"]);
  const canEditArticle = hasAnyPermission(user, ["knowledge_edit", "knowledge_admin"]);
  const canToggleArticle = hasAnyPermission(user, ["knowledge_inactivate", "knowledge_admin"]);

  const filteredArticles = useMemo(() => searchKnowledgeArticles(search, knowledgeArticles), [knowledgeArticles, search, searchKnowledgeArticles]);

  const updateField = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  const resetForm = () => {
    setForm(defaultForm);
    setEditingId("");
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!form.title || !form.problemDescription || !form.solutionApplied) return;

    if (editingId) {
      updateKnowledgeArticle(editingId, form);
    } else {
      addKnowledgeArticle({ ...form, owner: user?.name || "" });
    }
    resetForm();
  };

  const handleEdit = (article) => {
    setEditingId(article.id);
    setForm({
      title: article.title,
      category: article.category,
      problemDescription: article.problemDescription,
      solutionApplied: article.solutionApplied,
      keywords: article.keywords,
      status: article.status,
    });
  };

  return (
    <div className="page-grid">
      <section className="board-card">
        <div className="card-heading">
          <div>
            <h2>Base de conhecimento</h2>
            <span>Cadastro, busca e manutencao de artigos reutilizaveis no atendimento.</span>
          </div>
        </div>

        <div className="toolbar glpi-filter-bar glpi-toolbar-stack">
          <input
            className="toolbar-search"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Pesquisar por titulo, categoria, problema, solucao ou palavra-chave"
            value={search}
          />
        </div>
      </section>

      <section className="board-card">
        <div className="card-heading">
          <div>
            <h2>{editingId ? "Editar artigo" : "Novo artigo"}</h2>
            <span>Problema, solucao aplicada, palavras-chave e status operacional do artigo.</span>
          </div>
        </div>

        {canCreateArticle || canEditArticle ? (
          <form className="data-form compact-form" onSubmit={handleSubmit}>
            <input onChange={updateField("title")} placeholder="Titulo do artigo" value={form.title} />
            <select onChange={updateField("category")} value={form.category}>
              {KNOWLEDGE_CATEGORIES.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
            <textarea onChange={updateField("problemDescription")} placeholder="Descricao do problema" value={form.problemDescription} />
            <textarea onChange={updateField("solutionApplied")} placeholder="Solucao aplicada" value={form.solutionApplied} />
            <input onChange={updateField("keywords")} placeholder="Palavras-chave separadas por virgula" value={form.keywords} />
            <select onChange={updateField("status")} value={form.status}>
              <option>Ativo</option>
              <option>Inativo</option>
            </select>
            <div className="ticket-create-actions compact-actions">
              <button className="primary-button interactive-button" type="submit">
                {editingId ? "Salvar artigo" : "Publicar artigo"}
              </button>
              {editingId ? (
                <button className="ghost-button interactive-button" onClick={resetForm} type="button">
                  Cancelar
                </button>
              ) : null}
            </div>
          </form>
        ) : (
          <div className="dashboard-empty-state">Seu perfil pode consultar a base, mas nao criar ou editar artigos.</div>
        )}
      </section>

      <section className="board-card">
        <div className="card-heading">
          <div>
            <h2>Artigos cadastrados</h2>
            <span>Lista pesquisavel com status, categoria e ultima atualizacao.</span>
          </div>
        </div>

        <div className="ticket-rows ticket-rows-wide">
          {filteredArticles.length ? (
            filteredArticles.map((article) => (
              <article className="ticket-row-card" key={article.id}>
                <div className="ticket-row-main">
                  <div className="ticket-row-title">
                    <strong>{article.title}</strong>
                    <h3>{article.category}</h3>
                  </div>
                  <div className="ticket-row-badges">
                    <span className={`badge ${article.status === "Ativo" ? "status-badge-resolvido" : "status-badge-reaberto"}`}>{article.status}</span>
                  </div>
                </div>
                <div className="ticket-row-meta">
                  <span>{article.owner || "Sem responsavel"}</span>
                  <span>{article.keywords || "Sem palavras-chave"}</span>
                  <span>{article.lastUpdateLabel}</span>
                </div>
                <p className="table-description">{article.problemDescription}</p>
                <p className="table-description"><strong>Solucao:</strong> {article.solutionApplied}</p>
                <div className="ticket-create-actions compact-actions">
                  {canEditArticle ? (
                    <button className="ghost-button interactive-button" onClick={() => handleEdit(article)} type="button">
                      Editar
                    </button>
                  ) : null}
                  {canToggleArticle ? (
                    <button className="ghost-button interactive-button" onClick={() => toggleKnowledgeArticleStatus(article.id)} type="button">
                      {article.status === "Ativo" ? "Inativar" : "Reativar"}
                    </button>
                  ) : null}
                </div>
              </article>
            ))
          ) : (
            <div className="dashboard-empty-state">Nenhum artigo encontrado para o filtro informado.</div>
          )}
        </div>
      </section>
    </div>
  );
}

export default KnowledgePage;
