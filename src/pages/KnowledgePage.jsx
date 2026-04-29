import { useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { hasAnyPermission } from "../data/permissions";
import { useAppData } from "../data/AppDataContext";

function KnowledgePage() {
  const { addKnowledgeArticle, knowledgeArticles } = useAppData();
  const { user } = useAuth();
  const [form, setForm] = useState({
    title: "",
    category: "Procedimento",
    owner: "",
    summary: "",
  });
  const canCreateArticle = hasAnyPermission(user, ["knowledge_create", "knowledge_admin"]);
  const articleList = useMemo(
    () =>
      (knowledgeArticles || []).map((article) => ({
        ...article,
        lastUpdateLabel: article.lastUpdate
          ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(article.lastUpdate))
          : "Sem data",
      })),
    [knowledgeArticles],
  );

  const updateField = (field) => (event) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!form.title || !form.owner || !form.summary) {
      return;
    }

    addKnowledgeArticle(form);
    setForm({
      title: "",
      category: "Procedimento",
      owner: "",
      summary: "",
    });
  };

  return (
    <div className="page-grid">
      <div className="board-card">
        <div className="card-heading">
          <div>
            <h2>Base de conhecimento</h2>
            <span>Procedimentos e artigos de apoio para reduzir tempo de atendimento.</span>
          </div>
        </div>

        {canCreateArticle ? (
          <form className="data-form compact-form" onSubmit={handleSubmit}>
            <input onChange={updateField("title")} placeholder="Título do artigo" value={form.title} />
            <select onChange={updateField("category")} value={form.category}>
              <option>Procedimento</option>
              <option>Acesso</option>
              <option>Aplicações</option>
              <option>Infraestrutura</option>
            </select>
            <input onChange={updateField("owner")} placeholder="Responsável" value={form.owner} />
            <textarea onChange={updateField("summary")} placeholder="Resumo do conteúdo" value={form.summary} />
            <button className="ghost-button" type="submit">
              Publicar artigo
            </button>
          </form>
        ) : (
          <div className="dashboard-empty-state">Seu perfil pode consultar a base, mas não publicar novos artigos.</div>
        )}
      </div>

      <div className="board-card">
        <div className="table-list">
          {articleList.map((article) => (
            <div className="table-row" key={article.id}>
              <div>
                <strong>{article.title}</strong>
                <span>{article.category}</span>
              </div>
              <div className="row-stats">
                <span>{article.owner}</span>
                <span>{article.lastUpdateLabel}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default KnowledgePage;
