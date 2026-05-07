import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { register } from "../api/auth";
import toast from "react-hot-toast";

export default function RegisterPage() {
  const [form, setForm] = useState({
    last_name: "", first_name: "", company_name: "",
    email: "", password: "", password2: "", agree: false,
  });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.password2) {
      toast.error("Пароли не совпадают");
      return;
    }
    if (!form.agree) {
      toast.error("Необходимо согласие");
      return;
    }
    setLoading(true);
    try {
      await register({
        email: form.email,
        password: form.password,
        first_name: form.first_name,
        last_name: form.last_name,
        company_name: form.company_name,
      });
      toast.success("Регистрация успешна");
      navigate("/login");
    } catch (err) {
      const msg = err.response?.data?.email?.[0] || "Ошибка регистрации";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell dark-texture">
      <form onSubmit={handleSubmit} className="auth-card mx-auto max-w-lg space-y-4">
        <h1 className="text-xl font-bold text-center" style={{ color: "var(--n-fg)" }}>Регистрация</h1>
        <input
          placeholder="Фамилия"
          value={form.last_name}
          onChange={set("last_name")}
          className="input-premium w-full"
        />
        <input
          placeholder="Имя"
          value={form.first_name}
          onChange={set("first_name")}
          className="input-premium w-full"
        />
        <input
          placeholder="Название компании"
          value={form.company_name}
          onChange={set("company_name")}
          className="input-premium w-full"
        />
        <input
          type="email"
          placeholder="Email"
          value={form.email}
          onChange={set("email")}
          required
          className="input-premium w-full"
        />
        <input
          type="password"
          placeholder="Пароль"
          value={form.password}
          onChange={set("password")}
          required
          minLength={8}
          className="input-premium w-full"
        />
        <input
          type="password"
          placeholder="Подтверждение пароля"
          value={form.password2}
          onChange={set("password2")}
          required
          className="input-premium w-full"
        />
        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--n-muted)" }}>
          <input type="checkbox" className="check-premium" checked={form.agree} onChange={set("agree")} />
          Согласие на обработку данных
        </label>
        <button type="submit" disabled={loading} className="btn-save w-full">
          {loading ? "Регистрация..." : "Зарегистрироваться"}
        </button>
        <p className="text-sm text-center" style={{ color: "var(--n-muted)" }}>
          Есть аккаунт?{" "}
          <Link to="/login" className="hover:underline" style={{ color: "var(--n-accent)" }}>Войти</Link>
        </p>
      </form>
    </div>
  );
}
