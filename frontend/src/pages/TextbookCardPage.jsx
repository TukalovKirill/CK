import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { getCard, getMyAvailableCards } from "../api/textbooks";
import useRealtimeUpdates from "../hooks/useRealtimeUpdates";
import AnimatedCollapse from "../components/AnimatedCollapse";
import Lightbox from "../components/Lightbox";
import { ArrowLeft, Pencil, ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";

export default function TextbookCardPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [card, setCard] = useState(null);
    const [siblings, setSiblings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedDetails, setExpandedDetails] = useState({});
    const [lightboxSrc, setLightboxSrc] = useState(null);
    const [activePhoto, setActivePhoto] = useState(0);

    const loadCard = async () => {
        try {
            const res = await getCard(id);
            setCard(res.data);
            if (res.data.category) {
                const sibRes = await getMyAvailableCards({ category: res.data.category });
                setSiblings(sibRes.data || []);
            }
        } catch {
            // ignore
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        setLoading(true);
        setExpandedDetails({});
        setActivePhoto(0);
        loadCard();
    }, [id]);

    useEffect(() => {
        if (card?.paragraphs) {
            const details = {};
            card.paragraphs
                .filter((p) => p.paragraph_type === "detail")
                .forEach((p) => { details[p.id] = true; });
            setExpandedDetails(details);
        }
    }, [card]);

    useRealtimeUpdates(["textbook_card"], loadCard);

    const currentIndex = siblings.findIndex((c) => c.id === Number(id));
    const prevCard = currentIndex > 0 ? siblings[currentIndex - 1] : null;
    const nextCard = currentIndex < siblings.length - 1 ? siblings[currentIndex + 1] : null;

    const returnPath = sessionStorage.getItem("tb_returnPath") || "/textbooks";

    if (loading) {
        return (
            <div className="page-shell page-stack">
                <div className="surface-empty">Загрузка...</div>
            </div>
        );
    }

    if (!card) {
        return (
            <div className="page-shell page-stack">
                <div className="surface-empty">Карточка не найдена</div>
            </div>
        );
    }

    const frontParagraphs = card.paragraphs?.filter((p) => p.paragraph_type === "front") || [];
    const detailParagraphs = card.paragraphs?.filter((p) => p.paragraph_type === "detail") || [];
    const photos = card.photos || [];

    const breadcrumb = [card.section_name, card.category_name].filter(Boolean).join(" → ");

    return (
        <div className="page-shell page-stack">
            {/* Hero Banner */}
            <div className="hero-banner">
                <div className="flex items-center justify-between flex-wrap gap-3 mb-2">
                    <Link to={returnPath} className="btn-ghost" style={{ color: "var(--n-fg)" }}>
                        <ArrowLeft size={14} /> Назад к учебникам
                    </Link>
                    <div className="flex items-center gap-2">
                        <button
                            className="btn-surface"
                            disabled={!prevCard}
                            onClick={() => prevCard && navigate(`/textbooks/card/${prevCard.id}`)}
                            title="Предыдущая"
                        >
                            <ChevronLeft size={14} />
                        </button>
                        <button
                            className="btn-surface"
                            disabled={!nextCard}
                            onClick={() => nextCard && navigate(`/textbooks/card/${nextCard.id}`)}
                            title="Следующая"
                        >
                            <ChevronRight size={14} />
                        </button>
                        {card.can_edit && (
                            <Link to={`/textbooks/manage/card/${id}/edit`} className="btn-surface">
                                <Pencil size={14} /> Редактировать
                            </Link>
                        )}
                    </div>
                </div>
                <h1 className="page-title">{card.name}</h1>
                {breadcrumb && <p className="page-subtitle mt-1">{breadcrumb}</p>}
            </div>

            {/* Photo gallery */}
            {photos.length > 0 && (
                <div className="surface-panel">
                    <img
                        src={photos[activePhoto]?.file}
                        alt=""
                        className="rounded-lg max-h-72 sm:max-h-96 w-full object-contain cursor-pointer"
                        style={{ background: "var(--n-hover)" }}
                        onClick={() => setLightboxSrc(photos[activePhoto]?.file)}
                    />
                    {photos.length > 1 && (
                        <div className="flex gap-2 mt-3 overflow-x-auto">
                            {photos.map((p, i) => (
                                <button
                                    key={p.id}
                                    onClick={() => setActivePhoto(i)}
                                    className="flex-none focus:outline-none"
                                    style={{
                                        borderRadius: "0.5rem",
                                        border: `2px solid ${i === activePhoto ? "var(--n-accent)" : "transparent"}`,
                                    }}
                                >
                                    <img
                                        src={p.file}
                                        alt=""
                                        className="w-24 h-24 rounded-lg object-cover cursor-pointer"
                                    />
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Front paragraphs */}
            {frontParagraphs.length > 0 && (
                <div className="surface-panel">
                    <p className="section-title">Основная информация</p>
                    <div className="divide-y" style={{ borderColor: "var(--n-border)" }}>
                        {frontParagraphs.map((p) => (
                            <div key={p.id} className="py-3 first:pt-0 last:pb-0">
                                {p.label && (
                                    <p className="text-xs font-semibold mb-1" style={{ color: "var(--n-accent)" }}>
                                        {p.label}
                                    </p>
                                )}
                                <p className="text-sm whitespace-pre-wrap text-secondary">{p.text}</p>
                                {p.photo && (
                                    <img
                                        src={p.photo}
                                        alt=""
                                        className="mt-2 max-h-48 rounded-lg object-cover cursor-pointer"
                                        onClick={() => setLightboxSrc(p.photo)}
                                    />
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Detail paragraphs */}
            {detailParagraphs.length > 0 && (
                <div className="surface-panel">
                    <p className="section-title">Подробности</p>
                    <div className="space-y-2">
                        {detailParagraphs.map((p) => {
                            const isOpen = !!expandedDetails[p.id];
                            return (
                                <div key={p.id} className="border-t pt-2 first:border-t-0 first:pt-0" style={{ borderColor: "var(--n-border)" }}>
                                    <button
                                        className="w-full flex items-center justify-between gap-2 text-left"
                                        onClick={() =>
                                            setExpandedDetails((prev) => ({
                                                ...prev,
                                                [p.id]: !prev[p.id],
                                            }))
                                        }
                                    >
                                        <span
                                            className="text-xs font-semibold"
                                            style={{ color: "var(--n-accent)" }}
                                        >
                                            {p.label || "Подробнее"}
                                        </span>
                                        <ChevronDown
                                            size={14}
                                            style={{
                                                color: "var(--n-muted)",
                                                transition: "transform 200ms",
                                                transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                                                flexShrink: 0,
                                            }}
                                        />
                                    </button>
                                    <AnimatedCollapse open={isOpen}>
                                        <div className="mt-2">
                                            <p className="text-sm whitespace-pre-wrap text-secondary">{p.text}</p>
                                            {p.photo && (
                                                <img
                                                    src={p.photo}
                                                    alt=""
                                                    className="mt-2 max-h-48 rounded-lg object-cover cursor-pointer"
                                                    onClick={() => setLightboxSrc(p.photo)}
                                                />
                                            )}
                                        </div>
                                    </AnimatedCollapse>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Tags */}
            {card.tags?.length > 0 && (
                <div className="surface-panel">
                    <div className="flex flex-wrap gap-2">
                        {card.tags.map((t) => (
                            <span key={t.id} className="badge-muted">{t.tag}</span>
                        ))}
                    </div>
                </div>
            )}

            {/* Assignments */}
            {card.assignments?.length > 0 && (
                <p className="text-muted text-sm">
                    Доступно в: {card.assignments.map((a) => a.name || a).join(", ")}
                </p>
            )}

            {lightboxSrc && <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
        </div>
    );
}
