import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getMyTransactions, getOrders } from "../api/shop";
import { History, Coins, Package, ArrowUpRight } from "lucide-react";

export default function ShopHistoryPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "coins";

  const [transactions, setTransactions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === "coins") {
        const res = await getMyTransactions();
        setTransactions(res.data);
      } else {
        const res = await getOrders();
        setOrders(res.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const setTab = (tab) => {
    setSearchParams({ tab });
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleString("ru-RU", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  };

  const getTypeLabel = (type) => {
    switch (type) {
      case "accrual": return "Начисление";
      case "purchase": return "Покупка";
      case "refund": return "Возврат";
      default: return type;
    }
  };

  const getStatusLabel = (s) => {
    switch (s) {
      case "pending": return "Ожидает";
      case "completed": return "Выполнен";
      case "rejected": return "Отклонён";
      default: return s;
    }
  };

  const getStatusColor = (s) => {
    switch (s) {
      case "completed": return "#22c55e";
      case "rejected": return "#ef4444";
      default: return "var(--n-muted)";
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">История</h1>

      <div className="flex gap-1 p-1 rounded-lg mb-6" style={{ background: "var(--n-hover)" }}>
        <button
          onClick={() => setTab("coins")}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
            activeTab === "coins" ? "shadow-sm" : ""
          }`}
          style={{
            background: activeTab === "coins" ? "var(--n-surface)" : "transparent",
            color: activeTab === "coins" ? "var(--n-text)" : "var(--n-muted)",
          }}
        >
          <Coins size={16} />
          СК коины
        </button>
        <button
          onClick={() => setTab("items")}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
            activeTab === "items" ? "shadow-sm" : ""
          }`}
          style={{
            background: activeTab === "items" ? "var(--n-surface)" : "transparent",
            color: activeTab === "items" ? "var(--n-text)" : "var(--n-muted)",
          }}
        >
          <Package size={16} />
          Товары
        </button>
      </div>

      {loading ? (
        <div className="text-center py-8" style={{ color: "var(--n-muted)" }}>Загрузка...</div>
      ) : activeTab === "coins" ? (
        <div className="space-y-2">
          {transactions.length === 0 ? (
            <div className="text-center py-8" style={{ color: "var(--n-muted)" }}>
              <History size={48} className="mx-auto mb-3 opacity-50" />
              <p>История пуста</p>
            </div>
          ) : (
            transactions.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between p-4 rounded-lg border cursor-pointer hover:opacity-80 transition-opacity"
                style={{ background: "var(--n-surface)", borderColor: "var(--n-border)" }}
                onClick={() => {
                  if (tx.related_order) {
                    navigate(`/shop/history?tab=items`);
                  }
                }}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{getTypeLabel(tx.transaction_type)}</span>
                    {tx.related_order && (
                      <ArrowUpRight size={14} style={{ color: "var(--n-accent)" }} />
                    )}
                  </div>
                  {tx.comment && (
                    <p className="text-xs mt-0.5" style={{ color: "var(--n-muted)" }}>{tx.comment}</p>
                  )}
                  <p className="text-xs mt-0.5" style={{ color: "var(--n-muted)" }}>
                    {formatDate(tx.created_at)}
                  </p>
                </div>
                <span
                  className="text-lg font-bold"
                  style={{ color: tx.amount > 0 ? "#22c55e" : "#ef4444" }}
                >
                  {tx.amount > 0 ? "+" : ""}{tx.amount}
                </span>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {orders.length === 0 ? (
            <div className="text-center py-8" style={{ color: "var(--n-muted)" }}>
              <Package size={48} className="mx-auto mb-3 opacity-50" />
              <p>Нет заказов</p>
            </div>
          ) : (
            orders.map((order) => (
              <div
                key={order.id}
                className="flex items-center gap-4 p-4 rounded-lg border cursor-pointer hover:opacity-80 transition-opacity"
                style={{ background: "var(--n-surface)", borderColor: "var(--n-border)" }}
                onClick={() => navigate(`/shop/history?tab=coins`)}
              >
                {order.item_photo_url ? (
                  <img src={order.item_photo_url} alt="" className="w-12 h-12 rounded-lg object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ background: "var(--n-hover)" }}>
                    <Package size={20} style={{ color: "var(--n-muted)" }} />
                  </div>
                )}
                <div className="flex-1">
                  <p className="font-medium text-sm">{order.item_name || "Товар удалён"}</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--n-muted)" }}>
                    {formatDate(order.created_at)} · {order.quantity} шт.
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold">{order.total_price} СК</p>
                  <p className="text-xs" style={{ color: getStatusColor(order.status) }}>
                    {getStatusLabel(order.status)}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
