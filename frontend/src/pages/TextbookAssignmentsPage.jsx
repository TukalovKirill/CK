import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
    getAssignments, createAssignment, deleteAssignment, bulkDeleteAssignments,
    getCards, getSections, getCategories,
} from "../api/textbooks";
import { getUnits, getDepartments, getOrgRoles } from "../api/org";
import useRealtimeUpdates from "../hooks/useRealtimeUpdates";
import useSessionState from "../hooks/useSessionState";
import AnimatedCollapse from "../components/AnimatedCollapse";
import Dropdown from "../components/Dropdown";
import { useDialog } from "../components/DialogProvider";
import toast from "react-hot-toast";
import {
    ArrowLeft, ChevronRight, ChevronDown, Plus, Trash2, Search, Check,
    Building2, FolderClosed, Shield,
} from "lucide-react";

export default function TextbookAssignmentsPage() {
    const dialog = useDialog();

    const [units, setUnits] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [roles, setRoles] = useState([]);
    const [assignments, setAssignments] = useState([]);
    const [cards, setCards] = useState([]);
    const [sections, setSections] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);

    const [filters, setFilters] = useSessionState("tbAssign:filters", { unit: "" });
    const [expanded, setExpanded] = useSessionState("tbAssign:expanded", {});
    const [assignModal, setAssignModal] = useSessionState("tbAssign:modal", null);

    const [modalOpen, setModalOpen] = useState(false);
    const [modalTarget, setModalTarget] = useState(null);
    const [modalSearch, setModalSearch] = useState("");
    const [modalSection, setModalSection] = useState("");
    const [modalCategory, setModalCategory] = useState("");

    const loadAll = async () => {
        try {
            const [uRes, dRes, rRes, aRes, cRes, sRes, catRes] = await Promise.all([
                getUnits(), getDepartments(), getOrgRoles(),
                getAssignments(), getCards(),
                getSections(), getCategories(),
            ]);
            setUnits(uRes.data);
            setDepartments(dRes.data);
            setRoles(rRes.data);
            setAssignments(aRes.data.results || aRes.data);
            setCards(cRes.data.results || cRes.data);
            setSections(sRes.data);
            setCategories(catRes.data);
        } catch {
            toast.error("Ошибка загрузки");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadAll(); }, []);
    useRealtimeUpdates(["textbook_card"], loadAll);

    const toggleUnit = (id) =>
        setExpanded((prev) => ({ ...prev, [`u_${id}`]: !prev[`u_${id}`] }));
    const toggleDept = (id) =>
        setExpanded((prev) => ({ ...prev, [`d_${id}`]: !prev[`d_${id}`] }));

    const getAssignmentsFor = (unitId, deptId, roleId) =>
        assignments.filter((a) => {
            if (a.unit !== unitId) return false;
            if (roleId) return a.department === deptId && a.org_role === roleId;
            if (deptId) return a.department === deptId && !a.org_role;
            return !a.department && !a.org_role;
        });

    const isCardAssigned = (cardId, unitId, deptId, roleId) =>
        assignments.some((a) => {
            if (a.card !== cardId || a.unit !== unitId) return false;
            if (roleId) return a.department === deptId && a.org_role === roleId;
            if (deptId) return a.department === deptId && !a.org_role;
            return !a.department && !a.org_role;
        });

    const findAssignment = (cardId, unitId, deptId, roleId) =>
        assignments.find((a) => {
            if (a.card !== cardId || a.unit !== unitId) return false;
            if (roleId) return a.department === deptId && a.org_role === roleId;
            if (deptId) return a.department === deptId && !a.org_role;
            return !a.department && !a.org_role;
        });

    const openAssignModal = (unitId, deptId, roleId) => {
        setModalTarget({ unit: unitId, department: deptId || null, org_role: roleId || null });
        setAssignModal({ unit: unitId, department: deptId || null, org_role: roleId || null });
        setModalSearch("");
        setModalSection("");
        setModalCategory("");
        setModalOpen(true);
    };

    const closeModal = () => {
        setModalOpen(false);
        setAssignModal(null);
    };

    const handleAssign = async (cardId) => {
        if (!modalTarget) return;
        try {
            await createAssignment({ card: cardId, ...modalTarget });
            loadAll();
        } catch {
            toast.error("Ошибка назначения");
        }
    };

    const handleUnassign = async (cardId) => {
        if (!modalTarget) return;
        const a = findAssignment(cardId, modalTarget.unit, modalTarget.department, modalTarget.org_role);
        if (!a) return;
        try {
            await deleteAssignment(a.id);
            loadAll();
        } catch {
            toast.error("Ошибка удаления");
        }
    };

    const handleClear = async (unitId, deptId) => {
        const ok = await dialog.confirm(
            "Очистить назначения?",
            "Все назначения этого уровня будут удалены.",
            { destructive: true },
        );
        if (!ok) return;
        try {
            const data = { unit: unitId };
            if (deptId) data.department = deptId;
            await bulkDeleteAssignments(data);
            loadAll();
        } catch {
            toast.error("Ошибка очистки");
        }
    };

    const filterUnit = filters.unit;
    const displayUnits = filterUnit ? units.filter((u) => u.id === Number(filterUnit)) : units;

    let modalCards = cards;
    if (modalSection) modalCards = modalCards.filter((c) => String(c.section) === modalSection);
    if (modalCategory) modalCards = modalCards.filter((c) => String(c.category) === modalCategory);
    if (modalSearch.length >= 2) {
        const q = modalSearch.toLowerCase();
        modalCards = modalCards.filter((c) => c.name.toLowerCase().includes(q));
    }

    const modalFilteredCategories = modalSection
        ? categories.filter((c) => String(c.section) === modalSection)
        : categories;

    if (loading) {
        return (
            <div className="page-shell page-stack">
                <div className="surface-empty">Загрузка...</div>
            </div>
        );
    }

    return (
        <div className="page-shell page-stack">
            {/* Hero Banner */}
            <div className="hero-banner">
                <Link to="/textbooks/manage" className="btn-ghost flex items-center gap-1.5 mb-2" style={{ color: "#555" }}>
                    <ArrowLeft size={16} /> Управление
                </Link>
                <h1 className="page-title">Распределение учебников</h1>
                <p className="page-subtitle mt-1">Назначение карточек на юниты, департаменты и роли</p>
            </div>

            {/* Filter toolbar */}
            <div className="surface-toolbar">
                <Dropdown
                    value={filterUnit}
                    onChange={(val) => setFilters((prev) => ({ ...prev, unit: val }))}
                    options={units.map((u) => ({ value: String(u.id), label: u.name }))}
                    placeholder="Все юниты"
                    className="w-56"
                />
            </div>

            {/* Unit tree */}
            <div className="space-y-2">
                {displayUnits.map((unit) => {
                    const unitDepts = departments.filter((d) => d.unit === unit.id);
                    const unitAssignments = getAssignmentsFor(unit.id, null, null);
                    const isExpanded = expanded[`u_${unit.id}`];

                    return (
                        <div key={unit.id} className="surface-panel !p-0">
                            {/* Unit header */}
                            <div
                                className="flex items-center justify-between px-3 py-2 rounded-t-[inherit]"
                                style={{ background: "var(--n-hover)" }}
                            >
                                <button
                                    onClick={() => toggleUnit(unit.id)}
                                    className="flex items-center gap-2 text-sm font-medium"
                                    style={{ color: "var(--n-fg)" }}
                                >
                                    {isExpanded
                                        ? <ChevronDown size={14} style={{ color: "var(--n-muted)" }} />
                                        : <ChevronRight size={14} style={{ color: "var(--n-muted)" }} />
                                    }
                                    <Building2 size={14} className="text-amber-400 shrink-0" />
                                    {unit.name}
                                    <span className="badge-muted">
                                        {assignments.filter((a) => a.unit === unit.id).length}
                                    </span>
                                </button>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => openAssignModal(unit.id, null, null)}
                                        className="btn-ghost"
                                    >
                                        <Plus size={12} /> Назначить
                                    </button>
                                    <button
                                        onClick={() => handleClear(unit.id, null)}
                                        className="btn-danger btn-sm"
                                        title="Очистить"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            </div>

                            <AnimatedCollapse open={isExpanded}>
                                <div className="p-3 space-y-2">
                                    {unitAssignments.length > 0 && (
                                        <div className="mb-2">
                                            <p className="text-[10px] mb-1" style={{ color: "var(--n-muted)" }}>
                                                Назначено на юнит:
                                            </p>
                                            <div className="flex flex-wrap gap-1">
                                                {unitAssignments.map((a) => (
                                                    <span key={a.id} className="badge-muted">
                                                        {a.card_name || `#${a.card}`}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {unitDepts.map((dept) => {
                                        const deptRoles = roles.filter((r) => r.department === dept.id);
                                        const deptAssignments = getAssignmentsFor(unit.id, dept.id, null);
                                        const deptExpanded = expanded[`d_${dept.id}`];

                                        return (
                                            <div key={dept.id} className="surface-panel !p-0 ml-4">
                                                {/* Dept header */}
                                                <div className="flex items-center justify-between px-3 py-2">
                                                    <button
                                                        onClick={() => toggleDept(dept.id)}
                                                        className="flex items-center gap-2 text-xs font-medium"
                                                        style={{ color: "var(--n-fg)" }}
                                                    >
                                                        {deptExpanded
                                                            ? <ChevronDown size={12} style={{ color: "var(--n-muted)" }} />
                                                            : <ChevronRight size={12} style={{ color: "var(--n-muted)" }} />
                                                        }
                                                        <FolderClosed size={12} className="text-blue-400 shrink-0" />
                                                        {dept.name}
                                                        {deptAssignments.length > 0 && (
                                                            <span className="badge-muted">{deptAssignments.length}</span>
                                                        )}
                                                    </button>
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            onClick={() => openAssignModal(unit.id, dept.id, null)}
                                                            className="btn-ghost"
                                                        >
                                                            <Plus size={12} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleClear(unit.id, dept.id)}
                                                            className="btn-danger btn-sm"
                                                        >
                                                            <Trash2 size={10} />
                                                        </button>
                                                    </div>
                                                </div>

                                                <AnimatedCollapse open={deptExpanded}>
                                                    <div className="px-3 pb-2 space-y-1">
                                                        {deptAssignments.length > 0 && (
                                                            <div className="flex flex-wrap gap-1 mb-2">
                                                                {deptAssignments.map((a) => (
                                                                    <span key={a.id} className="badge-muted">
                                                                        {a.card_name || `#${a.card}`}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {deptRoles.map((role) => {
                                                            const roleAssignments = getAssignmentsFor(unit.id, dept.id, role.id);
                                                            return (
                                                                <div
                                                                    key={role.id}
                                                                    className="flex items-center justify-between ml-4 py-1 border-b last:border-0"
                                                                    style={{ borderColor: "var(--n-border)" }}
                                                                >
                                                                    <div className="flex items-center gap-2 flex-wrap">
                                                                        <Shield size={11} className="text-purple-400 shrink-0" />
                                                                        <span className="text-xs" style={{ color: "var(--n-muted)" }}>
                                                                            {role.name}
                                                                        </span>
                                                                        {roleAssignments.length > 0 && (
                                                                            <div className="flex flex-wrap gap-1">
                                                                                {roleAssignments.map((a) => (
                                                                                    <span key={a.id} className="badge-muted">
                                                                                        {a.card_name || `#${a.card}`}
                                                                                    </span>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <button
                                                                        onClick={() => openAssignModal(unit.id, dept.id, role.id)}
                                                                        className="btn-ghost"
                                                                    >
                                                                        <Plus size={10} />
                                                                    </button>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </AnimatedCollapse>
                                            </div>
                                        );
                                    })}

                                    {unitDepts.length === 0 && (
                                        <p className="text-xs ml-4" style={{ color: "var(--n-muted)" }}>
                                            Нет департаментов
                                        </p>
                                    )}
                                </div>
                            </AnimatedCollapse>
                        </div>
                    );
                })}

                {displayUnits.length === 0 && (
                    <div className="surface-empty">Нет юнитов</div>
                )}
            </div>

            {/* Assign modal */}
            {modalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="fixed inset-0 bg-black/60" onClick={closeModal} />
                    <div
                        className="relative max-w-lg w-full rounded-[24px] p-6 flex flex-col"
                        style={{
                            background: "var(--n-panel)",
                            border: "1px solid var(--n-border)",
                            boxShadow: "0 8px 32px rgba(0,0,0,0.1)",
                            maxHeight: "80vh",
                        }}
                    >
                        <h2 className="text-base font-semibold mb-4" style={{ color: "var(--n-fg)" }}>
                            Назначить карточки
                        </h2>

                        <div className="space-y-3 flex flex-col min-h-0 flex-1">
                            {/* Search */}
                            <div className="relative">
                                <Search
                                    size={13}
                                    className="absolute left-3 top-1/2 -translate-y-1/2"
                                    style={{ color: "var(--n-dim)" }}
                                />
                                <input
                                    placeholder="Поиск..."
                                    value={modalSearch}
                                    onChange={(e) => setModalSearch(e.target.value)}
                                    className="input-premium w-full pl-9"
                                />
                            </div>

                            {/* Filter dropdowns */}
                            <div className="flex gap-2">
                                <Dropdown
                                    value={modalSection}
                                    onChange={(val) => { setModalSection(val); setModalCategory(""); }}
                                    options={sections.map((s) => ({ value: String(s.id), label: s.name }))}
                                    placeholder="Раздел"
                                    className="flex-1"
                                />
                                <Dropdown
                                    value={modalCategory}
                                    onChange={(val) => setModalCategory(val)}
                                    options={modalFilteredCategories.map((c) => ({ value: String(c.id), label: c.name }))}
                                    placeholder="Категория"
                                    className="flex-1"
                                />
                            </div>

                            {/* Card list */}
                            <div className="overflow-y-auto space-y-1 flex-1 pr-1">
                                {modalCards.map((card) => {
                                    const assigned = modalTarget && isCardAssigned(
                                        card.id, modalTarget.unit, modalTarget.department, modalTarget.org_role,
                                    );
                                    return (
                                        <div key={card.id} className="surface-block flex items-center justify-between">
                                            <div className="flex items-center gap-2 min-w-0">
                                                {card.first_photo ? (
                                                    <img
                                                        src={card.first_photo}
                                                        alt=""
                                                        className="w-8 h-8 object-cover rounded flex-none"
                                                        style={{ border: "1px solid var(--n-border)" }}
                                                    />
                                                ) : (
                                                    <div
                                                        className="w-8 h-8 rounded flex-none"
                                                        style={{ background: "var(--n-hover)", border: "1px solid var(--n-border)" }}
                                                    />
                                                )}
                                                <span className="truncate text-sm" style={{ color: "var(--n-fg)" }}>
                                                    {card.name}
                                                </span>
                                                {assigned && <span className="badge-success shrink-0">Назначено</span>}
                                            </div>
                                            {assigned ? (
                                                <button
                                                    onClick={() => handleUnassign(card.id)}
                                                    className="btn-ghost shrink-0"
                                                >
                                                    <Check size={12} /> Убрать
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => handleAssign(card.id)}
                                                    className="btn-ghost shrink-0"
                                                >
                                                    <Plus size={12} /> Назначить
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                                {modalCards.length === 0 && (
                                    <div className="surface-empty">Нет карточек</div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
