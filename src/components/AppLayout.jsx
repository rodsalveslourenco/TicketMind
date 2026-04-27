import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useAppData } from "../data/AppDataContext";

const navigation = [
  { to: "/app/dashboard", label: "Dashboard", permission: "dashboard" },
  { to: "/app/tickets", label: "Chamados", permission: "tickets_view" },
  { to: "/app/assets", label: "Ativos", permission: "assets_view" },
  { to: "/app/projects", label: "Projetos", permission: "projects_view" },
  { to: "/app/api-rest", label: "API REST", permission: "api_view" },
  { to: "/app/users", label: "Usuarios", permission: "users_view" },
];

function AppLayout() {
  const { user, logout } = useAuth();
  const { dismissToast, notifications, summary } = useAppData();
  const availableNavigation = navigation.filter((item) => user?.permissions?.[item.permission] ?? true);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-panel">
          <div className="brand-mark">TM</div>
          <div>
            <strong>TicketMind</strong>
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
            <h1>Central de operacoes</h1>
          </div>
          <div className="topbar-actions">
            <div className="user-badge">
              <strong>{user?.name}</strong>
              <span>{user?.role} | {user?.team}</span>
            </div>
            <button className="ghost-button interactive-button" onClick={logout} type="button">
              Sair
            </button>
          </div>
        </header>

        <main className="page-content">
          <Outlet />
        </main>

        <footer className="app-footer">
          <span>TicketMind</span>
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
