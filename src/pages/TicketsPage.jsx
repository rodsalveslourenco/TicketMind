import { tickets } from "../data/mockData";

function TicketsPage() {
  return (
    <div className="board-card">
      <div className="card-heading">
        <div>
          <h2>Gestão de chamados</h2>
          <span>Incidentes, requisições, problemas, mudanças e tarefas</span>
        </div>
        <button className="primary-button" type="button">
          Novo chamado
        </button>
      </div>

      <div className="toolbar">
        <span className="filter-pill">Todos</span>
        <span className="filter-pill">Incidentes</span>
        <span className="filter-pill">Mudanças</span>
        <span className="filter-pill">Aguardando aprovação</span>
        <span className="filter-pill">Vencendo SLA</span>
      </div>

      <div className="ticket-table">
        {tickets.map((ticket) => (
          <div className="ticket-table-row" key={ticket.id}>
            <div>
              <strong>{ticket.id}</strong>
              <p>{ticket.title}</p>
            </div>
            <span>{ticket.type}</span>
            <span>{ticket.requester}</span>
            <span>{ticket.assignee}</span>
            <span>{ticket.status}</span>
            <span>{ticket.sla}</span>
          </div>
        ))}
      </div>

      <div className="capabilities-grid">
        <article className="mini-card">
          <strong>Recursos previstos</strong>
          <span>Catálogo de serviços, aprovação multinível, templates, formulários dinâmicos e portal do usuário.</span>
        </article>
        <article className="mini-card">
          <strong>Operação de atendimento</strong>
          <span>Triagem, priorização, vínculo a ativo, causa raiz, mudanças relacionadas e trilha de auditoria.</span>
        </article>
        <article className="mini-card">
          <strong>Integrações comuns</strong>
          <span>Email parser, webhooks, Teams, WhatsApp, ERP, inventário, monitoramento e identidade corporativa.</span>
        </article>
      </div>
    </div>
  );
}

export default TicketsPage;
