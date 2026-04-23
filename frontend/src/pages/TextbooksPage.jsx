import { useEffect, useState, useMemo, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getMyAvailableCards, getSections, getCategories, searchCards } from "../api/textbooks";
import { getUnits } from "../api/org";
import { useAuth, hasPermission } from "../context/AuthContext";
import useRealtimeUpdates from "../hooks/useRealtimeUpdates";
import useSessionState from "../hooks/useSessionState";
import { Search, Settings, Grid, List, ChevronLeft, ChevronRight } from "lucide-react";

function CardItem({ card, onClick }) {
    return (
        <button
            onClick={onClick}
            className="border border-gray-300 text-left w-full overflow-hidden hover:border-gray-500 transition-colors"
        >
            {card.first_photo ? (
                <img src={card.first_photo} alt="" className="w-full h-28 object-cover" />
            ) : (
                <div className="w-full h-28 bg-gray-50 flex items-center justify-center text-xs text-gray-400">
                    Нет фото
                </div>
            )}
            <div className="p-2">
                <p className="text-sm font-medium truncate">{card.name}</p>
                {card.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                        {card.tags.slice(0, 3).map((t, i) => (
                            <span key={i} className="text-[10px] border border-gray-200 px-1 py-0.5">{t}</span>
                        ))}
                    </div>
                )}
            </div>
        </button>
    );
}

function CategoryCarousel({ cards, onCardClick }) {
    const ref = useRef(null);
    const scroll = (dir) => {
        if (!ref.current) return;
        ref.current.scrollBy({ left: dir * 200, behavior: "smooth" });
    };
    return (
        <div className="relative group">
            <button onClick={() => scroll(-1)} className="absolute left-0 top-1/2 -translate-y-1/2 z-10 border border-gray-300 bg-white p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <ChevronLeft size={14} />
            </button>
            <div ref={ref} className="flex gap-2 overflow-x-auto scrollbar-none py-1 px-1">
                {cards.map((card) => (
                    <div key={card.id} className="flex-none w-40">
                        <CardItem card={card} onClick={() => onCardClick(card)} />
                    </div>
                ))}
            </div>
            <button onClick={() => scroll(1)} className="absolute right-0 top-1/2 -translate-y-1/2 z-10 border border-gray-300 bg-white p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <ChevronRight size={14} />
            </button>
        </div>
    );
}

