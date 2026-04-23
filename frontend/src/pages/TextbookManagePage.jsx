import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import {
    getSections, createSection, updateSection, deleteSection,
    getCategories, createCategory, updateCategory, deleteCategory,
    getCards, deleteCard,
} from "../api/textbooks";
import { useAuth, hasPermission } from "../context/AuthContext";
import useRealtimeUpdates from "../hooks/useRealtimeUpdates";
import Modal from "../components/Modal";
import toast from "react-hot-toast";
import { Plus, Trash2, Pencil, Search, X } from "lucide-react";

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
            <div className="inline-flex items-center border border-gray-800 px-2 py-0.5">
                <input
                    ref={inputRef}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") save();
                        if (e.key === "Escape") { setEditing(false); setValue(item.name); }
                    }}
                    onBlur={save}
                    className="text-xs border-none outline-none bg-transparent w-24"
                />
            </div>
        );
    }

    return (
        <div className={`inline-flex items-center gap-1 border px-2 py-0.5 text-xs cursor-pointer ${
            selected ? "border-gray-800 font-medium" : "border-gray-300 text-gray-600"
        }`}>
            <button onClick={onSelect} className="whitespace-nowrap">
                {item.name} ({item.cards_count ?? 0})
            </button>
            <button onClick={() => setEditing(true)} className="text-gray-400 hover:text-gray-700" title="Переименовать">
                <Pencil size={10} />
            </button>
            <button onClick={() => onDelete(item.id)} className="text-gray-400 hover:text-gray-700" title="Удалить">
                <Trash2 size={10} />
            </button>
        </div>
    );
}

