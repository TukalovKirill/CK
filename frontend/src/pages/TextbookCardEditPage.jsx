import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getCard, createCard, updateCard, getSections, getCategories, uploadCardPhoto } from "../api/textbooks";
import toast from "react-hot-toast";
import { Plus, Trash2, ArrowLeft } from "lucide-react";

export default function TextbookCardEditPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [form, setForm] = useState({ name: "", section: "", category: "" });
  const [paragraphs, setParagraphs] = useState([]);
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState("");
  const [sections, setSections] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [s, c] = await Promise.all([getSections(), getCategories()]);
        setSections(s.data);
        setCategories(c.data);
        if (isEdit) {
          const res = await getCard(id);
          const card = res.data;
          setForm({ name: card.name, section: card.section || "", category: card.category || "" });
          setParagraphs(
            card.paragraphs?.map((p) => ({
              paragraph_type: p.paragraph_type,
              label: p.label,
              text: p.text,
              order: p.order,
              has_photo: Boolean(p.photo),
            })) || []
          );
          setTags(card.tags?.map((t) => t.tag) || []);
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
    setParagraphs([...paragraphs, { paragraph_type: "front", label: "", text: "", order: paragraphs.length }]);
  };

  const updateParagraph = (i, field, value) => {
    const copy = [...paragraphs];
    copy[i] = { ...copy[i], [field]: value };
    setParagraphs(copy);
  };

  const removeParagraph = (i) => {
    setParagraphs(paragraphs.filter((_, j) => j !== i));
  };

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t)) {
      setTags([...tags, t]);
    }
    setTagInput("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Введите название");
      return;
    }
    setSaving(true);
    try {
      const data = {
        name: form.name,
        section: form.section || null,
        category: form.category || null,
        paragraphs_data: paragraphs,
        tags_data: tags,
      };
      if (isEdit) {
        await updateCard(id, data);
        toast.success("Сохранено");
      } else {
        await createCard(data);
        toast.success("Создано");
      }
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

  if (loading) return <p className="text-center py-8 text-gray-400">Загрузка...</p>;

  return (
    <div className="max-w-2xl mx-auto">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft size={16} /> Назад
      </button>

      <h1 className="text-xl font-bold mb-4">{isEdit ? "Редактирование" : "Новая карточка"}</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <input placeholder="Название" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="w-full border rounded px-3 py-2 text-sm" required />

        <div className="flex gap-3">
          <select value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value, category: "" })}
            className="border rounded px-3 py-2 text-sm flex-1">
            <option value="">Раздел</option>
            {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
            className="border rounded px-3 py-2 text-sm flex-1">
            <option value="">Категория</option>
            {filteredCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">Параграфы</p>
            <button type="button" onClick={addParagraph} className="text-blue-600 text-sm flex items-center gap-1">
              <Plus size={14} /> Добавить
            </button>
          </div>
          <div className="space-y-3">
            {paragraphs.map((p, i) => (
              <div key={i} className="bg-gray-50 rounded p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <select value={p.paragraph_type} onChange={(e) => updateParagraph(i, "paragraph_type", e.target.value)}
                    className="border rounded px-2 py-1 text-xs">
                    <option value="front">Основной</option>
                    <option value="detail">Подробность</option>
                  </select>
                  <button type="button" onClick={() => removeParagraph(i)} className="text-red-400 hover:text-red-600">
                    <Trash2 size={14} />
                  </button>
                </div>
                <input placeholder="Заголовок" value={p.label} onChange={(e) => updateParagraph(i, "label", e.target.value)}
                  className="w-full border rounded px-3 py-1.5 text-sm" />
                <textarea placeholder="Текст" value={p.text} onChange={(e) => updateParagraph(i, "text", e.target.value)}
                  rows={3} className="w-full border rounded px-3 py-1.5 text-sm resize-y" />
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm font-medium mb-2">Теги</p>
          <div className="flex flex-wrap gap-1 mb-2">
            {tags.map((t, i) => (
              <span key={i} className="bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded">
                {t}
                <button type="button" onClick={() => setTags(tags.filter((_, j) => j !== i))}
                  className="ml-1 text-red-400">&times;</button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input placeholder="Добавить тег" value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
              className="border rounded px-3 py-1.5 text-sm flex-1" />
            <button type="button" onClick={addTag} className="text-blue-600 text-sm">+</button>
          </div>
        </div>

        <button type="submit" disabled={saving}
          className="w-full bg-blue-600 text-white py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
          {saving ? "Сохранение..." : isEdit ? "Сохранить" : "Создать"}
        </button>
      </form>
    </div>
  );
}
