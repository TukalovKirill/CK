import { useEffect, useState } from "react";
import { getUnits, getDepartments, getOrgRoles, createUnit, createDepartment, createOrgRole, deleteUnit, deleteDepartment, deleteOrgRole } from "../api/org";
import { useAuth, hasPermission } from "../context/AuthContext";
import useRealtimeUpdates from "../hooks/useRealtimeUpdates";
import toast from "react-hot-toast";
import { Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";

export default function OrgStructurePage() {
  const { user } = useAuth();
  const canManage = hasPermission(user, "org.manage");

  const [units, setUnits] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});
  const [newUnit, setNewUnit] = useState("");
  const [newDept, setNewDept] = useState({ unit: "", name: "" });
  const [newRole, setNewRole] = useState({ title: "", department: "", parent_role: "" });

  const loadAll = async () => {
    try {
      const [u, d, r] = await Promise.all([getUnits(), getDepartments(), getOrgRoles()]);
      setUnits(u.data);
      setDepartments(d.data);
      setRoles(r.data);
    } catch {
      toast.error("Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);
  useRealtimeUpdates(["unit", "department", "org_role"], loadAll);

  const toggle = (key) => setExpanded((p) => ({ ...p, [key]: !p[key] }));

  const handleAddUnit = async () => {
    if (!newUnit.trim()) return;
    try {
      await createUnit({ name: newUnit });
      setNewUnit("");
      toast.success("Юнит создан");
      loadAll();
    } catch {
      toast.error("Ошибка");
    }
  };

  const handleAddDept = async () => {
    if (!newDept.name.trim() || !newDept.unit) return;
    try {
      await createDepartment({ name: newDept.name, unit: newDept.unit });
      setNewDept({ unit: "", name: "" });
      toast.success("Департамент создан");
      loadAll();
    } catch {
      toast.error("Ошибка");
    }
  };

  const handleAddRole = async () => {
    if (!newRole.title.trim()) return;
    try {
      await createOrgRole({
        title: newRole.title,
        department: newRole.department || null,
        parent_role: newRole.parent_role || null,
      });
      setNewRole({ title: "", department: "", parent_role: "" });
      toast.success("Роль создана");
      loadAll();
    } catch {
      toast.error("Ошибка");
    }
  };

  if (loading) return <p className="text-center py-8 text-gray-400">Загрузка...</p>;

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-xl font-bold mb-4">Оргструктура</h1>

      <div className="space-y-2">
        {units.map((unit) => {
          const unitDepts = departments.filter((d) => d.unit === unit.id);
          const isOpen = expanded[`u-${unit.id}`];
          return (
            <div key={unit.id} className="bg-white rounded-lg shadow-sm">
              <div className="flex items-center justify-between p-3 cursor-pointer" onClick={() => toggle(`u-${unit.id}`)}>
                <div className="flex items-center gap-2">
                  {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <span className="font-medium text-sm">{unit.name}</span>
                  <span className="text-xs text-gray-400">{unitDepts.length} деп.</span>
                </div>
                {canManage && (
                  <button onClick={(e) => { e.stopPropagation(); deleteUnit(unit.id).then(loadAll).catch(() => toast.error("Ошибка")); }}
                    className="text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
                )}
              </div>
              {isOpen && (
                <div className="px-3 pb-3 pl-8 space-y-1">
                  {unitDepts.map((dept) => {
                    const deptRoles = roles.filter((r) => r.department === dept.id);
                    return (
                      <div key={dept.id} className="bg-gray-50 rounded p-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm">{dept.name}</span>
                          {canManage && (
                            <button onClick={() => deleteDepartment(dept.id).then(loadAll).catch(() => toast.error("Ошибка"))}
                              className="text-gray-400 hover:text-red-500"><Trash2 size={12} /></button>
                          )}
                        </div>
                        {deptRoles.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {deptRoles.map((r) => (
                              <span key={r.id} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                                {r.title}
                                {canManage && !r.is_system && (
                                  <button onClick={() => deleteOrgRole(r.id).then(loadAll).catch(() => toast.error("Ошибка"))}
                                    className="ml-1 text-red-400">&times;</button>
                                )}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {canManage && (
        <div className="mt-8 bg-white rounded-lg shadow-sm p-4 space-y-4">
          <h2 className="font-semibold text-sm">Добавить</h2>
          <div className="flex gap-2">
            <input placeholder="Название юнита" value={newUnit} onChange={(e) => setNewUnit(e.target.value)}
              className="border rounded px-3 py-1.5 text-sm flex-1" />
            <button onClick={handleAddUnit} className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700">
              <Plus size={14} />
            </button>
          </div>
          <div className="flex gap-2">
            <select value={newDept.unit} onChange={(e) => setNewDept({ ...newDept, unit: e.target.value })}
              className="border rounded px-2 py-1.5 text-sm">
              <option value="">Юнит</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <input placeholder="Название департамента" value={newDept.name} onChange={(e) => setNewDept({ ...newDept, name: e.target.value })}
              className="border rounded px-3 py-1.5 text-sm flex-1" />
            <button onClick={handleAddDept} className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700">
              <Plus size={14} />
            </button>
          </div>
          <div className="flex gap-2">
            <input placeholder="Название роли" value={newRole.title} onChange={(e) => setNewRole({ ...newRole, title: e.target.value })}
              className="border rounded px-3 py-1.5 text-sm flex-1" />
            <select value={newRole.department} onChange={(e) => setNewRole({ ...newRole, department: e.target.value })}
              className="border rounded px-2 py-1.5 text-sm">
              <option value="">Департамент (опц.)</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <select value={newRole.parent_role} onChange={(e) => setNewRole({ ...newRole, parent_role: e.target.value })}
              className="border rounded px-2 py-1.5 text-sm">
              <option value="">Родитель (опц.)</option>
              {roles.filter((r) => !r.is_system || r.code === "owner").map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
            </select>
            <button onClick={handleAddRole} className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700">
              <Plus size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