export default function TextbookManagePage() {
    const { user } = useAuth();
    const canAssign = hasPermission(user, "textbooks.manage_assignments");
    const isSuperuser = user?.is_superuser;

    const [sections, setSections] = useState([]);
    const [categories, setCategories] = useState([]);
    const [cards, setCards] = useState([]);
    const [loading, setLoading] = useState(true);

    const [selectedSection, setSelectedSection] = useState(null);
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [searchQuery, setSearchQuery] = useState("");
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
        if (!confirm("Удалить раздел? Карточки останутся без раздела.")) return;
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
        if (!confirm("Удалить категорию? Карточки останутся без категории.")) return;
        try {
            await deleteCategory(id);
            if (selectedCategory === id) setSelectedCategory(null);
            loadAll();
        } catch {
            toast.error("Ошибка удаления");
        }
    };

    const handleDeleteCard = async (id) => {
        if (!confirm("Удалить карточку?")) return;
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

    let filteredCards = cards;
    if (selectedSection) filteredCards = filteredCards.filter((c) => c.section === selectedSection);
    if (selectedCategory) filteredCards = filteredCards.filter((c) => c.category === selectedCategory);
    if (searchQuery.length >= 2) {
        const q = searchQuery.toLowerCase();
        filteredCards = filteredCards.filter((c) => c.name.toLowerCase().includes(q));
    }

    if (loading) return <p className="text-center py-8 text-gray-500">Загрузка...</p>;

    return (
        <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-4">
                <h1 className="text-lg font-semibold">Управление учебниками</h1>
                <div className="flex items-center gap-2">
                    {canAssign && (
                        <Link
                            to="/textbooks/assignments"
                            className="text-sm border border-gray-300 px-2 py-1 hover:bg-gray-50"
                        >
                            Распределение
                        </Link>
                    )}
                    <Link
                        to="/textbooks/manage/card/new"
                        className="flex items-center gap-1 text-sm border border-gray-800 px-2 py-1 hover:bg-gray-50"
                    >
                        <Plus size={14} /> Новая карточка
                    </Link>
                </div>
            </div>

            {isSuperuser && (
                <label className="flex items-center gap-2 mb-4 text-sm">
                    <input
                        type="checkbox"
                        checked={allCompanies}
                        onChange={(e) => setAllCompanies(e.target.checked)}
                    />
                    Все компании
                </label>
            )}

            <div className="mb-4">
                <p className="text-xs text-gray-500 mb-1">Разделы</p>
                <div className="flex flex-wrap gap-1 items-center">
                    <button
                        onClick={() => { setSelectedSection(null); setSelectedCategory(null); }}
                        className={`text-xs px-2 py-0.5 border ${
                            !selectedSection ? "border-gray-800 font-medium" : "border-gray-300 text-gray-600"
                        }`}
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
                    <button
                        onClick={() => openModal("section")}
                        className="text-xs border border-dashed border-gray-400 px-2 py-0.5 text-gray-500 hover:border-gray-600 hover:text-gray-700"
                    >
                        <Plus size={10} className="inline" /> Раздел
                    </button>
                </div>
            </div>

            {selectedSection && (
                <div className="mb-4">
                    <p className="text-xs text-gray-500 mb-1">Категории</p>
                    <div className="flex flex-wrap gap-1 items-center">
                        <button
                            onClick={() => setSelectedCategory(null)}
                            className={`text-xs px-2 py-0.5 border ${
                                !selectedCategory ? "border-gray-800 font-medium" : "border-gray-300 text-gray-600"
                            }`}
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
                        <button
                            onClick={() => openModal("category")}
                            className="text-xs border border-dashed border-gray-400 px-2 py-0.5 text-gray-500 hover:border-gray-600 hover:text-gray-700"
                        >
                            <Plus size={10} className="inline" /> Категория
                        </button>
                    </div>
                </div>
            )}

            <div className="relative mb-4">
                <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                    placeholder="Поиск по названию..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full border border-gray-300 pl-7 pr-8 py-1.5 text-sm"
                />
                {searchQuery && (
                    <button
                        onClick={() => setSearchQuery("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                        <X size={14} />
                    </button>
                )}
            </div>

            <div className="space-y-1">
                {filteredCards.map((card) => (
                    <div key={card.id} className="border border-gray-200 p-2 flex items-center justify-between hover:border-gray-400 transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                            {card.first_photo ? (
                                <img src={card.first_photo} alt="" className="w-10 h-10 object-cover border border-gray-200 flex-none" />
                            ) : (
                                <div className="w-10 h-10 bg-gray-50 border border-gray-200 flex-none" />
                            )}
                            <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{card.name}</p>
                                {(card.section_name || card.category_name) && (
                                    <p className="text-[10px] text-gray-400 truncate">
                                        {[card.section_name, card.category_name].filter(Boolean).join(" / ")}
                                    </p>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-2 flex-none">
                            <Link
                                to={`/textbooks/manage/card/${card.id}/edit`}
                                className="text-gray-400 hover:text-gray-700"
                                title="Редактировать"
                            >
                                <Pencil size={14} />
                            </Link>
                            <button
                                onClick={() => handleDeleteCard(card.id)}
                                className="text-gray-400 hover:text-gray-700"
                                title="Удалить"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    </div>
                ))}
                {filteredCards.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-8">Нет карточек</p>
                )}
            </div>

            <Modal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                title={modalType === "section" ? "Новый раздел" : "Новая категория"}
            >
                <div className="space-y-3">
                    <input
                        value={modalName}
                        onChange={(e) => setModalName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleModalSave(); }}
                        placeholder="Название"
                        className="w-full border border-gray-300 px-2 py-1.5 text-sm"
                        autoFocus
                    />
                    <div className="flex justify-end gap-2">
                        <button
                            onClick={() => setModalOpen(false)}
                            className="text-sm border border-gray-300 px-3 py-1 hover:bg-gray-50"
                        >
                            Отмена
                        </button>
                        <button
                            onClick={handleModalSave}
                            className="text-sm border border-gray-800 px-3 py-1 hover:bg-gray-50"
                        >
                            Создать
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
