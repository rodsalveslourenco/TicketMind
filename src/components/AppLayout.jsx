import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { summary } from "../data/mockData";

const navigation = [
  { to: "/app/dashboard", label: "Visão geral" },
  { to: "/app/tickets", label: "Chamados" },
  { to: "/app/knowledge", label: "Conhecimento" },
  { to: "/app/assets", label: "Ativos e CMDB" },
  { to: "/app/reports", label: "Relatórios" },
  { to: "/app/automations", label: "Regras e SLAs" },
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
            <span>Central de chamados mais simples e organizada</span>
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
          <span className="eyebrow">Resumo do dia</span>
          <strong>{summary.slaCompliance}% dos chamados no prazo</strong>
          <p>{summary.criticalOpen} chamados críticos ainda pedem atenção da equipe.</p>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div>
            <h1>Painel de atendimento</h1>
            <p>Acompanhe a operação, distribua chamados e mantenha tudo sob controle.</p>
          </div>

          <div className="topbar-actions">
            <div className="user-badge">
              <strong>{user?.name}</strong>
              <span>
                {user?.role} • {user?.team}
              </span>
            </div>
            <button className="ghost-button" onClick={logout} type="button">
              Sair
            </button>
          </div>
        </header>

        <main className="page-content">
          <Outlet />
        </main>

        <footer className="app-footer">
          <span>TicketMind é um produto SysteMind.</span>
          <span>Feito para times que precisam atender melhor com menos atrito.</span>
        </footer>
      </div>
    </div>
  );
}

export default AppLayout;
