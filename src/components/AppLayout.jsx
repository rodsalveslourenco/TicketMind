import { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import wegaLogo from "../assets/logo-wega.png";
import { canAccessModule, hasAnyPermission, moduleNavigation } from "../data/permissions";
import { useAppData } from "../data/AppDataContext";

function getInitials(name) {
  return String(name || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "U";
}

const navigationSections = [
  { title: "Dashboard", modules: ["dashboard", "helpdesk_operations", "helpdesk_technicians"] },
  { title: "Atendimento", modules: ["tickets", "knowledge"] },
  { title: "Operacoes Helpdesk", modules: ["assets", "inventory", "brands_models", "projects"] },
  { title: "Configuracoes", modules: ["api_rest", "users"] },
];

const navigationIcons = {
  dashboard: (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="M3 3h6v6H3V3Zm8 0h6v3h-6V3ZM3 11h3v6H3v-6Zm5 0h9v6H8v-6Z" />
    </svg>
  ),
  helpdesk_operations: (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="M4 4h12v3H4V4Zm0 5h12v3H4V9Zm0 5h8v3H4v-3Z" />
    </svg>
  ),
  helpdesk_technicians: (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="M10 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6ZM4 15a5 5 0 1 1 12 0v2H4v-2Z" />
    </svg>
  ),
  tickets: (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="M4 4h12v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4V4Zm4 3v1h4V7H8Zm0 5v1h4v-1H8Z" />
    </svg>
  ),
  knowledge: (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="M5 4h9a2 2 0 0 1 2 2v10H7a2 2 0 0 0-2 2V4Zm1 2v9.5A3.5 3.5 0 0 1 7 15h7V6H6Z" />
    </svg>
  ),
  assets: (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="M4 5h12v10H4V5Zm2 2v6h8V7H6Z" />
    </svg>
  ),
  inventory: (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="M4 5 10 2l6 3v10l-6 3-6-3V5Zm6-.8L6 6v8l4 2 4-2V6l-4-1.8Z" />
    </svg>
  ),
  brands_models: (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="M10 2 2 6l8 4 8-4-8-4Zm-6 6 6 3 6-3v6l-6 4-6-4V8Z" />
    </svg>
  ),
  projects: (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="M3 4h5v5H3V4Zm9 0h5v5h-5V4ZM3 11h5v5H3v-5Zm9 1h5v3h-5v-3Z" />
    </svg>
  ),
  api_rest: (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="M7 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm10 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM7 15a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm1-10h4v2H8V5Zm4 8H8v-2h4v2Zm1-7h2v8h-2V6Z" />
    </svg>
  ),
  users: (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="M7 6a3 3 0 1 1 0 6 3 3 0 0 1 0-6Zm6 1a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM2 16a5 5 0 0 1 10 0v1H2v-1Zm11-1a4 4 0 0 1 5 2h-5v-2Z" />
    </svg>
  ),
};

function AppLayout() {
  const { user, logout } = useAuth();
  const { dismissToast, notifications, summary } = useAppData();
  const location = useLocation();
  const navigate = useNavigate();
  const [globalSearch, setGlobalSearch] = useState("");
  const availableNavigation = moduleNavigation.filter((item) => canAccessModule(user, item.module));
  const canCreateTicket = hasAnyPermission(user, ["tickets_create", "tickets_admin"]);
  const groupedNavigation = navigationSections
    .map((section) => ({
      ...section,
      items: section.modules
        .map((moduleKey) => availableNavigation.find((item) => item.module === moduleKey))
        .filter(Boolean),
    }))
    .filter((section) => section.items.length);
  const currentPage = availableNavigation.find((item) => location.pathname.startsWith(item.to));

  const handleGlobalSearch = (event) => {
    event.preventDefault();
    const query = globalSearch.trim();
    navigate(query ? `/app/tickets?q=${encodeURIComponent(query)}` : "/app/tickets");
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-panel">
          <div className="brand-mark">
            <img alt="Wega Marine" className="brand-mark-image" src={wegaLogo} />
          </div>
          <div>
            <strong>TicketMind</strong>
            <span>Wega Marine | SysteMind</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {groupedNavigation.map((section) => (
            <div className="sidebar-nav-group" key={section.title}>
              <span className="sidebar-group-title">{section.title}</span>
              <div className="sidebar-group-links">
                {section.items.map((item) => (
                  <NavLink
                    key={item.to}
                    className={({ isActive }) => `nav-link interactive-button${isActive ? " is-active" : ""}`}
                    to={item.to}
                  >
                    <span className="nav-link-icon">{navigationIcons[item.module]}</span>
                    <span>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
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
          <div className="topbar-copy">
            <span className="topbar-kicker">Central de operacoes</span>
            <h1>{currentPage?.label || "Dashboard"}</h1>
          </div>
          <div className="topbar-actions">
            <form className="topbar-search-form" onSubmit={handleGlobalSearch}>
              <input
                className="toolbar-search topbar-search"
                onChange={(event) => setGlobalSearch(event.target.value)}
                placeholder="Buscar chamado por numero, usuario, email, tecnico ou titulo"
                value={globalSearch}
              />
              <button className="ghost-button interactive-button" type="submit">
                Buscar
              </button>
            </form>
            {canCreateTicket ? (
              <button className="primary-button interactive-button topbar-create-button" onClick={() => navigate("/app/tickets?new=1")} type="button">
                Abrir chamado
              </button>
            ) : null}
            <NavLink className="user-badge interactive-button" to="/app/profile">
              <div className="user-avatar">
                {user?.avatar ? <img alt={user.name} className="user-avatar-image" src={user.avatar} /> : <span>{getInitials(user?.name)}</span>}
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

        {canCreateTicket ? (
          <button className="floating-create-button interactive-button" onClick={() => navigate("/app/tickets?new=1")} type="button">
            + Abrir chamado
          </button>
        ) : null}
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
