import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getNextQuestion, submitAnswer, completeAttempt } from "../api/quizzes";
import useQuizTimer from "../hooks/useQuizTimer";
import useAntiCheat from "../hooks/useAntiCheat";
import toast from "react-hot-toast";
import { Clock, AlertTriangle, CheckCircle2, XCircle, ArrowLeft } from "lucide-react";

/* ── Helpers ──────────────────────────────────────────────── */

function getTimerColor(progress, seconds) {
  if (seconds < 5) return "bg-red-500";
  if (progress <= 0.25) return "bg-red-400";
  if (progress <= 0.5) return "bg-amber-400";
  return "bg-n-accent";
}

function StatusBadge({ status }) {
  if (status === "passed" || status === "passed_with_flags") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium bg-[rgba(33,128,89,0.14)] text-[#8fd1b0] border border-[rgba(33,128,89,0.22)]">
        <CheckCircle2 className="h-4 w-4" />
        {status === "passed_with_flags" ? "Тест сдан (с замечаниями)" : "Тест сдан"}
      </span>
    );
  }
  if (status === "completed") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium bg-[rgba(192,57,43,0.12)] text-[#e6b0ab] border border-[rgba(192,57,43,0.22)]">
        <XCircle className="h-4 w-4" />
        Тест не сдан
      </span>
    );
  }
  if (status === "terminated_for_violation") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium bg-[rgba(192,57,43,0.12)] text-[#e6b0ab] border border-[rgba(192,57,43,0.22)]">
        <XCircle className="h-4 w-4" />
        Прерван (нарушения)
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium bg-[rgba(127,138,157,0.12)] text-[var(--ui-text-secondary)] border border-[rgba(127,138,157,0.16)]">
      {status}
    </span>
  );
}

/* ── Violation Warning Banner ─────────────────────────────── */

function ViolationBanner({ message, visible, onDismiss }) {
  return (
    <div
      className={[
        "fixed top-0 left-0 right-0 z-[200] flex items-start gap-3 px-5 py-4",
        "bg-amber-500 text-white shadow-lg",
        "transition-transform duration-300 ease-in-out",
        visible ? "translate-y-0" : "-translate-y-full",
      ].join(" ")}
    >
      <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">Нарушение зафиксировано</p>
        {message && (
          <p className="text-xs opacity-90 mt-0.5 leading-snug">{message}</p>
        )}
      </div>
      <button
        onClick={onDismiss}
        className="text-white/80 hover:text-white text-lg leading-none flex-shrink-0"
        aria-label="Закрыть"
      >
        &times;
      </button>
    </div>
  );
}

/* ── Timer Bar ────────────────────────────────────────────── */

function TimerBar({ seconds, progress, totalSeconds }) {
  const barColor = getTimerColor(progress, seconds);
  const isPulsing = seconds < 5 && seconds > 0;

  return (
    <div className="flex items-center gap-3">
      <Clock className="h-4 w-4 flex-shrink-0 text-gray-400" />
      <div className="flex-1 h-2.5 rounded-full bg-gray-200 overflow-hidden">
        <div
          className={[
            "h-full rounded-full transition-[width] duration-200 ease-linear",
            barColor,
            isPulsing ? "animate-pulse" : "",
          ].join(" ")}
          style={{ width: `${Math.max(0, Math.min(100, progress * 100))}%` }}
        />
      </div>
      <span
        className={[
          "text-sm font-semibold tabular-nums w-8 text-right flex-shrink-0",
          seconds <= 10
            ? "text-red-500"
            : seconds <= Math.ceil(totalSeconds * 0.5)
            ? "text-amber-500"
            : "text-gray-700",
        ].join(" ")}
      >
        {seconds}s
      </span>
    </div>
  );
}

/* ── Termination Screen ───────────────────────────────────── */

function TerminationScreen({ onBack }) {
  return (
    <div className="page-shell flex items-center justify-center min-h-[60vh]">
      <div className="surface-panel max-w-md w-full text-center space-y-5 py-10 px-6">
        <div className="flex justify-center">
          <div className="rounded-full bg-[rgba(192,57,43,0.12)] p-4">
            <XCircle className="h-12 w-12 text-[#e6b0ab]" />
          </div>
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold tracking-tight text-gray-700">
            Тест прерван
          </h2>
          <p className="text-sm text-gray-500 leading-relaxed">
            Попытка аннулирована из-за зафиксированных нарушений честности прохождения.
            Обратитесь к руководителю.
          </p>
        </div>
        <button className="btn btn-surface w-full gap-2" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Вернуться к тестам
        </button>
      </div>
    </div>
  );
}

