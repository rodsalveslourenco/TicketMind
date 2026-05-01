import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import wegaLogo from "../assets/logo-wega.png";
import { canAccessModule, hasAnyPermission } from "../data/permissions";
import { useAppData } from "../data/AppDataContext";

function getInitials(name) {
  return String(name || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "U";
}

const SIDEBAR_STATE_KEY = "ticketmind.sidebar.sections";

const defaultExpandedSections = {
  attendance: true,
  operations: true,
  technicians: true,
  settings: true,
};

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
  service_center: (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="M4 4h5v5H4V4Zm7 0h5v5h-5V4ZM4 11h5v5H4v-5Zm10-1.5 1.2 1.2-2.7 2.7L11 11.9l-1.1 1.1 2.6 2.6 3.5-3.5-2-2Z" />
    </svg>
  ),
  notifications: (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="M10 3a4 4 0 0 1 4 4v2.6c0 .8.3 1.6.8 2.2l1.2 1.4V15H4v-1.8l1.2-1.4c.5-.6.8-1.4.8-2.2V7a4 4 0 0 1 4-4Zm0 14a2.5 2.5 0 0 0 2.4-2H7.6A2.5 2.5 0 0 0 10 17Z" />
    </svg>
  ),
  email_layouts: (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="M3 4h14v12H3V4Zm2 2v1.2l5 3.5 5-3.5V6H5Zm10 8V9.1l-5 3.5-5-3.5V14h10Z" />
    </svg>
  ),
  system_logs: (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="M4 3h9l3 3v11H4V3Zm2 2v10h8V7h-3V4H6Zm1 4h6v1.5H7V9Zm0 3h6v1.5H7V12Z" />
    </svg>
  ),
};

function AppLayout() {
  const { user, logout } = useAuth();
  const { dismissToast, notifications, summary, navigationSections, permissionCatalog } = useAppData();
  const location = useLocation();
  const navigate = useNavigate();
  const [globalSearch, setGlobalSearch] = useState("");
  const [expandedSections, setExpandedSections] = useState(() => {
    try {
      const storedValue = window.localStorage.getItem(SIDEBAR_STATE_KEY);
      return storedValue ? { ...defaultExpandedSections, ...JSON.parse(storedValue) } : defaultExpandedSections;
    } catch (error) {
      return defaultExpandedSections;
    }
  });
  const canCreateTicket = hasAnyPermission(user, ["tickets_create", "tickets_admin"]);
  const groupedNavigation = useMemo(
    () =>
      navigationSections
        .map((section) => ({
          ...section,
          items: section.items.filter((item) => canAccessModule(user, item.module, permissionCatalog)),
        }))
        .filter((section) => section.items.length),
    [navigationSections, permissionCatalog, user],
  );
  const availableNavigation = useMemo(() => groupedNavigation.flatMap((section) => section.items), [groupedNavigation]);
  const currentPage = useMemo(
    () =>
      availableNavigation
        .slice()
        .sort((left, right) => right.to.length - left.to.length)
        .find((item) => location.pathname.startsWith(item.to)),
    [availableNavigation, location.pathname],
  );

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_STATE_KEY, JSON.stringify(expandedSections));
  }, [expandedSections]);

  const handleGlobalSearch = (event) => {
    event.preventDefault();
    const query = globalSearch.trim();
    navigate(query ? `/app/tickets?q=${encodeURIComponent(query)}` : "/app/tickets");
  };

  const toggleSection = (sectionKey) => {
    setExpandedSections((current) => ({ ...current, [sectionKey]: !current[sectionKey] }));
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
            <div
              className={`sidebar-nav-group${section.items.some((item) => location.pathname.startsWith(item.to)) ? " is-current" : ""}`}
              key={section.key}
            >
              <div className="sidebar-group-header">
                <span className="sidebar-group-title">{section.title}</span>
                {section.collapsible ? (
                  <button
                    aria-expanded={expandedSections[section.key]}
                    className="sidebar-group-toggle interactive-button"
                    onClick={() => toggleSection(section.key)}
                    type="button"
                  >
                    <span className={`sidebar-group-chevron${expandedSections[section.key] ? " is-open" : ""}`}>⌄</span>
                  </button>
                ) : null}
              </div>
              <div className={`sidebar-group-links${section.collapsible && !expandedSections[section.key] ? " is-collapsed" : ""}`}>
                {section.items.map((item) => (
                  <NavLink
                    key={item.to}
                    className={({ isActive }) => `nav-link interactive-button${isActive ? " is-active" : ""}`}
                    to={item.to}
                  >
                    <span className="nav-link-icon">{navigationIcons[item.icon] || navigationIcons.dashboard}</span>
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
