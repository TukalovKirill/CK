import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
    getCard, createCard, updateCard, getSections, getCategories,
    uploadCardPhoto, deleteCardPhoto, uploadParagraphPhoto,
} from "../api/textbooks";
import useSessionState from "../hooks/useSessionState";
import Lightbox from "../components/Lightbox";
import toast from "react-hot-toast";
import { Plus, Trash2, ArrowLeft, Upload, Image, X } from "lucide-react";

const SESSION_KEY = "tb_cardEditForm";

function emptyForm() {
    return { name: "", section: "", category: "", paragraphs: [], tags: [], existingPhotos: [] };
}

export default function TextbookCardEditPage() {
    const { id } = useParams();
    const isEdit = Boolean(id);
    const navigate = useNavigate();

    const [form, setForm] = useSessionState(SESSION_KEY, emptyForm());
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

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const [secRes, catRes] = await Promise.all([getSections(), getCategories()]);
                setSections(secRes.data);
                setCategories(catRes.data);

                if (isEdit && loadedId !== id) {
                    const res = await getCard(id);
                    const card = res.data;
                    setForm({
                        name: card.name,
                        section: card.section || "",
                        category: card.category || "",
                        paragraphs: card.paragraphs?.map((p) => ({
                            paragraph_type: p.paragraph_type,
                            label: p.label,
                            text: p.text,
                            order: p.order,
                            has_photo: Boolean(p.photo),
                            photoUrl: p.photo || null,
                        })) || [],
                        tags: card.tags?.map((t) => t.tag) || [],
                        existingPhotos: card.photos?.map((p) => ({ id: p.id, file: p.file })) || [],
                    });
                    setNewCardPhotos([]);
                    setNewParagraphPhotos({});
                    setLoadedId(id);
                } else if (!isEdit && loadedId !== "new") {
                    const cached = sessionStorage.getItem(SESSION_KEY);
                    if (!cached) setForm(emptyForm());
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

    const updateForm = (updates) => setForm((prev) => ({ ...prev, ...updates }));

    const addParagraph = () => {
        updateForm({
            paragraphs: [...form.paragraphs, {
                paragraph_type: "front", label: "", text: "", order: form.paragraphs.length,
                has_photo: false, photoUrl: null,
            }],
        });
    };

    const updateParagraph = (i, field, value) => {
        const copy = [...form.paragraphs];
        copy[i] = { ...copy[i], [field]: value };
        updateForm({ paragraphs: copy });
    };

    const removeParagraph = (i) => {
        updateForm({ paragraphs: form.paragraphs.filter((_, j) => j !== i) });
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
        const copy = [...form.paragraphs];
        copy[i] = { ...copy[i], has_photo: true, photoUrl: preview };
        updateForm({ paragraphs: copy });
        setNewParagraphPhotos((prev) => ({ ...prev, [i]: file }));
    };

    const removeParagraphPhoto = (i) => {
        const copy = [...form.paragraphs];
        copy[i] = { ...copy[i], has_photo: false, photoUrl: null };
        updateForm({ paragraphs: copy });
        setNewParagraphPhotos((prev) => {
            const next = { ...prev };
            delete next[i];
            return next;
        });
    };

    const addTag = () => {
        const t = tagInput.trim().toLowerCase();
        if (t && !form.tags.includes(t)) {
            updateForm({ tags: [...form.tags, t] });
        }
        setTagInput("");
    };

    const removeTag = (i) => {
        updateForm({ tags: form.tags.filter((_, j) => j !== i) });
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
            updateForm({ existingPhotos: form.existingPhotos.filter((p) => p.id !== photoId) });
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
        if (!form.name.trim()) { toast.error("Введите название"); return; }
        setSaving(true);
        try {
            const data = {
                name: form.name,
                section: form.section || null,
                category: form.category || null,
                paragraphs_data: form.paragraphs.map((p, i) => ({
                    paragraph_type: p.paragraph_type,
                    label: p.label,
                    text: p.text,
                    order: i,
                    has_photo: p.has_photo,
                })),
                tags_data: form.tags,
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

            sessionStorage.removeItem(SESSION_KEY);
            toast.success(isEdit ? "Сохранено" : "Создано");
            navigate("/textbooks/manage");
        } catch {
            toast.error("Ошибка сохранения");
        } finally {
            setSaving(false);
        }
    };

    const filteredCategories = form.section
        ? categories.filter((c) => String(c.section) === String(form.section))
        : categories;

    if (loading) return <p className="text-center py-8 text-gray-500">Загрузка...</p>;

    return (
        <div className="max-w-2xl mx-auto">
            <Link to="/textbooks/manage" className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-4">
                <ArrowLeft size={14} /> Назад к управлению
            </Link>

            <h1 className="text-lg font-semibold mb-4">{isEdit ? "Редактирование карточки" : "Новая карточка"}</h1>

            <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                    <label className="text-xs text-gray-500 mb-1 block">Название</label>
                    <input
                        value={form.name}
                        onChange={(e) => updateForm({ name: e.target.value })}
                        className="w-full border border-gray-300 px-2 py-1.5 text-sm"
                        required
                    />
                </div>

                <div className="flex gap-3">
                    <div className="flex-1">
                        <label className="text-xs text-gray-500 mb-1 block">Раздел</label>
                        <select
                            value={form.section}
                            onChange={(e) => updateForm({ section: e.target.value, category: "" })}
                            className="w-full border border-gray-300 px-2 py-1.5 text-sm"
                        >
                            <option value="">—</option>
                            {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                    <div className="flex-1">
                        <label className="text-xs text-gray-500 mb-1 block">Категория</label>
                        <select
                            value={form.category}
                            onChange={(e) => updateForm({ category: e.target.value })}
                            className="w-full border border-gray-300 px-2 py-1.5 text-sm"
                        >
                            <option value="">—</option>
                            {filteredCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                </div>

                <div>
                    <label className="text-xs text-gray-500 mb-1 block">Фото</label>
                    <div
                        className="border border-dashed border-gray-300 p-4 text-center text-sm text-gray-400 cursor-pointer hover:border-gray-500 transition-colors"
                        onClick={() => photoInputRef.current?.click()}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={handleDrop}
                    >
                        <Upload size={20} className="mx-auto mb-1" />
                        Перетащите фото или нажмите для загрузки
                    </div>
                    <input
                        ref={photoInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => { if (e.target.files.length) handlePhotoFiles(e.target.files); e.target.value = ""; }}
                    />
                    {((form.existingPhotos?.length || 0) + newCardPhotos.length) > 0 && (
                        <div className="flex gap-2 mt-2 flex-wrap">
                            {form.existingPhotos?.map((p) => (
                                <div key={p.id} className="relative w-20 h-20 border border-gray-200 group">
                                    <img
                                        src={p.file}
                                        alt=""
                                        className="w-full h-full object-cover cursor-pointer"
                                        onClick={() => setLightboxSrc(p.file)}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => removeExistingPhoto(p.id)}
                                        className="absolute top-0 right-0 bg-white border border-gray-300 p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <X size={10} />
                                    </button>
                                </div>
                            ))}
                            {newCardPhotos.map((p, i) => (
                                <div key={`new-${i}`} className="relative w-20 h-20 border border-gray-200 group">
                                    <img src={p.preview} alt="" className="w-full h-full object-cover" />
                                    <button
                                        type="button"
                                        onClick={() => removeNewPhoto(i)}
                                        className="absolute top-0 right-0 bg-white border border-gray-300 p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <X size={10} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div>
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-xs text-gray-500">Параграфы</label>
                        <button
                            type="button"
                            onClick={addParagraph}
                            className="text-xs border border-dashed border-gray-400 px-2 py-0.5 text-gray-500 hover:border-gray-600 hover:text-gray-700"
                        >
                            <Plus size={10} className="inline" /> Добавить
                        </button>
                    </div>
                    <div className="space-y-2">
                        {form.paragraphs.map((p, i) => (
                            <div key={i} className="border border-gray-200 p-3 space-y-2">
                                <div className="flex items-center justify-between">
                                    <button
                                        type="button"
                                        onClick={() => updateParagraph(i, "paragraph_type", p.paragraph_type === "front" ? "detail" : "front")}
                                        className={`text-[10px] px-2 py-0.5 border ${
                                            p.paragraph_type === "front"
                                                ? "border-gray-800 font-medium"
                                                : "border-gray-300 text-gray-500"
                                        }`}
                                    >
                                        {p.paragraph_type === "front" ? "Основной" : "Подробность"}
                                    </button>
                                    <button type="button" onClick={() => removeParagraph(i)} className="text-gray-400 hover:text-gray-700">
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                                <input
                                    placeholder="Заголовок"
                                    value={p.label}
                                    onChange={(e) => updateParagraph(i, "label", e.target.value)}
                                    className="w-full border border-gray-300 px-2 py-1 text-sm"
                                />
                                <textarea
                                    placeholder="Текст"
                                    value={p.text}
                                    onChange={(e) => updateParagraph(i, "text", e.target.value)}
                                    rows={3}
                                    className="w-full border border-gray-300 px-2 py-1 text-sm resize-y"
                                />
                                <div className="flex items-center gap-2">
                                    {p.photoUrl ? (
                                        <div className="relative w-16 h-16 border border-gray-200 group">
                                            <img
                                                src={p.photoUrl}
                                                alt=""
                                                className="w-full h-full object-cover cursor-pointer"
                                                onClick={() => setLightboxSrc(p.photoUrl)}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => removeParagraphPhoto(i)}
                                                className="absolute top-0 right-0 bg-white border border-gray-300 p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <X size={10} />
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => paragraphPhotoRefs.current[i]?.click()}
                                            className="text-xs border border-dashed border-gray-300 px-2 py-1 text-gray-400 hover:border-gray-500 hover:text-gray-600 flex items-center gap-1"
                                        >
                                            <Image size={10} /> Фото
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

                <div>
                    <label className="text-xs text-gray-500 mb-1 block">Теги</label>
                    <div className="flex flex-wrap gap-1 mb-2">
                        {form.tags.map((t, i) => (
                            <span key={i} className="text-xs border border-gray-300 px-2 py-0.5 flex items-center gap-1">
                                {t}
                                <button type="button" onClick={() => removeTag(i)} className="text-gray-400 hover:text-gray-700">
                                    <X size={8} />
                                </button>
                            </span>
                        ))}
                    </div>
                    <input
                        placeholder="Добавить тег (Enter)"
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                        className="w-full border border-gray-300 px-2 py-1.5 text-sm"
                    />
                </div>

                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => { sessionStorage.removeItem(SESSION_KEY); navigate("/textbooks/manage"); }}
                        className="flex-1 text-sm border border-gray-300 py-1.5 hover:bg-gray-50"
                    >
                        Отмена
                    </button>
                    <button
                        type="submit"
                        disabled={saving}
                        className="flex-1 text-sm border border-gray-800 py-1.5 hover:bg-gray-50 disabled:opacity-50"
                    >
                        {saving ? "Сохранение..." : isEdit ? "Сохранить" : "Создать"}
                    </button>
                </div>
            </form>

            {lightboxSrc && <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
        </div>
    );
}
