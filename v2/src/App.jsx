import { useEffect, useMemo, useState } from "react";
import { api } from "./api.js";
import { Reports, CollectionView, COLLECTIONS } from "./modules.jsx";

const LOGO = `${import.meta.env.BASE_URL}logo-wega.png`;
const STATUS_OPTIONS = ["Aberto", "Em andamento", "Em espera", "Pausado", "Aguardando usuario", "Aguardando aprovacao", "Resolvido", "Reaberto"];
const OPEN_STATUSES = ["aberto", "em andamento", "em espera", "pausado", "aguardando usuario", "aguardando aprovacao", "reaberto"];

function norm(v) { return String(v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim(); }
function isOpen(s) { return OPEN_STATUSES.includes(norm(s)); }
function statusClass(s) {
  const n = norm(s);
  if (n === "resolvido") return "s-resolvido";
  if (n === "em andamento") return "s-andamento";
  if (n === "reaberto") return "s-reaberto";
  if (n === "aberto") return "s-aberto";
  return "s-espera";
}
function priorityClass(p) {
  const n = norm(p);
  if (n === "critica") return "p-critica";
  if (n === "alta") return "p-alta";
  if (n === "baixa") return "p-baixa";
  return "p-media";
}
function hasPerm(user, keys) {
  if (!user) return false;
  if (norm(user.role) === "administrador da plataforma" || user.permissionProfileId === "profile-admin") return true;
  const perms = user.permissions || {};
  return keys.some((k) => perms[k]);
}

const MENU = [
  { group: "Operacao", items: [
    { key: "dashboard", label: "Dashboard", icon: "📊" },
    { key: "tickets", label: "Chamados", icon: "🎫" },
    { key: "reports", label: "Relatorios", icon: "📈" },
  ] },
  { group: "Ativos", items: [
    { key: "assets", label: "Ativos", icon: "💻" },
    { key: "brands", label: "Marcas", icon: "🏷️" },
    { key: "models", label: "Modelos", icon: "📦" },
  ] },
  { group: "Gestao", items: [
    { key: "projects", label: "Projetos", icon: "📁" },
    { key: "knowledgeArticles", label: "Base de Conhecimento", icon: "📚" },
  ] },
  { group: "Pessoas", items: [
    { key: "users", label: "Usuarios", icon: "👤", perm: ["users_view", "users_admin"] },
    { key: "teams", label: "Equipes", icon: "👥", perm: ["users_view", "users_admin"] },
    { key: "permissionProfiles", label: "Perfis de Permissao", icon: "🔐", perm: ["users_manage_permissions", "users_admin"] },
  ] },
  { group: "Estrutura", items: [
    { key: "departments", label: "Departamentos", icon: "🏢" },
    { key: "locations", label: "Locais", icon: "📍" },
  ] },
  { group: "Sistema", items: [
    { key: "notificationRules", label: "Notificacoes", icon: "🔔" },
    { key: "logs", label: "Logs do Sistema", icon: "🧾", perm: ["system_logs_view", "users_admin"] },
  ] },
];

function Brand({ light }) {
  return (
    <div className="brand">
      <img src={LOGO} alt="WEGA" className="brand-logo" onError={(e) => { e.target.style.display = "none"; }} />
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
  const submit = async (e) => {
    e.preventDefault(); setError(""); setLoading(true);
    try { const r = await api.login(email.trim(), password); onSuccess(r?.user || null); }
    catch (err) { setError(err.message || "Falha ao entrar."); }
    finally { setLoading(false); }
  };
  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <Brand />
        <p className="brand-sub">Central de chamados — acesse com seu e-mail corporativo.</p>
        {error && <div className="error-banner">{error}</div>}
        <div className="field"><label>E-mail</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required /></div>
        <div className="field"><label>Senha</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
        <button className="btn btn-primary" type="submit" disabled={loading}>{loading ? <span className="spinner" /> : "Entrar"}</button>
      </form>
    </div>
  );
}

function Dashboard({ tickets, onGo }) {
  const m = useMemo(() => {
    const open = tickets.filter((t) => isOpen(t.status));
    return {
      total: tickets.length, open: open.length,
      andamento: tickets.filter((t) => norm(t.status) === "em andamento").length,
      resolvidos: tickets.filter((t) => norm(t.status) === "resolvido").length,
      criticos: open.filter((t) => norm(t.priority) === "critica").length,
      aguardando: open.filter((t) => norm(t.status).startsWith("aguardando") || norm(t.status) === "em espera" || norm(t.status) === "pausado").length,
      recentes: [...tickets].sort((a, b) => String(b.updatedAtIso || b.openedAt || "").localeCompare(String(a.updatedAtIso || a.openedAt || ""))).slice(0, 6),
    };
  }, [tickets]);
  return (
    <div>
      <div className="kpi-grid">
        <div className="kpi" onClick={() => onGo("tickets")} style={{ cursor: "pointer" }}><div className="label">Total de chamados</div><div className="value">{m.total}</div></div>
        <div className="kpi"><div className="label">Em aberto</div><div className="value warn">{m.open}</div></div>
        <div className="kpi"><div className="label">Em andamento</div><div className="value">{m.andamento}</div></div>
        <div className="kpi"><div className="label">Aguardando</div><div className="value">{m.aguardando}</div></div>
        <div className="kpi"><div className="label">Criticos abertos</div><div className="value crit">{m.criticos}</div></div>
        <div className="kpi"><div className="label">Resolvidos</div><div className="value ok">{m.resolvidos}</div></div>
      </div>
      <div className="panel">
        <h2>Chamados recentes</h2>
        <div className="ticket-list">
          {m.recentes.map((t) => (
            <div key={t.id} className={`ticket-card ${priorityClass(t.priority)}`} style={{ cursor: "default" }}>
              <div><div className="ticket-id">{t.id}</div><div className="ticket-meta">{t.priority || "Media"}</div></div>
              <div><div className="ticket-title">{t.title || "(sem titulo)"}</div><div className="ticket-meta">{t.department || t.queue || "—"} · {t.assignee || "Sem responsavel"}</div></div>
              <div><span className={`badge ${statusClass(t.status)}`}>{t.status || "Aberto"}</span></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TicketDrawer({ ticket, onClose, onSave, saving }) {
  const [status, setStatus] = useState(ticket.status || "Aberto");
  const [solution, setSolution] = useState(ticket.resolutionNotes || "");
  useEffect(() => { setStatus(ticket.status || "Aberto"); setSolution(ticket.resolutionNotes || ""); }, [ticket.id]);
  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div><div className="ticket-id">{ticket.id}</div><h3>{ticket.title || "(sem titulo)"}</h3><span className={`badge ${statusClass(ticket.status)}`}>{ticket.status}</span></div>
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
        {ticket.description && (<><div className="section-title">Descricao</div><p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{ticket.description}</p></>)}
        <div className="section-title">Solucao</div>
        <textarea className="solution" value={solution} onChange={(e) => setSolution(e.target.value)} placeholder="Descreva a solucao aplicada antes de resolver..." />
        <div className="section-title">Status</div>
        <div className="drawer-actions">
          <select className="status-select" value={status} onChange={(e) => setStatus(e.target.value)}>{STATUS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}</select>
          <button className="btn btn-ghost" onClick={() => onSave({ ...ticket, status, resolutionNotes: solution })} disabled={saving}>Aplicar status</button>
        </div>
        <div className="drawer-actions">
          {norm(ticket.status) !== "resolvido"
            ? <button className="btn-ok" onClick={() => onSave({ ...ticket, status: "Resolvido", resolutionNotes: solution })} disabled={saving || !solution.trim()}>{saving ? <span className="spinner" /> : "Resolver chamado"}</button>
            : <button className="btn-reopen" onClick={() => onSave({ ...ticket, status: "Reaberto" })} disabled={saving}>Reabrir chamado</button>}
        </div>
        {norm(ticket.status) !== "resolvido" && !solution.trim() && <p style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 8 }}>Informe a solucao para habilitar a resolucao.</p>}
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
      .filter((t) => statusFilter === "abertos" ? isOpen(t.status) : statusFilter === "resolvidos" ? norm(t.status) === "resolvido" : true)
      .filter((t) => !q || norm(`${t.id} ${t.title} ${t.requester} ${t.department} ${t.assignee}`).includes(q))
      .sort((a, b) => String(b.updatedAtIso || b.openedAt || "").localeCompare(String(a.updatedAtIso || a.openedAt || "")));
  }, [tickets, search, statusFilter]);
  const current = selected ? tickets.find((t) => t.id === selected) || null : null;
  return (
    <div>
      <div className="toolbar">
        <input className="search" placeholder="Buscar por id, titulo, solicitante..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="abertos">Em aberto</option><option value="resolvidos">Resolvidos</option><option value="todos">Todos</option>
        </select>
        <span style={{ color: "var(--muted)", fontSize: 13 }}>{filtered.length} chamado(s)</span>
      </div>
      {filtered.length === 0 ? <div className="panel"><div className="empty">Nenhum chamado neste filtro.</div></div> : (
        <div className="ticket-list">
          {filtered.map((t) => (
            <div key={t.id} className={`ticket-card ${priorityClass(t.priority)}`} onClick={() => setSelected(t.id)}>
              <div><div className="ticket-id">{t.id}</div><div className="ticket-meta">{t.priority || "Media"}</div></div>
              <div><div className="ticket-title">{t.title || "(sem titulo)"}</div><div className="ticket-meta">{t.department || t.queue || "—"} · {t.requester || "—"} · {t.assignee || "Sem responsavel"}</div></div>
              <div><span className={`badge ${statusClass(t.status)}`}>{t.status || "Aberto"}</span></div>
            </div>
          ))}
        </div>
      )}
      {current && <TicketDrawer ticket={current} saving={saving} onClose={() => setSelected(null)} onSave={onSave} />}
    </div>
  );
}

function LogsView() {
  const [logs, setLogs] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/system-logs?limit=100", { credentials: "include" });
        const p = await r.json();
        if (!r.ok) throw new Error(p?.error || "Falha ao carregar logs.");
        setLogs(Array.isArray(p?.items) ? p.items : []);
      } catch (err) { setError(err.message); setLogs([]); }
    })();
  }, []);
  if (logs === null) return <div className="panel"><div className="empty"><span className="spinner" style={{ borderTopColor: "#1565c0", borderColor: "#cbd5e1" }} /> Carregando...</div></div>;
  if (error) return <div className="panel"><div className="empty">{error}</div></div>;
  return (
    <CollectionView title="Logs do Sistema" items={logs} columns={[
      { key: "occurredAt", label: "Data", render: (i) => i.occurredAtLabel || i.occurredAt || i.sentAt || "—" },
      { key: "userName", label: "Usuario" }, { key: "module", label: "Modulo" },
      { key: "eventType", label: "Evento" }, { key: "description", label: "Descricao" },
      { key: "status", label: "Status" },
    ]} />
  );
}

