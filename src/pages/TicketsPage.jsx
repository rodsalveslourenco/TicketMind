import { useMemo, useState } from "react";
import { useAppData } from "../data/AppDataContext";

function TicketsPage() {
  const { createTicket, tickets, updateTicketStatus } = useAppData();
  const [filter, setFilter] = useState("Todos");
  const [form, setForm] = useState({
    title: "",
    type: "Incidente",
    priority: "Média",
    requester: "",
    assignee: "",
    queue: "Service Desk",
    description: "",
  });

  const filteredTickets = useMemo(() => {
    if (filter === "Todos") {
      return tickets;
    }

    if (filter === "Vencendo SLA") {
      return tickets.filter((ticket) => ticket.sla.toLowerCase().includes("min"));
    }

    return tickets.filter((ticket) => ticket.type === filter || ticket.status === filter);
  }, [filter, tickets]);

  const updateField = (field) => (event) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!form.title || !form.requester || !form.description) {
      return;
    }

    createTicket(form);
    setForm({
      title: "",
      type: "Incidente",
      priority: "Média",
      requester: "",
      assignee: "",
      queue: "Service Desk",
      description: "",
    });
  };

  return (
    <div className="page-grid">
      <div className="board-card">
        <div className="card-heading">
          <div>
            <h2>Gestão de chamados</h2>
            <span>Registre incidentes, requisições, problemas e mudanças com acompanhamento completo.</span>
          </div>
        </div>

        <form className="data-form" onSubmit={handleSubmit}>
          <input onChange={updateField("title")} placeholder="Título do chamado" value={form.title} />
          <select onChange={updateField("type")} value={form.type}>
            <option>Incidente</option>
            <option>Requisição</option>
            <option>Problema</option>
            <option>Mudança</option>
          </select>
          <select onChange={updateField("priority")} value={form.priority}>
            <option>Baixa</option>
            <option>Média</option>
            <option>Alta</option>
            <option>Crítica</option>
          </select>
          <input onChange={updateField("requester")} placeholder="Solicitante" value={form.requester} />
          <input onChange={updateField("assignee")} placeholder="Responsável inicial" value={form.assignee} />
          <select onChange={updateField("queue")} value={form.queue}>
            <option>Service Desk</option>
            <option>Infraestrutura</option>
            <option>Aplicações</option>
            <option>Segurança</option>
            <option>Projetos e mudanças</option>
          </select>
          <textarea
            onChange={updateField("description")}
            placeholder="Descreva o atendimento solicitado"
            value={form.description}
          />
          <button className="primary-button" type="submit">
            Abrir chamado
          </button>
        </form>
      </div>

      <div className="board-card">
        <div className="card-heading">
          <div>
            <h2>Fila de atendimento</h2>
            <span>Filtre, acompanhe e atualize o status dos chamados em aberto.</span>
          </div>
        </div>

        <div className="toolbar">
          {["Todos", "Incidente", "Mudança", "Aguardando aprovação", "Vencendo SLA"].map((item) => (
            <button
              key={item}
              className={`filter-pill${filter === item ? " is-active" : ""}`}
              onClick={() => setFilter(item)}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>

        <div className="ticket-table">
          {filteredTickets.map((ticket) => (
            <div className="ticket-table-row" key={ticket.id}>
              <div>
                <strong>{ticket.id}</strong>
                <p>{ticket.title}</p>
              </div>
              <span>{ticket.type}</span>
              <span>{ticket.requester}</span>
              <span>{ticket.assignee}</span>
              <select
                className="inline-select"
                onChange={(event) => updateTicketStatus(ticket.id, event.target.value)}
                value={ticket.status}
              >
                <option>Aberto</option>
                <option>Em atendimento</option>
                <option>Aguardando aprovação</option>
                <option>Planejada</option>
                <option>Análise de causa</option>
                <option>Resolvido</option>
              </select>
              <span>{ticket.sla}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default TicketsPage;
