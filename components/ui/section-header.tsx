import { cn } from "@/lib/ui";

export function SectionHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-[var(--color-text-primary)]">{title}</h2>
        {description && <p className="mt-1.5 text-sm text-[var(--color-text-secondary)]">{description}</p>}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
