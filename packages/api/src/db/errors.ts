/** True when `err` (as thrown by Drizzle on D1) is a UNIQUE violation of `index`. */
export function isUniqueViolation(err: unknown, index: string) {
  const message =
    // Stryker disable next-line StringLiteral: no message matches either way
    err instanceof Error && err.cause instanceof Error ? err.cause.message : "";
  return (
    message.includes("UNIQUE constraint failed") && message.includes(index)
  );
}
