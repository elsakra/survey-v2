import { Alert } from "./alert";

export function InlineEmpty({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-4 py-6 text-center">
      <p className="text-sm font-medium text-[var(--color-text-primary)]">{title}</p>
      {hint ? <p className="mt-1 text-xs text-[var(--color-text-muted)]">{hint}</p> : null}
    </div>
  );
}

export function InlineError({ message }: { message: string }) {
  return <Alert variant="danger">{message}</Alert>;
}
