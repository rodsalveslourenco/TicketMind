import { assets } from "../data/mockData";

function AssetsPage() {
  return (
    <div className="board-card">
      <div className="card-heading">
        <div>
          <h2>Ativos e CMDB</h2>
          <span>Inventário, dependências, contratos e impacto por serviço de forma mais simples.</span>
        </div>
      </div>

      <div className="table-list">
        {assets.map((asset) => (
          <div className="table-row" key={asset.name}>
            <div>
              <strong>{asset.name}</strong>
              <span>{asset.type}</span>
            </div>
            <div className="row-stats">
              <span>{asset.owner}</span>
              <span>{asset.health}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default AssetsPage;
