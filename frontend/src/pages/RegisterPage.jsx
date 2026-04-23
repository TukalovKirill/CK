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
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form onSubmit={handleSubmit} className="bg-white p-8 rounded-lg shadow-sm w-full max-w-sm space-y-3">
        <h1 className="text-xl font-bold text-center">Регистрация</h1>
        <input placeholder="Фамилия" value={form.last_name} onChange={set("last_name")}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <input placeholder="Имя" value={form.first_name} onChange={set("first_name")}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <input placeholder="Название компании" value={form.company_name} onChange={set("company_name")}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <input type="email" placeholder="Email" value={form.email} onChange={set("email")} required
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <input type="password" placeholder="Пароль" value={form.password} onChange={set("password")} required minLength={8}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <input type="password" placeholder="Подтверждение пароля" value={form.password2} onChange={set("password2")} required
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={form.agree} onChange={set("agree")} />
          Согласие на обработку данных
        </label>
        <button type="submit" disabled={loading}
          className="w-full bg-blue-600 text-white py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
          {loading ? "Регистрация..." : "Зарегистрироваться"}
        </button>
        <p className="text-sm text-center text-gray-500">
          Есть аккаунт? <Link to="/login" className="text-blue-600 hover:underline">Войти</Link>
        </p>
      </form>
    </div>
  );
}
