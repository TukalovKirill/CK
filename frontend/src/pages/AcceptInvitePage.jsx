import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { acceptInvite } from "../api/auth";
import AuthLayout from "../components/AuthLayout";
import toast from "react-hot-toast";

export default function AcceptInvitePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [agree, setAgree] = useState(false);
  const [loading, setLoading] = useState(false);
  const [show1, setShow1] = useState(false);
  const [show2, setShow2] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!/^(?=.*[A-Za-z])(?=.*\d)[\S]{8,}$/.test(password)) {
      toast.error("Пароль: минимум 8 символов, буква и цифра");
      return;
    }
    if (password !== password2) {
      toast.error("Пароли не совпадают");
      return;
    }
    if (!agree) {
      toast.error("Необходимо согласие на обработку данных");
      return;
    }
    setLoading(true);
    try {
      await acceptInvite({ token, password, agree: true });
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      toast.success("Аккаунт активирован! Войдите с новым паролем");
      navigate("/login");
    } catch (err) {
      const msg = err.response?.data?.token?.[0] || "Ошибка активации";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <AuthLayout mode="invite">
        <div className="auth-form" style={{ textAlign: "center" }}>
          <p className="text-red-500 font-medium">Ссылка недействительна</p>
          <Link to="/login" className="auth-btn-outline mt-4 inline-flex">
            Перейти ко входу <span className="ml-1">&rarr;</span>
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout mode="invite">
      <form onSubmit={handleSubmit} className="auth-form">
        <div>
          <label className="auth-label">Пароль</label>
          <div className="relative">
            <input
              type={show1 ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="auth-input pr-10"
            />
            <button
              type="button"
              onClick={() => setShow1(!show1)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {show1 ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <div>
          <label className="auth-label">Подтверждение пароля</label>
          <div className="relative">
            <input
              type={show2 ? "text" : "password"}
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              required
              className="auth-input pr-10"
            />
            <button
              type="button"
              onClick={() => setShow2(!show2)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {show2 ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer">
          <input
            type="checkbox"
            checked={agree}
            onChange={(e) => setAgree(e.target.checked)}
            className="w-4 h-4 accent-red-600 cursor-pointer"
          />
          Согласие на обработку персональных данных
        </label>

        <button type="submit" disabled={loading} className="auth-btn-primary">
          {loading ? "Сохранение..." : "Принять приглашение"}
          <span className="ml-2">&rarr;</span>
        </button>
      </form>
    </AuthLayout>
  );
}
