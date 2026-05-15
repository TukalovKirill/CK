import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { getUnits } from "../api/org";
import { submitWish } from "../api/feedback";
import { Send, CheckCircle } from "lucide-react";
import Dropdown from "../components/Dropdown";
import Spinner from "../components/Spinner";

export default function FeedbackSubmitPage() {
  const { user } = useAuth();
  const [units, setUnits] = useState([]);
  const [unitId, setUnitId] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getUnits().then((r) => {
      const list = r.data?.results ?? r.data ?? [];
      setUnits(list);
      if (list.length === 1) setUnitId(String(list[0].id));
    });
  }, []);

  const handleSubmit = async () => {
    if (!unitId || !text.trim()) return;
    setSending(true);
    setError("");
    try {
      await submitWish({ unit_id: Number(unitId), text: text.trim() });
      setSent(true);
      setText("");
    } catch (e) {
      setError(e.response?.data?.detail || "Ошибка отправки");
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div className="max-w-lg mx-auto mt-16 text-center space-y-4">
        <CheckCircle size={48} className="mx-auto" style={{ color: "#22c55e" }} />
        <h2 className="text-xl font-semibold" style={{ color: "var(--n-fg)" }}>
          Пожелание отправлено
        </h2>
        <p className="text-sm" style={{ color: "var(--n-muted)" }}>
          Ваше пожелание отправлено анонимно. Если на него ответят — вы получите уведомление.
        </p>
        <button className="btn-save mt-4" onClick={() => setSent(false)}>
          Отправить ещё
        </button>
      </div>
    );
  }

  const unitOptions = units.map((u) => ({ value: String(u.id), label: u.name }));

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-bold" style={{ color: "var(--n-fg)" }}>
        Ящик пожеланий
      </h1>
      <p className="text-sm" style={{ color: "var(--n-muted)" }}>
        Напишите пожелание или предложение. Оно будет отправлено анонимно — руководство не узнает, кто его написал.
      </p>

      {units.length > 1 && (
        <Dropdown
          label="Юнит"
          value={unitId}
          onChange={setUnitId}
          options={unitOptions}
          placeholder="Выберите юнит"
        />
      )}

      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: "var(--n-muted)" }}>
          Текст пожелания
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          placeholder="Опишите ваше пожелание или предложение..."
          className="w-full rounded-lg px-3 py-2.5 text-sm resize-none"
          style={{
            background: "var(--ui-surface-control)",
            border: "1px solid var(--n-border)",
            color: "var(--n-fg)",
          }}
        />
      </div>

      {error && (
        <p className="text-sm" style={{ color: "#ef4444" }}>{error}</p>
      )}

      <button
        className="btn-save w-full flex items-center justify-center gap-2"
        disabled={!unitId || !text.trim() || sending}
        onClick={handleSubmit}
      >
        {sending ? <Spinner size={16} /> : <Send size={16} />}
        Отправить анонимно
      </button>
    </div>
  );
}
