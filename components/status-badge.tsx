const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  active: "bg-blue-100 text-blue-700",
  paused: "bg-yellow-100 text-yellow-700",
  completed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  pending: "bg-gray-100 text-gray-700",
  queued: "bg-blue-100 text-blue-700",
  attempted: "bg-yellow-100 text-yellow-700",
  exhausted: "bg-red-100 text-red-700",
  no_answer: "bg-orange-100 text-orange-700",
  in_progress: "bg-blue-100 text-blue-700",
};

export function StatusBadge({ status }: { status: string }) {
  const color = statusColors[status] ?? "bg-gray-100 text-gray-700";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}
