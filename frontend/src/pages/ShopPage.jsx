import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import {
  getAvailableItems, createOrder, getShopSettings,
  getMyItems, activateByItem, createRefund,
  getDepartmentColleagues, giftItem,
} from "../api/shop";
import { ShoppingCart, Package, Zap, CheckCircle, RotateCcw, Plus, Minus, Gift, User, Search } from "lucide-react";
import Modal from "../components/Modal";

function QuantitySelector({ value, onChange, min = 1, max = 99 }) {
  const clamp = (v) => Math.max(min, Math.min(max, v));
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(clamp(value - 1))}
        disabled={value <= min}
        className="w-9 h-9 rounded-lg flex items-center justify-center border transition-colors disabled:opacity-30"
        style={{ borderColor: "var(--n-border)", color: "var(--n-fg)" }}
      >
        <Minus size={16} />
      </button>
      <input
        type="number"
        value={value}
        onChange={(e) => {
          const v = parseInt(e.target.value, 10);
          if (!isNaN(v)) onChange(clamp(v));
        }}
        min={min}
        max={max}
        className="w-16 h-9 text-center rounded-lg border text-sm font-medium"
        style={{
          borderColor: "var(--n-border)",
          background: "var(--n-surface)",
          color: "var(--n-fg)",
        }}
      />
      <button
        type="button"
        onClick={() => onChange(clamp(value + 1))}
        disabled={value >= max}
        className="w-9 h-9 rounded-lg flex items-center justify-center border transition-colors disabled:opacity-30"
        style={{ borderColor: "var(--n-border)", color: "var(--n-fg)" }}
      >
        <Plus size={16} />
      </button>
    </div>
  );
}

