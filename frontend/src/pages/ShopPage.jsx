import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import {
  getAvailableItems, createOrder, getShopSettings,
  getMyItems, activateItem, createRefund,
} from "../api/shop";
import { ShoppingCart, Package, Zap, CheckCircle, RotateCcw } from "lucide-react";

export default function ShopPage() {
  const { user } = useAuth();
  const [mode, setMode] = useState("catalog");
  const [items, setItems] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(null);
  const [activating, setActivating] = useState(null);
  const [refunding, setRefunding] = useState(null);

  useEffect(() => {
    loadData();
  }, [mode]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (mode === "catalog") {
        const [itemsRes, settingsRes] = await Promise.all([
          getAvailableItems(),
          getShopSettings(),
        ]);
        setItems(itemsRes.data);
        setSettings(settingsRes.data);
      } else {
        const res = await getMyItems();
        setItems(res.data);
      }
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

  const handleActivate = async (item) => {
    if (activating) return;
    if (!window.confirm(`Активировать «${item.item_name}»?`)) return;

    setActivating(item.id);
    try {
      await activateItem(item.id);
      await loadData();
    } catch (e) {
      const detail = e.response?.data?.detail || "Ошибка при активации";
      alert(detail);
    } finally {
      setActivating(null);
    }
  };

  const handleRefund = async (item) => {
    if (refunding) return;
    const reason = window.prompt("Укажите причину возврата (необязательно):", "");
    if (reason === null) return;

    setRefunding(item.id);
    try {
      await createRefund({ purchased_item_id: item.id, reason });
      alert("Запрос на возврат отправлен. Ожидайте подтверждения.");
      await loadData();
    } catch (e) {
      const detail = e.response?.data?.detail || "Ошибка при создании запроса на возврат";
      alert(detail);
    } finally {
      setRefunding(null);
    }
  };

  const canRefund = (item) => !item.is_fully_activated && item.activations_count === 0;

  return (
    <div className="page-shell page-stack max-w-6xl mx-auto">
      <div className="hero-banner">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="page-title">Магазин</h1>
            <p className="page-subtitle mt-1">
              {mode === "catalog"
                ? "Обменяй баллы на приятные бонусы"
                : "Купленные и активированные товары"}
            </p>
          </div>
          {mode === "catalog" && settings?.purchase_mode === "confirmation" && (
            <span className="badge-muted">Режим с подтверждением</span>
          )}
        </div>
      </div>

      <div
        className="flex gap-1 p-1 rounded-lg self-start"
        style={{ background: "var(--n-hover)" }}
      >
        <button
          onClick={() => setMode("catalog")}
          className="px-4 py-2 rounded-md text-sm font-medium transition-colors"
          style={{
            background: mode === "catalog" ? "var(--n-surface)" : "transparent",
            color: mode === "catalog" ? "var(--n-fg)" : "var(--n-muted)",
            boxShadow: mode === "catalog" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
          }}
        >
          Витрина
        </button>
        <button
          onClick={() => setMode("my-items")}
          className="px-4 py-2 rounded-md text-sm font-medium transition-colors"
          style={{
            background: mode === "my-items" ? "var(--n-surface)" : "transparent",
            color: mode === "my-items" ? "var(--n-fg)" : "var(--n-muted)",
            boxShadow: mode === "my-items" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
          }}
        >
          Мои товары
        </button>
      </div>

      {loading ? (
        <div className="p-6 text-center" style={{ color: "var(--n-muted)" }}>Загрузка...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-12" style={{ color: "var(--n-muted)" }}>
          <Package size={48} className="mx-auto mb-3 opacity-50" />
          <p>{mode === "catalog" ? "Нет доступных товаров" : "У вас пока нет купленных товаров"}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {mode === "catalog"
            ? items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border overflow-hidden flex flex-col"
                  style={{ background: "var(--n-surface)", borderColor: "var(--n-border)" }}
                >
                  {item.photo_url ? (
                    <img src={item.photo_url} alt={item.name} className="w-full h-48 object-cover" />
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
              ))
            : items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border overflow-hidden flex flex-col"
                  style={{ background: "var(--n-surface)", borderColor: "var(--n-border)" }}
                >
                  {item.item_photo_url ? (
                    <img src={item.item_photo_url} alt={item.item_name} className="w-full h-48 object-cover" />
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
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => handleActivate(item)}
                          disabled={activating === item.id}
                          className="flex-1 py-2.5 rounded-lg font-medium text-sm flex items-center justify-center gap-2 btn-primary disabled:opacity-50"
                        >
                          <Zap size={16} />
                          {activating === item.id ? "..." : `Активировать (${item.quantity_remaining})`}
                        </button>
                        {canRefund(item) && (
                          <button
                            onClick={() => handleRefund(item)}
                            disabled={refunding === item.id}
                            className="py-2.5 px-3 rounded-lg font-medium text-sm flex items-center justify-center gap-1 btn-ghost disabled:opacity-50"
                            title="Запросить возврат"
                            style={{ color: "#ef4444" }}
                          >
                            <RotateCcw size={16} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
        </div>
      )}
    </div>
  );
}
