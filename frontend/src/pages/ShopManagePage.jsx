import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getItems, deleteItem, getShopSettings, updateShopSettings } from "../api/shop";
import { Plus, Pencil, Trash2, Package, Settings } from "lucide-react";
import ShopAssignmentsPage from "./ShopAssignmentsPage";

export default function ShopManagePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState("items");
  const [items, setItems] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    if (mode === "items") loadData();
  }, [mode]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [itemsRes, settingsRes] = await Promise.all([
        getItems(),
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

  const handleDelete = async (item) => {
    if (!window.confirm(`Удалить товар «${item.name}»?`)) return;
    try {
      await deleteItem(item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch (e) {
      alert("Ошибка при удалении");
    }
  };

  const handleSettingsChange = async (field, value) => {
    try {
      const res = await updateShopSettings({ ...settings, [field]: value });
      setSettings(res.data);
    } catch (e) {
      alert("Ошибка при сохранении настроек");
    }
  };

  return (
    <div className="page-shell page-stack max-w-6xl mx-auto">
      <div className="hero-banner">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="page-title">Управление</h1>
            <p className="page-subtitle mt-1">
              {mode === "items"
                ? "Добавление и редактирование товаров"
                : "Настройка доступности товаров по юнитам"}
            </p>
          </div>
        </div>
      </div>

      <div
        className="flex gap-1 p-1 rounded-lg self-start"
        style={{ background: "var(--n-hover)" }}
      >
        <button
          onClick={() => setMode("items")}
          className="px-4 py-2 rounded-md text-sm font-medium transition-colors"
          style={{
            background: mode === "items" ? "var(--n-surface)" : "transparent",
            color: mode === "items" ? "var(--n-fg)" : "var(--n-muted)",
            boxShadow: mode === "items" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
          }}
        >
          Товары
        </button>
        <button
          onClick={() => setMode("assignments")}
          className="px-4 py-2 rounded-md text-sm font-medium transition-colors"
          style={{
            background: mode === "assignments" ? "var(--n-surface)" : "transparent",
            color: mode === "assignments" ? "var(--n-fg)" : "var(--n-muted)",
            boxShadow: mode === "assignments" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
          }}
        >
          Распределение
        </button>
      </div>

      {mode === "assignments" ? (
        <ShopAssignmentsPage />
      ) : (
        <>
          <div className="flex items-center justify-end">
            <div className="flex gap-2">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg btn-ghost text-sm"
              >
                <Settings size={16} />
                Настройки
              </button>
              <button
                onClick={() => navigate("/shop/manage/item/new")}
                className="flex items-center gap-2 px-4 py-2 rounded-lg btn-primary text-sm"
              >
                <Plus size={16} />
                Добавить товар
              </button>
            </div>
          </div>

          {showSettings && settings && (
            <div className="p-4 rounded-xl border" style={{ background: "var(--n-surface)", borderColor: "var(--n-border)" }}>
              <h3 className="font-semibold mb-3">Настройки магазина</h3>
              <div className="flex flex-col gap-3">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={settings.is_enabled}
                    onChange={(e) => handleSettingsChange("is_enabled", e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Модуль включён</span>
                </label>
                <div className="flex items-center gap-3">
                  <span className="text-sm">Режим покупки:</span>
                  <select
                    value={settings.purchase_mode}
                    onChange={(e) => handleSettingsChange("purchase_mode", e.target.value)}
                    className="px-3 py-1.5 rounded-lg border text-sm"
                    style={{ background: "var(--n-bg)", borderColor: "var(--n-border)" }}
                  >
                    <option value="instant">Мгновенная</option>
                    <option value="confirmation">С подтверждением</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <div className="p-6 text-center" style={{ color: "var(--n-muted)" }}>Загрузка...</div>
          ) : items.length === 0 ? (
            <div className="text-center py-12" style={{ color: "var(--n-muted)" }}>
              <Package size={48} className="mx-auto mb-3 opacity-50" />
              <p>Товары ещё не добавлены</p>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-4 p-4 rounded-xl border"
                  style={{ background: "var(--n-surface)", borderColor: "var(--n-border)" }}
                >
                  {item.photo_url ? (
                    <img src={item.photo_url} alt="" className="w-16 h-16 rounded-lg object-cover" />
                  ) : (
                    <div className="w-16 h-16 rounded-lg flex items-center justify-center" style={{ background: "var(--n-hover)" }}>
                      <Package size={24} style={{ color: "var(--n-muted)" }} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold truncate">{item.name}</h3>
                      {!item.is_active && (
                        <span className="text-xs px-2 py-0.5 rounded" style={{ background: "var(--n-hover)", color: "var(--n-muted)" }}>
                          Скрыт
                        </span>
                      )}
                      {item.stock_quantity === 0 && (
                        <span className="text-xs px-2 py-0.5 rounded" style={{ background: "#fef2f2", color: "#ef4444" }}>
                          Нет в наличии
                        </span>
                      )}
                    </div>
                    <p className="text-sm" style={{ color: "var(--n-muted)" }}>
                      {item.price} СК · {item.unit_name}
                      {item.stock_quantity !== -1 && ` · Остаток: ${item.stock_quantity}`}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => navigate(`/shop/manage/item/${item.id}/edit`)}
                      className="w-9 h-9 flex items-center justify-center rounded-lg btn-ghost"
                      title="Редактировать"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(item)}
                      className="w-9 h-9 flex items-center justify-center rounded-lg btn-ghost text-red-500"
                      title="Удалить"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
