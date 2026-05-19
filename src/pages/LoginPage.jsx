import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import wegaLogo from "../assets/logo-wega.png";

function LoginPage() {
  const { login, requestPasswordRecovery } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryMessage, setRecoveryMessage] = useState("");

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

  const handleRecovery = async (event) => {
    event.preventDefault();
    setRecovering(true);
    setError("");
    setRecoveryMessage("");

    try {
      const payload = await requestPasswordRecovery(recoveryEmail || form.email);
      setRecoveryMessage(payload?.message || "Se a conta estiver ativa, o link de recuperacao sera enviado.");
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setRecovering(false);
    }
  };

  return (
    <div className="login-shell">
      <section className="login-panel login-copy">
        <img alt="Wega Marine" className="login-brand-image" src={wegaLogo} />
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
              placeholder="usuário@empresa.com"
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
        </form>

        <div className="settings-divider" />

        <form className="login-form" onSubmit={handleRecovery}>
          <label>
            Recuperar senha
            <input
              autoComplete="email"
              onChange={(event) => setRecoveryEmail(event.target.value)}
              placeholder="usuario@empresa.com"
              type="email"
              value={recoveryEmail}
            />
          </label>
          {recoveryMessage ? <div className="status-pill">{recoveryMessage}</div> : null}
          <button className="ghost-button interactive-button" disabled={recovering} type="submit">
            {recovering ? "Enviando link..." : "Enviar link de recuperacao"}
          </button>
        </form>
      </section>
    </div>
  );
}

export default LoginPage;
