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
        <h1>Um sistema de chamados mais claro, leve e fácil de usar.</h1>
        <p>
          Organize o atendimento da sua equipe com uma central simples para chamados,
          conhecimento, ativos, SLAs, relatórios e automações.
        </p>

        <div className="feature-grid">
          <article className="feature-card">
            <strong>Atendimento mais fluido</strong>
            <span>Abra, acompanhe e resolva chamados sem excesso de telas ou complexidade.</span>
          </article>
          <article className="feature-card">
            <strong>Operação bem organizada</strong>
            <span>Filas, ativos, artigos e indicadores no mesmo ambiente de trabalho.</span>
          </article>
          <article className="feature-card">
            <strong>Pronto para evoluir</strong>
            <span>Base preparada para integrações, automações e autenticação real no backend.</span>
          </article>
        </div>
      </section>

      <section className="login-panel login-form-panel">
        <div className="login-header">
          <div>
            <span className="eyebrow">Acesso</span>
            <h2>Entrar no TicketMind</h2>
          </div>
          <div className="status-pill">Demonstração</div>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            Email
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

          {error ? <div className="form-alert">{error}</div> : null}

          <button className="primary-button" disabled={submitting} type="submit">
            {submitting ? "Entrando..." : "Entrar"}
          </button>

          <div className="demo-box">
            <strong>Acesso de demonstração</strong>
            <span>Email: {demoCredentials.email}</span>
            <span>Senha: {demoCredentials.password}</span>
          </div>
        </form>
      </section>
    </div>
  );
}

export default LoginPage;
