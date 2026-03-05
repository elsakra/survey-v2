export function extractInngestEventIds(sendResult: unknown): string[] {
  if (typeof sendResult === "string" && sendResult.trim().length > 0) {
    return [sendResult];
  }

  if (Array.isArray(sendResult)) {
    return sendResult
      .flatMap((entry) => {
        if (typeof entry === "string") return [entry];
        if (entry && typeof entry === "object") {
          const id = (entry as { id?: unknown }).id;
          return typeof id === "string" ? [id] : [];
        }
        return [];
      })
      .filter((id) => id.trim().length > 0);
  }

  if (sendResult && typeof sendResult === "object") {
    const obj = sendResult as { id?: unknown; ids?: unknown };
    const fromIds = Array.isArray(obj.ids)
      ? obj.ids.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
      : [];
    if (fromIds.length > 0) return fromIds;
    if (typeof obj.id === "string" && obj.id.trim().length > 0) return [obj.id];
  }

  return [];
}
