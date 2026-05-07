import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
    getCard, createCard, updateCard, getSections, getCategories,
    uploadCardPhoto, deleteCardPhoto, uploadParagraphPhoto,
} from "../api/textbooks";
import useSessionState from "../hooks/useSessionState";
import Lightbox from "../components/Lightbox";
import Dropdown from "../components/Dropdown";
import toast from "react-hot-toast";
import { Plus, Trash2, ArrowLeft, Upload, Image, X, GripVertical } from "lucide-react";

export default function TextbookCardEditPage() {
    const { id } = useParams();
    const isEdit = Boolean(id);
    const navigate = useNavigate();

    const cacheKey = id || "new";

    const [name, setName] = useSessionState(`tbCard:name:${cacheKey}`, "");
    const [sectionId, setSectionId] = useSessionState(`tbCard:section:${cacheKey}`, "");
    const [categoryId, setCategoryId] = useSessionState(`tbCard:category:${cacheKey}`, "");
    const [paragraphs, setParagraphs] = useSessionState(`tbCard:paras:${cacheKey}`, []);
    const [tags, setTags] = useSessionState(`tbCard:tags:${cacheKey}`, []);

    const [existingPhotos, setExistingPhotos] = useState([]);
    const [newCardPhotos, setNewCardPhotos] = useState([]);
    const [newParagraphPhotos, setNewParagraphPhotos] = useState({});
    const [tagInput, setTagInput] = useState("");
    const [sections, setSections] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [lightboxSrc, setLightboxSrc] = useState(null);
    const [loadedId, setLoadedId] = useState(null);

    const photoInputRef = useRef(null);
    const paragraphPhotoRefs = useRef({});

    const clearCache = () => {
        sessionStorage.removeItem(`ss:tbCard:name:${cacheKey}`);
        sessionStorage.removeItem(`ss:tbCard:section:${cacheKey}`);
        sessionStorage.removeItem(`ss:tbCard:category:${cacheKey}`);
        sessionStorage.removeItem(`ss:tbCard:paras:${cacheKey}`);
        sessionStorage.removeItem(`ss:tbCard:tags:${cacheKey}`);
    };

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const [secRes, catRes] = await Promise.all([getSections(), getCategories()]);
                setSections(secRes.data);
                setCategories(catRes.data);

                if (isEdit && loadedId !== id) {
                    const hasCachedName = sessionStorage.getItem(`ss:tbCard:name:${cacheKey}`);
                    if (hasCachedName) {
                        // Cache exists — only load photos from API
                        const res = await getCard(id);
                        const card = res.data;
                        setExistingPhotos(card.photos?.map((p) => ({ id: p.id, file: p.file })) || []);
                    } else {
                        // No cache — full load
                        const res = await getCard(id);
                        const card = res.data;
                        setName(card.name);
                        setSectionId(card.section ? String(card.section) : "");
                        setCategoryId(card.category ? String(card.category) : "");
                        setParagraphs(
                            card.paragraphs?.map((p) => ({
                                paragraph_type: p.paragraph_type,
                                label: p.label,
                                text: p.text,
                                order: p.order,
                                has_photo: Boolean(p.photo),
                                photoUrl: p.photo || null,
                            })) || []
                        );
                        setTags(card.tags?.map((t) => t.tag) || []);
                        setExistingPhotos(card.photos?.map((p) => ({ id: p.id, file: p.file })) || []);
                    }
                    setNewCardPhotos([]);
                    setNewParagraphPhotos({});
                    setLoadedId(id);
                } else if (!isEdit && loadedId !== "new") {
                    setNewCardPhotos([]);
                    setNewParagraphPhotos({});
                    setLoadedId("new");
                }
            } catch {
                toast.error("Ошибка загрузки");
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [id]);

    const addParagraph = () => {
        setParagraphs([...paragraphs, {
            paragraph_type: "front", label: "", text: "", order: paragraphs.length,
            has_photo: false, photoUrl: null,
        }]);
    };

    const updateParagraph = (i, field, value) => {
        const copy = [...paragraphs];
        copy[i] = { ...copy[i], [field]: value };
        setParagraphs(copy);
    };

    const removeParagraph = (i) => {
        setParagraphs(paragraphs.filter((_, j) => j !== i));
        setNewParagraphPhotos((prev) => {
            const copy = { ...prev };
            delete copy[i];
            const shifted = {};
            for (const [k, v] of Object.entries(copy)) {
                const idx = Number(k);
                shifted[idx > i ? idx - 1 : idx] = v;
            }
            return shifted;
        });
    };

    const handleParagraphPhoto = (i, file) => {
        if (!file) return;
        const preview = URL.createObjectURL(file);
        const copy = [...paragraphs];
        copy[i] = { ...copy[i], has_photo: true, photoUrl: preview };
        setParagraphs(copy);
        setNewParagraphPhotos((prev) => ({ ...prev, [i]: file }));
    };

    const removeParagraphPhoto = (i) => {
        const copy = [...paragraphs];
        copy[i] = { ...copy[i], has_photo: false, photoUrl: null };
        setParagraphs(copy);
        setNewParagraphPhotos((prev) => {
            const next = { ...prev };
            delete next[i];
            return next;
        });
    };

    const addTag = () => {
        const t = tagInput.trim().toLowerCase();
        if (t && !tags.includes(t)) {
            setTags([...tags, t]);
        }
        setTagInput("");
    };

    const removeTag = (i) => {
        setTags(tags.filter((_, j) => j !== i));
    };

    const handlePhotoFiles = (files) => {
        const items = Array.from(files).map((f) => ({
            file: f,
            preview: URL.createObjectURL(f),
        }));
        setNewCardPhotos((prev) => [...prev, ...items]);
    };

    const removeNewPhoto = (i) => {
        setNewCardPhotos((prev) => prev.filter((_, j) => j !== i));
    };

    const removeExistingPhoto = async (photoId) => {
        try {
            await deleteCardPhoto(photoId);
            setExistingPhotos((prev) => prev.filter((p) => p.id !== photoId));
        } catch {
            toast.error("Ошибка удаления фото");
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length) handlePhotoFiles(e.dataTransfer.files);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!name.trim()) { toast.error("Введите название"); return; }
        setSaving(true);
        try {
            const data = {
                name,
                section: sectionId || null,
                category: categoryId || null,
                paragraphs_data: paragraphs.map((p, i) => ({
                    paragraph_type: p.paragraph_type,
                    label: p.label,
                    text: p.text,
                    order: i,
                    has_photo: p.has_photo,
                })),
                tags_data: tags,
            };

            let cardId;
            if (isEdit) {
                await updateCard(id, data);
                cardId = id;
            } else {
                const res = await createCard(data);
                cardId = res.data.id;
            }

            for (const np of newCardPhotos) {
                await uploadCardPhoto(cardId, np.file);
            }

            const paraPhotoKeys = Object.keys(newParagraphPhotos);
            if (paraPhotoKeys.length > 0) {
                const cardRes = await getCard(cardId);
                const savedParagraphs = cardRes.data.paragraphs || [];
                for (const key of paraPhotoKeys) {
                    const idx = Number(key);
                    if (savedParagraphs[idx]) {
                        await uploadParagraphPhoto(savedParagraphs[idx].id, newParagraphPhotos[key]);
                    }
                }
            }

            clearCache();
            toast.success(isEdit ? "Сохранено" : "Создано");
            navigate("/textbooks/manage");
        } catch {
            toast.error("Ошибка сохранения");
        } finally {
            setSaving(false);
        }
    };

    const filteredCategories = sectionId
        ? categories.filter((c) => String(c.section) === String(sectionId))
        : categories;

    if (loading) return (
        <div className="page-shell page-stack">
            <div className="surface-empty">Загрузка...</div>
        </div>
    );

    return (
        <div className="page-shell page-stack max-w-3xl mx-auto">
            <Link to="/textbooks/manage" className="btn-ghost flex items-center gap-1.5 self-start">
                <ArrowLeft size={16} /> Назад к управлению
            </Link>

            <h1 className="page-title">{isEdit ? "Редактирование карточки" : "Новая карточка"}</h1>

            <form onSubmit={handleSubmit} className="space-y-5">

                {/* Basic data */}
                <div className="surface-panel space-y-4">
                    <h2 className="section-title">Основные данные</h2>

                    <div>
                        <label className="text-xs font-medium mb-1 block" style={{ color: "var(--n-muted)" }}>Название</label>
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="input-premium w-full"
                            required
                        />
                    </div>

                    <div className="flex gap-3">
                        <div className="flex-1">
                            <Dropdown
                                label="Раздел"
                                value={sectionId}
                                onChange={(val) => { setSectionId(val); setCategoryId(""); }}
                                options={sections.map((s) => ({ value: String(s.id), label: s.name }))}
                                placeholder="—"
                            />
                        </div>
                        <div className="flex-1">
                            <Dropdown
                                label="Категория"
                                value={categoryId}
                                onChange={(val) => setCategoryId(val)}
                                options={filteredCategories.map((c) => ({ value: String(c.id), label: c.name }))}
                                placeholder="—"
                            />
                        </div>
                    </div>
                </div>

                {/* Photos */}
                <div className="surface-panel space-y-3">
                    <h2 className="section-title">Фото</h2>

                    <div
                        className="surface-block border-dashed cursor-pointer text-center py-6"
                        style={{ borderStyle: "dashed" }}
                        onClick={() => photoInputRef.current?.click()}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={handleDrop}
                    >
                        <Upload size={20} className="mx-auto mb-1" style={{ color: "var(--n-dim)" }} />
                        <span className="text-sm" style={{ color: "var(--n-dim)" }}>Перетащите фото или нажмите для загрузки</span>
                    </div>
                    <input
                        ref={photoInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => { if (e.target.files.length) handlePhotoFiles(e.target.files); e.target.value = ""; }}
                    />

                    {((existingPhotos.length) + newCardPhotos.length) > 0 && (
                        <div className="flex gap-2 flex-wrap">
                            {existingPhotos.map((p) => (
                                <div key={p.id} className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-lg overflow-hidden group">
                                    <img
                                        src={p.file}
                                        alt=""
                                        className="w-full h-full object-cover cursor-pointer"
                                        onClick={() => setLightboxSrc(p.file)}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => removeExistingPhoto(p.id)}
                                        className="absolute top-1 right-1 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                        style={{ background: "var(--n-panel)", border: "1px solid var(--n-border)" }}
                                    >
                                        <X size={10} />
                                    </button>
                                </div>
                            ))}
                            {newCardPhotos.map((p, i) => (
                                <div key={`new-${i}`} className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-lg overflow-hidden group">
                                    <img src={p.preview} alt="" className="w-full h-full object-cover" />
                                    <button
                                        type="button"
                                        onClick={() => removeNewPhoto(i)}
                                        className="absolute top-1 right-1 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                        style={{ background: "var(--n-panel)", border: "1px solid var(--n-border)" }}
                                    >
                                        <X size={10} />
                                    </button>
                                </div>
                            ))}
                            <button
                                type="button"
                                onClick={() => photoInputRef.current?.click()}
                                className="w-20 h-20 sm:w-24 sm:h-24 rounded-full border-2 border-dashed flex items-center justify-center transition-colors"
                                style={{ borderColor: "var(--n-border)", color: "var(--n-dim)" }}
                            >
                                <Plus size={20} />
                            </button>
                        </div>
                    )}
                </div>

                {/* Paragraphs */}
                <div className="surface-panel space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="section-title">Параграфы</h2>
                        <button
                            type="button"
                            onClick={addParagraph}
                            className="btn-ghost flex items-center gap-1"
                        >
                            <Plus size={14} /> Добавить
                        </button>
                    </div>

                    <div className="space-y-3">
                        {paragraphs.map((p, i) => (
                            <div key={i} className="surface-block space-y-3">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <GripVertical size={14} style={{ color: "var(--n-dim)" }} className="cursor-grab" />
                                        <span className="text-xs font-medium" style={{ color: "var(--n-muted)" }}>#{i + 1}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="schedule-segmented">
                                            <button
                                                type="button"
                                                className={`schedule-segmented__button ${p.paragraph_type === "front" ? "active" : ""}`}
                                                onClick={() => updateParagraph(i, "paragraph_type", "front")}
                                            >
                                                <span className="schedule-segmented__inner">Основной</span>
                                            </button>
                                            <button
                                                type="button"
                                                className={`schedule-segmented__button ${p.paragraph_type === "detail" ? "active" : ""}`}
                                                onClick={() => updateParagraph(i, "paragraph_type", "detail")}
                                            >
                                                <span className="schedule-segmented__inner">Подробность</span>
                                            </button>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => removeParagraph(i)}
                                            className="btn-danger"
                                            style={{ padding: "4px 8px" }}
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="text-xs font-medium mb-1 block" style={{ color: "var(--n-muted)" }}>Заголовок</label>
                                    <input
                                        placeholder="Заголовок"
                                        value={p.label}
                                        onChange={(e) => updateParagraph(i, "label", e.target.value)}
                                        className="input-premium w-full"
                                    />
                                </div>

                                <div>
                                    <label className="text-xs font-medium mb-1 block" style={{ color: "var(--n-muted)" }}>Текст</label>
                                    <textarea
                                        placeholder="Текст"
                                        value={p.text}
                                        onChange={(e) => updateParagraph(i, "text", e.target.value)}
                                        rows={3}
                                        className="input-premium w-full"
                                        style={{ resize: "none" }}
                                    />
                                </div>

                                <div className="flex items-center gap-2">
                                    {p.photoUrl ? (
                                        <div className="relative w-16 h-16 rounded-lg overflow-hidden group">
                                            <img
                                                src={p.photoUrl}
                                                alt=""
                                                className="w-full h-full object-cover cursor-pointer"
                                                onClick={() => setLightboxSrc(p.photoUrl)}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => removeParagraphPhoto(i)}
                                                className="absolute top-0 right-0 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                                style={{ background: "var(--n-panel)", border: "1px solid var(--n-border)" }}
                                            >
                                                <X size={10} />
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => paragraphPhotoRefs.current[i]?.click()}
                                            className="btn-ghost flex items-center gap-1 text-xs"
                                        >
                                            <Image size={12} /> Фото
                                        </button>
                                    )}
                                    <input
                                        ref={(el) => { paragraphPhotoRefs.current[i] = el; }}
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => { handleParagraphPhoto(i, e.target.files[0]); e.target.value = ""; }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Tags */}
                <div className="surface-panel space-y-3">
                    <h2 className="section-title">Теги</h2>

                    {tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {tags.map((t, i) => (
                                <span key={i} className="badge-muted flex items-center gap-1">
                                    {t}
                                    <button type="button" onClick={() => removeTag(i)}>
                                        <X size={10} />
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}

                    <input
                        placeholder="Добавить тег (Enter)"
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                        className="input-premium w-full"
                    />
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => { clearCache(); navigate("/textbooks/manage"); }}
                        className="btn-surface flex-1"
                    >
                        Отмена
                    </button>
                    <button
                        type="submit"
                        disabled={saving}
                        className="btn-save flex-1"
                    >
                        {saving ? "Сохранение..." : isEdit ? "Сохранить" : "Создать"}
                    </button>
                </div>
            </form>

            {lightboxSrc && <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
        </div>
    );
}
