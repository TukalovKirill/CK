import { useEffect, useState, useMemo } from "react";
import axiosInstance from "../api/axiosInstance";
import { getUnits, getDepartments, getAssignableRoles } from "../api/org";
import { deleteAssignment, bulkCreateAssignments } from "../api/assignments";
import { useAuth, hasPermission } from "../context/AuthContext";
import useRealtimeUpdates from "../hooks/useRealtimeUpdates";
import useSessionState from "../hooks/useSessionState";
import Modal from "../components/Modal";
import toast from "react-hot-toast";
import { Plus, Trash2, Pencil, Copy, RotateCw, Search } from "lucide-react";

export default function TeamPage() {
    const { user } = useAuth();
    const canManage = hasPermission(user, "team.manage");

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

    const [showModal, setShowModal] = useSessionState("team_showModal", false);
    const [editing, setEditing] = useSessionState("team_editing", null);
    const [form, setForm] = useSessionState("team_form", {
        full_name: "", first_name: "", last_name: "", email: "", grade: 0, birth_date: "",
    });
    const [inviteAssignments, setInviteAssignments] = useSessionState("team_inviteAssignments", []);
    const [pendingAssign, setPendingAssign] = useSessionState("team_pendingAssign", {
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

    const filteredEmployees = useMemo(() => {
        let list = employees;
        if (selectedUnit) {
            list = list.filter((e) => e.assignments?.some((a) => String(a.unit) === selectedUnit));
        }
        if (selectedDept) {
            list = list.filter((e) => e.assignments?.some((a) => String(a.department) === selectedDept));
        }
        if (selectedRole) {
            list = list.filter((e) => e.assignments?.some((a) => String(a.org_role) === selectedRole));
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
        if (!confirm("Удалить сотрудника?")) return;
        try {
            await axiosInstance.delete(`employees/${id}/`);
            loadAll();
        } catch {
            toast.error("Ошибка удаления");
        }
    };

    const handleRevoke = async (id) => {
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
        const url = `${window.location.origin}/invite/${token}`;
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

    if (loading) return <p className="text-center py-8 text-gray-500">Загрузка...</p>;

    return (
        <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-4">
                <h1 className="text-lg font-semibold">Команда</h1>
                {canManage && (
                    <button onClick={openCreate} className="flex items-center gap-1.5 border border-gray-400 px-3 py-1 text-sm hover:bg-gray-50">
                        <Plus size={14} /> Пригласить
                    </button>
                )}
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
                <div className="relative flex-1 min-w-48">
                    <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Поиск..."
                        className="border border-gray-300 pl-7 pr-2 py-1 text-sm w-full"
                    />
                </div>
                <select value={selectedUnit} onChange={(e) => { setSelectedUnit(e.target.value); setSelectedDept(""); setSelectedRole(""); }} className="border border-gray-300 px-2 py-1 text-sm">
                    <option value="">Все юниты</option>
                    {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                <select value={selectedDept} onChange={(e) => { setSelectedDept(e.target.value); setSelectedRole(""); }} className="border border-gray-300 px-2 py-1 text-sm">
                    <option value="">Все департаменты</option>
                    {filteredDepts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)} className="border border-gray-300 px-2 py-1 text-sm">
                    <option value="">Все роли</option>
                    {roles.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
                </select>
            </div>

            <div className="space-y-1">
                {filteredEmployees.map((emp) => (
                    <div key={emp.id} className="border border-gray-300 p-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 border border-gray-300 flex items-center justify-center text-xs text-gray-500">
                                {(emp.full_name || emp.email || "?")[0].toUpperCase()}
                            </div>
                            <div>
                                <p className="text-sm font-medium">{emp.full_name}</p>
                                <p className="text-xs text-gray-500">
                                    {emp.email}
                                    {emp.role_title && ` — ${emp.role_title}`}
                                    {emp.grade != null && ` · грейд ${emp.grade}`}
                                </p>
                            </div>
                        </div>
                        {canManage && (
                            <div className="flex items-center gap-1">
                                <button onClick={() => openEdit(emp)} className="p-1 hover:bg-gray-100">
                                    <Pencil size={14} className="text-gray-500" />
                                </button>
                                <button onClick={() => handleDelete(emp.id)} className="p-1 hover:bg-gray-100">
                                    <Trash2 size={14} className="text-gray-500" />
                                </button>
                            </div>
                        )}
                    </div>
                ))}
                {filteredEmployees.length === 0 && (
                    <p className="text-sm text-gray-500 text-center py-4">Нет сотрудников</p>
                )}
            </div>

            {canManage && filteredInvites.length > 0 && (
                <div className="mt-6">
                    <h2 className="text-sm font-medium mb-2">Приглашения</h2>
                    <div className="space-y-1">
                        {filteredInvites.map((inv) => (
                            <div key={inv.id} className="border border-dashed border-gray-300 p-3 flex items-center justify-between">
                                <div>
                                    <p className="text-sm">{inv.email}</p>
                                    <p className="text-xs text-gray-500">
                                        {inv.first_name} {inv.last_name}
                                        {" · "}
                                        <span className="border border-gray-300 px-1">{statusLabel(inv.status)}</span>
                                        {inv.expires_at && (
                                            <> · до {new Date(inv.expires_at).toLocaleDateString()}</>
                                        )}
                                    </p>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button onClick={() => handleResend(inv.id)} className="p-1 hover:bg-gray-100" title="Отправить повторно">
                                        <RotateCw size={14} className="text-gray-500" />
                                    </button>
                                    <button onClick={() => copyInviteLink(inv.token)} className="p-1 hover:bg-gray-100" title="Копировать ссылку">
                                        <Copy size={14} className="text-gray-500" />
                                    </button>
                                    <button onClick={() => handleRevoke(inv.id)} className="p-1 hover:bg-gray-100" title="Отозвать">
                                        <Trash2 size={14} className="text-gray-500" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? "Редактировать сотрудника" : "Пригласить сотрудника"}>
                <form onSubmit={handleSubmit} className="space-y-3">
                    {editing ? (
                        <>
                            <label className="block">
                                <span className="text-xs text-gray-600">ФИО</span>
                                <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                                    className="border border-gray-300 px-2 py-1 text-sm w-full" />
                            </label>
                            <label className="block">
                                <span className="text-xs text-gray-600">Email</span>
                                <input value={form.email} readOnly className="border border-gray-200 bg-gray-50 px-2 py-1 text-sm w-full" />
                            </label>
                            <label className="block">
                                <span className="text-xs text-gray-600">Грейд (0–5)</span>
                                <input type="number" min={0} max={5} value={form.grade}
                                    onChange={(e) => setForm({ ...form, grade: Number(e.target.value) })}
                                    className="border border-gray-300 px-2 py-1 text-sm w-full" />
                            </label>
                            <label className="block">
                                <span className="text-xs text-gray-600">Дата рождения</span>
                                <input type="date" value={form.birth_date || ""}
                                    onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
                                    className="border border-gray-300 px-2 py-1 text-sm w-full" />
                            </label>

                            {editingEmployee?.assignments?.length > 0 && (
                                <div>
                                    <span className="text-xs text-gray-600">Текущие назначения</span>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                        {editingEmployee.assignments.map((a) => (
                                            <span key={a.id} className="inline-flex items-center gap-1 text-xs border border-gray-300 px-2 py-0.5">
                                                {a.unit_name} / {a.org_role_title}
                                                <button type="button" onClick={() => removeEditingAssignment(a.id)}>
                                                    <span className="text-gray-500">&times;</span>
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="border-t border-gray-200 pt-2">
                                <span className="text-xs text-gray-600">Добавить назначение</span>
                                <div className="flex gap-1 mt-1">
                                    <select value={pendingAssign.unit} onChange={(e) => setPendingAssign({ ...pendingAssign, unit: e.target.value, department: "" })} className="border border-gray-300 px-1 py-1 text-xs flex-1">
                                        <option value="">Юнит</option>
                                        {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                                    </select>
                                    <select value={pendingAssign.department} onChange={(e) => setPendingAssign({ ...pendingAssign, department: e.target.value })} className="border border-gray-300 px-1 py-1 text-xs flex-1">
                                        <option value="">Деп.</option>
                                        {modalDepts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                                    </select>
                                    <select value={pendingAssign.org_role} onChange={(e) => setPendingAssign({ ...pendingAssign, org_role: e.target.value })} className="border border-gray-300 px-1 py-1 text-xs flex-1">
                                        <option value="">Роль</option>
                                        {roles.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
                                    </select>
                                    <button type="button" onClick={addEditingAssignment} className="border border-gray-400 px-2 py-1 text-xs">+</button>
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="flex gap-2">
                                <label className="flex-1">
                                    <span className="text-xs text-gray-600">Имя</span>
                                    <input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                                        className="border border-gray-300 px-2 py-1 text-sm w-full" />
                                </label>
                                <label className="flex-1">
                                    <span className="text-xs text-gray-600">Фамилия</span>
                                    <input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                                        className="border border-gray-300 px-2 py-1 text-sm w-full" />
                                </label>
                            </div>
                            <label className="block">
                                <span className="text-xs text-gray-600">Email</span>
                                <input type="email" required value={form.email}
                                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                                    className="border border-gray-300 px-2 py-1 text-sm w-full" />
                            </label>
                            <label className="block">
                                <span className="text-xs text-gray-600">Грейд (0–5)</span>
                                <input type="number" min={0} max={5} value={form.grade}
                                    onChange={(e) => setForm({ ...form, grade: Number(e.target.value) })}
                                    className="border border-gray-300 px-2 py-1 text-sm w-full" />
                            </label>

                            <div className="border-t border-gray-200 pt-2">
                                <span className="text-xs text-gray-600">Назначения</span>
                                <div className="flex gap-1 mt-1">
                                    <select value={pendingAssign.unit} onChange={(e) => setPendingAssign({ ...pendingAssign, unit: e.target.value, department: "" })} className="border border-gray-300 px-1 py-1 text-xs flex-1">
                                        <option value="">Юнит</option>
                                        {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                                    </select>
                                    <select value={pendingAssign.department} onChange={(e) => setPendingAssign({ ...pendingAssign, department: e.target.value })} className="border border-gray-300 px-1 py-1 text-xs flex-1">
                                        <option value="">Деп.</option>
                                        {modalDepts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                                    </select>
                                    <select value={pendingAssign.org_role} onChange={(e) => setPendingAssign({ ...pendingAssign, org_role: e.target.value })} className="border border-gray-300 px-1 py-1 text-xs flex-1">
                                        <option value="">Роль</option>
                                        {roles.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
                                    </select>
                                    <button type="button" onClick={addAssignment} className="border border-gray-400 px-2 py-1 text-xs">+</button>
                                </div>
                                {inviteAssignments.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-2">
                                        {inviteAssignments.map((a, i) => (
                                            <span key={i} className="inline-flex items-center gap-1 text-xs border border-gray-300 px-2 py-0.5">
                                                {units.find((u) => String(u.id) === String(a.unit))?.name} /
                                                {roles.find((r) => String(r.id) === String(a.org_role))?.title}
                                                <button type="button" onClick={() => setInviteAssignments(inviteAssignments.filter((_, j) => j !== i))}>
                                                    <span className="text-gray-500">&times;</span>
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    <button type="submit" className="w-full border border-gray-400 py-1.5 text-sm font-medium hover:bg-gray-50">
                        {editing ? "Сохранить" : "Отправить приглашение"}
                    </button>
                </form>
            </Modal>
        </div>
    );
}
