import { useEffect, useState, useCallback } from "react";
import {
    getUnits, createUnit, updateUnit, deleteUnit, reorderUnits,
    getDepartments, createDepartment, updateDepartment, deleteDepartment, reorderDepartments,
    getOrgRoles, createOrgRole, updateOrgRole, deleteOrgRole, getOrgPermissions,
} from "../api/org";
import { useAuth, hasPermission } from "../context/AuthContext";
import useRealtimeUpdates from "../hooks/useRealtimeUpdates";
import Modal from "../components/Modal";
import toast from "react-hot-toast";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import {
    Plus, Trash2, ChevronDown, ChevronRight, GripVertical, Pencil, Check, X, Settings,
} from "lucide-react";

function InlineEdit({ value, onSave, className }) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(value);

    if (!editing) {
        return (
            <span
                className={`cursor-pointer ${className || ""}`}
                onDoubleClick={() => { setDraft(value); setEditing(true); }}
            >
                {value}
            </span>
        );
    }

    return (
        <span className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter") { onSave(draft); setEditing(false); }
                    if (e.key === "Escape") setEditing(false);
                }}
                className="border border-gray-400 px-1 py-0.5 text-sm w-40"
            />
            <button onClick={() => { onSave(draft); setEditing(false); }}><Check size={14} /></button>
            <button onClick={() => setEditing(false)}><X size={14} /></button>
        </span>
    );
}

