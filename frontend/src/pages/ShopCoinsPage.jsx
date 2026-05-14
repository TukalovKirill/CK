import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { accrueCoins, bulkAccrueCoins, getTransactions } from "../api/shop";
import { getEmployees } from "../api/org";
import { Coins, Plus, Users, Search } from "lucide-react";

export default function ShopCoinsPage() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAccrue, setShowAccrue] = useState(false);
  const [accrueMode, setAccrueMode] = useState("single");
  const [selectedEmployees, setSelectedEmployees] = useState([]);
  const [amount, setAmount] = useState("");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [filterEmployee, setFilterEmployee] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [txRes, empRes] = await Promise.all([
        getTransactions(),
        getEmployees(),
      ]);
      setTransactions(txRes.data);
      setEmployees(empRes.data?.results || empRes.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleAccrue = async () => {
    if (!amount || selectedEmployees.length === 0) return;
    setSaving(true);
    try {
      if (accrueMode === "single" || selectedEmployees.length === 1) {
        await accrueCoins({
          employee_id: selectedEmployees[0],
          amount: parseInt(amount),
          comment,
        });
      } else {
        await bulkAccrueCoins({
          employee_ids: selectedEmployees,
          amount: parseInt(amount),
          comment,
        });
      }
      setShowAccrue(false);
      setSelectedEmployees([]);
      setAmount("");
      setComment("");
      await loadData();
    } catch (e) {
      const detail = e.response?.data?.detail || "Ошибка при начислении";
      alert(detail);
    } finally {
      setSaving(false);
    }
  };

  const toggleEmployee = (id) => {
    setSelectedEmployees((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]
    );
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

  if (loading) {
    return <div className="p-6 text-center" style={{ color: "var(--n-muted)" }}>Загрузка...</div>;
  }

  return (
    <div className="page-shell page-stack max-w-4xl mx-auto">
      <div className="hero-banner">
        <h1 className="page-title">Управление коинами</h1>
        <p className="page-subtitle mt-1">Начисление и история баллов</p>
      </div>
      <div className="flex items-center justify-end mb-6">
        <button
          onClick={() => setShowAccrue(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg btn-primary text-sm"
        >
          <Plus size={16} />
          Начислить
        </button>
      </div>

      {showAccrue && (
        <div className="mb-6 p-5 rounded-xl border" style={{ background: "var(--n-surface)", borderColor: "var(--n-border)" }}>
          <h3 className="font-semibold mb-4">Начисление СК коинов</h3>

          <div className="flex gap-2 mb-4">
            <button
              onClick={() => { setAccrueMode("single"); setSelectedEmployees([]); }}
              className={`px-3 py-1.5 rounded-lg text-sm ${accrueMode === "single" ? "btn-primary" : "btn-ghost"}`}
            >
              Одному
            </button>
            <button
              onClick={() => { setAccrueMode("bulk"); setSelectedEmployees([]); }}
              className={`px-3 py-1.5 rounded-lg text-sm ${accrueMode === "bulk" ? "btn-primary" : "btn-ghost"}`}
            >
              Группе
            </button>
          </div>

          <div className="mb-3">
            <label className="block text-sm mb-1">Сотрудник(и) *</label>
            <div className="max-h-40 overflow-y-auto rounded-lg border p-2 space-y-1" style={{ borderColor: "var(--n-border)" }}>
              {employees.map((emp) => (
                <label key={emp.id} className="flex items-center gap-2 px-2 py-1 rounded hover:opacity-80 cursor-pointer">
                  <input
                    type={accrueMode === "single" ? "radio" : "checkbox"}
                    name="employee"
                    checked={selectedEmployees.includes(emp.id)}
                    onChange={() => {
                      if (accrueMode === "single") {
                        setSelectedEmployees([emp.id]);
                      } else {
                        toggleEmployee(emp.id);
                      }
                    }}
                  />
                  <span className="text-sm">{emp.full_name || emp.email || `#${emp.id}`}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-sm mb-1">Сумма *</label>
              <input
                type="number"
                min="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm"
                style={{ background: "var(--n-bg)", borderColor: "var(--n-border)" }}
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Комментарий</label>
              <input
                type="text"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm"
                style={{ background: "var(--n-bg)", borderColor: "var(--n-border)" }}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleAccrue}
              disabled={saving || !amount || selectedEmployees.length === 0}
              className="px-4 py-2 rounded-lg btn-primary text-sm disabled:opacity-50"
            >
              {saving ? "Начисление..." : "Начислить"}
            </button>
            <button
              onClick={() => setShowAccrue(false)}
              className="px-4 py-2 rounded-lg btn-ghost text-sm"
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      <h2 className="text-lg font-semibold mb-3">История транзакций</h2>
      <div className="space-y-2">
        {transactions.length === 0 ? (
          <div className="text-center py-8" style={{ color: "var(--n-muted)" }}>
            <Coins size={48} className="mx-auto mb-3 opacity-50" />
            <p>Транзакций пока нет</p>
          </div>
        ) : (
          transactions.map((tx) => (
            <div
              key={tx.id}
              className="flex items-center justify-between p-4 rounded-lg border"
              style={{ background: "var(--n-surface)", borderColor: "var(--n-border)" }}
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{tx.employee_name}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--n-hover)", color: "var(--n-muted)" }}>
                    {getTypeLabel(tx.transaction_type)}
                  </span>
                </div>
                {tx.comment && (
                  <p className="text-xs mt-0.5" style={{ color: "var(--n-muted)" }}>{tx.comment}</p>
                )}
                <p className="text-xs mt-0.5" style={{ color: "var(--n-muted)" }}>
                  {formatDate(tx.created_at)}
                  {tx.created_by_name && ` · ${tx.created_by_name}`}
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
    </div>
  );
}
