import { knowledgeArticles } from "../data/mockData";

function KnowledgePage() {
  return (
    <div className="board-card">
      <div className="card-heading">
        <div>
          <h2>Base de conhecimento</h2>
          <span>Artigos, runbooks, FAQs e documentação útil para o dia a dia.</span>
        </div>
        <button className="ghost-button" type="button">
          Novo artigo
        </button>
      </div>

      <div className="table-list">
        {knowledgeArticles.map((article) => (
          <div className="table-row" key={article.title}>
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
  );
}

export default KnowledgePage;
