export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected JSON object");
  return value as Record<string, unknown>;
}

export function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim())
    throw new Error("Expected nonblank string");
  return value;
}
