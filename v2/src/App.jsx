import { useEffect, useMemo, useState } from "react";
import { api } from "./api.js";

const OPEN_STATUSES = ["aberto", "em andamento", "em espera", "pausado", "aguardando usuario", "aguardando aprovacao", "reaberto"];
const STATUS_OPTIONS = ["Aberto", "Em andamento", "Em espera", "Pausado", "Aguardando usuario", "Aguardando aprovacao", "Resolvido", "Reaberto"];

function norm(value) {
  return String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}
function statusClass(status) {
  const s = norm(status);
  if (s === "resolvido") return "s-resolvido";
  if (s === "em andamento") return "s-andamento";
  if (s === "reaberto") return "s-reaberto";
  if (s === "aberto") return "s-aberto";
  return "s-espera";
}
function priorityClass(p) {
  const s = norm(p);
  if (s === "critica") return "p-critica";
  if (s === "alta") return "p-alta";
  if (s === "baixa") return "p-baixa";
  return "p-media";
}
function isOpen(status) {
  return OPEN_STATUSES.includes(norm(status));
}

function Brand({ light }) {
  return (
    <div className="brand">
      <div className="brand-badge">TM</div>
      <div>
        <div className="brand-name" style={light ? { color: "#fff" } : undefined}>TicketMind 2</div>
        {!light && <div className="brand-sub" style={{ margin: 0 }}>WEGA Marine</div>}
      </div>
    </div>
  );
}

function Login({ onSuccess }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await api.login(email.trim(), password);
      onSuccess(result?.user || null);
    } catch (err) {
      setError(err.message || "Falha ao entrar.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <Brand />
        <p className="brand-sub">Central de chamados — acesse com seu e-mail corporativo.</p>
        {error && <div className="error-banner">{error}</div>}
        <div className="field">
          <label>E-mail</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
        </div>
        <div className="field">
          <label>Senha</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? <span className="spinner" /> : "Entrar"}
        </button>
      </form>
    </div>
  );
}

function Kpi({ label, value, tone }) {
  return (
    <div className="kpi">
      <div className="label">{label}</div>
      <div className={`value ${tone || ""}`}>{value}</div>
    </div>
  );
}

function Dashboard({ tickets }) {
  const m = useMemo(() => {
    const open = tickets.filter((t) => isOpen(t.status));
    return {
      total: tickets.length,
      open: open.length,
      andamento: tickets.filter((t) => norm(t.status) === "em andamento").length,
      resolvidos: tickets.filter((t) => norm(t.status) === "resolvido").length,
      criticos: open.filter((t) => norm(t.priority) === "critica").length,
      aguardando: open.filter((t) => norm(t.status).startsWith("aguardando") || norm(t.status) === "em espera" || norm(t.status) === "pausado").length,
    };
  }, [tickets]);
  return (
    <div>
      <div className="kpi-grid">
        <Kpi label="Total de chamados" value={m.total} />
        <Kpi label="Em aberto" value={m.open} tone="warn" />
        <Kpi label="Em andamento" value={m.andamento} />
        <Kpi label="Aguardando" value={m.aguardando} />
        <Kpi label="Criticos abertos" value={m.criticos} tone="crit" />
        <Kpi label="Resolvidos" value={m.resolvidos} tone="ok" />
      </div>
      <div className="panel">
        <h2>Resumo</h2>
        <p style={{ color: "var(--muted)", margin: 0 }}>
          {m.open} chamado(s) em aberto, sendo {m.criticos} critico(s). {m.resolvidos} ja resolvido(s).
        </p>
      </div>
    </div>
  );
}

function TicketCard({ ticket, onOpen }) {
  return (
    <div className={`ticket-card ${priorityClass(ticket.priority)}`} onClick={() => onOpen(ticket)}>
      <div>
        <div className="ticket-id">{ticket.id}</div>
        <div className="ticket-meta">{ticket.priority || "Media"}</div>
      </div>
      <div>
        <div className="ticket-title">{ticket.title || "(sem titulo)"}</div>
        <div className="ticket-meta">
          {(ticket.department || ticket.queue || "—")} · {ticket.requester || "—"} · {ticket.assignee || "Sem responsavel"}
        </div>
      </div>
      <div><span className={`badge ${statusClass(ticket.status)}`}>{ticket.status || "Aberto"}</span></div>
    </div>
  );
}

