import { useState, useEffect } from "react";
import { useAuth, hasPermission } from "../context/AuthContext";
import { useSearchParams } from "react-router-dom";
import { accrueCoins, bulkAccrueCoins, getTransactions } from "../api/shop";
import { getEmployees } from "../api/org";
import {
  getFlaggedOperations, getFlaggedOperation, reviewFlaggedOperation,
  getFlaggedAuditLog, getAMLStats, getAMLAuditLog,
  getAMLSettings, updateAMLSettings, getAMLRules, updateAMLRule,
} from "../api/aml";
import useAMLNotifications from "../hooks/useAMLNotifications";
import {
  Coins, Plus,
  Shield, AlertTriangle, CheckCircle, XCircle, Clock,
  Eye, ChevronDown, ChevronRight, Settings, FileText, X,
} from "lucide-react";

const OP_TYPE_LABELS = {
  accrual: "Начисление",
  bulk_accrual: "Массовое начисление",
  purchase: "Покупка",
  order_approve: "Одобрение заказа",
  order_reject: "Отклонение заказа",
  refund_create: "Запрос возврата",
  refund_approve: "Одобрение возврата",
  auto_rule_change: "Изм. автоправила",
  item_price_change: "Изм. цены",
  item_stock_change: "Изм. стока",
};

const STATUS_CONFIG = {
  pending: { label: "Ожидает решения", color: "#f59e0b", bg: "#f59e0b20", icon: Clock },
  approved: { label: "Одобрена", color: "#22c55e", bg: "#22c55e20", icon: CheckCircle },
  rejected: { label: "Отклонена", color: "#ef4444", bg: "#ef444420", icon: XCircle },
};

const CATEGORY_LABELS = {
  A: "Конфликт интересов",
  B: "Статистические аномалии",
  C: "Манипуляция каталогом",
  D: "Процессные аномалии",
  E: "Неактивные аккаунты",
  F: "Автоначисление",
};

function formatDate(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleString("ru-RU", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function RiskBadge({ score }) {
  let color = "#22c55e";
  if (score >= 70) color = "#ef4444";
  else if (score >= 40) color = "#f59e0b";
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold"
      style={{ background: `${color}20`, color }}
    >
      {score.toFixed(0)}
    </span>
  );
}

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      <Icon size={12} />
      {cfg.label}
    </span>
  );
}

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex justify-between items-start text-sm">
      <span style={{ color: "var(--n-muted)" }}>{label}</span>
      <span className="font-medium text-right max-w-[60%]">{value}</span>
    </div>
  );
}

