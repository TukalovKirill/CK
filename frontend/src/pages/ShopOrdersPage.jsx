import { useState, useEffect } from "react";
import { getOrders, approveOrder, rejectOrder } from "../api/shop";
import { Package, CheckCircle, XCircle, Clock } from "lucide-react";

export default function ShopOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");
  const [processing, setProcessing] = useState(null);

  useEffect(() => {
    loadOrders();
  }, [filter]);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const params = filter ? { status: filter } : {};
      const res = await getOrders(params);
      setOrders(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (order) => {
    setProcessing(order.id);
    try {
      await approveOrder(order.id);
      await loadOrders();
    } catch (e) {
      alert(e.response?.data?.detail || "Ошибка");
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (order) => {
    if (!window.confirm(`Отклонить заказ? ${order.total_price} СК будут возвращены сотруднику.`)) return;
    setProcessing(order.id);
    try {
      await rejectOrder(order.id);
      await loadOrders();
    } catch (e) {
      alert(e.response?.data?.detail || "Ошибка");
    } finally {
      setProcessing(null);
    }
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleString("ru-RU", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  };

  const getStatusIcon = (s) => {
    switch (s) {
      case "completed": return <CheckCircle size={16} color="#22c55e" />;
      case "rejected": return <XCircle size={16} color="#ef4444" />;
      default: return <Clock size={16} color="var(--n-muted)" />;
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

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Управление заказами</h1>

      <div className="flex gap-2 mb-6">
        {[
          { value: "pending", label: "Ожидают" },
          { value: "completed", label: "Выполнены" },
          { value: "rejected", label: "Отклонены" },
          { value: "", label: "Все" },
        ].map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 rounded-lg text-sm ${filter === f.value ? "btn-primary" : "btn-ghost"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-8" style={{ color: "var(--n-muted)" }}>Загрузка...</div>
      ) : orders.length === 0 ? (
        <div className="text-center py-12" style={{ color: "var(--n-muted)" }}>
          <Package size={48} className="mx-auto mb-3 opacity-50" />
          <p>Нет заказов</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <div
              key={order.id}
              className="flex items-center gap-4 p-4 rounded-xl border"
              style={{ background: "var(--n-surface)", borderColor: "var(--n-border)" }}
            >
              {order.item_photo_url ? (
                <img src={order.item_photo_url} alt="" className="w-14 h-14 rounded-lg object-cover" />
              ) : (
                <div className="w-14 h-14 rounded-lg flex items-center justify-center" style={{ background: "var(--n-hover)" }}>
                  <Package size={22} style={{ color: "var(--n-muted)" }} />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{order.employee_name}</span>
                  {getStatusIcon(order.status)}
                </div>
                <p className="text-sm" style={{ color: "var(--n-muted)" }}>
                  {order.item_name || "Товар удалён"} · {order.quantity} шт. · {order.total_price} СК
                </p>
                <p className="text-xs" style={{ color: "var(--n-muted)" }}>
                  {formatDate(order.created_at)}
                  {order.reviewed_by_name && ` · Обработал: ${order.reviewed_by_name}`}
                </p>
              </div>
              {order.status === "pending" && (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApprove(order)}
                    disabled={processing === order.id}
                    className="px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                    style={{ background: "#22c55e20", color: "#22c55e" }}
                  >
                    Подтвердить
                  </button>
                  <button
                    onClick={() => handleReject(order)}
                    disabled={processing === order.id}
                    className="px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                    style={{ background: "#ef444420", color: "#ef4444" }}
                  >
                    Отклонить
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
