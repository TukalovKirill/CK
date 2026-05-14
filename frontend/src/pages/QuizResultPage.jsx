import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getMyAttemptResult } from "../api/quizzes";
import toast from "react-hot-toast";
import { CheckCircle2, XCircle, AlertTriangle, ArrowLeft } from "lucide-react";

const STATUS_LABELS = {
  passed: "Пройден",
  passed_with_flags: "С замечаниями",
  completed: "Не пройден",
  terminated_for_violation: "Прекращён",
  suspicious_attempt: "Прекращён",
  expired: "Истёк",
};

export default function QuizResultPage() {
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await getMyAttemptResult(attemptId);
        setData(res.data);
      } catch {
        toast.error("Не удалось загрузить результат");
        navigate("/quizzes", { replace: true });
      } finally {
        setLoading(false);
      }
    })();
  }, [attemptId]);

  if (loading) {
    return (
      <div className="page-shell flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) return null;

  const {
    status,
    score_raw,
    score_pct,
    pass_score_pct,
    violation_count,
    total_questions,
    template_name,
  } = data;

  const pct = typeof score_pct === "number" ? Math.round(score_pct) : 0;
  const passPct = typeof pass_score_pct === "number" ? Math.round(pass_score_pct) : 0;
  const isPassed = status === "passed" || status === "passed_with_flags";

  return (
    <div className="page-shell flex items-center justify-center min-h-[60vh]">
      <div className="surface-panel max-w-md w-full text-center space-y-6 py-10 px-6">
        {/* Icon */}
        <div className="flex justify-center">
          {isPassed ? (
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
            {isPassed ? "Тест пройден" : "Тест не пройден"}
          </h2>
          <p className="text-sm text-gray-500">{template_name}</p>
          <span className={isPassed ? "badge-success" : "badge-danger"}>
            {STATUS_LABELS[status] ?? status}
          </span>
        </div>

        {/* Score */}
        <div className="surface-block space-y-3 text-left">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500">Правильных ответов</span>
            <span className="text-sm font-semibold text-gray-700">
              {score_raw} из {total_questions}
            </span>
          </div>

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
        <button className="btn btn-save w-full gap-2" onClick={() => navigate("/quizzes")}>
          <ArrowLeft className="h-4 w-4" />
          Вернуться к тестам
        </button>
      </div>
    </div>
  );
}
