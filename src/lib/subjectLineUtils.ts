export function getSubjectLineStatus(length: number): { color: string; label: string } {
  if (length === 0) return { color: "text-muted-foreground", label: "aim for 30–50" };
  if (length < 30) return { color: "text-amber-500", label: "a bit short, aim for 30–50" };
  if (length <= 50) return { color: "text-green-600", label: "ideal length" };
  if (length <= 60) return { color: "text-amber-500", label: "a bit long, aim for 30–50" };
  return { color: "text-destructive", label: "too long, may be truncated" };
}
