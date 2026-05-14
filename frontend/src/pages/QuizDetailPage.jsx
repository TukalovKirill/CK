import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  BookOpen, FileText, ExternalLink, ChevronRight, ChevronLeft,
  Clock, CalendarClock, AlertTriangle, RotateCcw, Eye,
} from "lucide-react";
import toast from "react-hot-toast";
import { getMyTests, startAttempt } from "../api/quizzes";

/* ── Helpers ──────────────────────────────────────────────── */

function formatDeadline(isoString) {
  if (!isoString) return null;
  const d = new Date(isoString);
  return d.toLocaleString("ru-RU", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function isOverdue(iso) {
  return iso ? new Date(iso) < new Date() : false;
}

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

const PREVIEW_TYPES = new Set(["pdf", "jpg", "jpeg", "png", "gif", "webp", "bmp"]);

/* ── File Preview Modal ───────────────────────────────────── */

function FilePreviewModal({ file, onClose }) {
  const isPdf = (file.file_type ?? "").toLowerCase() === "pdf";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6" onClick={onClose}>
      <div
        className="w-full max-w-6xl h-[calc(100vh-3rem)] sm:h-[calc(100vh-5rem)] flex flex-col rounded-[24px] border px-5 py-5 shadow-lg"
        style={{
          background: "rgba(21,26,35,0.98)",
          borderColor: "#2F3749",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.025), 0 18px 40px rgba(0,0,0,0.35)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between shrink-0">
          <h2 className="text-lg font-semibold tracking-tight text-gray-800 dark:text-n-fg truncate pr-4">
            {file.name}
          </h2>
          <button className="btn btn-ghost px-2 py-1 text-xl leading-none" onClick={onClose}>&times;</button>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden rounded-xl border border-[var(--ui-border-soft)]">
          {isPdf ? (
            <iframe src={file.file_url} title={file.name} className="h-full w-full" />
          ) : (
            <img src={file.file_url} alt={file.name} className="h-full w-full object-contain bg-black/20" />
          )}
        </div>
        <div className="mt-3 flex justify-end gap-3 shrink-0">
          <a href={file.file_url} download={file.name} className="btn btn-surface text-sm">Скачать</a>
          <button className="btn btn-save" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────── */

export default function QuizDetailPage() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [item, setItem] = useState(location.state?.item ?? null);
  const [loading, setLoading] = useState(!item);
  const [starting, setStarting] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);

  useEffect(() => {
    if (item) return;
    (async () => {
      try {
        const res = await getMyTests();
        const found = (res.data ?? []).find(t => String(t.assignment_id) === String(assignmentId));
        if (found) setItem(found);
        else { toast.error("Тест не найден"); navigate("/quizzes", { replace: true }); }
      } catch { toast.error("Ошибка загрузки"); navigate("/quizzes", { replace: true }); }
      finally { setLoading(false); }
    })();
  }, [assignmentId]);

  if (loading) {
    return (
      <div className="page-shell flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-gray-300 dark:border-n-dim border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!item) return null;

  const { template, materials = [], files = [], links = [], study_deadline, attempt_deadline, my_latest_attempt, assignment_id } = item;

  const statusInfo = STATUS_MAP[my_latest_attempt?.status] ?? STATUS_MAP.not_started;
  const studyOverdue = isOverdue(study_deadline);
  const attemptOverdue = isOverdue(attempt_deadline);
  const hasMaterials = materials.length > 0 || files.length > 0 || links.length > 0;

  const FAILED_STATUSES = new Set(["completed", "terminated_for_violation", "suspicious_attempt", "expired"]);
  const isFailed = my_latest_attempt && FAILED_STATUSES.has(my_latest_attempt.status);
  const isFinished = my_latest_attempt && my_latest_attempt.status !== "in_progress";

  const handleStart = async () => {
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
    <div className="page-shell">
      <div className="page-stack">
        {/* Back + Header */}
        <div>
          <button
            className="btn btn-ghost btn-sm mb-4"
            onClick={() => navigate("/quizzes")}
          >
            <ChevronLeft className="w-4 h-4 mr-1" />Назад
          </button>

          <div className="hero-banner">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              {template.mode === "learning"
                ? <span className="badge-success">Обучение</span>
                : <span className="badge-bronze">Экзамен</span>}
              {statusInfo.warn && <AlertTriangle className="h-3.5 w-3.5 text-n-accent" />}
              <span className={statusInfo.badge}>{statusInfo.label}</span>
            </div>
            <h1 className="page-title">{template.name}</h1>
            <p className="page-subtitle mt-1">
              {template.questions_count} вопр. · Порог: {template.pass_score_pct}%
              {my_latest_attempt?.score_pct != null && (
                <> · Результат: <span className="font-medium">{my_latest_attempt.score_pct}%</span></>
              )}
            </p>
          </div>
        </div>

        {/* Deadlines */}
        {(study_deadline || attempt_deadline) && (
          <div className="surface-panel">
            <div className="flex flex-wrap gap-4">
              {study_deadline && (
                <div className="flex items-center gap-1.5 text-sm">
                  <Clock className={`h-4 w-4 ${studyOverdue ? "text-red-400" : "text-gray-400 dark:text-n-dim"}`} />
                  <span className={studyOverdue ? "text-red-500 dark:text-[#e6b0ab]" : "text-gray-500 dark:text-n-dim"}>
                    Изучить до: <span className="font-medium">{formatDeadline(study_deadline)}</span>
                  </span>
                </div>
              )}
              {attempt_deadline && (
                <div className="flex items-center gap-1.5 text-sm">
                  <CalendarClock className={`h-4 w-4 ${attemptOverdue ? "text-red-400" : "text-gray-400 dark:text-n-dim"}`} />
                  <span className={attemptOverdue ? "text-red-500 dark:text-[#e6b0ab]" : "text-gray-500 dark:text-n-dim"}>
                    Сдать до: <span className="font-medium">{formatDeadline(attempt_deadline)}</span>
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Description */}
        {template.description && (
          <div className="surface-panel">
            <p className="text-sm text-gray-600 dark:text-n-muted leading-relaxed">
              {template.description}
            </p>
          </div>
        )}

        {/* Materials */}
        {hasMaterials && (
          <div className="surface-panel space-y-4">
            <h2 className="text-[15px] font-semibold text-gray-800 dark:text-n-fg flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-gray-400 dark:text-n-dim" />
              Материалы для изучения
            </h2>

            {materials.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-n-dim">
                  Разделы учебника
                </span>
                <div className="flex flex-wrap gap-2">
                  {materials.map((m, idx) => {
                    const params = new URLSearchParams({ section: m.section_id });
                    if (m.category_id) params.set("category", m.category_id);
                    const label = m.category_name
                      ? `${m.section_name} → ${m.category_name}`
                      : m.section_name;
                    return (
                      <button
                        key={`${m.section_id}-${m.category_id ?? idx}`}
                        className="flex items-center gap-1.5 rounded-lg border border-[var(--ui-border-strong)] bg-[var(--ui-surface-control)] px-3 py-2 text-sm font-medium text-gray-700 dark:text-n-muted transition-colors hover:border-n-accent/50 hover:text-n-accent dark:hover:text-n-accent"
                        onClick={() => navigate(`/textbooks?${params.toString()}`)}
                      >
                        <BookOpen className="h-4 w-4 flex-shrink-0" />
                        <span className="truncate max-w-[280px]">{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {files.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-n-dim">
                  Файлы
                </span>
                <div className="flex flex-wrap gap-2">
                  {files.map((f) =>
                    PREVIEW_TYPES.has((f.file_type ?? "").toLowerCase()) ? (
                      <button
                        key={f.id}
                        className="flex items-center gap-1.5 rounded-lg border border-[var(--ui-border-strong)] bg-[var(--ui-surface-control)] px-3 py-2 text-sm font-medium text-gray-700 dark:text-n-muted transition-colors hover:border-n-accent/50 hover:text-n-accent dark:hover:text-n-accent"
                        onClick={() => setPreviewFile(f)}
                      >
                        <FileText className="h-4 w-4 flex-shrink-0" />
                        <span className="truncate max-w-[240px]">{f.name}</span>
                      </button>
                    ) : (
                      <a
                        key={f.id}
                        href={f.file_url}
                        download={f.name}
                        className="flex items-center gap-1.5 rounded-lg border border-[var(--ui-border-strong)] bg-[var(--ui-surface-control)] px-3 py-2 text-sm font-medium text-gray-700 dark:text-n-muted transition-colors hover:border-n-accent/50 hover:text-n-accent dark:hover:text-n-accent"
                      >
                        <FileText className="h-4 w-4 flex-shrink-0" />
                        <span className="truncate max-w-[240px]">{f.name}</span>
                      </a>
                    )
                  )}
                </div>
              </div>
            )}

            {links.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-n-dim">
                  Ссылки
                </span>
                <div className="flex flex-wrap gap-2">
                  {links.map((lnk) => (
                    <a
                      key={lnk.id}
                      href={lnk.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 rounded-lg border border-[var(--ui-border-strong)] bg-[var(--ui-surface-control)] px-3 py-2 text-sm font-medium text-gray-700 dark:text-n-muted transition-colors hover:border-n-accent/50 hover:text-n-accent dark:hover:text-n-accent"
                    >
                      <ExternalLink className="h-4 w-4 flex-shrink-0" />
                      <span className="truncate max-w-[240px]">{lnk.name}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Action */}
        {!my_latest_attempt && (
          <button
            className="btn btn-save w-full flex items-center justify-center gap-2 py-3 text-base"
            onClick={handleStart}
            disabled={starting}
          >
            {starting
              ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              : <ChevronRight className="h-5 w-5" />}
            {starting ? "Загрузка..." : "Начать тест"}
          </button>
        )}

        {my_latest_attempt?.status === "in_progress" && (
          <button
            className="btn btn-save w-full flex items-center justify-center gap-2 py-3 text-base"
            onClick={() => navigate(`/quizzes/take/${my_latest_attempt.id}`)}
          >
            <ChevronRight className="h-5 w-5" />
            Продолжить
          </button>
        )}

        {isFinished && (
          <div className="flex gap-3">
            <button
              className="btn btn-surface flex-1 flex items-center justify-center gap-2"
              onClick={() => navigate(`/quizzes/result/${my_latest_attempt.id}`)}
            >
              <Eye className="h-4 w-4" />
              Результат
            </button>
            {isFailed && (
              <button
                className="btn btn-save flex-1 flex items-center justify-center gap-2"
                onClick={handleStart}
                disabled={starting}
              >
                {starting
                  ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  : <RotateCcw className="h-4 w-4" />}
                {starting ? "Загрузка..." : "Пересдать"}
              </button>
            )}
          </div>
        )}
      </div>

      {previewFile && (
        <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
      )}
    </div>
  );
}