export default function TextbooksPage() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const canEdit = hasPermission(user, "textbooks.edit");

    const [units, setUnits] = useState([]);
    const [sections, setSections] = useState([]);
    const [categories, setCategories] = useState([]);
    const [cardsByUnit, setCardsByUnit] = useState({});
    const [loading, setLoading] = useState(true);

    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState(null);
    const [viewMode, setViewMode] = useSessionState("tb_viewMode", "grid");
    const [activeSection, setActiveSection] = useSessionState("tb_activeSection", {});

    const isFullAccess = !user?.permissions || user.permissions === null;

    const loadAll = async () => {
        try {
            const [secRes, catRes] = await Promise.all([getSections(), getCategories()]);
            setSections(secRes.data);
            setCategories(catRes.data);

            let userUnits;
            if (isFullAccess) {
                const unitsRes = await getUnits();
                userUnits = unitsRes.data;
            } else {
                const seen = new Set();
                userUnits = (user.assignments || [])
                    .filter((a) => { if (seen.has(a.unit)) return false; seen.add(a.unit); return true; })
                    .map((a) => ({ id: a.unit, name: a.unit_name }));
            }
            setUnits(userUnits);

            const byUnit = {};
            await Promise.all(
                userUnits.map(async (u) => {
                    try {
                        const res = await getMyAvailableCards({ unit: u.id });
                        byUnit[u.id] = res.data;
                    } catch {
                        byUnit[u.id] = [];
                    }
                }),
            );
            setCardsByUnit(byUnit);
        } catch {
            // ignore
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadAll(); }, []);
    useRealtimeUpdates(["textbook_card", "textbook_section", "textbook_category"], loadAll);

    useEffect(() => {
        if (searchQuery.length < 2) { setSearchResults(null); return; }
        const t = setTimeout(async () => {
            try {
                const res = await searchCards({ q: searchQuery });
                setSearchResults(res.data);
            } catch {
                setSearchResults([]);
            }
        }, 300);
        return () => clearTimeout(t);
    }, [searchQuery]);

    const goToCard = (card) => {
        sessionStorage.setItem("tb_returnPath", window.location.pathname);
        navigate(`/textbooks/card/${card.id}`);
    };

    if (loading) return <p className="text-center py-8 text-gray-500">Загрузка...</p>;

    if (searchResults) {
        return (
            <div className="max-w-4xl mx-auto">
                <Header canEdit={canEdit} searchQuery={searchQuery} setSearchQuery={setSearchQuery} viewMode={viewMode} setViewMode={setViewMode} />
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    {searchResults.map((card) => (
                        <CardItem key={card.id} card={card} onClick={() => goToCard(card)} />
                    ))}
                </div>
                {searchResults.length === 0 && <p className="text-sm text-gray-500 text-center py-8">Ничего не найдено</p>}
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto">
            <Header canEdit={canEdit} searchQuery={searchQuery} setSearchQuery={setSearchQuery} viewMode={viewMode} setViewMode={setViewMode} />

            {units.map((unit) => {
                const unitCards = cardsByUnit[unit.id] || [];
                const unitSectionIds = [...new Set(unitCards.map((c) => c.section).filter(Boolean))];
                const unitSections = sections.filter((s) => unitSectionIds.includes(s.id));
                const currentSection = activeSection[unit.id] || unitSections[0]?.id;
                const sectionCards = unitCards.filter((c) => c.section === currentSection);
                const sectionCategories = categories.filter((cat) =>
                    sectionCards.some((c) => c.category === cat.id),
                );
                const uncategorized = sectionCards.filter((c) => !c.category);

                return (
                    <div key={unit.id} className="mb-6">
                        <h2 className="text-sm font-medium mb-2 border-b border-gray-300 pb-1">{unit.name}</h2>

                        {unitSections.length > 1 && (
                            <div className="flex gap-1 mb-3 overflow-x-auto">
                                {unitSections.map((s) => (
                                    <button
                                        key={s.id}
                                        onClick={() => setActiveSection({ ...activeSection, [unit.id]: s.id })}
                                        className={`px-3 py-1 text-xs border whitespace-nowrap ${
                                            currentSection === s.id
                                                ? "border-gray-800 font-medium"
                                                : "border-gray-300 text-gray-600"
                                        }`}
                                    >
                                        {s.name}
                                    </button>
                                ))}
                            </div>
                        )}

                        {sectionCategories.map((cat) => {
                            const catCards = sectionCards.filter((c) => c.category === cat.id);
                            if (catCards.length === 0) return null;
                            return (
                                <div key={cat.id} className="mb-3">
                                    <h3 className="text-xs text-gray-600 mb-1">{cat.name}</h3>
                                    {viewMode === "carousel" ? (
                                        <CategoryCarousel cards={catCards} onCardClick={goToCard} />
                                    ) : (
                                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                                            {catCards.map((card) => (
                                                <CardItem key={card.id} card={card} onClick={() => goToCard(card)} />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {uncategorized.length > 0 && (
                            <div className="mb-3">
                                {viewMode === "carousel" ? (
                                    <CategoryCarousel cards={uncategorized} onCardClick={goToCard} />
                                ) : (
                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                                        {uncategorized.map((card) => (
                                            <CardItem key={card.id} card={card} onClick={() => goToCard(card)} />
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {unitCards.length === 0 && (
                            <p className="text-xs text-gray-400 py-2">Нет назначенных карточек</p>
                        )}
                    </div>
                );
            })}

            {units.length === 0 && <p className="text-sm text-gray-500 text-center py-8">Нет доступных юнитов</p>}
        </div>
    );
}

function Header({ canEdit, searchQuery, setSearchQuery, viewMode, setViewMode }) {
    return (
        <>
            <div className="flex items-center justify-between mb-4">
                <h1 className="text-lg font-semibold">Учебники</h1>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setViewMode(viewMode === "grid" ? "carousel" : "grid")}
                        className="p-1 border border-gray-300 hover:bg-gray-50"
                        title={viewMode === "grid" ? "Карусель" : "Плитка"}
                    >
                        {viewMode === "grid" ? <List size={14} /> : <Grid size={14} />}
                    </button>
                    {canEdit && (
                        <Link to="/textbooks/manage" className="flex items-center gap-1 text-sm border border-gray-300 px-2 py-1 hover:bg-gray-50">
                            <Settings size={14} /> Управление
                        </Link>
                    )}
                </div>
            </div>
            <div className="relative mb-4">
                <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                    placeholder="Поиск..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full border border-gray-300 pl-7 pr-2 py-1.5 text-sm"
                />
            </div>
        </>
    );
}
