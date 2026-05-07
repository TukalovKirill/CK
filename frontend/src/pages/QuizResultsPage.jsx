import { useState, useEffect, useCallback } from "react";
import { getQuizResults, getAttemptReview, getTemplates } from "../api/quizzes";
import { getUnits, getDepartments, getOrgRoles } from "../api/org";
import Dropdown from "../components/Dropdown";
import { useAuth } from "../context/AuthContext";
import {
  BarChart3,
  Eye,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import toast from "react-hot-toast";

/* ── Helpers ────────────────────────────────────────────────────── */

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMs(ms) {
  if (!ms && ms !== 0) return "—";
  if (ms < 1000) return `${ms} мс`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} с`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m} мин ${rem} с` : `${m} мин`;
}

function formatDuration(startIso, endIso) {
  if (!startIso || !endIso) return "—";
  const ms = new Date(endIso) - new Date(startIso);
  return formatMs(ms);
}

function statusBadgeClass(status) {
  switch (status) {
    case "passed":
    case "passed_with_flags":
      return "badge-success";
    case "completed":
    case "terminated_for_violation":
      return "badge-danger";
    case "suspicious_attempt":
      return "badge-bronze";
    case "in_progress":
      return "badge-bronze";
    case "expired":
      return "badge-muted";
    default:
      return "badge-muted";
  }
}

function statusLabel(status) {
  switch (status) {
    case "passed":
      return "Пройден";
    case "completed":
      return "Не пройден";
    case "terminated_for_violation":
      return "Прекращён";
    case "passed_with_flags":
      return "С замечаниями";
    case "suspicious_attempt":
      return "Подозрительный";
    case "in_progress":
      return "В процессе";
    case "expired":
      return "Истёк";
    default:
      return status || "—";
  }
}

function StatusIcon({ status, className = "h-4 w-4" }) {
  switch (status) {
    case "passed":
    case "passed_with_flags":
      return <CheckCircle2 className={`${className} text-green-500 dark:text-[#8fd1b0]`} />;
    case "completed":
    case "terminated_for_violation":
      return <XCircle className={`${className} text-red-500 dark:text-[#e6b0ab]`} />;
    case "suspicious_attempt":
      return <AlertTriangle className={`${className} text-amber-500 dark:text-[#d9bc8d]`} />;
    default:
      return <Clock className={`${className} text-gray-400 dark:text-n-dim`} />;
  }
}

function ScorePill({ pct }) {
  if (pct == null) return <span className="text-gray-400 dark:text-n-dim">—</span>;
  const color =
    pct >= 80
      ? "text-green-600 dark:text-[#8fd1b0]"
      : pct >= 60
      ? "text-amber-600 dark:text-[#d9bc8d]"
      : "text-red-600 dark:text-[#e6b0ab]";
  return <span className={`font-semibold tabular-nums ${color}`}>{pct.toFixed(0)}%</span>;
}

/* ── Violation event type labels ─────────────────────────────────── */
const VIOLATION_LABELS = {
  tab_hidden: "Свернул вкладку",
  tab_visible_return: "Вернулся на вкладку",
  window_blur: "Переключился на другое окно",
  window_focus: "Вернулся в окно браузера",
  copy: "Копирование",
  paste: "Вставка",
  right_click: "Правая кнопка мыши",
  devtools: "Открытие DevTools",
  fullscreen_exit: "Выход из полноэкрана",
  other: "Другое",
};

function violationLabel(type) {
  return VIOLATION_LABELS[type] || type;
}

/* ── Answer Card ─────────────────────────────────────────────────── */