/* ── Result Screen ────────────────────────────────────────── */

function ResultScreen({ result, onBack }) {
  const {
    status,
    score_raw,
    score_pct,
    pass_score_pct,
    violation_count,
    total_questions,
  } = result;

  const pct = typeof score_pct === "number" ? Math.round(score_pct) : 0;
  const passPct = typeof pass_score_pct === "number" ? Math.round(pass_score_pct) : 0;

  return (
    <div className="page-shell flex items-center justify-center min-h-[60vh]">
      <div className="surface-panel max-w-md w-full text-center space-y-6 py-10 px-6">
        {/* Icon */}
        <div className="flex justify-center">
          {status === "passed" || status === "passed_with_flags" ? (
            <div className="rounded-full bg-[rgba(33,128,89,0.14)] p-4">
              <CheckCircle2 className="h-12 w-12 text-[#8fd1b0]" />
            </div>
          ) : (
            <div className="rounded-full bg-[rgba(192,57,43,0.12)] p-4">
              <XCircle className="h-12 w-12 text-[#e6b0ab]" />
            </div>
          )}
        </div>

        {/* Title */}
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight text-gray-700">
            {status === "passed" || status === "passed_with_flags" ? "Отлично!" : "Попробуйте ещё раз"}
          </h2>
          <StatusBadge status={status} />
        </div>

        {/* Score */}
        <div className="surface-block space-y-3 text-left">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500">Правильных ответов</span>
            <span className="text-sm font-semibold text-gray-700">
              {score_raw} из {total_questions}
            </span>
          </div>

          {/* Score percentage bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-400">
              <span>Результат</span>
              <span className={pct >= passPct ? "text-[#8fd1b0]" : "text-[#e6b0ab]"}>
                {pct}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
              <div
                className={[
                  "h-full rounded-full transition-all duration-700",
                  pct >= passPct ? "bg-emerald-500" : "bg-red-400",
                ].join(" ")}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-gray-400">
              Проходной балл: {passPct}%
            </p>
          </div>

          {/* Violations */}
          {violation_count > 0 && (
            <div className="flex justify-between items-center pt-1 border-t border-gray-100">
              <span className="text-sm text-gray-500 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                Нарушений зафиксировано
              </span>
              <span className="text-sm font-semibold text-amber-500">
                {violation_count}
              </span>
            </div>
          )}
        </div>

        {/* Back button */}
        <button className="btn btn-save w-full gap-2" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Вернуться к тестам
        </button>
      </div>
    </div>
  );
}

/* ── Option Button ────────────────────────────────────────── */

