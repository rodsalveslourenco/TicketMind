import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

function LoginPage() {
  const { login, demoCredentials } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState(demoCredentials);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const from = location.state?.from?.pathname || "/app/dashboard";

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      await login(form);
      navigate(from, { replace: true });
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setSubmitting(false);
    }
  };

  const updateField = (field) => (event) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  return (
    <div className="login-shell">
      <section className="login-panel login-copy">
        <span className="eyebrow">TicketMind</span>
        <h1>Service desk em React com base para um ITSM completo.</h1>
        <p>
          Estrutura pronta para chamados, catálogo de serviços, base de conhecimento,
          CMDB, SLAs, automações, relatórios, aprovações, trilha de auditoria e integração
          com autenticação real.
        </p>

        <div className="feature-grid">
          <article className="feature-card">
            <strong>Segurança preparada</strong>
            <span>Rotas protegidas, MFA no fluxo e arquitetura pronta para backend/SSO.</span>
          </article>
          <article className="feature-card">
            <strong>Operação centralizada</strong>
            <span>Chamados, ativos, artigos, filas, SLAs e relatórios no mesmo painel.</span>
          </article>
          <article className="feature-card">
            <strong>Escalável para produção</strong>
            <span>Separação clara entre autenticação, layout, dados e módulos de negócio.</span>
          </article>
        </div>
      </section>

      <section className="login-panel login-form-panel">
        <div className="login-header">
          <div>
            <span className="eyebrow">Acesso seguro</span>
            <h2>Entrar no TicketMind</h2>
          </div>
          <div className="status-pill">MFA exigido</div>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            Email corporativo
            <input
              autoComplete="username"
              onChange={updateField("email")}
              placeholder="admin@ticketmind.local"
              type="email"
              value={form.email}
            />
          </label>

          <label>
            Senha
            <input
              autoComplete="current-password"
              onChange={updateField("password")}
              placeholder="Sua senha"
              type="password"
              value={form.password}
            />
          </label>

          <label>
            Código MFA
            <input
              inputMode="numeric"
              onChange={updateField("otp")}
              placeholder="6 dígitos"
              value={form.otp}
            />
          </label>

          {error ? <div className="form-alert">{error}</div> : null}

          <button className="primary-button" disabled={submitting} type="submit">
            {submitting ? "Validando..." : "Entrar com segurança"}
          </button>

          <div className="demo-box">
            <strong>Credenciais de demonstração</strong>
            <span>Email: {demoCredentials.email}</span>
            <span>Senha: {demoCredentials.password}</span>
            <span>MFA: {demoCredentials.otp}</span>
          </div>
        </form>
      </section>
    </div>
  );
}

export default LoginPage;