function TicketDrawer({ ticket, onClose, onSave, saving }) {
  const [status, setStatus] = useState(ticket.status || "Aberto");
  const [solution, setSolution] = useState(ticket.resolutionNotes || "");
  useEffect(() => {
    setStatus(ticket.status || "Aberto");
    setSolution(ticket.resolutionNotes || "");
  }, [ticket.id]);

  const resolved = norm(status) === "resolvido";
  const handleResolve = () => onSave({ ...ticket, status: "Resolvido", resolutionNotes: solution });
  const handleReopen = () => onSave({ ...ticket, status: "Reaberto" });
  const handleApplyStatus = () => onSave({ ...ticket, status, resolutionNotes: solution });

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <div className="ticket-id">{ticket.id}</div>
            <h3>{ticket.title || "(sem titulo)"}</h3>
            <span className={`badge ${statusClass(ticket.status)}`}>{ticket.status}</span>
          </div>
          <button className="btn btn-ghost" onClick={onClose}>Fechar</button>
        </div>

        <div className="kv">
          <div className="k">Solicitante</div><div>{ticket.requester || "—"}</div>
          <div className="k">Setor</div><div>{ticket.department || ticket.queue || "—"}</div>
          <div className="k">Responsavel</div><div>{ticket.assignee || "Sem responsavel"}</div>
          <div className="k">Prioridade</div><div>{ticket.priority || "Media"}</div>
          <div className="k">Categoria</div><div>{ticket.category || "—"}</div>
          <div className="k">Aberto em</div><div>{ticket.openedAtLabel || ticket.openedAt || "—"}</div>
        </div>

        {ticket.description && (
          <>
            <div className="section-title">Descricao</div>
            <p style={{ margin: 0, color: "var(--text)", whiteSpace: "pre-wrap" }}>{ticket.description}</p>
          </>
        )}

        <div className="section-title">Solucao</div>
        <textarea
          className="solution"
          value={solution}
          onChange={(e) => setSolution(e.target.value)}
          placeholder="Descreva a solucao aplicada antes de resolver o chamado..."
        />

        <div className="section-title">Status</div>
        <div className="drawer-actions">
          <select className="status-select" value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          <button className="btn btn-ghost" onClick={handleApplyStatus} disabled={saving}>Aplicar status</button>
        </div>

        <div className="drawer-actions">
          {norm(ticket.status) !== "resolvido" ? (
            <button className="btn-ok" onClick={handleResolve} disabled={saving || !solution.trim()}>
              {saving ? <span className="spinner" /> : "Resolver chamado"}
            </button>
          ) : (
            <button className="btn-reopen" onClick={handleReopen} disabled={saving}>Reabrir chamado</button>
          )}
        </div>
        {norm(ticket.status) !== "resolvido" && !solution.trim() && (
          <p style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 8 }}>Informe a solucao para habilitar a resolucao.</p>
        )}
      </div>
    </div>
  );
}

