import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import {
    getSections, createSection, updateSection, deleteSection,
    getCategories, createCategory, updateCategory, deleteCategory,
    getCards, deleteCard,
} from "../api/textbooks";
import { useAuth, hasPermission } from "../context/AuthContext";
import useRealtimeUpdates from "../hooks/useRealtimeUpdates";
import useSessionState from "../hooks/useSessionState";
import { useDialog } from "../components/DialogProvider";
import Dropdown from "../components/Dropdown";
import toast from "react-hot-toast";
import { Plus, Trash2, Pencil, Search, X, Globe, BookOpen } from "lucide-react";

function InlineChip({ item, selected, onSelect, onRename, onDelete }) {
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState(item.name);
    const inputRef = useRef(null);

    useEffect(() => {
        if (editing && inputRef.current) inputRef.current.focus();
    }, [editing]);

    const save = () => {
        const trimmed = value.trim();
        if (trimmed && trimmed !== item.name) {
            onRename(item.id, trimmed);
        }
        setEditing(false);
        setValue(item.name);
    };

    if (editing) {
        return (
            <div className="inline-flex items-center px-2 py-0.5">
                <input
                    ref={inputRef}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") save();
                        if (e.key === "Escape") { setEditing(false); setValue(item.name); }
                    }}
                    onBlur={save}
                    className="input-premium text-xs w-24"
                    style={{ padding: "2px 6px", height: "auto" }}
                />
            </div>
        );
    }

    return (
        <div
            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs cursor-pointer rounded-md"
            style={selected
                ? { background: "var(--n-accent)", color: "#000", border: "1px solid var(--n-accent)" }
                : { background: "var(--n-hover)", border: "1px solid var(--n-border)", color: "var(--n-fg)" }
            }
        >
            <button onClick={onSelect} className="whitespace-nowrap">
                {item.name} ({item.cards_count ?? 0})
            </button>
            <button
                onClick={() => setEditing(true)}
                title="Переименовать"
                className="opacity-40 hover:opacity-100 transition-opacity"
                style={{ color: "var(--n-dim)" }}
            >
                <Pencil size={10} />
            </button>
            <button
                onClick={() => onDelete(item.id)}
                title="Удалить"
                className="opacity-40 hover:opacity-100 transition-opacity"
                style={{ color: "var(--n-dim)" }}
            >
                <Trash2 size={10} />
            </button>
        </div>
    );
}

