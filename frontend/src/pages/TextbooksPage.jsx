import { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getMyAvailableCards, getSections, getCategories, searchCards } from "../api/textbooks";
import { getUnits } from "../api/org";
import { useAuth, hasPermission } from "../context/AuthContext";
import useRealtimeUpdates from "../hooks/useRealtimeUpdates";
import useSessionState from "../hooks/useSessionState";
import { Search, Settings, ChevronLeft, ChevronRight, X, BookOpen, LayoutGrid, GalleryHorizontalEnd } from "lucide-react";

function CardItem({ card, onClick }) {
    return (
        <button
            onClick={onClick}
            className="surface-panel !p-0 overflow-hidden text-left w-full hover:opacity-90 transition-opacity"
        >
            {card.first_photo ? (
                <img src={card.first_photo} alt="" className="w-full h-28 object-cover" />
            ) : (
                <div
                    className="w-full h-28 flex items-center justify-center"
                    style={{ background: "var(--n-hover)" }}
                >
                    <BookOpen size={28} style={{ color: "var(--n-dim)" }} />
                </div>
            )}
            <div className="p-2">
                <p className="text-sm font-medium truncate" style={{ color: "var(--n-fg)" }}>{card.name}</p>
                {card.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                        {card.tags.slice(0, 3).map((t, i) => (
                            <span key={i} className="badge-muted">{t}</span>
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
            <button
                onClick={() => scroll(-1)}
                className="absolute left-0 top-1/2 -translate-y-1/2 z-10 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: "var(--n-panel)", border: "1px solid var(--n-border)" }}
            >
                <ChevronLeft size={14} />
            </button>
            <div ref={ref} className="flex gap-2 overflow-x-auto no-scrollbar py-1 px-1">
                {cards.map((card) => (
                    <div key={card.id} className="flex-none w-[45vw] sm:w-[200px] lg:w-[220px] snap-start">
                        <CardItem card={card} onClick={() => onCardClick(card)} />
                    </div>
                ))}
            </div>
            <button
                onClick={() => scroll(1)}
                className="absolute right-0 top-1/2 -translate-y-1/2 z-10 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: "var(--n-panel)", border: "1px solid var(--n-border)" }}
            >
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

    const [searchQuery, setSearchQuery] = useSessionState("tb:search", "");
    const [searchResults, setSearchResults] = useState(null);
    const [searchLoading, setSearchLoading] = useState(false);
    const [viewMode, setViewModeState] = useState(() => localStorage.getItem("textbooks_view_mode") || "grid");
    const setViewMode = (m) => { setViewModeState(m); localStorage.setItem("textbooks_view_mode", m); };
    const [activeSection, setActiveSection] = useSessionState("tb:activeSection", {});

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
        setSearchLoading(true);
        const t = setTimeout(async () => {
            try {
                const res = await searchCards({ q: searchQuery });
                setSearchResults(res.data);
            } catch {
                setSearchResults([]);
            } finally {
                setSearchLoading(false);
            }
        }, 300);
        return () => clearTimeout(t);
    }, [searchQuery]);

    const goToCard = (card) => {
        sessionStorage.setItem("tb_returnPath", window.location.pathname);
        navigate(`/textbooks/card/${card.id}`);
    };

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
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                        <h1 className="page-title">Мои учебники</h1>
                        <p className="page-subtitle mt-1">Курсы, тесты и развитие</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="schedule-segmented">
                            <button
                                className={`schedule-segmented__button ${viewMode === "grid" ? "active" : ""}`}
                                data-active={viewMode === "grid"}
                                onClick={() => setViewMode("grid")}
                            >
                                <span className="schedule-segmented__inner"><LayoutGrid size={14} /></span>
                            </button>
                            <button
                                className={`schedule-segmented__button ${viewMode === "carousel" ? "active" : ""}`}
                                data-active={viewMode === "carousel"}
                                onClick={() => setViewMode("carousel")}
                            >
                                <span className="schedule-segmented__inner"><GalleryHorizontalEnd size={14} /></span>
                            </button>
                        </div>
                        {canEdit && (
                            <Link to="/textbooks/manage" className="btn-surface flex items-center gap-1">
                                <Settings size={14} /> Управление
                            </Link>
                        )}
                    </div>
                </div>
            </div>

            {/* Search */}
            <div className="surface-toolbar relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--n-muted)" }} />
                <input
                    placeholder="Поиск..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="input-premium w-full pl-8 pr-8"
                />
                {searchLoading && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-xs" style={{ color: "var(--n-muted)" }}>⏳</span>
                )}
                {!searchLoading && searchQuery.length > 0 && (
                    <button
                        onClick={() => setSearchQuery("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2"
                        style={{ color: "var(--n-muted)" }}
                    >
                        <X size={14} />
                    </button>
                )}
            </div>

            {/* Search results overlay */}
            {searchResults !== null && (
                <div>
                    {searchResults.length === 0 ? (
                        <div className="surface-empty">Ничего не найдено</div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                            {searchResults.map((card) => (
                                <CardItem key={card.id} card={card} onClick={() => goToCard(card)} />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Main content */}
            {searchResults === null && (
                <>
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
                                <h2 className="section-title">{unit.name}</h2>

                                {unitSections.length > 1 && (
                                    <div className="flex gap-1 mb-3 overflow-x-auto no-scrollbar border-b" style={{ borderColor: "var(--n-border)" }}>
                                        {unitSections.map((s) => (
                                            <button
                                                key={s.id}
                                                onClick={() => setActiveSection({ ...activeSection, [unit.id]: s.id })}
                                                className={`px-3 py-1.5 text-xs whitespace-nowrap transition-colors border-b-2 ${
                                                    currentSection === s.id ? "font-medium" : ""
                                                }`}
                                                style={{
                                                    color: currentSection === s.id ? "var(--n-accent)" : "var(--n-muted)",
                                                    borderColor: currentSection === s.id ? "var(--n-accent)" : "transparent",
                                                }}
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
                                            <h3 className="text-secondary text-xs mb-2">{cat.name}</h3>
                                            {viewMode === "carousel" ? (
                                                <CategoryCarousel cards={catCards} onCardClick={goToCard} />
                                            ) : (
                                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
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
                                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                                                {uncategorized.map((card) => (
                                                    <CardItem key={card.id} card={card} onClick={() => goToCard(card)} />
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {unitCards.length === 0 && (
                                    <div className="surface-empty">Нет назначенных карточек</div>
                                )}
                            </div>
                        );
                    })}

                    {units.length === 0 && (
                        <div className="surface-empty">Нет доступных юнитов</div>
                    )}
                </>
            )}
        </div>
    );
}
