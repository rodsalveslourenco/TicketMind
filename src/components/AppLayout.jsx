import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import wegaLogo from "../assets/logo-wega.png";
import { canAccessModule, moduleNavigation } from "../data/permissions";
import { useAppData } from "../data/AppDataContext";

function getInitials(name) {
  return String(name || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "U";
}

function AppLayout() {
  const { user, logout } = useAuth();
  const { dismissToast, notifications, summary } = useAppData();
  const availableNavigation = moduleNavigation.filter((item) => canAccessModule(user, item.module));

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-panel">
          <div className="brand-mark">
            <img alt="Wega Marine" className="brand-mark-image" src={wegaLogo} />
          </div>
          <div>
            <strong>Wega Marine</strong>
            <span>TicketMind by SysteMind</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {availableNavigation.map((item) => (
            <NavLink
              key={item.to}
              className={({ isActive }) => `nav-link interactive-button${isActive ? " is-active" : ""}`}
              to={item.to}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-card">
          <span className="eyebrow">Resumo operacional</span>
          <strong>{summary.slaCompliance}% no SLA</strong>
          <p>{summary.openTickets} chamados | {summary.activeAssets} ativos | {summary.activeProjects} projetos</p>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div>
            <h1>Central de operações</h1>
          </div>
          <div className="topbar-actions">
            <NavLink className="user-badge interactive-button" to="/app/profile">
              <div className="user-avatar">
                {user?.avatar ? (
                  <img alt={user.name} className="user-avatar-image" src={user.avatar} />
                ) : (
                  <span>{getInitials(user?.name)}</span>
                )}
              </div>
              <strong>{user?.name}</strong>
              <span>{user?.role} | {user?.team}</span>
            </NavLink>
            <button className="ghost-button interactive-button" onClick={logout} type="button">
              Sair
            </button>
          </div>
        </header>

        <main className="page-content">
          <Outlet />
        </main>

        <footer className="app-footer">
          <span>
            TicketMind e uma ferramenta desenvolvida por{" "}
            <a href="https://www.systemind.com.br" rel="noreferrer" target="_blank">
              SysteMind
            </a>
          </span>
          <span>{summary.openTickets} chamados abertos</span>
        </footer>
      </div>

      <div className="toast-stack" aria-live="polite">
        {notifications.map((toast) => (
          <button
            className={`toast-card toast-${toast.tone} interactive-button`}
            key={toast.id}
            onClick={() => dismissToast(toast.id)}
            type="button"
          >
            <strong>{toast.title}</strong>
            {toast.detail ? <span>{toast.detail}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

export default AppLayout;
