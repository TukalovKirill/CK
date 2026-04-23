import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
    getAssignments, createAssignment, deleteAssignment, bulkDeleteAssignments,
    getCards, getSections, getCategories,
} from "../api/textbooks";
import { getUnits, getDepartments, getOrgRoles } from "../api/org";
import useRealtimeUpdates from "../hooks/useRealtimeUpdates";
import Modal from "../components/Modal";
import AnimatedCollapse from "../components/AnimatedCollapse";
import toast from "react-hot-toast";
import { ArrowLeft, ChevronRight, Plus, Trash2, Search, Check } from "lucide-react";

export default function TextbookAssignmentsPage() {
    const [units, setUnits] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [roles, setRoles] = useState([]);
    const [assignments, setAssignments] = useState([]);
    const [cards, setCards] = useState([]);
    const [sections, setSections] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);

    const [expandedUnits, setExpandedUnits] = useState({});
    const [expandedDepts, setExpandedDepts] = useState({});
    const [filterUnit, setFilterUnit] = useState("");

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

    const toggleUnit = (id) => setExpandedUnits((prev) => ({ ...prev, [id]: !prev[id] }));
    const toggleDept = (id) => setExpandedDepts((prev) => ({ ...prev, [id]: !prev[id] }));

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
        setModalSearch("");
        setModalSection("");
        setModalCategory("");
        setModalOpen(true);
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
        if (!confirm("Удалить все назначения этого уровня?")) return;
        try {
            const data = { unit: unitId };
            if (deptId) data.department = deptId;
            await bulkDeleteAssignments(data);
            loadAll();
        } catch {
            toast.error("Ошибка очистки");
        }
    };

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

    if (loading) return <p className="text-center py-8 text-gray-500">Загрузка...</p>;

    return (
        <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-4">
                <Link to="/textbooks/manage" className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900">
                    <ArrowLeft size={14} /> Управление
                </Link>
                <h1 className="text-lg font-semibold">Распределение учебников</h1>
            </div>

            <div className="mb-4">
                <select
                    value={filterUnit}
                    onChange={(e) => setFilterUnit(e.target.value)}
                    className="border border-gray-300 px-2 py-1.5 text-sm"
                >
                    <option value="">Все юниты</option>
                    {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
            </div>

            <div className="space-y-2">
                {displayUnits.map((unit) => {
                    const unitDepts = departments.filter((d) => d.unit === unit.id);
                    const unitAssignments = getAssignmentsFor(unit.id, null, null);
                    const isExpanded = expandedUnits[unit.id];

                    return (
                        <div key={unit.id} className="border border-gray-300">
                            <div className="flex items-center justify-between p-2 bg-gray-50">
                                <button
                                    onClick={() => toggleUnit(unit.id)}
                                    className="flex items-center gap-1 text-sm font-medium"
                                >
                                    <ChevronRight size={14} className={`transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                                    {unit.name}
                                    <span className="text-xs text-gray-400 font-normal ml-1">
                                        ({assignments.filter((a) => a.unit === unit.id).length} карточек)
                                    </span>
                                </button>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => openAssignModal(unit.id, null, null)}
                                        className="text-xs border border-dashed border-gray-400 px-2 py-0.5 text-gray-500 hover:border-gray-600"
                                    >
                                        <Plus size={10} className="inline" /> Назначить
                                    </button>
                                    <button
                                        onClick={() => handleClear(unit.id, null)}
                                        className="text-xs text-gray-400 hover:text-gray-700 px-1"
                                        title="Очистить"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            </div>

                            <AnimatedCollapse open={isExpanded}>
                                <div className="p-2 space-y-1">
                                    {unitAssignments.length > 0 && (
                                        <div className="mb-2">
                                            <p className="text-[10px] text-gray-400 mb-1">Назначено на юнит:</p>
                                            <div className="flex flex-wrap gap-1">
                                                {unitAssignments.map((a) => (
                                                    <span key={a.id} className="text-xs border border-gray-200 px-2 py-0.5">
                                                        {a.card_name || `#${a.card}`}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {unitDepts.map((dept) => {
                                        const deptRoles = roles.filter((r) => r.department === dept.id);
                                        const deptAssignments = getAssignmentsFor(unit.id, dept.id, null);
                                        const deptExpanded = expandedDepts[dept.id];

                                        return (
                                            <div key={dept.id} className="border border-gray-200 ml-4">
                                                <div className="flex items-center justify-between p-1.5">
                                                    <button
                                                        onClick={() => toggleDept(dept.id)}
                                                        className="flex items-center gap-1 text-xs font-medium"
                                                    >
                                                        <ChevronRight size={12} className={`transition-transform ${deptExpanded ? "rotate-90" : ""}`} />
                                                        {dept.name}
                                                    </button>
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            onClick={() => openAssignModal(unit.id, dept.id, null)}
                                                            className="text-[10px] border border-dashed border-gray-300 px-1.5 py-0.5 text-gray-400 hover:border-gray-500"
                                                        >
                                                            <Plus size={8} className="inline" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleClear(unit.id, dept.id)}
                                                            className="text-gray-400 hover:text-gray-700 px-0.5"
                                                        >
                                                            <Trash2 size={10} />
                                                        </button>
                                                    </div>
                                                </div>

                                                <AnimatedCollapse open={deptExpanded}>
                                                    <div className="p-1.5 pt-0 space-y-1">
                                                        {deptAssignments.length > 0 && (
                                                            <div className="flex flex-wrap gap-1 mb-1">
                                                                {deptAssignments.map((a) => (
                                                                    <span key={a.id} className="text-[10px] border border-gray-200 px-1.5 py-0.5">
                                                                        {a.card_name || `#${a.card}`}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {deptRoles.map((role) => {
                                                            const roleAssignments = getAssignmentsFor(unit.id, dept.id, role.id);
                                                            return (
                                                                <div key={role.id} className="flex items-center justify-between ml-4 py-0.5 border-b border-gray-100 last:border-0">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-[10px] text-gray-500">{role.name}</span>
                                                                        {roleAssignments.length > 0 && (
                                                                            <div className="flex gap-1">
                                                                                {roleAssignments.map((a) => (
                                                                                    <span key={a.id} className="text-[10px] border border-gray-200 px-1 py-0">
                                                                                        {a.card_name || `#${a.card}`}
                                                                                    </span>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <button
                                                                        onClick={() => openAssignModal(unit.id, dept.id, role.id)}
                                                                        className="text-gray-400 hover:text-gray-600"
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
                                        <p className="text-[10px] text-gray-400 ml-4">Нет департаментов</p>
                                    )}
                                </div>
                            </AnimatedCollapse>
                        </div>
                    );
                })}

                {displayUnits.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-8">Нет юнитов</p>
                )}
            </div>

            <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Назначить карточки" wide>
                <div className="space-y-3">
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                placeholder="Поиск..."
                                value={modalSearch}
                                onChange={(e) => setModalSearch(e.target.value)}
                                className="w-full border border-gray-300 pl-7 pr-2 py-1 text-sm"
                            />
                        </div>
                        <select
                            value={modalSection}
                            onChange={(e) => { setModalSection(e.target.value); setModalCategory(""); }}
                            className="border border-gray-300 px-2 py-1 text-sm"
                        >
                            <option value="">Раздел</option>
                            {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        <select
                            value={modalCategory}
                            onChange={(e) => setModalCategory(e.target.value)}
                            className="border border-gray-300 px-2 py-1 text-sm"
                        >
                            <option value="">Категория</option>
                            {modalFilteredCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>

                    <div className="max-h-80 overflow-y-auto space-y-1">
                        {modalCards.map((card) => {
                            const assigned = modalTarget && isCardAssigned(card.id, modalTarget.unit, modalTarget.department, modalTarget.org_role);
                            return (
                                <div key={card.id} className="flex items-center justify-between border border-gray-200 p-2 text-sm">
                                    <div className="flex items-center gap-2 min-w-0">
                                        {card.first_photo ? (
                                            <img src={card.first_photo} alt="" className="w-8 h-8 object-cover border border-gray-200 flex-none" />
                                        ) : (
                                            <div className="w-8 h-8 bg-gray-50 border border-gray-200 flex-none" />
                                        )}
                                        <span className="truncate">{card.name}</span>
                                    </div>
                                    {assigned ? (
                                        <button
                                            onClick={() => handleUnassign(card.id)}
                                            className="text-xs border border-gray-800 px-2 py-0.5 flex items-center gap-1"
                                        >
                                            <Check size={10} /> Убрать
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => handleAssign(card.id)}
                                            className="text-xs border border-dashed border-gray-400 px-2 py-0.5 text-gray-500 hover:border-gray-600"
                                        >
                                            Назначить
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                        {modalCards.length === 0 && (
                            <p className="text-xs text-gray-400 text-center py-4">Нет карточек</p>
                        )}
                    </div>
                </div>
            </Modal>
        </div>
    );
}
