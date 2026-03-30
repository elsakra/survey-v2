"use client";

import { cn } from "@/lib/ui";

type ButtonVariant = "primary" | "secondary" | "ghost" | "success" | "warning" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--color-cta)] text-[var(--color-cta-text)] border border-[var(--color-cta)] hover:bg-[var(--color-cta-hover)]",
  secondary:
    "bg-transparent text-[var(--color-text-primary)] border border-[var(--color-border)] hover:bg-[var(--color-surface-elevated)]",
  ghost:
    "bg-transparent text-[var(--color-text-secondary)] border border-transparent hover:bg-[var(--color-surface-subtle)]",
  success:
    "bg-[var(--color-success)] text-white border border-[var(--color-success)] hover:brightness-95",
  warning:
    "bg-[var(--color-warning)] text-white border border-[var(--color-warning)] hover:brightness-95",
  danger:
    "bg-[var(--color-danger)] text-white border border-[var(--color-danger)] hover:brightness-95",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-sm",
};

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  type = "button",
  ...props
}: Props) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center rounded-[var(--radius-md)] font-medium transition-all duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]",
        "disabled:cursor-not-allowed disabled:opacity-55",
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
      {...props}
    />
  );
}
