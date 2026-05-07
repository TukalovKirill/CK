import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ClipboardList, AlertTriangle, Clock, CalendarClock,
  ChevronRight, Eye, RotateCcw,
} from "lucide-react";
import toast from "react-hot-toast";
import { getMyTests, startAttempt } from "../api/quizzes";
import { useAuth } from "../context/AuthContext";

/* ── Helpers ──────────────────────────────────────────────── */

function formatDeadline(isoString) {
  if (!isoString) return null;
  const d = new Date(isoString);
  return d.toLocaleString("ru-RU", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function isOverdue(isoString) {
  if (!isoString) return false;
  return new Date(isoString) < new Date();
}

/* ── Status helpers ───────────────────────────────────────── */

const STATUS_MAP = {
  not_started: { label: "Не начат", badge: "badge-muted" },
  in_progress: { label: "В процессе", badge: "badge-bronze" },
  passed: { label: "Пройден", badge: "badge-success" },
  passed_with_flags: { label: "С замечаниями", badge: "badge-success", warn: true },
  completed: { label: "Не пройден", badge: "badge-danger" },
  terminated_for_violation: { label: "Прекращён", badge: "badge-danger" },
  suspicious_attempt: { label: "Прекращён", badge: "badge-danger" },
  expired: { label: "Истёк", badge: "badge-muted" },
};

const FAILED_STATUSES = new Set(["completed", "terminated_for_violation", "suspicious_attempt", "expired"]);

function getAttemptStatus(attempt) {
  if (!attempt) return STATUS_MAP.not_started;
  return STATUS_MAP[attempt.status] ?? { label: attempt.status, badge: "badge-muted" };
}

/* ── Test Card ────────────────────────────────────────────── */

function TestCard({ item }) {
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);
  const { template, study_deadline, attempt_deadline, my_latest_attempt, assignment_id } = item;
  const statusInfo = getAttemptStatus(my_latest_attempt);
  const studyOverdue = isOverdue(study_deadline);
  const attemptOverdue = isOverdue(attempt_deadline);

  const isFailed = my_latest_attempt && FAILED_STATUSES.has(my_latest_attempt.status);
  const isFinished = my_latest_attempt && my_latest_attempt.status !== "in_progress";

  const handleRetake = async (e) => {
    e.stopPropagation();
    setStarting(true);
    try {
      const res = await startAttempt(assignment_id);
      const attemptId = res.data?.attempt_id ?? res.data?.id;
      if (!attemptId) throw new Error("Нет ID попытки");
      navigate(`/quizzes/take/${attemptId}`);
    } catch (err) {
      toast.error(err?.response?.data?.detail ?? "Не удалось начать тест");
    } finally { setStarting(false); }
  };

  return (
    <div
      className="surface-panel cursor-pointer hover:bg-n-hover/40 transition-colors"
      onClick={() => navigate(`/quizzes/${assignment_id}`, { state: { item } })}
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            {template.mode === "learning"
              ? <span className="badge-success">Обучение</span>
              : <span className="badge-bronze">Экзамен</span>}
            {statusInfo.warn && <AlertTriangle className="h-3.5 w-3.5 text-n-accent" />}
            <span className={statusInfo.badge}>{statusInfo.label}</span>
          </div>

          <h2 className="text-sm font-semibold leading-snug text-gray-800 dark:text-n-fg truncate">
            {template.name}
          </h2>

          <p className="text-xs text-gray-500 dark:text-n-dim">
            {template.questions_count} вопр. · Порог: {template.pass_score_pct}%
            {my_latest_attempt?.score_pct != null && (
              <> · Результат: <span className="font-medium text-gray-700 dark:text-n-muted">{my_latest_attempt.score_pct}%</span></>
            )}
          </p>

          {/* Deadlines on card face */}
          {(study_deadline || attempt_deadline) && (
            <div className="flex flex-wrap gap-3 pt-0.5">
              {study_deadline && (
                <div className="flex items-center gap-1 text-xs">
                  <Clock className={`h-3 w-3 ${studyOverdue ? "text-red-400" : "text-gray-400 dark:text-n-dim"}`} />
                  <span className={studyOverdue ? "text-red-500 dark:text-[#e6b0ab]" : "text-gray-500 dark:text-n-dim"}>
                    Изучить до: <span className="font-medium">{formatDeadline(study_deadline)}</span>
                  </span>
                </div>
              )}
              {attempt_deadline && (
                <div className="flex items-center gap-1 text-xs">
                  <CalendarClock className={`h-3 w-3 ${attemptOverdue ? "text-red-400" : "text-gray-400 dark:text-n-dim"}`} />
                  <span className={attemptOverdue ? "text-red-500 dark:text-[#e6b0ab]" : "text-gray-500 dark:text-n-dim"}>
                    Сдать до: <span className="font-medium">{formatDeadline(attempt_deadline)}</span>
                  </span>
                </div>
              )}
            </div>
          )}

          {isFinished && (
            <div className="flex gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
              <button
                className="btn btn-surface btn-sm flex items-center gap-1 text-xs px-2.5 py-1"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/quizzes/result/${my_latest_attempt.id}`);
                }}
              >
                <Eye className="h-3 w-3" />
                Результат
              </button>
              {isFailed && (
                <button
                  className="btn btn-save btn-sm flex items-center gap-1 text-xs px-2.5 py-1"
                  onClick={handleRetake}
                  disabled={starting}
                >
                  {starting
                    ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    : <RotateCcw className="h-3 w-3" />}
                  Пересдать
                </button>
              )}
            </div>
          )}
        </div>

        <ChevronRight className="h-4 w-4 shrink-0 text-gray-400 dark:text-n-dim" />
      </div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────── */

export default function QuizListPage() {
  const { user } = useAuth();
  const isFullAccess = user?.is_superuser
    || user?.role === "owner"
    || user?.org_role_code === "owner"
    || user?.org_role_code === "developer";
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const params = showAll ? { all: "true" } : undefined;
        const res = await getMyTests(params);
        if (!cancelled) setTests(res.data ?? []);
      } catch (e) {
        if (!cancelled) {
          const msg = e?.response?.data?.detail ?? "Не удалось загрузить тесты";
          setError(msg);
          toast.error(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [showAll]);

  return (
    <div className="page-shell">
      <div className="page-stack">
        <div className="page-header">
          <div>
            <h1 className="page-title">Мои тесты</h1>
            <p className="page-subtitle">Назначенные тесты и учебные материалы</p>
          </div>
          {isFullAccess && (
            <label className="flex items-center gap-1.5 cursor-pointer" title="Показать все тесты компании">
              <input
                type="checkbox"
                checked={showAll}
                onChange={(e) => setShowAll(e.target.checked)}
                className="check-premium"
              />
              <Eye className="w-4 h-4 text-muted" />
              <span className="text-xs text-muted">Все тесты</span>
            </label>
          )}
        </div>

        {loading && (
          <div className="surface-panel flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-gray-300 dark:border-n-dim border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl border border-[#4A2A2A] bg-[#24191B] px-4 py-3 text-sm text-[#E6B0AB]">
            {error}
          </div>
        )}

        {!loading && !error && tests.length === 0 && (
          <div className="surface-panel">
            <div className="surface-empty flex flex-col items-center py-10">
              <ClipboardList className="h-10 w-10 text-gray-400 dark:text-n-dim mx-auto mb-3 opacity-40" />
              <p className="text-sm text-gray-500 dark:text-n-dim">Назначенных тестов нет</p>
            </div>
          </div>
        )}

        {!loading && !error && tests.length > 0 && (
          <div className="grid gap-3">
            {tests.map((item) => (
              <TestCard key={item.assignment_id} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
