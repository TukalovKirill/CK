import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getCard } from "../api/textbooks";
import { ArrowLeft, Pencil } from "lucide-react";

export default function TextbookCardPage() {
  const { id } = useParams();
  const [card, setCard] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCard(id)
      .then((res) => setCard(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p className="text-center py-8 text-gray-400">Загрузка...</p>;
  if (!card) return <p className="text-center py-8 text-red-500">Карточка не найдена</p>;

  const frontParagraphs = card.paragraphs?.filter((p) => p.paragraph_type === "front") || [];
  const detailParagraphs = card.paragraphs?.filter((p) => p.paragraph_type === "detail") || [];

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <Link to="/textbooks" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft size={16} /> Назад
        </Link>
        {card.can_edit && (
          <Link to={`/textbooks/manage/card/${id}/edit`}
            className="flex items-center gap-1 text-sm text-blue-600 hover:underline">
            <Pencil size={14} /> Редактировать
          </Link>
        )}
      </div>

      {card.photos?.length > 0 && (
        <img src={card.photos[0].file} alt="" className="w-full h-64 object-cover rounded-lg mb-4" />
      )}

      <h1 className="text-2xl font-bold mb-4">{card.name}</h1>

      {frontParagraphs.map((p) => (
        <div key={p.id} className="mb-4">
          {p.label && <h3 className="font-semibold text-sm text-gray-700 mb-1">{p.label}</h3>}
          <p className="text-sm text-gray-600 whitespace-pre-wrap">{p.text}</p>
          {p.photo && <img src={p.photo} alt="" className="mt-2 rounded max-h-48 object-cover" />}
        </div>
      ))}

      {detailParagraphs.length > 0 && (
        <details className="mt-4 border-t pt-4">
          <summary className="cursor-pointer text-sm font-medium text-blue-600">Подробнее</summary>
          <div className="mt-3 space-y-4">
            {detailParagraphs.map((p) => (
              <div key={p.id}>
                {p.label && <h3 className="font-semibold text-sm text-gray-700 mb-1">{p.label}</h3>}
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{p.text}</p>
                {p.photo && <img src={p.photo} alt="" className="mt-2 rounded max-h-48 object-cover" />}
              </div>
            ))}
          </div>
        </details>
      )}

      {card.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-6">
          {card.tags.map((t) => (
            <span key={t.id} className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded">{t.tag}</span>
          ))}
        </div>
      )}
    </div>
  );
}