export default function TextbookManagePage() {
    const { user } = useAuth();
    const canAssign = hasPermission(user, "textbooks.manage_assignments");
    const isFullAccess = user?.permissions === null;
    const dialog = useDialog();

    const [sections, setSections] = useState([]);
    const [categories, setCategories] = useState([]);
    const [cards, setCards] = useState([]);
    const [loading, setLoading] = useState(true);

    const [selectedSection, setSelectedSection] = useSessionState("tbManage:section", null);
    const [filters, setFilters] = useSessionState("tbManage:filters", { section: "", category: "", search: "" });
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [searchQuery, setSearchQuery] = useState(filters.search || "");
    const [allCompanies, setAllCompanies] = useState(false);

    const [modalOpen, setModalOpen] = useState(false);
    const [modalType, setModalType] = useState(null);
    const [modalName, setModalName] = useState("");

    const loadAll = async () => {
        try {
            const params = allCompanies ? { all_companies: true } : {};
            const [secRes, catRes, cardRes] = await Promise.all([
                getSections(params),
                getCategories(params),
                getCards(params),
            ]);
            setSections(secRes.data);
            setCategories(catRes.data);
            setCards(cardRes.data.results || cardRes.data);
        } catch {
            toast.error("Ошибка загрузки");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadAll(); }, [allCompanies]);
    useRealtimeUpdates(["textbook_card", "textbook_section", "textbook_category"], loadAll);

    const handleRenameSection = async (id, name) => {
        try {
            await updateSection(id, { name });
            loadAll();
        } catch {
            toast.error("Ошибка переименования");
        }
    };

    const handleDeleteSection = async (id) => {
        const ok = await dialog.confirm("Удалить раздел?", "Карточки останутся без раздела.", { destructive: true });
        if (!ok) return;
        try {
            await deleteSection(id);
            if (selectedSection === id) setSelectedSection(null);
            loadAll();
        } catch {
            toast.error("Ошибка удаления");
        }
    };

    const handleRenameCategory = async (id, name) => {
        try {
            await updateCategory(id, { name });
            loadAll();
        } catch {
            toast.error("Ошибка переименования");
        }
    };

    const handleDeleteCategory = async (id) => {
        const ok = await dialog.confirm("Удалить категорию?", "Карточки останутся без категории.", { destructive: true });
        if (!ok) return;
        try {
            await deleteCategory(id);
            if (selectedCategory === id) setSelectedCategory(null);
            loadAll();
        } catch {
            toast.error("Ошибка удаления");
        }
    };

    const handleDeleteCard = async (id) => {
        const ok = await dialog.confirm("Удалить карточку?", "Действие необратимо.", { destructive: true });
        if (!ok) return;
        try {
            await deleteCard(id);
            loadAll();
        } catch {
            toast.error("Ошибка удаления");
        }
    };

    const openModal = (type) => {
        setModalType(type);
        setModalName("");
        setModalOpen(true);
    };

    const handleModalSave = async () => {
        const name = modalName.trim();
        if (!name) return;
        try {
            if (modalType === "section") {
                await createSection({ name });
            } else if (modalType === "category" && selectedSection) {
                await createCategory({ name, section: selectedSection });
            }
            setModalOpen(false);
            loadAll();
        } catch {
            toast.error("Ошибка создания");
        }
    };

    const filteredCategories = selectedSection
        ? categories.filter((c) => c.section === selectedSection)
        : [];

    // Dropdown options
    const sectionOptions = sections.map((s) => ({ value: s.id, label: s.name }));
    const categoryOptions = (filters.section
        ? categories.filter((c) => String(c.section) === String(filters.section))
        : categories
    ).map((c) => ({ value: c.id, label: c.name }));

    let filteredCards = cards;
    if (filters.section) filteredCards = filteredCards.filter((c) => String(c.section) === String(filters.section));
    if (filters.category) filteredCards = filteredCards.filter((c) => String(c.category) === String(filters.category));
    if (searchQuery.length >= 2) {
        const q = searchQuery.toLowerCase();
        filteredCards = filteredCards.filter((c) => c.name.toLowerCase().includes(q));
    }

    if (loading) return (
        <div className="surface-empty">
            <p>Загрузка...</p>
        </div>
    );

    return (
        <div className="page-shell page-stack">
            {/* Header */}
            <div className="page-header">
                <div>
                    <h1 className="page-title">Настройка учебников</h1>
                    <p className="page-subtitle">Управление разделами, категориями и карточками</p>
                </div>
                <div className="flex items-center gap-2">
                    {canAssign && (
                        <Link to="/textbooks/assignments" className="btn-surface">
                            Распределение
                        </Link>
                    )}
                    <Link to="/textbooks/manage/card/new" className="btn-save flex items-center gap-1">
                        <Plus size={14} /> Новая карточка
                    </Link>
                </div>
            </div>

            {/* All companies checkbox */}
            {isFullAccess && (
                <label className="check-premium flex items-center gap-2 text-sm cursor-pointer w-fit">
                    <input
                        type="checkbox"
                        checked={allCompanies}
                        onChange={(e) => setAllCompanies(e.target.checked)}
                        className="check-premium"
                    />
                    <Globe size={14} style={{ color: "var(--n-dim)" }} />
                    Все компании
                </label>
            )}

            {/* Sections panel */}
            <div className="surface-panel">
                <div className="flex items-center justify-between mb-3">
                    <p className="section-title">Разделы</p>
                    <button onClick={() => openModal("section")} className="btn-ghost flex items-center gap-1 text-xs">
                        <Plus size={12} /> Добавить
                    </button>
                </div>
                <div className="flex flex-wrap gap-1.5 items-center">
                    <button
                        onClick={() => { setSelectedSection(null); setSelectedCategory(null); }}
                        className="inline-flex items-center px-2 py-0.5 text-xs rounded-md transition-colors"
                        style={!selectedSection
                            ? { background: "var(--n-accent)", color: "#000", border: "1px solid var(--n-accent)" }
                            : { background: "var(--n-hover)", border: "1px solid var(--n-border)", color: "var(--n-fg)" }
                        }
                    >
                        Все
                    </button>
                    {sections.map((s) => (
                        <InlineChip
                            key={s.id}
                            item={s}
                            selected={selectedSection === s.id}
                            onSelect={() => { setSelectedSection(s.id); setSelectedCategory(null); }}
                            onRename={handleRenameSection}
                            onDelete={handleDeleteSection}
                        />
                    ))}
                </div>
            </div>

            {/* Categories panel */}
            {selectedSection && (
                <div className="surface-panel">
                    <div className="flex items-center justify-between mb-3">
                        <p className="section-title">Категории</p>
                        <button onClick={() => openModal("category")} className="btn-ghost flex items-center gap-1 text-xs">
                            <Plus size={12} /> Добавить
                        </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 items-center">
                        <button
                            onClick={() => setSelectedCategory(null)}
                            className="inline-flex items-center px-2 py-0.5 text-xs rounded-md transition-colors"
                            style={!selectedCategory
                                ? { background: "var(--n-accent)", color: "#000", border: "1px solid var(--n-accent)" }
                                : { background: "var(--n-hover)", border: "1px solid var(--n-border)", color: "var(--n-fg)" }
                            }
                        >
                            Все
                        </button>
                        {filteredCategories.map((c) => (
                            <InlineChip
                                key={c.id}
                                item={c}
                                selected={selectedCategory === c.id}
                                onSelect={() => setSelectedCategory(c.id)}
                                onRename={handleRenameCategory}
                                onDelete={handleDeleteCategory}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Search & filter toolbar */}
            <div className="surface-toolbar flex flex-wrap items-center gap-3">
                <Dropdown
                    placeholder="Все разделы"
                    value={filters.section}
                    onChange={(val) => setFilters((f) => ({ ...f, section: val, category: "" }))}
                    options={sectionOptions}
                    className="min-w-[160px] flex-1"
                />
                <Dropdown
                    placeholder="Все категории"
                    value={filters.category}
                    onChange={(val) => setFilters((f) => ({ ...f, category: val }))}
                    options={categoryOptions}
                    className="min-w-[160px] flex-1"
                />
                <div className="relative flex-[2] min-w-[200px]">
                    <Search
                        size={14}
                        className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                        style={{ color: "var(--n-dim)" }}
                    />
                    <input
                        placeholder="Поиск по названию..."
                        value={searchQuery}
                        onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setFilters((f) => ({ ...f, search: e.target.value }));
                        }}
                        className="input-premium w-full pl-8 pr-8"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => {
                                setSearchQuery("");
                                setFilters((f) => ({ ...f, search: "" }));
                            }}
                            className="absolute right-3 top-1/2 -translate-y-1/2 transition-opacity opacity-60 hover:opacity-100"
                            style={{ color: "var(--n-dim)" }}
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* Card list */}
            <div className="space-y-2">
                {filteredCards.map((card) => (
                    <Link
                        key={card.id}
                        to={`/textbooks/manage/card/${card.id}/edit`}
                        className="surface-panel flex items-center justify-between gap-3 hover:opacity-90 transition-opacity no-underline"
                    >
                        <div className="flex items-center gap-3 min-w-0">
                            {card.first_photo ? (
                                <img
                                    src={card.first_photo}
                                    alt=""
                                    className="w-10 h-10 object-cover rounded-lg flex-none"
                                    style={{ border: "1px solid var(--n-border)" }}
                                />
                            ) : (
                                <div
                                    className="w-10 h-10 rounded-lg flex-none flex items-center justify-center"
                                    style={{ color: "var(--n-dim)", background: "var(--n-hover)" }}
                                >
                                    <BookOpen size={16} />
                                </div>
                            )}
                            <div className="min-w-0">
                                <p className="text-sm font-medium truncate" style={{ color: "var(--n-fg)" }}>
                                    {card.name}
                                </p>
                                {(card.section_name || card.category_name) && (
                                    <p className="text-muted text-[11px] truncate">
                                        {[card.section_name, card.category_name].filter(Boolean).join(" / ")}
                                    </p>
                                )}
                            </div>
                        </div>
                        <button
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteCard(card.id); }}
                            className="btn-danger flex-none"
                            title="Удалить"
                            style={{ padding: "4px 8px", fontSize: "12px" }}
                        >
                            <Trash2 size={13} />
                        </button>
                    </Link>
                ))}
                {filteredCards.length === 0 && (
                    <div className="surface-empty">
                        <BookOpen size={32} style={{ color: "var(--n-dim)" }} />
                        <p>Нет карточек</p>
                    </div>
                )}
            </div>

            {/* Inline modal */}
            {modalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="fixed inset-0 bg-black/60" onClick={() => setModalOpen(false)} />
                    <div
                        className="relative max-w-sm w-full rounded-[24px] p-6 space-y-4"
                        style={{
                            background: "linear-gradient(145deg, var(--n-panel), var(--n-card))",
                            border: "1px solid var(--n-border)",
                            boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
                        }}
                    >
                        <h3 className="text-lg font-semibold" style={{ color: "var(--n-fg)" }}>
                            {modalType === "section" ? "Новый раздел" : "Новая категория"}
                        </h3>
                        <input
                            className="input-premium w-full"
                            autoFocus
                            value={modalName}
                            onChange={(e) => setModalName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") handleModalSave(); if (e.key === "Escape") setModalOpen(false); }}
                            placeholder="Название"
                        />
                        <div className="flex justify-end gap-2">
                            <button className="btn-surface" onClick={() => setModalOpen(false)}>Отмена</button>
                            <button className="btn-save" onClick={handleModalSave}>Сохранить</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