export default function App() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState(null);
  const [data, setData] = useState({});
  const [view, setView] = useState("dashboard");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const tickets = Array.isArray(data.tickets) ? data.tickets : [];
  const showToast = (message, kind = "ok") => { setToast({ message, kind }); window.setTimeout(() => setToast(null), 3200); };

  const loadState = async () => {
    const state = await api.state();
    const d = state?.data || state || {};
    setData(d);
    if (d.currentUser) setUser(d.currentUser);
  };

  useEffect(() => {
    (async () => {
      try { const s = await api.session(); if (s?.user) { setUser(s.user); await loadState(); } }
      catch { /* sem sessao */ }
      finally { setBooting(false); }
    })();
  }, []);

  const onLoginSuccess = async (loggedUser) => { if (loggedUser) setUser(loggedUser); setBooting(true); try { await loadState(); } finally { setBooting(false); } };
  const onLogout = async () => { try { await api.logout(); } catch { /* ignore */ } setUser(null); setData({}); };

  const saveTicket = async (nextTicket) => {
    setSaving(true);
    try {
      const saved = await api.saveTicket(nextTicket.id, nextTicket);
      const merged = saved && saved.id ? saved : nextTicket;
      setData((cur) => ({ ...cur, tickets: (cur.tickets || []).map((t) => (t.id === nextTicket.id ? { ...t, ...merged } : t)) }));
      showToast(`Chamado ${nextTicket.id} atualizado.`, "ok");
    } catch (err) { showToast(err.message || "Falha ao salvar o chamado.", "err"); }
    finally { setSaving(false); }
  };

  if (booting) return <div className="center-load"><span className="spinner" style={{ borderTopColor: "#1565c0", borderColor: "#cbd5e1" }} /> &nbsp;Carregando...</div>;
  if (!user) return <Login onSuccess={onLoginSuccess} />;

  const visibleMenu = MENU.map((g) => ({ ...g, items: g.items.filter((it) => !it.perm || hasPerm(user, it.perm)) })).filter((g) => g.items.length);
  const currentItem = MENU.flatMap((g) => g.items).find((it) => it.key === view);
  const collectionCfg = COLLECTIONS[view];

  return (
    <div className="shell">
      <aside className="sidebar">
        <Brand light />
        <nav className="nav">
          {visibleMenu.map((g) => (
            <div key={g.group} className="nav-group">
              <div className="nav-group-title">{g.group}</div>
              {g.items.map((it) => (
                <button key={it.key} className={`nav-item ${view === it.key ? "active" : ""}`} onClick={() => setView(it.key)}>
                  <span className="nav-icon">{it.icon}</span> {it.label}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="nav-spacer" />
        <div className="nav-user">{user.name}<br />{user.email}</div>
        <button className="nav-item" onClick={onLogout}><span className="nav-icon">↩</span> Sair</button>
      </aside>
      <main className="main">
        <div className="topbar">
          <div>
            <h1>{currentItem?.label || "TicketMind 2"}</h1>
            <div className="sub">{view === "dashboard" ? "Visao geral da operacao" : view === "reports" ? "Indicadores e relatorios" : currentItem?.label}</div>
          </div>
          <button className="btn btn-ghost" onClick={() => loadState().then(() => showToast("Atualizado.")).catch(() => showToast("Falha ao atualizar.", "err"))}>Atualizar</button>
        </div>
        {view === "dashboard" && <Dashboard tickets={tickets} onGo={setView} />}
        {view === "tickets" && <TicketsView tickets={tickets} onSave={saveTicket} saving={saving} />}
        {view === "reports" && <Reports tickets={tickets} />}
        {view === "logs" && <LogsView />}
        {collectionCfg && <CollectionView title={collectionCfg.label} items={data[view]} columns={collectionCfg.columns} />}
      </main>
      {toast && <div className={`toast ${toast.kind}`}>{toast.message}</div>}
    </div>
  );
}
