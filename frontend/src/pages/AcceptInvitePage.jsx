import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { acceptInvite } from "../api/auth";
import toast from "react-hot-toast";

export default function AcceptInvitePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();

  const [form, setForm] = useState({
    password: "", password2: "", birth_date: "", agree: false,
  });
  const [loading, setLoading] = useState(false);

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
      await acceptInvite({
        token,
        password: form.password,
        agree: true,
        birth_date: form.birth_date,
      });
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      toast.success("Регистрация завершена");
      navigate("/login?pwd_set=1");
    } catch (err) {
      const msg = err.response?.data?.token?.[0] || "Ошибка";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-500">Ссылка недействительна</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form onSubmit={handleSubmit} className="bg-white p-8 rounded-lg shadow-sm w-full max-w-sm space-y-3">
        <h1 className="text-xl font-bold text-center">Принятие приглашения</h1>
        <input type="password" placeholder="Пароль" value={form.password} onChange={set("password")} required minLength={8}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <input type="password" placeholder="Подтверждение пароля" value={form.password2} onChange={set("password2")} required
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <input type="date" placeholder="Дата рождения" value={form.birth_date} onChange={set("birth_date")}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={form.agree} onChange={set("agree")} />
          Согласие на обработку данных
        </label>
        <button type="submit" disabled={loading}
          className="w-full bg-blue-600 text-white py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
          {loading ? "Сохранение..." : "Принять приглашение"}
        </button>
      </form>
    </div>
  );
}
