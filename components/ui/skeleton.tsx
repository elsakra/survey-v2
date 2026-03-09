import { cn } from "@/lib/ui";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-[var(--radius-md)] bg-[linear-gradient(90deg,rgba(148,163,184,0.16),rgba(148,163,184,0.26),rgba(148,163,184,0.16))] bg-[length:200%_100%]",
        className,
      )}
    />
  );
}
