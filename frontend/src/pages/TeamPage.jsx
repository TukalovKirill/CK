import { useEffect, useState, useMemo } from "react";
import axiosInstance from "../api/axiosInstance";
import { getUnits, getDepartments, getAssignableRoles } from "../api/org";
import { deleteAssignment, bulkCreateAssignments } from "../api/assignments";
import { useAuth, hasPermission, getUserUnitsForPermission } from "../context/AuthContext";
import useRealtimeUpdates from "../hooks/useRealtimeUpdates";
import useSessionState from "../hooks/useSessionState";
import Dropdown from "../components/Dropdown";
import { useDialog } from "../components/DialogProvider";
import toast from "react-hot-toast";
import { Plus, Trash2, Pencil, Copy, RotateCw, Search } from "lucide-react";

export default function TeamPage() {
    const { user } = useAuth();
    const canManage = hasPermission(user, "team.manage");
    const dialog = useDialog();

    const allowedViewUnitIds = getUserUnitsForPermission(user, "team.view");
    const allowedManageUnitIds = getUserUnitsForPermission(user, "team.manage");

    const [employees, setEmployees] = useState([]);
    const [invites, setInvites] = useState([]);
    const [units, setUnits] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [roles, setRoles] = useState([]);
    const [loading, setLoading] = useState(true);

    const [selectedUnit, setSelectedUnit] = useState("");
    const [selectedDept, setSelectedDept] = useState("");
    const [selectedRole, setSelectedRole] = useState("");
    const [searchQuery, setSearchQuery] = useState("");

    const [showModal, setShowModal] = useSessionState("team:modal", false);
    const [editing, setEditing] = useSessionState("team:editing", null);
    const [form, setForm] = useSessionState("team:form", {
        full_name: "", first_name: "", last_name: "", email: "", grade: 0, birth_date: "",
    });
    const [inviteAssignments, setInviteAssignments] = useSessionState("team:invAssign", []);
    const [pendingAssign, setPendingAssign] = useSessionState("team:pending", {
        unit: "", department: "", org_role: "",
    });

    const loadAll = async () => {
        try {
            const fetches = [
                axiosInstance.get("employees/"),
                getUnits(),
                getDepartments(),
            ];
            if (canManage) {
                fetches.push(axiosInstance.get("invites/"), getAssignableRoles());
            }
            const results = await Promise.all(fetches);
            setEmployees(results[0].data.results || results[0].data);
            setUnits(results[1].data);
            setDepartments(results[2].data);
            if (canManage) {
                setInvites(results[3].data.results || results[3].data);
                setRoles(results[4].data);
            }
        } catch {
            toast.error("Ошибка загрузки");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadAll(); }, []);
    useRealtimeUpdates(["employee", "employee_assignment", "invite"], loadAll);

    const filteredDepts = useMemo(
        () => departments.filter((d) => !selectedUnit || String(d.unit) === String(selectedUnit)),
        [departments, selectedUnit],
    );

    const unassignedEmployees = useMemo(() => {
        let list = employees.filter((e) => !e.assignments || e.assignments.length === 0);
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            list = list.filter((e) =>
                (e.full_name || "").toLowerCase().includes(q) ||
                (e.email || "").toLowerCase().includes(q),
            );
        }
        return list;
    }, [employees, searchQuery]);

    const filteredEmployees = useMemo(() => {
        let list = employees.filter((e) => e.assignments && e.assignments.length > 0);
        if (selectedUnit) {
            list = list.filter((e) => e.assignments.some((a) => String(a.unit) === selectedUnit));
        }
        if (selectedDept) {
            list = list.filter((e) => e.assignments.some((a) => String(a.department) === selectedDept));
        }
        if (selectedRole) {
            list = list.filter((e) => e.assignments.some((a) => String(a.org_role) === selectedRole));
        }
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            list = list.filter((e) =>
                (e.full_name || "").toLowerCase().includes(q) ||
                (e.email || "").toLowerCase().includes(q) ||
                (e.role_title || "").toLowerCase().includes(q),
            );
        }
        return list;
    }, [employees, selectedUnit, selectedDept, selectedRole, searchQuery]);

    const filteredInvites = useMemo(() => {
        let list = invites;
        if (selectedUnit) {
            list = list.filter((inv) =>
                inv.invite_assignments?.some((a) => String(a.unit) === selectedUnit) ||
                String(inv.unit) === selectedUnit,
            );
        }
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            list = list.filter((inv) =>
                inv.email.toLowerCase().includes(q) ||
                `${inv.first_name} ${inv.last_name}`.toLowerCase().includes(q),
            );
        }
        return list;
    }, [invites, selectedUnit, searchQuery]);

    const openCreate = () => {
        setEditing(null);
        setForm({ full_name: "", first_name: "", last_name: "", email: "", grade: 0, birth_date: "" });
        setInviteAssignments([]);
        setPendingAssign({ unit: "", department: "", org_role: "" });
        setShowModal(true);
    };

    const openEdit = (emp) => {
        setEditing(emp.id);
        setForm({
            full_name: emp.full_name || "",
            first_name: emp.first_name || "",
            last_name: emp.last_name || "",
            email: emp.email || "",
            grade: emp.grade ?? 0,
            birth_date: emp.birth_date || "",
        });
        setInviteAssignments([]);
        setPendingAssign({ unit: "", department: "", org_role: "" });
        setShowModal(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editing) {
                await axiosInstance.patch(`employees/${editing}/`, {
                    full_name: form.full_name,
                    grade: form.grade,
                    birth_date: form.birth_date || null,
                });
                if (pendingAssign.unit && pendingAssign.org_role) {
                    await bulkCreateAssignments({
                        employee: editing,
                        assignments: [{
                            unit: Number(pendingAssign.unit),
                            department: pendingAssign.department ? Number(pendingAssign.department) : null,
                            org_role: Number(pendingAssign.org_role),
                        }],
                    });
                }
                toast.success("Сохранено");
            } else {
                await axiosInstance.post("invites/", {
                    email: form.email,
                    first_name: form.first_name,
                    last_name: form.last_name,
                    grade: form.grade,
                    assignments: inviteAssignments,
                });
                toast.success("Приглашение отправлено");
            }
            setShowModal(false);
            loadAll();
        } catch (err) {
            toast.error(err.response?.data?.detail || "Ошибка");
        }
    };

    const handleDelete = async (id) => {
        const ok = await dialog.confirm("Удалить сотрудника?", "Это действие нельзя отменить.", { destructive: true });
        if (!ok) return;
        try {
            await axiosInstance.delete(`employees/${id}/`);
            loadAll();
        } catch {
            toast.error("Ошибка удаления");
        }
    };

    const handleRevoke = async (id) => {
        const ok = await dialog.confirm("Отозвать приглашение?", "Приглашение станет недействительным.", { destructive: true });
        if (!ok) return;
        try {
            await axiosInstance.post(`invites/${id}/revoke/`);
            loadAll();
        } catch {
            toast.error("Ошибка");
        }
    };

    const handleResend = async (id) => {
        try {
            await axiosInstance.post(`invites/${id}/resend/`);
            toast.success("Отправлено повторно");
        } catch {
            toast.error("Ошибка");
        }
    };

    const copyInviteLink = (token) => {
        const url = `${window.location.origin}/accept-invite?token=${token}`;
        navigator.clipboard.writeText(url).then(() => toast.success("Ссылка скопирована"));
    };

    const addAssignment = () => {
        if (!pendingAssign.unit || !pendingAssign.org_role) return;
        setInviteAssignments([...inviteAssignments, {
            ...pendingAssign,
            department: pendingAssign.department || null,
        }]);
        setPendingAssign({ unit: "", department: "", org_role: "" });
    };

    const removeEditingAssignment = async (assignmentId) => {
        try {
            await deleteAssignment(assignmentId);
            loadAll();
        } catch {
            toast.error("Ошибка");
        }
    };

    const addEditingAssignment = async () => {
        if (!editing || !pendingAssign.unit || !pendingAssign.org_role) return;
        try {
            await bulkCreateAssignments({
                employee: editing,
                assignments: [{
                    unit: Number(pendingAssign.unit),
                    department: pendingAssign.department ? Number(pendingAssign.department) : null,
                    org_role: Number(pendingAssign.org_role),
                }],
            });
            setPendingAssign({ unit: "", department: "", org_role: "" });
            loadAll();
        } catch {
            toast.error("Ошибка");
        }
    };

    const modalDepts = departments.filter((d) => String(d.unit) === String(pendingAssign.unit));
    const editingEmployee = editing ? employees.find((e) => e.id === editing) : null;

    const statusLabel = (status) => {
        const map = { pending: "Ожидает", accepted: "Принято", revoked: "Отозвано", expired: "Истекло" };
        return map[status] || status;
    };

    const statusBadgeClass = (status) => {
        if (status === "accepted") return "badge-success";
        if (status === "revoked" || status === "expired") return "badge-danger";
        return "badge-muted";
    };

    if (loading) return (
        <div className="page-shell page-stack">
            <div className="surface-empty">Загрузка...</div>
        </div>
    );

    return (
        <div className="page-shell page-stack">
            <div className="hero-banner">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h1 className="page-title">Команда</h1>
                        <p className="page-subtitle mt-1">Сотрудники и приглашения</p>
                    </div>
                    {canManage && (
                        <button onClick={openCreate} className="btn-save flex items-center gap-1.5">
                            <Plus size={14} /> Пригласить
                        </button>
                    )}
                </div>
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
                <div className="relative flex-1 min-w-48">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--n-dim)" }} />
                    <input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Поиск..."
                        className="input-premium w-full pl-8"
                    />
                </div>
                <Dropdown
                    value={selectedUnit}
                    onChange={(v) => { setSelectedUnit(v); setSelectedDept(""); setSelectedRole(""); }}
                    placeholder="Все юниты"
                    options={units.map((u) => ({ value: String(u.id), label: u.name }))}
                />
                <Dropdown
                    value={selectedDept}
                    onChange={(v) => { setSelectedDept(v); setSelectedRole(""); }}
                    placeholder="Все департаменты"
                    options={filteredDepts.map((d) => ({ value: String(d.id), label: d.name }))}
                />
                <Dropdown
                    value={selectedRole}
                    onChange={(v) => setSelectedRole(v)}
                    placeholder="Все роли"
                    options={roles.map((r) => ({ value: String(r.id), label: r.title }))}
                />
            </div>

            <div className="space-y-1">
                {filteredEmployees.map((emp) => (
                    <div key={emp.id} className="surface-panel flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div
                                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium shrink-0"
                                style={{ background: "var(--n-hover)", color: "var(--n-fg)", border: "1px solid var(--n-border)" }}
                            >
                                {(emp.full_name || emp.email || "?")[0].toUpperCase()}
                            </div>
                            <div>
                                <p className="text-sm font-medium" style={{ color: "var(--n-fg)" }}>{emp.full_name}</p>
                                <p className="text-xs text-muted">
                                    {emp.email}
                                    {emp.role_title && ` — ${emp.role_title}`}
                                    {emp.grade != null && ` · грейд ${emp.grade}`}
                                </p>
                            </div>
                        </div>
                        {canManage && (
                            <div className="flex items-center gap-1">
                                <button onClick={() => openEdit(emp)} className="btn-ghost p-1">
                                    <Pencil size={14} />
                                </button>
                                <button onClick={() => handleDelete(emp.id)} className="btn-danger p-1">
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        )}
                    </div>
                ))}
                {filteredEmployees.length === 0 && unassignedEmployees.length === 0 && (
                    <div className="surface-empty">Нет сотрудников</div>
                )}
                {filteredEmployees.length === 0 && unassignedEmployees.length > 0 && (
                    <div className="surface-empty">Нет сотрудников с назначениями</div>
                )}
            </div>

            {canManage && unassignedEmployees.length > 0 && (
                <div className="mt-6">
                    <h2 className="text-sm font-medium mb-2" style={{ color: "var(--n-muted)" }}>
                        Без назначений
                        <span className="ml-1.5 text-xs opacity-60">({unassignedEmployees.length})</span>
                    </h2>
                    <div className="space-y-1">
                        {unassignedEmployees.map((emp) => (
                            <div
                                key={emp.id}
                                className="surface-panel flex items-center justify-between"
                                style={{ borderStyle: "dashed" }}
                            >
                                <div className="flex items-center gap-3">
                                    <div
                                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium shrink-0"
                                        style={{ background: "var(--n-hover)", color: "var(--n-dim)", border: "1px dashed var(--n-border)" }}
                                    >
                                        {(emp.full_name || emp.email || "?")[0].toUpperCase()}
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium" style={{ color: "var(--n-fg)" }}>{emp.full_name}</p>
                                        <p className="text-xs text-muted">
                                            {emp.email}
                                            {emp.grade != null && ` · грейд ${emp.grade}`}
                                            {" · "}<span style={{ color: "var(--accent-warn, #e6a700)" }}>нет назначений</span>
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button onClick={() => openEdit(emp)} className="btn-save px-2.5 py-1 text-xs flex items-center gap-1">
                                        <Pencil size={12} /> Назначить
                                    </button>
                                    <button onClick={() => handleDelete(emp.id)} className="btn-danger p-1">
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {canManage && filteredInvites.length > 0 && (
                <div className="mt-6">
                    <h2 className="text-sm font-medium mb-2" style={{ color: "var(--n-muted)" }}>Приглашения</h2>
                    <div className="space-y-1">
                        {filteredInvites.map((inv) => (
                            <div
                                key={inv.id}
                                className="surface-panel flex items-center justify-between"
                                style={{ borderStyle: "dashed" }}
                            >
                                <div>
                                    <p className="text-sm" style={{ color: "var(--n-fg)" }}>{inv.email}</p>
                                    <p className="text-xs text-muted flex items-center gap-1 flex-wrap mt-0.5">
                                        {inv.first_name} {inv.last_name}
                                        {" · "}
                                        <span className={statusBadgeClass(inv.status)}>{statusLabel(inv.status)}</span>
                                        {inv.expires_at && (
                                            <> · до {new Date(inv.expires_at).toLocaleDateString()}</>
                                        )}
                                    </p>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button onClick={() => handleResend(inv.id)} className="btn-ghost p-1" title="Отправить повторно">
                                        <RotateCw size={14} />
                                    </button>
                                    <button onClick={() => copyInviteLink(inv.token)} className="btn-ghost p-1" title="Копировать ссылку">
                                        <Copy size={14} />
                                    </button>
                                    <button onClick={() => handleRevoke(inv.id)} className="btn-danger p-1" title="Отозвать">
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="fixed inset-0 bg-black/60" onClick={() => setShowModal(false)} />
                    <div
                        className="relative max-w-xl w-full rounded-[24px] p-6 space-y-4"
                        style={{
                            background: "var(--n-panel)",
                            border: "1px solid var(--n-border)",
                            boxShadow: "0 8px 32px rgba(0,0,0,0.1)",
                        }}
                    >
                        <h3 className="text-lg font-semibold" style={{ color: "var(--n-fg)" }}>
                            {editing ? "Редактировать сотрудника" : "Пригласить сотрудника"}
                        </h3>
                        <form onSubmit={handleSubmit} className="space-y-3">
                            {editing ? (
                                <>
                                    <label className="block">
                                        <span className="text-xs font-medium" style={{ color: "var(--n-muted)" }}>ФИО</span>
                                        <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                                            className="input-premium w-full mt-1" />
                                    </label>
                                    <label className="block">
                                        <span className="text-xs font-medium" style={{ color: "var(--n-muted)" }}>Email</span>
                                        <input value={form.email} readOnly className="input-premium w-full mt-1 opacity-50" />
                                    </label>
                                    <label className="block">
                                        <span className="text-xs font-medium" style={{ color: "var(--n-muted)" }}>Грейд (0–5)</span>
                                        <input type="number" min={0} max={5} value={form.grade}
                                            onChange={(e) => setForm({ ...form, grade: Number(e.target.value) })}
                                            className="input-premium w-full mt-1" />
                                    </label>
                                    <label className="block">
                                        <span className="text-xs font-medium" style={{ color: "var(--n-muted)" }}>Дата рождения</span>
                                        <input type="date" value={form.birth_date || ""}
                                            onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
                                            className="input-premium w-full mt-1" />
                                    </label>

                                    {editingEmployee?.assignments?.length > 0 && (
                                        <div>
                                            <span className="text-xs font-medium" style={{ color: "var(--n-muted)" }}>Текущие назначения</span>
                                            <div className="flex flex-wrap gap-1 mt-1">
                                                {editingEmployee.assignments.map((a) => (
                                                    <span key={a.id} className="badge-bronze inline-flex items-center gap-1">
                                                        {a.unit_name} / {a.org_role_title}
                                                        <button type="button" onClick={() => removeEditingAssignment(a.id)}
                                                            className="opacity-60 hover:opacity-100 ml-0.5">
                                                            &times;
                                                        </button>
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div className="pt-2" style={{ borderTop: "1px solid var(--n-border)" }}>
                                        <span className="text-xs font-medium" style={{ color: "var(--n-muted)" }}>Добавить назначение</span>
                                        <div className="flex gap-1 mt-1">
                                            <Dropdown
                                                className="flex-1"
                                                value={pendingAssign.unit}
                                                onChange={(v) => setPendingAssign({ ...pendingAssign, unit: v, department: "" })}
                                                placeholder="Юнит"
                                                options={units.map((u) => ({ value: String(u.id), label: u.name }))}
                                            />
                                            <Dropdown
                                                className="flex-1"
                                                value={pendingAssign.department}
                                                onChange={(v) => setPendingAssign({ ...pendingAssign, department: v })}
                                                placeholder="Деп."
                                                options={modalDepts.map((d) => ({ value: String(d.id), label: d.name }))}
                                            />
                                            <Dropdown
                                                className="flex-1"
                                                value={pendingAssign.org_role}
                                                onChange={(v) => setPendingAssign({ ...pendingAssign, org_role: v })}
                                                placeholder="Роль"
                                                options={roles.map((r) => ({ value: String(r.id), label: r.title }))}
                                            />
                                            <button type="button" onClick={addEditingAssignment} className="btn-save px-3">+</button>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="flex gap-2">
                                        <label className="flex-1">
                                            <span className="text-xs font-medium" style={{ color: "var(--n-muted)" }}>Имя</span>
                                            <input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                                                className="input-premium w-full mt-1" />
                                        </label>
                                        <label className="flex-1">
                                            <span className="text-xs font-medium" style={{ color: "var(--n-muted)" }}>Фамилия</span>
                                            <input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                                                className="input-premium w-full mt-1" />
                                        </label>
                                    </div>
                                    <label className="block">
                                        <span className="text-xs font-medium" style={{ color: "var(--n-muted)" }}>Email</span>
                                        <input type="email" required value={form.email}
                                            onChange={(e) => setForm({ ...form, email: e.target.value })}
                                            className="input-premium w-full mt-1" />
                                    </label>
                                    <label className="block">
                                        <span className="text-xs font-medium" style={{ color: "var(--n-muted)" }}>Грейд (0–5)</span>
                                        <input type="number" min={0} max={5} value={form.grade}
                                            onChange={(e) => setForm({ ...form, grade: Number(e.target.value) })}
                                            className="input-premium w-full mt-1" />
                                    </label>

                                    <div className="pt-2" style={{ borderTop: "1px solid var(--n-border)" }}>
                                        <span className="text-xs font-medium" style={{ color: "var(--n-muted)" }}>Назначения</span>
                                        <div className="flex gap-1 mt-1">
                                            <Dropdown
                                                className="flex-1"
                                                value={pendingAssign.unit}
                                                onChange={(v) => setPendingAssign({ ...pendingAssign, unit: v, department: "" })}
                                                placeholder="Юнит"
                                                options={units.map((u) => ({ value: String(u.id), label: u.name }))}
                                            />
                                            <Dropdown
                                                className="flex-1"
                                                value={pendingAssign.department}
                                                onChange={(v) => setPendingAssign({ ...pendingAssign, department: v })}
                                                placeholder="Деп."
                                                options={modalDepts.map((d) => ({ value: String(d.id), label: d.name }))}
                                            />
                                            <Dropdown
                                                className="flex-1"
                                                value={pendingAssign.org_role}
                                                onChange={(v) => setPendingAssign({ ...pendingAssign, org_role: v })}
                                                placeholder="Роль"
                                                options={roles.map((r) => ({ value: String(r.id), label: r.title }))}
                                            />
                                            <button type="button" onClick={addAssignment} className="btn-save px-3">+</button>
                                        </div>
                                        {inviteAssignments.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-2">
                                                {inviteAssignments.map((a, i) => (
                                                    <span key={i} className="badge-bronze inline-flex items-center gap-1">
                                                        {units.find((u) => String(u.id) === String(a.unit))?.name} /
                                                        {roles.find((r) => String(r.id) === String(a.org_role))?.title}
                                                        <button type="button" onClick={() => setInviteAssignments(inviteAssignments.filter((_, j) => j !== i))}
                                                            className="opacity-60 hover:opacity-100 ml-0.5">
                                                            &times;
                                                        </button>
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}

                            <div className="flex gap-2 pt-1">
                                <button type="button" onClick={() => setShowModal(false)} className="btn-surface flex-1">
                                    Отмена
                                </button>
                                <button type="submit" className="btn-save flex-1">
                                    {editing ? "Сохранить" : "Отправить приглашение"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
