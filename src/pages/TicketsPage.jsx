import { tickets } from "../data/mockData";

function TicketsPage() {
  return (
    <div className="board-card">
      <div className="card-heading">
        <div>
          <h2>Gestão de chamados</h2>
          <span>Incidentes, requisições, problemas, mudanças e tarefas em um só lugar.</span>
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
          <strong>Atendimento mais organizado</strong>
          <span>Classificação, prioridade, aprovação, histórico e acompanhamento com menos atrito.</span>
        </article>
        <article className="mini-card">
          <strong>Fluxo operacional claro</strong>
          <span>Triagem, vínculo com ativos, causa raiz, mudanças relacionadas e visão de contexto.</span>
        </article>
        <article className="mini-card">
          <strong>Integrações preparadas</strong>
          <span>Email, webhooks, Teams, ERP, inventário e monitoramento podem entrar na próxima fase.</span>
        </article>
      </div>
    </div>
  );
}

export default TicketsPage;
