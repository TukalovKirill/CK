import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
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
  const [show1, setShow1] = useState(false);
  const [show2, setShow2] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!/^(?=.*[A-Za-z])(?=.*\d)[\S]{8,}$/.test(form.password)) {
      toast.error("Пароль: минимум 8 символов, буква и цифра");
      return;
    }
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
      <div className="auth-shell dark-texture">
        <div className="auth-card mx-auto max-w-lg text-center">
          <p style={{ color: "var(--n-accent)" }}>Ссылка недействительна</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell dark-texture">
      <form onSubmit={handleSubmit} className="auth-card mx-auto max-w-lg space-y-4">
        <h1 className="text-xl font-bold text-center" style={{ color: "var(--n-fg)" }}>Принятие приглашения</h1>

        <div className="relative">
          <input
            type={show1 ? "text" : "password"}
            placeholder="Пароль"
            value={form.password}
            onChange={set("password")}
            required
            minLength={8}
            className="input-premium w-full pr-10"
          />
          <button
            type="button"
            onClick={() => setShow1(!show1)}
            className="absolute right-3 top-1/2 -translate-y-1/2"
            style={{ color: "var(--n-dim)" }}
          >
            {show1 ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        <div className="relative">
          <input
            type={show2 ? "text" : "password"}
            placeholder="Подтверждение пароля"
            value={form.password2}
            onChange={set("password2")}
            required
            className="input-premium w-full pr-10"
          />
          <button
            type="button"
            onClick={() => setShow2(!show2)}
            className="absolute right-3 top-1/2 -translate-y-1/2"
            style={{ color: "var(--n-dim)" }}
          >
            {show2 ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        <div>
          <label className="block text-sm mb-1" style={{ color: "var(--n-muted)" }}>Дата рождения</label>
          <input
            type="date"
            value={form.birth_date}
            onChange={set("birth_date")}
            className="input-premium w-full"
          />
        </div>

        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--n-muted)" }}>
          <input type="checkbox" className="check-premium" checked={form.agree} onChange={set("agree")} />
          Согласие на обработку данных
        </label>

        <button type="submit" disabled={loading} className="btn-save w-full">
          {loading ? "Сохранение..." : "Принять приглашение"}
        </button>
      </form>
    </div>
  );
}
