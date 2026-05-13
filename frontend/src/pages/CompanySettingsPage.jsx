import { useEffect, useState, useCallback, useMemo } from "react";
import {
  getUnits, createUnit, updateUnit, deleteUnit, reorderUnits,
  getDepartments, createDepartment, updateDepartment, deleteDepartment, reorderDepartments,
  getOrgRoles, createOrgRole, updateOrgRole, deleteOrgRole,
  getOrgRolesHierarchy, getOrgPermissions,
} from "../api/org";
import { useAuth, hasPermission } from "../context/AuthContext";
import { useDialog } from "../components/DialogProvider";
import Dropdown from "../components/Dropdown";
import useRealtimeUpdates from "../hooks/useRealtimeUpdates";
import toast from "react-hot-toast";
import {
  Plus, X, ChevronDown, Shield,
} from "lucide-react";

export default function CompanySettingsPage() {
  const { user } = useAuth();
  const dialog = useDialog();

  const [units, setUnits] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [roles, setRoles] = useState([]);
  const [tree, setTree] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [showUnitInput, setShowUnitInput] = useState(false);
  const [newUnitName, setNewUnitName] = useState("");
  const [editingUnitId, setEditingUnitId] = useState(null);
  const [editingUnitName, setEditingUnitName] = useState("");

  const [newDeptName, setNewDeptName] = useState("");
  const [newDeptUnit, setNewDeptUnit] = useState(null);
  const [editingDeptId, setEditingDeptId] = useState(null);
  const [editingDeptName, setEditingDeptName] = useState("");

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [editingRole, setEditingRole] = useState(null);

  const [allPerms, setAllPerms] = useState([]);
  const [selectedPerms, setSelectedPerms] = useState(new Set());
  const [openDomains, setOpenDomains] = useState(new Set());
  const [roleForm, setRoleForm] = useState({
    title: "", group: "", unit: "", department: "", parent_role: "", can_manage_permissions: false,
  });
  const [saving, setSaving] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [u, d, r, h] = await Promise.all([
        getUnits(), getDepartments(), getOrgRoles(), getOrgRolesHierarchy(),
      ]);
      setUnits(u.data);
      setDepartments(d.data);
      setRoles(r.data);
      setTree(h.data);
      setErr("");
    } catch {
      setErr("Ошибка загрузки данных");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);
  useRealtimeUpdates(["unit", "department", "org_role"], loadAll);

  const deptsByUnit = useMemo(() => {
    const map = {};
    departments.forEach((d) => {
      if (!map[d.unit]) map[d.unit] = [];
      map[d.unit].push(d);
    });
    return map;
  }, [departments]);

  const handleAddUnit = async () => {
    if (!newUnitName.trim()) return;
    try {
      await createUnit({ name: newUnitName });
      setNewUnitName("");
      setShowUnitInput(false);
      loadAll();
    } catch { toast.error("Ошибка создания юнита"); }
  };

  const handleRenameUnit = async (id, name) => {
    if (!name.trim()) return;
    try {
      await updateUnit(id, { name });
      setEditingUnitId(null);
      loadAll();
    } catch { toast.error("Ошибка переименования"); }
  };

  const handleDeleteUnit = async (id) => {
    const ok = await dialog.confirm("Удалить юнит?", "Связанные департаменты и роли тоже будут удалены.", { destructive: true });
    if (!ok) return;
    try {
      await deleteUnit(id);
      loadAll();
    } catch { toast.error("Ошибка удаления"); }
  };

  const handleAddDept = async (unitId) => {
    if (!newDeptName.trim()) return;
    try {
      await createDepartment({ name: newDeptName, unit: unitId });
      setNewDeptName("");
      setNewDeptUnit(null);
      loadAll();
    } catch { toast.error("Ошибка создания департамента"); }
  };

  const handleRenameDept = async (id, name) => {
    if (!name.trim()) return;
    try {
      await updateDepartment(id, { name });
      setEditingDeptId(null);
      loadAll();
    } catch { toast.error("Ошибка переименования"); }
  };

  const handleDeleteDept = async (id) => {
    const ok = await dialog.confirm("Удалить департамент?", "Связанные роли останутся без департамента.", { destructive: true });
    if (!ok) return;
    try {
      await deleteDepartment(id);
      loadAll();
    } catch { toast.error("Ошибка удаления"); }
  };

  const openRoleSidebar = async (role) => {
    setEditingRole(role);
    setRoleForm({
      title: role?.title || "",
      group: role?.group || "",
      unit: role?.unit || role?.department_detail?.unit || "",
      department: role?.department || "",
      parent_role: role?.parent_role || "",
      can_manage_permissions: role?.can_manage_permissions || false,
    });
    setSidebarOpen(true);
    try {
      const res = await getOrgPermissions();
      setAllPerms(res.data);
    } catch { /* ignore */ }
    if (role) {
      const perms = role.permissions?.map((p) => (typeof p === "object" ? p.id : p)) || [];
      setSelectedPerms(new Set(perms));
    } else {
      setSelectedPerms(new Set());
    }
  };

  const handleSaveRole = async () => {
    if (!roleForm.title.trim()) return;
    setSaving(true);
    try {
      const payload = {
        title: roleForm.title,
        group: roleForm.group,
        department: roleForm.department || null,
        parent_role: roleForm.parent_role || null,
        permissions: [...selectedPerms],
        can_manage_permissions: roleForm.can_manage_permissions,
      };
      if (editingRole) {
        await updateOrgRole(editingRole.id, payload);
      } else {
        await createOrgRole(payload);
      }
      setSidebarOpen(false);
      loadAll();
    } catch { toast.error("Ошибка сохранения роли"); }
    finally { setSaving(false); }
  };

  const handleDeleteRole = async (id) => {
    const ok = await dialog.confirm("Удалить роль?", "Все подчинённые станут корневыми.", { destructive: true });
    if (!ok) return;
    try {
      await deleteOrgRole(id);
      setSidebarOpen(false);
      loadAll();
    } catch { toast.error("Ошибка удаления"); }
  };

  const handleMoveRole = async (roleId, newParentId) => {
    try {
      await updateOrgRole(roleId, { parent_role: newParentId });
      loadAll();
    } catch { toast.error("Ошибка перемещения"); }
  };

  const permDomains = useMemo(() => {
    const map = {};
    const labels = {};
    allPerms.forEach((p) => {
      const d = p.domain || p.code.split(".")[0];
      if (!map[d]) map[d] = [];
      map[d].push(p);
      if (p.domain_label) labels[d] = p.domain_label;
    });
    return { groups: map, labels };
  }, [allPerms]);

  if (loading) return <div className="surface-empty">Загрузка...</div>;

  return (
    <div className="page-shell page-stack">
      <h1 className="page-title">Оргструктура</h1>
      {err && <div className="surface-panel" style={{ borderColor: "#dc2626", color: "#dc2626" }}>{err}</div>}

      {/* UNITS */}
      <section>
        <div className="section-title">ЮНИТЫ</div>
        <div className="surface-panel">
          <div className="flex flex-wrap gap-2">
            {units.map((u) => (
              <div key={u.id} className="group relative">
                {editingUnitId === u.id ? (
                  <span className="inline-flex items-center gap-1">
                    <input
                      autoFocus
                      value={editingUnitName}
                      onChange={(e) => setEditingUnitName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRenameUnit(u.id, editingUnitName);
                        if (e.key === "Escape") setEditingUnitId(null);
                      }}
                      onBlur={() => handleRenameUnit(u.id, editingUnitName)}
                      className="input-premium w-32"
                    />
                  </span>
                ) : (
                  <button
                    onClick={() => { setEditingUnitId(u.id); setEditingUnitName(u.name); }}
                    className="badge-bronze flex items-center gap-1.5 py-1 px-3"
                  >
                    {u.name}
                    <span
                      role="button"
                      onClick={(e) => { e.stopPropagation(); handleDeleteUnit(u.id); }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={12} />
                    </span>
                  </button>
                )}
              </div>
            ))}
            {showUnitInput ? (
              <span className="inline-flex items-center gap-1">
                <input
                  autoFocus
                  value={newUnitName}
                  onChange={(e) => setNewUnitName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddUnit();
                    if (e.key === "Escape") setShowUnitInput(false);
                  }}
                  className="input-premium w-32"
                  placeholder="Название"
                />
                <button className="btn-save text-xs px-2 py-1" onClick={handleAddUnit}>Добавить</button>
              </span>
            ) : (
              <button onClick={() => setShowUnitInput(true)} className="badge-muted" style={{ borderStyle: "dashed" }}>
                <Plus size={14} />
              </button>
            )}
          </div>
        </div>
      </section>

      {/* DEPARTMENTS */}
      <section>
        <div className="section-title">ДЕПАРТАМЕНТЫ</div>
        {units.length === 0 ? (
          <div className="surface-empty">Сначала добавьте хотя бы один юнит.</div>
        ) : (
          <div className="space-y-3">
            {units.map((u) => {
              const uDepts = deptsByUnit[u.id] || [];
              return (
                <div key={u.id} className="surface-panel">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-medium" style={{ color: "var(--n-fg)" }}>{u.name}</span>
                    <span className="badge-muted text-xs">{uDepts.length}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {uDepts.map((d) => (
                      <div key={d.id} className="group relative">
                        {editingDeptId === d.id ? (
                          <span className="inline-flex items-center gap-1">
                            <input
                              autoFocus
                              value={editingDeptName}
                              onChange={(e) => setEditingDeptName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleRenameDept(d.id, editingDeptName);
                                if (e.key === "Escape") setEditingDeptId(null);
                              }}
                              onBlur={() => handleRenameDept(d.id, editingDeptName)}
                              className="input-premium w-32"
                            />
                          </span>
                        ) : (
                          <button
                            onClick={() => { setEditingDeptId(d.id); setEditingDeptName(d.name); }}
                            className="badge-muted flex items-center gap-1.5 py-1 px-3"
                          >
                            {d.name}
                            <span
                              role="button"
                              onClick={(e) => { e.stopPropagation(); handleDeleteDept(d.id); }}
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X size={12} />
                            </span>
                          </button>
                        )}
                      </div>
                    ))}
                    {newDeptUnit === u.id ? (
                      <span className="inline-flex items-center gap-1">
                        <input
                          autoFocus
                          value={newDeptName}
                          onChange={(e) => setNewDeptName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleAddDept(u.id);
                            if (e.key === "Escape") { setNewDeptUnit(null); setNewDeptName(""); }
                          }}
                          className="input-premium w-32"
                          placeholder="Название"
                        />
                        <button className="btn-save text-xs px-2 py-1" onClick={() => handleAddDept(u.id)}>Добавить</button>
                      </span>
                    ) : (
                      <button onClick={() => setNewDeptUnit(u.id)} className="badge-muted" style={{ borderStyle: "dashed" }}>
                        <Plus size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ROLE HIERARCHY */}
      <section>
        <div className="flex items-center justify-between">
          <div className="section-title">ИЕРАРХИЯ РОЛЕЙ</div>
          <button className="btn-save text-xs" onClick={() => openRoleSidebar(null)}>
            <Plus size={14} /> Роль
          </button>
        </div>
        <div className="surface-panel space-y-1">
          {roles.length === 0 ? (
            <div className="surface-empty">Нет ролей</div>
          ) : (
            roles.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors"
                style={{ paddingLeft: `${(r.level || 0) * 1.5 + 0.5}rem` }}
                onClick={() => openRoleSidebar(r)}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--n-hover)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}
              >
                <Shield size={14} style={{ color: "var(--n-accent)" }} />
                <span className="text-sm" style={{ color: "var(--n-fg)" }}>{r.title}</span>
                {r.is_system && <span className="badge-muted text-[10px]">система</span>}
                {r.department_name && (
                  <span className="text-xs" style={{ color: "var(--n-dim)" }}>({r.department_name})</span>
                )}
              </div>
            ))
          )}
        </div>
      </section>

      {/* ROLE SIDEBAR */}
      {sidebarOpen && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setSidebarOpen(false)} />
          <div
            className="fixed right-0 top-0 bottom-0 z-[45] w-full sm:w-[30rem] flex flex-col overflow-y-auto legal-modal-scroll sm:pt-24"
            style={{
              background: "var(--n-panel)",
              borderLeft: "1px solid var(--n-border)",
            }}
          >
            <div className="p-6 space-y-4 flex-1">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold" style={{ color: "var(--n-fg)" }}>
                  {editingRole ? "Редактировать роль" : "Новая роль"}
                </h2>
                <button className="btn-ghost" onClick={() => setSidebarOpen(false)}>
                  <X size={18} />
                </button>
              </div>

              {editingRole?.is_system && (
                <div className="surface-block text-sm" style={{ color: "var(--n-muted)" }}>
                  Системная роль. Редактирование и удаление недоступны.
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium" style={{ color: "var(--n-muted)" }}>Название</label>
                  <input
                    value={roleForm.title}
                    onChange={(e) => setRoleForm({ ...roleForm, title: e.target.value })}
                    disabled={editingRole?.is_system}
                    className="input-premium mt-1"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium" style={{ color: "var(--n-muted)" }}>Группа для графика</label>
                  <input
                    value={roleForm.group}
                    onChange={(e) => setRoleForm({ ...roleForm, group: e.target.value })}
                    className="input-premium mt-1"
                    placeholder="Опционально"
                  />
                </div>

                <Dropdown
                  label="Юнит"
                  value={roleForm.unit}
                  onChange={(v) => setRoleForm({ ...roleForm, unit: v, department: "" })}
                  options={units.map((u) => ({ value: u.id, label: u.name }))}
                  disabled={editingRole?.is_system}
                />

                <Dropdown
                  label="Департамент"
                  value={roleForm.department}
                  onChange={(v) => setRoleForm({ ...roleForm, department: v })}
                  options={departments.filter((d) => !roleForm.unit || d.unit === Number(roleForm.unit)).map((d) => ({ value: d.id, label: d.name }))}
                  disabled={!roleForm.unit || editingRole?.is_system}
                />

                <Dropdown
                  label="Подчиняется"
                  value={roleForm.parent_role}
                  onChange={(v) => setRoleForm({ ...roleForm, parent_role: v })}
                  options={roles.filter((r) => r.id !== editingRole?.id).map((r) => ({ value: r.id, label: `${r.title}${r.department_name ? ` (${r.department_name})` : ""}` }))}
                />

                {user?.can_manage_permissions && (
                  <label className="flex items-center gap-2 text-sm" style={{ color: "var(--n-fg)" }}>
                    <input
                      type="checkbox"
                      checked={roleForm.can_manage_permissions}
                      onChange={(e) => setRoleForm({ ...roleForm, can_manage_permissions: e.target.checked })}
                      className="check-premium"
                    />
                    Управление правами
                  </label>
                )}
              </div>

              {/* PERMISSIONS */}
              {!editingRole?.is_system && user?.can_manage_permissions && (
                <div className="space-y-2">
                  <div className="section-title">ПРАВА ДОСТУПА</div>
                  {Object.entries(permDomains.groups).map(([domain, perms]) => {
                    const domainOpen = openDomains.has(domain);
                    const selected = perms.filter((p) => selectedPerms.has(p.id)).length;
                    return (
                      <div key={domain} className="surface-block">
                        <button
                          onClick={() => setOpenDomains((s) => { const n = new Set(s); n.has(domain) ? n.delete(domain) : n.add(domain); return n; })}
                          className="w-full flex items-center justify-between text-sm"
                          style={{ color: "var(--n-fg)" }}
                        >
                          <span className="font-medium">{permDomains.labels[domain] || domain}</span>
                          <span className="flex items-center gap-2">
                            <span className="badge-muted text-xs">{selected}/{perms.length}</span>
                            <ChevronDown size={14} style={{ transform: domainOpen ? "rotate(0)" : "rotate(-90deg)", transition: "transform 200ms" }} />
                          </span>
                        </button>
                        {domainOpen && (
                          <div className="mt-2 space-y-1">
                            {perms.map((p) => (
                              <label key={p.id} className="flex items-start gap-2 text-sm cursor-pointer py-1" style={{ color: "var(--n-fg)" }}>
                                <input
                                  type="checkbox"
                                  checked={selectedPerms.has(p.id)}
                                  onChange={() => setSelectedPerms((s) => { const n = new Set(s); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; })}
                                  className="check-premium mt-0.5"
                                />
                                <div>
                                  <div>{p.name}</div>
                                  {p.description && <div className="text-xs mt-0.5" style={{ color: "var(--n-fg-muted)", opacity: 0.7 }}>{p.description}</div>}
                                </div>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {!editingRole?.is_system && (
              <div className="p-6 flex items-center gap-2" style={{ borderTop: "1px solid var(--n-border)" }}>
                <button className="btn-save flex-1" onClick={handleSaveRole} disabled={saving}>
                  {saving ? "Сохранение..." : "Сохранить"}
                </button>
                {editingRole && (
                  <button className="btn-danger" onClick={() => handleDeleteRole(editingRole.id)}>
                    Удалить
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
