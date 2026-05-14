import { useState, useEffect } from "react";
import { getOrders, approveOrder, rejectOrder, getRefunds, approveRefund, rejectRefund } from "../api/shop";
import { Package, CheckCircle, XCircle, Clock, RotateCcw } from "lucide-react";

export default function ShopOrdersPage() {
  const [tab, setTab] = useState("orders");
  const [orders, setOrders] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");
  const [processing, setProcessing] = useState(null);

  useEffect(() => {
    loadData();
  }, [tab, filter]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (tab === "orders") {
        const params = filter ? { status: filter } : {};
        const res = await getOrders(params);
        setOrders(res.data);
      } else {
        const params = filter ? { status: filter } : {};
        const res = await getRefunds(params);
        setRefunds(res.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveOrder = async (order) => {
    setProcessing(order.id);
    try {
      await approveOrder(order.id);
      await loadData();
    } catch (e) {
      alert(e.response?.data?.detail || "Ошибка");
    } finally {
      setProcessing(null);
    }
  };

  const handleRejectOrder = async (order) => {
    if (!window.confirm(`Отклонить заказ? ${order.total_price} СК будут возвращены сотруднику.`)) return;
    setProcessing(order.id);
    try {
      await rejectOrder(order.id);
      await loadData();
    } catch (e) {
      alert(e.response?.data?.detail || "Ошибка");
    } finally {
      setProcessing(null);
    }
  };

  const handleApproveRefund = async (refund) => {
    if (!window.confirm(`Подтвердить возврат? ${refund.refund_amount} СК будут возвращены сотруднику, товар изъят.`)) return;
    setProcessing(refund.id);
    try {
      await approveRefund(refund.id);
      await loadData();
    } catch (e) {
      alert(e.response?.data?.detail || "Ошибка");
    } finally {
      setProcessing(null);
    }
  };

  const handleRejectRefund = async (refund) => {
    if (!window.confirm("Отклонить запрос на возврат?")) return;
    setProcessing(refund.id);
    try {
      await rejectRefund(refund.id);
      await loadData();
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
      case "completed":
      case "approved":
        return <CheckCircle size={16} color="#22c55e" />;
      case "rejected":
        return <XCircle size={16} color="#ef4444" />;
      default:
        return <Clock size={16} color="var(--n-muted)" />;
    }
  };

  const getStatusLabel = (s) => {
    switch (s) {
      case "pending": return "Ожидает";
      case "completed": return "Выполнен";
      case "approved": return "Одобрен";
      case "rejected": return "Отклонён";
      default: return s;
    }
  };

  return (
    <div className="page-shell page-stack max-w-4xl mx-auto">
      <div className="hero-banner">
        <h1 className="page-title">Управление заказами</h1>
        <p className="page-subtitle mt-1">Подтверждение и обработка заказов</p>
      </div>

      {/* Tabs: Orders / Refunds */}
      <div className="flex gap-1 p-1 rounded-lg mb-4" style={{ background: "var(--n-hover)" }}>
        <button
          onClick={() => { setTab("orders"); setFilter("pending"); }}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${tab === "orders" ? "shadow-sm" : ""}`}
          style={{
            background: tab === "orders" ? "var(--n-surface)" : "transparent",
            color: tab === "orders" ? "var(--n-text)" : "var(--n-muted)",
          }}
        >
          Заказы
        </button>
        <button
          onClick={() => { setTab("refunds"); setFilter("pending"); }}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2 ${tab === "refunds" ? "shadow-sm" : ""}`}
          style={{
            background: tab === "refunds" ? "var(--n-surface)" : "transparent",
            color: tab === "refunds" ? "var(--n-text)" : "var(--n-muted)",
          }}
        >
          <RotateCcw size={14} />
          Возвраты
        </button>
      </div>

      {/* Status filters */}
      <div className="flex gap-2 mb-6">
        {[
          { value: "pending", label: "Ожидают" },
          { value: tab === "orders" ? "completed" : "approved", label: tab === "orders" ? "Выполнены" : "Одобрены" },
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
      ) : tab === "orders" ? (
        /* Orders list */
        orders.length === 0 ? (
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
                      onClick={() => handleApproveOrder(order)}
                      disabled={processing === order.id}
                      className="px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                      style={{ background: "#22c55e20", color: "#22c55e" }}
                    >
                      Подтвердить
                    </button>
                    <button
                      onClick={() => handleRejectOrder(order)}
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
        )
      ) : (
        /* Refunds list */
        refunds.length === 0 ? (
          <div className="text-center py-12" style={{ color: "var(--n-muted)" }}>
            <RotateCcw size={48} className="mx-auto mb-3 opacity-50" style={{ color: "var(--n-muted)" }} />
            <p style={{ color: "var(--n-muted)" }}>Нет запросов на возврат</p>
          </div>
        ) : (
          <div className="space-y-3">
            {refunds.map((refund) => (
              <div
                key={refund.id}
                className="flex items-center gap-4 p-4 rounded-xl border"
                style={{ background: "var(--n-surface)", borderColor: "var(--n-border)" }}
              >
                {refund.item_photo_url ? (
                  <img src={refund.item_photo_url} alt="" className="w-14 h-14 rounded-lg object-cover" />
                ) : (
                  <div className="w-14 h-14 rounded-lg flex items-center justify-center" style={{ background: "var(--n-hover)" }}>
                    <RotateCcw size={22} style={{ color: "var(--n-muted)" }} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{refund.employee_name}</span>
                    {getStatusIcon(refund.status)}
                  </div>
                  <p className="text-sm" style={{ color: "var(--n-muted)" }}>
                    {refund.item_name || "Товар удалён"} · Возврат: {refund.refund_amount} СК
                  </p>
                  {refund.reason && (
                    <p className="text-xs mt-0.5" style={{ color: "var(--n-muted)" }}>
                      Причина: {refund.reason}
                    </p>
                  )}
                  <p className="text-xs mt-0.5" style={{ color: "var(--n-muted)" }}>
                    {formatDate(refund.created_at)}
                    {refund.reviewed_by_name && ` · Обработал: ${refund.reviewed_by_name}`}
                  </p>
                </div>
                {refund.status === "pending" && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApproveRefund(refund)}
                      disabled={processing === refund.id}
                      className="px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                      style={{ background: "#22c55e20", color: "#22c55e" }}
                    >
                      Одобрить
                    </button>
                    <button
                      onClick={() => handleRejectRefund(refund)}
                      disabled={processing === refund.id}
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
        )
      )}
    </div>
  );
}
