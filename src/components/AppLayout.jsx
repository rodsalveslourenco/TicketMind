import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { summary } from "../data/mockData";

const navigation = [
  { to: "/app/dashboard", label: "Dashboard" },
  { to: "/app/tickets", label: "Chamados" },
  { to: "/app/knowledge", label: "Base de conhecimento" },
  { to: "/app/assets", label: "Ativos e CMDB" },
  { to: "/app/reports", label: "Relatórios" },
  { to: "/app/automations", label: "SLAs e automações" },
  { to: "/app/admin", label: "Administração" },
];

function AppLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-panel">
          <div className="brand-mark">TM</div>
          <div>
            <strong>TicketMind</strong>
            <span>ITSM e service desk</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              className={({ isActive }) => `nav-link${isActive ? " is-active" : ""}`}
              to={item.to}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-card">
          <span className="eyebrow">SLA hoje</span>
          <strong>{summary.slaCompliance}% de conformidade</strong>
          <p>{summary.criticalOpen} chamados críticos ainda exigem ação imediata.</p>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div>
            <h1>Operação central</h1>
            <p>Painel único para atendimento, ativos, conhecimento e governança.</p>
          </div>

          <div className="topbar-actions">
            <div className="user-badge">
              <strong>{user?.name}</strong>
              <span>
                {user?.role} • {user?.team}
              </span>
            </div>
            <button className="ghost-button" onClick={logout} type="button">
              Encerrar sessão
            </button>
          </div>
        </header>

        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default AppLayout;
