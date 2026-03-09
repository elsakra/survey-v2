import { Badge } from "@/components/ui/badge";

export function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "completed" || status === "active"
      ? "success"
      : status === "failed" || status === "exhausted"
        ? "danger"
        : status === "paused" || status === "attempted" || status === "no_answer"
          ? "warning"
          : status === "queued" || status === "in_progress"
            ? "info"
            : "neutral";

  return <Badge variant={variant}>{status.replace(/_/g, " ")}</Badge>;
}
