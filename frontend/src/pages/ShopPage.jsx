import { useState, useEffect } from "react";
import { useAuth, hasPermission } from "../context/AuthContext";
import { getAvailableItems, createOrder, getShopSettings } from "../api/shop";
import { ShoppingCart, Package } from "lucide-react";

export default function ShopPage() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [itemsRes, settingsRes] = await Promise.all([
        getAvailableItems(),
        getShopSettings(),
      ]);
      setItems(itemsRes.data);
      setSettings(settingsRes.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async (item) => {
    if (purchasing) return;
    const confirmMsg = settings?.purchase_mode === "instant"
      ? `Купить «${item.name}» за ${item.price} СК коинов?`
      : `Оформить заказ на «${item.name}» за ${item.price} СК коинов? Заказ будет ожидать подтверждения.`;
    if (!window.confirm(confirmMsg)) return;

    setPurchasing(item.id);
    try {
      await createOrder({ item_id: item.id, quantity: 1 });
      await loadData();
    } catch (e) {
      const detail = e.response?.data?.detail || "Ошибка при покупке";
      alert(detail);
    } finally {
      setPurchasing(null);
    }
  };

  if (loading) {
    return <div className="p-6 text-center" style={{ color: "var(--n-muted)" }}>Загрузка...</div>;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Магазин</h1>
        {settings?.purchase_mode === "confirmation" && (
          <span className="text-xs px-2 py-1 rounded" style={{ background: "var(--n-hover)", color: "var(--n-muted)" }}>
            Режим с подтверждением
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <div className="text-center py-12" style={{ color: "var(--n-muted)" }}>
          <Package size={48} className="mx-auto mb-3 opacity-50" />
          <p>Нет доступных товаров</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border overflow-hidden flex flex-col"
              style={{ background: "var(--n-surface)", borderColor: "var(--n-border)" }}
            >
              {item.photo_url ? (
                <img
                  src={item.photo_url}
                  alt={item.name}
                  className="w-full h-48 object-cover"
                />
              ) : (
                <div className="w-full h-48 flex items-center justify-center" style={{ background: "var(--n-hover)" }}>
                  <Package size={48} style={{ color: "var(--n-muted)" }} />
                </div>
              )}
              <div className="p-4 flex flex-col flex-1">
                <h3 className="font-semibold text-lg mb-1">{item.name}</h3>
                {item.description && (
                  <p className="text-sm mb-3 flex-1" style={{ color: "var(--n-muted)" }}>
                    {item.description}
                  </p>
                )}
                <div className="flex items-center justify-between mt-auto pt-3">
                  <span className="text-lg font-bold" style={{ color: "var(--n-accent)" }}>
                    {item.price} СК
                  </span>
                  {item.stock_quantity !== -1 && (
                    <span className="text-xs" style={{ color: "var(--n-muted)" }}>
                      Осталось: {item.stock_quantity}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handlePurchase(item)}
                  disabled={purchasing === item.id || (user?.coin_balance ?? 0) < item.price}
                  className="mt-3 w-full py-2.5 rounded-lg font-medium text-sm flex items-center justify-center gap-2 btn-primary disabled:opacity-50"
                >
                  <ShoppingCart size={16} />
                  {purchasing === item.id ? "Оформление..." : "Купить"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
