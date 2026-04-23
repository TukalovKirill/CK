import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { getCard, getMyAvailableCards } from "../api/textbooks";
import useRealtimeUpdates from "../hooks/useRealtimeUpdates";
import AnimatedCollapse from "../components/AnimatedCollapse";
import Lightbox from "../components/Lightbox";
import { ArrowLeft, Pencil, ChevronLeft, ChevronRight } from "lucide-react";

export default function TextbookCardPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [card, setCard] = useState(null);
    const [siblings, setSiblings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [detailOpen, setDetailOpen] = useState(false);
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
        setDetailOpen(false);
        setActivePhoto(0);
        loadCard();
    }, [id]);

    useRealtimeUpdates(["textbook_card"], loadCard);

    const currentIndex = siblings.findIndex((c) => c.id === Number(id));
    const prevCard = currentIndex > 0 ? siblings[currentIndex - 1] : null;
    const nextCard = currentIndex < siblings.length - 1 ? siblings[currentIndex + 1] : null;

    const returnPath = sessionStorage.getItem("tb_returnPath") || "/textbooks";

    if (loading) return <p className="text-center py-8 text-gray-500">Загрузка...</p>;
    if (!card) return <p className="text-center py-8 text-gray-500">Карточка не найдена</p>;

    const frontParagraphs = card.paragraphs?.filter((p) => p.paragraph_type === "front") || [];
    const detailParagraphs = card.paragraphs?.filter((p) => p.paragraph_type === "detail") || [];
    const photos = card.photos || [];

    return (
        <div className="max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-4">
                <Link to={returnPath} className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900">
                    <ArrowLeft size={14} /> Назад
                </Link>
                <div className="flex items-center gap-2">
                    {prevCard && (
                        <button onClick={() => navigate(`/textbooks/card/${prevCard.id}`)} className="p-1 border border-gray-300 hover:bg-gray-50" title="Предыдущая">
                            <ChevronLeft size={14} />
                        </button>
                    )}
                    {nextCard && (
                        <button onClick={() => navigate(`/textbooks/card/${nextCard.id}`)} className="p-1 border border-gray-300 hover:bg-gray-50" title="Следующая">
                            <ChevronRight size={14} />
                        </button>
                    )}
                    {card.can_edit && (
                        <Link to={`/textbooks/manage/card/${id}/edit`} className="flex items-center gap-1 text-sm border border-gray-300 px-2 py-1 hover:bg-gray-50">
                            <Pencil size={12} /> Редактировать
                        </Link>
                    )}
                </div>
            </div>

            {photos.length > 0 && (
                <div className="mb-4">
                    <img
                        src={photos[activePhoto]?.file}
                        alt=""
                        className="w-full h-64 object-cover border border-gray-200 cursor-pointer"
                        onClick={() => setLightboxSrc(photos[activePhoto]?.file)}
                    />
                    {photos.length > 1 && (
                        <div className="flex gap-1 mt-1 overflow-x-auto">
                            {photos.map((p, i) => (
                                <button
                                    key={p.id}
                                    onClick={() => setActivePhoto(i)}
                                    className={`w-12 h-12 flex-none border ${
                                        i === activePhoto ? "border-gray-800" : "border-gray-200"
                                    }`}
                                >
                                    <img src={p.file} alt="" className="w-full h-full object-cover" />
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <h1 className="text-xl font-semibold mb-4">{card.name}</h1>

            {frontParagraphs.map((p) => (
                <div key={p.id} className="mb-4">
                    {p.label && <h3 className="text-sm font-medium mb-1">{p.label}</h3>}
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{p.text}</p>
                    {p.photo && (
                        <img
                            src={p.photo}
                            alt=""
                            className="mt-2 max-h-48 object-cover border border-gray-200 cursor-pointer"
                            onClick={() => setLightboxSrc(p.photo)}
                        />
                    )}
                </div>
            ))}

            {detailParagraphs.length > 0 && (
                <div className="mt-4 border-t border-gray-200 pt-3">
                    <button
                        onClick={() => setDetailOpen(!detailOpen)}
                        className="text-sm font-medium flex items-center gap-1"
                    >
                        {detailOpen ? <ChevronLeft size={12} className="rotate-[-90deg]" /> : <ChevronRight size={12} />}
                        Подробнее
                    </button>
                    <AnimatedCollapse open={detailOpen}>
                        <div className="mt-3 space-y-4">
                            {detailParagraphs.map((p) => (
                                <div key={p.id}>
                                    {p.label && <h3 className="text-sm font-medium mb-1">{p.label}</h3>}
                                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{p.text}</p>
                                    {p.photo && (
                                        <img
                                            src={p.photo}
                                            alt=""
                                            className="mt-2 max-h-48 object-cover border border-gray-200 cursor-pointer"
                                            onClick={() => setLightboxSrc(p.photo)}
                                        />
                                    )}
                                </div>
                            ))}
                        </div>
                    </AnimatedCollapse>
                </div>
            )}

            {card.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-6">
                    {card.tags.map((t) => (
                        <span key={t.id} className="text-xs border border-gray-300 px-2 py-0.5">{t.tag}</span>
                    ))}
                </div>
            )}

            {lightboxSrc && <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
        </div>
    );
}
