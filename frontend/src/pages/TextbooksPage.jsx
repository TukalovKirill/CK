import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getMyAvailableCards, searchCards } from "../api/textbooks";
import { useAuth, hasPermission } from "../context/AuthContext";
import useRealtimeUpdates from "../hooks/useRealtimeUpdates";
import { Search, Settings } from "lucide-react";

export default function TextbooksPage() {
  const { user } = useAuth();
  const canEdit = hasPermission(user, "textbooks.edit");
  const [cards, setCards] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadCards = async () => {
    try {
      const res = await getMyAvailableCards();
      setCards(res.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadCards(); }, []);
  useRealtimeUpdates(["textbook_card", "textbook_section", "textbook_category"], loadCards);

  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults(null);
      return;
    }
    const timeout = setTimeout(async () => {
      try {
        const res = await searchCards({ q: searchQuery });
        setSearchResults(res.data);
      } catch {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  const displayCards = searchResults ?? cards;

  if (loading) return <p className="text-center py-8 text-gray-400">Загрузка...</p>;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">Учебники</h1>
        {canEdit && (
          <Link to="/textbooks/manage" className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
            <Settings size={16} /> Управление
          </Link>
        )}
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
        <input
          placeholder="Поиск..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full border rounded pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {displayCards.map((card) => (
          <Link
            key={card.id}
            to={`/textbooks/card/${card.id}`}
            className="bg-white rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow"
          >
            {card.first_photo ? (
              <img src={card.first_photo} alt="" className="w-full h-32 object-cover" />
            ) : (
              <div className="w-full h-32 bg-gray-100 flex items-center justify-center text-gray-300 text-xs">
                Нет фото
              </div>
            )}
            <div className="p-2">
              <p className="text-sm font-medium truncate">{card.name}</p>
              {card.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {card.tags.slice(0, 3).map((t, i) => (
                    <span key={i} className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{t}</span>
                  ))}
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>
      {displayCards.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-8">Нет карточек</p>
      )}
    </div>
  );
}
