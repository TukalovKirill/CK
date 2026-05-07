import { createContext, useContext, useState, useCallback } from "react";
import { Trash2 } from "lucide-react";

const DialogContext = createContext();

export function DialogProvider({ children }) {
  const [state, setState] = useState(null);

  const alert = useCallback((title, description) => {
    return new Promise((resolve) => {
      setState({ type: "alert", title, description, resolve });
    });
  }, []);

  const confirm = useCallback((title, description, opts = {}) => {
    return new Promise((resolve) => {
      setState({ type: "confirm", title, description, opts, resolve });
    });
  }, []);

  const close = (value) => {
    if (state?.resolve) state.resolve(value);
    setState(null);
  };

  return (
    <DialogContext.Provider value={{ alert, confirm }}>
      {children}
      {state && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          onClick={() => {
            if (state.type === "alert") close(true);
          }}
        >
          <div className="fixed inset-0 bg-black/60" />
          <div
            className="relative max-w-sm sm:max-w-md w-full rounded-[24px] p-6 space-y-4"
            style={{
              background: "linear-gradient(145deg, var(--n-panel), var(--n-card))",
              border: "1px solid var(--n-border)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold" style={{ color: "var(--n-fg)" }}>
              {state.title}
            </h3>
            {state.description && (
              <p className="text-sm" style={{ color: "var(--n-muted)" }}>
                {state.description}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              {state.type === "confirm" && (
                <button className="btn-surface" onClick={() => close(false)}>
                  Отмена
                </button>
              )}
              <button
                className={state.opts?.destructive ? "btn-danger" : "btn-save"}
                onClick={() => close(state.type === "alert" ? true : true)}
              >
                {state.opts?.destructive && <Trash2 size={14} />}
                {state.opts?.confirmText || (state.type === "alert" ? "OK" : "Подтвердить")}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useDialog must be used within DialogProvider");
  return ctx;
}