function TicketsView({ tickets, onSave, saving }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("abertos");
  const [selected, setSelected] = useState(null);

  const filtered = useMemo(() => {
    const q = norm(search);
    return tickets
      .filter((t) => {
        if (statusFilter === "abertos") return isOpen(t.status);
        if (statusFilter === "resolvidos") return norm(t.status) === "resolvido";
        return true;
      })
      .filter((t) => !q || norm(`${t.id} ${t.title} ${t.requester} ${t.department} ${t.assignee}`).includes(q))
      .sort((a, b) => String(b.updatedAtIso || b.openedAt || "").localeCompare(String(a.updatedAtIso || a.openedAt || "")));
  }, [tickets, search, statusFilter]);

  const current = selected ? tickets.find((t) => t.id === selected) || null : null;

  return (
    <div>
      <div className="toolbar">
        <input className="search" placeholder="Buscar por id, titulo, solicitante..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="abertos">Em aberto</option>
          <option value="resolvidos">Resolvidos</option>
          <option value="todos">Todos</option>
        </select>
        <span style={{ color: "var(--muted)", fontSize: 13 }}>{filtered.length} chamado(s)</span>
      </div>
      {filtered.length === 0 ? (
        <div className="panel"><div className="empty">Nenhum chamado neste filtro.</div></div>
      ) : (
        <div className="ticket-list">
          {filtered.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} onOpen={(t) => setSelected(t.id)} />)}
        </div>
      )}
      {current && (
        <TicketDrawer
          ticket={current}
          saving={saving}
          onClose={() => setSelected(null)}
          onSave={(next) => onSave(next)}
        />
      )}
    </div>
  );
}

export default function App() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [view, setView] = useState("dashboard");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (message, kind = "ok") => {
    setToast({ message, kind });
    window.setTimeout(() => setToast(null), 3200);
  };

  const loadState = async () => {
    const state = await api.state();
    const data = state?.data || state || {};
    setTickets(Array.isArray(data.tickets) ? data.tickets : []);
    if (data.currentUser) setUser(data.currentUser);
  };

  useEffect(() => {
    (async () => {
      try {
        const session = await api.session();
        if (session?.user) {
          setUser(session.user);
          await loadState();
        }
      } catch {
        // sem sessao
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  const onLoginSuccess = async (loggedUser) => {
    setUser(loggedUser);
    setBooting(true);
    try {
      await loadState();
    } finally {
      setBooting(false);
    }
  };

  const onLogout = async () => {
    try { await api.logout(); } catch { /* ignore */ }
    setUser(null);
    setTickets([]);
  };

  const saveTicket = async (nextTicket) => {
    setSaving(true);
    try {
      const saved = await api.saveTicket(nextTicket.id, nextTicket);
      const merged = saved && saved.id ? saved : nextTicket;
      setTickets((current) => current.map((t) => (t.id === nextTicket.id ? { ...t, ...merged } : t)));
      showToast(`Chamado ${nextTicket.id} atualizado.`, "ok");
    } catch (err) {
      showToast(err.message || "Falha ao salvar o chamado.", "err");
    } finally {
      setSaving(false);
    }
  };

  if (booting) return <div className="center-load"><span className="spinner" style={{ borderTopColor: "#1565c0", borderColor: "#cbd5e1" }} /> &nbsp;Carregando...</div>;
  if (!user) return <Login onSuccess={onLoginSuccess} />;

  return (
    <div className="shell">
      <aside className="sidebar">
        <Brand light />
        <button className={`nav-item ${view === "dashboard" ? "active" : ""}`} onClick={() => setView("dashboard")}>📊 Dashboard</button>
        <button className={`nav-item ${view === "tickets" ? "active" : ""}`} onClick={() => setView("tickets")}>🎫 Chamados</button>
        <div className="nav-spacer" />
        <div className="nav-user">{user.name}<br />{user.email}</div>
        <button className="nav-item" onClick={onLogout}>↩ Sair</button>
      </aside>
      <main className="main">
        <div className="topbar">
          <div>
            <h1>{view === "dashboard" ? "Dashboard" : "Chamados"}</h1>
            <div className="sub">{view === "dashboard" ? "Visao geral da operacao" : "Atendimento e resolucao de chamados"}</div>
          </div>
          <button className="btn btn-ghost" onClick={() => loadState().then(() => showToast("Atualizado.")).catch(() => showToast("Falha ao atualizar.", "err"))}>Atualizar</button>
        </div>
        {view === "dashboard" ? <Dashboard tickets={tickets} /> : <TicketsView tickets={tickets} onSave={saveTicket} saving={saving} />}
      </main>
      {toast && <div className={`toast ${toast.kind}`}>{toast.message}</div>}
    </div>
  );
}
