import { useEffect, useState } from "react";
import axiosInstance from "../api/axiosInstance";
import { getUnits, getDepartments, getAssignableRoles } from "../api/org";
import { useAuth, hasPermission } from "../context/AuthContext";
import useRealtimeUpdates from "../hooks/useRealtimeUpdates";
import toast from "react-hot-toast";
import { Plus, Trash2, Pencil, X } from "lucide-react";

export default function TeamPage() {
  const { user } = useAuth();
  const canManage = hasPermission(user, "team.manage");

  const [employees, setEmployees] = useState([]);
  const [invites, setInvites] = useState([]);
  const [units, setUnits] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", grade: 0 });
  const [inviteAssignments, setInviteAssignments] = useState([]);
  const [pendingAssign, setPendingAssign] = useState({ unit: "", department: "", org_role: "" });
  const [departments, setDepartments] = useState([]);

  const loadAll = async () => {
    try {
      const [empsRes, unitsRes, deptsRes] = await Promise.all([
        axiosInstance.get("employees/"),
        getUnits(),
        getDepartments(),
      ]);
      setEmployees(empsRes.data.results || empsRes.data);
      setUnits(unitsRes.data);
      setDepartments(deptsRes.data);

      if (canManage) {
        const [invRes, rolesRes] = await Promise.all([
          axiosInstance.get("invites/"),
          getAssignableRoles(),
        ]);
        setInvites(invRes.data.results || invRes.data);
        setRoles(rolesRes.data);
      }
    } catch {
      toast.error("Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);
  useRealtimeUpdates(["employee", "employee_assignment", "invite"], loadAll);

  const handleInvite = async (e) => {
    e.preventDefault();
    try {
      await axiosInstance.post("invites/", {
        ...form,
        assignments: inviteAssignments,
      });
      toast.success("Приглашение отправлено");
      setShowModal(false);
      setForm({ first_name: "", last_name: "", email: "", grade: 0 });
      setInviteAssignments([]);
      loadAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Ошибка");
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Удалить сотрудника?")) return;
    try {
      await axiosInstance.delete(`employees/${id}/`);
      toast.success("Удалён");
      loadAll();
    } catch {
      toast.error("Ошибка удаления");
    }
  };

  const handleRevoke = async (id) => {
    try {
      await axiosInstance.post(`invites/${id}/revoke/`);
      toast.success("Отозвано");
      loadAll();
    } catch {
      toast.error("Ошибка");
    }
  };

  const addAssignment = () => {
    if (!pendingAssign.unit || !pendingAssign.org_role) return;
    setInviteAssignments([...inviteAssignments, { ...pendingAssign, department: pendingAssign.department || null }]);
    setPendingAssign({ unit: "", department: "", org_role: "" });
  };

  const filteredDepts = departments.filter((d) => String(d.unit) === String(pendingAssign.unit));

  if (loading) return <p className="text-center py-8 text-gray-400">Загрузка...</p>;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">Команда</h1>
        {canManage && (
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700">
            <Plus size={16} /> Пригласить
          </button>
        )}
      </div>

      <div className="space-y-2">
        {employees.map((emp) => (
          <div key={emp.id} className="bg-white rounded-lg shadow-sm p-4 flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">{emp.full_name}</p>
              <p className="text-xs text-gray-500">{emp.email} {emp.role_title && `— ${emp.role_title}`}</p>
            </div>
            {canManage && (
              <button onClick={() => handleDelete(emp.id)} className="text-gray-400 hover:text-red-500">
                <Trash2 size={16} />
              </button>
            )}
          </div>
        ))}
        {employees.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Нет сотрудников</p>}
      </div>

      {canManage && invites.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-3">Приглашения</h2>
          <div className="space-y-2">
            {invites.map((inv) => (
              <div key={inv.id} className="bg-white rounded-lg shadow-sm p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{inv.email}</p>
                  <p className="text-xs text-gray-500">
                    {inv.first_name} {inv.last_name} — {inv.status}
                  </p>
                </div>
                <button onClick={() => handleRevoke(inv.id)} className="text-xs text-red-500 hover:underline">
                  Отозвать
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <form onSubmit={handleInvite} className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md space-y-3">
            <div className="flex justify-between items-center">
              <h2 className="font-bold">Пригласить сотрудника</h2>
              <button type="button" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <input placeholder="Имя" value={form.first_name}
              onChange={(e) => setForm({ ...form, first_name: e.target.value })}
              className="w-full border rounded px-3 py-2 text-sm" />
            <input placeholder="Фамилия" value={form.last_name}
              onChange={(e) => setForm({ ...form, last_name: e.target.value })}
              className="w-full border rounded px-3 py-2 text-sm" />
            <input type="email" placeholder="Email" value={form.email} required
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full border rounded px-3 py-2 text-sm" />
            <input type="number" placeholder="Грейд" value={form.grade} min={0} max={5}
              onChange={(e) => setForm({ ...form, grade: Number(e.target.value) })}
              className="w-full border rounded px-3 py-2 text-sm" />

            <div className="border-t pt-3">
              <p className="text-sm font-medium mb-2">Назначения</p>
              <div className="flex gap-2 flex-wrap">
                <select value={pendingAssign.unit} onChange={(e) => setPendingAssign({ ...pendingAssign, unit: e.target.value, department: "" })}
                  className="border rounded px-2 py-1 text-sm flex-1">
                  <option value="">Юнит</option>
                  {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                <select value={pendingAssign.department} onChange={(e) => setPendingAssign({ ...pendingAssign, department: e.target.value })}
                  className="border rounded px-2 py-1 text-sm flex-1">
                  <option value="">Департамент</option>
                  {filteredDepts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <select value={pendingAssign.org_role} onChange={(e) => setPendingAssign({ ...pendingAssign, org_role: e.target.value })}
                  className="border rounded px-2 py-1 text-sm flex-1">
                  <option value="">Роль</option>
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
                </select>
                <button type="button" onClick={addAssignment} className="text-blue-600 text-sm hover:underline">+</button>
              </div>
              {inviteAssignments.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {inviteAssignments.map((a, i) => (
                    <span key={i} className="bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded">
                      {units.find((u) => String(u.id) === String(a.unit))?.name} /
                      {roles.find((r) => String(r.id) === String(a.org_role))?.title}
                      <button type="button" onClick={() => setInviteAssignments(inviteAssignments.filter((_, j) => j !== i))}
                        className="ml-1 text-red-400">&times;</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <button type="submit"
              className="w-full bg-blue-600 text-white py-2 rounded text-sm font-medium hover:bg-blue-700">
              Отправить приглашение
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
