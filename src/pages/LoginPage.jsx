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
        <h1>Plataforma profissional para operação de chamados.</h1>
        <p>
          Registre solicitações, trate incidentes, acompanhe SLA e mantenha cada atendimento
          documentado com histórico, responsáveis e anexos.
        </p>

        <div className="feature-grid">
          <article className="feature-card">
            <strong>Fila operacional</strong>
            <span>Lista de chamados com seleção rápida, prioridade, status e responsável.</span>
          </article>
          <article className="feature-card">
            <strong>Tratativa completa</strong>
            <span>Atualize o ticket com descrição técnica, notas de resolução e evidências.</span>
          </article>
          <article className="feature-card">
            <strong>Base de apoio</strong>
            <span>Documente procedimentos para reduzir retrabalho no atendimento.</span>
          </article>
        </div>
      </section>

      <section className="login-panel login-form-panel">
        <div className="login-header">
          <div>
            <span className="eyebrow">Acesso</span>
            <h2>Entrar no TicketMind</h2>
          </div>
          <div className="status-pill">Ambiente de demonstração</div>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            E-mail
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
            {submitting ? "Validando acesso..." : "Entrar"}
          </button>

          <div className="demo-box">
            <strong>Acesso de demonstração</strong>
            <span>E-mail: {demoCredentials.email}</span>
            <span>Senha: {demoCredentials.password}</span>
          </div>
        </form>
      </section>
    </div>
  );
}

export default LoginPage;
