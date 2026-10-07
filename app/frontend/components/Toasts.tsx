import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

const DISMISS_AFTER_MS = 6000;

type Tone = "success" | "error";

type Toast = {
  id: number;
  message: string;
  tone: Tone;
};

type ToastApi = {
  toasts: Toast[];
  show: (message: string, tone: Tone) => void;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback((message: string, tone: Tone) => {
    const id = nextId.current;
    nextId.current += 1;
    setToasts((current) => [...current, { id, message, tone }]);
  }, []);

  return <ToastContext.Provider value={{ toasts, show, dismiss }}>{children}</ToastContext.Provider>;
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error("ToastProvider is missing");
  return value;
}

export function ToastViewport() {
  const { toasts, dismiss } = useToast();
  if (toasts.length === 0) return null;

  return (
    <div className="toast-stack">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const onDismissRef = useRef(onDismiss);
  const remaining = useRef(DISMISS_AFTER_MS);
  const started = useRef(0);
  const timer = useRef<number | null>(null);
  const paused = useRef(false);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    started.current = Date.now();
    timer.current = window.setTimeout(() => onDismissRef.current(), remaining.current);
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [toast.id]);

  function pause() {
    if (timer.current === null || paused.current) return;
    remaining.current = Math.max(0, remaining.current - (Date.now() - started.current));
    window.clearTimeout(timer.current);
    timer.current = null;
    paused.current = true;
  }

  function resume() {
    if (!paused.current) return;
    paused.current = false;
    started.current = Date.now();
    timer.current = window.setTimeout(() => onDismissRef.current(), remaining.current);
  }

  return (
    <div
      className="toast"
      role={toast.tone === "error" ? "alert" : "status"}
      aria-live={toast.tone === "error" ? "assertive" : "polite"}
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocusCapture={pause}
      onBlurCapture={(event) => {
        const next = event.relatedTarget;
        if (!(next instanceof Node) || !event.currentTarget.contains(next)) resume();
      }}
    >
      <p>{toast.message}</p>
      <button type="button" className="mt-2 min-h-11 underline" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
}
