import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import toast from "react-hot-toast";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || "/profile";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch {
      toast.error("Неверный email или пароль");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell dark-texture">
      <form onSubmit={handleSubmit} className="auth-card mx-auto max-w-lg space-y-4">
        <h1 className="text-xl font-bold text-center" style={{ color: "var(--n-fg)" }}>Вход</h1>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="input-premium w-full"
        />
        <input
          type="password"
          placeholder="Пароль"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="input-premium w-full"
        />
        <button
          type="submit"
          disabled={loading}
          className="btn-save w-full"
        >
          {loading ? "Вход..." : "Войти"}
        </button>
        <p className="text-sm text-center" style={{ color: "var(--n-muted)" }}>
          Нет аккаунта?{" "}
          <Link to="/register" className="hover:underline" style={{ color: "var(--n-accent)" }}>
            Зарегистрироваться
          </Link>
        </p>
      </form>
    </div>
  );
}
