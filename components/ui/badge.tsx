import { cn } from "@/lib/ui";

type BadgeVariant = "neutral" | "info" | "success" | "warning" | "danger";

const variantStyles: Record<BadgeVariant, string> = {
  neutral: "bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)]",
  info: "bg-[var(--color-info-soft)] text-[var(--color-info-strong)]",
  success: "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]",
  warning: "bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]",
  danger: "bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]",
};

export function Badge({
  children,
  className,
  variant = "neutral",
}: {
  children: React.ReactNode;
  className?: string;
  variant?: BadgeVariant;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium capitalize",
        variantStyles[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
