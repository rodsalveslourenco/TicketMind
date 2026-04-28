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
        <h1>TicketMind e uma ferramenta criada pela SysteMind.</h1>
      </section>

      <section className="login-panel login-form-panel">
        <div className="login-header">
          <div>
            <span className="eyebrow">Acesso</span>
            <h2>Entrar no TicketMind</h2>
          </div>
          <div className="status-pill">Ambiente interno</div>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            E-mail
            <input
              autoComplete="username"
              onChange={updateField("email")}
              placeholder="usuario@empresa.com"
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

          <button className="primary-button interactive-button" disabled={submitting} type="submit">
            {submitting ? "Validando acesso..." : "Entrar"}
          </button>

          <div className="demo-box">
            <strong>Acesso inicial</strong>
            <span>E-mail padrao: {demoCredentials.email}</span>
            <span>Utilize a senha cadastrada para a conta.</span>
          </div>
        </form>
      </section>
    </div>
  );
}

export default LoginPage;
