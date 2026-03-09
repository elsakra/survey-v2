"use client";

import { useEffect } from "react";
import { cn } from "@/lib/ui";

export function Toast({
  message,
  open,
  onClose,
}: {
  message: string;
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(onClose, 2800);
    return () => clearTimeout(timer);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={cn(
        "fixed bottom-5 right-5 z-50 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white px-4 py-2.5 text-sm text-[var(--color-text-primary)] shadow-[var(--shadow-card)]",
      )}
    >
      {message}
    </div>
  );
}
