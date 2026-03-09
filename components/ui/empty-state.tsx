import { Button } from "./button";

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-10 text-center">
      <h3 className="text-base font-semibold text-[var(--color-text-primary)]">{title}</h3>
      <p className="mt-2 text-sm text-[var(--color-text-secondary)]">{description}</p>
      {actionLabel && onAction && (
        <div className="mt-5">
          <Button onClick={onAction}>{actionLabel}</Button>
        </div>
      )}
    </div>
  );
}