export default function OrgStructurePage() {
    const { user } = useAuth();
    const canManage = hasPermission(user, "org.manage");
    const canManageRoles = hasPermission(user, "org.roles_manage");

    const [units, setUnits] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [roles, setRoles] = useState([]);
    const [permissions, setPermissions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState({});

    const [newUnit, setNewUnit] = useState("");
    const [newDept, setNewDept] = useState({ unit: "", name: "" });
    const [newRole, setNewRole] = useState({ title: "", department: "", parent_role: "" });

    const [roleModal, setRoleModal] = useState(null);
    const [rolePerms, setRolePerms] = useState([]);

    const loadAll = useCallback(async () => {
        try {
            const fetches = [getUnits(), getDepartments(), getOrgRoles()];
            if (canManageRoles) fetches.push(getOrgPermissions());
            const results = await Promise.all(fetches);
            setUnits(results[0].data);
            setDepartments(results[1].data);
            setRoles(results[2].data);
            if (results[3]) setPermissions(results[3].data);
        } catch {
            toast.error("Ошибка загрузки");
        } finally {
            setLoading(false);
        }
    }, [canManageRoles]);

    useEffect(() => { loadAll(); }, [loadAll]);
    useRealtimeUpdates(["unit", "department", "org_role"], loadAll);

    const toggle = (key) => setExpanded((p) => ({ ...p, [key]: !p[key] }));

    const handleUnitDrag = async (result) => {
        if (!result.destination) return;
        const items = Array.from(units);
        const [moved] = items.splice(result.source.index, 1);
        items.splice(result.destination.index, 0, moved);
        setUnits(items);
        try {
            await reorderUnits(items.map((u) => u.id));
        } catch {
            toast.error("Ошибка сортировки");
            loadAll();
        }
    };

    const handleDeptDrag = async (unitId, result) => {
        if (!result.destination) return;
        const unitDepts = departments.filter((d) => d.unit === unitId);
        const otherDepts = departments.filter((d) => d.unit !== unitId);
        const [moved] = unitDepts.splice(result.source.index, 1);
        unitDepts.splice(result.destination.index, 0, moved);
        setDepartments([...otherDepts, ...unitDepts]);
        try {
            await reorderDepartments(unitDepts.map((d) => d.id));
        } catch {
            toast.error("Ошибка сортировки");
            loadAll();
        }
    };

    const handleAddUnit = async () => {
        if (!newUnit.trim()) return;
        try {
            await createUnit({ name: newUnit });
            setNewUnit("");
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
            loadAll();
        } catch {
            toast.error("Ошибка");
        }
    };

    const openRolePerms = (role) => {
        setRoleModal(role);
        setRolePerms(role.permissions?.map((p) => (typeof p === "object" ? p.id : p)) || []);
    };

    const saveRolePerms = async () => {
        if (!roleModal) return;
        try {
            await updateOrgRole(roleModal.id, { permissions: rolePerms });
            setRoleModal(null);
            loadAll();
        } catch {
            toast.error("Ошибка сохранения");
        }
    };

    const togglePerm = (id) => {
        setRolePerms((prev) =>
            prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
        );
    };

    const permDomains = {};
    permissions.forEach((p) => {
        const d = p.domain || p.code.split(".")[0];
        if (!permDomains[d]) permDomains[d] = [];
        permDomains[d].push(p);
    });

    if (loading) return <p className="text-center py-8 text-gray-500">Загрузка...</p>;

    return (
        <div className="max-w-4xl mx-auto">
            <h1 className="text-lg font-semibold mb-4">Оргструктура</h1>

            <DragDropContext onDragEnd={canManage ? handleUnitDrag : () => {}}>
                <Droppable droppableId="units">
                    {(provided) => (
                        <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1">
                            {units.map((unit, idx) => {
                                const unitDepts = departments.filter((d) => d.unit === unit.id);
                                const isOpen = expanded[`u-${unit.id}`];
                                return (
                                    <Draggable key={unit.id} draggableId={`unit-${unit.id}`} index={idx} isDragDisabled={!canManage}>
                                        {(prov) => (
                                            <div ref={prov.innerRef} {...prov.draggableProps} className="border border-gray-300">
                                                <div className="flex items-center justify-between px-3 py-2 cursor-pointer" onClick={() => toggle(`u-${unit.id}`)}>
                                                    <div className="flex items-center gap-2">
                                                        {canManage && (
                                                            <span {...prov.dragHandleProps}><GripVertical size={14} className="text-gray-400" /></span>
                                                        )}
                                                        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                        {canManage ? (
                                                            <InlineEdit
                                                                value={unit.name}
                                                                onSave={(v) => updateUnit(unit.id, { name: v }).then(loadAll).catch(() => toast.error("Ошибка"))}
                                                                className="text-sm font-medium"
                                                            />
                                                        ) : (
                                                            <span className="text-sm font-medium">{unit.name}</span>
                                                        )}
                                                        <span className="text-xs text-gray-500">{unitDepts.length} деп.</span>
                                                    </div>
                                                    {canManage && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                if (confirm("Удалить юнит?")) deleteUnit(unit.id).then(loadAll).catch(() => toast.error("Ошибка"));
                                                            }}
                                                            className="p-1 hover:bg-gray-100"
                                                        >
                                                            <Trash2 size={14} className="text-gray-500" />
                                                        </button>
                                                    )}
                                                </div>

                                                {isOpen && (
                                                    <DragDropContext onDragEnd={(r) => canManage && handleDeptDrag(unit.id, r)}>
                                                        <Droppable droppableId={`depts-${unit.id}`}>
                                                            {(dProv) => (
                                                                <div ref={dProv.innerRef} {...dProv.droppableProps} className="px-3 pb-2 pl-8 space-y-1">
                                                                    {unitDepts.map((dept, dIdx) => {
                                                                        const deptRoles = roles.filter((r) => r.department === dept.id);
                                                                        return (
                                                                            <Draggable key={dept.id} draggableId={`dept-${dept.id}`} index={dIdx} isDragDisabled={!canManage}>
                                                                                {(dp) => (
                                                                                    <div ref={dp.innerRef} {...dp.draggableProps} className="border border-gray-200 p-2">
                                                                                        <div className="flex items-center justify-between">
                                                                                            <div className="flex items-center gap-2">
                                                                                                {canManage && (
                                                                                                    <span {...dp.dragHandleProps}><GripVertical size={12} className="text-gray-400" /></span>
                                                                                                )}
                                                                                                {canManage ? (
                                                                                                    <InlineEdit
                                                                                                        value={dept.name}
                                                                                                        onSave={(v) => updateDepartment(dept.id, { name: v }).then(loadAll).catch(() => toast.error("Ошибка"))}
                                                                                                        className="text-sm"
                                                                                                    />
                                                                                                ) : (
                                                                                                    <span className="text-sm">{dept.name}</span>
                                                                                                )}
                                                                                            </div>
                                                                                            {canManage && (
                                                                                                <button
                                                                                                    onClick={() => {
                                                                                                        if (confirm("Удалить департамент?")) deleteDepartment(dept.id).then(loadAll).catch(() => toast.error("Ошибка"));
                                                                                                    }}
                                                                                                    className="p-1 hover:bg-gray-100"
                                                                                                >
                                                                                                    <Trash2 size={12} className="text-gray-500" />
                                                                                                </button>
                                                                                            )}
                                                                                        </div>

                                                                                        {deptRoles.length > 0 && (
                                                                                            <div className="flex flex-wrap gap-1 mt-2">
                                                                                                {deptRoles.map((r) => (
                                                                                                    <span key={r.id} className="inline-flex items-center gap-1 text-xs border border-gray-300 px-2 py-0.5">
                                                                                                        {r.title}
                                                                                                        {canManageRoles && !r.is_system && (
                                                                                                            <button onClick={() => openRolePerms(r)} title="Настроить права">
                                                                                                                <Settings size={10} className="text-gray-500" />
                                                                                                            </button>
                                                                                                        )}
                                                                                                        {canManage && !r.is_system && (
                                                                                                            <button
                                                                                                                onClick={() => {
                                                                                                                    if (confirm("Удалить роль?")) deleteOrgRole(r.id).then(loadAll).catch(() => toast.error("Ошибка"));
                                                                                                                }}
                                                                                                            >
                                                                                                                <X size={10} className="text-gray-500" />
                                                                                                            </button>
                                                                                                        )}
                                                                                                    </span>
                                                                                                ))}
                                                                                            </div>
                                                                                        )}

                                                                                    </div>
                                                                                )}
                                                                            </Draggable>
                                                                        );
                                                                    })}
                                                                    {dProv.placeholder}
                                                                </div>
                                                            )}
                                                        </Droppable>
                                                    </DragDropContext>
                                                )}
                                            </div>
                                        )}
                                    </Draggable>
                                );
                            })}
                            {provided.placeholder}
                        </div>
                    )}
                </Droppable>
            </DragDropContext>

            {canManage && (
                <div className="mt-6 border border-gray-300 p-4 space-y-3">
                    <h2 className="text-sm font-medium">Добавить</h2>

                    <div className="flex gap-2 items-end">
                        <label className="flex-1">
                            <span className="text-xs text-gray-600">Юнит</span>
                            <input
                                value={newUnit}
                                onChange={(e) => setNewUnit(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleAddUnit()}
                                className="border border-gray-300 px-2 py-1 text-sm w-full"
                                placeholder="Название"
                            />
                        </label>
                        <button onClick={handleAddUnit} className="border border-gray-400 px-2 py-1 text-sm hover:bg-gray-50">
                            <Plus size={14} />
                        </button>
                    </div>

                    <div className="flex gap-2 items-end">
                        <label>
                            <span className="text-xs text-gray-600">Юнит</span>
                            <select value={newDept.unit} onChange={(e) => setNewDept({ ...newDept, unit: e.target.value })} className="border border-gray-300 px-2 py-1 text-sm w-full">
                                <option value="">—</option>
                                {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                            </select>
                        </label>
                        <label className="flex-1">
                            <span className="text-xs text-gray-600">Департамент</span>
                            <input
                                value={newDept.name}
                                onChange={(e) => setNewDept({ ...newDept, name: e.target.value })}
                                onKeyDown={(e) => e.key === "Enter" && handleAddDept()}
                                className="border border-gray-300 px-2 py-1 text-sm w-full"
                                placeholder="Название"
                            />
                        </label>
                        <button onClick={handleAddDept} className="border border-gray-400 px-2 py-1 text-sm hover:bg-gray-50">
                            <Plus size={14} />
                        </button>
                    </div>

                    <div className="flex gap-2 items-end">
                        <label className="flex-1">
                            <span className="text-xs text-gray-600">Роль</span>
                            <input
                                value={newRole.title}
                                onChange={(e) => setNewRole({ ...newRole, title: e.target.value })}
                                onKeyDown={(e) => e.key === "Enter" && handleAddRole()}
                                className="border border-gray-300 px-2 py-1 text-sm w-full"
                                placeholder="Название"
                            />
                        </label>
                        <label>
                            <span className="text-xs text-gray-600">Департамент</span>
                            <select value={newRole.department} onChange={(e) => setNewRole({ ...newRole, department: e.target.value })} className="border border-gray-300 px-2 py-1 text-sm w-full">
                                <option value="">—</option>
                                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                        </label>
                        <label>
                            <span className="text-xs text-gray-600">Родитель</span>
                            <select value={newRole.parent_role} onChange={(e) => setNewRole({ ...newRole, parent_role: e.target.value })} className="border border-gray-300 px-2 py-1 text-sm w-full">
                                <option value="">—</option>
                                {roles.filter((r) => !r.is_system || r.code === "owner").map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
                            </select>
                        </label>
                        <button onClick={handleAddRole} className="border border-gray-400 px-2 py-1 text-sm hover:bg-gray-50">
                            <Plus size={14} />
                        </button>
                    </div>

                </div>
            )}

            <Modal open={!!roleModal} onClose={() => setRoleModal(null)} title={`Права: ${roleModal?.title || ""}`} wide>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                    {Object.entries(permDomains).map(([domain, perms]) => (
                        <div key={domain}>
                            <div className="text-xs font-medium text-gray-600 uppercase mb-1">
                                {perms[0]?.domain_label || domain}
                            </div>
                            <div className="space-y-0.5">
                                {perms.map((p) => (
                                    <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
                                        <input
                                            type="checkbox"
                                            checked={rolePerms.includes(p.id)}
                                            onChange={() => togglePerm(p.id)}
                                        />
                                        <span>{p.name}</span>
                                        {p.description && <span className="text-xs text-gray-400">— {p.description}</span>}
                                    </label>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
                <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-gray-200">
                    <button onClick={() => setRoleModal(null)} className="border border-gray-300 px-3 py-1 text-sm">Отмена</button>
                    <button onClick={saveRolePerms} className="border border-gray-400 px-3 py-1 text-sm font-medium hover:bg-gray-50">Сохранить</button>
                </div>
            </Modal>
        </div>
    );
}
