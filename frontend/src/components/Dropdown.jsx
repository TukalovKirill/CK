import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

const ITEM_MIN_H = 52;
const MAX_VISIBLE = 7;

export default function Dropdown({
  label,
  value,
  onChange,
  options = [],
  placeholder = "Выберите...",
  disabled = false,
  className = "",
  buttonClassName = "",
  menuClassName = "",
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const btnRef = useRef(null);

  const updatePos = useCallback(() => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left, width: r.width });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePos();
    const onScroll = () => updatePos();
    const onResize = () => updatePos();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
      document.body.style.overflow = "";
    };
  }, [open, updatePos]);

  const selectedLabel = options.find((o) => String(o.value) === String(value))?.label;

  const handleSelect = (val) => {
    onChange(val);
    setOpen(false);
  };

  return (
    <div className={className}>
      {label && <label className="block text-xs font-medium mb-1" style={{ color: "var(--n-muted)" }}>{label}</label>}
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors ${buttonClassName}`}
        style={{
          background: "var(--ui-surface-control)",
          border: "1px solid var(--n-border)",
          color: selectedLabel ? "var(--n-fg)" : "var(--n-dim)",
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        <span className="truncate">{selectedLabel || placeholder}</span>
        <ChevronDown size={14} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} style={{ color: "var(--n-dim)" }} />
      </button>

      {open && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className={`fixed z-50 rounded-lg overflow-hidden dropdown-scroll ${menuClassName}`}
            style={{
              top: pos.top,
              left: pos.left,
              width: pos.width,
              maxHeight: MAX_VISIBLE * ITEM_MIN_H,
              overflowY: "auto",
              background: "var(--n-panel)",
              border: "1px solid var(--n-border)",
              boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
            }}
          >
            <button
              type="button"
              onClick={() => handleSelect("")}
              className="w-full text-left px-3 py-2.5 text-sm transition-colors"
              style={{ color: "var(--n-dim)", minHeight: ITEM_MIN_H }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--n-hover)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}
            >
              {placeholder}
            </button>
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleSelect(opt.value)}
                className="w-full text-left px-3 py-2.5 text-sm transition-colors break-words"
                style={{
                  color: String(opt.value) === String(value) ? "var(--n-accent)" : "var(--n-fg)",
                  fontWeight: String(opt.value) === String(value) ? 500 : 400,
                  minHeight: ITEM_MIN_H,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--n-hover)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}