function AnswerCard({ ans, idx }) {
  const [open, setOpen] = useState(false);
  const selectedSet = new Set(ans.selected_options ?? []);
  const options = ans.options ?? [];

  return (
    <div
      className={`rounded-xl border transition-colors ${
        ans.is_correct
          ? "border-[#28503A] bg-[#18261E]"
          : "border-[#4A2A2A] bg-[#24191B]"
      }`}
    >
      <div
        className="flex items-start gap-3 px-4 py-3 cursor-pointer"
        onClick={() => setOpen(!open)}
      >
        <div className="mt-0.5 shrink-0">
          {ans.is_correct ? (
            <CheckCircle2 className="h-4 w-4 text-[#9ED5B3]" />
          ) : (
            <XCircle className="h-4 w-4 text-[#E6B0AB]" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-5 text-n-fg">
            <span className="mr-1.5 text-xs text-n-dim">#{idx + 1}</span>
            {ans.question_text}
          </p>
          {ans.timed_out ? (
            <p className="mt-1 text-xs text-[#E6B0AB]">Время вышло</p>
          ) : selectedSet.size > 0 && options.length > 0 ? (
            <p className="mt-1 text-xs text-n-muted">
              Выбрано:{" "}
              <span className="font-medium text-n-fg">
                {options
                  .map((o, i) => (selectedSet.has(o.id) ? i + 1 : null))
                  .filter(Boolean)
                  .map((n) => `вариант ${n}`)
                  .join(", ")}
              </span>
            </p>
          ) : null}
          <div className="mt-1.5 flex flex-wrap gap-3">
            <span className="text-xs text-n-dim">
              <Clock className="mr-0.5 inline h-3 w-3" />
              {formatMs(ans.time_spent_ms)}
            </span>
            {ans.answered_at && (
              <span className="text-xs text-n-dim">
                {formatDate(ans.answered_at)}
              </span>
            )}
          </div>
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 text-n-dim transition-transform duration-200 mt-0.5 ${open ? "rotate-180" : ""}`} />
      </div>

      {open && options.length > 0 && (
        <div className="border-t border-[var(--ui-border-soft)] px-4 py-3 space-y-1.5">
          {options.map((opt, oi) => {
            const selected = selectedSet.has(opt.id);
            const isCorrectOpt = opt.is_correct;
            let optClass = "text-n-dim";
            if (selected && isCorrectOpt) optClass = "text-[#9ED5B3]";
            else if (selected && !isCorrectOpt) optClass = "text-[#E6B0AB]";
            else if (isCorrectOpt) optClass = "text-[#9ED5B3] opacity-60";

            return (
              <div key={opt.id} className={`flex items-start gap-2 text-sm ${optClass}`}>
                <span className="shrink-0 w-5 text-right text-xs mt-0.5 opacity-60">{oi + 1}.</span>
                <span className="flex-1">{opt.text}</span>
                <div className="shrink-0 flex items-center gap-1.5 mt-0.5">
                  {selected && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-current opacity-70">
                      выбран
                    </span>
                  )}
                  {isCorrectOpt && (
                    <CheckCircle2 className="h-3.5 w-3.5 text-[#9ED5B3] opacity-70" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Detail Modal ────────────────────────────────────────────────── */

function DetailModal({ attemptId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("answers");

  useEffect(() => {
    if (!attemptId) return;
    setLoading(true);
    setData(null);
    getAttemptReview(attemptId)
      .then((res) => setData(res.data))
      .catch((e) => {
        if (e?.response?.status === 403) toast.error("Нет прав для просмотра попытки");
        else toast.error("Не удалось загрузить данные попытки");
        onClose();
      })
      .finally(() => setLoading(false));
  }, [attemptId]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4 py-6">
      <div
        className="relative flex w-full max-w-3xl flex-col rounded-[24px] border"
        style={{
          background:
            "linear-gradient(160deg, rgba(21,26,35,0.99) 0%, rgba(15,17,21,0.98) 100%)",
          borderColor: "#2F3749",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.025), 0 18px 40px rgba(0,0,0,0.35)",
          maxHeight: "90vh",
        }}
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#2A2F3E] px-6 py-4">
          <div className="min-w-0 flex-1">
            {data ? (
              <>
                <h2 className="truncate text-lg font-semibold tracking-tight text-n-fg sm:text-xl">
                  {data.template_name}
                </h2>
                <p className="mt-0.5 text-sm text-n-muted">
                  {data.employee_name} · {formatDate(data.started_at)}
                </p>
              </>
            ) : (
              <div className="h-6 w-48 animate-pulse rounded bg-n-hover" />
            )}
          </div>
          <button
            className="btn btn-ghost shrink-0 px-2 py-1"
            onClick={onClose}
            aria-label="Закрыть"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-n-dim border-t-transparent" />
          </div>
        ) : data ? (
          <>
            {/* Summary bar */}
            <div className="grid shrink-0 grid-cols-2 gap-3 border-b border-[#2A2F3E] px-6 py-4 sm:grid-cols-4">
              <div>
                <p className="text-xs text-n-dim">Статус</p>
                <div className="mt-1 flex items-center gap-1.5">
                  <StatusIcon status={data.status} />
                  <span className={`text-sm font-semibold ${statusBadgeClass(data.status) === "badge-success" ? "text-[#8fd1b0]" : statusBadgeClass(data.status) === "badge-danger" ? "text-[#e6b0ab]" : "text-[#d9bc8d]"}`}>
                    {statusLabel(data.status)}
                  </span>
                </div>
              </div>
              <div>
                <p className="text-xs text-n-dim">Балл</p>
                <p className="mt-1 text-sm">
                  <ScorePill pct={data.score_pct} />
                  <span className="ml-1 text-xs text-n-muted">
                    ({data.score_raw ?? "—"} / {data.answers?.length ?? "—"})
                  </span>
                </p>
              </div>
              <div>
                <p className="text-xs text-n-dim">Покинул страницу</p>
                <p className="mt-1 text-sm font-semibold text-n-fg">
                  {(data.violation_count ?? 0) > 0
                    ? `${data.violation_count} раз`
                    : "Не покидал"}
                </p>
              </div>
              <div>
                <p className="text-xs text-n-dim">Время вне теста</p>
                <p className="mt-1 text-sm font-semibold text-n-fg">
                  {(data.total_hidden_ms ?? 0) > 0 ? formatMs(data.total_hidden_ms) : "—"}
                </p>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex shrink-0 gap-1 border-b border-[#2A2F3E] px-6">
              {[
                { key: "answers", label: `Ответы (${data.answers?.length ?? 0})` },
                { key: "violations", label: `Нарушения (${data.violations?.length ?? 0})` },
              ].map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                    tab === t.key
                      ? "border-n-accent text-n-accent"
                      : "border-transparent text-n-muted hover:text-n-fg"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {tab === "answers" && (
                <div className="space-y-3">
                  {(data.answers ?? []).length === 0 ? (
                    <p className="text-center text-sm text-n-muted py-8">Ответы отсутствуют</p>
                  ) : (
                    data.answers.map((ans, idx) => (
                      <AnswerCard key={ans.id ?? idx} ans={ans} idx={idx} />
                    ))
                  )}
                </div>
              )}

              {tab === "violations" && (
                <div className="space-y-2">
                  {(data.violations ?? []).length === 0 ? (
                    <p className="text-center text-sm text-n-muted py-8">
                      Нарушений не зафиксировано
                    </p>
                  ) : (
                    <>
                      <div className="mb-3 rounded-xl border border-[#4A2A2A] bg-[#24191B] px-4 py-2.5">
                        <p className="text-xs text-[#E6B0AB]">
                          Покинул страницу:{" "}
                          <span className="font-semibold">{data.violation_count ?? 0} раз</span>
                          {(data.total_hidden_ms ?? 0) > 0 && (
                            <>
                              {" · "}Время вне теста:{" "}
                              <span className="font-semibold">{formatMs(data.total_hidden_ms)}</span>
                            </>
                          )}
                        </p>
                      </div>
                      {data.violations.map((v, idx) => (
                        <div
                          key={v.id ?? idx}
                          className="flex items-start gap-3 rounded-xl border border-[#2A2F3E] bg-[#1A1E2A] px-4 py-3"
                        >
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#d9bc8d]" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-n-fg">
                              {violationLabel(v.event_type)}
                            </p>
                            <div className="mt-1 flex flex-wrap gap-3 text-xs text-n-dim">
                              <span>{formatDate(v.occurred_at)}</span>
                              {v.duration_ms != null && v.duration_ms > 0 && (
                                <span>
                                  <Clock className="mr-0.5 inline h-3 w-3" />
                                  {formatMs(v.duration_ms)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex shrink-0 justify-end border-t border-[#2A2F3E] px-6 py-3">
              <button className="btn btn-surface" onClick={onClose}>
                Закрыть
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

/* ── ExpandedRow ─────────────────────────────────────────────────── */

function ResultRow({ result, onReview }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className="cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-[#252B3B]/30"
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="px-3 py-3">
          <span className="text-sm font-medium text-gray-800 dark:text-n-fg">
            {result.employee_name}
          </span>
        </td>
        <td className="px-3 py-3">
          <span className="text-sm text-gray-600 dark:text-n-muted">{result.template_name}</span>
        </td>
        <td className="px-3 py-3">
          <ScorePill pct={result.score_pct} />
        </td>
        <td className="px-3 py-3">
          <span className={statusBadgeClass(result.status)}>
            {statusLabel(result.status)}
          </span>
        </td>
        <td className="px-3 py-3 text-sm text-gray-500 dark:text-n-muted tabular-nums">
          {formatDate(result.started_at)}
        </td>
        <td className="px-3 py-3">
          {result.violation_count > 0 ? (
            <span className="flex items-center gap-1 text-sm font-medium text-amber-600 dark:text-[#d9bc8d]">
              <AlertTriangle className="h-3.5 w-3.5" />
              {result.violation_count}
            </span>
          ) : (
            <span className="text-sm text-gray-400 dark:text-n-dim">—</span>
          )}
        </td>
        <td className="px-3 py-3 text-right">
          <div className="flex items-center justify-end gap-2">
            <button
              className="btn btn-ghost btn-sm"
              onClick={(e) => {
                e.stopPropagation();
                onReview(result.id);
              }}
              title="Детальный просмотр"
            >
              <Eye className="h-4 w-4" />
            </button>
            <span className="text-gray-400 dark:text-n-dim">
              {expanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </span>
          </div>
        </td>
      </tr>

      {expanded && (
        <tr>
          <td
            colSpan={7}
            className="border-b border-[var(--ui-border-soft)] bg-gray-50/60 px-6 py-4 dark:bg-[#1A1E2A]/60"
          >
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-4">
              <div>
                <span className="text-xs text-gray-400 dark:text-n-dim">Покинул страницу</span>
                <p className="font-medium text-gray-800 dark:text-n-fg">
                  {result.violation_count > 0
                    ? `${result.violation_count} раз (${formatMs(result.total_hidden_ms ?? 0)} вне теста)`
                    : "Не покидал"}
                </p>
              </div>
              <div>
                <span className="text-xs text-gray-400 dark:text-n-dim">Попытка</span>
                <p className="font-medium text-gray-800 dark:text-n-fg">№ {result.id}</p>
              </div>
              <div>
                <span className="text-xs text-gray-400 dark:text-n-dim">Завершён</span>
                <p className="font-medium text-gray-800 dark:text-n-fg">
                  {formatDate(result.completed_at)}
                </p>
              </div>
              <div>
                <span className="text-xs text-gray-400 dark:text-n-dim">Длительность</span>
                <p className="font-medium text-gray-800 dark:text-n-fg">
                  {formatDuration(result.started_at, result.completed_at)}
                </p>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                className="btn btn-save btn-sm"
                onClick={() => onReview(result.id)}
              >
                <Eye className="mr-1.5 h-3.5 w-3.5" />
                Просмотреть детально
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* ── Main Page ───────────────────────────────────────────────────── */

export default function QuizResultsPage() {
  useAuth();

  /* ── Org filters ─────────────────────────────────────────────── */
  const [units, setUnits] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [roles, setRoles] = useState([]);
  const [templates, setTemplates] = useState([]);

  const [selectedUnit, setSelectedUnit] = useState("");
  const [selectedDept, setSelectedDept] = useState("");
  const [selectedRole, setSelectedRole] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");

  /* ── Results state ───────────────────────────────────────────── */
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);

  /* ── Detail modal ────────────────────────────────────────────── */
  const [reviewId, setReviewId] = useState(null);

  /* ── Load units on mount ─────────────────────────────────────── */
  useEffect(() => {
    getUnits()
      .then((res) => {
        const list = res.data?.results ?? res.data ?? [];
        setUnits(list);
        if (list.length === 1) {
          setSelectedUnit(String(list[0].id));
        }
      })
      .catch(() => toast.error("Не удалось загрузить юниты"));
  }, []);

  /* ── Load departments when unit changes ──────────────────────── */
  useEffect(() => {
    setSelectedDept("");
    setDepartments([]);
    if (!selectedUnit) return;
    getDepartments({ unit: selectedUnit })
      .then((res) => setDepartments(res.data?.results ?? res.data ?? []))
      .catch(() => toast.error("Не удалось загрузить подразделения"));
  }, [selectedUnit]);

  /* ── Load roles when unit changes ────────────────────────────── */
  useEffect(() => {
    setSelectedRole("");
    setRoles([]);
    if (!selectedUnit) return;
    getOrgRoles({ unit: selectedUnit })
      .then((res) => setRoles(res.data?.results ?? res.data ?? []))
      .catch(() => toast.error("Не удалось загрузить должности"));
  }, [selectedUnit]);

  /* ── Load templates when filters change ──────────────────────── */
  useEffect(() => {
    setSelectedTemplate("");
    const params = {};
    if (selectedUnit) params.unit = selectedUnit;
    if (selectedDept) params.department = selectedDept;
    if (selectedRole) params.role = selectedRole;
    getTemplates(params)
      .then((res) => setTemplates(res.data?.results ?? res.data ?? []))
      .catch(() => {});
  }, [selectedUnit, selectedDept, selectedRole]);

  /* ── Load results ────────────────────────────────────────────── */
  const loadResults = useCallback(() => {
    const params = {};
    if (selectedUnit) params.unit = selectedUnit;
    if (selectedDept) params.department = selectedDept;
    if (selectedRole) params.role = selectedRole;
    if (selectedTemplate) params.template = selectedTemplate;

    setLoading(true);
    getQuizResults(params)
      .then((res) => {
        setResults(res.data?.results ?? res.data ?? []);
        setInitialLoaded(true);
      })
      .catch((e) => {
        if (e?.response?.status === 403) toast.error("Нет прав для просмотра результатов");
        else toast.error("Не удалось загрузить результаты тестирования");
      })
      .finally(() => setLoading(false));
  }, [selectedUnit, selectedDept, selectedRole, selectedTemplate]);

  useEffect(() => {
    loadResults();
  }, [loadResults]);

  /* ── Derived options ─────────────────────────────────────────── */
  const unitOptions = units.map((u) => ({ value: String(u.id), label: u.name }));
  const deptOptions = departments.map((d) => ({ value: String(d.id), label: d.name }));
  const roleOptions = roles.map((r) => ({ value: String(r.id), label: r.title }));
  const templateOptions = templates.map((t) => ({ value: String(t.id), label: t.name }));

  /* ── Stats ───────────────────────────────────────────────────── */
  const stats = (() => {
    if (!results.length) return null;
    const passedStatuses = new Set(["passed", "passed_with_flags"]);
    const failedStatuses = new Set(["completed", "terminated_for_violation", "suspicious_attempt", "expired"]);
    const passed = results.filter((r) => passedStatuses.has(r.status)).length;
    const failed = results.filter((r) => failedStatuses.has(r.status)).length;
    const avgScore =
      results.reduce((sum, r) => sum + (r.score_pct ?? 0), 0) / results.length;
    const totalViolations = results.reduce((sum, r) => sum + (r.violation_count ?? 0), 0);
    return { total: results.length, passed, failed, avgScore, totalViolations };
  })();

  /* ── Render ──────────────────────────────────────────────────── */
  return (
    <div className="page-shell">
      <div className="page-stack">
        {/* Header */}
        <div className="page-header">
          <div>
            <h1 className="page-title flex items-center gap-2.5">
              <BarChart3 className="h-7 w-7 text-n-accent" />
              Результаты тестирования
            </h1>
            <p className="page-subtitle">Просмотр и анализ результатов тестов сотрудников</p>
          </div>
          <button
            className="btn btn-surface btn-sm"
            onClick={loadResults}
            disabled={loading}
            title="Обновить"
          >
            {loading ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border border-current border-t-transparent" />
            ) : (
              "Обновить"
            )}
          </button>
        </div>

        {/* Filter Toolbar */}
        <div className="surface-toolbar">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Dropdown
              label="Юнит"
              value={selectedUnit}
              onChange={(val) => setSelectedUnit(val)}
              options={unitOptions}
              placeholder="Все юниты"
            />
            <Dropdown
              label="Подразделение"
              value={selectedDept}
              onChange={(val) => setSelectedDept(val)}
              options={deptOptions}
              placeholder="Все подразделения"
              disabled={!selectedUnit}
            />
            <Dropdown
              label="Должность"
              value={selectedRole}
              onChange={(val) => setSelectedRole(val)}
              options={roleOptions}
              placeholder="Все должности"
              disabled={!selectedUnit}
            />
            <Dropdown
              label="Шаблон теста"
              value={selectedTemplate}
              onChange={(val) => setSelectedTemplate(val)}
              options={templateOptions}
              placeholder="Все тесты"
            />
          </div>
        </div>

        {/* Stats Bar */}
        {stats && !loading && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              {
                label: "Всего попыток",
                value: stats.total,
                icon: <BarChart3 className="h-5 w-5 text-n-accent" />,
                color: "text-gray-800 dark:text-n-fg",
              },
              {
                label: "Пройдено",
                value: stats.passed,
                icon: <CheckCircle2 className="h-5 w-5 text-green-500 dark:text-[#8fd1b0]" />,
                color: "text-green-600 dark:text-[#8fd1b0]",
              },
              {
                label: "Провалено",
                value: stats.failed,
                icon: <XCircle className="h-5 w-5 text-red-500 dark:text-[#e6b0ab]" />,
                color: "text-red-600 dark:text-[#e6b0ab]",
              },
              {
                label: "Средний балл",
                value: `${stats.avgScore.toFixed(0)}%`,
                icon: <Eye className="h-5 w-5 text-n-accent" />,
                color:
                  stats.avgScore >= 80
                    ? "text-green-600 dark:text-[#8fd1b0]"
                    : stats.avgScore >= 60
                    ? "text-amber-600 dark:text-[#d9bc8d]"
                    : "text-red-600 dark:text-[#e6b0ab]",
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="surface-block flex items-center gap-3"
              >
                <div className="shrink-0">{stat.icon}</div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 dark:text-n-dim">{stat.label}</p>
                  <p className={`text-lg font-semibold tabular-nums ${stat.color}`}>
                    {stat.value}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Results Table */}
        <div className="surface-panel overflow-x-auto">
          {loading && !initialLoaded ? (
            <div className="flex justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-transparent dark:border-n-dim dark:border-t-transparent" />
            </div>
          ) : !initialLoaded ? null : results.length === 0 ? (
            <div className="surface-empty py-12 text-center">
              <BarChart3 className="mx-auto mb-2 h-10 w-10 opacity-30 dark:text-n-muted" />
              <p className="text-sm text-gray-500 dark:text-n-dim">
                {selectedUnit || selectedDept || selectedRole || selectedTemplate
                  ? "Нет результатов по заданным фильтрам"
                  : "Результаты тестирования ещё не появились"}
              </p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--ui-border-soft)]">
                  {[
                    "Сотрудник",
                    "Тест",
                    "Балл %",
                    "Статус",
                    "Дата",
                    "Нарушений",
                    "",
                  ].map((col, i) => (
                    <th
                      key={i}
                      className={`px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-n-muted ${
                        i === 6 ? "text-right" : ""
                      }`}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((result) => (
                  <ResultRow
                    key={result.id}
                    result={result}
                    onReview={setReviewId}
                  />
                ))}
              </tbody>
            </table>
          )}

          {loading && initialLoaded && (
            <div className="flex items-center justify-center gap-2 border-t border-[var(--ui-border-soft)] py-3">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-transparent dark:border-n-dim dark:border-t-transparent" />
              <span className="text-sm text-gray-400 dark:text-n-dim">Обновление…</span>
            </div>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {reviewId && (
        <DetailModal
          attemptId={reviewId}
          onClose={() => setReviewId(null)}
        />
      )}
    </div>
  );
}
