import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useAppData } from "../data/AppDataContext";

const navigation = [
  { to: "/app/dashboard", label: "Visão geral" },
  { to: "/app/tickets", label: "Chamados" },
  { to: "/app/knowledge", label: "Conhecimento" },
];

function AppLayout() {
  const { user, logout } = useAuth();
  const { summary } = useAppData();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-panel">
          <div className="brand-mark">TM</div>
          <div>
            <strong>TicketMind</strong>
            <span>Service desk e gestão de chamados</span>
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
          <span className="eyebrow">Monitoramento</span>
          <strong>{summary.slaCompliance}% dos chamados no prazo</strong>
          <p>{summary.criticalOpen} chamados críticos em tratamento no momento.</p>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div>
            <h1>Central de atendimento</h1>
            <p>Controle a fila, acompanhe o atendimento e trate cada chamado com contexto completo.</p>
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
          <span>Projetado para operações de atendimento com padrão profissional.</span>
        </footer>
      </div>
    </div>
  );
}

export default AppLayout;
