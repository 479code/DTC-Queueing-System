"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";

export function StatusBadge({ value }: { value: string }) {
  return (
    <span className={`dataStatus status-${value.toLowerCase()}`}>
      {value.replaceAll("_", " ")}
    </span>
  );
}

export function Dialog({
  title,
  onClose,
  children,
  size = "default"
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  size?: "default" | "wide";
}) {
  return (
    <div className="modalBackdrop" role="presentation">
      <section
        aria-labelledby="dialog-title"
        aria-modal="true"
        className={`formDialog${size === "wide" ? " wideDialog" : ""}`}
        role="dialog"
      >
        <div className="dialogHeader">
          <h2 id="dialog-title">{title}</h2>
          <button
            aria-label="Close"
            className="iconButton"
            onClick={onClose}
            title="Close"
            type="button"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
