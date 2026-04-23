import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getSections, getCategories, getCards, createSection, createCategory, deleteSection, deleteCategory, deleteCard } from "../api/textbooks";
import useRealtimeUpdates from "../hooks/useRealtimeUpdates";
import toast from "react-hot-toast";
import { Plus, Trash2, Pencil } from "lucide-react";

export default function TextbookManagePage() {
  const [sections, setSections] = useState([]);
  const [categories, setCategories] = useState([]);
  const [cards, setCards] = useState([]);
  const [selectedSection, setSelectedSection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newSectionName, setNewSectionName] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");

  const loadAll = async () => {
    try {
      const [s, c, k] = await Promise.all([getSections(), getCategories(), getCards()]);
      setSections(s.data);
      setCategories(c.data);
      setCards(k.data.results || k.data);
    } catch {
      toast.error("Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);
  useRealtimeUpdates(["textbook_card", "textbook_section", "textbook_category"], loadAll);

  const handleAddSection = async () => {
    if (!newSectionName.trim()) return;
    try {
      await createSection({ name: newSectionName });
      setNewSectionName("");
      loadAll();
    } catch {
      toast.error("Ошибка");
    }
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim() || !selectedSection) return;
    try {
      await createCategory({ name: newCategoryName, section: selectedSection });
      setNewCategoryName("");
      loadAll();
    } catch {
      toast.error("Ошибка");
    }
  };

  const filteredCategories = selectedSection
    ? categories.filter((c) => c.section === selectedSection)
    : categories;

  const filteredCards = selectedSection
    ? cards.filter((c) => c.section === selectedSection)
    : cards;

  if (loading) return <p className="text-center py-8 text-gray-400">Загрузка...</p>;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">Управление учебниками</h1>
        <Link to="/textbooks/manage/card/new"
          className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700">
          <Plus size={16} /> Новая карточка
        </Link>
      </div>

      <div className="mb-4">
        <p className="text-sm font-medium mb-2">Разделы</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setSelectedSection(null)}
            className={`text-sm px-3 py-1 rounded ${!selectedSection ? "bg-blue-600 text-white" : "bg-gray-100 hover:bg-gray-200"}`}>
            Все
          </button>
          {sections.map((s) => (
            <div key={s.id} className="flex items-center gap-1">
              <button onClick={() => setSelectedSection(s.id)}
                className={`text-sm px-3 py-1 rounded ${selectedSection === s.id ? "bg-blue-600 text-white" : "bg-gray-100 hover:bg-gray-200"}`}>
                {s.name} ({s.cards_count})
              </button>
              <button onClick={() => deleteSection(s.id).then(loadAll).catch(() => toast.error("Ошибка"))}
                className="text-gray-400 hover:text-red-500"><Trash2 size={12} /></button>
            </div>
          ))}
          <div className="flex items-center gap-1">
            <input placeholder="Новый раздел" value={newSectionName} onChange={(e) => setNewSectionName(e.target.value)}
              className="border rounded px-2 py-1 text-sm w-36" />
            <button onClick={handleAddSection} className="text-blue-600"><Plus size={16} /></button>
          </div>
        </div>
      </div>

      {selectedSection && (
        <div className="mb-4">
          <p className="text-sm font-medium mb-2">Категории</p>
          <div className="flex flex-wrap gap-2">
            {filteredCategories.map((c) => (
              <div key={c.id} className="flex items-center gap-1">
                <span className="text-sm bg-gray-100 px-3 py-1 rounded">{c.name} ({c.cards_count})</span>
                <button onClick={() => deleteCategory(c.id).then(loadAll).catch(() => toast.error("Ошибка"))}
                  className="text-gray-400 hover:text-red-500"><Trash2 size={12} /></button>
              </div>
            ))}
            <div className="flex items-center gap-1">
              <input placeholder="Новая категория" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)}
                className="border rounded px-2 py-1 text-sm w-36" />
              <button onClick={handleAddCategory} className="text-blue-600"><Plus size={16} /></button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {filteredCards.map((card) => (
          <div key={card.id} className="bg-white rounded-lg shadow-sm p-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {card.first_photo ? (
                <img src={card.first_photo} alt="" className="w-10 h-10 object-cover rounded" />
              ) : (
                <div className="w-10 h-10 bg-gray-100 rounded" />
              )}
              <span className="text-sm font-medium">{card.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <Link to={`/textbooks/manage/card/${card.id}/edit`} className="text-gray-400 hover:text-blue-600">
                <Pencil size={14} />
              </Link>
              <button onClick={() => { if (confirm("Удалить?")) deleteCard(card.id).then(loadAll).catch(() => toast.error("Ошибка")); }}
                className="text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
        {filteredCards.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Нет карточек</p>}
      </div>
    </div>
  );
}