function OptionButton({ option, selected, questionType, onChange }) {
  const isSelected = selected.includes(option.id);

  const handleClick = () => {
    if (questionType === "single") {
      onChange([option.id]);
    } else {
      onChange(
        isSelected
          ? selected.filter((id) => id !== option.id)
          : [...selected, option.id]
      );
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={[
        "surface-block w-full text-left transition-all duration-150 cursor-pointer",
        "flex items-start gap-3 hover:border-n-accent/40",
        isSelected
          ? "border-n-accent/60 bg-[rgba(193,154,107,0.07)]"
          : "",
      ].join(" ")}
    >
      {/* Indicator */}
      <span
        className={[
          "flex-shrink-0 mt-0.5",
          questionType === "single"
            ? "w-4 h-4 rounded-full border-2 flex items-center justify-center"
            : "w-4 h-4 rounded-md border-2 flex items-center justify-center",
          isSelected
            ? "border-n-accent bg-n-accent"
            : "border-gray-300 bg-white",
        ].join(" ")}
      >
        {isSelected && (
          questionType === "single" ? (
            <span className="w-1.5 h-1.5 rounded-full bg-white block" />
          ) : (
            <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 12 12">
              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )
        )}
      </span>

      {/* Text */}
      <span className="text-sm text-gray-700 leading-snug pt-px">
        {option.text}
      </span>
    </button>
  );
}

/* ── Main Page ────────────────────────────────────────────── */

export default function QuizTakePage() {
  const { attemptId } = useParams();
  const navigate = useNavigate();

  // Quiz state
  const [questionIndex, setQuestionIndex] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [question, setQuestion] = useState(null);
  const [serverNow, setServerNow] = useState(null);
  const [attemptStatus, setAttemptStatus] = useState("in_progress");

  // UI state
  const [selected, setSelected] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // Result state
  const [result, setResult] = useState(null);

  // Violation banner state
  const [bannerVisible, setBannerVisible] = useState(false);
  const [bannerMessage, setBannerMessage] = useState("");
  const [bannerTimer, setBannerTimer] = useState(null);

  // Termination overlay
  const [terminated, setTerminated] = useState(false);

  /* ── Navigate back ── */
  const goBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  const questionStartRef = useRef(Date.now());

  /* ── Load next question ── */
  const loadNextQuestion = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setSelected([]);
    questionStartRef.current = Date.now();
    try {
      const res = await getNextQuestion(attemptId);
      const data = res.data;

      setAttemptStatus(data.attempt_status);
      setTotalQuestions(data.total_questions ?? 0);

      if (!data.question || data.attempt_status !== "in_progress") {
        try {
          const completeRes = await completeAttempt(attemptId);
          setResult(completeRes.data);
        } catch (err) {
          const errData = err?.response?.data;
          if (errData && typeof errData.score_pct !== "undefined") {
            setResult(errData);
          } else {
            setResult({ status: data.attempt_status || "finished", total_questions: data.total_questions ?? 0, score_raw: 0, score_pct: 0, pass_score_pct: 0, violation_count: 0 });
          }
        }
        return;
      }

      setQuestion(data.question);
      setQuestionIndex(data.question_index ?? 0);
      setServerNow(data.server_now ?? null);
    } catch (err) {
      const status = err?.response?.status;
      if (status === 404) {
        setLoadError("Попытка не найдена.");
      } else if (status === 403) {
        setLoadError("Нет прав для прохождения этого теста.");
      } else {
        setLoadError("Не удалось загрузить вопрос. Проверьте соединение.");
      }
    } finally {
      setLoading(false);
    }
  }, [attemptId]);

  /* ── Mount: load first question ── */
  useEffect(() => {
    loadNextQuestion();
  }, [loadNextQuestion]);

  /* ── Submit answer ── */
  const handleSubmit = useCallback(
    async ({ timedOut = false } = {}) => {
      if (submitting) return;
      setSubmitting(true);
      try {
        const timeSpent = Math.max(0, Date.now() - questionStartRef.current);
        const payload = {
          question_id: question?.id,
          selected_option_ids: timedOut ? [] : selected,
          time_spent_ms: timeSpent,
          timed_out: !!timedOut,
        };

        await submitAnswer(attemptId, payload);
        await loadNextQuestion();
      } catch (err) {
        const status = err?.response?.status;
        if (status === 404) {
          toast.error("Попытка завершена или не найдена.");
          navigate(`/quizzes/result/${attemptId}`, { replace: true });
        } else if (status === 400) {
          const data = err.response.data;
          if (data?.attempt_status && data?.expired) {
            toast.error("Время на прохождение теста истекло.");
            navigate(`/quizzes/result/${attemptId}`, { replace: true });
          } else {
            const msg = typeof data === "string" ? data : data?.error || JSON.stringify(data);
            toast.error(msg || "Ошибка при отправке ответа");
          }
        } else if (status === 403) {
          toast.error("Попытка уже завершена или заблокирована.");
          navigate(`/quizzes/result/${attemptId}`, { replace: true });
        } else {
          toast.error("Ошибка сети. Попробуйте ещё раз.");
        }
      } finally {
        setSubmitting(false);
      }
    },
    [submitting, question, selected, attemptId, loadNextQuestion]
  );

  /* ── Timer expire callback ── */
  const handleTimerExpire = useCallback(() => {
    handleSubmit({ timedOut: true });
  }, [handleSubmit]);

  /* ── Anti-cheat violation handler ── */
  const handleAntiCheatAction = useCallback(
    (actionResult) => {
      if (actionResult.action === "terminate") {
        setTerminated(true);
        return;
      }

      const msg = actionResult.message || "Зафиксирован выход из окна теста.";
      setBannerMessage(msg);
      setBannerVisible(true);

      setBannerTimer((prev) => {
        if (prev) clearTimeout(prev);
        return setTimeout(() => {
          setBannerVisible(false);
        }, 5000);
      });
    },
    []
  );

  /* ── Anti-cheat hook ── */
  const { isTerminated: antiCheatTerminated } = useAntiCheat({
    attemptId,
    enabled: attemptStatus === "in_progress" && !result && !terminated,
    onAction: handleAntiCheatAction,
  });

  useEffect(() => {
    if (antiCheatTerminated) {
      setTerminated(true);
    }
  }, [antiCheatTerminated]);

  /* ── Timer hook ── */
  const timerSec = question?.timer_seconds ?? 0;
  const { seconds, progress } = useQuizTimer({
    serverNow,
    questionTimerSec: timerSec > 0 ? timerSec : 60,
    onExpire: timerSec > 0 ? handleTimerExpire : undefined,
    questionKey: questionIndex,
  });

  /* ── Cleanup banner timer on unmount ── */
  useEffect(() => {
    return () => {
      if (bannerTimer) clearTimeout(bannerTimer);
    };
  }, [bannerTimer]);

  /* ──────────────────────────────────────────────────────── */
  /* Render                                                   */
  /* ──────────────────────────────────────────────────────── */

  const isMultiple = question?.question_type === "multiple";
  const canSubmit = selected.length > 0 && !submitting;
  const displayIndex = questionIndex + 1;

  let content;

  if (terminated) {
    content = <TerminationScreen onBack={goBack} />;
  } else if (result) {
    content = <ResultScreen result={result} onBack={goBack} />;
  } else if (loading) {
    content = (
      <div className="page-shell flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  } else if (loadError) {
    content = (
      <div className="page-shell flex items-center justify-center min-h-[60vh]">
        <div className="surface-panel max-w-md w-full text-center space-y-4 py-8 px-6">
          <XCircle className="h-10 w-10 text-red-400 mx-auto" />
          <p className="text-sm text-gray-700">{loadError}</p>
          <button className="btn btn-surface gap-2" onClick={goBack}>
            <ArrowLeft className="h-4 w-4" />
            Назад
          </button>
        </div>
      </div>
    );
  } else {
    content = (
      <div className="page-shell">
        <div className="page-stack max-w-2xl mx-auto">
          {/* ── Top bar: progress + timer ── */}
          <div className="surface-panel space-y-3">
            {/* Progress row */}
            <div className="flex items-center justify-between gap-4">
              <button
                onClick={goBack}
                className="btn-ghost flex items-center gap-1.5 text-sm px-2 py-1"
                title="Прервать тест"
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Выйти</span>
              </button>

              <span className="text-sm font-medium text-gray-600 text-center flex-1">
                Вопрос{" "}
                <span className="font-semibold text-gray-700">{displayIndex}</span>
                {" "}из{" "}
                <span className="font-semibold text-gray-700">{totalQuestions}</span>
              </span>

              {/* Question type hint */}
              {isMultiple ? (
                <span className="badge-muted hidden sm:inline-flex">Несколько вариантов</span>
              ) : (
                <span className="badge-muted hidden sm:inline-flex">Один вариант</span>
              )}
            </div>

            {/* Overall progress bar */}
            <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
              <div
                className="h-full bg-n-accent rounded-full transition-all duration-500"
                style={{
                  width: totalQuestions > 0
                    ? `${Math.round((displayIndex / totalQuestions) * 100)}%`
                    : "0%",
                }}
              />
            </div>

            {/* Timer */}
            {timerSec > 0 && (
              <TimerBar
                seconds={seconds}
                progress={progress}
                totalSeconds={timerSec}
              />
            )}
          </div>

          {/* ── Question card ── */}
          <div className="surface-panel space-y-2">
            {isMultiple && (
              <p className="text-xs text-gray-400">
                Выберите все подходящие варианты
              </p>
            )}
            <p className="text-[15px] font-semibold text-gray-700 leading-relaxed">
              {question?.text}
            </p>
          </div>

          {/* ── Options ── */}
          <div className="space-y-2.5">
            {(question?.options ?? []).map((option) => (
              <OptionButton
                key={option.id}
                option={option}
                selected={selected}
                questionType={question?.question_type ?? "single"}
                onChange={setSelected}
              />
            ))}
          </div>

          {/* ── Submit button ── */}
          <div className="pt-1">
            <button
              type="button"
              className="btn btn-save w-full disabled:opacity-40 disabled:cursor-not-allowed gap-2"
              disabled={!canSubmit}
              onClick={() => handleSubmit()}
            >
              {submitting ? (
                <>
                  <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                  Отправляю…
                </>
              ) : (
                "Ответить"
              )}
            </button>

            {!canSubmit && !submitting && (
              <p className="mt-2 text-center text-xs text-gray-400">
                {isMultiple
                  ? "Выберите один или несколько вариантов"
                  : "Выберите вариант ответа"}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <ViolationBanner
        message={bannerMessage}
        visible={bannerVisible}
        onDismiss={() => setBannerVisible(false)}
      />
      {content}
    </>
  );
}
