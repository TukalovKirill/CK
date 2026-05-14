import { useEffect, useState, useCallback } from "react";
import { getUnits, getDepartments, getOrgRoles, getZones, createZone, updateZone, deleteZone } from "../api/org";
import { useAuth, getUserUnitsForPermission } from "../context/AuthContext";
import { useDialog } from "../components/DialogProvider";
import useRealtimeUpdates from "../hooks/useRealtimeUpdates";
import useSessionState from "../hooks/useSessionState";
import Dropdown from "../components/Dropdown";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";

export default function ZonesPage() {
    const { user } = useAuth();
    const dialog = useDialog();
    const allowedUnitIds = getUserUnitsForPermission(user, "org.view");

    const [units, setUnits] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [orgRoles, setOrgRoles] = useState([]);
    const [zones, setZones] = useState([]);
    const [loading, setLoading] = useState(false);

    const [unitId, setUnitId] = useSessionState("zones:unitId", "");
    const [departmentId, setDepartmentId] = useSessionState("zones:deptId", "");
    const [orgRoleId, setOrgRoleId] = useSessionState("zones:roleId", "");

    const [newName, setNewName] = useState("");
    const [newDesc, setNewDesc] = useState("");
    const [reloadKey, setReloadKey] = useState(0);

    const reload = useCallback(() => setReloadKey((k) => k + 1), []);

    useEffect(() => {
        (async () => {
            try {
                const res = await getUnits();
                let list = res.data;
                if (allowedUnitIds) {
                    list = list.filter((u) => allowedUnitIds.includes(u.id));
                }
                setUnits(list);
                if (list.length === 1 && !unitId) setUnitId(String(list[0].id));
            } catch {
                toast.error("Ошибка загрузки юнитов");
            }
        })();
    }, [reloadKey]);

    useEffect(() => {
        if (!unitId) { setDepartments([]); setDepartmentId(""); return; }
        (async () => {
            try {
                const res = await getDepartments({ unit: unitId });
                const list = res.data;
                setDepartments(list);
                if (list.length === 1) setDepartmentId(String(list[0].id));
            } catch {
                setDepartments([]);
            }
        })();
    }, [unitId, reloadKey]);

    useEffect(() => {
        if (!departmentId) { setOrgRoles([]); setOrgRoleId(""); return; }
        (async () => {
            try {
                const res = await getOrgRoles({ department: departmentId });
                const list = res.data;
                setOrgRoles(list);
                if (list.length === 1) setOrgRoleId(String(list[0].id));
            } catch {
                setOrgRoles([]);
            }
        })();
    }, [departmentId, reloadKey]);

    useEffect(() => {
        if (!departmentId || !orgRoleId) { setZones([]); return; }
        (async () => {
            setLoading(true);
            try {
                const res = await getZones({ department: departmentId, org_role: orgRoleId });
                setZones(res.data.results || res.data);
            } catch {
                setZones([]);
            } finally {
                setLoading(false);
            }
        })();
    }, [departmentId, orgRoleId, reloadKey]);

    useRealtimeUpdates(["zone", "unit", "department", "org_role"], reload);

    const handleAdd = async () => {
        if (!newName.trim()) return;
        try {
            const res = await createZone({
                name: newName.trim(),
                description: newDesc.trim(),
                department: Number(departmentId),
                org_role: Number(orgRoleId),
            });
            setZones((prev) => [...prev, res.data]);
            setNewName("");
            setNewDesc("");
            toast.success("Зона добавлена");
        } catch {
            toast.error("Ошибка создания зоны");
        }
    };

    const handleUpdate = async (zoneId, field, value) => {
        try {
            await updateZone(zoneId, { [field]: value });
        } catch {
            toast.error("Ошибка обновления");
        }
    };

    const handleDelete = async (zoneId) => {
        const ok = await dialog.confirm("Удалить зону?", "Это действие нельзя отменить.", { destructive: true });
        if (!ok) return;
        try {
            await deleteZone(zoneId);
            setZones((prev) => prev.filter((z) => z.id !== zoneId));
            toast.success("Зона удалена");
        } catch {
            toast.error("Ошибка удаления");
        }
    };

    const unitOptions = units.map((u) => ({ value: String(u.id), label: u.name }));
    const deptOptions = departments.map((d) => ({ value: String(d.id), label: d.name }));
    const roleOptions = orgRoles.map((r) => ({ value: String(r.id), label: r.title || r.name }));

    return (
        <div className="page-shell page-stack">
            <div className="hero-banner">
                <h1 className="page-title">Зоны</h1>
                <p className="page-subtitle mt-1">Настройка зон обслуживания</p>
            </div>

            <div className="surface-toolbar">
                <div className="grid gap-3 md:grid-cols-3">
                    {units.length > 1 && (
                        <Dropdown
                            label="Юнит"
                            value={unitId}
                            onChange={(v) => { setUnitId(v); setDepartmentId(""); setOrgRoleId(""); }}
                            options={unitOptions}
                            placeholder="Выберите юнит"
                        />
                    )}
                    <Dropdown
                        label="Департамент"
                        value={departmentId}
                        onChange={(v) => { setDepartmentId(v); setOrgRoleId(""); }}
                        options={deptOptions}
                        placeholder="Выберите департамент"
                        disabled={!unitId}
                    />
                    <Dropdown
                        label="Роль / Должность"
                        value={orgRoleId}
                        onChange={setOrgRoleId}
                        options={roleOptions}
                        placeholder="Выберите роль"
                        disabled={!departmentId}
                    />
                </div>
            </div>

            {departmentId && orgRoleId && (
                <>
                    <div className="surface-panel">
                        <p className="section-title">Добавить зону</p>
                        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
                            <div>
                                <label className="block text-xs font-medium mb-1" style={{ color: "var(--n-muted)" }}>Название</label>
                                <input
                                    className="input-premium w-full"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    placeholder="Название зоны"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium mb-1" style={{ color: "var(--n-muted)" }}>Описание</label>
                                <input
                                    className="input-premium w-full"
                                    value={newDesc}
                                    onChange={(e) => setNewDesc(e.target.value)}
                                    placeholder="Описание"
                                />
                            </div>
                            <button className="btn-save" onClick={handleAdd}>Добавить</button>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <p className="section-title">Список зон</p>
                        {loading ? (
                            <div className="surface-empty">
                                <Loader2 size={20} className="animate-spin mx-auto" style={{ color: "var(--n-dim)" }} />
                            </div>
                        ) : zones.length === 0 ? (
                            <div className="surface-empty">Зоны не найдены</div>
                        ) : (
                            <div className="grid gap-3">
                                {zones.map((zone) => (
                                    <div key={zone.id} className="surface-panel">
                                        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
                                            <div>
                                                <label className="block text-xs font-medium mb-1" style={{ color: "var(--n-muted)" }}>Название</label>
                                                <input
                                                    className="input-premium w-full"
                                                    value={zone.name}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        setZones((prev) => prev.map((z) => z.id === zone.id ? { ...z, name: val } : z));
                                                        handleUpdate(zone.id, "name", val);
                                                    }}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium mb-1" style={{ color: "var(--n-muted)" }}>Описание</label>
                                                <input
                                                    className="input-premium w-full"
                                                    value={zone.description || ""}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        setZones((prev) => prev.map((z) => z.id === zone.id ? { ...z, description: val } : z));
                                                        handleUpdate(zone.id, "description", val);
                                                    }}
                                                />
                                            </div>
                                            <button className="btn-danger" onClick={() => handleDelete(zone.id)}>Удалить</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
