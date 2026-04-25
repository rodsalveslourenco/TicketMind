import { useState } from "react";
import { useAppData } from "../data/AppDataContext";

function AssetsPage() {
  const { addAsset, assets } = useAppData();
  const [form, setForm] = useState({
    name: "",
    type: "",
    owner: "",
    service: "",
    health: "Saudável",
  });

  const updateField = (field) => (event) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!form.name || !form.type || !form.owner || !form.service) {
      return;
    }

    addAsset(form);
    setForm({
      name: "",
      type: "",
      owner: "",
      service: "",
      health: "Saudável",
    });
  };

  return (
    <div className="page-grid">
      <div className="board-card">
        <div className="card-heading">
          <div>
            <h2>Ativos e CMDB</h2>
            <span>Cadastre itens de infraestrutura e relacione o impacto nos serviços atendidos.</span>
          </div>
        </div>

        <form className="data-form compact-form" onSubmit={handleSubmit}>
          <input onChange={updateField("name")} placeholder="Nome do ativo" value={form.name} />
          <input onChange={updateField("type")} placeholder="Tipo ou modelo" value={form.type} />
          <input onChange={updateField("owner")} placeholder="Responsável" value={form.owner} />
          <input onChange={updateField("service")} placeholder="Serviço relacionado" value={form.service} />
          <select onChange={updateField("health")} value={form.health}>
            <option>Saudável</option>
            <option>Monitorado</option>
            <option>Atenção</option>
          </select>
          <button className="ghost-button" type="submit">
            Adicionar ativo
          </button>
        </form>
      </div>

      <div className="board-card">
        <div className="table-list">
          {assets.map((asset) => (
            <div className="table-row" key={asset.id}>
              <div>
                <strong>{asset.name}</strong>
                <span>{asset.type}</span>
              </div>
              <div className="row-stats">
                <span>{asset.owner}</span>
                <span>{asset.health}</span>
                <span>{asset.service}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default AssetsPage;
