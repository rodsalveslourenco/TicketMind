import { useState } from "react";
import { useAppData } from "../data/AppDataContext";

function KnowledgePage() {
  const { addKnowledgeArticle, knowledgeArticles } = useAppData();
  const [form, setForm] = useState({
    title: "",
    category: "Procedimento",
    owner: "",
    summary: "",
  });

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
      </div>

      <div className="board-card">
        <div className="table-list">
          {knowledgeArticles.map((article) => (
            <div className="table-row" key={article.id}>
              <div>
                <strong>{article.title}</strong>
                <span>{article.category}</span>
              </div>
              <div className="row-stats">
                <span>{article.owner}</span>
                <span>{article.lastUpdate}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default KnowledgePage;