function DetailModal({ item, onClose, onReview }) {
  const [audit, setAudit] = useState([]);
  const [comment, setComment] = useState("");
  const [processing, setProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState("details");

  useEffect(() => {
    if (item) {
      getFlaggedAuditLog(item.id).then((r) => setAudit(r.data)).catch(() => {});
    }
  }, [item]);

  if (!item) return null;

  const canReview = item.status === "pending";

  const handleReview = async (status) => {
    setProcessing(true);
    try {
      await reviewFlaggedOperation(item.id, { status, comment });
      onReview();
    } catch (e) {
      alert(e.response?.data?.detail || "Ошибка");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl p-6"
        style={{ background: "var(--n-panel)", border: "1px solid var(--n-border)" }}
      >
        <button onClick={onClose} className="absolute top-4 right-4 btn-ghost p-2 rounded-lg">
          <X size={18} />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <Shield size={24} style={{ color: "var(--n-accent)" }} />
          <div>
            <h2 className="text-lg font-bold">{OP_TYPE_LABELS[item.operation_type] || item.operation_type}</h2>
            <p className="text-xs" style={{ color: "var(--n-muted)" }}>#{item.id} - {formatDate(item.created_at)}</p>
          </div>
          <div className="ml-auto flex gap-2">
            <RiskBadge score={item.risk_score} />
            <StatusBadge status={item.status} />
          </div>
        </div>

        <div className="flex gap-1 p-1 rounded-lg mb-4" style={{ background: "var(--n-hover)" }}>
          {[
            { key: "details", label: "Детали" },
            { key: "rules", label: `Правила (${item.triggered_rules?.length || 0})` },
            { key: "audit", label: "Журнал" },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className="flex-1 py-1.5 px-3 rounded-md text-sm font-medium transition-colors"
              style={{
                background: activeTab === t.key ? "var(--n-surface)" : "transparent",
                color: activeTab === t.key ? "var(--n-text)" : "var(--n-muted)",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === "details" && (
          <div className="space-y-3">
            <InfoRow label="Инициатор" value={item.initiated_by_name} />
            <InfoRow label="Сотрудник" value={item.target_employee_name} />
            {item.payload?.amount != null && <InfoRow label="Сумма" value={`${item.payload.amount} CK`} />}
            {item.payload?.comment && <InfoRow label="Комментарий" value={item.payload.comment} />}
            {item.payload?.total_price != null && <InfoRow label="Стоимость" value={`${item.payload.total_price} CK`} />}
            {item.payload?.employee_count != null && <InfoRow label="Кол-во сотрудников" value={item.payload.employee_count} />}
            {item.reviewed_by_name && (
              <>
                <InfoRow label="Рассмотрел" value={item.reviewed_by_name} />
                <InfoRow label="Дата рассмотрения" value={formatDate(item.reviewed_at)} />
                {item.review_comment && <InfoRow label="Комментарий" value={item.review_comment} />}
              </>
            )}
          </div>
        )}

        {activeTab === "rules" && (
          <div className="space-y-2">
            {(item.triggered_rules || []).map((rule, i) => (
              <div
                key={i}
                className="p-3 rounded-lg border"
                style={{ borderColor: "var(--n-border)", background: "var(--n-surface)" }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-sm">
                    [{rule.rule_code}] {rule.name}
                  </span>
                  <span className="text-xs font-bold" style={{ color: "#f59e0b" }}>
                    +{rule.weight.toFixed(0)} pts
                  </span>
                </div>
                {rule.details?.reason && (
                  <p className="text-xs" style={{ color: "var(--n-muted)" }}>{rule.details.reason}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === "audit" && (
          <div className="space-y-2">
            {audit.length === 0 ? (
              <p className="text-center py-4 text-sm" style={{ color: "var(--n-muted)" }}>Нет записей</p>
            ) : audit.map((log) => (
              <div
                key={log.id}
                className="flex items-center gap-3 p-2 rounded-lg text-sm"
                style={{ background: "var(--n-surface)" }}
              >
                <Eye size={14} style={{ color: "var(--n-muted)" }} />
                <div className="flex-1">
                  <span className="font-medium">{log.actor_name}</span>
                  <span style={{ color: "var(--n-muted)" }}> - {log.action_display}</span>
                </div>
                <span className="text-xs" style={{ color: "var(--n-muted)" }}>
                  {formatDate(log.timestamp)}
                </span>
                {log.ip_address && (
                  <span className="text-xs" style={{ color: "var(--n-muted)" }}>
                    {log.ip_address}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {canReview && (
          <div className="mt-6 pt-4" style={{ borderTop: "1px solid var(--n-border)" }}>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Комментарий (необязательно)"
              className="w-full p-3 rounded-lg text-sm mb-3"
              style={{ background: "var(--n-surface)", border: "1px solid var(--n-border)", color: "var(--n-text)" }}
              rows={2}
            />
            <div className="flex gap-2">
              <button
                onClick={() => handleReview("approved")}
                disabled={processing}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
                style={{ background: "#22c55e20", color: "#22c55e" }}
              >
                Одобрить операцию
              </button>
              <button
                onClick={() => handleReview("rejected")}
                disabled={processing}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
                style={{ background: "#ef444420", color: "#ef4444" }}
              >
                Отклонить операцию
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AMLSettingsPanel() {
  const [settings, setSettings] = useState(null);
  const [rules, setRules] = useState([]);
  const [saving, setSaving] = useState(false);
  const [expandedCat, setExpandedCat] = useState(null);

  useEffect(() => {
    getAMLSettings().then((r) => setSettings(r.data));
    getAMLRules().then((r) => setRules(r.data));
  }, []);

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const res = await updateAMLSettings(settings);
      setSettings(res.data);
    } catch (e) {
      alert(e.response?.data?.detail || "Ошибка");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleRule = async (rule) => {
    try {
      const res = await updateAMLRule(rule.id, { is_enabled: !rule.is_enabled });
      setRules((prev) => prev.map((r) => (r.id === rule.id ? res.data : r)));
    } catch (e) {
      alert(e.response?.data?.detail || "Ошибка");
    }
  };

  const handleWeightChange = async (rule, weight) => {
    try {
      const res = await updateAMLRule(rule.id, { weight: parseFloat(weight) });
      setRules((prev) => prev.map((r) => (r.id === rule.id ? res.data : r)));
    } catch { /* ignore */ }
  };

  if (!settings) return <div className="text-center py-8" style={{ color: "var(--n-muted)" }}>Загрузка...</div>;

  const grouped = {};
  rules.forEach((r) => {
    if (!grouped[r.category]) grouped[r.category] = [];
    grouped[r.category].push(r);
  });

  return (
    <div className="space-y-6">
      <div
        className="p-4 rounded-xl border"
        style={{ background: "var(--n-surface)", borderColor: "var(--n-border)" }}
      >
        <h3 className="font-semibold mb-4">Основные настройки</h3>
        <div className="space-y-3">
          <label className="flex items-center justify-between">
            <span className="text-sm">AML мониторинг включён</span>
            <input
              type="checkbox"
              checked={settings.is_enabled}
              onChange={(e) => setSettings({ ...settings, is_enabled: e.target.checked })}
              className="accent-[var(--n-accent)]"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs" style={{ color: "var(--n-muted)" }}>Порог блокировки (risk_score)</label>
              <input
                type="number"
                value={settings.threshold}
                onChange={(e) => setSettings({ ...settings, threshold: parseFloat(e.target.value) || 0 })}
                className="w-full mt-1 p-2 rounded-lg text-sm"
                style={{ background: "var(--n-panel)", border: "1px solid var(--n-border)", color: "var(--n-text)" }}
              />
              <p className="text-xs mt-1" style={{ color: "var(--n-muted)" }}>
                Операция блокируется при risk_score &ge; порога
              </p>
            </div>
            <div>
              <label className="text-xs" style={{ color: "var(--n-muted)" }}>Окно анализа (дни)</label>
              <input
                type="number"
                value={settings.lookback_days}
                onChange={(e) => setSettings({ ...settings, lookback_days: parseInt(e.target.value) || 30 })}
                className="w-full mt-1 p-2 rounded-lg text-sm"
                style={{ background: "var(--n-panel)", border: "1px solid var(--n-border)", color: "var(--n-text)" }}
              />
            </div>
          </div>
          <button
            onClick={handleSaveSettings}
            disabled={saving}
            className="w-full py-2 rounded-lg text-sm font-medium btn-primary disabled:opacity-50"
          >
            {saving ? "Сохранение..." : "Сохранить настройки"}
          </button>
        </div>
      </div>

      <div>
        <h3 className="font-semibold mb-3">Правила</h3>
        <div className="space-y-2">
          {Object.entries(grouped).map(([cat, catRules]) => (
            <div
              key={cat}
              className="rounded-xl border overflow-hidden"
              style={{ borderColor: "var(--n-border)" }}
            >
              <button
                onClick={() => setExpandedCat(expandedCat === cat ? null : cat)}
                className="w-full flex items-center justify-between p-3 text-sm font-medium btn-ghost"
              >
                <span>{cat}. {CATEGORY_LABELS[cat] || cat}</span>
                {expandedCat === cat ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              {expandedCat === cat && (
                <div className="px-3 pb-3 space-y-2">
                  {catRules.map((rule) => (
                    <div
                      key={rule.id}
                      className="flex items-center gap-3 p-2 rounded-lg"
                      style={{ background: "var(--n-surface)" }}
                    >
                      <input
                        type="checkbox"
                        checked={rule.is_enabled}
                        onChange={() => handleToggleRule(rule)}
                        className="accent-[var(--n-accent)]"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">[{rule.rule_code}] {rule.name}</p>
                        <p className="text-xs" style={{ color: "var(--n-muted)" }}>{rule.description}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <label className="text-xs" style={{ color: "var(--n-muted)" }}>Вес:</label>
                        <input
                          type="number"
                          value={rule.weight}
                          onChange={(e) => handleWeightChange(rule, e.target.value)}
                          className="w-16 p-1 rounded text-xs text-center"
                          style={{ background: "var(--n-panel)", border: "1px solid var(--n-border)", color: "var(--n-text)" }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AMLAuditLogTab() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getAMLAuditLog({}).then((r) => setLogs(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-8" style={{ color: "var(--n-muted)" }}>Загрузка...</div>;

  if (logs.length === 0) {
    return (
      <div className="text-center py-12" style={{ color: "var(--n-muted)" }}>
        <FileText size={48} className="mx-auto mb-3 opacity-50" />
        <p>Журнал пуст</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {logs.map((log) => (
        <div
          key={log.id}
          className="flex items-center gap-3 p-3 rounded-lg border"
          style={{ background: "var(--n-surface)", borderColor: "var(--n-border)" }}
        >
          <Eye size={16} style={{ color: "var(--n-muted)" }} />
          <div className="flex-1 min-w-0">
            <p className="text-sm">
              <span className="font-medium">{log.actor_name}</span>
              <span style={{ color: "var(--n-muted)" }}> - {log.action_display}</span>
            </p>
            {log.details?.comment && (
              <p className="text-xs mt-0.5" style={{ color: "var(--n-muted)" }}>{log.details.comment}</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs" style={{ color: "var(--n-muted)" }}>{formatDate(log.timestamp)}</p>
            {log.ip_address && <p className="text-xs" style={{ color: "var(--n-muted)" }}>{log.ip_address}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ShopCoinsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "accrual";
  const { refresh: refreshNotifications } = useAMLNotifications();

  const canReviewFlagged = hasPermission(user, "shop.review_flagged");
  const canManageAMLSettings = hasPermission(user, "shop.aml_settings");

  const [transactions, setTransactions] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAccrue, setShowAccrue] = useState(false);
  const [accrueMode, setAccrueMode] = useState("single");
  const [selectedEmployees, setSelectedEmployees] = useState([]);
  const [amount, setAmount] = useState("");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  const [amlOperations, setAmlOperations] = useState([]);
  const [amlStats, setAmlStats] = useState({});
  const [amlFilter, setAmlFilter] = useState("pending");
  const [amlLoading, setAmlLoading] = useState(true);
  const [amlSubTab, setAmlSubTab] = useState("flagged");
  const [selectedDetail, setSelectedDetail] = useState(null);

  useEffect(() => {
    if (activeTab === "accrual") loadCoinsData();
    if (activeTab === "aml") loadAMLData();
  }, [activeTab, amlFilter]);

  const setTab = (tab) => setSearchParams({ tab });

  const loadCoinsData = async () => {
    setLoading(true);
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

  const loadAMLData = async () => {
    setAmlLoading(true);
    try {
      const params = amlFilter ? { status: amlFilter } : {};
      const [opsRes, statsRes] = await Promise.all([
        getFlaggedOperations(params),
        getAMLStats(),
      ]);
      setAmlOperations(opsRes.data);
      setAmlStats(statsRes.data);
    } catch (e) {
      console.error(e);
    } finally {
      setAmlLoading(false);
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
      await loadCoinsData();
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

  const getTypeLabel = (type) => {
    switch (type) {
      case "accrual": return "Начисление";
      case "purchase": return "Покупка";
      case "refund": return "Возврат";
      default: return type;
    }
  };

  const openDetail = async (op) => {
    try {
      const res = await getFlaggedOperation(op.id);
      setSelectedDetail(res.data);
    } catch { /* ignore */ }
  };

  const handleReviewDone = () => {
    setSelectedDetail(null);
    loadAMLData();
    refreshNotifications();
  };

  const amlSubTabs = [
    { key: "flagged", label: "Операции", icon: AlertTriangle },
    { key: "audit", label: "Журнал", icon: FileText },
  ];
  if (canManageAMLSettings) amlSubTabs.push({ key: "settings", label: "Настройки", icon: Settings });

  return (
    <div className="page-shell page-stack max-w-4xl mx-auto">
      <div className="hero-banner">
        <h1 className="page-title">Управление коинами</h1>
        <p className="page-subtitle mt-1">
          {activeTab === "accrual"
            ? "Начисление и история баллов"
            : "Контроль подозрительных операций"}
        </p>
      </div>

      <div className="flex gap-1 p-1 rounded-lg self-start" style={{ background: "var(--n-hover)" }}>
        <button
          onClick={() => setTab("accrual")}
          className="px-4 py-2 rounded-md text-sm font-medium transition-colors"
          style={{
            background: activeTab === "accrual" ? "var(--n-surface)" : "transparent",
            color: activeTab === "accrual" ? "var(--n-fg)" : "var(--n-muted)",
            boxShadow: activeTab === "accrual" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
          }}
        >
          Начисление
        </button>
        {canReviewFlagged && (
          <button
            onClick={() => setTab("aml")}
            className="px-4 py-2 rounded-md text-sm font-medium transition-colors"
            style={{
              background: activeTab === "aml" ? "var(--n-surface)" : "transparent",
              color: activeTab === "aml" ? "var(--n-fg)" : "var(--n-muted)",
              boxShadow: activeTab === "aml" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            }}
          >
            Подозрительные операции
          </button>
        )}
      </div>

      {activeTab === "accrual" && (
        <>
          <div className="flex items-center justify-end">
            <button
              onClick={() => setShowAccrue(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg btn-primary text-sm"
            >
              <Plus size={16} />
              Начислить
            </button>
          </div>

          {showAccrue && (
            <div className="p-5 rounded-xl border" style={{ background: "var(--n-surface)", borderColor: "var(--n-border)" }}>
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
          {loading ? (
            <div className="text-center py-8" style={{ color: "var(--n-muted)" }}>Загрузка...</div>
          ) : (
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
          )}
        </>
      )}

      {activeTab === "aml" && canReviewFlagged && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Ожидает решения", value: amlStats.pending || 0, color: "#f59e0b" },
              { label: "Одобрено", value: amlStats.approved || 0, color: "#22c55e" },
              { label: "Отклонено", value: amlStats.rejected || 0, color: "#ef4444" },
            ].map((s) => (
              <div
                key={s.label}
                className="p-3 rounded-xl border text-center"
                style={{ background: "var(--n-surface)", borderColor: "var(--n-border)" }}
              >
                <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
                <p className="text-xs" style={{ color: "var(--n-muted)" }}>{s.label}</p>
              </div>
            ))}
          </div>

          <div className="flex gap-1 p-1 rounded-lg" style={{ background: "var(--n-hover)" }}>
            {amlSubTabs.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  onClick={() => setAmlSubTab(t.key)}
                  className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2 ${amlSubTab === t.key ? "shadow-sm" : ""}`}
                  style={{
                    background: amlSubTab === t.key ? "var(--n-surface)" : "transparent",
                    color: amlSubTab === t.key ? "var(--n-text)" : "var(--n-muted)",
                  }}
                >
                  <Icon size={14} />
                  {t.label}
                </button>
              );
            })}
          </div>

          {amlSubTab === "flagged" && (
            <>
              <div className="flex gap-2 flex-wrap">
                {[
                  { value: "pending", label: "Ожидает решения" },
                  { value: "approved", label: "Одобрено" },
                  { value: "rejected", label: "Отклонено" },
                  { value: "", label: "Все" },
                ].map((f) => (
                  <button
                    key={f.value}
                    onClick={() => setAmlFilter(f.value)}
                    className={`px-3 py-1.5 rounded-lg text-sm ${amlFilter === f.value ? "btn-primary" : "btn-ghost"}`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {amlLoading ? (
                <div className="text-center py-8" style={{ color: "var(--n-muted)" }}>Загрузка...</div>
              ) : amlOperations.length === 0 ? (
                <div className="text-center py-12" style={{ color: "var(--n-muted)" }}>
                  <Shield size={48} className="mx-auto mb-3 opacity-50" />
                  <p>Нет подозрительных операций</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {amlOperations.map((op) => (
                    <button
                      key={op.id}
                      onClick={() => openDetail(op)}
                      className="w-full flex items-center gap-4 p-4 rounded-xl border text-left transition-colors hover:opacity-90"
                      style={{ background: "var(--n-surface)", borderColor: "var(--n-border)" }}
                    >
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: "var(--n-hover)" }}
                      >
                        <AlertTriangle size={18} style={{ color: op.risk_score >= 70 ? "#ef4444" : "#f59e0b" }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-semibold text-sm">
                            {OP_TYPE_LABELS[op.operation_type] || op.operation_type}
                          </span>
                          <RiskBadge score={op.risk_score} />
                          <StatusBadge status={op.status} />
                        </div>
                        <p className="text-xs" style={{ color: "var(--n-muted)" }}>
                          {op.initiated_by_name || "Неизвестно"}
                          {op.target_employee_name && ` → ${op.target_employee_name}`}
                          {` · ${op.rules_count} правил(о)`}
                        </p>
                      </div>
                      <span className="text-xs shrink-0" style={{ color: "var(--n-muted)" }}>
                        {formatDate(op.created_at)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {amlSubTab === "audit" && <AMLAuditLogTab />}
          {amlSubTab === "settings" && <AMLSettingsPanel />}

          {selectedDetail && (
            <DetailModal
              item={selectedDetail}
              onClose={() => setSelectedDetail(null)}
              onReview={handleReviewDone}
            />
          )}
        </>
      )}
    </div>
  );
}
