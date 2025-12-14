"use client";

import type { ReactNode } from "react";

export function ConfirmDialog(props: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmKind?: "primary" | "danger";
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  children?: ReactNode;
  isBusy?: boolean;
}) {
  if (!props.open) return null;

  const confirmClass =
    props.confirmKind === "danger" ? "btn btn-danger" : "btn btn-primary";

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal card">
        <div className="card-header">
          <h2 className="card-title">{props.title}</h2>
          {props.description ? <p className="card-subtitle">{props.description}</p> : null}
        </div>
        <div className="card-body">{props.children ?? null}</div>
        <div className="card-footer modal-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={props.onCancel}
            disabled={props.isBusy}
          >
            {props.cancelLabel ?? "Cancel"}
          </button>
          <button
            type="button"
            className={confirmClass}
            onClick={props.onConfirm}
            disabled={props.isBusy}
          >
            {props.isBusy ? "Working…" : props.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