function ColleaguePickerModal({ open, onClose, onSelect, colleagues, loading }) {
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (open) setSearch("");
  }, [open]);

  const filtered = colleagues.filter((c) =>
    c.full_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Modal open={open} onClose={onClose} title="Выберите сотрудника">
      <div className="space-y-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--n-muted)" }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по имени..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border text-sm"
            style={{
              borderColor: "var(--n-border)",
              background: "var(--n-surface)",
              color: "var(--n-fg)",
            }}
          />
        </div>
        {loading ? (
          <div className="py-6 text-center text-sm" style={{ color: "var(--n-muted)" }}>Загрузка...</div>
        ) : filtered.length === 0 ? (
          <div className="py-6 text-center text-sm" style={{ color: "var(--n-muted)" }}>
            {colleagues.length === 0 ? "Нет коллег в вашем подразделении" : "Никого не найдено"}
          </div>
        ) : (
          <div className="max-h-64 overflow-y-auto space-y-1">
            {filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => onSelect(c)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors hover:bg-black/5"
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: "var(--n-hover)", color: "var(--n-muted)" }}
                >
                  <User size={16} />
                </div>
                <div>
                  <div className="text-sm font-medium">{c.full_name}</div>
                  {c.department_name && (
                    <div className="text-xs" style={{ color: "var(--n-muted)" }}>{c.department_name}</div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

function groupMyItems(items) {
  const groups = {};
  items.forEach((pi) => {
    const key = pi.item ?? `deleted_${pi.id}`;
    if (!groups[key]) {
      groups[key] = {
        item_id: pi.item,
        item_name: pi.item_name,
        item_photo_url: pi.item_photo_url,
        item_description: pi.item_description,
        total_quantity: 0,
        total_remaining: 0,
        total_activated: 0,
        purchased_item_ids: [],
        purchased_items: [],
        can_refund: true,
      };
    }
    const g = groups[key];
    const activated = pi.activations_count;
    g.total_quantity += activated + pi.quantity_remaining;
    g.total_remaining += pi.quantity_remaining;
    g.total_activated += activated;
    g.purchased_item_ids.push(pi.id);
    g.purchased_items.push(pi);
    if (activated > 0) g.can_refund = false;
  });
  return Object.values(groups);
}

export default function ShopPage() {
  const { user } = useAuth();
  const [mode, setMode] = useState("catalog");
  const [items, setItems] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(null);
  const [activating, setActivating] = useState(false);
  const [refunding, setRefunding] = useState(null);

  const [quantities, setQuantities] = useState({});

  const [activateGroup, setActivateGroup] = useState(null);
  const [activateQty, setActivateQty] = useState(1);

  // Gift state for catalog
  const [giftModes, setGiftModes] = useState({});
  const [giftRecipients, setGiftRecipients] = useState({});
  const [colleagueModalFor, setColleagueModalFor] = useState(null);
  const [colleagues, setColleagues] = useState([]);
  const [colleaguesLoading, setColleaguesLoading] = useState(false);
  const [colleaguesLoaded, setColleaguesLoaded] = useState(false);

  // Gift state for my-items
  const [giftGroup, setGiftGroup] = useState(null);
  const [giftQty, setGiftQty] = useState(1);
  const [giftMyItemRecipient, setGiftMyItemRecipient] = useState(null);
  const [giftMyItemColleagueModal, setGiftMyItemColleagueModal] = useState(false);
  const [gifting, setGifting] = useState(false);

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

  const loadColleagues = async () => {
    if (colleaguesLoaded) return;
    setColleaguesLoading(true);
    try {
      const res = await getDepartmentColleagues();
      setColleagues(res.data);
      setColleaguesLoaded(true);
    } catch (e) {
      console.error(e);
    } finally {
      setColleaguesLoading(false);
    }
  };

  const balance = user?.coin_balance ?? 0;

  const getQty = (itemId) => quantities[itemId] ?? 1;
  const setQty = (itemId, v) => setQuantities((prev) => ({ ...prev, [itemId]: v }));

  const getMaxQty = (item) => {
    if (item.price === 0) return item.stock_quantity !== -1 ? item.stock_quantity : 99;
    const maxByBalance = Math.floor(balance / item.price);
    const maxByStock = item.stock_quantity !== -1 ? item.stock_quantity : Infinity;
    return Math.max(1, Math.min(maxByBalance, maxByStock));
  };

  const isGiftMode = (itemId) => giftModes[itemId] === true;

  const toggleGiftMode = (itemId) => {
    setGiftModes((prev) => {
      const next = { ...prev, [itemId]: !prev[itemId] };
      if (!next[itemId]) {
        setGiftRecipients((r) => {
          const nr = { ...r };
          delete nr[itemId];
          return nr;
        });
      }
      return next;
    });
  };

  const openColleagueModal = (itemId) => {
    setColleagueModalFor(itemId);
    loadColleagues();
  };

  const selectColleague = (colleague) => {
    if (colleagueModalFor !== null) {
      setGiftRecipients((prev) => ({ ...prev, [colleagueModalFor]: colleague }));
      setColleagueModalFor(null);
    }
  };

  const handlePurchase = async (item) => {
    if (purchasing) return;
    const qty = getQty(item.id);
    const gift = isGiftMode(item.id);
    const recipient = giftRecipients[item.id];

    if (gift && !recipient) {
      openColleagueModal(item.id);
      return;
    }

    setPurchasing(item.id);
    try {
      const data = { item_id: item.id, quantity: qty };
      if (gift && recipient) {
        data.recipient_id = recipient.id;
      }
      await createOrder(data);
      setQty(item.id, 1);
      if (gift) {
        setGiftModes((prev) => ({ ...prev, [item.id]: false }));
        setGiftRecipients((prev) => {
          const n = { ...prev };
          delete n[item.id];
          return n;
        });
      }
      await loadData();
    } catch (e) {
      const detail = e.response?.data?.detail || "Ошибка при покупке";
      alert(detail);
    } finally {
      setPurchasing(null);
    }
  };

  const openActivateModal = (group) => {
    if (group.total_remaining < 1) return;
    setActivateGroup(group);
    setActivateQty(1);
  };

  const handleActivate = async () => {
    if (activating || !activateGroup) return;
    setActivating(true);
    try {
      await activateByItem({ item_id: activateGroup.item_id, quantity: activateQty });
      setActivateGroup(null);
      await loadData();
    } catch (e) {
      const detail = e.response?.data?.detail || "Ошибка при активации";
      alert(detail);
    } finally {
      setActivating(false);
    }
  };

  const handleRefund = async (group) => {
    if (refunding) return;
    const reason = window.prompt("Укажите причину возврата (необязательно):", "");
    if (reason === null) return;

    setRefunding(group.item_id);
    try {
      for (const piId of group.purchased_item_ids) {
        await createRefund({ purchased_item_id: piId, reason });
      }
      alert("Запрос на возврат отправлен. Ожидайте подтверждения.");
      await loadData();
    } catch (e) {
      const detail = e.response?.data?.detail || "Ошибка при создании запроса на возврат";
      alert(detail);
    } finally {
      setRefunding(null);
    }
  };

  // Gift existing item handlers
  const openGiftModal = (group) => {
    setGiftGroup(group);
    setGiftQty(1);
    setGiftMyItemRecipient(null);
    loadColleagues();
  };

  const openGiftColleagueModal = () => {
    setGiftMyItemColleagueModal(true);
  };

  const selectGiftColleague = (colleague) => {
    setGiftMyItemRecipient(colleague);
    setGiftMyItemColleagueModal(false);
  };

  const handleGiftItem = async () => {
    if (gifting || !giftGroup || !giftMyItemRecipient) return;
    setGifting(true);
    try {
      let remaining = giftQty;
      for (const pi of giftGroup.purchased_items) {
        if (remaining <= 0) break;
        if (pi.quantity_remaining <= 0) continue;
        const qty = Math.min(pi.quantity_remaining, remaining);
        await giftItem(pi.id, { recipient_id: giftMyItemRecipient.id, quantity: qty });
        remaining -= qty;
      }
      setGiftGroup(null);
      setGiftMyItemRecipient(null);
      await loadData();
    } catch (e) {
      const detail = e.response?.data?.detail || "Ошибка при передаче товара";
      alert(detail);
    } finally {
      setGifting(false);
    }
  };

  const groupedItems = mode === "my-items" ? groupMyItems(items) : [];
  const displayItems = mode === "catalog" ? items : groupedItems;

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
      ) : displayItems.length === 0 ? (
        <div className="text-center py-12" style={{ color: "var(--n-muted)" }}>
          <Package size={48} className="mx-auto mb-3 opacity-50" />
          <p>{mode === "catalog" ? "Нет доступных товаров" : "У вас пока нет купленных товаров"}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {mode === "catalog"
            ? items.filter((item) => item.stock_quantity !== 0).map((item) => {
                const qty = getQty(item.id);
                const maxQty = getMaxQty(item);
                const canBuy = item.price === 0 || balance >= item.price;
                const totalPrice = item.price * qty;
                const gift = isGiftMode(item.id);
                const recipient = giftRecipients[item.id];
                return (
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

                    {/* Gift toggle */}
                    <div className="mt-3 flex gap-1 p-0.5 rounded-lg" style={{ background: "var(--n-hover)" }}>
                      <button
                        onClick={() => gift && toggleGiftMode(item.id)}
                        className="flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
                        style={{
                          background: !gift ? "var(--n-surface)" : "transparent",
                          color: !gift ? "var(--n-fg)" : "var(--n-muted)",
                          boxShadow: !gift ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
                        }}
                      >
                        <ShoppingCart size={13} />
                        Себе
                      </button>
                      <button
                        onClick={() => !gift && toggleGiftMode(item.id)}
                        className="flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
                        style={{
                          background: gift ? "var(--n-surface)" : "transparent",
                          color: gift ? "#8b5cf6" : "var(--n-muted)",
                          boxShadow: gift ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
                        }}
                      >
                        <Gift size={13} />
                        Подарить
                      </button>
                    </div>

                    {/* Selected recipient */}
                    {gift && (
                      <button
                        onClick={() => openColleagueModal(item.id)}
                        className="mt-2 w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors"
                        style={{
                          borderColor: recipient ? "#8b5cf6" : "var(--n-border)",
                          background: recipient ? "rgba(139,92,246,0.05)" : "transparent",
                          color: recipient ? "#8b5cf6" : "var(--n-muted)",
                        }}
                      >
                        <User size={14} />
                        {recipient ? recipient.full_name : "Выбрать сотрудника..."}
                      </button>
                    )}

                    <div className="mt-3 flex items-center gap-2">
                      <QuantitySelector
                        value={qty}
                        onChange={(v) => setQty(item.id, v)}
                        min={1}
                        max={maxQty}
                      />
                      <button
                        onClick={() => handlePurchase(item)}
                        disabled={!canBuy || purchasing === item.id || (gift && !recipient)}
                        className="flex-1 py-2.5 rounded-lg font-medium text-sm flex items-center justify-center gap-2 btn-primary disabled:opacity-50"
                        style={gift && recipient ? { background: "#8b5cf6" } : undefined}
                      >
                        {gift ? <Gift size={16} /> : <ShoppingCart size={16} />}
                        {purchasing === item.id ? "..." : `${totalPrice} СК`}
                      </button>
                    </div>
                    {settings?.purchase_mode === "confirmation" && (
                      <p className="text-xs mt-1.5 text-center" style={{ color: "var(--n-muted)" }}>
                        Требует подтверждения
                      </p>
                    )}
                  </div>
                </div>
                );
              })
            : groupedItems.map((group) => (
                <div
                  key={group.item_id ?? group.purchased_item_ids[0]}
                  className="rounded-xl border overflow-hidden flex flex-col"
                  style={{ background: "var(--n-surface)", borderColor: "var(--n-border)" }}
                >
                  {group.item_photo_url ? (
                    <img src={group.item_photo_url} alt={group.item_name} className="w-full h-48 object-cover" />
                  ) : (
                    <div className="w-full h-48 flex items-center justify-center" style={{ background: "var(--n-hover)" }}>
                      <Package size={48} style={{ color: "var(--n-muted)" }} />
                    </div>
                  )}
                  <div className="p-4 flex flex-col flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-semibold text-lg">{group.item_name || "Товар удалён"}</h3>
                      {group.total_quantity > 1 && (
                        <span
                          className="text-sm font-medium px-2 py-0.5 rounded-full"
                          style={{ background: "var(--n-hover)", color: "var(--n-fg)" }}
                        >
                          x{group.total_quantity}
                        </span>
                      )}
                    </div>
                    {group.item_description && (
                      <p className="text-sm mb-3 flex-1" style={{ color: "var(--n-muted)" }}>
                        {group.item_description}
                      </p>
                    )}
                    <div className="flex items-center justify-between mt-auto pt-3">
                      <span className="text-sm" style={{ color: "var(--n-muted)" }}>
                        Активаций: {group.total_activated} / {group.total_quantity}
                      </span>
                    </div>
                    {group.total_remaining === 0 ? (
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
                          onClick={() => openActivateModal(group)}
                          disabled={activating}
                          className="flex-1 py-2.5 rounded-lg font-medium text-sm flex items-center justify-center gap-2 btn-primary disabled:opacity-50"
                        >
                          <Zap size={16} />
                          Активировать ({group.total_remaining})
                        </button>
                        <button
                          onClick={() => openGiftModal(group)}
                          className="py-2.5 px-3 rounded-lg font-medium text-sm flex items-center justify-center gap-1 btn-ghost"
                          title="Подарить"
                          style={{ color: "#8b5cf6" }}
                        >
                          <Gift size={16} />
                        </button>
                        {group.can_refund && (
                          <button
                            onClick={() => handleRefund(group)}
                            disabled={refunding === group.item_id}
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

      {/* Activation Modal */}
      <Modal open={!!activateGroup} onClose={() => setActivateGroup(null)} title="Активация товара">
        {activateGroup && (
          <div className="space-y-4">
            <div className="flex gap-3">
              {activateGroup.item_photo_url ? (
                <img src={activateGroup.item_photo_url} alt={activateGroup.item_name}
                  className="w-20 h-20 rounded-lg object-cover flex-shrink-0" />
              ) : (
                <div className="w-20 h-20 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: "var(--n-hover)" }}>
                  <Package size={24} style={{ color: "var(--n-muted)" }} />
                </div>
              )}
              <div>
                <h3 className="font-semibold">{activateGroup.item_name}</h3>
                <p className="text-sm mt-1" style={{ color: "var(--n-muted)" }}>
                  Доступно: {activateGroup.total_remaining}
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Количество для активации</label>
              <QuantitySelector
                value={activateQty}
                onChange={setActivateQty}
                min={1}
                max={activateGroup.total_remaining}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setActivateGroup(null)}
                className="flex-1 py-2.5 rounded-lg font-medium text-sm btn-ghost"
              >
                Отмена
              </button>
              <button
                onClick={handleActivate}
                disabled={activating}
                className="flex-1 py-2.5 rounded-lg font-medium text-sm btn-primary disabled:opacity-50"
              >
                <span className="flex items-center justify-center gap-2">
                  <Zap size={16} />
                  {activating ? "Активация..." : `Активировать (${activateQty})`}
                </span>
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Gift Item Modal (for my-items) */}
      <Modal open={!!giftGroup && !giftMyItemColleagueModal} onClose={() => setGiftGroup(null)} title="Подарить товар">
        {giftGroup && (
          <div className="space-y-4">
            <div className="flex gap-3">
              {giftGroup.item_photo_url ? (
                <img src={giftGroup.item_photo_url} alt={giftGroup.item_name}
                  className="w-20 h-20 rounded-lg object-cover flex-shrink-0" />
              ) : (
                <div className="w-20 h-20 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: "var(--n-hover)" }}>
                  <Package size={24} style={{ color: "var(--n-muted)" }} />
                </div>
              )}
              <div>
                <h3 className="font-semibold">{giftGroup.item_name}</h3>
                <p className="text-sm mt-1" style={{ color: "var(--n-muted)" }}>
                  Доступно: {giftGroup.total_remaining}
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Кому подарить</label>
              <button
                onClick={openGiftColleagueModal}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm transition-colors"
                style={{
                  borderColor: giftMyItemRecipient ? "#8b5cf6" : "var(--n-border)",
                  background: giftMyItemRecipient ? "rgba(139,92,246,0.05)" : "transparent",
                  color: giftMyItemRecipient ? "#8b5cf6" : "var(--n-muted)",
                }}
              >
                <User size={14} />
                {giftMyItemRecipient ? giftMyItemRecipient.full_name : "Выбрать сотрудника..."}
              </button>
            </div>

            {giftGroup.total_remaining > 1 && (
              <div>
                <label className="block text-sm font-medium mb-2">Количество</label>
                <QuantitySelector
                  value={giftQty}
                  onChange={setGiftQty}
                  min={1}
                  max={giftGroup.total_remaining}
                />
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setGiftGroup(null)}
                className="flex-1 py-2.5 rounded-lg font-medium text-sm btn-ghost"
              >
                Отмена
              </button>
              <button
                onClick={handleGiftItem}
                disabled={gifting || !giftMyItemRecipient}
                className="flex-1 py-2.5 rounded-lg font-medium text-sm disabled:opacity-50"
                style={{ background: "#8b5cf6", color: "white" }}
              >
                <span className="flex items-center justify-center gap-2">
                  <Gift size={16} />
                  {gifting ? "Передача..." : `Подарить (${giftQty})`}
                </span>
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Colleague picker modal for catalog */}
      <ColleaguePickerModal
        open={colleagueModalFor !== null}
        onClose={() => setColleagueModalFor(null)}
        onSelect={selectColleague}
        colleagues={colleagues}
        loading={colleaguesLoading}
      />

      {/* Colleague picker modal for my-items gift */}
      <ColleaguePickerModal
        open={giftMyItemColleagueModal}
        onClose={() => setGiftMyItemColleagueModal(false)}
        onSelect={selectGiftColleague}
        colleagues={colleagues}
        loading={colleaguesLoading}
      />
    </div>
  );
}
