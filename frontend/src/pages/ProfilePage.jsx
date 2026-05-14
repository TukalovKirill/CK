import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";

export default function ProfilePage() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    if (!user) return null;

    const handleLogout = () => {
        logout();
        navigate("/login");
    };

    return (
        <div className="page-shell page-stack max-w-3xl mx-auto">
            <div className="hero-banner">
                <h1 className="page-title">Привет, {user.first_name || user.email}!</h1>
                <p className="page-subtitle mt-1">Твой профиль и настройки аккаунта</p>
            </div>

            <div className="surface-panel">
                <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-3">
                        <p className="section-title">Аккаунт</p>
                        <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-muted">Email</span>
                                <span style={{ color: "var(--n-fg)" }}>{user.email}</span>
                            </div>
                            {user.birth_date && (
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted">Дата рождения</span>
                                    <span style={{ color: "var(--n-fg)" }}>
                                        {new Date(user.birth_date).toLocaleDateString("ru-RU")}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="space-y-3">
                        <p className="section-title">Роль</p>
                        <div className="flex flex-wrap gap-2">
                            {user.assignments?.length > 0 ? (
                                user.assignments.map((a) => (
                                    <span key={a.id} className="badge-bronze">
                                        {a.unit_name}
                                        {a.department_name && ` / ${a.department_name}`}
                                        {" / "}
                                        {a.org_role_title}
                                    </span>
                                ))
                            ) : (
                                <span className="badge-bronze">
                                    {user.org_role_title || "Не назначена"}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex justify-end">
                <button className="btn-surface flex items-center gap-2" onClick={handleLogout}>
                    <LogOut size={14} />
                    Выйти
                </button>
            </div>
        </div>
    );
}
