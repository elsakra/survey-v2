import { cn } from "@/lib/ui";

type AlertVariant = "info" | "success" | "warning" | "danger";

const variantStyles: Record<AlertVariant, string> = {
  info: "bg-[var(--color-info-soft)] border-[var(--color-info-border)] text-[var(--color-info-strong)]",
  success: "bg-[var(--color-success-soft)] border-[var(--color-success-border)] text-[var(--color-success-strong)]",
  warning: "bg-[var(--color-warning-soft)] border-[var(--color-warning-border)] text-[var(--color-warning-strong)]",
  danger: "bg-[var(--color-danger-soft)] border-[var(--color-danger-border)] text-[var(--color-danger-strong)]",
};

export function Alert({
  children,
  variant = "info",
  className,
}: {
  children: React.ReactNode;
  variant?: AlertVariant;
  className?: string;
}) {
  return (
    <div className={cn("rounded-[var(--radius-md)] border px-4 py-3 text-sm", variantStyles[variant], className)}>
      {children}
    </div>
  );
}
