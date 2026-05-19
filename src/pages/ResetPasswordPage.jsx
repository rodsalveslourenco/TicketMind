import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import wegaLogo from "../assets/logo-wega.png";

function ResetPasswordPage() {
  const { resetPassword } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState({ newPassword: "", confirmPassword: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const token = String(searchParams.get("token") || "").trim();

  const updateField = (field) => (event) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!token) {
      setError("O link de recuperacao esta incompleto.");
      return;
    }

    if (!form.newPassword || !form.confirmPassword) {
      setError("Preencha a nova senha e a confirmacao.");
      return;
    }

    if (form.newPassword !== form.confirmPassword) {
      setError("A confirmacao da nova senha nao confere.");
      return;
    }

    try {
      setSubmitting(true);
      await resetPassword({ token, newPassword: form.newPassword });
      navigate("/app/profile", { replace: true });
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setSubmitting(false);
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
            <span className="eyebrow">Seguranca</span>
            <h2>Redefinir senha</h2>
          </div>
          <div className="status-pill">Link temporario</div>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            Nova senha
            <input autoComplete="new-password" onChange={updateField("newPassword")} type="password" value={form.newPassword} />
          </label>

          <label>
            Confirmar nova senha
            <input autoComplete="new-password" onChange={updateField("confirmPassword")} type="password" value={form.confirmPassword} />
          </label>

          {error ? <div className="form-alert">{error}</div> : null}

          <button className="primary-button interactive-button" disabled={submitting} type="submit">
            {submitting ? "Redefinindo..." : "Salvar nova senha"}
          </button>

          <Link className="ghost-link" to="/login">
            Voltar ao login
          </Link>
        </form>
      </section>
    </div>
  );
}

export default ResetPasswordPage;
