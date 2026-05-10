import { useState, useEffect } from "react";
import { getMyItems, activateItem } from "../api/shop";
import { Package, Zap, CheckCircle } from "lucide-react";

export default function ShopMyItemsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(null);

  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async () => {
    try {
      const res = await getMyItems();
      setItems(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleActivate = async (item) => {
    if (activating) return;
    if (!window.confirm(`Активировать «${item.item_name}»?`)) return;

    setActivating(item.id);
    try {
      await activateItem(item.id);
      await loadItems();
    } catch (e) {
      const detail = e.response?.data?.detail || "Ошибка при активации";
      alert(detail);
    } finally {
      setActivating(null);
    }
  };

  if (loading) {
    return <div className="p-6 text-center" style={{ color: "var(--n-muted)" }}>Загрузка...</div>;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Мои товары</h1>

      {items.length === 0 ? (
        <div className="text-center py-12" style={{ color: "var(--n-muted)" }}>
          <Package size={48} className="mx-auto mb-3 opacity-50" />
          <p>У вас пока нет купленных товаров</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border overflow-hidden flex flex-col"
              style={{ background: "var(--n-surface)", borderColor: "var(--n-border)" }}
            >
              {item.item_photo_url ? (
                <img
                  src={item.item_photo_url}
                  alt={item.item_name}
                  className="w-full h-48 object-cover"
                />
              ) : (
                <div className="w-full h-48 flex items-center justify-center" style={{ background: "var(--n-hover)" }}>
                  <Package size={48} style={{ color: "var(--n-muted)" }} />
                </div>
              )}
              <div className="p-4 flex flex-col flex-1">
                <h3 className="font-semibold text-lg mb-1">{item.item_name || "Товар удалён"}</h3>
                {item.item_description && (
                  <p className="text-sm mb-3 flex-1" style={{ color: "var(--n-muted)" }}>
                    {item.item_description}
                  </p>
                )}
                <div className="flex items-center justify-between mt-auto pt-3">
                  <span className="text-sm" style={{ color: "var(--n-muted)" }}>
                    Активаций: {item.activations_count} / {item.activations_count + item.quantity_remaining}
                  </span>
                </div>
                {item.is_fully_activated ? (
                  <div
                    className="mt-3 w-full py-2.5 rounded-lg font-medium text-sm flex items-center justify-center gap-2"
                    style={{ background: "var(--n-hover)", color: "var(--n-muted)" }}
                  >
                    <CheckCircle size={16} />
                    Активировано
                  </div>
                ) : (
                  <button
                    onClick={() => handleActivate(item)}
                    disabled={activating === item.id}
                    className="mt-3 w-full py-2.5 rounded-lg font-medium text-sm flex items-center justify-center gap-2 btn-primary disabled:opacity-50"
                  >
                    <Zap size={16} />
                    {activating === item.id ? "Активация..." : `Активировать (${item.quantity_remaining})`}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
