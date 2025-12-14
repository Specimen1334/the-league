"use client";

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";

export type ToastKind = "success" | "error" | "info";

export type Toast = {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
};

type ToastContextValue = {
  toasts: Toast[];
  push: (toast: Omit<Toast, "id">, opts?: { ttlMs?: number }) => void;
  dismiss: (id: string) => void;
  clear: () => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

function randomId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function ToastProvider(props: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const clear = useCallback(() => {
    setToasts([]);
  }, []);

  const push = useCallback(
    (toast: Omit<Toast, "id">, opts?: { ttlMs?: number }) => {
      const id = randomId();
      const ttlMs = opts?.ttlMs ?? 4500;
      const next: Toast = { ...toast, id };
      setToasts((current) => [next, ...current].slice(0, 5));
      window.setTimeout(() => dismiss(id), ttlMs);
    },
    [dismiss]
  );

  const value = useMemo<ToastContextValue>(
    () => ({ toasts, push, dismiss, clear }),
    [toasts, push, dismiss, clear]
  );

  return (
    <ToastContext.Provider value={value}>
      {props.children}
      <ToastViewport />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}

function ToastViewport() {
  const ctx = useContext(ToastContext);
  if (!ctx) return null;

  return (
    <div className="toast-viewport" aria-live="polite" aria-relevant="additions removals">
      {ctx.toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`} role="status">
          <div className="toast-body">
            <div className="toast-title">{t.title}</div>
            {t.message ? <div className="toast-message">{t.message}</div> : null}
          </div>
          <button
            type="button"
            className="toast-dismiss"
            onClick={() => ctx.dismiss(t.id)}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
