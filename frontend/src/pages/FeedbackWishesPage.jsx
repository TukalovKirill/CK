import { useState, useEffect, useCallback } from "react";
import { useAuth, hasPermission } from "../context/AuthContext";
import { getUnits } from "../api/org";
import { getWishes, deleteWish, replyToWish } from "../api/feedback";
import { useDialog } from "../components/DialogProvider";
import useRealtimeUpdates from "../hooks/useRealtimeUpdates";
import Dropdown from "../components/Dropdown";
import Spinner from "../components/Spinner";
import { Trash2, MessageSquare, Send, Inbox } from "lucide-react";

function WishCard({ wish, canDelete, onDelete, onReply }) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);

  const date = new Date(wish.created_at).toLocaleDateString("ru-RU", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

  const handleReply = async () => {
    if (!replyText.trim()) return;
    setSending(true);
    try {
      await onReply(wish.id, replyText.trim());
      setReplyOpen(false);
      setReplyText("");
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="rounded-2xl p-4 space-y-3"
      style={{
        background: "var(--n-card)",
        border: "1px solid var(--n-border)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{ background: "rgba(200,16,46,0.1)", color: "var(--n-accent)" }}
          >
            {wish.unit_name}
          </span>
          <span className="text-xs" style={{ color: "var(--n-dim)" }}>{date}</span>
        </div>
        <div className="flex items-center gap-1">
          {wish.has_author && !wish.reply_text && (
            <button
              className="p-1.5 rounded-lg transition-colors btn-ghost"
              title="Ответить"
              onClick={() => setReplyOpen(!replyOpen)}
            >
              <MessageSquare size={16} />
            </button>
          )}
          {canDelete && (
            <button
              className="p-1.5 rounded-lg transition-colors btn-ghost"
              title="Удалить"
              onClick={() => onDelete(wish.id)}
              style={{ color: "#ef4444" }}
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--n-fg)" }}>
        {wish.text}
      </p>

      {wish.reply_text && (
        <div
          className="rounded-xl p-3 space-y-1"
          style={{
            borderLeft: "3px solid #eab308",
            background: "rgba(234,179,8,0.06)",
          }}
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium" style={{ color: "#eab308" }}>
              Ответ
            </span>
            {wish.replied_by_name && (
              <span className="text-xs" style={{ color: "var(--n-dim)" }}>
                {wish.replied_by_name}
              </span>
            )}
            {wish.replied_at && (
              <span className="text-xs" style={{ color: "var(--n-dim)" }}>
                {new Date(wish.replied_at).toLocaleDateString("ru-RU", {
                  day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                })}
              </span>
            )}
          </div>
          <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--n-fg)" }}>
            {wish.reply_text}
          </p>
        </div>
      )}

      {replyOpen && (
        <div className="space-y-2 pt-1">
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            rows={3}
            placeholder="Введите ответ..."
            autoFocus
            className="w-full rounded-lg px-3 py-2 text-sm resize-none"
            style={{
              background: "var(--ui-surface-control)",
              border: "1px solid var(--n-border)",
              color: "var(--n-fg)",
            }}
          />
          <div className="flex justify-end gap-2">
            <button className="btn-surface text-sm" onClick={() => setReplyOpen(false)}>
              Отмена
            </button>
            <button
              className="btn-save text-sm flex items-center gap-1.5"
              disabled={!replyText.trim() || sending}
              onClick={handleReply}
            >
              {sending ? <Spinner size={14} /> : <Send size={14} />}
              Ответить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FeedbackWishesPage() {
  const { user } = useAuth();
  const dialog = useDialog();
  const [units, setUnits] = useState([]);
  const [unitId, setUnitId] = useState("");
  const [wishes, setWishes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nextUrl, setNextUrl] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const canDelete = hasPermission(user, "feedback.edit");

  useRealtimeUpdates(["staff_wish"], () => {
    setReloadKey((k) => k + 1);
  });

  useEffect(() => {
    getUnits().then((r) => {
      const list = r.data?.results ?? r.data ?? [];
      setUnits(list);
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = {};
    if (unitId) params.unit = unitId;
    getWishes(params)
      .then((r) => {
        setWishes(r.data?.results ?? r.data ?? []);
        setNextUrl(r.data?.next ?? null);
      })
      .finally(() => setLoading(false));
  }, [unitId, reloadKey]);

  const loadMore = async () => {
    if (!nextUrl || loadingMore) return;
    setLoadingMore(true);
    try {
      const r = await getWishes({ _url: nextUrl });
      const newItems = r.data?.results ?? r.data ?? [];
      setWishes((prev) => [...prev, ...newItems]);
      setNextUrl(r.data?.next ?? null);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleDelete = async (id) => {
    const ok = await dialog.confirm(
      "Удалить пожелание?",
      "Это действие нельзя отменить.",
      { destructive: true, confirmText: "Удалить" },
    );
    if (!ok) return;
    await deleteWish(id);
    setWishes((prev) => prev.filter((w) => w.id !== id));
  };

  const handleReply = async (id, text) => {
    const res = await replyToWish(id, text);
    setWishes((prev) => prev.map((w) => (w.id === id ? res.data : w)));
  };

  const unitOptions = units.map((u) => ({ value: String(u.id), label: u.name }));

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold" style={{ color: "var(--n-fg)" }}>
          Ящик пожеланий
        </h1>
        {units.length > 1 && (
          <Dropdown
            value={unitId}
            onChange={setUnitId}
            options={unitOptions}
            placeholder="Все юниты"
            className="min-w-[180px]"
          />
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner size={32} />
        </div>
      ) : wishes.length === 0 ? (
        <div className="text-center py-16 space-y-2">
          <Inbox size={40} className="mx-auto" style={{ color: "var(--n-dim)" }} />
          <p className="text-sm" style={{ color: "var(--n-muted)" }}>
            Пока нет пожеланий
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {wishes.map((w) => (
            <WishCard
              key={w.id}
              wish={w}
              canDelete={canDelete}
              onDelete={handleDelete}
              onReply={handleReply}
            />
          ))}

          {nextUrl && (
            <button
              className="btn-surface w-full"
              onClick={loadMore}
              disabled={loadingMore}
            >
              {loadingMore ? <Spinner size={16} /> : "Загрузить ещё"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
